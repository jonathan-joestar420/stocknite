# 現有環境盤點（整合基準）

> 掃描日期：2026-07-14。此文件記錄 AWS 帳號 `116659181302` 內**同事已建置**的資源，作為調整計劃的事實基準。**我們的工作是在此之上延伸，不是重建。**

## AWS 帳號與存取

- 帳號：`116659181302`，登入角色 `WSParticipantRole/Participant`。
- **主要 region 是 `us-west-2`**（不是原計劃的 us-east-1）；資源都在 us-west-2。
- EC2 存取方式：**AWS Systems Manager Session Manager**（無公開 SSH；`session-manager-plugin` 本機已裝）。

## EC2 主機

- Instance：`i-0405f0c7e4bdae5c4`，`m8i.large`，Ubuntu 26.04，狀態 running，SSM Online。
- IAM 角色 `StockNiteSSMRole`：`AmazonSSMManagedInstanceCore` + inline `ReadStockNitePostgresCredentials`（Postgres 憑證存於 Secrets Manager）。
- 監聽埠：`127.0.0.1:3000`（Node app）、`127.0.0.1:5432`（Postgres）、`22`（sshd）。**3000/5432 僅綁 localhost** → 對外需反向代理/通道（見下方風險）。
- 無 Docker。

## 後端應用（已常駐運行）

- 路徑：`/opt/stocknite/current`（symlink → `releases/<timestamp>`），執行帳號 `stocknite`。
- 服務：systemd `stocknite.service`（`ExecStart=/usr/bin/node /opt/stocknite/current/dist/server.js`，`Restart=always`），環境檔 `/etc/stocknite/stocknite.env`。
- 技術棧：**Node.js 22 + Fastify 5.10 + TypeScript 7 + pg 8.22**（ESM，`"type":"module"`）。
- 原始碼結構：
  - `src/server.ts`（Fastify 路由總入口）
  - `src/config.ts`、`src/db.ts`、`src/web.ts`（landing page）
  - `src/services/market.ts`（`getStockSummary`/`getStockDailySnapshot`/`getStockHistory`/`getMarketSentiment`）
  - `src/services/portfolio.ts`（`listHoldings`/`upsertHolding`/`removeHolding`）
  - `src/line/{handler,client,menu,signature}.ts`
  - `src/agent/adapter.ts`（`invokeAgentCore`）
- 環境變數（`/etc/stocknite/stocknite.env`）— **目前狀態（2026-07-15）**：
  - `PORT=3000`、`HOST=127.0.0.1`、`DATABASE_URL`(有值)
  - `PUBLIC_BASE_URL=https://stocknite.zzeric.com`（已更新）
  - `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_ADD_FRIEND_URL=https://line.me/R/ti/p/@505qgibf`（**已設定**）
  - `AGENTCORE_ARN=arn:aws:bedrock-agentcore:us-west-2:116659181302:runtime/stocknite_agent-wS1cOlE6o8`（**已設定**，adapter 走此路徑）
  - `AGENTCORE_ENDPOINT`、`AGENTCORE_AUTH_TOKEN`：空（未使用，改用 ARN）
  - `/api/health` 實測：`{"status":"ok","database":true,"lineConfigured":true,"agentCoreConfigured":true}`
  - 註：`render-env.py` 會保留 env 內既有的額外 key（含 `AGENTCORE_ARN`、`BEDROCK_MODEL_ID`），故重新部署不會遺失。

### 已實作的 HTTP API
| Method | Path | 說明 |
|---|---|---|
| GET | `/` `/privacy` `/api/health` | landing / 隱私 / 健康檢查 |
| GET | `/api/line/menu` | LINE 選單按鈕 |
| GET | `/api/stocks/:code` `/:code/day?date=` `/:code/history?limit=` | 個股摘要/單日/歷史 |
| GET | `/api/market/sentiment` | 市場情緒 |
| GET/POST/DELETE | `/api/portfolio` `/api/portfolio/holdings` `/api/portfolio/holdings/:code` | 持股 CRUD（用 `x-line-user-id` header 辨識） |
| POST | `/api/agent/analyze` | 轉 AgentCore 分析 |
| POST | `/api/line/webhook` | LINE webhook（含簽章驗證） |

