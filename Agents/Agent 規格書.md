# 股奈 StockNite Agent 規格書

> 依據 `AWS AI Hackathon - CMoney briefing 0702.pdf`（命題說明會）與
> `CMoney_Hackathon_Data_Workshop_20260702.pdf`（數據工作坊手冊）之命題要求，
> 說明本專案 Agent 端（`Agents/`）的實際設計與實作方式。

## 1. 命題對應

CMoney 命題核心：「善用 AI 理解使用者的真實持股，把『資訊提供』變成『投資陪伴』」，
並要求 Agent 具備六項判斷能力（工作坊手冊 P.4）。本專案的對應方式：

| 命題要求的能力 | 對應資料 | 本專案對應元件 |
|---|---|---|
| 投資風格（追高？存股？賺價差？） | 報酬率、殖利率、估值 | `get_momentum_indicators`、`get_dividend_ranking`、`get_stock_snapshot` |
| 資產配置（產業集中度、市值分佈） | 產業分類、市值 | `get_portfolio_metrics`、`compute_portfolio_weights` |
| 集中風險（單一個股壓注比例） | 持股權重、市值比重 | `get_risk_contribution`、`get_correlation` |
| 投資習慣（進場時機、持有週期） | 距高低點、還原報酬 | `get_momentum_indicators`、`get_stock_snapshot` |
| 常見錯誤（越攤越平、賺小賠大） | 成本 × 現價 × 區間 | `pull_stock_agent`（`get_holdings`，含即時市值與損益） |
| 決策焦慮（現在最想問的問題） | 法人動向、社群情緒 | `get_institutional_trend`、`get_forum_sentiment` |

命題要求的「低門檻輸入與回訪機制」與「一鍵成本回饋」，對應本專案的
`archiving_stock_agent` 暫存確認流程（見第 4.3 節）；「使用者不願輸入真實持股的
真正原因」對應本專案採用的「無真實持股也能分析」設計（見第 4.2 節案例二）。

命題明文限制「直接投資建議違反主管機關限制」，本專案在每一個會產出數據判斷的
子 agent 皆內建合規紅線（見第 5 節）。

## 2. 系統總覽

Agent 以 Google ADK（Agent Development Kit）建構多代理人（multi-agent）系統，
透過 LiteLLM 呼叫 Amazon Bedrock 上的 Claude 模型，部署於 Amazon Bedrock
AgentCore Runtime（Direct Code Deploy，無需 Docker）。對外只有一個進入點
`root_agent`（對使用者顯示為「股奈 StockNite」），使用者感覺自己始終在跟同一個
助理對話；背後依請求性質，透過 ADK 的 agent-transfer 機制轉交給對應的子 agent。

```
root_agent (stocknite_agent)
    │  快速查詢工具：get_stock_snapshot / get_momentum_indicators /
    │  get_dividend_ranking（單一股票、單一事實查詢，不需轉交）
    │
    ├─ stock_analysis_agent
    │     │  CMoney 300 檔示範資料的量化分析（無真實持股存取權）
    │     └─ butterfly_effect_agent（AgentTool）
    │           時事對個股的因果關聯分析／幽默澄清
    │
    ├─ pull_stock_agent（唯讀，真實持股）
    │     └─ stock_analysis_agent_via_holdings
    │           結合真實持股（或使用者口述持股）的風險分析
    │
    └─ archiving_stock_agent（可寫入，真實持股）
          暫存 → 確認 → 寫入 的兩階段持股異動流程
```

## 3. 資料層設計

依據工作坊手冊「三層理解 · 11 個資料檔」，本專案的資料使用方式：

### 3.1 CMoney 承諾層與行為層資料（300 檔示範籃子）

透過 `Tools/data_loader.py` 載入，本地開發時讀取 `Datasets/` 目錄下的 CSV，
部署後改為讀取 S3（`s3://aic-cmoney-resource/`）——因為 AgentCore 的 Direct Code
Deploy 只打包進入點自身的目錄樹，`Datasets/` 在 `Agents/` 之外，不會隨部署包上傳。

已導入並提供對應工具的資料檔：

