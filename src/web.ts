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
.msg.me{background:#13324a;margin-left:24px}
.dash{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:12px}
.dcard{background:#101d2e;border-radius:14px;padding:16px}
.dcard h4{margin:0 0 8px;color:#f4f7fa}
.dcard .ins{color:#dbe4ee;font-size:13px;line-height:1.7;margin-top:10px;background:#0a1626;padding:10px 12px;border-radius:10px}
.dcard .metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin:8px 0}
.dcard .metrics span{font-size:13px;color:#c6d0dc}
.dcard .metrics b{display:block;color:#8894a3;font-size:11px;font-weight:500}
.dcard .metrics em{font-style:normal;font-weight:700}
.dcard .cap{font-size:11px;color:#8894a3;margin:10px 0 2px}
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
  <div style="margin-top:8px"><button class="btn" id="analyzeBtn" onclick="runAnalyze()">開始分析</button></div>
  <div class="out" id="analyzeOut"></div>
</section>

<h2 style="margin-top:28px;color:#7ee0b5">持股洞察儀表板</h2>
<small>依你的實際庫存即時計算。名詞小抄：<b>成本線</b>=你買進的平均價；股價在成本線上方＝現在帳面賺。<b>今年區間位置</b>：0%＝今年最低、100%＝今年最高（越高代表越貴、追高風險越大）。<b>看多/看空</b>＝社群裡覺得會漲/會跌的討論則數。</small>
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
<script>
async function runAnalyze(){
  var btn=document.getElementById('analyzeBtn'), out=document.getElementById('analyzeOut');
  btn.disabled=true; out.textContent='分析中…';
  try{ var r=await fetch('/api/analyze',{method:'POST'}); var d=await r.json(); out.textContent=d.answer||d.error||'發生錯誤'; }
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
  try{ var r=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:msg})}); var d=await r.json(); pending.textContent=d.answer||d.error||'發生錯誤'; }
  catch(e){ pending.textContent='連線失敗，請稍後再試。'; }
  c.scrollTop=c.scrollHeight;
}
function nfmt(v,d){ var n=Number(v); return isFinite(n)? n.toLocaleString('en-US',{maximumFractionDigits:d||0}) : '—'; }
function renderCard(parent,c){
  var div=document.createElement('div'); div.className='dcard';
  var title=document.createElement('h4'); title.textContent=(c.stock_name||'')+' '+c.stock_code; div.appendChild(title);
  // 指標列（標籤 + 數值，讓小白一眼看懂）
  var m=document.createElement('div'); m.className='metrics';
  var pnl = c.pnlPct==null?'—':((c.pnlPct>=0?'+':'')+c.pnlPct.toFixed(1)+'%');
  var pnlCls = c.pnlPct==null?'':(c.pnlPct>=0?'up':'down');
  m.innerHTML =
    '<span><b>現價</b>'+nfmt(c.close_price,2)+'</span>'+
    '<span><b>你的成本</b>'+nfmt(c.average_cost,2)+'</span>'+
    '<span><b>帳面損益</b><em class="'+pnlCls+'">'+pnl+'</em></span>'+
    '<span><b>今年區間位置</b>'+(c.buyPointPct==null?'—':c.buyPointPct.toFixed(0)+'%')+'</span>';
  div.appendChild(m);
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
async function loadDashboard(){
  var el=document.getElementById('dashboard');
  try{
    var r=await fetch('/api/dashboard'); var d=await r.json();
    if(!d.cards||!d.cards.length){ el.textContent='沒有持股資料，先用 LINE 匯入吧。'; return; }
    el.innerHTML='';
    d.cards.forEach(function(c){ renderCard(el,c); });
  }catch(e){ el.textContent='儀表板載入失敗。'; }
}
loadDashboard();
</script>
</main></body></html>`;
}
