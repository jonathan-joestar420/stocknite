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

## 2. 建立 / 更新庫存（Create/Update，upsert）
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
- 同一 `(lineUserId, stockCode)` 已存在 → **更新**（覆蓋數量/成本/日期）；不存在 → **建立**。
- 回應 `200`：`{ "ok": true, "holdings": [ ...更新後完整庫存... ] }`
- 錯誤：
  - `400 {"error":"invalid_holding","need":["lineUserId","stockCode","quantity>0"]}`
  - `400 {"error":"unsupported_stock","stockCode":"9999"}`（不在 300 檔示範清單內）

## 3. 刪除庫存（Delete）
```
DELETE /api/agent/holdings
x-agent-key: <AGENT_API_KEY>
Content-Type: application/json

{ "lineUserId": "Uxxxxxxxx", "stockCode": "2330" }
```
回應 `200`：`{ "ok": true, "holdings": [ ...刪除後完整庫存... ] }`

---

## 欄位規則（與之前一致）
| 欄位 | 規則 |
|---|---|
| `stockCode` | 台股代號 4–6 碼字串，且須在 **300 檔示範清單**（`market_data.stock_summary_2025`）內。|
| `quantity` | 股數 > 0。使用者講「張」請 ×1000 後再送。|
| `averageCost` | 每股成本，>= 0，選填。給「總成本」請先 ÷ 股數。|
| `purchaseDate` | `YYYY-MM-DD`，選填。**使用者沒提供就不要帶這個欄位、也不要猜**（可省略）。|

## 建議的 agent 使用流程
1. 使用者說「買了台積電 50 股 成本 2400 於 2025-12-30」→ agent 解析（名稱轉代號、張轉股）→ `POST /api/agent/holdings`。
2. 使用者問「我的持股」→ `GET /api/agent/holdings?lineUserId=...` → 用回傳資料組織人話回覆。
3. 使用者說「賣光台積電」→ `DELETE /api/agent/holdings`。
4. 純問答/洞察 → 不用呼叫本 API，直接回覆即可。

## curl 範例
```bash
# 建立/更新
curl -X POST https://stocknite.zzeric.com/api/agent/holdings \
  -H "x-agent-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"lineUserId":"Uxxxx","stockCode":"2330","quantity":50,"averageCost":2400,"purchaseDate":"2025-12-30"}'

# 查詢
curl "https://stocknite.zzeric.com/api/agent/holdings?lineUserId=Uxxxx" \
  -H "x-agent-key: $AGENT_API_KEY"

# 刪除
curl -X DELETE https://stocknite.zzeric.com/api/agent/holdings \
  -H "x-agent-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"lineUserId":"Uxxxx","stockCode":"2330"}'
```

## 合規
本 API 只處理資料，不產生投資建議。agent 對使用者的文字回覆仍須遵守：不得有買賣指令，結尾加「（僅供參考，非投資建議）」。
