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
    SELECT h.stock_code, s.stock_name, h.quantity, h.average_cost, h.purchase_date,
      h.sold_price, h.sold_quantity, h.sold_date,
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

/** 只回傳「持有中」（quantity>0）的部位；送給 agent 分析／作為 evidence 時使用，排除已賣出。 */
export async function listActiveHoldings(lineUserId: string) {
  const rows = await listHoldings(lineUserId) as Array<Record<string, unknown>>;
  return rows.filter((h) => (Number(h.quantity) || 0) > 0);
}

export async function upsertHolding(
  lineUserId: string, stockCode: string, quantity: number,
  averageCost?: number, purchaseDate?: string,
) {
  const userId = await ensureUser(lineUserId);
  await query(`INSERT INTO app_data.portfolio_holdings
    (user_id, stock_code, quantity, average_cost, purchase_date)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, stock_code) DO UPDATE SET
      quantity = EXCLUDED.quantity, average_cost = EXCLUDED.average_cost,
      purchase_date = EXCLUDED.purchase_date, updated_at = now()`,
  [userId, stockCode, quantity, averageCost ?? null, purchaseDate ?? null]);
  return listHoldings(lineUserId);
}

/** 新增庫存：只在該標的尚未存在時插入。已存在則不覆蓋（回傳 created=false）。 */
export async function createHolding(
  lineUserId: string, stockCode: string, quantity: number,
  averageCost?: number, purchaseDate?: string,
) {
  const userId = await ensureUser(lineUserId);
  const rows = await query<{ stock_code: string }>(`
    INSERT INTO app_data.portfolio_holdings
      (user_id, stock_code, quantity, average_cost, purchase_date)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, stock_code) DO NOTHING
    RETURNING stock_code`,
  [userId, stockCode, quantity, averageCost ?? null, purchaseDate ?? null]);
  return { created: rows.length > 0, holdings: await listHoldings(lineUserId) };
}

/**
 * 更新既有庫存的指定欄位（未提供的欄位維持不變）。
 * 全數賣出＝傳 quantity=0：會自動把賣出前的股數保存到 sold_quantity（供已實現損益計算），
 * 賣出價（soldPrice）、賣出日（soldDate）可留空，之後由使用者於 web 補上。
 */
export async function updateHolding(
  lineUserId: string, stockCode: string,
  fields: {
    quantity?: number; averageCost?: number; purchaseDate?: string;
    soldPrice?: number; soldDate?: string;
  },
) {
  const rows = await query<{ stock_code: string }>(`
    UPDATE app_data.portfolio_holdings h
    SET sold_quantity = CASE
          WHEN $3 IS NOT NULL AND $3 = 0 AND h.sold_quantity IS NULL AND h.quantity > 0
            THEN h.quantity
          ELSE h.sold_quantity END,
        quantity = COALESCE($3, h.quantity),
        average_cost = COALESCE($4, h.average_cost),
        purchase_date = COALESCE($5, h.purchase_date),
        sold_price = COALESCE($6, h.sold_price),
        sold_date = COALESCE($7, h.sold_date),
        updated_at = now()
    FROM app_data.users u
    WHERE h.user_id = u.id AND u.line_user_id = $1 AND h.stock_code = $2
    RETURNING h.stock_code`,
  [lineUserId, stockCode, fields.quantity ?? null, fields.averageCost ?? null,
    fields.purchaseDate ?? null, fields.soldPrice ?? null, fields.soldDate ?? null]);
  return { updated: rows.length > 0, holdings: await listHoldings(lineUserId) };
}

export async function removeHolding(lineUserId: string, stockCode: string) {
  await query(`DELETE FROM app_data.portfolio_holdings h USING app_data.users u
    WHERE h.user_id = u.id AND u.line_user_id = $1 AND h.stock_code = $2`,
  [lineUserId, stockCode]);
  return listHoldings(lineUserId);
}
