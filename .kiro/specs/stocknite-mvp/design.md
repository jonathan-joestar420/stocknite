# 設計文件 — 股奈 StockNite MVP

## Overview

> **重要：本設計已依 `environment.md` 的實地盤點調整。同事已建置好後端骨架、Postgres（資料全載入）、LINE 與 AgentCore 接法。我們的工作是在既有 Node/Fastify 專案上「延伸缺口」，不是重建。**

本設計描述在**既有 `/opt/stocknite` Node/Fastify 應用**上完成 6 小時 MVP：以 LINE 為入口，沿用現有的持股 CRUD、市場查詢、AgentCore 分析與 webhook，**補上目前缺少的「截圖匯入」與「懂我洞察/事件推播」**。分析資料直接查 Postgres 內已載入的 `stock_summary_2025`（09 寬表）與 `forum_posts_replies_daily_stats_2025`（同學會情緒）。

### 設計目標
- **接續不重建**：復用現有 `services/`、`line/`、`agent/adapter.ts`，只新增/擴充必要模組。
- **補齊核心缺口**：LINE image 事件 → 影像解析 → 持股 upsert（現況完全沒有）。
- **對題**：AI 輸出對齊官方六件事、凸顯「情緒 × 法人」獨家洞察、全程守法遵。

---

## 技術棧（沿用現況）

| 層 | 選型（實際） | 備註 |
|---|---|---|
| 入口 | LINE Messaging API | 已設定 channel secret/token，webhook 與簽章驗證已完成 |
| 後端 | **Node.js 22 + Fastify 5 + TypeScript**（ESM） | 既有 `/opt/stocknite/current`，systemd 常駐於 127.0.0.1:3000 |
| AI | **先直接 Bedrock**（洞察/對話），經 adapter 抽象；時間足夠再切 **AgentCore endpoint**。截圖解析固定走 **Bedrock 多模態** | 見「元件 8. AI 轉接層」的可切換設計 |
| 儲存 | **PostgreSQL 18**（DB `stocknite`，`pg` 套件） | 市場資料已全載入；`portfolio_holdings`/`users`/`notification_settings` 待填 |
| 分析資料 | Postgres 查詢 | `stock_summary_2025`(09寬表)、`forum_posts_replies_daily_stats_2025`(情緒) 等 |
| Web | 既有 `web.ts` landing page | 可擴充成體檢展示頁 |
| 部署 | EC2（us-west-2）+ systemd；改動走 git build → 新 release | 對外可達性見 environment.md 風險 1 |

---

## Architecture

### 系統架構（既有 + 我們新增，★ 標示新增/擴充）

```
┌──────────┐  圖片/文字   ┌──────────────────────┐
│  使用者   │ ───────────▶ │  LINE Messaging API  │
└──────────┘              └──────────┬───────────┘
      ▲  reply / push               │ POST /api/line/webhook（既有）
      │                             ▼
      │            ┌─────────────────────────────────────────────┐
      └─────────── │      Node/Fastify @ /opt/stocknite          │
                   │                                             │
                   │  line/handler.ts（既有，★加 image 事件）      │
                   │        │                                    │
                   │        ├─▶ ★importer（影像/文字→持股 JSON）    │
                   │        │      └─▶ ★normalizer（300檔校驗）     │
                   │        │            └─▶ services/portfolio.ts │
                   │        │                （既有 upsertHolding）│
                   │        │                                    │
                   │        ├─▶ services/market.ts（既有查詢）     │
                   │        │                                    │
                   │        └─▶ ★insight（六件事/情緒×法人）        │
                   │               ├─▶ agent/adapter.ts（既有 AgentCore）
                   │               └─▶ ★Bedrock 多模態（截圖解析）  │
                   │        ★compliance guard（輸出前過濾）         │
                   └───────────────────┬─────────────────────────┘
                                       ▼
                          PostgreSQL `stocknite`（既有，資料已載入）
                          stock_summary_2025 / forum_..._2025 /
                          portfolio_holdings ★ / users ★
```

---

## Components and Interfaces

> 標示：**【既有】** 沿用同事程式碼、**【擴充】** 修改既有檔案、**★【新增】** 新檔案。

### 1. LINE 介面層 `src/line/handler.ts` 【擴充】
- 【既有】text/postback 指令：`今日市場`、`我的持股`、`新增持股 <代號> <數量>`、代號查摘要、自由文字→AgentCore。
- ★新增 **image 事件處理**：`event.message.type === "image"` → 用 `line/client.ts` 下載圖片內容 → 呼叫 `importer.parseImage` → `normalizer` → `upsertHolding` → 回覆已匯入摘要 + 一則洞察。
- ★擴充文字持股解析：支援帶成本（例「新增持股 2330 1000 900」＝代號/股數/成本）。

### 2. 匯入解析層 `src/import/importer.ts` ★【新增】
- `parseImage(imageBuffer): Promise<Holding[]>`：呼叫 Bedrock 多模態（`@aws-sdk/client-bedrock-runtime`），輸出結構化 JSON。
- `parseText(text): Promise<Holding[]>`：自由文字→持股（可先走既有 regex，複雜句再呼叫 Bedrock）。