| 資料檔 | 用途 | 對應工具 |
|---|---|---|
| 01 行情估值 | 收盤價、市值、本益比、股價淨值比、週轉率 | `get_stock_snapshot` |
| 02 法人動向 | 三大法人買賣超、外資/法人持股比率 | `get_institutional_trend` |
| 03 報酬率 | 日/週/月/季/半年/年報酬率、與大盤比較 | `get_momentum_indicators` |
| 04 距高低動能 | 近5/20/60日漲跌幅、乖離月/季/年線、創新高、連漲連跌 | `get_momentum_indicators` |
| 05 股利除息 | 現金股利、殖利率、除息日 | `get_stock_snapshot` |
| 06 / 06b 連續配息 | 連續配息年數與遞增趨勢、股利與殖利率排名（個股+ETF） | `get_dividend_ranking` |
| 07 產業分類對照 | 主產業、產業標籤 | `get_stock_snapshot`（併入寬表） |
| 09 寬表彙總 | 每股一列的成品快取，避免即時運算 | `get_stock_snapshot` 的主要資料源 |
| 10 同學會發文回文統計 | 每日發文/回文則數、多空立場統計 | `get_forum_sentiment` |

「00 欄位字典」作為欄位定義文件參考，不直接對應工具，用於確認欄位語意與取數範圍。

### 3.2 系統時間錨定

依據手冊「使用前提」（以 2025 年底為現在），所有子 agent 的 instruction 皆內嵌
`DEMO_TIME_ANCHOR`：系統時間固定為 2025/12/31，不得使用 2026 年以後的真實時間或
資料，避免與使用者的真實持股/提問時點混用。

### 3.3 真實持股資料（非 CMoney 示範資料）

「真實持股」（使用者實際庫存）不在 CMoney 提供的示範資料包內，而是由後端同事
另建的 HTTP API（`/api/agent/holdings`，背後為 Postgres）提供，詳見
`Tools/holdings_tools.py`。這與命題要求的「INPUT：使用者持股（股票代號/成本/
股數/買進日期）」直接對應——本專案把「輸入真實持股」與「分析示範資料」拆成
兩個明確分離的資料來源與存取權限（見第 4 節）。

## 4. Agent 職責與流程

### 4.1 root_agent（路由 + 快速查詢）

輕量的角色/路由層，本身即以「股奈 StockNite」的身份與使用者對話，絕不透露背後
是多代理人系統。除路由判斷外，直接持有三個快速查詢工具，讓「單一股票、單一
事實」的問題（例如「2330」、「台積電股利多少」、「最近20日漲跌幅」）立即回答，
不需轉交：

- `get_stock_snapshot`：股票代號/名稱查詢的預設回應
- `get_momentum_indicators`：明確問動能/近期漲跌幅/是否創新高
- `get_dividend_ranking`：明確問股利趨勢/排名（而非單純數字）

超出這三個工具範圍的請求（需整合多項資料的分析、投資組合計算、時事影響評估、
真實持股相關操作），依規則轉交至對應子 agent（見下）。

### 4.2 stock_analysis_agent（示範資料量化分析）

對 CMoney 300 檔示範資料進行完整分析，無真實持股存取權。持有的量化工具實作
工作坊手冊未明列公式、但命題「六項能力」隱含需要的投資組合數學：

- `get_historical_return`：單股歷史累計報酬率
- `compute_portfolio_weights`：由股數/市值換算投資組合權重（決定性計算，
  避免由語言模型自行心算市值/權重導致誤差，見第 6.2 節）
- `get_portfolio_metrics`：投資組合預期報酬率與波動度
- `get_risk_contribution`：邊際風險貢獻度（MCTR）、診斷單一持股是否為
  「震盪放大器」——對應命題「集中風險」能力
- `get_correlation`：兩股相關係數、持股擁擠度警告
- `optimize_portfolio_sharpe`：數學模型下的最大夏普比率參考權重

時事對個股的影響評估，透過 `AgentTool` 呼叫 `butterfly_effect_agent`
（Haiku 模型），判斷真實因果關聯或幽默澄清無關聯的提問。

**stock_analysis_agent_via_holdings**（`pull_stock_agent` 的子 agent，與
`stock_analysis_agent` 為同一套設定的第二個實例，見第 4.3 節）額外處理三種
情境，對應命題點出「使用者不願輸入真實持股的真正原因」——即使沒有輸入，
仍可用口述持股完成分析：

1. 使用者已在後端資料庫記錄持股 → 以真實資料分析
2. 使用者未記錄持股，但當下訊息中口述了持股內容 → 以口述內容分析
3. 使用者既未記錄也未口述持股 → 誠實回覆「StockNite Agent 需要您提供更多您的
   持股資訊，謝謝。」，不進行分析、不轉交

