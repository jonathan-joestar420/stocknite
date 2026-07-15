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

export function portfolioPage(holdings: HoldingRow[], displayName?: string): string {
  const total = holdings.reduce((s, h) => s + (Number(h.market_value) || 0), 0);
  const rows = holdings.map((h) => `<tr>
    <td>${h.stock_name ?? ""}<small> ${h.stock_code}</small></td>
    <td class="num">${fmt(h.quantity)}</td>
    <td class="num">${fmt(h.average_cost, 2)}</td>
    <td class="num">${h.purchase_date ? String(h.purchase_date).slice(0, 10) : "—"}</td>
    <td class="num">${fmt(h.close_price, 2)}</td>
    <td class="num">${fmt(h.market_value)}</td>
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
.total{margin-top:16px;font-size:18px}.total b{color:#7ee0b5}
a{color:#7ee0b5}.top{display:flex;justify-content:space-between;align-items:center}
</style></head><body><main class="wrap">
<div class="top"><h1>我的持股</h1><a href="/auth/logout">登出</a></div>
<small>${displayName ? displayName + "，" : ""}資料截至 2025-12-31（示範）。分析不構成投資建議。</small>
${holdings.length ? `<table>
<tr><th>股票</th><th class="num">股數</th><th class="num">成本</th><th class="num">買進日</th><th class="num">收盤</th><th class="num">市值</th><th class="num">佔比</th></tr>
${rows}</table>
<p class="total">總市值：<b>${fmt(total)}</b> 元</p>` : empty}
</main></body></html>`;
}
