import test from "node:test";
import assert from "node:assert/strict";
import {
  createCreditService,
  taipeiBusinessDate,
  type CreditRepository,
} from "../src/services/credits.js";

function createMemoryRepository(): CreditRepository & { entries(userId: string): Array<{ type: string; amount: number }> } {
  const ledger = new Map<string, Array<{
    type: string;
    amount: number;
    businessDate?: string;
    reference?: string;
  }>>();
  const entries = (userId: string) => ledger.get(userId) ?? [];
  const balance = (userId: string) => entries(userId).reduce((sum, entry) => sum + entry.amount, 0);

  return {
    entries,
    async getStatus(userId, businessDate) {
      return {
        balance: balance(userId),
        checkedInToday: entries(userId).some(
          (entry) => entry.type === "daily_check_in" && entry.businessDate === businessDate,
        ),
      };
    },
    async recordDailyCheckIn(userId, businessDate, amount) {
      const current = entries(userId);
      const exists = current.some(
        (entry) => entry.type === "daily_check_in" && entry.businessDate === businessDate,
      );
      if (!exists) ledger.set(userId, [...current, { type: "daily_check_in", businessDate, amount }]);
      return { awarded: !exists, balance: balance(userId) };
    },
    async recordTopUp(userId, amount, reference) {
      ledger.set(userId, [...entries(userId), { type: "top_up", amount, reference }]);
      return { balance: balance(userId) };
    },
    async consumeQuestion(userId, reference) {
      if (balance(userId) < 1) return { consumed: false, balance: balance(userId) };
      ledger.set(userId, [...entries(userId), { type: "question", amount: -1, reference }]);
      return { consumed: true, balance: balance(userId) };
    },
    async refundQuestion(userId, reference) {
      if (!entries(userId).some((entry) => entry.type === "adjustment" && entry.reference === reference)) {
        ledger.set(userId, [...entries(userId), { type: "adjustment", amount: 1, reference }]);
      }
      return { balance: balance(userId) };
    },
  };
}

test("Taipei date is used for daily check-in", () => {
  assert.equal(taipeiBusinessDate(new Date("2026-07-15T16:30:00Z")), "2026-07-16");
});

test("daily check-in awards one credit once per Taiwan day", async () => {
  const credits = createCreditService({
    repository: createMemoryRepository(),
    now: () => new Date("2026-07-15T16:30:00Z"),
  });
  const first = await credits.checkIn("user-1");
  const second = await credits.checkIn("user-1");
  assert.equal(first.awarded, true);
  assert.equal(first.balance, 1);
  assert.equal(second.awarded, false);
  assert.equal(second.balance, 1);
});

test("top-up packages add tracked credits", async () => {
  const credits = createCreditService({ repository: createMemoryRepository() });
  const result = await credits.topUp("user-1", 30, "demo-1");
  assert.equal(result.balance, 30);
  await assert.rejects(() => credits.topUp("user-1", 7), /credits must be one of/);
});

test("unlimited mode authorizes without consuming a credit", async () => {
  const repository = createMemoryRepository();
  const credits = createCreditService({ repository, enforcementEnabled: false });
  const result = await credits.authorizeQuestion("user-1", "question-1");
  assert.equal(result.allowed, true);
  assert.equal(result.consumed, false);
  assert.equal(repository.entries("user-1").length, 0);
});

test("enforced mode consumes and can refund exactly one credit", async () => {
  const repository = createMemoryRepository();
  const credits = createCreditService({ repository, enforcementEnabled: true });
  await credits.topUp("user-1", 10, "demo-1");
  const authorization = await credits.authorizeQuestion("user-1", "question-1");
  assert.equal(authorization.balance, 9);
  const refund = await credits.refundQuestion("user-1", authorization);
  assert.equal(refund.balance, 10);
});
