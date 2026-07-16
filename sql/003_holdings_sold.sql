-- 過去持有（已賣出）支援：保存賣出股數與賣出日期，供已實現損益計算。
-- idempotent：可重複套用。
ALTER TABLE app_data.portfolio_holdings
  ADD COLUMN IF NOT EXISTS sold_quantity numeric(18, 4) CHECK (sold_quantity >= 0);
ALTER TABLE app_data.portfolio_holdings
  ADD COLUMN IF NOT EXISTS sold_date date;
