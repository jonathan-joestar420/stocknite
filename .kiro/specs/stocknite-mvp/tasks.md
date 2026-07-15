# Implementation Plan: 股奈 StockNite MVP（6 小時 · 整合既有環境）

## Overview

> **進度總表見 `progress.md`（單一真相來源）。**
>
> **已完成（基礎設施）**：SSM 存取、部署流程、LINE 憑證、AgentCore 切換、對外 HTTPS(Caddy)、webhook URL、加好友頁、IAM 權限。**LINE→AI 對話已上線可用**（僅待 LINE Console 開「Use webhook」）。
> **剩餘開發重點**：①LINE 截圖匯入 ②六件事洞察引擎 ③情緒×法人推播 ④KPI/Web 體檢。
>
> 優先級：**P0 = 沒它 demo 就死**、**P1 = 加分/故事完整**、**P2 = 有餘力/簡報帶過**。
> 分工建議：A=LINE&後端整合、B=Bedrock/AI 洞察、C=資料&簡報。

## Task Dependency Graph

```
階段0（對接確認）: 任務1,2,3 ──┐
                              ├─▶ 任務4(importer) ─┐
任務3(300對照/normalizer) ────┘                    │
                                                   ├─▶ 任務7(handler接image) ─▶ 任務11 ─▶ 任務12
任務5(portfolio擴充source) ────────────────────────┤
任務6(compliance) ─▶ 任務8(portfolio insight) ─────┘

P1: 任務8 ─▶ 任務9(事件推播)、任務10(對話問答)、任務13(Web體檢)、任務14(KPI)
P2: 任務15–17（獨立）
```

- 關鍵路徑：`1,2,3 → 4 → 7 → 11 → 12`。
- 可平行：任務 2/3；任務 4/5/6 可分派不同人。

```json
{
  "waves": [
    { "wave": 1, "tasks": [1, 2, 3], "description": "SSM 對接、確認 schema/部署流程、建 300 檔對照與 normalizer" },
    { "wave": 2, "tasks": [4, 5, 6], "description": "Bedrock 影像 importer、portfolio 擴充 source、法遵護欄（可平行）" },
    { "wave": 3, "tasks": [7, 8], "description": "handler 接 image 事件、六件事洞察引擎" },
    { "wave": 4, "tasks": [11], "description": "P0 截圖匯入全流程串接" },
    { "wave": 5, "tasks": [9, 10, 13, 14], "description": "P1：事件推播、對話問答、Web 體檢、KPI（可平行）" },
    { "wave": 6, "tasks": [12], "description": "穩定化與 demo 彩排" },
    { "wave": 7, "tasks": [15, 16, 17], "description": "P2 有餘力才做" }
  ]
}
```

## Tasks

### 階段 0：對接與確認（0:00–0:40）

- [x] 1. 建立對機器的存取與部署共識 ✅
  - SSM 存取 OK；repo `github.com/jonathan-joestar420/stocknite`（本地 `stocknite-repo/`）；部署走 `scripts/deploy-ec2.sh`（base64 經 SSM 送包 → 跑腳本）
  - 對外可達性已解決：Caddy + HTTPS `https://stocknite.zzeric.com`
  - _Requirements: 全域_

- [x] 2. 確認 AI 與資料現況 ✅
  - 已切換到 AgentCore Runtime（ARN，契約 `{prompt}`→`{result}`），Bedrock 為後備；可用模型 id 已確認（`us.` 前綴）
  - _Requirements: 5.1, 7.1_

- [~] 3. 確認/補齊持股 schema 與 300 檔對照（部分完成）
  - ✅ 已確認 `app_data.users` / `app_data.portfolio_holdings` 欄位（見 environment.md）
  - ☐ 尚未加 `source` 欄位；☐ 尚未建 300 檔 `代號↔名稱` 對照（normalizer 用）
  - _Requirements: 3.1, 4.1, 4.3_

### 階段 1：核心缺口 — 截圖匯入（0:40–3:00，P0）

- [ ] 4. ★新增 `src/import/importer.ts`（B）
  - `parseImage(buffer)`：呼叫 Bedrock 多模態（`@aws-sdk/client-bedrock-runtime`），套用截圖解析 prompt → 嚴格 JSON 陣列；失敗重試一次
  - `parseText(text)`：擴充既有 regex，支援「代號 股數 成本」；複雜句改呼叫 Bedrock
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1_

