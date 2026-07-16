---
name: latest-news
description: Reasoning framework for connecting real-world events (news, sports, politics, disasters) to specific stocks. Use whenever the user asks whether some event affects a stock, including seemingly unrelated or joke-like questions (e.g. sports results, celebrity news, weather). Determines whether a real financial causal chain exists, or humorously debunks unrelated pairings while finding a fun, honest tangential fact.
---

## Instructions

## 蝴蝶效應推理鏈 (Butterfly Effect Reasoning Chain)

當使用者詢問某個事件是否會影響某檔股票時，依照以下步驟推理：

1. 呼叫 `search_news` 工具，查詢與該事件相關的新聞。
2. 根據查詢結果的 `has_direct_financial_link` 欄位，判斷屬於「情況 1」
   還是「情況 2」，並依對應格式回覆。

### 情況 1：存在實質金融傳導路徑（`has_direct_financial_link: true`）

當事件確實會影響公司營運或產業供需時（例如：美東碼頭罷工 -> 長榮航運），
使用 `causal_chain` 欄位的內容，依序繪製因果鏈，說明實質影響
（例如：成本上升、營收增加），最後給出客觀的操作或防禦建議。

回覆結構：
- 📰 發生了什麼事（用 `summary` 欄位）
- 🔗 因果鏈拆解（用 `causal_chain` 欄位，逐步呈現）
- 💡 這對持股策略意味著什麼（給出具體、客觀的建議，不要過度承諾）
- 附上 `sources` 作為參考來源

### 情況 2：無實質金融關聯（`has_direct_financial_link: false`，趣味/玄學）

當事件純屬無稽之談時（例如：某國球隊輸球 -> 台積電），絕不胡編亂造或製造
虛假關聯（避免幻覺）。依照以下順序回覆：

1. **幽默澄清**：用輕鬆、高情商的口吻明確告知兩者沒有直接關係，
   避免使用者誤信「玄學投資」。
2. **微弱但真實的間接連結**：使用 `weak_indirect_link` 欄位的內容，
   提供一個有趣但誠實的冷知識（例如：主權基金的持股水位）。
   明確標註這只是巧合式的連結，不是投資建議的依據。
3. **導回真實基本面**：將焦點導向該股票的真實情況，建議使用者詢問
   該股票的實際數據（報酬率、法人動向、同學會情緒等），或引導使用者
   思考自己的整體持股是否有分散不足的風險。

回覆結構：
- 😄 幽默澄清事件與股票沒有直接關係
- 💡 微弱但真實的冷知識連結
- 📈 導回該股票真實體質的提示（可建議使用者接著問基本面問題）

### 通用規則

1. 如果 `search_news` 回傳 `{"error": ...}`（表示沒有對應的模擬新聞資料），
   誠實告知使用者目前查不到相關新聞，不要編造事件內容或因果關係。
2. 不論哪種情況，都要適度使用表情符號增加親切感，但不要過度誇大。
3. 絕不做出保證性的投資建議（例如「一定會漲」），只描述可能的機制與
   歷史上類似情況的參考。
