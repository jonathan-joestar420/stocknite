# Requirements Document

## Introduction

股奈 StockNite 是一個以 **LINE 為入口**的 AI 投資陪伴產品。使用者透過 LINE 傳送券商庫存截圖或文字，即可低門檻匯入真實持股；系統以 Amazon Bedrock（Claude 多模態）解析與生成洞察，把「看盤查資料」升級為「回答這個人現在最焦慮的問題」。

本文件定義 **6 小時 Hackathon MVP** 的需求範圍，並標註優先級（P0 必做 / P1 加分 / P2 有餘力）。

> **整合說明**：經 AWS 環境盤點（見 `environment.md`），同事已建置 Node/Fastify 後端、Postgres（資料全載入）、LINE 與 AgentCore。本需求維持不變（技術中立），但實作改為**在既有專案上延伸**；核心待補缺口為 **LINE 截圖匯入**（現況只處理文字）。

### 全域限制（所有需求皆適用）
- **法遵**：AI 輸出禁止出現直接投資建議（買進／賣出／加碼／減碼等指令性字眼），僅提供「洞察／體檢／提醒」。
- **隱私**：不得將真實財務個資寫入 AWS 帳號；demo 一律使用示範持股。
- **資料範圍**：僅限資料包的 300 檔示範股票，時間基準固定為 **2025/12/31 為「現在」**。
- **資料來源**：分析主要使用 `09_Wide_Table_Summary`（每股一列成品表）與 `10_Forum_Posts_Replies_Daily_Stats`（同學會情緒）。

## Glossary

- **承諾層**：使用者的真實持有、成本、配置資料（最高信任層級）。
- **行為層**：同學會發文/回文的社群情緒統計資料。
- **09 寬表**：`09_Wide_Table_Summary`，每檔股票一列、27 欄的預算成品表，供 demo 直接餵 AI。
- **六件事框架**：CMoney 官方定義的 AI「懂我」面向——投資風格、資產配置、集中風險、投資習慣、常見錯誤、決策焦慮。
- **法遵護欄**：確保 AI 輸出不含直接投資建議的機制。

## Requirements

## 需求 1：LINE 截圖匯入持股（P0）

**使用者故事：** 作為一般投資人，我想在 LINE 直接傳一張券商庫存截圖，讓系統自動讀出我的持股，這樣我就不必手動輸入。

### 驗收標準
1. WHEN 使用者於 LINE 傳送一張圖片訊息，THE SYSTEM SHALL 透過 webhook 接收該圖片並取得圖片內容。
2. WHEN 系統取得庫存截圖，THE SYSTEM SHALL 呼叫 Amazon Bedrock（Claude 多模態）將圖片解析為結構化陣列，每筆包含 `股票代號`、`股票名稱`、`股數`、`成本`。
3. IF 截圖中某欄位缺漏（例如無成本），THEN THE SYSTEM SHALL 將該欄位標記為 null 而非中斷流程。
4. WHEN 解析完成，THE SYSTEM SHALL 於 LINE 回覆已成功辨識的持股筆數與摘要清單。
5. IF Bedrock 解析失敗或逾時，THEN THE SYSTEM SHALL 回覆友善錯誤訊息並提示改用文字輸入。

---

## 需求 2：LINE 文字／語音匯入持股（P0 備援）

**使用者故事：** 作為使用者，我想用打字或語音（例如「台積電 5 張 成本 900」）快速新增或補充持股，作為截圖以外的備援輸入方式。

### 驗收標準
1. WHEN 使用者傳送描述持股的文字訊息，THE SYSTEM SHALL 以 Bedrock 解析為結構化持股陣列。
2. WHEN 使用者傳送語音訊息，THE SYSTEM SHALL 先轉為文字再進行解析（P1；若時間不足以文字輸入為主）。
3. WHEN 解析出多筆持股，THE SYSTEM SHALL 逐筆套用需求 3 的校驗流程。

---

## 需求 3：持股校驗與正規化（P0）

**使用者故事：** 作為使用者，我希望即使截圖辨識有小錯，系統也能自動對應到正確的股票，避免我人工校正。

### 驗收標準
1. THE SYSTEM SHALL 維護一份 300 檔的 `代號↔名稱` 對照清單（由資料包產生）。
2. WHEN 收到解析後的持股，THE SYSTEM SHALL 以代號優先、名稱次之的方式比對校驗清單。
3. IF 名稱可對應但代號有誤（或反之），THEN THE SYSTEM SHALL 自動以校驗清單修正為正確代號與名稱。
4. IF 某筆持股不在 300 檔範圍內，THEN THE SYSTEM SHALL 標記為「示範版暫不支援」並排除於後續分析，同時告知使用者。
5. WHEN 校驗完成，THE SYSTEM SHALL 產出乾淨的正規化持股清單供儲存與分析。

---

## 需求 4：持股儲存與管理（P0）

**使用者故事：** 作為使用者，我希望我匯入的持股被記住，之後回訪時不必重新輸入。

