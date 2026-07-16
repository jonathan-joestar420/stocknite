# 股奈 StockNite — 全平台架構書

> 彙整命題說明會、數據工作坊、團隊實作計劃書、Agent 規格書、後端 README/CHANGELOG
> 與環境掃描資料，提供 AWS Hackathon 簡報所需的完整平台現況。本文件只描述**目前
> 已實作、已部署、可驗證**的狀態，規劃中但尚未完成的項目明確標註於第 8 節。

---

## 1. 一句話定位

> 用 LINE 當入口，把「真實持股」變成 AI 理解你的鑰匙，
> 從「看盤查資料」升級成「投資陪伴」。

命題核心（CMoney AI Everywhere Hackathon · 金融科技組）：**最大化「匯入真實持股」
的人數**，讓 AI 從「回答通用問題」進化到「回答這個人現在最焦慮的問題」。

評分權重：商業創新 30%、AI 善用性 25%、數據應用 20%、完成度 15%、技術可行性
（含法遵）10%。

三條紅線：
1. 不能給直接投資建議（違反主管機關規定）——只講「洞察／體檢／提醒」。
2. 不能匯入真實財務個資到 AWS 帳號——demo 一律用示範持股，限定 300 檔清單內。
3. 資料時點固定在 2025/12/31 為「現在」，不可混用 2026 真實部位。

## 2. 系統全貌

```
┌─────────────┐     HTTPS Webhook      ┌──────────────────────────────┐
│  LINE App   │ ─────────────────────▶ │  EC2 (i-0405f0c7e4bdae5c4)    │
│ (使用者)     │ ◀───────────────────── │  us-west-2 · Node.js/Fastify  │
└─────────────┘     LINE Reply API      │  Caddy (HTTPS) → :3000        │
                                        │  ├─ LINE webhook 處理          │
                                        │  ├─ 語意路由 (deterministic     │
                                        │  │   + Claude Haiku 分類器)     │
                                        │  ├─ Credit ledger              │
                                        │  ├─ 持股 CRUD (/api/portfolio, │
                                        │  │   /api/agent/holdings)      │
                                        │  └─ 網站 (LINE Login + /me)    │
                                        └───────────┬───────────────────┘
                                                    │
                       ┌────────────────────────────┼───────────────────────────┐
                       ▼                            ▼                           ▼
             ┌──────────────────┐      ┌─────────────────────────┐   ┌────────────────────┐
             │  PostgreSQL       │      │  Amazon Bedrock          │   │  Amazon Bedrock     │
             │  (EC2 本機         │      │  AgentCore Runtime       │   │  (Claude Haiku 4.5)  │
             │  127.0.0.1:5432)  │      │  us-west-2               │   │  語意分類器          │
             │  · app_data.users │      │  stocknite_agent-        │   └────────────────────┘
             │  · portfolio_     │      │  wS1cOlE6o8              │
             │    holdings       │      │  (Google ADK multi-agent)│
             │  · credit_ledger  │      └────────────┬─────────────┘
             └──────────────────┘                    │
                                          ┌────────────┴────────────┐
                                          ▼                         ▼
                              ┌─────────────────────┐   ┌─────────────────────┐
                              │  DynamoDB            │   │  S3                  │
                              │  stocknite-pending-  │   │  aic-cmoney-resource │
                              │  holdings            │   │  (300檔示範資料 CSV,  │
                              │  (暫存確認流程)        │   │   S3 fallback 用)     │
                              └─────────────────────┘   └─────────────────────┘
```

平台由兩個獨立的程式庫組成，透過 HTTP API 與 AWS SDK 串接：

| 部分 | 程式庫 | 語言/框架 | 部署位置 |
|---|---|---|---|
| **後端 + LINE Bot + 網站** | `stocknite`（API Repo） | TypeScript / Fastify / Node.js 22 | EC2 `i-0405f0c7e4bdae5c4`（us-west-2），Caddy 反代 HTTPS |
| **AI Agent** | `Agents/`（本文件說明對象） | Python / Google ADK / LiteLLM | Amazon Bedrock AgentCore Runtime（us-west-2，Direct Code Deploy） |