### 3. 校驗正規化層 `src/import/normalizer.ts` ★【新增】
- 啟動時從 `stock_summary_2025` / `industry_classification_mapping` 載入 300 檔 `代號↔名稱` 對照。
- `normalize(holdings): { valid: Holding[]; unsupported: Holding[] }`：代號優先、名稱模糊比對、自動糾錯、範圍外剔除。

### 4. 市場資料層 `src/services/market.ts` 【既有】
- `getStockSummary(code)`（09 寬表列）、`getStockDailySnapshot`、`getStockHistory`、`getMarketSentiment` 已可用。
- ★可補 `getSentimentForHoldings(codes)`：批次取情緒 + 法人買賣超供事件洞察。

### 5. 洞察生成層 `src/insight/engine.ts` ★【新增，包裝 AgentCore/Bedrock】
- `generatePortfolioInsight(holdings)`：組 evidence（各檔 09 寬表 + 情緒）→ `invokeAgentCore` 或 Bedrock → 六件事洞察。
- `generateEventInsight(holdings)`：偵測情緒×法人分歧 → 事件洞察（好奇缺口）。
- `answerQuestion(holdings, question)`：沿用 `/api/agent/analyze` → AgentCore。
- 所有輸出經 `complianceGuard`。

### 6. 法遵護欄 `src/insight/compliance.ts` ★【新增】
- 統一 system/prompt 前綴（禁投資建議、固定 2025/12/31）。
- 後處理關鍵詞過濾（買進/賣出/加碼/減碼/進場/出場/目標價），必要時改寫或加免責聲明。

### 7. 持股儲存 `src/services/portfolio.ts` 【既有，擴充】
- 【既有】`listHoldings(userId)`、`upsertHolding(userId, code, qty, avgCost?)`、`removeHolding`。
- ★擴充：記錄 `source`（screenshot/text）與時間戳；批次 upsert 多筆。

### 8. AI 轉接層 `src/agent/adapter.ts` 【既有，擴充為可切換】
- **決策：所有「洞察/對話」AI 呼叫都必須經過這個 adapter**，上游（`server.ts`、`line/handler.ts`、`insight/engine.ts`）一律只呼叫 `invokeAI(request)`，不得直接 call Bedrock 或 AgentCore。
- 統一介面（沿用既有型別）：`invokeAI({ userId, message, evidence }) → { mode, answer, data }`。
- 依環境變數切換實作（先 Bedrock、後可換 AgentCore，零上游改動）：
  ```
  invokeAI(request):
    if config.agentCoreEndpoint:  return invokeAgentCore(request)   // 既有；未來啟用
    else:                         return invokeBedrock(request)     // ★新增，直接 Bedrock，同介面
  ```
- `invokeBedrock` ★【新增】：把 `evidence`（持股 + 09 寬表 + 情緒）組進 prompt，呼叫 Bedrock Claude，回傳同樣的 `{ mode:"bedrock", answer, data }`。
- 切換到 AgentCore 只需設定 `AGENTCORE_ENDPOINT`；`evidence` 欄位兩邊共用，資料組裝程式不重寫。
- 注意：**截圖解析（`importer.parseImage`）不走此 adapter**，固定直接呼叫 Bedrock 多模態。

---

## Data Models

> 使用**既有 Postgres**。`portfolio_holdings`/`users` 已存在（空）；先以 SSM 確認其實際欄位，若缺欄位再以 migration 補（下方為建議形態，需與同事 schema 對齊後定案）。

### portfolio_holdings（既有表，擴充建議）
```sql
-- 若既有欄位不足，補上 source 與 updated_at
ALTER TABLE portfolio_holdings ADD COLUMN IF NOT EXISTS source TEXT;      -- screenshot/text
ALTER TABLE portfolio_holdings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
-- 預期鍵：line_user_id + stock_code；欄位：quantity, average_cost(nullable)
```

