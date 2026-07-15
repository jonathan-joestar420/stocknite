# 進度記錄（單一真相來源）

> 目的：記錄「已完成 / 待辦」與關鍵事實，避免對話重置後遺失脈絡。
> 最後更新：2026-07-15（收斂整理）。搭配 `environment.md`、`design.md`、`requirements.md`、`tasks.md`。

## 🚀 新對話接手（先做這 3 步）
1. **讀狀態**：本檔（progress.md）+ `environment.md`（環境事實）+ `stocknite-repo/docs/`（對外整合）。
2. **要動雲端才需憑證**：`source /Users/dihung/Desktop/cmoney-aws-summit-hackathon/credential.txt` 再 `export AWS_DEFAULT_REGION=us-west-2`，用 `aws sts get-caller-identity` 驗證；過期就請使用者更新該檔。純改程式不需要。
3. **照慣例做事**：改 `stocknite-repo/` → `npm run build` → 打包(排除 node_modules/.git/src/docs) → base64 經 SSM → 跑 `deploy-ec2.sh`。動雲端一律走 SSM，暫存腳本用完即刪，金鑰不落地、不印出。詳見 `.kiro/steering/stocknite-ops.md`。

## TL;DR 現況
產品可完整 demo：
- **LINE bot**（@505qgibf）：匯入/查詢持股、個股查詢、自由問答走 AgentCore。
- **官網 https://stocknite.zzeric.com**：LINE 登入 → `/me` 看持股（損益）、AI 持股體檢（Bedrock）、每檔洞察儀表板（Chart.js）、右下角浮動 AI 助手（AgentCore）。
- **給同事的整合**：庫存 CRUD API（HTTP + x-agent-key），agent 每次都收得到 lineUserId。

## 一致性核對（2026-07-15）✅
- 本地 repo 與 `origin/main` 同步；EC2 上 dist 的 13 個 .js **sha256 與本地/GitHub 完全一致**（EC2 跑的就是 main）。
- EC2 env 齊全（LINE、AGENTCORE_ARN、AGENT_API_KEY、LINE_LOGIN_*、PUBLIC_BASE_URL、DATABASE_URL 皆非空；AGENTCORE_ENDPOINT/AUTH 刻意留空＝走 ARN）。
- DB `app_data.portfolio_holdings` 欄位：user_id, stock_code, quantity, average_cost, purchase_date, sold_price, updated_at。
- `/api/health`：`{database:true, lineConfigured:true, agentCoreConfigured:true}`。
- 已清除 release 目錄中 macOS 打包殘留的 `._*` 垃圾檔。

## 關鍵事實速查
- AWS 帳號 `116659181302`，region **us-west-2**。EC2 `i-0405f0c7e4bdae5c4`（只走 SSM）。
- 網站 `https://stocknite.zzeric.com`（Caddy+Let's Encrypt，DNS A→52.11.160.62）。
- App：Node/Fastify/TS，systemd `stocknite.service`，`127.0.0.1:3000`，`/opt/stocknite/current`。
- DB：Postgres `stocknite`，schema `market_data.*`(比賽資料) / `app_data.*`(users/portfolio_holdings/notification_settings)。
- LINE 官方帳號 `@505qgibf`；LINE Login channel id `2010719827`（與 bot 同 provider）。
- AI：AgentCore ARN `...runtime/stocknite_agent-wS1cOlE6o8`（qualifier DEFAULT）；Bedrock 後備模型 `us.anthropic.claude-haiku-4-5-20251001-v1:0` / `...sonnet-4-...`。
- **AGENT_API_KEY**（給同事 agent 呼叫庫存 API）：`a46d7506d22648b7c4a5eb6f2a889fb16a3f3eb065406fc1`。
- repo：`github.com/jonathan-joestar420/stocknite`（本地 `stocknite-repo/`）。

## 已完成 ✅
1. 環境盤點、LINE 憑證、IAM（Bedrock + AgentCore invoke）。
2. AI adapter：AgentCore(ARN) 為主、Bedrock 後備（可切換）、法遵護欄。
3. LINE bot：文字/截圖入口；持股 CRUD；「我的持股」易讀格式（含損益）。
4. HTTPS（Caddy）、webhook（active）、加好友頁。
5. 官網 LINE 登入 → `/me`：持股表（損益、紅漲綠跌、YYYY-MM-DD）。
6. AI 持股體檢（`/api/analyze`，Bedrock，限登入，Markdown 渲染）。
7. AI 助手浮動聊天室（`/api/assistant`，AgentCore，依 lineUserId，輸入中動畫，Markdown 渲染）。
8. 持股洞察儀表板（`/api/dashboard`）：每檔 股價+成本線 / 多空情緒趨勢（Chart.js）+ 指標列 + 名詞小抄 + 白話解讀（動態計算）。
9. **庫存 API（給 agent，做法2）**：`GET/POST(新增)/PUT(更新) /api/agent/holdings`，`x-agent-key` 驗證，`sold_price` 支援全賣出。
10. 文件（repo `docs/`）：`INTEGRATION_OVERVIEW.md`、`AGENT_INTEGRATION.md`、`HOLDINGS_API.md`。

## 待辦 / 待人工 ☐
- **同事的 agent** 依 `HOLDINGS_API.md` 接上庫存 API tool（帶 AGENT_API_KEY + lineUserId），才能真正做到「對話/截圖 → 寫入 DB」。
- demo 後輪換 LINE bot token、LINE Login secret、AGENT_API_KEY（皆曾經 SSM/對話傳遞）。
- （可選）AI 助手逐字串流（SSE）；市場/大盤總覽卡；已實現損益計算（需在賣出時保留賣出股數）。
- （可選）打包時用 `COPYFILE_DISABLE=1 tar` 避免 macOS `._*` 檔進 release。

## 部署方式（提醒）
本地改 `stocknite-repo/` → `npm run build` → 打包(排除 node_modules/.git/src/docs) → base64 經 SSM → 跑 `scripts/deploy-ec2.sh`。詳見 `.kiro/steering/stocknite-ops.md`。
