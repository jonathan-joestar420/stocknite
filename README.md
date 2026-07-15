# 股奈 StockNite

> 存好股，睡好覺。

EC2 單體式網站與 LINE Bot API。市場資料與持股計算由 PostgreSQL／程式處理；AgentCore 由團隊自行實作，本專案只保留 HTTP adapter。

## 第一版 LINE 按鈕

| 按鈕 | postback | 行為 |
|---|---|---|
| 查股票 | `action=stock_search` | 提示輸入股票代號 |
| 今日市場 | `action=market_today` | 回傳最新市場情緒 |
| 我的持股 | `action=portfolio_view` | 顯示持股，並引導新增 |
| 設定 | `action=settings` | 晨報與隱私設定入口 |

新增／刪除持股是「我的持股」子流程，不占用 Rich Menu 主按鈕。

## API

- `GET /api/health`
- `GET /api/line/menu`
- `POST /api/line/webhook`
- `GET /api/stocks/:code`
- `GET /api/stocks/:code/day?date=2025-10-02`
- `GET /api/stocks/:code/history?limit=90`
- `GET /api/market/sentiment`
- `GET /api/portfolio`（暫用 `x-line-user-id`）
- `POST /api/portfolio/holdings`
- `DELETE /api/portfolio/holdings/:code`
- `POST /api/agent/analyze`

`x-line-user-id` 只供第一版內部整合；LIFF 上線前必須改成後端驗證 LINE ID token。

## 本機啟動

```bash
cp .env.example .env
npm install
npm run build
npm start
```

執行 `sql/001_app_data.sql` 建立使用者與持股 schema。請勿把 `.env`、資料庫密碼或 LINE token 提交到 Git。

## AI 串接（`src/agent/adapter.ts`）

所有「洞察／對話」統一經 `invokeAgentCore(request)`，依環境變數自動選擇後端，優先序：

1. **AgentCore Runtime**（設定 `AGENTCORE_ARN`）— 用 AWS SDK `InvokeAgentRuntime`（SigV4，走 EC2 instance role）。
   - 契約：送 payload `{"prompt": "..."}`，回傳 `{"result": "..."}`。
   - `AGENTCORE_QUALIFIER` 預設 `DEFAULT`；每位使用者用穩定 `runtimeSessionId`。
2. **舊版 HTTP endpoint**（設定 `AGENTCORE_ENDPOINT` + 選用 `AGENTCORE_AUTH_TOKEN`）— POST `{userId, message, evidence}`。
3. **Bedrock 後備**（前兩者皆未設定）— 直接呼叫 Claude；模型 `BEDROCK_MODEL_ID`（需 `us.` inference profile 前綴，如 `us.anthropic.claude-haiku-4-5-20251001-v1:0`），region `AWS_REGION`。

相關環境變數：

```text
AGENTCORE_ARN=arn:aws:bedrock-agentcore:us-west-2:...:runtime/<agent>
AGENTCORE_QUALIFIER=DEFAULT
AGENTCORE_ENDPOINT=            # 舊版 HTTP，通常留空
AGENTCORE_AUTH_TOKEN=
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
AWS_REGION=us-west-2
```

輸出一律經法遵護欄（過濾買賣指令字眼、附加免責聲明）。需要對應 IAM 權限：`bedrock-agentcore:InvokeAgentRuntime` 或 `bedrock:InvokeModel`。

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
