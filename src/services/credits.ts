import { config } from "../config.js";
import { query } from "../db.js";

export const DEFAULT_TOP_UP_PACKAGES = Object.freeze([10, 30, 100]);

export interface CreditStatus {
  balance: number;
  checkedInToday: boolean;
  businessDate: string;
  enforcementEnabled: boolean;
  unlimited: boolean;
  dailyCheckInCredits: number;
  topUpPackages: number[];
}

export interface CreditAuthorization {
  allowed: boolean;
  consumed: boolean;
  reason: "unlimited_mode" | "credit_consumed" | "insufficient_credit";
  reference: string;
  balance: number;
  enforcementEnabled: boolean;
  unlimited: boolean;
  refunded?: boolean;
}

export interface CreditRepository {
  getStatus(lineUserId: string, businessDate: string): Promise<{
    balance: number;
    checkedInToday: boolean;
  }>;
  recordDailyCheckIn(lineUserId: string, businessDate: string, amount: number): Promise<{
    awarded: boolean;
    balance: number;
  }>;
  recordTopUp(lineUserId: string, amount: number, reference?: string): Promise<{
    balance: number;
  }>;
  consumeQuestion(lineUserId: string, reference: string): Promise<{
    consumed: boolean;
    balance: number;
  }>;
  refundQuestion(lineUserId: string, reference: string): Promise<{
    balance: number;
  }>;
}

export interface CreditService {
  status(lineUserId: string): Promise<CreditStatus>;
  checkIn(lineUserId: string): Promise<{
    awarded: boolean;
    balance: number;
    businessDate: string;
    awardedCredits: number;
    enforcementEnabled: boolean;
    unlimited: boolean;
  }>;
  topUp(lineUserId: string, credits: number, reference?: string): Promise<{
    balance: number;
    addedCredits: number;
    enforcementEnabled: boolean;
    unlimited: boolean;
  }>;
  authorizeQuestion(lineUserId: string, reference: string): Promise<CreditAuthorization>;
  refundQuestion(lineUserId: string, authorization: CreditAuthorization): Promise<CreditAuthorization>;
}