### LINE 現有行為（`line/handler.ts`）
- follow → 歡迎詞；`今日市場`/`市場情緒` → 市場情緒；`我的持股` → 列持股；`新增持股 <代號> <數量>` → upsert；純數字代號 → 個股摘要；其餘自由文字 → `invokeAgentCore`。
- **只處理 text 與 postback，尚未處理 image（截圖）訊息** ← 待補缺口。
- 無成本欄位輸入、無自然語言持股解析。

## PostgreSQL（DB: `stocknite`，資料已載入）

**市場資料（唯讀分析用）**
| 表 | 列數 | 對應 |
|---|---|---|
| `stock_summary_2025` | 300 | 09 寬表（每股一列成品）|
| `forum_posts_replies_daily_stats_2025` | 105,798 | 同學會情緒（獨家）|
| `price_valuation_2025` | 72,462 | 行情估值 |
| `institutional_trading_2025` | 72,462 | 法人動向 |
| `return_rate_2025` | 72,462 | 報酬率 |
| `distance_high_low_momentum_2025` | 64,478 | 距高低動能 |
| `dividend_ex_dividend_2025` | 289 | 股利除息 |
| `consecutive_dividend_stocks_2025` / `_etf_2025` | 266 / 34 | 連續配息 |
| `industry_classification_mapping` | 300 | 產業分類 |
| `field_dictionary_usage_notes` | 40 | 欄位字典 |

**Schema 配置**：資料分兩個 schema（非 public）：
- `market_data.*`：上述市場分析資料表。
- `app_data.*`：應用資料表（我們要填）。

**應用資料表實際 schema（已確認）**
```
app_data.users
  id             uuid   NOT NULL   -- PK
  line_user_id   text   NOT NULL
  portfolio_mode boolean NOT NULL
  consented_at   timestamptz NULL
  created_at     timestamptz NOT NULL
  updated_at     timestamptz NOT NULL

app_data.portfolio_holdings
  user_id      uuid    NOT NULL   -- FK → app_data.users.id（注意：是 uuid，不是 line_user_id）
  stock_code   text    NOT NULL
  quantity     numeric NOT NULL
  average_cost numeric NULL
  updated_at   timestamptz NOT NULL
  -- ⚠️ 尚無 source 欄位；KPI 若要記來源需 ALTER TABLE 補
```

**`market_data.stock_summary_2025` 欄位（29 欄，皆 text）**：
`stock_code, stock_name, market, industry, close_price, market_cap_billion, market_cap_weight_pct, pe_ratio_ttm, price_to_book, turnover_rate_pct, quarterly_return_pct, annual_return_pct, relative_annual_return_pct, dividend_yield_pct, institutional_net_buy_sell_20d, foreign_holding_pct, institutional_holding_pct, consecutive_dividend_years, latest_cash_dividend, payout_ratio_pct, latest_ex_dividend_date, forum_view_count, forum_viewer_count, year_high, year_low, ytd_return_pct, deviation_year_ma_pct, buy_point_percentile_pct, all_time_high_flag`

## AI：AgentCore（現行）+ Bedrock（後備）

- **現行**：`adapter.invokeAgentCore` 用 AWS SDK `InvokeAgentRuntime` 呼叫 AgentCore Runtime。
  - ARN：`arn:aws:bedrock-agentcore:us-west-2:116659181302:runtime/stocknite_agent-wS1cOlE6o8`，qualifier `DEFAULT`。
  - 契約：輸入 payload `{"prompt": "..."}`；輸出 `{"result": "..."}`（statusCode 200）。
  - 每位使用者用穩定 `runtimeSessionId`（`stocknite-<userId>`，>=33 字元）。
  - 權限：`StockNiteSSMRole` 的 inline policy `AgentCoreInvoke`（限該 ARN）。
