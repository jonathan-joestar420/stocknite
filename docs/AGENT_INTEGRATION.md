# 股奈 StockNite — AgentCore Agent 整合規格

> 對象：負責設計 AgentCore agent 的同事。
> 這份是**實作規格**，照著做即可。你的 agent 只做一件事：**看懂使用者訊息（文字或截圖）→ 回一個固定格式的 JSON**。其餘（身份、寫資料庫、驗證、缺欄位提示、法遵過濾）都由 backend 處理。

---

## 0. 一句話定義你的 agent 要做什麼

**輸入**：一段 JSON（使用者的文字或持股截圖）。
**輸出**：一段 **JSON**，必含 `intent` 與 `reply`；若是持股操作再附 `holdings` 或 `stock_code`。
**絕不**：不要自己連資料庫、不要自己算要不要寫、不要給投資建議、不要猜使用者沒講的資料。

---

## 1. 你會收到的輸入（Backend → Agent payload）

`InvokeAgentRuntime` 的 payload 是這個 JSON：

```json
{
  "prompt": "使用者傳的文字；若是截圖訊息，這裡是一句解析指示",
  "line_user_id": "Uxxxxxxxxxxxx",
  "current_holdings": [
    { "stock_code": "2330", "stock_name": "台積電", "quantity": 100, "average_cost": 900, "purchase_date": "2025-03-01" }
  ],
  "image_base64": "（僅截圖訊息才有）圖片的 base64，沒有 data: 前綴",
  "image_mime": "image/jpeg"
}
```

- `prompt`：使用者文字。純截圖訊息時，`prompt` 會是一句指示（例如「請解析這張持股截圖…」），真正的資料在 `image_base64`。
- **`line_user_id`：⭐每一次呼叫都一定有（保證非空）。** 不論來自 LINE bot 或網頁 AI 助手，backend 都會在 payload 帶上它。這就是你呼叫**庫存 API**（見 `HOLDINGS_API.md`）時要帶的 `lineUserId`。
- `current_holdings`：使用者目前已存的持股，供你參考。可能是空陣列或不存在（你也可以改用庫存 API 的 GET 取得最新）。
- `image_base64` / `image_mime`：**只有截圖訊息才會有**。有這兩個欄位時，請對圖片做多模態解析，抽出每一筆持股。

> **身份保證（回答「agent 一定收得到 lineUserId 嗎？」）：**
> - **會，每次都有。** LINE bot：來自使用者的 LINE `source.userId`（群組/多人聊天無 userId 時 backend 直接擋掉、不會呼叫 agent）。網頁 AI 助手：使用者必須先 LINE 登入，用登入後的同一個 userId。
> - 兩個入口拿到的是**同一個** LINE userId（因為 Login channel 與 Messaging API 在同一 Provider）。
> - 位置：payload 的 `line_user_id` 欄位；另外 `runtimeSessionId` 也是 `stocknite-<userId>`，可交叉核對。
> - **要讀/寫該使用者的庫存，就用這個 `line_user_id` 呼叫 `HOLDINGS_API.md` 的端點。**

---

## 2. 你要回傳的輸出（Agent → Backend）

**一律回傳 JSON**（可以直接是物件；若你的框架習慣包一層 `{"result": {...}}` 或回 JSON 字串也可以，backend 會自動拆）。共三種 `intent`：

### 2.1 `upsert_holding`（新增或更新持股）
使用者說「我買了 / 我持有 / 幫我記錄」某些股票，或上傳持股截圖時。

```json
{
  "intent": "upsert_holding",
  "reply": "幫你記下台積電 50 股、成本 2400，買進日 2025-12-30 ✅",
  "holdings": [
    {
      "stock_code": "2330",
      "stock_name": "台積電",
      "quantity": 50,
      "average_cost": 2400,
      "purchase_date": "2025-12-30"
    }
  ]
}
```

### 2.2 `remove_holding`（刪除某一檔持股）
使用者說「幫我移除 / 刪掉 / 我賣光了 X」。

```json
{ "intent": "remove_holding", "stock_code": "2330", "reply": "已幫你把台積電移除 ✅" }
```

### 2.3 `chat`（一般問答／洞察，不涉及新增或刪除）
使用者只是問問題、聊天、想了解某檔或自己的組合。

```json
{ "intent": "chat", "reply": "台積電今年上漲 46.5%，站上歷史新高…（僅供參考，非投資建議）" }
```