### event_log ★（新增，供 KPI）
```sql
CREATE TABLE IF NOT EXISTS event_log (
  id          BIGSERIAL PRIMARY KEY,
  line_user_id TEXT,
  event_type  TEXT,          -- import / push_sent / push_click / qa
  meta        JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### Holding（TypeScript 型別）
```typescript
interface Holding {
  code: string;
  name: string;
  shares: number | null;
  cost: number | null;         // 可為 null
  source: "screenshot" | "text";
}
```

---

## API 介面

> 【既有】沿用；★【新增】我們要加。持股 API 以 `x-line-user-id` header 辨識使用者（既有慣例）。

| 狀態 | Method | Path | 說明 |
|---|---|---|---|
| 既有 | POST | `/api/line/webhook` | LINE 事件入口（★內部擴充 image 處理） |
| 既有 | GET | `/api/stocks/:code` | 個股 09 寬表摘要 |
| 既有 | GET | `/api/market/sentiment` | 市場情緒 |
| 既有 | GET/POST/DELETE | `/api/portfolio(/holdings/:code)` | 持股 CRUD |
| 既有 | POST | `/api/agent/analyze` | AgentCore 分析（對話問答用） |
| ★新增 | POST | `/api/import` | 上傳圖片或文字 → 正規化持股 + 立即洞察（Web 共用） |
| ★新增 | POST | `/api/insight` | 傳持股回六件事體檢 |
| ★新增 | POST | `/api/push/:userId` | 手動觸發情緒×法人事件推播（demo 用） |
| ★新增 | GET | `/api/kpi` | KPI 彙總 |

---

## Bedrock Prompt 設計

### 共用 system 前綴（法遵護欄）
```
你是台股投資陪伴助手。現在時間固定為 2025/12/31。
嚴禁提供任何投資建議或買賣指令（不得出現：買進、賣出、加碼、減碼、進場、出場、目標價等）。
你只能提供「洞察、體檢、提醒」，並在必要時加註「本內容僅供參考，非投資建議」。
只能討論使用者持股中屬於示範 300 檔範圍內的標的。
```

### 截圖解析 prompt（要求嚴格 JSON 輸出）
```
以下是券商庫存截圖。請擷取每一檔持股，只輸出 JSON 陣列，格式：
[{"code":"股票代號","name":"股票名稱","shares":股數(數字),"cost":成本(數字或null)}]
無法辨識的欄位填 null。不要輸出任何其他文字。
```

### 洞察生成 prompt（六件事框架）
```
使用者持股與對應資料如下（JSON）：{context}
請依以下六個面向，用繁體中文產出精簡的「懂我」洞察，每項一句話：
1) 投資風格 2) 資產配置 3) 集中風險 4) 投資習慣 5) 常見錯誤 6) 決策焦慮。
語氣像懂投資的朋友，不得給投資建議。
```

### 事件洞察 prompt
```
根據以下某檔的法人買賣超與同學會多空聲量，若兩者出現分歧，
產出一則吸引點閱的提醒（結論只講一半，引導使用者點入看完整分析），不得給投資建議。
資料：{code, name, 法人買賣超, 看多則數, 看空則數, 趨勢}
```

---

## 主要流程（截圖匯入 happy path）

```
使用者傳圖 → LINE webhook → importer.parse_image(Bedrock)
  → normalizer.normalize(300檔校驗) → repository.save_holdings(source=screenshot)
  → insight_engine.generate_portfolio_insight(Bedrock) → compliance_guard
  → LINE reply：「已匯入 N 檔 ✅」+ 一則懂我洞察
```

---

## Error Handling

| 情境 | 處理 |
|---|---|
| Bedrock 逾時/失敗 | 回友善訊息，提示改用文字輸入（需求 1.5） |
| 截圖解析不出持股 | 請使用者重拍或改文字 |
| 標的超出 300 檔 | 標記「示範版暫不支援」，其餘仍分析（需求 3.4） |
| LINE 簽章驗證失敗 | 回 400，不處理 |
| JSON 解析失敗 | 重試一次，仍失敗則走文字備援 |

---

## Correctness Properties

### Property 1: 法遵不變式
任何 AI 對外輸出都不得包含指令性投資建議關鍵詞（買進/賣出/加碼/減碼/進場/出場/目標價）。
**Validates: Requirements 5.4, 7.3, 9.1**

### Property 2: 資料範圍不變式
進入分析的標的必為 300 檔示範籃子之一；範圍外標的一律標記 unsupported 並排除。
**Validates: Requirements 3.4**

### Property 3: 時點不變式
所有分析與提問時點固定為 2025/12/31，不引用 2026 資料。
**Validates: Requirements 9.4**

### Property 4: 校驗一致性
正規化後每筆持股的 `code` 與 `name` 必與 300 檔對照表一致。
**Validates: Requirements 3.3, 3.5**

### Property 5: 來源可追溯
每筆持股更新必記錄 source（screenshot/text/manual）與時間戳。
**Validates: Requirements 4.3, 10.1**

## Testing Strategy

- **手動 happy path 彩排**：截圖→解析→校驗→洞察→回覆，跑 3 次確保穩定（最優先）。
- **關鍵單元測試**（有餘力）：`normalizer.normalize`（糾錯、範圍外剔除）、`compliance_guard`（關鍵詞過濾）。
- **假資料備援驗證**：確認 Bedrock 不可用時文字輸入與寫死洞察仍可 demo。

---

## 為 6 小時做的取捨

- **接續不重建**：復用既有 Node/Fastify + Postgres + LINE + AgentCore，工程集中在「截圖匯入」與「洞察/推播」缺口。
- **不自建分析 pipeline**：直接查 `stock_summary_2025` 那一列當 evidence 餵給 AI。
- **不做真實推播排程**：demo 以 `POST /api/push/:userId` 手動觸發。
- **截圖解析走 Bedrock 多模態**（AgentCore 視覺能力未確認）；文字/對話走既有 AgentCore。
- **語音、激勵機制、多管道匯入、What-if** 皆列 P2 / 簡報帶過。
- **部署紀律**：改動經 git build → 新 release，不直接改線上 `releases/<ts>` 檔案。