### 驗收標準
1. THE SYSTEM SHALL 以 LINE user id 為鍵，儲存該使用者的正規化持股清單。
2. WHEN 使用者再次匯入，THE SYSTEM SHALL 支援「覆蓋」或「新增合併」其現有持股（MVP 預設覆蓋）。
3. THE SYSTEM SHALL 記錄每次庫存更新的**來源**（screenshot / text / manual），供 KPI 分析（需求 10）。
4. THE SYSTEM SHALL 記錄每筆持股的匯入時間戳。

---

## 需求 5：AI「懂我」持股洞察（P0）

**使用者故事：** 作為使用者，匯入後我想立即看到 AI 對我持股講出「懂我」的洞察，而不只是帳面損益。

### 驗收標準
1. WHEN 持股完成匯入與校驗，THE SYSTEM SHALL 將對應個股的 `09 寬表` 欄位組成 context，呼叫 Bedrock 生成洞察。
2. THE SYSTEM SHALL 使 AI 洞察對齊官方六件事框架：投資風格、資產配置、集中風險、投資習慣、常見錯誤、決策焦慮。
3. WHEN 生成洞察，THE SYSTEM SHALL 至少產出一則「立即回饋」（例如產業集中度或估值提醒）於 LINE 回覆。
4. THE SYSTEM SHALL 確保所有洞察措辭符合法遵限制，不含指令性投資建議。
5. IF 使用者僅提供持股未提供成本，THEN THE SYSTEM SHALL 仍能產出不需成本的洞察（配置、集中風險、情緒）。

---

## 需求 6：情緒 × 法人 獨家事件洞察與推播（P1）

**使用者故事：** 作為使用者，我希望系統主動提醒我持股相關的重要訊號，特別是「散戶情緒與法人動向分歧」這種別的工具看不到的洞察，讓我有理由回來。

### 驗收標準
1. THE SYSTEM SHALL 針對使用者持股，結合 `10 同學會` 的看多/看空聲量與 `法人買賣超` 產出對比型洞察。
2. WHEN 偵測到「法人買超但社群看空升溫」或反向情境，THE SYSTEM SHALL 產出一則事件型洞察訊息。
3. THE SYSTEM SHALL 支援透過 LINE 主動推播該洞察（demo 可由手動觸發，不需真實排程）。
4. THE SYSTEM SHALL 使推播訊息帶有「好奇缺口」（結論只講一半，引導點入看完整分析）。

---

## 需求 7：AI 對話問答（P1）

**使用者故事：** 作為使用者，我想針對自己的持股追問 AI（例如「我這組抗跌嗎？」），得到基於我實際持股的回答。

### 驗收標準
1. WHEN 使用者於 LINE 傳送問句，THE SYSTEM SHALL 以其持股 + 對應結構化資料為 context，呼叫 Bedrock 回答。
2. THE SYSTEM SHALL 使回答個人化（引用使用者實際持股），而非通用回覆。
3. THE SYSTEM SHALL 確保回答符合法遵限制。
4. IF 問題超出資料可回答範圍，THEN THE SYSTEM SHALL 誠實說明限制而非杜撰精確數字。

---

## 需求 8：Web 展示／備胎介面（P1）

**使用者故事：** 作為團隊，我們需要一個網頁介面展示持股體檢，並在 LINE 環境卡關時作為 demo 備胎。

### 驗收標準
1. THE SYSTEM SHALL 提供一個網頁，可輸入或載入示範持股並顯示 AI 持股體檢（六件事摘要）。
2. THE SYSTEM SHALL 使網頁與 LINE 共用同一組後端 API 與分析邏輯。
3. THE SYSTEM SHALL 在網頁上可視化組合配置（例如產業分布、集中度）。

---

## 需求 9：法遵與隱私保護（P0）

**使用者故事：** 作為產品，我必須符合主管機關與競賽的合規要求，並化解使用者的隱私疑慮。

### 驗收標準
1. THE SYSTEM SHALL 在所有 AI 輸出套用法遵護欄（system prompt 明確禁止投資建議）。
2. THE SYSTEM SHALL 僅使用示範持股與 300 檔資料，不寫入真實財務個資。
3. THE SYSTEM SHALL 於使用者首次匯入時顯示一則隱私與資料使用說明。
4. THE SYSTEM SHALL 將所有分析時點固定於 2025/12/31。

---

## 需求 10：KPI 埋點（P1）

**使用者故事：** 作為產品長，我想衡量新匯入機制的採用率與回訪行為。

### 驗收標準
1. THE SYSTEM SHALL 記錄每次匯入的來源分佈（screenshot / text / manual）。
2. THE SYSTEM SHALL 記錄推播的送出與點擊（探索轉換）。
3. THE SYSTEM SHALL 記錄 AI 問答互動次數（投入深度）。
4. THE SYSTEM SHALL 能匯出上述指標的簡單彙總供簡報使用。
