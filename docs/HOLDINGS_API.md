# 股奈 StockNite — 庫存 API（給 AgentCore Agent 以 HTTP 調用）

> 給負責 agent 的同事。你的 agent 可用一般 HTTP 直接呼叫這些端點來 **建立/更新/查詢/刪除** 使用者庫存，後端負責寫入資料庫與計算。
> Base URL：`https://stocknite.zzeric.com`

## 認證
所有 `/api/agent/*` 端點都需要帶 header：
```
x-agent-key: <AGENT_API_KEY>
```
沒帶或錯誤 → `401 {"error":"unauthorized"}`。金鑰請找我拿（不要寫進前端或 commit）。

## 使用者身份
由你在**每次請求帶上 `lineUserId`**（LINE 使用者 ID，`U` 開頭）。
後端會自動用它對應到內部使用者（沒有就自動建立），你不需碰資料庫。

---

## 1. 查詢庫存（GetList）
```
GET /api/agent/holdings?lineUserId=Uxxxxxxxx
x-agent-key: <AGENT_API_KEY>
```
回應 `200`：陣列，每筆含即時市值與佔比
```json
[
  {
    "stock_code": "2330", "stock_name": "台積電",
    "quantity": "3000.0000", "average_cost": "900.0000",
    "purchase_date": "2025-03-01T00:00:00.000Z",
    "close_price": "1550.0", "market_value": "4650000.00000",
    "weight": "0.7836..."
  }
]
```

> **新增與更新是「兩隻分開的 API」**（不是 upsert）。原因：使用者提到一檔新標的時，通常是想「加進庫存」，不該覆蓋既有部位；只有明確要改動既有標的（例如全數賣出）時才用更新。

## 2. 新增庫存（Create，只新增不覆蓋）
```
POST /api/agent/holdings
x-agent-key: <AGENT_API_KEY>
Content-Type: application/json

{
  "lineUserId": "Uxxxxxxxx",
  "stockCode": "2330",
  "quantity": 50,
  "averageCost": 2400,        // 選填（每股成本，>=0）
  "purchaseDate": "2025-12-30" // 選填，格式 YYYY-MM-DD
}
```
- **只在該標的尚未存在時新增，不會覆蓋既有部位。**
- 回應 `200`：`{ "ok": true, "created": true, "holdings": [ ...完整庫存... ] }`
- 錯誤：
  - `409 {"error":"already_exists","stockCode":"2330","hint":"use PUT /api/agent/holdings to update"}`（已持有 → 請改用更新 API）
  - `400 {"error":"invalid_holding","need":["lineUserId","stockCode","quantity>=0"]}`
  - `400 {"error":"unsupported_stock","stockCode":"9999"}`（不在 300 檔示範清單內）

## 3. 更新庫存（Update，改既有標的）
```
PUT /api/agent/holdings
x-agent-key: <AGENT_API_KEY>
Content-Type: application/json

{
  "lineUserId": "Uxxxxxxxx",
  "stockCode": "2330",
  "quantity": 0,            // 選填；只更新有帶的欄位。全數賣出 → 傳 0
  "averageCost": 2400,      // 選填
  "purchaseDate": "2025-12-30", // 選填
  "soldPrice": 1580         // 選填；賣出價格，供計算已實現損益
}
```
- 只更新**有帶的欄位**，未帶的維持原值。
- **全數賣出**：帶 `quantity: 0` 與 `soldPrice`（賣出價）。
- 回應 `200`：`{ "ok": true, "updated": true, "holdings": [ ... ] }`
- 錯誤：`404 {"error":"holding_not_found","stockCode":"2330","hint":"use POST /api/agent/holdings to create"}`（尚未持有 → 請改用新增 API）

> 目前**不提供刪除 API**。要清空某檔請用更新 API 把 `quantity` 設為 0（並可帶 `soldPrice`）。

---

## 欄位規則（與之前一致）
| 欄位 | 規則 |
|---|---|
| `stockCode` | 台股代號 4–6 碼字串，且須在 **300 檔示範清單**（`market_data.stock_summary_2025`）內。|
| `quantity` | 股數 > 0。使用者講「張」請 ×1000 後再送。|
| `averageCost` | 每股成本，>= 0，選填。給「總成本」請先 ÷ 股數。|
| `purchaseDate` | `YYYY-MM-DD`，選填。**使用者沒提供就不要帶這個欄位、也不要猜**（可省略）。|

## 建議的 agent 使用流程
1. 使用者說「買了台積電 50 股 成本 2400 於 2025-12-30」→ 解析（名稱轉代號、張轉股）→ `POST`（新增）。若回 409（已持有）再視情況改用 `PUT`。
2. 使用者問「我的持股」→ `GET` → 用回傳資料組織人話回覆。
3. 使用者說「台積電我全賣了，賣在 1580」→ `PUT`，帶 `quantity:0, soldPrice:1580`。
4. 使用者要改成本/日期 → `PUT` 帶要改的欄位。
5. 純問答/洞察 → 不用呼叫本 API，直接回覆即可。

## curl 範例
```bash
# 新增（已持有會回 409）
curl -X POST https://stocknite.zzeric.com/api/agent/holdings \
  -H "x-agent-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"lineUserId":"Uxxxx","stockCode":"2330","quantity":50,"averageCost":2400,"purchaseDate":"2025-12-30"}'

# 更新（全數賣出）
curl -X PUT https://stocknite.zzeric.com/api/agent/holdings \
  -H "x-agent-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"lineUserId":"Uxxxx","stockCode":"2330","quantity":0,"soldPrice":1580}'

# 查詢
curl "https://stocknite.zzeric.com/api/agent/holdings?lineUserId=Uxxxx" \
  -H "x-agent-key: $AGENT_API_KEY"
```

## 合規
本 API 只處理資料，不產生投資建議。agent 對使用者的文字回覆仍須遵守：不得有買賣指令，結尾加「（僅供參考，非投資建議）」。
