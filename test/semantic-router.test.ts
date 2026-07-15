import test from "node:test";
import assert from "node:assert/strict";
import {
  createSemanticRouter,
  validateSemanticClassification,
  type IntentClassifier,
  type SemanticClassification,
} from "../src/intents/semantic-router.js";

function classified(
  intent: SemanticClassification["intent"],
  confidence = 0.95,
  stockCode = "",
): IntentClassifier {
  return async () => ({ intent, confidence, stockCode });
}

test("semantic router understands stock-saving homophone typos", async () => {
  for (const message of ["存孤", "存古", "存骨"]) {
    const router = createSemanticRouter({
      enabled: true,
      classify: classified("stock_saving"),
    });
    const result = await router.route(message);
    assert.equal(result.mode, "local", message);
    assert.equal(result.intent, "holding_create_help", message);
    assert.match(result.reply ?? "", /想整理你的存股部位/, message);
    assert.match(result.reply ?? "", /新增持股/, message);
  }
});

test("semantic router maps natural help questions to fixed help copy", async () => {
  const router = createSemanticRouter({
    enabled: true,
    classify: classified("help"),
  });
  const result = await router.route("你能做什麼？");
  assert.equal(result.mode, "local");
  assert.equal(result.intent, "help");
  assert.match(result.reply ?? "", /看資料/);
  assert.match(result.reply ?? "", /AI 整理/);
});

test("semantic router validates extracted stock codes before routing", async () => {
  const valid = createSemanticRouter({
    enabled: true,
    classify: classified("stock_lookup", 0.97, "2330"),
  });
  const validResult = await valid.route("幫我看看 2330 最近怎樣");
  assert.equal(validResult.intent, "stock_lookup");
  assert.equal(validResult.params?.stockCode, "2330");

  const malformed = createSemanticRouter({
    enabled: true,
    classify: classified("stock_lookup", 0.97, "2330; DROP TABLE"),
  });
  assert.equal(
    (await malformed.route("幫我看看台積電")).intent,
    "analysis_choice",
  );

  const hallucinated = createSemanticRouter({
    enabled: true,
    classify: classified("stock_lookup", 0.97, "2330"),
  });
  assert.equal(
    (await hallucinated.route("幫我看看台積電")).intent,
    "analysis_choice",
  );
});

test("semantic check-in requests require deterministic confirmation", async () => {
  const router = createSemanticRouter({
    enabled: true,
    classify: classified("credit_check_in_help"),
  });
  const result = await router.route("可以幫我領今天的點數嗎");
  assert.equal(result.intent, "credit_check_in_help");
  assert.equal(result.mode, "local");
  assert.match(result.reply ?? "", /回我「我要簽到」確認/);
});

test("low-confidence, unknown and failed classifications use deterministic fallback", async () => {
  const lowConfidence = createSemanticRouter({
    enabled: true,
    minConfidence: 0.82,
    classify: classified("help", 0.7),
  });
  assert.equal((await lowConfidence.route("你大概能幹嘛")).intent, "analysis_choice");

  const unknown = createSemanticRouter({
    enabled: true,
    classify: classified("unknown", 0.99),
  });
  assert.equal((await unknown.route("123")).intent, "analysis_choice");

  const failed = createSemanticRouter({
    enabled: true,
    classify: async () => { throw new Error("timeout"); },
  });
  assert.equal((await failed.route("你能做啥")).intent, "analysis_choice");
});

test("deterministic actions never depend on or get replaced by the classifier", async () => {
  let calls = 0;
  const router = createSemanticRouter({
    enabled: true,
    classify: async () => {
      calls += 1;
      return { intent: "help", confidence: 1, stockCode: "" };
    },
  });

  const holding = await router.route(
    "新增持股 2330 50股 成本600 買進日2025-12-30",
  );
  const topUp = await router.route("儲值 30 點");
  const analysis = await router.route("分析持股");

  assert.equal(holding.intent, "holding_create");
  assert.equal(topUp.intent, "credit_top_up");
  assert.equal(analysis.intent, "analyze_holdings");
  assert.equal(calls, 0);
});

test("circuit breaker short-circuits repeated classifier failures", async () => {
  let calls = 0;
  let now = 1_000;
  const router = createSemanticRouter({
    enabled: true,
    failureThreshold: 2,
    circuitBreakerMs: 1_000,
    now: () => now,
    classify: async () => {
      calls += 1;
      throw new Error("throttled");
    },
  });

  await router.route("第一個未知問題");
  await router.route("第二個未知問題");
  await router.route("第三個未知問題");
  assert.equal(calls, 2);

  now += 1_001;
  await router.route("breaker 後再試");
  assert.equal(calls, 3);
});

test("classifier validation rejects intents outside the allowlist", () => {
  assert.throws(
    () => validateSemanticClassification({
      intent: "holding_create",
      confidence: 1,
      stockCode: "2330",
    }),
    /unsupported intent/,
  );
  assert.throws(
    () => validateSemanticClassification({
      intent: "help",
      confidence: 9,
      stockCode: "",
    }),
    /invalid confidence/,
  );
});


test("concurrency cap immediately falls back instead of queueing", async () => {
  let calls = 0;
  let release: ((value: SemanticClassification) => void) | undefined;
  const pending = new Promise<SemanticClassification>((resolve) => {
    release = resolve;
  });
  const router = createSemanticRouter({
    enabled: true,
    maxConcurrency: 1,
    classify: async () => {
      calls += 1;
      return pending;
    },
  });

  const first = router.route("第一個需要分類的問題");
  await Promise.resolve();
  const overflow = await router.route("第二個需要分類的問題");
  assert.equal(overflow.intent, "analysis_choice");
  assert.equal(calls, 1);

  release?.({ intent: "help", confidence: 0.95, stockCode: "" });
  assert.equal((await first).intent, "help");
});