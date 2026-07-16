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

/** 產生一句白話、合規（不含買賣建議）的持股解讀，盡量帶入 CMoney 各項數據。 */
function buildInsight(p: {
  buyPointPct: number | null; pnlPct: number | null;
  pe: number | null; dividendYield: number | null; consecutiveDividendYears: number | null;
  foreignHolding: number | null; instNet20d: number | null; deviationYearMa: number | null;
  bull: number; bear: number; sentimentTrend: string;
}): string {
  const parts: string[] = [];
  if (p.pnlPct !== null) {
    parts.push(p.pnlPct >= 0
      ? `你目前帳面賺 ${p.pnlPct.toFixed(1)}%`
      : `你目前帳面賠 ${Math.abs(p.pnlPct).toFixed(1)}%`);
  }
  if (p.buyPointPct !== null) {
    const pos = p.buyPointPct >= 80 ? "接近今年高點（追高區）"
      : p.buyPointPct <= 20 ? "接近今年低點" : "在今年區間中段";
    parts.push(`股價${pos}（區間位置 ${p.buyPointPct.toFixed(0)}%）`);
  }
  if (p.deviationYearMa !== null) {
    parts.push(`距年線乖離 ${p.deviationYearMa >= 0 ? "+" : ""}${p.deviationYearMa.toFixed(1)}%`);
  }
  if (p.pe !== null) parts.push(`本益比約 ${p.pe.toFixed(1)} 倍`);
  if (p.dividendYield !== null) {
    const extra = p.consecutiveDividendYears && p.consecutiveDividendYears >= 1
      ? `、已連續配息 ${p.consecutiveDividendYears.toFixed(0)} 年` : "";
    parts.push(`現金殖利率約 ${p.dividendYield.toFixed(2)}%${extra}`);
  }
  if (p.foreignHolding !== null) parts.push(`外資持股 ${p.foreignHolding.toFixed(1)}%`);
  if (p.instNet20d !== null && p.instNet20d !== 0) {
    parts.push(`近20日法人${p.instNet20d > 0 ? "偏買超" : "偏賣超"}`);
  }
  if (p.bull + p.bear > 0) {
    const ratio = p.bear === 0 ? p.bull : p.bull / p.bear;
    parts.push(`社群${p.bull >= p.bear ? "偏樂觀" : "偏保守"}（多空約 ${ratio.toFixed(1)} 倍，${p.sentimentTrend}）`);
  }
  const base = parts.join("；");
  return base ? `${base}。（僅供參考，非投資建議）` : "資料不足，無法解讀。";
}

/** 依市值加權平均某個指標（只計入有值的部位）。 */
function weightedAverage(items: Array<{ mv: number; metric: number | null }>): number | null {
  let sumW = 0;
  let sum = 0;
  for (const { mv, metric } of items) {
    if (metric === null || !Number.isFinite(mv) || mv <= 0) continue;
    sumW += mv;
    sum += mv * metric;
  }
  return sumW > 0 ? sum / sumW : null;
}

