"""
Holdings API client -- calls the colleague's HTTP API (backed by Postgres
on the team's EC2 instance) to create/update/query a user's real stock
holdings. This is Scenario B ("願意輸入真實持股") from the spec doc: the
piece we previously flagged as missing (holdings memory) is implemented
here by delegating to that API rather than touching Postgres directly.

API docs: "AWS Hackathon CMoney - API Database.md" (project root).

Auth: every request needs header `x-agent-key: <AGENT_API_KEY>`, read from
the STOCKNITE_AGENT_API_KEY env var (set in Agents/.env, gitignored --
never hardcode it here).

User identity -- IMPORTANT security/correctness note: these tools take a
`tool_context: ToolContext` parameter, which ADK auto-injects at call time
and NEVER exposes to the LLM's tool schema (see
google.adk.utils.context_utils.find_context_parameter). The LINE user ID
is read from `tool_context.user_id`, which is set once per conversation
by whatever invokes the ADK Runner (see main.py's `Runner.run_async(user_
id=...)`), NOT typed out by the model on every call. This matters because
letting the LLM supply a user ID as a normal string argument would risk
it hallucinating or mixing up IDs across users -- reading it from trusted
session context instead makes that structurally impossible.

Create vs. Update are separate endpoints, not an upsert (see docstrings
below) -- this matters because the two have different failure modes
(409 already_exists vs. 404 holding_not_found) that the calling agent
needs to handle by switching to the other endpoint.
"""

import os

import requests
from google.adk.tools.tool_context import ToolContext

STOCKNITE_API_BASE_URL = os.environ.get(
    "STOCKNITE_API_BASE_URL", "https://stocknite.zzeric.com"
)
_REQUEST_TIMEOUT_SECONDS = 10


def _headers() -> dict:
    api_key = os.environ.get("STOCKNITE_AGENT_API_KEY")
    if not api_key:
        raise RuntimeError(
            "STOCKNITE_AGENT_API_KEY is not set. Add it to Agents/.env."
        )
    return {"x-agent-key": api_key}


def _request(method: str, path: str, **kwargs) -> dict:
    """Shared request wrapper: never raises, always returns a dict with
    either the parsed JSON response or an {"error": ...} dict describing
    what went wrong (network error, timeout, or non-2xx status).
    """
    url = f"{STOCKNITE_API_BASE_URL}{path}"
    try:
        headers = _headers()
    except RuntimeError as e:
        return {"error": str(e)}

    try:
        resp = requests.request(
            method, url, headers=headers, timeout=_REQUEST_TIMEOUT_SECONDS, **kwargs
        )
    except requests.exceptions.Timeout:
        return {"error": "持股服務目前連線逾時，請稍後再試一次。"}
    except requests.exceptions.RequestException as e:
        return {"error": f"持股服務連線失敗：{e}"}

    try:
        body = resp.json()
    except ValueError:
        body = {"error": f"持股服務回應格式異常（HTTP {resp.status_code}）。"}

    if resp.status_code >= 400:
        # Surface the structured error the API already returns (e.g.
        # already_exists, holding_not_found, unsupported_stock) so the
        # calling agent can react to it (e.g. switch POST -> PUT) instead
        # of just getting a generic failure.
        if isinstance(body, dict) and "error" in body:
            return body
        return {"error": f"持股服務回應錯誤（HTTP {resp.status_code}）：{body}"}

    return body


def _get_line_user_id(tool_context: ToolContext) -> str | None:
    """Reads the LINE user ID from trusted session context (set once per
    conversation by the Runner, not by the model). Returns None if the
    session has no real user_id set (e.g. local dev without a Line
    context), in which case callers should surface a clear error instead
    of silently using a placeholder.
    """
    user_id = tool_context.user_id
    if not user_id or user_id in ("default_user", "local-test-session"):
        return None
    return user_id


def get_holdings(tool_context: ToolContext) -> dict:
    """Get the current user's real stock holdings, with live market value
    and portfolio weight for each position (computed by the backend from
    current close prices).

    No arguments needed -- the user's identity is taken automatically
    from the current conversation, not from anything you provide.

    Returns:
        A dict with a "holdings" key containing a list of positions, each
        with stock_code, stock_name, quantity, average_cost,
        purchase_date, close_price, market_value, and weight (portfolio
        share as a decimal). Empty list if the user has no holdings yet.
        Returns {"error": ...} on request failure or if no user identity
        is available in this session.
    """
    line_user_id = _get_line_user_id(tool_context)
    if line_user_id is None:
        return {"error": "目前對話沒有可用的使用者身份，無法查詢真實持股。"}

    result = _request(
        "GET", "/api/agent/holdings", params={"lineUserId": line_user_id}
    )
    if isinstance(result, list):
        return {"holdings": result}
    return result