export function taipeiBusinessDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function createPostgresCreditRepository(queryFn: typeof query): CreditRepository {
  async function ensureUser(lineUserId: string): Promise<string> {
    const rows = await queryFn<{ id: string }>(
      `INSERT INTO app_data.users (line_user_id, portfolio_mode, consented_at)
       VALUES ($1, true, now())
       ON CONFLICT (line_user_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [lineUserId],
    );
    return rows[0]!.id;
  }

  async function balanceForUserId(userId: string): Promise<number> {
    const rows = await queryFn<{ balance: number }>(
      `SELECT COALESCE(SUM(amount), 0)::integer AS balance
       FROM app_data.credit_ledger
       WHERE user_id = $1::uuid`,
      [userId],
    );
    return Number(rows[0]?.balance ?? 0);
  }

  return {
    async getStatus(lineUserId, businessDate) {
      const userId = await ensureUser(lineUserId);
      const rows = await queryFn<{ balance: number; checked_in_today: boolean }>(
        `SELECT
           COALESCE(SUM(amount), 0)::integer AS balance,
           COALESCE(BOOL_OR(event_type = 'daily_check_in' AND business_date = $2), false) AS checked_in_today
         FROM app_data.credit_ledger
         WHERE user_id = $1::uuid`,
        [userId, businessDate],
      );
      return {
        balance: Number(rows[0]?.balance ?? 0),
        checkedInToday: Boolean(rows[0]?.checked_in_today),
      };
    },

    async recordDailyCheckIn(lineUserId, businessDate, amount) {
      const userId = await ensureUser(lineUserId);
      const rows = await queryFn<{ id: string }>(
        `INSERT INTO app_data.credit_ledger
           (user_id, event_type, amount, business_date, metadata)
         VALUES ($1::uuid, 'daily_check_in', $2, $3, '{"source":"user_check_in"}'::jsonb)
         ON CONFLICT (user_id, event_type, business_date) DO NOTHING
         RETURNING id`,
        [userId, amount, businessDate],
      );
      return {
        awarded: rows.length > 0,
        balance: await balanceForUserId(userId),
      };
    },

    async recordTopUp(lineUserId, amount, reference) {
      const userId = await ensureUser(lineUserId);
      await queryFn(
        `INSERT INTO app_data.credit_ledger
           (user_id, event_type, amount, reference, metadata)
         VALUES ($1::uuid, 'top_up', $2, $3, '{"source":"demo_top_up"}'::jsonb)`,
        [userId, amount, reference ?? null],
      );
      return { balance: await balanceForUserId(userId) };
    },

    async consumeQuestion(lineUserId, reference) {
      const userId = await ensureUser(lineUserId);
      const rows = await queryFn<{ id: string }>(
        `WITH locked AS (
           SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
         ), balance AS (
           SELECT COALESCE(SUM(amount), 0)::integer AS value
           FROM app_data.credit_ledger, locked
           WHERE user_id = $1::uuid
         )
         INSERT INTO app_data.credit_ledger
           (user_id, event_type, amount, reference, metadata)
         SELECT $1::uuid, 'question', -1, $2, '{"source":"agentcore"}'::jsonb
         FROM balance
         WHERE value >= 1
         RETURNING id`,
        [userId, reference],
      );
      return {
        consumed: rows.length > 0,
        balance: await balanceForUserId(userId),
      };
    },

    async refundQuestion(lineUserId, reference) {
      const userId = await ensureUser(lineUserId);
      await queryFn(
        `INSERT INTO app_data.credit_ledger
           (user_id, event_type, amount, reference, metadata)
         VALUES ($1::uuid, 'adjustment', 1, $2, '{"source":"agentcore_refund"}'::jsonb)
         ON CONFLICT (user_id, event_type, reference) WHERE reference IS NOT NULL
         DO NOTHING`,
        [userId, `refund:${reference}`],
      );
      return { balance: await balanceForUserId(userId) };
    },
  };
}

export function createCreditService({
  repository,
  enforcementEnabled = false,
  dailyCheckInCredits = 1,
  topUpPackages = DEFAULT_TOP_UP_PACKAGES,
  now = () => new Date(),
}: {
  repository: CreditRepository;
  enforcementEnabled?: boolean;
  dailyCheckInCredits?: number;
  topUpPackages?: readonly number[];
  now?: () => Date;
}): CreditService {
  const packages = [...topUpPackages];

  async function status(lineUserId: string): Promise<CreditStatus> {
    const businessDate = taipeiBusinessDate(now());
    const current = await repository.getStatus(lineUserId, businessDate);
    return {
      ...current,
      businessDate,
      enforcementEnabled,
      unlimited: !enforcementEnabled,
      dailyCheckInCredits,
      topUpPackages: packages,
    };
  }

  return {
    status,

    async checkIn(lineUserId) {
      const businessDate = taipeiBusinessDate(now());
      const result = await repository.recordDailyCheckIn(
        lineUserId,
        businessDate,
        dailyCheckInCredits,
      );
      return {
        ...result,
        businessDate,
        awardedCredits: result.awarded ? dailyCheckInCredits : 0,
        enforcementEnabled,
        unlimited: !enforcementEnabled,
      };
    },

    async topUp(lineUserId, credits, reference) {
      if (!Number.isInteger(credits) || !packages.includes(credits)) {
        const error = new Error(`credits must be one of: ${packages.join(", ")}`) as Error & { code?: string };
        error.code = "INVALID_TOP_UP_PACKAGE";
        throw error;
      }
      const result = await repository.recordTopUp(lineUserId, credits, reference);
      return {
        ...result,
        addedCredits: credits,
        enforcementEnabled,
        unlimited: !enforcementEnabled,
      };
    },

    async authorizeQuestion(lineUserId, reference) {
      if (!enforcementEnabled) {
        const current = await status(lineUserId);
        return {
          allowed: true,
          consumed: false,
          reason: "unlimited_mode",
          reference,
          balance: current.balance,
          enforcementEnabled: false,
          unlimited: true,
        };
      }

      const result = await repository.consumeQuestion(lineUserId, reference);
      return {
        allowed: result.consumed,
        consumed: result.consumed,
        reason: result.consumed ? "credit_consumed" : "insufficient_credit",
        reference,
        balance: result.balance,
        enforcementEnabled: true,
        unlimited: false,
      };
    },

    async refundQuestion(lineUserId, authorization) {
      if (!authorization.consumed) return authorization;
      const result = await repository.refundQuestion(lineUserId, authorization.reference);
      return { ...authorization, refunded: true, balance: result.balance };
    },
  };
}

export const creditService = createCreditService({
  repository: createPostgresCreditRepository(query),
  enforcementEnabled: config.creditEnforcementEnabled,
});