export async function buildDashboard(lineUserId: string) {
  const all = await listHoldings(lineUserId) as Array<Record<string, unknown>>;
  // 只分析目前持有中的部位；已賣出（quantity=0）不顯示走勢與趨勢分析。
  const holdings = all.filter((h) => (Number(h.quantity) || 0) > 0);
  const cards = [];
  // 組合層級累加用
  const industryMap = new Map<string, number>();
  const weightedInputs: { pe: Array<{ mv: number; metric: number | null }>;
    dy: Array<{ mv: number; metric: number | null }>;
    pb: Array<{ mv: number; metric: number | null }>; } = { pe: [], dy: [], pb: [] };
  let totalMv = 0;
  let totalBasis = 0;

  for (const h of holdings) {
    const code = String(h.stock_code);
    const [summary, priceRows, sentRows] = await Promise.all([
      getStockSummary(code),
      getStockHistory(code, 90),
      getSentimentHistory(code, 60),
    ]);
    const s = (summary ?? {}) as Record<string, unknown>;

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
    const mv = N(h.market_value) ?? 0;
    const yearHigh = N(s.year_high);
    const yearLow = N(s.year_low);
    // 優先用 CMoney 的買點分位，缺值時以年高低內插。
    const buyPointPct = N(s.buy_point_percentile_pct) ??
      (close !== null && yearHigh !== null && yearLow !== null && yearHigh > yearLow
        ? ((close - yearLow) / (yearHigh - yearLow)) * 100 : null);
    const pnlPct = close !== null && cost !== null && cost > 0 ? ((close - cost) / cost) * 100 : null;

    const pe = N(s.pe_ratio_ttm);
    const pb = N(s.price_to_book);
    const dividendYield = N(s.dividend_yield_pct);
    const foreignHolding = N(s.foreign_holding_pct);
    const instNet20d = N(s.institutional_net_buy_sell_20d);
    const deviationYearMa = N(s.deviation_year_ma_pct);

    // 情緒近/遠期比較，判斷升溫或降溫
    const recent = sentimentHistory.slice(-10);
    const bull = recent.reduce((sum, x) => sum + x.bull, 0);
    const bear = recent.reduce((sum, x) => sum + x.bear, 0);
    const halfIdx = Math.floor(sentimentHistory.length / 2);
    const firstPosts = sentimentHistory.slice(0, halfIdx).reduce((sum, x) => sum + x.bull + x.bear, 0);
    const lastPosts = sentimentHistory.slice(halfIdx).reduce((sum, x) => sum + x.bull + x.bear, 0);
    const sentimentTrend = lastPosts > firstPosts * 1.2 ? "討論升溫"
      : lastPosts < firstPosts * 0.8 ? "討論降溫" : "討論持平";

    // 組合層級累加
    const industry = String(s.industry ?? h.industry ?? "其他") || "其他";
    industryMap.set(industry, (industryMap.get(industry) ?? 0) + mv);
    weightedInputs.pe.push({ mv, metric: pe });
    weightedInputs.dy.push({ mv, metric: dividendYield });
    weightedInputs.pb.push({ mv, metric: pb });
    totalMv += mv;
    if (pnlPct !== null && cost !== null) totalBasis += cost * (N(h.quantity) ?? 0);

    cards.push({
      stock_code: code,
      stock_name: h.stock_name ?? "",
      market: s.market ?? null,
      industry,
      quantity: N(h.quantity),
      average_cost: cost,
      close_price: close,
      market_value: mv,
      weight: N(h.weight),
      purchase_date: h.purchase_date ? ymd(h.purchase_date) : null,
      buyPointPct,
      pnlPct,
      // 估值
      pe,
      pb,
      turnoverRate: N(s.turnover_rate_pct),
      marketCapBillion: N(s.market_cap_billion),
      marketCapWeight: N(s.market_cap_weight_pct),
      // 股利
      dividendYield,
      consecutiveDividendYears: N(s.consecutive_dividend_years),
      latestCashDividend: N(s.latest_cash_dividend),
      payoutRatio: N(s.payout_ratio_pct),
      exDividendDate: s.latest_ex_dividend_date ? ymd(s.latest_ex_dividend_date) : null,
      // 報酬
      quarterlyReturn: N(s.quarterly_return_pct),
      annualReturn: N(s.annual_return_pct),
      relativeAnnualReturn: N(s.relative_annual_return_pct),
      ytdReturn: N(s.ytd_return_pct),
      // 法人 / 籌碼
      foreignHolding,
      instHolding: N(s.institutional_holding_pct),
      instNet20d,
      // 技術位置
      yearHigh,
      yearLow,
      deviationYearMa,
      allTimeHigh: String(s.all_time_high_flag ?? "") === "1" ||
        String(s.all_time_high_flag ?? "").toUpperCase() === "Y",
      priceHistory,
      sentimentHistory,
      insight: buildInsight({
        buyPointPct, pnlPct, pe, dividendYield,
        consecutiveDividendYears: N(s.consecutive_dividend_years),
        foreignHolding, instNet20d, deviationYearMa, bull, bear, sentimentTrend,
      }),
    });
  }

  // 產業分布（依市值，降冪）
  const industryAllocation = [...industryMap.entries()]
    .map(([industry, value]) => ({
      industry,
      value,
      pct: totalMv > 0 ? (value / totalMv) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // 集中度
  const weights = cards.map((c) => (totalMv > 0 ? (Number(c.market_value) || 0) / totalMv : 0));
  const sortedW = [...weights].sort((a, b) => b - a);
  const topWeight = sortedW[0] ?? 0;
  const top3Weight = sortedW.slice(0, 3).reduce((s, w) => s + w, 0);
  const hhi = weights.reduce((s, w) => s + w * w, 0); // 0~1，越高越集中

  const totalPnl = totalBasis ? totalMv - totalBasis : null;

  const summary = {
    count: cards.length,
    totalMarketValue: totalMv,
    totalCost: totalBasis || null,
    totalPnl,
    totalPnlPct: totalPnl !== null && totalBasis ? (totalPnl / totalBasis) * 100 : null,
    weightedDividendYield: weightedAverage(weightedInputs.dy),
    weightedPe: weightedAverage(weightedInputs.pe),
    weightedPb: weightedAverage(weightedInputs.pb),
    industryAllocation,
    concentration: {
      topWeight: topWeight * 100,
      top3Weight: top3Weight * 100,
      hhi,
      topName: cards.length ? `${cards[0]!.stock_name ?? ""} ${cards[0]!.stock_code}` : null,
    },
  };

  return { summary, cards };
}
