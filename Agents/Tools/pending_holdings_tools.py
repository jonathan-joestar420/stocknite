"""
Pending holdings confirmation -- durable, identity-scoped staging area for
one or more proposed holdings changes (from OCR/image parsing OR manual
text input) that need user confirmation before being committed via
holdings_tools.py.

Why this exists: a Line Bot conversation is not a reliable place to hold
"waiting for the user to say yes" state. Each invocation may land in a
different AgentCore Runtime session (new microVM, no shared memory), and
even within one session, AgentCore's default idle timeout is 15 minutes.
If the pending action lived only in conversation history, a user who
comes back later and says "Yes" would get a confused "Yes, what?" -- the
agent would have no memory of what they're confirming.

Fix: store the pending action(s) in DynamoDB, keyed by line_user_id (not
by session). Any session, any time within the expiry window, can look up
"is there something pending for this user?" via tool_context.user_id --
the same trusted-identity mechanism holdings_tools.py already uses.

Table: stocknite-pending-holdings (partition key: line_user_id)
    - Stores a LIST of pending holding changes per user (holdings_json),
      not a single one -- e.g. when a user uploads a screenshot with 3
      stocks, all 3 are staged together in one item, so a single "Yes"
      confirms and commits all 3, instead of requiring one confirmation
      per stock. Staging a new batch overwrites any previous pending
      batch for that user (intentional -- if the user submits a
      correction before confirming, the new batch is what they want).
    - expires_at: Unix epoch seconds, used both as the DynamoDB TTL
      attribute (for eventual automatic cleanup) AND checked explicitly
      on every read. IMPORTANT: DynamoDB TTL deletion is NOT instantaneous
      -- AWS documents it as "typically within 48 hours" of expiry, not
      real-time. Relying on TTL alone would let an expired-but-not-yet-
      deleted row be read back as if still valid. So expiry is enforced
      in application code on every read; TTL is only the eventual
      housekeeping mechanism to avoid stale rows accumulating forever.

This module intentionally does NOT call holdings_tools.add_holding /
update_holding itself -- get_pending_holdings just returns the staged
values, and the calling agent (archiving_stock_agent) is responsible for
actually committing each one via the normal write tools, one call per
stock. This keeps this module a pure staging/lookup layer, with the
actual write logic (and its already-reviewed error handling) staying in
one place.
"""

import json
import os
import time

import boto3
from google.adk.tools.tool_context import ToolContext

try:
    from .holdings_tools import _get_line_user_id
except ImportError:
    from holdings_tools import _get_line_user_id

DYNAMODB_TABLE_NAME = os.environ.get(
    "PENDING_HOLDINGS_TABLE", "stocknite-pending-holdings"
)
DYNAMODB_REGION = os.environ.get("AWS_REGION", "us-west-2")

# How long a staged batch remains valid before it's considered stale.
PENDING_EXPIRY_SECONDS = 15 * 60  # 15 minutes

_VALID_ACTIONS = ("add", "update")
_VALID_SOURCES = ("manual", "ocr")

# Cap batch size for a single stage call -- generous enough for a
# realistic brokerage screenshot, but bounded so one call can't blow up
# the DynamoDB item size or produce an unreasonably long confirmation
# message.
_MAX_BATCH_SIZE = 30


def _table():
    return boto3.resource("dynamodb", region_name=DYNAMODB_REGION).Table(
        DYNAMODB_TABLE_NAME
    )


