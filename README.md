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

## AgentCore 串接契約

設定：

```text
AGENTCORE_ENDPOINT=https://your-agent-endpoint
AGENTCORE_AUTH_TOKEN=optional-bearer-token
```

本服務送出：

```json
{
  "userId": "LINE 使用者 ID（未來改內部匿名 ID）",
  "message": "使用者問題",
  "evidence": {}
}
```

AgentCore 預期回傳：

```json
{
  "answer": "繁體中文回答",
  "data": {},
  "severity": "info"
}
```

若未設定 endpoint，服務回傳 `pending_integration`，市場與持股 API 仍可獨立使用。

## EC2 部署

部署邏輯集中在 `scripts/deploy-ec2.sh`，環境檔由 `scripts/render-env.py` 產生；SSM 只負責下載封裝檔並執行腳本，不承載多行部署內容。

建議路徑 `/opt/stocknite/current`，Node.js 僅監聽 `127.0.0.1:3000`，由 Caddy 對外提供 HTTPS。參考 `deploy/stocknite.service` 與 `deploy/Caddyfile.example`。PostgreSQL 應繼續只監聽 `127.0.0.1:5432`。

正式接 LINE 前仍需要：

1. 公開網域及 HTTPS。
2. `LINE_CHANNEL_SECRET` 與 `LINE_CHANNEL_ACCESS_TOKEN`。
3. LINE Developers Console webhook URL：`https://<domain>/api/line/webhook`。
4. 將 `LINE_ADD_FRIEND_URL` 換成正式官方帳號網址。
