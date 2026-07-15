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

export async function getSentimentHistory(stockCode: string, limit: number) {
  return query(`
    SELECT activity_date,
      NULLIF(post_count, '')::bigint AS posts,
      NULLIF(bullish_posts, '')::bigint AS bullish,
      NULLIF(bearish_posts, '')::bigint AS bearish
    FROM market_data.forum_posts_replies_daily_stats_2025
    WHERE stock_code = $1
    ORDER BY activity_date DESC LIMIT $2`, [stockCode, limit]);
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

export async function getStockDailySnapshot(stockCode: string, date: string) {
  const tradeDate = date.replaceAll("-", "");
  const forumDate = `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}`;
  const rows = await query(`
    SELECT to_date(p.trade_date, 'YYYYMMDD') AS trade_date,
      p.stock_code, p.stock_name,
      NULLIF(p.open_price, '')::numeric AS open_price,
      NULLIF(p.high_price, '')::numeric AS high_price,
      NULLIF(p.low_price, '')::numeric AS low_price,
      NULLIF(p.close_price, '')::numeric AS close_price,
      NULLIF(p.price_change, '')::numeric AS price_change,
      NULLIF(p.price_change_pct, '')::numeric AS price_change_pct,
      NULLIF(p.volume, '')::numeric AS volume,
      NULLIF(i.foreign_net_buy_sell, '')::numeric AS foreign_net_buy_sell,
      NULLIF(i.investment_trust_net_buy_sell, '')::numeric AS investment_trust_net_buy_sell,
      NULLIF(i.dealer_net_buy_sell, '')::numeric AS dealer_net_buy_sell,
      NULLIF(i.total_net_buy_sell, '')::numeric AS institutional_net_buy_sell,
      NULLIF(i.foreign_holding_pct, '')::numeric AS foreign_holding_pct,
      NULLIF(i.institutional_holding_pct, '')::numeric AS institutional_holding_pct,
      NULLIF(r.daily_return_pct, '')::numeric AS daily_return_pct,
      NULLIF(r.weekly_return_pct, '')::numeric AS weekly_return_pct,
      NULLIF(r.monthly_return_pct, '')::numeric AS monthly_return_pct,
      NULLIF(r.quarterly_return_pct, '')::numeric AS quarterly_return_pct,
      NULLIF(r.annual_return_pct, '')::numeric AS annual_return_pct,
      NULLIF(m.ytd_return_pct, '')::numeric AS ytd_return_pct,
      NULLIF(m.return_5d_pct, '')::numeric AS return_5d_pct,
      NULLIF(m.return_20d_pct, '')::numeric AS return_20d_pct,
      NULLIF(m.return_60d_pct, '')::numeric AS return_60d_pct,
      NULLIF(f.post_count, '')::bigint AS forum_post_count,
      NULLIF(f.bullish_posts, '')::bigint AS forum_bullish_posts,
      NULLIF(f.bearish_posts, '')::bigint AS forum_bearish_posts,
      NULLIF(f.neutral_posts, '')::bigint AS forum_neutral_posts,
      NULLIF(f.reply_count, '')::bigint AS forum_reply_count
    FROM market_data.price_valuation_2025 p
    LEFT JOIN market_data.institutional_trading_2025 i
      ON i.stock_code = p.stock_code AND i.trade_date = p.trade_date
    LEFT JOIN market_data.return_rate_2025 r
      ON r.stock_code = p.stock_code AND r.trade_date = p.trade_date
    LEFT JOIN market_data.distance_high_low_momentum_2025 m
      ON m.stock_code = p.stock_code AND m.trade_date = p.trade_date
    LEFT JOIN market_data.forum_posts_replies_daily_stats_2025 f
      ON f.stock_code = p.stock_code AND f.activity_date = $3
    WHERE p.stock_code = $1 AND p.trade_date = $2
    LIMIT 1`, [stockCode, tradeDate, forumDate]);
  return rows[0] ?? null;
}