## 3. AWS 帳號與環境現況

| 項目 | 值 |
|---|---|
| AWS 帳號 | `116659181302` |
| 主要區域 | `us-west-2`（生產環境，與資料庫、EC2 一致） |
| IAM Role（開發） | `WSParticipantRole`（AWS Workshop Studio Participant，附 AdministratorAccess） |
| EC2 執行角色 | `StockNiteSSMRole` |
| AgentCore 執行角色 | `AmazonBedrockAgentCoreSDKRuntime-us-west-2-88c4e6223d` |

### EC2（後端主機）

| 欄位 | 值 |
|---|---|
| Instance ID | `i-0405f0c7e4bdae5c4` |
| 名稱標籤 | `ap` |
| 區域/AZ | `us-west-2` / `us-west-2b` |
| 型號 | `m8i.large` |
| 公開 IP | `52.11.160.62` |
| VPC | `vpc-016386b6e77589533` |
| 管理方式 | AWS SSM（Session Manager，免 SSH 金鑰） |
| 對外開放埠 | 80（HTTP）、443（HTTPS，供 LINE webhook 使用）、22（SSH，限單一 IP） |
| 服務進程 | systemd unit `stocknite.service`，Node.js 監聽 `127.0.0.1:3000`，Caddy 對外提供 HTTPS 憑證（Let's Encrypt） |
| 網域 | `stocknite.zzeric.com` |

### 資料儲存

| 儲存 | 用途 | 位置 |
|---|---|---|
| PostgreSQL | `app_data.users`、`app_data.portfolio_holdings`、`app_data.credit_ledger`（append-only） | EC2 本機，僅監聽 `127.0.0.1:5432` |
| DynamoDB `stocknite-pending-holdings` | Agent 端持股異動的暫存確認流程（15 分鐘過期，TTL + 應用層雙重過期檢查） | us-west-2 |
| S3 `aic-cmoney-resource` | CMoney 300 檔示範資料 CSV，AgentCore 部署後讀取此處（Datasets/ 目錄不隨部署包上傳） | us-west-2 |

### Bedrock 模型存取

- `us.anthropic.claude-sonnet-4-5-20250929-v1:0`（Agent 主力模型：路由判斷、量化分析）
- `us.anthropic.claude-haiku-4-5-20251001-v1:0`（Agent 側：蝴蝶效應子代理；後端側：語意分類器）

## 4. 後端服務（`stocknite` API Repo）

### 4.1 功能現況（依 README/CHANGELOG 實際驗證狀態，非規劃）

已完成並通過 TypeScript typecheck、34 個自動化測試與 production build：

- 公開品牌首頁與 LINE Login
- 登入後 `/me` 持股頁：市值、權重、成本、買進日期、未實現損益
- 持股儀表板：90 日價格、成本線、60 日社群情緒、估值位置
- **Hybrid 語意路由**：明確指令（含所有寫入操作）一律走 deterministic router；
  其他自然文字才交給 Claude Haiku 4.5 分類為白名單 intent，分類器本身不接觸
  持股資料、不能直接寫入
- 只有明確分析指令或高信心分析 intent，才會讓 conversation service 組合
  「後端驗證過的」持股／市場證據（evidence）並呼叫 AgentCore
- LINE 文字／圖片輸入，圖片交由 AgentCore 多模態解析結構化持股
- Credit ledger：每日簽到、10/30/100 點 demo 儲值、AI 分析扣點與失敗退款
  （目前 `CREDIT_ENFORCEMENT_ENABLED=false`，記錄但不強制扣點）
- Agent-facing 持股 API（`/api/agent/holdings`）與內部持股 API 分離
- Caddy HTTPS 與正式網域設定腳本
- 部署腳本依檔名順序套用 `sql/*.sql` migration，並在失敗時自動回滾