def stage_pending_holdings(
    tool_context: ToolContext,
    holdings: list[dict],
    source: str,
) -> dict:
    """Stage one or more proposed holdings changes for user confirmation
    in a SINGLE batch, WITHOUT writing anything to the real holdings
    database yet. Use this whenever you have parsed one or more candidate
    holdings -- whether from a single manual text description or from an
    uploaded image/PDF containing multiple stocks -- so the user only
    needs to confirm ONCE for the whole batch, not once per stock.

    After staging, summarize all the parsed holdings for the user and ask
    them to confirm (e.g. "這樣對嗎？"). Do NOT call add_holding /
    update_holding directly, and do NOT call this once per stock -- pass
    the full list of holdings from a single user message/image in one
    call.

    Overwrites any previously staged batch for this user.

    Args:
        holdings: A list of dicts, one per stock, each with:
            - action: "add" for a new position, "update" for an existing
              one/a sell-out.
            - stock_code: Taiwan stock code, e.g. "2330".
            - quantity: Number of shares (not board lots -- if the user
              said "X 張", multiply by 1000 first). Omit if not
              applicable. 0 means a full sell-out (marks the position as
              a past holding, not deleted).
            - average_cost: Cost per share. Omit if not stated -- never
              guess.
            - purchase_date: ISO date "YYYY-MM-DD". Omit if not stated --
              never guess or default to today.
            - sold_price: Price per share sold at (only for a full
              sell-out update). Omit if the user didn't state it -- they
              can add it later on the website.
            - sold_date: ISO date "YYYY-MM-DD" the position was sold on
              (only for a full sell-out update). Omit if the user didn't
              state it -- never guess or default to today.
            Maximum 30 items per batch.
        source: "manual" if parsed from the user's typed description,
            "ocr" if parsed from an uploaded image/PDF. Applies to the
            whole batch (mixed-source batches aren't supported -- stage
            separately if that ever comes up).

    Returns:
        A dict with "staged": true, "count" (number of holdings staged),
        and "expires_in_minutes", or {"error": ...} if the user's
        identity isn't available, the batch is empty/too large, or any
        item has an invalid action.
    """
    if source not in _VALID_SOURCES:
        return {"error": f"source 必須是 {_VALID_SOURCES} 之一，收到：{source}"}
    if not holdings:
        return {"error": "holdings 不能是空清單。"}
    if len(holdings) > _MAX_BATCH_SIZE:
        return {"error": f"一次最多只能暫存 {_MAX_BATCH_SIZE} 筆持股。"}

    for i, h in enumerate(holdings):
        if h.get("action") not in _VALID_ACTIONS:
            return {
                "error": (
                    f"第 {i + 1} 筆的 action 必須是 {_VALID_ACTIONS} 之一，"
                    f"收到：{h.get('action')}"
                )
            }
        if not h.get("stock_code"):
            return {"error": f"第 {i + 1} 筆缺少 stock_code。"}

    line_user_id = _get_line_user_id(tool_context)
    if line_user_id is None:
        return {"error": "目前對話沒有可用的使用者身份，無法暫存待確認的持股。"}

    now = int(time.time())
    item = {
        "line_user_id": line_user_id,
        "holdings_json": json.dumps(holdings, ensure_ascii=False),
        "source": source,
        "created_at": now,
        "expires_at": now + PENDING_EXPIRY_SECONDS,
    }

    try:
        _table().put_item(Item=item)
    except Exception as e:
        return {"error": f"暫存待確認持股失敗：{e}"}

    return {
        "staged": True,
        "count": len(holdings),
        "expires_in_minutes": PENDING_EXPIRY_SECONDS // 60,
    }


def get_pending_holdings(tool_context: ToolContext) -> dict:
    """Check whether the current user has a previously staged (not yet
    confirmed) batch of holdings changes waiting. Call this when the user
    says something that might be a confirmation (e.g. "對", "是的",
    "確定", "Yes", "沒錯") to find out what they're actually confirming --
    conversation history alone cannot be trusted for this, since the
    confirmation may arrive in a different session than the one that
    staged it.

    Returns:
        A dict with "pending": true, "holdings" (the full list of staged
        items, each with action/stock_code/quantity/average_cost/
        purchase_date/sold_price/sold_date), "source", and
        "minutes_remaining" if a
        valid, non-expired pending batch exists. Returns
        {"pending": false} if there is nothing staged, it expired, or no
        user identity is available -- in that case, tell the user you
        don't have anything pending for them and ask them to resend what
        they'd like to record.
    """
    line_user_id = _get_line_user_id(tool_context)
    if line_user_id is None:
        return {"pending": False}

    try:
        resp = _table().get_item(Key={"line_user_id": line_user_id})
    except Exception as e:
        return {"pending": False, "error": f"查詢待確認持股失敗：{e}"}

    item = resp.get("Item")
    if not item:
        return {"pending": False}

    now = int(time.time())
    expires_at = int(item.get("expires_at", 0))
    if now >= expires_at:
        # Expired but possibly not yet TTL-deleted by DynamoDB (TTL
        # deletion is not instantaneous) -- treat as gone regardless, and
        # proactively delete it so a stale read doesn't repeat.
        try:
            _table().delete_item(Key={"line_user_id": line_user_id})
        except Exception:
            pass
        return {"pending": False}

    try:
        holdings = json.loads(item.get("holdings_json", "[]"))
    except (json.JSONDecodeError, TypeError):
        holdings = []

    return {
        "pending": True,
        "holdings": holdings,
        "source": item.get("source"),
        "minutes_remaining": max(0, (expires_at - now) // 60),
    }


def discard_pending_holdings(tool_context: ToolContext) -> dict:
    """Discard the current user's staged (not yet confirmed) batch of
    holdings changes, without committing any of them. Use this when the
    user says the parsed/staged data is wrong and they want to redo it,
    or explicitly cancels (e.g. "不對", "取消", "重新來").

    Returns:
        {"discarded": true} on success (also returned if there was
        nothing pending to discard), or {"error": ...} if no user
        identity is available.
    """
    line_user_id = _get_line_user_id(tool_context)
    if line_user_id is None:
        return {"error": "目前對話沒有可用的使用者身份。"}

    try:
        _table().delete_item(Key={"line_user_id": line_user_id})
    except Exception as e:
        return {"error": f"清除待確認持股失敗：{e}"}

    return {"discarded": True}
