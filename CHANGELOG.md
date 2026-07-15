# 更新日誌

本專案依照 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式記錄重要變更。StockNite 目前是 private Hackathon 專案，版本號沿用 `0.1.0`。

## [Unreleased]

### 尚未完成

- 正式付款與儲值驗證。
- Credit 強制扣點正式啟用。
- 07:00 晨報排程。
- 完整台股庫存確認與歷史交易流程。

## [0.1.0] - 2026-07-16

### Added

- Hybrid semantic router：明確與寫入指令走 deterministic fast path；其他自然文字由 Claude Haiku 4.5 分類成白名單 intent。
- Amazon Bedrock JSON Schema structured output、信心門檻、timeout、併發上限與 circuit breaker。
- 自然語句與常見同音輸入支援，例如「存孤」、「存古」、「存骨」及「你能做什麼」。
- Conversation service，統一 LINE 與網站 assistant 的意圖執行和回覆。
- Credit ledger、每日簽到、10／30／100 點 demo 儲值、AI 扣點及失敗退款。
- 登入後持股儀表板、股票摘要、歷史行情、論壇情緒及 Agent tool APIs。
- 可重複執行的 `scripts/deploy-via-ssm.sh` 與 EC2 release/rollback 流程。
- `npm run test:semantic-live`，使用真實 Haiku 執行 bounded intent 評估資料集。

### Changed

- 固定回覆改為較自然的股奈語氣，並提供下一步可操作選項。
- LINE 的市場、股票與設定文字改由 conversation service 統一格式，不再直接顯示 raw JSON。
- 未知自然文字不再只靠持續擴充 regex；Haiku 僅負責分類，最終回覆與執行仍由後端控制。
- README 補上 semantic router、Credit、環境變數、測試和 production 部署說明。

### Security

- Semantic classifier 不接收 LINE user ID 或持股資料，也不能直接新增持股、儲值或寫入 Credit ledger。
- 自然簽到語句只回確認提示；使用者必須明確回覆「我要簽到」才會寫入 ledger。
- 模型擷取的股票代號必須實際出現在原始訊息中。
- `credit_ledger` 對應用程式角色維持 append-only：允許 `SELECT`／`INSERT`，禁止 `UPDATE`／`DELETE`／`TRUNCATE`。
- 部署流程驗證 AWS account、exact commit manifest、migration、ledger 權限、內外 health，失敗時自動 rollback。

### Validation

- TypeScript typecheck 與 production build 通過。
- 自動化測試 `29/29` 通過。
- 真實 Haiku semantic evaluation `12/12` 通過。
- Production semantic canary 驗證 `存孤`、`你能做什麼？` 與自然簽到問法。
- Production release `20260715190856`，應用程式 commit `9a478c0`。
