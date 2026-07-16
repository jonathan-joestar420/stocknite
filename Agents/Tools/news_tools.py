"""
News search tool -- currently HARD-CODED for cost/scope reasons during local
development. The dataset provided for this hackathon explicitly excludes
real news data (see 00_Field_Dictionary_and_Usage_Notes.csv: "已排除: 新聞"),
and we don't want to pay for/manage a live search API just to prototype the
latest-news reasoning flow.

Mock data lives in Skills/latest-news/references/news_data.json rather than
inline in this file. That makes it the editable source of truth for a
future news-updater agent (not yet built) to periodically refresh -- it
edits a plain JSON reference file, not this Python module.

--------------------------------------------------------------------------
TODO (deferred -- not part of the current deployment):
Replace this hard-coded lookup with a real web search call via AgentCore's
managed Web Search Tool connector. NOTE: as of this writing, that connector
is only available in us-east-1 (see
https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html),
while this project's AgentCore Runtime deployment targets us-west-2 (to
match the rest of the team's infrastructure -- EC2, VPC, S3 staging
bucket). So this cannot be wired up as-is without either:
    (a) deploying a second Runtime/Gateway in us-east-1 just for search, or
    (b) waiting for the connector to become available in us-west-2, or
    (c) using a third-party search API (e.g. Tavily) instead, which works
        in any region.
Revisit once the team decides which option to take. Steps for option (a),
if AWS Web Search Tool is chosen:
    1. Create an AgentCore Gateway (MCP protocol, AWS_IAM inbound auth) in
       us-east-1, with a target using connectorId: "web-search".
    2. Grant the harness execution role `bedrock-agentcore:InvokeGateway` on
       that gateway ARN.
    3. Attach the gateway to the harness as an `agentcore_gateway` tool, and
       the agent will discover a `WebSearch` MCP tool automatically.
    4. Swap this function's body for an MCP tool call (query, maxResults),
       parsing the returned {results: [{text, url, title, publishedDate}]}
       instead of the mock JSON lookup below.
--------------------------------------------------------------------------
"""

import functools
import json
from pathlib import Path

NEWS_DATA_PATH = (
    Path(__file__).resolve().parent.parent
    / "Skills"
    / "latest-news"
    / "references"
    / "news_data.json"
)


@functools.lru_cache(maxsize=1)
def _load_mock_news() -> dict:
    with open(NEWS_DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def search_news(query: str) -> dict:
    """Search for news related to a query string, to assess whether a
    real-world event has a plausible financial connection to a stock.

    NOTE: This is currently a hard-coded mock for local development/demo
    purposes (see module docstring). It only recognizes a small set of
    demo keywords, stored in
    Skills/latest-news/references/news_data.json. Once deployed to
    AgentCore, this will be replaced by a real web search call.

    Args:
        query: Search terms, e.g. "挪威 世界盃 台積電" or "美東 碼頭 罷工
            長榮". Keyword matching is case-sensitive substring search
            against a small mock dataset.

    Returns:
        A dict with 'summary' (what happened), 'has_direct_financial_link'
        (bool), either 'causal_chain' (list of steps, if a real link
        exists) or 'weak_indirect_link' (a fun-fact-style tenuous
        connection, if no real link exists), and 'sources' (mock
        citations). Returns {"error": ...} if no mock entry matches any
        keyword in the query.
    """
    mock_news = _load_mock_news()

    for keyword, mock_result in mock_news.items():
        if keyword.startswith("_"):
            continue
        if keyword in query:
            result = {k: v for k, v in mock_result.items() if k != "_comment"}
            return result

    return {
        "error": (
            f"找不到與「{query}」相關的新聞資料（目前為本地開發階段的"
            "假資料，僅涵蓋挪威/美東罷工兩個示範情境）。"
        )
    }
