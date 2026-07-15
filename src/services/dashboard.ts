import { getSentimentHistory, getStockHistory, getStockSummary } from "./market.js";
import { listHoldings } from "./portfolio.js";

const N = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ymd = (v: unknown): string => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
};

/** 產生一句白話、合規（不含買賣建議）的持股解讀。 */
function buildInsight(params: {
  name: string; buyPointPct: number | null; pnlPct: number | null;
  bull: number; bear: number; sentimentTrend: string;
}): string {
  const parts: string[] = [];
  const { buyPointPct, pnlPct, bull, bear, sentimentTrend } = params;

  if (pnlPct !== null) {
    parts.push(pnlPct >= 0 ? `帳面獲利 ${pnlPct.toFixed(1)}%` : `帳面虧損 ${Math.abs(pnlPct).toFixed(1)}%`);
  }
  if (buyPointPct !== null) {
    const pos = buyPointPct >= 80 ? "接近今年高點" : buyPointPct <= 20 ? "接近今年低點" : "位於今年區間中段";
    parts.push(`股價${pos}（區間 ${buyPointPct.toFixed(0)}%）`);
  }
  if (bull + bear > 0) {
    const ratio = bear === 0 ? bull : bull / bear;
    const mood = bull >= bear ? "偏多" : "偏空";
    parts.push(`社群情緒${mood}（多空約 ${ratio.toFixed(1)} 倍，${sentimentTrend}）`);
  }
  const base = parts.join("；");
  return base ? `${base}。（僅供參考，非投資建議）` : "資料不足，無法解讀。";
}

export async function buildDashboard(lineUserId: string) {
  const holdings = await listHoldings(lineUserId) as Array<Record<string, unknown>>;
  const cards = [];
  for (const h of holdings) {
    const code = String(h.stock_code);
    const [summary, priceRows, sentRows] = await Promise.all([
      getStockSummary(code),
      getStockHistory(code, 90),
      getSentimentHistory(code, 60),
    ]);

    // 價格走勢（轉為時間升冪）
    const priceHistory = (priceRows as Array<Record<string, unknown>>)
      .map((r) => ({ d: ymd(r.trade_date), c: N(r.close_price) }))
      .filter((p) => p.c !== null)
      .reverse();

    // 情緒走勢（升冪）
    const sentimentHistory = (sentRows as Array<Record<string, unknown>>)
      .map((r) => ({ d: ymd(r.activity_date), bull: N(r.bullish) ?? 0, bear: N(r.bearish) ?? 0 }))
      .reverse();

    const close = N(h.close_price);
    const cost = N(h.average_cost);
    const yearHigh = summary ? N((summary as Record<string, unknown>).year_high) : null;
    const yearLow = summary ? N((summary as Record<string, unknown>).year_low) : null;
    const buyPointPct = close !== null && yearHigh !== null && yearLow !== null && yearHigh > yearLow
      ? ((close - yearLow) / (yearHigh - yearLow)) * 100 : null;
    const pnlPct = close !== null && cost !== null && cost > 0 ? ((close - cost) / cost) * 100 : null;

    // 情緒近/遠期比較，判斷升溫或降溫
    const recent = sentimentHistory.slice(-10);
    const bull = recent.reduce((s, x) => s + x.bull, 0);
    const bear = recent.reduce((s, x) => s + x.bear, 0);
    const half = Math.floor(sentimentHistory.length / 2);
    const firstPosts = sentimentHistory.slice(0, half).reduce((s, x) => s + x.bull + x.bear, 0);
    const lastPosts = sentimentHistory.slice(half).reduce((s, x) => s + x.bull + x.bear, 0);
    const sentimentTrend = lastPosts > firstPosts * 1.2 ? "討論升溫"
      : lastPosts < firstPosts * 0.8 ? "討論降溫" : "討論持平";

    cards.push({
      stock_code: code,
      stock_name: h.stock_name ?? "",
      quantity: N(h.quantity),
      average_cost: cost,
      close_price: close,
      market_value: N(h.market_value),
      weight: N(h.weight),
      purchase_date: h.purchase_date ? ymd(h.purchase_date) : null,
      buyPointPct,
      pnlPct,
      priceHistory,
      sentimentHistory,
      insight: buildInsight({
        name: String(h.stock_name ?? code), buyPointPct, pnlPct, bull, bear, sentimentTrend,
      }),
    });
  }
  return { cards };
}