- **後備**：`AGENTCORE_ARN` 未設時走 `invokeBedrock`（直接 Bedrock Claude）。
  - 模型（需 `us.` 前綴）：`us.anthropic.claude-haiku-4-5-20251001-v1:0`、`us.anthropic.claude-sonnet-4-20250514-v1:0`。
  - 權限：inline policy `BedrockInvokeForStockNite`。
- 舊版 HTTP endpoint（`AGENTCORE_ENDPOINT` + Bearer）仍保留為第二順位，目前未使用。

## S3

- `aic-cmoney-resource`：原始 CSV 資料包（11 檔）。
- `stocknite-market-staging-116659181302-us-west-2`：staging（目前空）。

## 部署方式（已確認）

- **機器上沒有 git repo**（`/opt/stocknite/current` 及全機皆無 `.git`，無 `gh` cli）。
- 部署為 **release 目錄式**：`/opt/stocknite/releases/<timestamp>/`，`current` symlink 指向最新；程式碼以打包上傳方式部署（非 git pull）。
- 改動流程：於本地/repo build 出 `dist/` → 上傳為新 release 目錄 → 切換 `current` symlink → `sudo systemctl restart stocknite`。需向同事索取其打包/上傳腳本。

## 網路與對外可達性（已確認）

- Public IP：`52.11.160.62`；Security Group `sg-0a92bd8d326d3d807 (launch-wizard-1)`。
- SG 入向：`80` 與 `443` 對 `0.0.0.0/0` 開放、`22` 限單一 IP、另有對單一 IP 全 TCP、icmp。
- **但 app 綁 `127.0.0.1:3000`，且 80/443 沒有任何服務在聽、無反向代理。** → 目前外界完全連不進來。
- LINE webhook 需要**有效 HTTPS**。目前缺 TLS/網域，需擇一補：nginx/caddy 反代 443→3000（含憑證）、或 tunnel（cloudflared/ngrok）、或 ALB+ACM。

## Bedrock（已確認）

- us-west-2 有多款**具影像輸入能力**的 Claude 可用：`claude-3-sonnet`、`claude-sonnet-4`、`claude-opus-4.x`、`claude-haiku-4-5` 等 → 截圖多模態解析可行。
- ⚠️ **EC2 instance role `StockNiteSSMRole` 只有 SSM + 讀 secret 權限，沒有 `bedrock:InvokeModel`。** 若要在 EC2 app 內直接呼叫 Bedrock，需先補此權限（或改由具權限的憑證/代理呼叫）。

## 待補缺口與狀態

> 進度總表見 `progress.md`。以下為基礎設施項目狀態。

1. ✅ **LINE 憑證已設定**：`lineConfigured:true`。⚠️ 密鑰曾經 SSM 傳遞，demo 後建議輪換並改用 Secrets Manager。
2. ✅ **AI 已切換到 AgentCore Runtime**（ARN，見上節），Bedrock 為後備。
3. ✅ **對外 HTTPS 已完成**：Caddy + Let's Encrypt，`https://stocknite.zzeric.com`（DNS A → 52.11.160.62）。安裝腳本 `scripts/setup-caddy.sh`。
4. ✅ **LINE webhook URL 已設定**：`https://stocknite.zzeric.com/api/line/webhook`，連通測試通過。**唯一待人工**：LINE Console 開「Use webhook」ON。
5. ✅ **IAM 權限已補**：`BedrockInvokeForStockNite`（Bedrock invoke）、`AgentCoreInvoke`（AgentCore invoke，限該 ARN）。
6. ☐ **截圖匯入未實作**：`line/handler.ts` image 事件 + `importer` 影像解析（tasks 4、7）。
7. ☐ **持股表無 `source` 欄位**：KPI 需 `ALTER TABLE app_data.portfolio_holdings ADD COLUMN source text`。
8. ☐ **六件事洞察引擎 / 情緒×法人推播 / Web 體檢 / KPI**：尚未開發（tasks 8、9、13、14）。