> 相容性：如果你只回一段**純文字**（沒有 JSON、沒有 `intent`），backend 會把它當成 `chat` 直接回給使用者。但**只要是持股新增/刪除，一定要回 JSON**，否則不會寫入資料庫。

---

## 3. `holdings` 每一筆的欄位規則（很重要）

| 欄位 | 型別 | 必填 | 規則 / 說明 |
|---|---|---|---|
| `stock_code` | string | ✅ 必填 | 台股代號 4–6 碼字串（例 `"2330"`）。**必須是第 5 節 300 檔清單內**的代號。 |
| `stock_name` | string | 建議 | 中文名稱，顯示用。 |
| `quantity` | number | ✅ 必填 | 股數，**> 0**。使用者講「張」要換算：1 張 = 1000 股（例：3 張 → `3000`）。 |
| `average_cost` | number | 選填 | 每股平均成本，>= 0。使用者沒講就省略。 |
| `purchase_date` | string | ⚠️ 條件必填 | 格式 **`YYYY-MM-DD`**。**使用者沒明確提供就「省略此欄或給 null」，絕對不要猜、不要填今天。** |

### 買進日期的處理（backend 會依此運作）
- 你**有**解析到日期 → 填 `purchase_date`。
- 你**沒有**解析到日期 → **省略該欄位或給 `null`**。
  - backend 會**不寫入**，並自動回覆使用者「請補上買進日期，或重新上傳含日期的截圖」。
  - 你的 `reply` 可以順勢提醒，但不要自己編一個日期。
- 相對日期要換算成絕對日期，基準是 **2025-12-31（系統的「今天」）**：
  - 「今天買的」→ `2025-12-31`
  - 「上週五買的」→ 對應的實際日期
  - 只給「12/30」沒給年份 → 用 `2025-12-30`

---

## 4. 具體處理規則（照這些判斷）

### 4.1 判斷 intent
- 出現「買了 / 持有 / 我有 / 幫我記 / 加入 / 匯入 / （上傳截圖）」→ `upsert_holding`
- 出現「賣光 / 移除 / 刪掉 / 清掉」某檔 → `remove_holding`
- 其他（詢問、閒聊、要洞察）→ `chat`

### 4.2 文字解析
- 把名稱轉成代號（「台積電」→ `2330`，見第 5 節）。
- 「張」換算成「股」（× 1000）。
- 一句可能含多檔：全部放進 `holdings` 陣列。
- 成本用「每股」數字；若使用者給「總成本」，請換算成每股（總成本 ÷ 股數）並在 `reply` 說明。

### 4.3 截圖解析（有 `image_base64` 時）
- 對圖片做 OCR/多模態，抽出每一列持股：代號或名稱、股數、（可能有）成本、（可能有）買進日期。
- 券商截圖常見**沒有買進日期** → 該筆 `purchase_date` 省略/null（backend 會請使用者補）。
- 一張圖多檔 → `holdings` 放多筆。
- 圖片看不清楚/不是持股截圖 → 回 `chat`，`reply` 請使用者重拍或改用文字。

### 4.4 找不到 / 不支援的股票
- 代號不在 300 檔清單 → **不要**放進 `holdings`；在 `reply` 告知「示範版目前只支援這 300 檔，X 暫不支援」。
- 完全無法辨識 → `chat` + 請使用者換個說法。

---

## 5. 股票名稱 → 代號 對照（300 檔）

- 對照來源：資料庫 `market_data.stock_summary_2025` 的 `stock_code`、`stock_name`（共 300 筆）。
- 建議做法：請 backend 匯出一份 `{stock_code, stock_name}` 的 JSON 內建到你的 agent（需要的話跟我們要）。
- 只認這 300 檔；超出範圍照 4.4 處理。

---

## 6. 合規限制（法遵紅線，務必遵守）

命題規定**不得提供投資建議**。你的 `reply`：

**禁止出現這類字眼與語意**：買進、賣出、加碼、減碼、進場、出場、逢低買、逢高賣、該買、該賣、建議持有、目標價、可以買、快賣、落袋、抄底…（任何叫使用者買賣的話）。

**可以做**：客觀資料解讀——漲跌幅、估值（本益比/PB）、殖利率、法人買賣超、散戶情緒（同學會多空）、產業集中度、距高低點、風險提醒。

**每則 `reply` 結尾**加上一行：`（僅供參考，非投資建議）`。

