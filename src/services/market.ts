import { query } from "../db.js";

export async function getStockSummary(stockCode: string) {
  const rows = await query(`
    SELECT stock_code, stock_name, market, industry,
      NULLIF(close_price, '')::numeric AS close_price,
      NULLIF(quarterly_return_pct, '')::numeric AS quarterly_return_pct,
      NULLIF(annual_return_pct, '')::numeric AS annual_return_pct,
      NULLIF(foreign_holding_pct, '')::numeric AS foreign_holding_pct,
      NULLIF(institutional_holding_pct, '')::numeric AS institutional_holding_pct,
      NULLIF(year_high, '')::numeric AS year_high,
      NULLIF(year_low, '')::numeric AS year_low
    FROM market_data.stock_summary_2025
    WHERE stock_code = $1 LIMIT 1`, [stockCode]);
  return rows[0] ?? null;
}

export async function getStockHistory(stockCode: string, limit: number) {
  return query(`
    SELECT to_date(trade_date, 'YYYYMMDD') AS trade_date,
      NULLIF(close_price, '')::numeric AS close_price,
      NULLIF(volume, '')::numeric AS volume
    FROM market_data.price_valuation_2025
    WHERE stock_code = $1
    ORDER BY trade_date DESC LIMIT $2`, [stockCode, limit]);
}

export async function getMarketSentiment() {
  const rows = await query(`
    SELECT activity_date,
      SUM(NULLIF(post_count, '')::bigint) AS posts,
      SUM(NULLIF(bullish_posts, '')::bigint) AS bullish,
      SUM(NULLIF(bearish_posts, '')::bigint) AS bearish,
      SUM(NULLIF(neutral_posts, '')::bigint) AS neutral
    FROM market_data.forum_posts_replies_daily_stats_2025
    WHERE activity_date = (SELECT MAX(activity_date)
      FROM market_data.forum_posts_replies_daily_stats_2025)
    GROUP BY activity_date`);
  return rows[0] ?? null;
}
