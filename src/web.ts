import { config } from "./config.js";

export function landingPage(): string {
  return `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>股奈 StockNite｜AI 投資陪伴，存好股睡好覺</title>
<meta name="description" content="股奈 StockNite 是 CMoney × AWS Hackathon 作品：用 LINE 與 AI 幫你記錄持股、體檢風險、看懂市場資料。只給洞察與提醒，不預測明牌。">
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#101d2e;--panel2:#0a1626;--line:#1c2b3f;--txt:#f4f7fa;--mut:#a8b3c2;--acc:#7ee0b5;--line-green:#00c300}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;background:var(--bg);color:var(--txt);line-height:1.7}
a{color:var(--acc)}
.wrap{max-width:1040px;margin:auto;padding:0 24px}
.nav{display:flex;justify-content:space-between;align-items:center;padding:20px 0}
.nav .brand{font-weight:800;color:var(--acc);font-size:20px;letter-spacing:.5px}
.nav a.login{background:var(--line-green);color:#fff;padding:9px 16px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px}
.btn{display:inline-block;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px}
.btn.primary{background:var(--acc);color:#07111f}
.btn.line{background:var(--line-green);color:#fff}
.btn.ghost{background:transparent;color:var(--txt);border:1px solid var(--line)}
.hero{text-align:center;padding:56px 0 40px}
.badge{display:inline-block;font-size:13px;color:var(--acc);border:1px solid #274a3c;background:#0c1f19;border-radius:999px;padding:5px 14px;margin-bottom:20px}
.hero h1{font-size:clamp(2.8rem,8vw,5rem);margin:.1em 0;color:var(--acc);letter-spacing:1px}
.hero .tag{font-size:clamp(1.4rem,4vw,2.2rem);margin:.2em 0;font-weight:700}
.hero p{color:var(--mut);max-width:620px;margin:16px auto 26px}
.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.meta{color:#6f7f92;font-size:13px;margin-top:22px}
.meta b{color:var(--mut);font-weight:600}
section.block{padding:40px 0;border-top:1px solid var(--line)}
h2.sec{font-size:26px;color:var(--acc);margin:0 0 6px}
.sub{color:var(--mut);margin:0 0 24px;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.card{background:var(--panel);padding:22px;border-radius:16px;border:1px solid var(--line)}
.card .ico{font-size:22px}
.card h3{margin:8px 0 6px;font-size:17px;color:var(--txt)}
.card p{margin:0;color:var(--mut);font-size:14px}
.flow{display:flex;align-items:stretch;gap:12px;flex-wrap:wrap;margin:8px 0 22px}
.flow .node{flex:1;min-width:150px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;text-align:center}
.flow .node b{display:block;color:var(--acc);font-size:14px;margin-bottom:4px}
.flow .node span{color:var(--mut);font-size:12.5px}
.flow .arrow{align-self:center;color:#4a5f78;font-size:20px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.chip{background:var(--panel2);border:1px solid var(--line);color:#b7c3d2;font-size:12.5px;border-radius:999px;padding:5px 12px}
.data{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.data .d{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.data .d b{color:var(--txt);font-size:14px}
.data .d span{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.vision{background:linear-gradient(180deg,#0c1a2b,#0a1626);border:1px dashed #2c4257;border-radius:16px;padding:22px}
.vision ul{margin:8px 0 0;padding-left:1.1em;color:var(--mut)}
.vision li{margin:6px 0}
.vtag{display:inline-block;font-size:12px;color:#ffcf6b;border:1px solid #5a4a1f;background:#1c160a;border-radius:999px;padding:3px 10px;margin-left:8px}
.finale{text-align:center;padding:48px 0}
.finale h2{border:0}
.note{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;color:var(--mut);font-size:13.5px;margin-top:22px}
footer{border-top:1px solid var(--line);padding:26px 0 48px;color:#6f7f92;font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
</style></head><body>
<div class="wrap">
  <nav class="nav">
    <div class="brand">🌙 股奈 StockNite</div>
    <a class="login" href="/auth/line/login">LINE 登入 Demo</a>
  </nav>

  <header class="hero">
    <span class="badge">CMoney × AWS Hackathon 作品｜LINE 投資陪伴 × AI</span>
    <h1>股奈 StockNite</h1>
    <div class="tag">存好股，睡好覺。</div>
    <p>用 AI 幫你記錄持股、體檢風險、看懂市場資料。<br>只給客觀洞察與提醒，不預測明牌、不給買賣建議。</p>
    <div class="cta">
      <a class="btn line" href="${config.lineAddFriendUrl}">用 LINE 加入好友</a>
      <a class="btn primary" href="/auth/line/login">登入看我的持股（Demo）</a>
    </div>
    <div class="meta"><b>示範資料截至 2025-12-31</b>　·　台股 300 檔示範標的　·　分析僅供參考，不構成投資建議</div>
  </header>

  <section class="block">
    <h2 class="sec">產品亮點</h2>
    <p class="sub">從 LINE 對話到網站儀表板，一條龍幫你把持股與市場資料看清楚。</p>
    <div class="grid">
      <article class="card"><div class="ico">💬</div><h3>LINE 對話即記帳</h3><p>用自然語言說「我買了台積電 1 張、成本 900」，或直接上傳持股截圖，AI 解析後先跟你確認再存檔。</p></article>
      <article class="card"><div class="ico">📊</div><h3>持股損益一目了然</h3><p>登入網站看每檔的成本、市值、損益與佔比；賣出後自動轉為「過去持有」並計算已實現損益。</p></article>
      <article class="card"><div class="ico">🩺</div><h3>AI 持股體檢</h3><p>一鍵用 Amazon Bedrock 上的 Claude，針對你的持股＋CMoney 歷史數據做整體健檢（估值、股利、籌碼、集中度、情緒）。</p></article>
      <article class="card"><div class="ico">📈</div><h3>洞察儀表板</h3><p>每檔的股價／成本走勢、社群多空情緒、估值與法人籌碼；再加上組合層級的產業分布與集中度指標。</p></article>
      <article class="card"><div class="ico">🤖</div><h3>隨身 AI 助手</h3><p>網站右下角隨時開聊，問你自己的持股或市場近況，回覆依你的實際庫存量身作答。</p></article>
      <article class="card"><div class="ico">🛡️</div><h3>合規優先</h3><p>只提供客觀資料解讀與風險提醒，不出現買賣指令，每則回覆都附上免責聲明。</p></article>
    </div>
  </section>

  <section class="block">
    <h2 class="sec">運作方式與架構</h2>
    <p class="sub">兩個入口（LINE 與網站）共用同一套後端與 AI，身份以 LINE 帳號貫穿。</p>
    <div class="flow">
      <div class="node"><b>你</b><span>LINE 官方帳號 / 網站（LINE 登入）</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>股奈後端</b><span>Node · Fastify · TypeScript<br>AWS EC2 + Caddy（HTTPS）</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>AI 大腦</b><span>Amazon Bedrock AgentCore 多代理<br>＋ Claude（對話／體檢）</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>資料</b><span>PostgreSQL<br>CMoney 市場資料 + 你的持股</span></div>
    </div>
    <p class="sub" style="margin-bottom:8px">技術與服務</p>
    <div class="chips">
      <span class="chip">LINE Messaging / Login API</span>
      <span class="chip">AWS EC2</span>
      <span class="chip">Caddy · Let's Encrypt</span>
      <span class="chip">Amazon Bedrock AgentCore</span>
      <span class="chip">Claude Sonnet / Haiku</span>
      <span class="chip">PostgreSQL</span>
      <span class="chip">Chart.js</span>
    </div>
  </section>

  <section class="block">
    <h2 class="sec">資料來源：CMoney 資料集</h2>
    <p class="sub">以 CMoney 提供的台股 300 檔示範資料為基礎（時間基準 2025-12-31）。</p>
    <div class="data">
      <div class="d"><b>行情與估值</b><span>收盤、本益比、股價淨值比、周轉率</span></div>
      <div class="d"><b>法人買賣超</b><span>外資／投信／自營商、持股比例</span></div>
      <div class="d"><b>報酬與動能</b><span>季／年報酬、距年高低、距年線乖離</span></div>
      <div class="d"><b>股利與配息</b><span>殖利率、連續配息年數、配息率</span></div>
      <div class="d"><b>產業分類</b><span>產業別對應與組合分布</span></div>
      <div class="d"><b>社群情緒（獨家）</b><span>同學會多空討論則數與趨勢</span></div>
    </div>
  </section>

  <section class="block">
    <h2 class="sec">產品願景 <span class="vtag">尚未上線</span></h2>
    <p class="sub">目前 demo 尚未包含以下功能，是我們接下來想做的方向。</p>
    <div class="vision">
      <ul>
        <li><b>每日晨報推播</b>：每天早上 07:00，只推跟你持股相關的重點整理。</li>
        <li><b>主動提醒</b>：當你的持股出現「社群情緒 × 法人動向」的明顯變化時主動通知。</li>
        <li><b>更多標的與更即時的行情</b>：從 300 檔示範資料擴大到更完整、更即時的市場涵蓋。</li>
        <li><b>存股目標與個人化通知設定</b>：設定目標、追蹤進度、自訂提醒時間。</li>
      </ul>
    </div>
  </section>

  <div class="finale">
    <h2 class="sec">準備好了嗎？</h2>
    <p class="sub">用 LINE 登入，立刻看你的持股體檢與洞察儀表板。</p>
    <div class="cta">
      <a class="btn primary" href="/auth/line/login">登入開始 Demo</a>
      <a class="btn ghost" href="${config.lineAddFriendUrl}">先加 LINE 好友</a>
    </div>
    <div class="note">合規說明：股奈只在你確認後保存持股，並可要求刪除。所有分析僅為客觀資料解讀與風險提醒，<b>不構成投資建議</b>。示範資料時間基準為 2025-12-31。</div>
  </div>

  <footer>
    <span>© 股奈 StockNite · CMoney × AWS Hackathon</span>
    <span><a href="/privacy">隱私權說明</a></span>
  </footer>
</div>
</body></html>`;
}

