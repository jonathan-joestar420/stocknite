import { config } from "./config.js";

export function landingPage(): string {
  return `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>股奈 StockNite｜存好股，睡好覺</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#07111f;color:#f4f7fa}
body{margin:0}.wrap{max-width:960px;margin:auto;padding:72px 24px}.hero{min-height:60vh;display:grid;place-content:center;text-align:center}
h1{font-size:clamp(3rem,9vw,6rem);margin:0;color:#7ee0b5}h2{font-size:clamp(1.6rem,4vw,3rem);margin:.4em}
p{color:#a8b3c2;line-height:1.8}.button{display:inline-block;background:#7ee0b5;color:#07111f;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#101d2e;padding:24px;border-radius:18px}
small{color:#a8b3c2}</style></head><body><main class="wrap">
<section class="hero"><small>LINE 投資陪伴助手</small><h1>股奈 StockNite</h1><h2>存好股，睡好覺。</h2>
<p>整理市場情緒、歷史走勢與你的持股風險。<br>不預測明牌，只幫你看懂資料。</p>
<a class="button" href="${config.lineAddFriendUrl}">用 LINE 開始使用</a>
<a class="button" style="background:#00c300;color:#fff;margin-left:12px" href="/auth/line/login">LINE 登入看我的持股</a></section>
<section class="grid"><article class="card"><h3>查股票</h3><p>輸入股票代號，快速查看價格、法人與歷史表現。</p></article>
<article class="card"><h3>持股健檢</h3><p>檢視單股與產業集中度，找出重疊風險。</p></article>
<article class="card"><h3>早安摘要</h3><p>每天早上七點，只整理與你持股相關的重點。</p></article></section>
</main></body></html>`;
}

type HoldingRow = {
  stock_code: string; stock_name?: string | null;
  quantity?: string | number | null; average_cost?: string | number | null;
  purchase_date?: string | null; close_price?: string | number | null;
  market_value?: string | number | null; weight?: string | number | null;
};

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
  const total = holdings.reduce((s, h) => s + (Number(h.market_value) || 0), 0);
  const totalBasis = holdings.reduce(
    (s, h) => s + (pnlOf(h) ? Number(h.average_cost) * Number(h.quantity) : 0), 0);
  const totalPl = totalBasis ? total - totalBasis : null;
  const totalPct = totalPl !== null && totalBasis ? (totalPl / totalBasis) * 100 : 0;
  const rows = holdings.map((h) => `<tr>
    <td>${h.stock_name ?? ""}<small> ${h.stock_code}</small></td>
    <td class="num">${fmt(h.quantity)}</td>
    <td class="num">${fmt(h.average_cost, 2)}</td>
    <td class="num">${ymd(h.purchase_date)}</td>
    <td class="num">${fmt(h.close_price, 2)}</td>
    <td class="num">${fmt(h.market_value)}</td>
    ${pnlCell(pnlOf(h))}
    <td class="num">${h.weight ? (Number(h.weight) * 100).toFixed(1) + "%" : "—"}</td>
  </tr>`).join("");
  const empty = `<p>你還沒有持股。到 LINE 傳一張持股截圖或輸入「今天買了台積電50股 成本2400 買進日2025-12-30」即可匯入。</p>`;
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
.out{white-space:pre-wrap;line-height:1.7;margin-top:12px;color:#dbe4ee}
.row{display:flex;gap:8px;margin-top:8px}
.row input{flex:1;padding:10px;border-radius:10px;border:1px solid #24374f;background:#0a1626;color:#f4f7fa}
.msg{margin:8px 0;padding:10px 12px;border-radius:10px;background:#0a1626}
.msg.me{background:#13324a}
</style></head><body><main class="wrap">
<div class="top"><h1>我的持股</h1><a href="/auth/logout">登出</a></div>
<small>${displayName ? displayName + "，" : ""}資料截至 2025-12-31（示範）。分析不構成投資建議。</small>
${holdings.length ? `<table>
<tr><th>股票</th><th class="num">股數</th><th class="num">成本</th><th class="num">買進日</th><th class="num">收盤</th><th class="num">市值</th><th class="num">損益</th><th class="num">佔比</th></tr>
${rows}</table>
<p class="total">總市值：<b>${fmt(total)}</b> 元${
  totalPl !== null
    ? `　總損益：<b class="${totalPl >= 0 ? "up" : "down"}">${totalPl >= 0 ? "+" : ""}${fmt(totalPl)}（${totalPl >= 0 ? "+" : ""}${totalPct.toFixed(1)}%）</b>`
    : ""
}</p>` : empty}

<section class="card">
  <h3>AI 持股體檢</h3>
  <small>用 AI 對你目前的整體持股做一次分析（六大面向）。</small>
  <div><button class="btn" id="analyzeBtn" onclick="runAnalyze()">開始分析</button></div>
  <div class="out" id="analyzeOut"></div>
</section>

<section class="card">
  <h3>AI 投資助手</h3>
  <small>問問題，助手會依你的持股與市場資料回覆（效果同 LINE 上的股奈）。</small>
  <div id="chat"></div>
  <div class="row">
    <input id="chatInput" placeholder="例如：我的組合抗跌嗎？台積電最近如何？" onkeydown="if(event.key==='Enter')sendChat()"/>
    <button class="btn" onclick="sendChat()">送出</button>
  </div>
</section>

<script>
async function runAnalyze(){
  const btn=document.getElementById('analyzeBtn'), out=document.getElementById('analyzeOut');
  btn.disabled=true; out.textContent='分析中…';
  try{ const r=await fetch('/api/analyze',{method:'POST'}); const d=await r.json(); out.textContent=d.answer||d.error||'發生錯誤'; }
  catch(e){ out.textContent='連線失敗，請稍後再試。'; }
  finally{ btn.disabled=false; }
}
function addMsg(text,me){ const c=document.getElementById('chat'); const el=document.createElement('div'); el.className='msg'+(me?' me':''); el.textContent=text; c.appendChild(el); c.scrollTop=c.scrollHeight; }
async function sendChat(){
  const input=document.getElementById('chatInput'); const msg=input.value.trim(); if(!msg)return;
  addMsg(msg,true); input.value=''; addMsg('思考中…',false);
  const chat=document.getElementById('chat'); const pending=chat.lastChild;
  try{ const r=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:msg})}); const d=await r.json(); pending.textContent=d.answer||d.error||'發生錯誤'; }
  catch(e){ pending.textContent='連線失敗，請稍後再試。'; }
}
</script>
</main></body></html>`;
}
