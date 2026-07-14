import { query } from "../db.js";

async function ensureUser(lineUserId: string) {
  const rows = await query<{ id: string }>(`
    INSERT INTO app_data.users (line_user_id, portfolio_mode, consented_at)
    VALUES ($1, true, now())
    ON CONFLICT (line_user_id) DO UPDATE SET updated_at = now()
    RETURNING id`, [lineUserId]);
  return rows[0]!.id;
}

export async function listHoldings(lineUserId: string) {
  return query(`
    SELECT h.stock_code, s.stock_name, h.quantity, h.average_cost,
      NULLIF(s.close_price, '')::numeric AS close_price,
      h.quantity * NULLIF(s.close_price, '')::numeric AS market_value,
      CASE WHEN SUM(h.quantity * NULLIF(s.close_price, '')::numeric) OVER () > 0
        THEN h.quantity * NULLIF(s.close_price, '')::numeric /
          SUM(h.quantity * NULLIF(s.close_price, '')::numeric) OVER () END AS weight
    FROM app_data.users u
    JOIN app_data.portfolio_holdings h ON h.user_id = u.id
    LEFT JOIN market_data.stock_summary_2025 s ON s.stock_code = h.stock_code
    WHERE u.line_user_id = $1 ORDER BY market_value DESC NULLS LAST`, [lineUserId]);
}

export async function upsertHolding(
  lineUserId: string, stockCode: string, quantity: number, averageCost?: number,
) {
  const userId = await ensureUser(lineUserId);
  await query(`INSERT INTO app_data.portfolio_holdings
    (user_id, stock_code, quantity, average_cost) VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, stock_code) DO UPDATE SET
      quantity = EXCLUDED.quantity, average_cost = EXCLUDED.average_cost,
      updated_at = now()`, [userId, stockCode, quantity, averageCost ?? null]);
  return listHoldings(lineUserId);
}

export async function removeHolding(lineUserId: string, stockCode: string) {
  await query(`DELETE FROM app_data.portfolio_holdings h USING app_data.users u
    WHERE h.user_id = u.id AND u.line_user_id = $1 AND h.stock_code = $2`,
  [lineUserId, stockCode]);
  return listHoldings(lineUserId);
}