type HoldingRow = {
  stock_code: string; stock_name?: string | null;
  quantity?: string | number | null; average_cost?: string | number | null;
  purchase_date?: string | null; close_price?: string | number | null;
  market_value?: string | number | null; weight?: string | number | null;
  sold_price?: string | number | null; sold_quantity?: string | number | null;
  sold_date?: string | null;
};

/** 已實現損益 =（賣出價 − 成本）× 賣出股數；資料不足回 null。 */
function realizedPnl(h: HoldingRow): { amount: number; pct: number } | null {
  const cost = Number(h.average_cost);
  const soldPrice = Number(h.sold_price);
  const soldQty = Number(h.sold_quantity);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(soldPrice) ||
      !Number.isFinite(soldQty) || soldQty <= 0) return null;
  const basis = cost * soldQty;
  const amount = (soldPrice - cost) * soldQty;
  return { amount, pct: basis ? (amount / basis) * 100 : 0 };
}

/** 產生「過去持有」區塊 HTML（已賣出的部位）。 */
function pastHoldingsSection(sold: HoldingRow[]): string {
  if (!sold.length) return "";
  const rows = sold.map((h) => {
    const pl = realizedPnl(h);
    const plCell = pl
      ? `<td class="num ${pl.amount >= 0 ? "up" : "down"}">${pl.amount >= 0 ? "+" : ""}${fmt(pl.amount)}<br><small>${pl.amount >= 0 ? "+" : ""}${pl.pct.toFixed(1)}%</small></td>`
      : `<td class="num"><small>待輸入賣價</small></td>`;
    const soldPriceVal = h.sold_price != null && h.sold_price !== "" ? fmt(h.sold_price, 2) : "—";
    const soldDateVal = h.sold_date ? ymd(h.sold_date) : "—";
    const code = String(h.stock_code);
    return `<tr>
      <td>${h.stock_name ?? ""}<small> ${code}</small></td>
      <td class="num">${fmt(h.sold_quantity)}</td>
      <td class="num">${fmt(h.average_cost, 2)}</td>
      <td class="num">${soldPriceVal}</td>
      <td class="num">${soldDateVal}</td>
      ${plCell}
      <td class="num">
        <div class="soldform">
          <input id="sp_${code}" type="number" step="0.01" min="0" placeholder="賣價" value="${h.sold_price != null && h.sold_price !== "" ? Number(h.sold_price) : ""}"/>
          <input id="sd_${code}" type="date" value="${h.sold_date ? ymd(h.sold_date) : ""}"/>
          <button class="btn small" onclick="saveSold('${code}')">儲存</button>
        </div>
      </td>
    </tr>`;
  }).join("");
  return `<h2 style="margin-top:28px;color:#8894a3">過去持有（已賣出）</h2>
<small>已賣出的部位不再顯示於上方持股與走勢分析。補上賣出價與賣出日即可計算已實現損益。</small>
<table>
<tr><th>股票</th><th class="num">賣出股數</th><th class="num">成本</th><th class="num">賣出價</th><th class="num">賣出日</th><th class="num">已實現損益</th><th class="num">補登賣出</th></tr>
${rows}</table>`;
}

