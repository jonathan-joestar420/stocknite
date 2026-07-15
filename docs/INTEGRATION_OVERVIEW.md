# 股奈 StockNite — 整合總覽（一頁看懂）

> 給團隊/同事的入口文件。詳細分別見 `AGENT_INTEGRATION.md`（agent 收到什麼）與 `HOLDINGS_API.md`（庫存 API）。

## 系統一張圖

```
 使用者
  ├── LINE bot（@505qgibf）───────────┐
  └── 網頁 https://stocknite.zzeric.com │
        ├─ LINE 登入 → /me（持股表、損益、洞察儀表板）
        └─ 右下角 AI 助手                │
                                         ▼
                              後端 Node/Fastify（EC2, Caddy HTTPS）
                                         │
        ┌────────────────────────────────┼───────────────────────────────┐
        ▼                                ▼                                ▼
  PostgreSQL(stocknite)         Amazon Bedrock（單次體檢）        AgentCore Runtime（對話/匯入）
  app_data / market_data        us.anthropic.claude-*             stocknite_agent
                                                                    │  以 HTTP 呼叫
                                                                    ▼
                                                     後端庫存 API /api/agent/holdings
                                                     （x-agent-key + lineUserId）
```

## 資料如何流動（對話→操作庫存）

1. 使用者在 **LINE bot** 或 **網頁 AI 助手** 說話。
2. 後端呼叫 **AgentCore**，payload **一定帶 `line_user_id`**（見 AGENT_INTEGRATION.md 的身份保證）。
3. agent 理解意圖：
   - 要**新增/更新/查詢庫存** → agent 用 `line_user_id` 呼叫**庫存 API**（HOLDINGS_API.md），後端寫 DB 並計算。
   - 純問答/洞察 → 直接產生 `reply`。
4. 後端把 `reply` 回給使用者（LINE 訊息 / 網頁聊天泡泡，網頁會渲染 Markdown）。

## 三種 AI 用途（分清楚）

| 用途 | 走哪 | 進入點 | 身份 |
|---|---|---|---|
| 對話 / 匯入庫存 | **AgentCore**（agent 呼叫庫存 API） | LINE bot、網頁 AI 助手 | `line_user_id`（payload） |
| 單次持股體檢 | **Bedrock**（直接） | 網頁 `/me`「開始分析」 | 登入 session |
| 截圖解析 | Bedrock 多模態（backend 傳 image_base64 給 agent 由 agent 解析） | LINE 傳圖 | `line_user_id` |

## 給同事的重點清單
- **金鑰**：呼叫庫存 API 需 header `x-agent-key: <AGENT_API_KEY>`（向團隊索取）。
- **身份**：每次 agent 被呼叫都會收到 `line_user_id`；讀寫庫存就帶它。
- **新增/更新分開**：`POST`＝新增（已存在回 409）、`PUT`＝更新（全賣出＝quantity 0 + soldPrice）。
- **合規**：`reply` 不得有買賣建議，結尾加「（僅供參考，非投資建議）」。
- **範圍**：只支援 300 檔示範股、時間基準 2025-12-31。

## 相關文件
- `AGENT_INTEGRATION.md` — agent 的輸入 payload、輸出約定、截圖、身份保證、合規
- `HOLDINGS_API.md` — 庫存 API（GET/POST/PUT）規格與 curl 範例
- `README.md` — 專案與部署
- `.kiro/specs/stocknite-mvp/`（於主 workspace）— 需求/設計/環境/進度