### 4.2 語意路由架構

```
使用者訊息
    │
    ▼
deterministic router (src/intents/router.ts)
    │  明確指令、完整新增持股格式、chip 按鈕 → 直接處理
    │
    ▼ (無法判斷時)
semantic router (src/intents/semantic-router.ts)
    │  Claude Haiku 4.5 + JSON Schema structured output
    │  分類至白名單 intent，信心門檻 0.82，逾時/低信心/錯誤 → fallback
    │  不接收持股或身分資料，不能直接觸發寫入
    │
    ▼ (只有 analyze_holdings / analyze_recent 才繼續)
conversation service
    │  組合 backend-verified evidence（持股/市場快照）
    │
    ▼
invokeAgentCore() → AgentCore Runtime (InvokeAgentRuntime)
```

### 4.3 AgentCore 呼叫契約

後端呼叫 Agent 的 payload（`src/agent/adapter.ts` 之 `buildAgentRuntimePayload`）：

```json
{
  "prompt": "使用者訊息 + [BACKEND_VERIFIED_EVIDENCE_JSON] 區塊",
  "line_user_id": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "current_holdings": [ { "stock_code": "2330", "...": "..." } ],
  "market_snapshot": { "...": "..." },
  "image_base64": "（僅截圖訊息才有）",
  "image_mime": "image/jpeg"
}
```

- `line_user_id` 每次請求保證存在（LINE Bot 來自 `source.userId`；網頁助手要求
  先完成 LINE Login，取得同一個 provider 下的同一個 userId）。
- `current_holdings`／`market_snapshot` 為後端已驗證的 evidence，並在 prompt 中
  明確標記為 authoritative，避免 Agent 誤判「缺少身份、無法查詢持股」。
- `runtimeSessionId` 採 `stocknite-<lineUserId>`（zero-padded 至 33 字），作為
  身份的交叉核對備援訊號。

### 4.4 Agent-facing 持股 API（後端提供，Agent 消費）

| 方法 | 路徑 | 用途 |
|---|---|---|
| `GET` | `/api/agent/holdings?lineUserId=...` | 查詢持股（含即時市值、佔比） |
| `POST` | `/api/agent/holdings` | 新增持股（已存在回 409，需改用 PUT） |
| `PUT` | `/api/agent/holdings` | 更新既有持股／全數賣出（不存在回 404，需改用 POST） |
| `POST` | `/api/agent/analyze` | 需 `x-agent-key`；帶 `lineUserId`＋`message`，後端自載入 verified holdings |

認證：`x-agent-key` header，對應 `AGENT_API_KEY` 環境變數。新增與更新為兩支分開
的 API（非 upsert），避免使用者提及新標的時誤覆蓋既有部位。

## 5. AI Agent（`Agents/` 本專案）

完整設計細節見同資料夾內 `Agent 規格書.md`；此處摘要架構重點，供簡報快速引用。

### 5.1 技術棧

- **框架**：Google ADK（Agent Development Kit），多代理人（multi-agent）架構
- **模型串接**：LiteLLM → Amazon Bedrock（Claude Sonnet 4.5 主力、Haiku 4.5 輔助）
- **部署**：Amazon Bedrock AgentCore Runtime，Direct Code Deploy（無需 Docker），
  `linux/arm64`，Python 3.13
- **Agent ARN**：`arn:aws:bedrock-agentcore:us-west-2:116659181302:runtime/stocknite_agent-wS1cOlE6o8`

### 5.2 Agent 樹狀結構

