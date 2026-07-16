"""
Amazon Bedrock AgentCore Runtime entrypoint for the 股奈StockNite ADK agent.

This is a thin adapter: it wraps the existing `root_agent` (defined in
agent.py, unchanged) with the BedrockAgentCoreApp interface AgentCore
Runtime expects -- a single @app.entrypoint function that takes a JSON
payload and returns a JSON-serializable result. All the actual agent
logic (tools, skills, sub-agent) lives in agent.py exactly as it does for
local dev via `adk web` / `adk run`.

Payload shape (per the Line Bot backend team's docs/AGENT_INTEGRATION.md
"身份保證" section):
    {
      "prompt": "使用者說的話（截圖訊息時是一句解析指示）",
      "line_user_id": "Ue6c13d25e4ea0c83c200b5218cae04c1",
      "current_holdings": [ { "stock_code": "2330", "quantity": 3000, ... } ],
      "image_base64": "（僅截圖時才有）",
      "image_mime": "image/jpeg"
    }
The backend guarantees line_user_id is always present and non-empty for
both the Line Bot and the web assistant (verified against LINE's own
webhook signature / an authenticated web session upstream of this
entrypoint) -- this entrypoint trusts that guarantee and passes it
straight through as the ADK Runner's user_id, which is what makes
tool_context.user_id in holdings_tools.py resolve to the real user. The
model itself never sees or supplies this ID.

runtimeSessionId (the InvokeAgentRuntime session parameter, available via
`context`) follows the pattern stocknite-<lineUserId> (zero-padded to 33
chars) as a cross-check/backup identity signal -- not used here since
line_user_id in the payload is documented as the primary, cleanest
source, but see _cross_check_session_id below if that guarantee is ever
in doubt.

Local test (before deploying):
    source ../.venv/bin/activate
    set -a && source .env && set +a
    python main.py
    # in another terminal:
    curl -X POST http://localhost:8080/invocations \
      -H "Content-Type: application/json" \
      -d '{"prompt": "台積電現在多少錢？", "line_user_id": "Uyourtestid0000000000000001"}'

Deploy:
    agentcore configure -e main.py -r us-west-2
    agentcore deploy
"""

import asyncio
import base64
import logging

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent import root_agent

app = BedrockAgentCoreApp()
logger = logging.getLogger(__name__)

APP_NAME = "stocknite_agent"

# ADK Runner + session service are created once per process and reused
# across invocations, keyed by session_id from AgentCore's runtime
# context so multi-turn conversations within the same AgentCore runtime
# session keep their history.
_session_service = InMemorySessionService()
_runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=_session_service)
# Keyed by (line_user_id, session_id), not session_id alone -- ADK's
# InMemorySessionService keys sessions by (app_name, user_id, session_id).
# In real AgentCore traffic each runtimeSessionId is already unique per
# user (the backend uses stocknite-<lineUserId>), so this only matters
# for local curl testing, where session_id falls back to the same fixed
# "local-test-session" string regardless of which line_user_id is passed
# -- without line_user_id in the key, the second local test user to reuse
# that fallback session_id would hit "Session not found" (the session
# service has no entry for that user_id/session_id pair yet).
_known_sessions: set[tuple[str, str]] = set()


def _expected_runtime_session_id(line_user_id: str) -> str:
    """Reconstructs the runtimeSessionId the backend should have used for
    this line_user_id (pattern: stocknite-<lineUserId>, zero-padded to 33
    chars), per docs/AGENT_INTEGRATION.md. Used only for an optional
    cross-check -- the payload's line_user_id is the primary, trusted
    source and is used regardless of whether this matches.
    """
    return f"stocknite-{line_user_id.zfill(33)}"


def _build_content(prompt: str, image_base64: str | None, image_mime: str | None) -> types.Content:
    """Builds the user Content for this turn. Text-only for normal
    messages; text + inline image part when the backend forwards an
    uploaded screenshot/PDF (image_base64/image_mime), so
    archiving_stock_agent's Claude-native-vision parsing has the actual
    image to read, not just a description of it.
    """
    parts = [types.Part(text=prompt)]
    if image_base64:
        if not image_mime:
            logger.warning(
                "image_base64 provided without image_mime; defaulting to image/jpeg."
            )
        try:
            image_bytes = base64.b64decode(image_base64)
        except (base64.binascii.Error, ValueError) as e:
            logger.error("Failed to decode image_base64: %s", e)
        else:
            parts.append(
                types.Part.from_bytes(
                    data=image_bytes, mime_type=image_mime or "image/jpeg"
                )
            )
    return types.Content(role="user", parts=parts)


async def _run_agent(content: types.Content, session_id: str, line_user_id: str) -> str:
    # ADK's Runner/SessionService APIs use the fixed keyword name
    # `user_id` -- that's their parameter name, not ours to rename. We
    # just pass line_user_id's value through positionally as that arg.
    session_key = (line_user_id, session_id)
    if session_key not in _known_sessions:
        await _session_service.create_session(
            app_name=APP_NAME, user_id=line_user_id, session_id=session_id
        )
        _known_sessions.add(session_key)

    final_text = ""
    async for event in _runner.run_async(
        user_id=line_user_id, session_id=session_id, new_message=content
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final_text = event.content.parts[0].text or ""

    return final_text


@app.entrypoint
def agent_invocation(payload: dict, context) -> dict:
    """Handler for agent invocation. Required entrypoint shape for
    BedrockAgentCoreApp: takes the request payload and runtime context,
    returns a JSON-serializable dict.
    """
    prompt = payload.get(
        "prompt",
        "No prompt found in input, please provide a JSON payload with a 'prompt' key.",
    )
    # AgentCore provides a stable session_id per runtime session via
    # context; fall back to a fixed id for local curl testing where no
    # real session context exists.
    session_id = getattr(context, "session_id", None) or "local-test-session"

    # line_user_id is the field name the Line Bot backend actually sends
    # (see docs/AGENT_INTEGRATION.md "身份保證"), NOT "user_id" -- do not
    # rename this JSON key without updating the backend team too. It's
    # guaranteed present and non-empty for real Line Bot / web assistant
    # calls; "default_user" is only a local-dev/testing placeholder that
    # holdings_tools.py's _get_line_user_id() explicitly rejects as "no
    # identity available" rather than silently acting on a fake user.
    line_user_id = payload.get("line_user_id", "default_user")

    # current_holdings (if present) is a snapshot of the user's holdings
    # the backend already has on hand -- NOT currently forwarded into the
    # agent's tool-calling path. get_holdings() remains the source of
    # truth for pull_stock_agent/stock_analysis_agent_via_holdings, since
    # it returns live market_value/weight computed server-side, which a
    # raw current_holdings snapshot may not include. Revisit this if the
    # backend confirms current_holdings should be used as a fallback/
    # cache instead of an extra get_holdings round-trip.
    current_holdings = payload.get("current_holdings")
    if current_holdings:
        logger.info(
            "Received current_holdings (%d items) in payload; not yet"
            " forwarded to the agent -- get_holdings() is still the"
            " source of truth. See main.py comment.",
            len(current_holdings),
        )

    content = _build_content(
        prompt,
        payload.get("image_base64"),
        payload.get("image_mime"),
    )

    result_text = asyncio.run(_run_agent(content, session_id, line_user_id))
    return {"result": result_text}


if __name__ == "__main__":
    app.run()
