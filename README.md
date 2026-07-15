# 股奈 StockNite

> 存好股，睡好覺。

EC2 單體式網站、持股儀表板與 LINE Bot API。市場資料與持股計算由 PostgreSQL／程式處理；AI 分析可串接 Bedrock AgentCore Runtime 或既有 HTTP Agent endpoint。

## 目前 Hackathon 功能狀態

目前 `main` 已完成並通過 TypeScript typecheck、16 個自動化測試與 production build：

- 公開品牌首頁與 LINE Login。
- 登入後 `/me` 持股頁：市值、權重、成本、買進日期與未實現損益。
- 持股儀表板：90 日價格、成本線、60 日社群情緒與估值位置。
- 固定意圖路由：查持股、查股票、今日市場、新增持股、簽到與儲值都由後端處理；未知文字不會直接呼叫 AgentCore。
- 使用者明確輸入「分析持股」或「分析近況」時，conversation service 才會組合持股／市場 evidence 並呼叫 AgentCore。
- LINE 文字／圖片輸入；圖片可交由 AgentCore 解析結構化持股。
- Credit ledger：每日簽到、10／30／100 點 demo 儲值、AI 分析扣點與失敗退款；預設仍為無限使用模式。
- 股票摘要、指定日期、歷史行情、論壇情緒、持股、意圖解析與 credit API。
- Caddy HTTPS 與正式網域設定腳本。
- 部署腳本依檔名順序套用 `sql/*.sql` migration。

尚待串接或完成：正式付款驗證、啟用 credit 強制扣點、07:00 晨報排程，以及完整台股庫存確認／歷史交易流程。各部署環境仍須提供 AgentCore、LINE、資料庫與登入憑證。

> 部署注意：先前使用的 EC2 `i-0405f0c7e4bdae5c4` 目前在現有 AWS 帳號／`us-west-2` 查無實例；重新部署前需確認 instance ID 與 AWS 環境。

## 第一版 LINE 按鈕

| 按鈕 | postback | 行為 |
|---|---|---|
| 查股票 | `action=stock_search` | 提示輸入股票代號 |
| 今日市場 | `action=market_today` | 回傳最新市場情緒 |
| 我的持股 | `action=portfolio_view` | 顯示持股，並引導新增 |
| 設定 | `action=settings` | 晨報與隱私設定入口 |

新增／刪除持股是「我的持股」子流程，不占用 Rich Menu 主按鈕。

## 對話與 credit 行為

`src/intents/router.ts` 先把訊息分成 local 或 AgentCore intent。只有明確的「分析持股」與「分析近況」會進入 AgentCore；其他已知指令由 `src/services/conversation.ts` 在後端完成，未知文字則回傳固定選項。

可用的 LINE／assistant 指令包含：

- `我的持股`、`2330`、`今日市場`
- `新增持股 2330 50股 成本600 買進日2025-12-30`
- `我要簽到`、`我的點數`、`我要儲值`、`儲值 30 點`
- `分析持股`、`分析近況`

`CREDIT_ENFORCEMENT_ENABLED=false` 是預設值。此模式仍記錄簽到與 demo 儲值，但 AI 分析不扣點；切成 `true` 後，每次 AgentCore 分析會扣 1 credit。AgentCore 呼叫失敗時，conversation service 會嘗試退回該次扣點。

目前儲值端點只建立 demo ledger 紀錄，尚未串接金流或付款驗證，不可直接視為正式付費功能。

## API

### 網站與登入

- `GET /`
- `GET /auth/line/login`
- `GET /auth/line/callback`
- `GET /auth/logout`
- `GET /me`
- `POST /api/analyze`：以登入者持股執行固定的「分析持股」流程
- `GET /api/dashboard`：持股價格、情緒與估值儀表板
- `POST /api/assistant`：登入者對話入口；只有明確分析 intent 會呼叫 AgentCore
- `POST /api/intents/resolve`：只解析意圖，不呼叫 AgentCore
- `GET /api/credits`：查詢 ledger 餘額、當日簽到與 enforcement 狀態
- `POST /api/credits/check-in`：依 `Asia/Taipei` 日期每日簽到一次
- `POST /api/credits/top-up`：新增 10／30／100 點 demo 儲值紀錄

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

## 本機啟動與驗證

```bash
cp .env.example .env
npm install
npm run typecheck
npm test
npm run build
npm start
```

依序執行 `sql/001_app_data.sql` 與 `sql/002_credit_ledger.sql`，建立使用者、持股與 credit ledger schema。`credit_ledger` 對應用程式角色只開放 `SELECT`／`INSERT`，維持 append-only。請勿把 `.env`、資料庫密碼或 LINE token 提交到 Git。

## AI 串接（`src/agent/adapter.ts`）

對話入口 `invokeAgentCore(request)` 的實際優先序：

1. 設定 `AGENTCORE_ARN`：使用 AWS SDK `InvokeAgentRuntime`。
2. 否則設定 `AGENTCORE_ENDPOINT`：呼叫既有 HTTP Agent。
3. 兩者都沒有時，AgentCore 分析會明確失敗，方便 Hackathon 除錯。

AgentCore Runtime payload：

```json
{
  "prompt": "使用者問題",
  "line_user_id": "LINE user ID",
  "current_holdings": [],
  "market_snapshot": {},
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
CREDIT_ENFORCEMENT_ENABLED=false
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
AWS_REGION=us-west-2
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
```

EC2 instance role 需要對應的 `bedrock-agentcore:InvokeAgentRuntime` 或 `bedrock:InvokeModel` 權限。

## EC2 部署

部署邏輯集中在 `scripts/deploy-ec2.sh`，環境檔由 `scripts/render-env.py` 產生；SSM 只負責下載封裝檔並執行腳本，不承載多行部署內容。

部署腳本會安裝 production dependencies、更新受保護的環境檔、依檔名順序套用所有 `sql/*.sql`、切換 `/opt/stocknite/current` symlink、重啟 systemd service，再檢查 `/api/health`。SQL migration 必須可重複執行。

建議路徑 `/opt/stocknite/current`，Node.js 僅監聽 `127.0.0.1:3000`，由 Caddy 對外提供 HTTPS。參考 `deploy/stocknite.service` 與 `deploy/Caddyfile.example`。PostgreSQL 應繼續只監聽 `127.0.0.1:5432`。

一鍵安裝／設定 Caddy（Let's Encrypt 正式憑證、反代到 3000、更新 `PUBLIC_BASE_URL`、設定並測試 LINE webhook）：

```bash
sudo DOMAIN=stocknite.zzeric.com bash scripts/setup-caddy.sh
```

正式接 LINE 前仍需要：

1. 公開網域及 HTTPS。
2. `LINE_CHANNEL_SECRET` 與 `LINE_CHANNEL_ACCESS_TOKEN`。
3. LINE Developers Console webhook URL：`https://<domain>/api/line/webhook`。
4. 將 `LINE_ADD_FRIEND_URL` 換成正式官方帳號網址。