function fmt(v: unknown, digits = 0): string {
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function ymd(v: unknown): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}

function pnlOf(h: HoldingRow): { amount: number; pct: number } | null {
  const cost = Number(h.average_cost);
  const qty = Number(h.quantity);
  const mv = Number(h.market_value);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(qty) || !Number.isFinite(mv)) return null;
  const basis = cost * qty;
  return { amount: mv - basis, pct: basis ? ((mv - basis) / basis) * 100 : 0 };
}

function pnlCell(pl: { amount: number; pct: number } | null): string {
  if (!pl) return `<td class="num">—</td>`;
  const cls = pl.amount >= 0 ? "up" : "down";
  const sign = pl.amount >= 0 ? "+" : "";
  return `<td class="num ${cls}">${sign}${fmt(pl.amount)}<br><small>${sign}${pl.pct.toFixed(1)}%</small></td>`;
}

export function portfolioPage(holdings: HoldingRow[], displayName?: string): string {
  // 只把「持有中」（quantity>0）放到主頁；已賣出（quantity=0）進「過去持有」。
  const active = holdings.filter((h) => (Number(h.quantity) || 0) > 0);
  const sold = holdings.filter((h) => (Number(h.quantity) || 0) <= 0);
  const total = active.reduce((s, h) => s + (Number(h.market_value) || 0), 0);
  const totalBasis = active.reduce(
    (s, h) => s + (pnlOf(h) ? Number(h.average_cost) * Number(h.quantity) : 0), 0);
  const totalPl = totalBasis ? total - totalBasis : null;
  const totalPct = totalPl !== null && totalBasis ? (totalPl / totalBasis) * 100 : 0;
  const rows = active.map((h) => `<tr>
    <td>${h.stock_name ?? ""}<small> ${h.stock_code}</small></td>
    <td class="num">${fmt(h.quantity)}</td>
    <td class="num">${fmt(h.average_cost, 2)}</td>
    <td class="num">${ymd(h.purchase_date)}</td>
    <td class="num">${fmt(h.close_price, 2)}</td>
    <td class="num">${fmt(h.market_value)}</td>
    ${pnlCell(pnlOf(h))}
    <td class="num">${h.weight ? (Number(h.weight) * 100).toFixed(1) + "%" : "—"}</td>
  </tr>`).join("");
  const empty = `<p>你目前沒有持有中的部位。到 LINE 傳一張持股截圖或輸入「今天買了台積電50股 成本2400 買進日2025-12-30」即可匯入。</p>`;
  return `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>我的持股｜股奈 StockNite</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#07111f;color:#f4f7fa}
body{margin:0}.wrap{max-width:960px;margin:auto;padding:40px 20px}
h1{color:#7ee0b5;margin:.2em 0}small{color:#8894a3}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
th,td{padding:10px 8px;border-bottom:1px solid #1c2b3f;text-align:left}
th{color:#a8b3c2;font-weight:600}.num{text-align:right}
.up{color:#ff6b6b}.down{color:#51cf66}
.total{margin-top:16px;font-size:18px}.total b{color:#7ee0b5}
a{color:#7ee0b5}.top{display:flex;justify-content:space-between;align-items:center}
.card{background:#101d2e;padding:20px;border-radius:14px;margin-top:24px}
.card h3{margin:0 0 10px;color:#7ee0b5}
.btn{background:#7ee0b5;color:#07111f;border:0;padding:10px 18px;border-radius:999px;font-weight:700;cursor:pointer}
.btn.small{padding:6px 12px;font-size:12px}
.soldform{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.soldform input{width:92px;padding:6px 8px;border-radius:8px;border:1px solid #24374f;background:#0a1626;color:#f4f7fa;font-size:12px}
.soldform input[type=date]{width:130px}
.out{line-height:1.7;margin-top:12px;color:#dbe4ee}
.out h1,.out h2,.out h3,.out h4,.msg h1,.msg h2,.msg h3,.msg h4{font-size:1.02em;margin:.6em 0 .3em;color:#7ee0b5}
.out ul,.out ol,.msg ul,.msg ol{padding-left:1.2em;margin:.3em 0}
.out li,.msg li{margin:.2em 0}
.out p,.msg p{margin:.45em 0}
.out strong,.msg strong{color:#f4f7fa}
.out table,.msg table{border-collapse:collapse;font-size:12px;margin:.4em 0}
.out th,.out td,.msg th,.msg td{border:1px solid #24374f;padding:4px 8px}
.out code,.msg code{background:#0a1626;padding:1px 5px;border-radius:4px;font-size:.92em}
.msg :first-child{margin-top:0}.msg :last-child{margin-bottom:0}
.row{display:flex;gap:8px;margin-top:8px}
.row input{flex:1;padding:10px;border-radius:10px;border:1px solid #24374f;background:#0a1626;color:#f4f7fa}
.msg{margin:8px 0;padding:10px 12px;border-radius:10px;background:#0a1626}
.msg.me{background:#13324a;margin-left:24px}
.dash{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:12px}
.dcard{background:#101d2e;border-radius:14px;padding:16px}
.dcard h4{margin:0 0 8px;color:#f4f7fa}
.dcard .ins{color:#dbe4ee;font-size:13px;line-height:1.7;margin-top:10px;background:#0a1626;padding:10px 12px;border-radius:10px}
.dcard .metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 12px;margin:8px 0}
.dcard .metrics span{font-size:13px;color:#c6d0dc}
.dcard .metrics b{display:block;color:#8894a3;font-size:11px;font-weight:500}
.dcard .metrics em{font-style:normal;font-weight:700}
.dcard .cap{font-size:11px;color:#8894a3;margin:10px 0 2px}
.dcard .badge{display:inline-block;font-size:11px;color:#9fb0c3;background:#0a1626;border:1px solid #24374f;border-radius:999px;padding:2px 9px;margin:2px 4px 2px 0}
.dcard .badge.hot{color:#ffcf6b;border-color:#5a4a1f}
.summary{display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-top:12px}
.summary .scard{background:#101d2e;border-radius:14px;padding:16px}
.summary .scard h4{margin:0 0 12px;color:#f4f7fa;font-size:15px}
.summary .kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.summary .kpis .k b{display:block;color:#8894a3;font-size:11px;font-weight:500;margin-bottom:2px}
.summary .kpis .k em{font-style:normal;font-size:17px;font-weight:700;color:#f4f7fa}
.summary .ind{margin-top:2px}
.summary .ind .row{display:flex;align-items:center;gap:8px;margin:6px 0}
.summary .ind .name{width:96px;font-size:12px;color:#c6d0dc;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.summary .ind .bar{flex:1;height:10px;background:#0a1626;border-radius:6px;overflow:hidden}
.summary .ind .bar>i{display:block;height:100%;background:#7ee0b5;border-radius:6px}
.summary .ind .pct{width:48px;text-align:right;font-size:12px;color:#a8b3c2;flex:none}
@media(max-width:720px){.summary{grid-template-columns:1fr}.dcard .metrics{grid-template-columns:1fr 1fr}}
canvas{max-width:100%}
.typing{display:inline-flex;gap:4px;align-items:center;height:14px}
.typing i{width:6px;height:6px;border-radius:50%;background:#7ee0b5;opacity:.4;animation:blink 1.2s infinite}
.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.fab{position:fixed;right:20px;bottom:20px;z-index:50;border:0;border-radius:999px;padding:14px 20px;background:#00c300;color:#fff;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4)}
.chatbox{position:fixed;right:20px;bottom:20px;z-index:51;width:min(380px,92vw);height:min(560px,80vh);background:#0c1a2b;border:1px solid #22374f;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.chatbox-head{padding:14px 16px;background:#13324a;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.chatbox-body{flex:1;overflow-y:auto;padding:12px}
.chatbox-input{display:flex;gap:6px;padding:10px;border-top:1px solid #22374f}
.chatbox-input input{flex:1;padding:10px;border-radius:10px;border:1px solid #24374f;background:#0a1626;color:#f4f7fa}
</style></head><body><main class="wrap">
<div class="top"><h1>我的持股</h1><a href="/auth/logout">登出</a></div>
<small>${displayName ? displayName + "，" : ""}資料截至 2025-12-31（示範）。分析不構成投資建議。</small>
${active.length ? `<table>
<tr><th>股票</th><th class="num">股數</th><th class="num">成本</th><th class="num">買進日</th><th class="num">收盤</th><th class="num">市值</th><th class="num">損益</th><th class="num">佔比</th></tr>
${rows}</table>
<p class="total">總市值：<b>${fmt(total)}</b> 元${
  totalPl !== null
    ? `　總損益：<b class="${totalPl >= 0 ? "up" : "down"}">${totalPl >= 0 ? "+" : ""}${fmt(totalPl)}（${totalPl >= 0 ? "+" : ""}${totalPct.toFixed(1)}%）</b>`
    : ""
}</p>` : empty}

${pastHoldingsSection(sold)}

<section class="card">
  <h3>AI 持股體檢</h3>
  <small>用 AI 對你目前的整體持股做一次分析（六大面向）。</small>
  <div style="margin-top:8px"><button class="btn" id="analyzeBtn" onclick="runAnalyze()">開始分析</button></div>
  <div class="out" id="analyzeOut"></div>
</section>

<h2 style="margin-top:28px;color:#7ee0b5">投資組合總覽</h2>
<small>依你目前持有中的部位即時計算（資料來源：CMoney）。</small>
<div id="portfolioSummary" class="summary">載入中…</div>

<h2 style="margin-top:28px;color:#7ee0b5">持股洞察儀表板</h2>
<small>依你的實際庫存即時計算。名詞小抄：<b>成本線</b>=你買進的平均價；股價在成本線上方＝現在帳面賺。<b>今年區間位置</b>：0%＝今年最低、100%＝今年最高（越高代表越貴、追高風險越大）。<b>本益比</b>＝股價÷每股盈餘（越高代表越貴）。<b>殖利率</b>＝現金股利÷股價。<b>距年線乖離</b>＝股價偏離年均線的幅度。<b>看多/看空</b>＝社群裡覺得會漲/會跌的討論則數。</small>
<div id="dashboard" class="dash">載入中…</div>

<button id="fab" class="fab" onclick="toggleChat()">💬 我的投資助手</button>
<div id="chatbox" class="chatbox" style="display:none">
  <div class="chatbox-head">🌙 投資助手 <span onclick="toggleChat()" style="cursor:pointer">✕</span></div>
  <div id="chat" class="chatbox-body"></div>
  <div class="chatbox-input">
    <input id="chatInput" placeholder="問我你的持股，例如：我的組合抗跌嗎？" onkeydown="if(event.key==='Enter')sendChat()"/>
    <button class="btn" onclick="sendChat()">送</button>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script>
function mdSafe(t){ try{ return window.marked ? marked.parse(String(t)) : String(t); }catch(e){ return String(t); } }
async function saveSold(code){
  var sp=document.getElementById('sp_'+code), sd=document.getElementById('sd_'+code);
  var body={};
  if(sp && sp.value!=='') body.soldPrice=Number(sp.value);
  if(sd && sd.value!=='') body.soldDate=sd.value;
  if(body.soldPrice===undefined && body.soldDate===undefined){ alert('請至少輸入賣出價或賣出日'); return; }
  try{
    var r=await fetch('/api/portfolio/holdings/'+encodeURIComponent(code)+'/sold',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok){ var e=await r.json().catch(function(){return {};}); alert('儲存失敗：'+(e.error||r.status)); return; }
    location.reload();
  }catch(e){ alert('連線失敗，請稍後再試。'); }
}
async function runAnalyze(){
  var btn=document.getElementById('analyzeBtn'), out=document.getElementById('analyzeOut');
  btn.disabled=true; out.innerHTML='<span class="typing"><i></i><i></i><i></i></span>';
  try{ var r=await fetch('/api/analyze',{method:'POST'}); var d=await r.json(); out.innerHTML=mdSafe(d.answer||d.error||'發生錯誤'); }
  catch(e){ out.textContent='連線失敗，請稍後再試。'; }
  finally{ btn.disabled=false; }
}
function toggleChat(){
  var b=document.getElementById('chatbox'), f=document.getElementById('fab');
  var open=b.style.display==='none'; b.style.display=open?'flex':'none'; f.style.display=open?'none':'block';
  if(open && !document.getElementById('chat').childElementCount){ addMsg('嗨，我是你的投資助手 🌙 問我任何關於你持股的問題吧。',false); }
}
function addMsg(text,me){ var c=document.getElementById('chat'); var el=document.createElement('div'); el.className='msg'+(me?' me':''); el.textContent=text; c.appendChild(el); c.scrollTop=c.scrollHeight; return el; }
async function sendChat(){
  var input=document.getElementById('chatInput'); var msg=input.value.trim(); if(!msg)return;
  addMsg(msg,true); input.value='';
  var c=document.getElementById('chat'); var pending=document.createElement('div');
  pending.className='msg'; pending.innerHTML='<span class="typing"><i></i><i></i><i></i></span>';
  c.appendChild(pending); c.scrollTop=c.scrollHeight;
  try{ var r=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:msg})}); var d=await r.json(); pending.innerHTML=mdSafe(d.answer||d.error||'發生錯誤'); }
  catch(e){ pending.textContent='連線失敗，請稍後再試。'; }
  c.scrollTop=c.scrollHeight;
}
function nfmt(v,d){ var n=Number(v); return isFinite(n)? n.toLocaleString('en-US',{maximumFractionDigits:d||0}) : '—'; }
function pctfmt(v,d,sign){ if(v==null||!isFinite(Number(v)))return '—'; var n=Number(v); return (sign&&n>=0?'+':'')+n.toFixed(d==null?1:d)+'%'; }
function met(label,val){ return '<span><b>'+label+'</b>'+val+'</span>'; }
function renderCard(parent,c){
  var div=document.createElement('div'); div.className='dcard';
  var title=document.createElement('h4'); title.textContent=(c.stock_name||'')+' '+c.stock_code; div.appendChild(title);
  // 產業 / 市場 / 新高 badge
  var badges=document.createElement('div');
  var b='';
  if(c.industry) b+='<span class="badge">'+c.industry+'</span>';
  if(c.market) b+='<span class="badge">'+c.market+'</span>';
  if(c.marketCapBillion!=null) b+='<span class="badge">市值 '+nfmt(c.marketCapBillion,0)+' 億</span>';
  if(c.allTimeHigh) b+='<span class="badge hot">歷史新高</span>';
  badges.innerHTML=b; div.appendChild(badges);
  // 指標列（標籤 + 數值）
  var m=document.createElement('div'); m.className='metrics';
  var pnl = c.pnlPct==null?'—':((c.pnlPct>=0?'+':'')+c.pnlPct.toFixed(1)+'%');
  var pnlCls = c.pnlPct==null?'':(c.pnlPct>=0?'up':'down');
  var net20 = c.instNet20d==null?'—':(c.instNet20d>0?'買超':(c.instNet20d<0?'賣超':'持平'));
  m.innerHTML =
    met('現價',nfmt(c.close_price,2))+
    met('你的成本',nfmt(c.average_cost,2))+
    '<span><b>帳面損益</b><em class="'+pnlCls+'">'+pnl+'</em></span>'+
    met('本益比',c.pe==null?'—':nfmt(c.pe,1)+' 倍')+
    met('股價淨值比',c.pb==null?'—':nfmt(c.pb,2))+
    met('殖利率',pctfmt(c.dividendYield,2))+
    met('今年區間位置',c.buyPointPct==null?'—':c.buyPointPct.toFixed(0)+'%')+
    met('距年線乖離',pctfmt(c.deviationYearMa,1,true))+
    met('年報酬',pctfmt(c.annualReturn,1,true))+
    met('外資持股',pctfmt(c.foreignHolding,1))+
    met('法人持股',pctfmt(c.instHolding,1))+
    met('近20日法人',net20);
  div.appendChild(m);
  // 股利資訊（若有）
  if(c.consecutiveDividendYears!=null || c.latestCashDividend!=null){
    var dv=document.createElement('div'); dv.className='cap';
    var pieces=[];
    if(c.consecutiveDividendYears!=null) pieces.push('連續配息 '+nfmt(c.consecutiveDividendYears,0)+' 年');
    if(c.latestCashDividend!=null) pieces.push('最近現金股利 '+nfmt(c.latestCashDividend,2)+' 元');
    if(c.payoutRatio!=null) pieces.push('配息率 '+pctfmt(c.payoutRatio,0));
    if(c.exDividendDate) pieces.push('除息日 '+c.exDividendDate);
    dv.textContent='💰 '+pieces.join('｜'); div.appendChild(dv);
  }
  var cap1=document.createElement('div'); cap1.className='cap'; cap1.textContent='股價走勢（近90日）：綠線＝股價，紅虛線＝你的成本。綠線在紅線上方＝帳面賺。';
  var pc=document.createElement('canvas'); div.appendChild(cap1); div.appendChild(pc);
  var cap2=document.createElement('div'); cap2.className='cap'; cap2.textContent='社群多空討論（近60日）：紅線＝看多則數，綠線＝看空則數。紅線高＝氣氛偏樂觀。';
  var sc=document.createElement('canvas'); div.appendChild(cap2); div.appendChild(sc);
  var ins=document.createElement('div'); ins.className='ins'; ins.textContent='💡 '+c.insight; div.appendChild(ins);
  parent.appendChild(div);
  var labels=c.priceHistory.map(function(x){return x.d;});
  var ds=[{label:'股價',data:c.priceHistory.map(function(x){return x.c;}),borderColor:'#7ee0b5',pointRadius:0,tension:.2}];
  if(c.average_cost){ ds.push({label:'你的成本',data:c.priceHistory.map(function(){return c.average_cost;}),borderColor:'#ff6b6b',borderDash:[6,4],pointRadius:0}); }
  new Chart(pc,{type:'line',data:{labels:labels,datasets:ds},options:{responsive:true,plugins:{legend:{labels:{color:'#a8b3c2',boxWidth:12}}},scales:{x:{display:false},y:{ticks:{color:'#8894a3'}}}}});
  new Chart(sc,{type:'line',data:{labels:c.sentimentHistory.map(function(x){return x.d;}),datasets:[
    {label:'看多',data:c.sentimentHistory.map(function(x){return x.bull;}),borderColor:'#ff6b6b',pointRadius:0,tension:.2},
    {label:'看空',data:c.sentimentHistory.map(function(x){return x.bear;}),borderColor:'#51cf66',pointRadius:0,tension:.2}
  ]},options:{responsive:true,plugins:{legend:{labels:{color:'#a8b3c2',boxWidth:12}}},scales:{x:{display:false},y:{ticks:{color:'#8894a3'}}}}});
}
function renderSummary(s){
  var el=document.getElementById('portfolioSummary');
  if(!s || !s.count){ el.textContent='目前沒有持有中的部位。'; return; }
  var plCls = s.totalPnl==null?'':(s.totalPnl>=0?'up':'down');
  var plStr = s.totalPnl==null?'—':((s.totalPnl>=0?'+':'')+nfmt(s.totalPnl)+'（'+(s.totalPnlPct>=0?'+':'')+(s.totalPnlPct==null?'—':s.totalPnlPct.toFixed(1)+'%')+'）');
  var conc = s.concentration||{};
  var kpi=document.createElement('div'); kpi.className='scard';
  kpi.innerHTML='<h4>組合體質（加權）</h4><div class="kpis">'+
    '<div class="k"><b>總市值</b><em>'+nfmt(s.totalMarketValue)+'</em></div>'+
    '<div class="k"><b>總損益</b><em class="'+plCls+'">'+plStr+'</em></div>'+
    '<div class="k"><b>加權殖利率</b><em>'+pctfmt(s.weightedDividendYield,2)+'</em></div>'+
    '<div class="k"><b>加權本益比</b><em>'+(s.weightedPe==null?'—':nfmt(s.weightedPe,1)+' 倍')+'</em></div>'+
    '<div class="k"><b>持股檔數</b><em>'+s.count+'</em></div>'+
    '<div class="k"><b>最大單一持股</b><em>'+(conc.topWeight==null?'—':conc.topWeight.toFixed(1)+'%')+'</em></div>'+
    '</div>'+
    '<div class="cap" style="margin-top:10px">前3大持股集中度 '+(conc.top3Weight==null?'—':conc.top3Weight.toFixed(1)+'%')+
    '｜集中度指數(HHI) '+(conc.hhi==null?'—':conc.hhi.toFixed(2))+'（越接近 1 越集中，風險越高）。</div>';
  var ind=document.createElement('div'); ind.className='scard';
  var rows=(s.industryAllocation||[]).slice(0,6).map(function(a){
    return '<div class="row"><div class="name" title="'+a.industry+'">'+a.industry+'</div>'+
      '<div class="bar"><i style="width:'+Math.max(2,a.pct).toFixed(0)+'%"></i></div>'+
      '<div class="pct">'+a.pct.toFixed(0)+'%</div></div>';
  }).join('');
  ind.innerHTML='<h4>產業分布</h4><div class="ind">'+(rows||'<div class="cap">無資料</div>')+'</div>';
  el.innerHTML=''; el.appendChild(kpi); el.appendChild(ind);
}
async function loadDashboard(){
  var el=document.getElementById('dashboard'); var sumEl=document.getElementById('portfolioSummary');
  try{
    var r=await fetch('/api/dashboard'); var d=await r.json();
    renderSummary(d.summary);
    if(!d.cards||!d.cards.length){ el.textContent='沒有持有中的部位，先用 LINE 匯入吧。'; return; }
    el.innerHTML='';
    d.cards.forEach(function(c){ renderCard(el,c); });
  }catch(e){ el.textContent='儀表板載入失敗。'; if(sumEl)sumEl.textContent='總覽載入失敗。'; }
}
loadDashboard();
</script>
</main></body></html>`;
}