### 4.3 pull_stock_agent（真實持股，唯讀）／archiving_stock_agent（真實持股，可寫）

真實持股的讀取與寫入分屬兩個獨立子 agent，寫入權限完全不出現在唯讀路徑上：

- **pull_stock_agent**：僅有 `get_holdings`（查詢，含即時市值與佔比）。
  使用者查詢「我的持股」時直接回答；使用者要求「根據持股分析風險」時，
  先呼叫 `get_holdings`，再依上述三種情境判斷是否轉交
  `stock_analysis_agent_via_holdings`。
- **archiving_stock_agent**：持有 `stage_pending_holdings` /
  `get_pending_holdings` / `discard_pending_holdings`（暫存確認流程，見
  `Tools/pending_holdings_tools.py`）與 `add_holding` / `update_holding`
  （真正寫入）。新增或修改一律先暫存於 DynamoDB（`stocknite-pending-holdings`，
  以 `line_user_id` 為鍵、15 分鐘過期），待使用者明確確認後才寫入，因為 Line Bot
  對話可能落在不同的 AgentCore Runtime session，無法僅靠對話記憶判斷「使用者在
  確認什麼」。寫入成功後呼叫 `pull_stock_agent`（此處為 `AgentTool` 呼叫）取得
  最新完整持股，一次回覆使用者「剛才記錄了什麼」與「現在的完整持股狀況」。

此流程直接對應命題要求的「低門檻輸入」：使用者可一次輸入多檔（含截圖多模態
解析），只需確認一次即可全部記錄，不需逐檔重複確認。

### 4.4 使用者身份（line_user_id）

真實持股的讀寫皆以 `tool_context.user_id`（ADK 於呼叫時注入，語言模型的工具
schema 中完全不會出現、模型無法讀取或提供這個值）作為使用者身份依據，由
`main.py`（AgentCore 進入點）從請求 payload 的 `line_user_id` 欄位讀入並傳給
ADK `Runner`。此設計確保模型結構上不可能混用或幻覺出錯誤的使用者身份。

## 5. 合規設計

命題明文要求：「直接投資建議違反主管機關的限制」。所有會產出數據判斷的子 agent
（`stock_analysis_agent` 及其兩種變體、`pull_stock_agent`、`archiving_stock_agent`、
`butterfly_effect_agent`）皆內建合規紅線指示：

- 不得給出具體買賣建議、進出場時機、目標價、停利停損點
- 不得將數學模型計算結果（如 `optimize_portfolio_sharpe` 的參考權重）包裝成
  「你應該這樣做」的建議，必須明確標註為「模型計算的參考數字」
- 只能描述數據與風險因子，把最終決定權交還使用者
- 分析類回覆結尾加註「僅供參考，非投資建議」

## 6. 已知限制與設計取捨

### 6.1 資料範圍

僅涵蓋 CMoney 提供的 300 檔示範籃子、2025 年度資料，無新聞資料（依命題「已
排除新聞」），無 2025 年以外的資料。使用者詢問範圍外的股票或要求新聞時，
誠實告知限制，不編造資料。

### 6.2 語言模型心算風險

實測發現：要求語言模型自行將「股數 × 價格」換算為投資組合權重時，多步驟心算
偶爾會產生看似合理但實際錯誤的數字（且不會報錯，只會讓下游風險計算結果一起
錯誤）。修正方式為新增 `compute_portfolio_weights` 工具，將此計算移出模型的
自由文字推理、交由決定性的 Python 程式碼執行。

### 6.3 尚未涵蓋

- 使用者主動回訪機制（命題要求的「持續更新誘因」）目前由後端 Line Bot 團隊
  規劃，Agent 端未內建提醒邏輯。
- 圖片/PDF 持股解析依賴 Claude 原生多模態視覺，未另建驗證層，準確度取決於
  模型本身的影像辨識品質。
- 網頁即時新聞尚為 mock 資料（`Tools/news_tools.py`），因 AgentCore 的 Web
  Search Tool 連接器僅支援 us-east-1，與本部署的 us-west-2 區域衝突。

## 7. 部署現況

已部署至 Amazon Bedrock AgentCore Runtime（`us-west-2`，Direct Code Deploy），
Agent ARN：`arn:aws:bedrock-agentcore:us-west-2:116659181302:runtime/stocknite_agent-wS1cOlE6o8`。
詳細部署步驟、環境變數與 IAM 權限設定見專案根目錄
`AWS AgentCore Deployment.md`。
