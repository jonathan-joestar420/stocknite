# 股奈 StockNite — 雲端與操作慣例（Ops Runbook）

> 此檔為 steering（自動載入）。目的：新對話開始時，Kiro 立即知道如何進入雲端環境、機器、DB，以及既定工作習慣。

## 🚀 新對話接手：先做這 3 步
1. **讀狀態**：先讀 `.kiro/specs/stocknite-mvp/progress.md`（做到哪、待辦、金鑰）與 `environment.md`（EC2/DB/AI/網路事實）；程式在 `stocknite-repo/`，對外整合看 `stocknite-repo/docs/`。
2. **要動雲端才需要憑證**：跟使用者要當次臨時 AWS 憑證（見「雲端存取」）；純改程式不需要。
3. **照慣例做事**：改程式在 `stocknite-repo/` → build → 打包(排除 node_modules/.git/src/docs) → base64 經 SSM → 跑 `deploy-ec2.sh`（見「部署流程」）。動雲端一律走 SSM，暫存腳本用完即刪。

## 專案一句話
CMoney AWS Hackathon 作品「股奈 StockNite」：LINE 投資陪伴 bot。**開發以 `stocknite-repo/`（Node/Fastify/TS）為主**，跑在 AWS EC2 上，**本地不使用 Docker**（相關檔案已移除）。

## 雲端存取
- 帳號 `116659181302`，**region 一律 `us-west-2`**（本專案所有資源都在 us-west-2）。
- **AWS 臨時憑證放在 `/Users/dihung/Desktop/cmoney-aws-summit-hackathon/credential.txt`**（`export AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN`）。要跑 AWS/SSM 指令時就 `source` 它：
  ```bash
  source /Users/dihung/Desktop/cmoney-aws-summit-hackathon/credential.txt
  export AWS_DEFAULT_REGION=us-west-2   # 檔內預設是 us-east-1，務必覆蓋成 us-west-2
  aws sts get-caller-identity           # 驗證是否有效
  ```
- 憑證是**臨時的會過期**：若 `sts get-caller-identity` 失敗（Expired/InvalidToken），請使用者更新 `credential.txt` 內容後再試。
- 安全鐵則：**絕不**把 `credential.txt` 或金鑰值提交到 git、寫進 repo/specs/docs、或印回訊息；`credential.txt`、`hackathon-key.pem` 皆為機密。EC2 一律走 SSM（不用 SSH key）。

## EC2 機器
- Instance：`i-0405f0c7e4bdae5c4`（Ubuntu 26.04，us-west-2）。**只用 SSM 進入，無公開 SSH。**
- App：Node/Fastify/TS，systemd 服務 `stocknite.service`，綁 `127.0.0.1:3000`，程式在 `/opt/stocknite/current`（→ `releases/<ts>`）。
- 對外：Caddy 反代 `https://stocknite.zzeric.com`（Let's Encrypt）。Public IP `52.11.160.62`，SG `sg-0a92bd8d326d3d807`（80/443 開放）。

## 在機器上執行指令（慣例）
- 用 **SSM `send-command`（Document `AWS-RunShellScript`）** 送指令，再輪詢 `get-command-invocation` 取結果。SSM 指令以 root 執行。
- **短指令**：直接放進 `commands` 陣列（注意 JSON 需合法；整包 < 100KB）。
- **長腳本 / 複雜內容**：不要硬塞。做法二選一：
  1. 把腳本寫進 `stocknite-repo/scripts/`，**base64 編碼後用「一條」SSM 指令送上去**（`cat > /tmp/x.b64 <<'EOF' ... EOF; base64 -d > /tmp/x.sh; bash /tmp/x.sh`）。
  2. 或部署整包（見下方部署流程）。
- 產生 SSM params JSON 時，**用 Python 腳本寫檔**（避免 shell heredoc 在多行/引號時互相污染）。
- 小地雷：對「以 `.` 開頭的檔名」用 fs_write 偶爾寫出空檔；寫關鍵檔後最好驗證大小/內容。

## PostgreSQL
- DB `stocknite`（Postgres 18，`127.0.0.1:5432`）。憑證在 Secrets Manager（`stocknite/postgres/credentials`），由部署腳本 render 進 env。
- 查詢用 SSM：`sudo -u postgres psql -d stocknite -c "..."`。
- Schema：`market_data.*`（市場資料，已載入）、`app_data.*`（`users` / `portfolio_holdings` / `notification_settings`）。欄位細節見 `environment.md`。

## 部署流程（改動上線）
1. 在本地 `stocknite-repo/` 改程式 → `npm run build`（產生 `dist/`）。
2. 打包：`tar czf /tmp/stocknite-pkg.tgz --exclude=node_modules --exclude=.git --exclude=.env .`
3. base64 → 用一條 SSM 指令寫到 EC2 `/tmp` 解開。
4. 執行 `sudo AWS_REGION=us-west-2 bash /tmp/snpkg/scripts/deploy-ec2.sh /tmp/snpkg`。
   - 腳本會：`npm ci --omit=dev`、用 `render-env.py` 產生 env（**會保留既有額外 key**，如 `AGENTCORE_ARN`）、套 `sql/001_app_data.sql`、切 `current` symlink、重啟服務、health check、清舊 release。
- **不要直接編輯線上 `releases/<ts>`**。改動一律走 repo → build → 部署。
- 我方對 repo 的修改**尚未 push 到 GitHub**（`github.com/jonathan-joestar420/stocknite`）；提醒使用者 commit/push，否則同事重部署會覆蓋。

## LINE
- 官方帳號 `@505qgibf`，加好友 `https://line.me/R/ti/p/@505qgibf`。
- webhook：`https://stocknite.zzeric.com/api/line/webhook`（已設定）。憑證在 env（`LINE_CHANNEL_SECRET/ACCESS_TOKEN`）。
- 設定/測試 webhook 可用 LINE API（token 從 EC2 env 讀，不要落地到本地）。

## AI
- 現行走 **AgentCore Runtime**（SDK `InvokeAgentRuntime`）：ARN `arn:aws:bedrock-agentcore:us-west-2:116659181302:runtime/stocknite_agent-wS1cOlE6o8`，qualifier `DEFAULT`；契約 `{"prompt":...}` → `{"result":...}`。
- 後備：直接 Bedrock（`AGENTCORE_ARN` 空時）。模型需 **`us.` inference profile 前綴**：`us.anthropic.claude-haiku-4-5-20251001-v1:0`、`us.anthropic.claude-sonnet-4-20250514-v1:0`。
- 所有 AI 呼叫統一經 `src/agent/adapter.ts` 的 `invokeAgentCore`，勿在他處直接呼叫。

## 合規紅線（永遠遵守）
- AI 輸出不得有投資建議/買賣指令字眼；只給洞察/體檢/提醒 + 免責聲明。
- 時間基準固定 2025/12/31；僅用 300 檔示範股。
- 不得把真實財務個資寫入 AWS；demo 用示範資料。