```
root_agent (stocknite_agent)
    │  快速查詢：get_stock_snapshot / get_momentum_indicators /
    │  get_dividend_ranking（單一股票、單一事實查詢，不需轉交）
    │
    ├─ stock_analysis_agent
    │     │  CMoney 300 檔示範資料的量化分析（無真實持股存取權）
    │     └─ butterfly_effect_agent（AgentTool，Haiku 模型）
    │           時事對個股的因果關聯分析／幽默澄清
    │
    ├─ pull_stock_agent（唯讀，真實持股）
    │     └─ stock_analysis_agent_via_holdings
    │           結合真實持股（或使用者口述持股）的風險分析
    │
    └─ archiving_stock_agent（可寫入，真實持股）
          暫存 → 確認 → 寫入 的兩階段持股異動流程
```

- **身份隔離**：真實持股的讀寫皆依賴 `tool_context.user_id`（ADK 注入，語言模型
  完全無法讀取或提供此值），由 `main.py` 從請求 payload 的 `line_user_id` 欄位
  傳入，結構上排除模型幻覺出錯誤使用者身份的可能性。
- **讀寫權限分離**：`pull_stock_agent`（唯讀）與 `archiving_stock_agent`（可寫）
  為兩個獨立子 agent，寫入能力不會出現在唯讀路徑上。
- **兩階段寫入**：新增/修改持股一律先暫存於 DynamoDB
  （`stocknite-pending-holdings`，以 `line_user_id` 為鍵，15 分鐘過期），待使用者
  明確確認後才真正寫入——因為同一使用者的多輪對話可能落在不同的 AgentCore
  Runtime session，無法只靠對話記憶判斷「使用者在確認什麼」。

### 5.3 量化分析工具（CFA 財務量化技能）

| 工具 | 對應公式/功能 |
|---|---|
| `get_historical_return` | 歷史累計報酬率：$R = (P_{end} - P_{start} + D) / P_{start}$ |
| `compute_portfolio_weights` | 由股數/市值決定性換算投資組合權重（見 5.5 節） |
| `get_portfolio_metrics` | 投資組合預期報酬率 $E(R_p)$、波動度 $\sigma_p$ |
| `get_risk_contribution` | 邊際風險貢獻度（MCTR）、風險貢獻比例——診斷「震盪放大器」 |
| `get_correlation` | 兩股相關係數 $\rho_{ij}$，> 0.8 觸發持股擁擠度警告 |
| `optimize_portfolio_sharpe` | 馬可維茲模型下最大化夏普比率的參考權重 |

### 5.4 資料層（CMoney 300 檔示範資料）

透過 `Tools/data_loader.py` 載入，本地開發讀取 `Datasets/` CSV，部署後改讀 S3
（`s3://aic-cmoney-resource/`）。已導入 9 個資料檔（01/02/03/04/05/06/06b/07/09/10），
對應到 `get_stock_snapshot`、`get_institutional_trend`、`get_momentum_indicators`、
`get_dividend_ranking`、`get_forum_sentiment` 等工具。系統時間錨定為 2025/12/31，
與 CMoney 資料包時間基準一致。

### 5.5 已驗證的設計修正：語言模型心算風險

實測發現要求語言模型自行將「股數 × 價格」換算為投資組合權重時，多步驟心算
偶爾產生看似合理但錯誤的數字，且不會報錯——只會讓下游風險計算結果一併錯誤。
修正方式：新增 `compute_portfolio_weights` 工具，將此計算移出模型的自由文字
推理，交由決定性的 Python 程式碼執行，並在 prompt 中明確禁止模型自行心算。

## 6. 端到端資料流（Demo Happy Path）

```
1. 使用者在 LINE 傳文字或截圖（例：「台積電 5 張 成本 900」或券商庫存截圖）
       │
       ▼
2. LINE webhook → 後端 deterministic/semantic router 判斷 intent
       │
       ▼
3a. 明確新增持股指令 → 後端直接解析寫入 PostgreSQL（不經過 Agent）
3b. 分析類請求（分析持股/分析近況） → 後端組合 verified evidence → 呼叫 AgentCore
       │
       ▼ (3b 路徑)
4. AgentCore Runtime 依請求性質路由至對應子 agent：
   - 純示範資料分析 → stock_analysis_agent
   - 結合真實持股的風險分析 → pull_stock_agent → stock_analysis_agent_via_holdings
   - 持股異動（含截圖多模態解析） → archiving_stock_agent（暫存 → 確認 → 寫入）
       │
       ▼
5. Agent 回覆（白話轉譯後的洞察，結尾附「僅供參考，非投資建議」）
       │
       ▼
6. 後端接收回覆 → 格式化 → LINE Reply API → 使用者
```

