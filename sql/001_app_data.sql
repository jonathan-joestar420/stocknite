CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text UNIQUE NOT NULL,
  portfolio_mode boolean NOT NULL DEFAULT false,
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_data.portfolio_holdings (
  user_id uuid NOT NULL REFERENCES app_data.users(id) ON DELETE CASCADE,
  stock_code text NOT NULL,
  quantity numeric(18, 4) NOT NULL CHECK (quantity > 0),
  average_cost numeric(18, 4) CHECK (average_cost >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stock_code)
);

CREATE TABLE IF NOT EXISTS app_data.notification_settings (
  user_id uuid PRIMARY KEY REFERENCES app_data.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  notification_time time NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'Asia/Taipei',
  concentration_threshold numeric(5, 4) NOT NULL DEFAULT 0.30
);

GRANT USAGE ON SCHEMA app_data TO stocknite_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_data TO stocknite_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app_data TO stocknite_app;
