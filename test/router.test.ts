import test from "node:test";
import assert from "node:assert/strict";
import { routeIntent } from "../src/intents/router.js";

test("unknown messages return a warm local choice without pretending to understand", () => {
  const result = routeIntent("123");
  assert.equal(result.mode, "local");
  assert.equal(result.intent, "analysis_choice");
  assert.match(result.reply ?? "", /還沒接住/);
  assert.match(result.reply ?? "", /功能說明/);
  assert.match(result.reply ?? "", /分析持股/);
  assert.match(result.reply ?? "", /分析近況/);
  assert.doesNotMatch(result.reply ?? "", /我目前只會/);
});

test("common stock-saving typo gets a specific friendly prompt", () => {
  const result = routeIntent("存骨");
  assert.equal(result.mode, "local");
  assert.equal(result.intent, "holding_create_help");
  assert.match(result.reply ?? "", /想說「存股」/);
  assert.match(result.reply ?? "", /新增持股/);
  assert.match(result.reply ?? "", /我的持股/);
});

test("help groups real commands into natural choices", () => {
  const result = routeIntent("功能說明");
  assert.equal(result.mode, "local");
  assert.equal(result.intent, "help");
  assert.match(result.reply ?? "", /想做什麼/);
  assert.match(result.reply ?? "", /看資料/);
  assert.match(result.reply ?? "", /記錄與點數/);
  assert.match(result.reply ?? "", /AI 整理/);
});

test("only explicit analysis choices reach AgentCore", () => {
  assert.equal(routeIntent("分析持股").mode, "agentcore");
  assert.equal(routeIntent("分析近況").mode, "agentcore");
  assert.equal(routeIntent("我的持股").mode, "local");
  assert.equal(routeIntent("我的持股風險呢").mode, "local");
});

test("holding save help never reaches AgentCore", () => {
  const result = routeIntent("我要儲存股票");
  assert.equal(result.intent, "holding_create_help");
  assert.equal(result.mode, "local");
  assert.match(result.reply ?? "", /新增持股 2330/);
});

test("complete holding command becomes a local API action", () => {
  const result = routeIntent("新增持股 2330 50股 成本600 買進日2025-12-30");
  assert.equal(result.intent, "holding_create");
  assert.deepEqual(result.params, {
    stockCode: "2330",
    quantity: 50,
    averageCost: 600,
    purchaseDate: "2025-12-30",
  });
});

test("incomplete holding command lists missing fields", () => {
  const result = routeIntent("今天買了 2330 50股");
  assert.equal(result.intent, "holding_create_help");
  assert.deepEqual(result.params?.missing, ["成本", "買進日期"]);
});

test("credit commands remain local", () => {
  assert.equal(routeIntent("我要簽到").intent, "credit_check_in");
  assert.equal(routeIntent("我的點數").intent, "credit_balance");
  const topUp = routeIntent("儲值 30 點");
  assert.equal(topUp.intent, "credit_top_up");
  assert.equal(topUp.params?.credits, 30);
});
