import test from "node:test";
import assert from "node:assert/strict";
import { createConversationService } from "../src/services/conversation.js";
import type { CreditAuthorization, CreditService } from "../src/services/credits.js";

function fixture(overrides: Partial<Parameters<typeof createConversationService>[0]> = {}) {
  const calls = { agent: 0, holdings: 0, authorize: 0, refund: 0, checkIn: 0 };
  const unlimitedAuthorization: CreditAuthorization = {
    allowed: true,
    consumed: false,
    reason: "unlimited_mode",
    reference: "test-ref",
    balance: 0,
    enforcementEnabled: false,
    unlimited: true,
  };
  const credits: CreditService = {
    async status() {
      return {
        balance: 0,
        checkedInToday: false,
        businessDate: "2026-07-16",
        enforcementEnabled: false,
        unlimited: true,
        dailyCheckInCredits: 1,
        topUpPackages: [10, 30, 100],
      };
    },
    async checkIn() {
      calls.checkIn += 1;
      return {
        awarded: true,
        balance: 1,
        businessDate: "2026-07-16",
        awardedCredits: 1,
        enforcementEnabled: false,
        unlimited: true,
      };
    },
    async topUp(_userId, amount) {
      return { balance: amount, addedCredits: amount, enforcementEnabled: false, unlimited: true };
    },
    async authorizeQuestion() {
      calls.authorize += 1;
      return unlimitedAuthorization;
    },
    async refundQuestion(_userId, authorization) {
      calls.refund += 1;
      return { ...authorization, refunded: true };
    },
  };

  const service = createConversationService({
    async listHoldings() {
      calls.holdings += 1;
      return [{ stock_code: "2330", stock_name: "台積電", quantity: "10", average_cost: "600" }];
    },
    async getMarketSentiment() {
      return { activity_date: "2025-12-31", posts: 100 };
    },
    async getStockSummary(stockCode) {
      return { stock_code: stockCode, stock_name: "台積電", close_price: 1550 };
    },
    async upsertHolding() {
      return [];
    },
    async invokeAgentCore() {
      calls.agent += 1;
      return { mode: "agentcore", answer: "agent answer" };
    },
    credits,
    ...overrides,
  });
  return { service, calls };
}

test("unknown text returns fixed choice without AgentCore", async () => {
  const { service, calls } = fixture();
  const result = await service.handle({ userId: "user-1", message: "台積電今天怎麼了" });
  assert.equal(result.mode, "local");
  assert.equal(result.intent, "analysis_choice");
  assert.equal(calls.agent, 0);
});

test("analyze holdings loads the user's holdings before AgentCore", async () => {
  const requests: unknown[] = [];
  const { service, calls } = fixture({
    async invokeAgentCore(request) {
      requests.push(request);
      return { mode: "agentcore", answer: "agent answer" };
    },
  });
  const result = await service.handle({ userId: "user-1", message: "分析持股" });
  assert.equal(result.mode, "agentcore");
  assert.equal(calls.holdings, 1);
  const request = requests[0] as { evidence: { holdings: Array<{ stock_code: string }> } };
  assert.equal(request.evidence.holdings[0]?.stock_code, "2330");
});

test("empty portfolio stays local and does not authorize credit", async () => {
  const { service, calls } = fixture({ async listHoldings() { return []; } });
  const result = await service.handle({ userId: "user-1", message: "分析持股" });
  assert.equal(result.intent, "analyze_holdings_empty");
  assert.equal(calls.authorize, 0);
  assert.equal(calls.agent, 0);
});

test("AgentCore failure triggers refund handling", async () => {
  const { service, calls } = fixture({
    async invokeAgentCore() {
      throw new Error("runtime 502");
    },
  });
  await assert.rejects(
    () => service.handle({ userId: "user-1", message: "分析持股" }),
    /runtime 502/,
  );
  assert.equal(calls.authorize, 1);
  assert.equal(calls.refund, 1);
});

test("check-in stays local", async () => {
  const { service, calls } = fixture();
  const result = await service.handle({ userId: "user-1", message: "我要簽到" });
  assert.equal(result.intent, "credit_check_in");
  assert.equal(calls.checkIn, 1);
  assert.equal(calls.agent, 0);
});


test("semantic check-in help never writes the credit ledger", async () => {
  const { service, calls } = fixture({
    async routeMessage() {
      return {
        intent: "credit_check_in_help",
        mode: "local",
        handled: true,
        reply: "想簽到嗎？回我「我要簽到」確認後再執行。",
      };
    },
  });
  const result = await service.handle({
    userId: "user-1",
    message: "可以幫我領今天的點數嗎",
  });
  assert.equal(result.intent, "credit_check_in_help");
  assert.equal(calls.checkIn, 0);
  assert.equal(calls.agent, 0);
});