## 7. 合規與資安設計

| 項目 | 實作方式 |
|---|---|
| 禁止直接投資建議 | 所有分析類子 agent 內建合規紅線指示；後端 `guardCompliance()` 額外做字眼過濾作為第二層防線 |
| 使用者身份不可由模型偽造 | `tool_context.user_id` 由 ADK 注入，工具 schema 對模型不可見 |
| Credit ledger 防竄改 | 資料庫角色僅開放 `SELECT`／`INSERT`，禁止 `UPDATE`／`DELETE`／`TRUNCATE`（append-only） |
| Agent API 認證 | `x-agent-key` header，獨立於使用者身份驗證 |
| 語意分類器權限最小化 | Haiku 分類器不接收持股或身分資料，也不能直接觸發寫入操作 |
| 密鑰管理 | `.env` 一律不提交版本控制；AWS 憑證為 Workshop Studio 臨時憑證，需定期更新 |
| 資料時點鎖定 | 系統時間錨定 2025/12/31，避免與 2026 真實部位混用 |
| 資料範圍限制 | 僅 300 檔示範清單內股票，超出範圍時誠實告知、不編造資料 |

## 8. 已知限制與尚未完成項目

依後端 CHANGELOG「尚未完成」與 Agent 規格書「已知限制」章節彙整：

- **正式付款與儲值驗證**：目前儲值端點僅建立 demo ledger 紀錄，未串接金流。
- **Credit 強制扣點**：`CREDIT_ENFORCEMENT_ENABLED` 預設為 `false`，扣點邏輯已
  實作但未啟用。
- **07:00 晨報排程**：主動推播機制尚未建置排程器，目前僅能手動觸發 demo。
- **完整台股庫存確認／歷史交易流程**：目前為單筆新增/更新，尚無批次歷史交易
  匯入或對帳功能。
- **圖片/PDF 持股解析無獨立驗證層**：依賴 Claude 原生多模態視覺，準確度取決於
  模型本身影像辨識品質，未另建 OCR 校驗管線。
- **即時新聞為 mock 資料**：`Tools/news_tools.py` 尚未串接真實新聞來源，因
  AgentCore 的 Web Search Tool 連接器僅支援 `us-east-1`，與本部署的 `us-west-2`
  區域衝突。
- **VPC 網路隔離**：AgentCore Runtime 目前為 `PUBLIC` network mode，未與 EC2
  所在的 VPC（`vpc-016386b6e77589533`）建立私有網路路徑；若未來需要，需
  `--vpc` 重新設定。

## 9. 對應命題評分項目

| 評分項目 | 權重 | 本平台對應說明 |
|---|---|---|
| 商業創新 | 30% | 回訪迴圈設計（被動觸發→主動探索→投入→再觸發）；「無真實持股也能分析」降低輸入門檻的信任解方 |
| AI 善用性 | 25% | 多代理人架構分層委派、決定性計算與語言模型推理的明確分工（見 5.5 節）、蝴蝶效應因果推理鏈 |
| 數據應用 | 20% | CMoney 9 個資料檔全數導入並提供對應工具；社群情緒 × 法人動向的獨家對比 |
| 完成度 | 15% | 後端 34 個自動化測試通過、production build 驗證；Agent 端多輪本地與雲端測試驗證（案例一/二/三皆通過） |
| 技術可行性與法遵 | 10% | 已部署至真實 AgentCore Runtime；合規紅線內建於每個會產出判斷的子 agent |