範例對照：
- ❌「台積電在高點，建議等回檔再進場，可以先落袋部分獲利。」
- ✅「台積電目前在今年區間的高點（買點分位 100%）、外資近期調節；股價位置偏高，屬於追高區間，請自行評估風險。（僅供參考，非投資建議）」

> backend 會再做一層字眼過濾，但**請你在 agent 端就先守住**，不要依賴 backend。

---

## 7. 完整範例（輸入 → 你該回什麼）

**A. 文字、資料齊全**
輸入 `prompt`：「2025-12-30 買了台積電 50 股，均價 2400」
```json
{"intent":"upsert_holding","reply":"幫你記下台積電（2330）50 股、每股 2400，買進日 2025-12-30 ✅",
 "holdings":[{"stock_code":"2330","stock_name":"台積電","quantity":50,"average_cost":2400,"purchase_date":"2025-12-30"}]}
```

**B. 文字、缺買進日期**
輸入：「今天買了台積電50股 成本2400」（"今天" 但沒明確日期時，若要視為 2025-12-31 可填；若使用者只說「買了」沒講時間，省略日期）
```json
{"intent":"upsert_holding","reply":"我幫你記台積電 50 股、成本 2400。不過我需要「買進日期」才能存檔，方便補一下嗎？（例如 2025-12-30）",
 "holdings":[{"stock_code":"2330","stock_name":"台積電","quantity":50,"average_cost":2400}]}
```
（省略 `purchase_date` → backend 會請使用者補）

**C. 講「張」＋多檔**
輸入：「我有台積電 2 張、聯發科 1 張，都是上個月買的」（無明確日期）
```json
{"intent":"upsert_holding","reply":"幫你記下台積電 2000 股、聯發科 1000 股。買進日期方便補一下嗎？",
 "holdings":[
   {"stock_code":"2330","stock_name":"台積電","quantity":2000},
   {"stock_code":"2454","stock_name":"聯發科","quantity":1000}
 ]}
```

**D. 截圖（多筆、券商通常無日期）**
輸入含 `image_base64`
```json
{"intent":"upsert_holding","reply":"從截圖讀到 3 檔持股。截圖沒有買進日期，方便補上嗎？（或重新上傳含日期的截圖）",
 "holdings":[
   {"stock_code":"2330","stock_name":"台積電","quantity":1000,"average_cost":900},
   {"stock_code":"2317","stock_name":"鴻海","quantity":2000,"average_cost":105},
   {"stock_code":"0050","stock_name":"元大台灣50","quantity":500,"average_cost":140}
 ]}
```

**E. 刪除**
輸入：「我把台積電賣光了，幫我移除」
```json
{"intent":"remove_holding","stock_code":"2330","reply":"已幫你把台積電（2330）移除 ✅"}
```

**F. 一般問答**
輸入：「台積電最近怎麼樣？」
```json
{"intent":"chat","reply":"台積電今年漲 46.5%、站上歷史新高，外資近期調節、散戶情緒偏多（看多約看空 9 倍）。股價位置偏高。（僅供參考，非投資建議）"}
```

**G. 不支援的標的**
輸入：「幫我加一張 台積電ADR」
```json
{"intent":"chat","reply":"示範版目前只支援台股 300 檔示範清單，台積電 ADR 暫不支援喔。"}
```

---

## 8. 你這邊的檢查清單（實作前對一遍）
- [ ] 輸出永遠是合法 JSON，含 `intent`、`reply`。
- [ ] 持股操作用 `upsert_holding` + `holdings[]`；刪除用 `remove_holding` + `stock_code`；其他用 `chat`。
- [ ] 名稱轉代號、張轉股、總成本轉每股。
- [ ] 沒解析到買進日期 → 省略 `purchase_date`，不要猜。
- [ ] 代號限 300 檔內，超出就不放進 holdings。
- [ ] `reply` 不含任何買賣建議，結尾加「（僅供參考，非投資建議）」。
- [ ] 截圖走 `image_base64` 多模態；看不清就請重傳。

---

## 附：DB schema（僅供你理解語意，**agent 不直接存取**）
```sql
app_data.portfolio_holdings(
  user_id uuid,           -- backend 由 line_user_id 對應，不用你處理
  stock_code text,
  quantity numeric>0,
  average_cost numeric>=0 NULL,
  purchase_date date NULL, -- 你解析、backend 寫入
  PRIMARY KEY(user_id, stock_code))
```
同一使用者同一 `stock_code` 再次匯入＝更新（覆蓋數量/成本/日期）。
