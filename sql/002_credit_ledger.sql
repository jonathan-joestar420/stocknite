BEGIN;

CREATE TABLE IF NOT EXISTS app_data.credit_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_data.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('daily_check_in', 'top_up', 'question', 'adjustment')
  ),
  amount integer NOT NULL CHECK (amount <> 0),
  business_date date,
  reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_daily_check_in_once
  ON app_data.credit_ledger (user_id, event_type, business_date)
  WHERE event_type = 'daily_check_in';

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference_once
  ON app_data.credit_ledger (user_id, event_type, reference)
  WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_at
  ON app_data.credit_ledger (user_id, created_at DESC);

REVOKE UPDATE, DELETE, TRUNCATE ON app_data.credit_ledger FROM stocknite_app;
GRANT SELECT, INSERT ON app_data.credit_ledger TO stocknite_app;
GRANT USAGE, SELECT ON SEQUENCE app_data.credit_ledger_id_seq TO stocknite_app;

COMMENT ON TABLE app_data.credit_ledger IS
  'Append-only StockNite credit ledger. CREDIT_ENFORCEMENT_ENABLED=false keeps all users unlimited and writes no question debit.';

COMMIT;
