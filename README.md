# 股奈 StockNite

> 存好股，睡好覺。

EC2 單體式網站、持股儀表板與 LINE Bot API。市場資料與持股計算由 PostgreSQL／程式處理，AI 功能可串接 Bedrock AgentCore Runtime 或既有 HTTP Agent endpoint。

## 目前 Hackathon 功能狀態

目前 `main` 已完成並通過 `npm ci`、TypeScript typecheck 與 production build：

- 公開品牌首頁與 LINE Login。
- 登入後 `/me` 持股頁：市值、權重、成本、買進日期與未實現損益。
- 持股儀表板：90 日價格、成本線、60 日社群情緒與估值位置。
- 整體持股 Bedrock 體檢與 AgentCore 浮動對話助手。
- LINE 文字／圖片輸入；圖片可交由 AgentCore 解析持股。
- Agent 結構化 intent 可新增、更新或移除持股。
- 股票摘要、指定日期、歷史行情、論壇情緒與持股 API。
- Caddy HTTPS 與正式網域設定腳本。

尚待串接或完成：AgentCore Runtime 實體 ARN、LINE 正式憑證、07:00 晨報排程，以及完整台股庫存確認／歷史交易流程。

> 部署注意：先前使用的 EC2 `i-0405f0c7e4bdae5c4` 目前在現有 AWS 帳號／`us-west-2` 查無實例；重新部署前需確認新的 instance ID 或 AWS 環境。

## 第一版 LINE 按鈕

| 按鈕 | postback | 行為 |
|---|---|---|
| 查股票 | `action=stock_search` | 提示輸入股票代號 |
| 今日市場 | `action=market_today` | 回傳最新市場情緒 |
| 我的持股 | `action=portfolio_view` | 顯示持股，並引導新增 |
| 設定 | `action=settings` | 晨報與隱私設定入口 |

新增／刪除持股是「我的持股」子流程，不占用 Rich Menu 主按鈕。

## API

### 網站與登入

- `GET /`
- `GET /auth/line/login`
- `GET /auth/line/callback`
- `GET /auth/logout`
- `GET /me`
- `POST /api/analyze`：整體持股 Bedrock 體檢
- `GET /api/dashboard`：持股價格、情緒與估值儀表板
- `POST /api/assistant`：AgentCore 對話入口

### 市場與 LINE

- `GET /api/health`
- `GET /api/line/menu`
- `POST /api/line/webhook`
- `GET /api/stocks/:code`
- `GET /api/stocks/:code/day?date=2025-10-02`
- `GET /api/stocks/:code/history?limit=90`
- `GET /api/market/sentiment`

### 持股與 Agent tools

- `GET /api/portfolio`
- `POST /api/portfolio/holdings`
- `DELETE /api/portfolio/holdings/:code`
- `GET /api/agent/holdings?lineUserId=...`
- `POST /api/agent/holdings`：新增持股
- `PUT /api/agent/holdings`：更新持股／全數賣出
- `POST /api/agent/analyze`

完整契約請見 `docs/HOLDINGS_API.md`、`docs/AGENT_INTEGRATION.md` 與 `docs/INTEGRATION_OVERVIEW.md`。

## 本機啟動

```bash
cp .env.example .env
npm install
npm run build
npm start
```

執行 `sql/001_app_data.sql` 建立使用者與持股 schema。請勿把 `.env`、資料庫密碼或 LINE token 提交到 Git。

## AI 串接（`src/agent/adapter.ts`）

對話入口 `invokeAgentCore(request)` 的實際優先序：

1. 設定 `AGENTCORE_ARN`：使用 AWS SDK `InvokeAgentRuntime`。
2. 否則設定 `AGENTCORE_ENDPOINT`：呼叫既有 HTTP Agent。
3. 兩者都沒有時，AgentCore 對話會明確失敗，方便 Hackathon 除錯；`POST /api/analyze` 則獨立直接使用 Bedrock。

AgentCore Runtime payload：

```json
{
  "prompt": "使用者問題",
  "line_user_id": "LINE user ID",
  "current_holdings": [],
  "image_base64": "選填",
  "image_mime": "image/jpeg"
}
```

Agent 可回純文字，或回傳 `upsert_holding`、`remove_holding`、`chat` 等結構化 intent。持股 tool API 使用 `x-agent-key` 與 `AGENT_API_KEY`。

主要環境變數：

```text
AGENTCORE_ARN=
AGENTCORE_QUALIFIER=DEFAULT
AGENTCORE_ENDPOINT=
AGENTCORE_AUTH_TOKEN=
AGENT_API_KEY=
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
AWS_REGION=us-west-2
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
```

EC2 instance role 需要對應的 `bedrock-agentcore:InvokeAgentRuntime` 或 `bedrock:InvokeModel` 權限。

## EC2 部署

部署邏輯集中在 `scripts/deploy-ec2.sh`，環境檔由 `scripts/render-env.py` 產生；SSM 只負責下載封裝檔並執行腳本，不承載多行部署內容。

建議路徑 `/opt/stocknite/current`，Node.js 僅監聽 `127.0.0.1:3000`，由 Caddy 對外提供 HTTPS。參考 `deploy/stocknite.service` 與 `deploy/Caddyfile.example`。PostgreSQL 應繼續只監聽 `127.0.0.1:5432`。

一鍵安裝/設定 Caddy（Let's Encrypt 正式憑證、反代到 3000、更新 `PUBLIC_BASE_URL`、設定並測試 LINE webhook）：

```bash
sudo DOMAIN=stocknite.zzeric.com bash scripts/setup-caddy.sh
```

正式接 LINE 前仍需要：

1. 公開網域及 HTTPS。
2. `LINE_CHANNEL_SECRET` 與 `LINE_CHANNEL_ACCESS_TOKEN`。
3. LINE Developers Console webhook URL：`https://<domain>/api/line/webhook`。
4. 將 `LINE_ADD_FRIEND_URL` 換成正式官方帳號網址。