def add_holding(
    tool_context: ToolContext,
    stock_code: str,
    quantity: float,
    average_cost: float | None = None,
    purchase_date: str | None = None,
) -> dict:
    """Add a NEW stock position to the current user's holdings. Does NOT
    overwrite an existing position for the same stock -- if the user
    already holds this stock, this call fails with error "already_exists"
    and the caller should use update_holding instead.

    The user's identity is taken automatically from the current
    conversation -- you do not provide it.

    Args:
        stock_code: Taiwan stock code, 4-6 characters, must be one of the
            300 demo stocks (validated server-side).
        quantity: Number of shares (not board lots / 張). If the user
            says "X 張", multiply by 1000 before calling this function.
            Must be > 0 for a new position.
        average_cost: Cost per share (not total cost). If the user gives
            a total cost, divide by quantity before calling. Optional,
            must be >= 0 if provided.
        purchase_date: ISO date string "YYYY-MM-DD". Only pass this if
            the user actually stated a date -- do NOT guess or default to
            today's date if they didn't mention one; omit the argument
            entirely instead.

    Returns:
        A dict with "created": true and the user's full updated holdings
        list on success. On failure, returns the structured error from
        the API, e.g. {"error": "already_exists", "stockCode": "2330",
        "hint": "use PUT /api/agent/holdings to update"} -- if you see
        "already_exists", call update_holding instead and retry.
        {"error": "unsupported_stock", ...} means the stock isn't in the
        300-stock demo set. {"error": "invalid_holding", ...} means a
        required field is missing or invalid.
    """
    line_user_id = _get_line_user_id(tool_context)
    if line_user_id is None:
        return {"error": "目前對話沒有可用的使用者身份，無法新增持股。"}

    payload = {
        "lineUserId": line_user_id,
        "stockCode": stock_code,
        "quantity": quantity,
    }
    if average_cost is not None:
        payload["averageCost"] = average_cost
    if purchase_date is not None:
        payload["purchaseDate"] = purchase_date

    return _request("POST", "/api/agent/holdings", json=payload)


def update_holding(
    tool_context: ToolContext,
    stock_code: str,
    quantity: float | None = None,
    average_cost: float | None = None,
    purchase_date: str | None = None,
    sold_price: float | None = None,
) -> dict:
    """Update an EXISTING stock position for the current user. Only the
    fields you pass are changed; omitted fields keep their current value.
    Requires the user to already hold this stock -- if they don't, this
    call fails with error "holding_not_found" and the caller should use
    add_holding instead.

    The user's identity is taken automatically from the current
    conversation -- you do not provide it.

    To record a full sell-out of a position, pass quantity=0 and
    sold_price (the price it was sold at, used to compute realized
    gain/loss). There is no separate delete endpoint -- selling out is
    modeled as updating quantity to 0.

    Args:
        stock_code: Taiwan stock code of the EXISTING position to update.
        quantity: New share count. Pass 0 to record a full sell-out. If
            the user says "X 張", multiply by 1000 first. Omit if not
            changing.
        average_cost: New cost per share. Omit if not changing.
        purchase_date: New ISO date string "YYYY-MM-DD". Omit if not
            changing -- do not guess a date.
        sold_price: Price per share the position was sold at. Only
            relevant when quantity=0 (full sell-out), used by the backend
            to compute realized gain/loss.

    Returns:
        A dict with "updated": true and the user's full updated holdings
        list on success. On failure, {"error": "holding_not_found", ...}
        means the user doesn't hold this stock yet -- call add_holding
        instead.
    """
    line_user_id = _get_line_user_id(tool_context)
    if line_user_id is None:
        return {"error": "目前對話沒有可用的使用者身份，無法更新持股。"}

    payload: dict = {"lineUserId": line_user_id, "stockCode": stock_code}
    if quantity is not None:
        payload["quantity"] = quantity
    if average_cost is not None:
        payload["averageCost"] = average_cost
    if purchase_date is not None:
        payload["purchaseDate"] = purchase_date
    if sold_price is not None:
        payload["soldPrice"] = sold_price

    return _request("PUT", "/api/agent/holdings", json=payload)