- [ ] 5. ★新增 `src/import/normalizer.ts`（B/C）
  - `normalize(holdings)`：代號優先、名稱模糊比對、自動糾錯；範圍外標的標記 unsupported 並排除
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [ ] 6. 擴充 `src/services/portfolio.ts` 記錄來源（A）
  - `upsertHolding` 增加 `source` 與 `updated_at`；支援批次 upsert 多筆
  - 寫入 `event_log`（import 事件）供 KPI
  - _Requirements: 4.2, 4.3, 4.4, 10.1_

- [ ] 7. 擴充 `src/line/handler.ts` 處理 image 事件（A）
  - `event.message.type === "image"` → 用 `line/client.ts` 取得圖片內容 → `importer.parseImage` → `normalizer` → 批次 `upsertHolding(source=screenshot)`
  - 回覆「已匯入 N 檔 ✅」+ 一則洞察；解析失敗提示改用文字
  - _Requirements: 1.1, 1.4, 1.5_

- [ ] 8. ★新增法遵護欄與六件事洞察（B）
  - `src/insight/compliance.ts`：system prompt 前綴 + 關鍵詞後處理過濾
  - `src/insight/engine.ts` `generatePortfolioInsight`：組 evidence（09 寬表 + 情緒）→ AgentCore/Bedrock → 六件事洞察；無成本亦可產出
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.1_

### 階段 2：串接與加分（3:00–4:30）

- [ ] 11. 串接 P0 截圖匯入全流程（A+B，P0）
  - LINE 傳圖 → 解析 → 校驗 → upsert → 洞察 → 回覆，端到端跑通
  - 新增 `POST /api/import`（Web 共用同流程）
  - _Requirements: 1.4, 4.3, 5.3_

- [ ] 9. 情緒 × 法人 事件推播（B，P1）
  - `engine.generateEventInsight`：結合同學會多空聲量與法人買賣超，偵測分歧 → 好奇缺口訊息
  - `POST /api/push/:userId` 以 LINE push 送出；記錄 push_sent
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.2_

- [~] 10. AI 對話問答（B，P1）（大部分完成）
  - ✅ LINE 自由文字 → `invokeAgentCore`（AgentCore Runtime），已帶使用者持股為 evidence + 法遵護欄；實測回應正常
  - ☐ 尚未記錄 qa 互動（KPI）
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.3_

- [ ] 13. Web 體檢展示頁（C/A，P1）
  - 擴充 `web.ts` landing / 新頁：載入示範持股 → 六件事體檢 + 產業配置可視化；共用 `/api/import`、`/api/insight`
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 14. 隱私說明與 KPI 彙總（A/C，P1）
  - 首次匯入顯示隱私說明（既有 `/privacy` 可延伸）
  - `GET /api/kpi`：匯入來源分佈、推播、問答次數
  - _Requirements: 9.3, 10.1, 10.2, 10.3, 10.4_

### 階段 3：收尾與彩排（4:30–6:00）

- [ ] 12. Happy path 穩定化 + demo 彩排（P0）
  - 完整跑通截圖匯入→洞察→事件推播→追問；修 bug
  - 備援：Bedrock 不穩時走文字輸入 + 寫死洞察；準備示範持股（限 300 檔內）
  - 簡報：TA、不願輸入的真正原因(信任/隱私)+解方、低門檻輸入與回訪、KPI、技術架構圖與資料運用；彩排 3 次
  - _Requirements: 全域_

### P2（有餘力才做，否則簡報帶過）

- [ ] 15. 語音輸入轉文字（_Requirements: 2.2_）
- [ ] 16. 更新持股/邀好友換 AI 額度的激勵機制
- [ ] 17. 其他匯入管道（集保 e 存摺 / 對帳單 email）、What-if 模擬

## Notes

- **整合基準**：詳見 `environment.md`。技術棧為 Node/Fastify/TS + Postgres + AgentCore + Bedrock 多模態，**非** 原稿的 Python/SQLite。
- **不重建原則**：`services/`、`line/`、`agent/adapter.ts`、Postgres 資料皆沿用；我們只加 `import/`、`insight/` 與 handler 的 image 分支。
- **部署紀律**：改動經 git build → 新 release，不直接編輯線上 `releases/<ts>`。
- **demo 保命**：先確保任務 11（截圖匯入）跑通；截圖不穩以任務 4 的文字解析備援。
- **法遵**：任務 8 護欄必須在任何對外輸出前套用。
- **資料界線**：全程僅用 300 檔示範股與 2025/12/31 時點。
