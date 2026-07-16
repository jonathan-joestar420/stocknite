import Fastify, { type FastifyRequest } from "fastify";
import { analyzeHoldingsWithBedrock, invokeAgentCore } from "./agent/adapter.js";
import { config } from "./config.js";
import { databaseHealth, pool } from "./db.js";
import { registerFeatureRoutes } from "./http/features.js";
import { handleLineEvents } from "./line/handler.js";
import { lineMenu } from "./line/menu.js";
import { verifyLineSignature } from "./line/signature.js";
import { getMarketSentiment, getStockDailySnapshot, getStockHistory, getStockSummary } from "./services/market.js";
import { createHolding, listActiveHoldings, listHoldings, removeHolding, updateHolding, upsertHolding } from "./services/portfolio.js";
import { buildDashboard, buildHoldingsHealthCheckPayload } from "./services/dashboard.js";
import {
  authorizeUrl, exchangeCodeForUserId, newState, readCookie, signSession, verifySession,
} from "./line/login.js";
import { landingPage, portfolioPage } from "./web.js";

type RawRequest = FastifyRequest & { rawBody?: Buffer };
const app = Fastify({ logger: true });

app.addContentTypeParser("application/json", { parseAs: "buffer" },
  (request, body, done) => {
    const raw = body as Buffer;
    (request as RawRequest).rawBody = raw;
    try { done(null, JSON.parse(raw.toString("utf8"))); }
    catch (error) { done(error as Error, undefined); }
  });

function userId(request: FastifyRequest): string | undefined {
  const value = request.headers["x-line-user-id"];
  return Array.isArray(value) ? value[0] : value;
}

app.get("/", async (_, reply) => reply.type("text/html").send(landingPage()));
app.get("/privacy", async (_, reply) => reply.type("text/plain").send(
  "股奈只在使用者確認後保存持股，使用者可要求刪除。資料分析不構成投資建議。",
));
app.get("/api/health", async () => ({
  status: "ok", database: await databaseHealth(),
  lineConfigured: Boolean(config.lineChannelSecret && config.lineAccessToken),
  agentCoreConfigured: Boolean(config.agentCoreArn || config.agentCoreEndpoint),
}));
app.get("/api/line/menu", async () => ({ buttons: lineMenu }));

// ---- LINE Login（網頁登入看持股）----
app.get("/auth/line/login", async (_, reply) => {
  if (!config.lineLoginChannelId) {
    return reply.code(503).type("text/plain").send("LINE 登入尚未設定（缺 LINE_LOGIN_CHANNEL_ID）。");
  }
  const state = newState();
  reply.header("set-cookie",
    `sn_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return reply.redirect(authorizeUrl(state));
});

app.get<{ Querystring: { code?: string; state?: string } }>(
  "/auth/line/callback", async (request, reply) => {
    const { code, state } = request.query;
    const savedState = readCookie(request.headers.cookie, "sn_state");
    if (!code || !state || !savedState || state !== savedState) {
      return reply.code(400).type("text/plain").send("登入驗證失敗，請重新登入。");
    }
    try {
      const profile = await exchangeCodeForUserId(code);
      request.log.info("line_login_ok");
      reply.header("set-cookie", [
        "sn_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        `sn_session=${signSession(profile.userId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      ]);
      return reply.redirect("/me");
    } catch (error) {
      request.log.error(error, "line login callback failed");
      return reply.code(502).type("text/plain").send("LINE 登入失敗，請稍後再試。");
    }
  });

app.get("/auth/logout", async (_, reply) => {
  reply.header("set-cookie", "sn_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return reply.redirect("/");
});

function sessionUser(request: FastifyRequest): string | undefined {
  return verifySession(readCookie(request.headers.cookie, "sn_session"));
}

app.get("/me", async (request, reply) => {
  const userId = sessionUser(request);
  if (!userId) return reply.redirect("/auth/line/login");
  const holdings = await listHoldings(userId) as Parameters<typeof portfolioPage>[0];
  return reply.type("text/html").send(portfolioPage(holdings));
});

// 單次 AI 持股體檢：限登入者。把持有中部位 + CMoney 歷史數據交給 Bedrock Claude Sonnet 單次分析。
app.post("/api/analyze", async (request, reply) => {
  const userId = sessionUser(request);
  if (!userId) return reply.code(401).send({ error: "login_required" });
  // 只分析持有中的部位；已賣出（quantity=0）不納入體檢。
  const payload = await buildHoldingsHealthCheckPayload(userId);
  if (!payload.count) {
    return {
      mode: "local",
      intent: "analyze_holdings_empty",
      answer: "目前還沒有持有中的部位可以分析～先新增持股後再回來看看吧。",
    };
  }
  const result = await analyzeHoldingsWithBedrock(JSON.stringify(payload));
  return { mode: result.mode, intent: "analyze_holdings", answer: result.answer };
});

// 持股儀表板資料（限登入者）：每檔持股的價格走勢、社群情緒走勢與白話解讀。
app.get("/api/dashboard", async (request, reply) => {
  const userId = sessionUser(request);
  if (!userId) return reply.code(401).send({ error: "login_required" });
  return buildDashboard(userId);
});

// 過去持有：使用者補上賣出價與賣出日期（限登入者），供計算已實現損益。
app.post<{ Params: { code: string }; Body: { soldPrice?: number; soldDate?: string } }>(
  "/api/portfolio/holdings/:code/sold", async (request, reply) => {
    const userId = sessionUser(request);
    if (!userId) return reply.code(401).send({ error: "login_required" });
    const { soldPrice, soldDate } = request.body ?? {};
    if (soldPrice !== undefined && (!Number.isFinite(Number(soldPrice)) || Number(soldPrice) < 0)) {
      return reply.code(400).send({ error: "invalid_sold_price" });
    }
    if (soldDate !== undefined && soldDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(soldDate)) {
      return reply.code(400).send({ error: "invalid_sold_date", expected: "YYYY-MM-DD" });
    }
    const result = await updateHolding(userId, request.params.code, {
      soldPrice: soldPrice === undefined ? undefined : Number(soldPrice),
      soldDate: soldDate ? soldDate : undefined,
    });
    if (!result.updated) return reply.code(404).send({ error: "holding_not_found" });
    return { ok: true, holdings: result.holdings };
  });

// 固定意圖、AI assistant 與 credit APIs。
registerFeatureRoutes(app, sessionUser);

app.get<{ Params: { code: string } }>("/api/stocks/:code", async (request, reply) => {
  const data = await getStockSummary(request.params.code);
  return data ?? reply.code(404).send({ error: "stock_not_found" });
});
app.get<{ Params: { code: string }; Querystring: { date?: string } }>(
  "/api/stocks/:code/day", async (request, reply) => {
    const date = request.query.date ?? "";
    if (!/^\d{4}-?\d{2}-?\d{2}$/.test(date)) {
      return reply.code(400).send({ error: "invalid_date", expected: "YYYY-MM-DD" });
    }
    const data = await getStockDailySnapshot(request.params.code, date);
    return data ?? reply.code(404).send({ error: "stock_or_date_not_found" });
  });
app.get<{ Params: { code: string }; Querystring: { limit?: string } }>(
  "/api/stocks/:code/history", async (request) => {
    const limit = Math.min(365, Math.max(1, Number(request.query.limit ?? 90)));
    return getStockHistory(request.params.code, limit);
  });
app.get("/api/market/sentiment", getMarketSentiment);
app.get("/api/portfolio", async (request, reply) => {
  const id = userId(request);
  if (!id) return reply.code(401).send({ error: "missing_line_user" });
  return listHoldings(id);
});
app.post<{ Body: { stockCode?: string; quantity?: number; averageCost?: number; purchaseDate?: string } }>(
  "/api/portfolio/holdings", async (request, reply) => {
    const id = userId(request);
    const { stockCode, quantity, averageCost, purchaseDate } = request.body;
    if (!id) return reply.code(401).send({ error: "missing_line_user" });
    if (!stockCode || !quantity || quantity <= 0) {
      return reply.code(400).send({ error: "invalid_holding" });
    }
    return upsertHolding(id, stockCode, quantity, averageCost, purchaseDate);
  });
app.delete<{ Params: { code: string } }>(
  "/api/portfolio/holdings/:code", async (request, reply) => {
    const id = userId(request);
    if (!id) return reply.code(401).send({ error: "missing_line_user" });
    return removeHolding(id, request.params.code);
  });
// ---- Agent-facing 庫存 API（供 AgentCore agent 以 HTTP 調用）----
// 認證：header `x-agent-key` 必須等於 AGENT_API_KEY；使用者以 body/query 的 lineUserId 指定。
function agentAuthed(request: FastifyRequest): boolean {
  const key = request.headers["x-agent-key"];
  const value = Array.isArray(key) ? key[0] : key;
  return Boolean(config.agentApiKey) && value === config.agentApiKey;
}

app.get<{ Querystring: { lineUserId?: string } }>(
  "/api/agent/holdings", async (request, reply) => {
    if (!agentAuthed(request)) return reply.code(401).send({ error: "unauthorized" });
    const lineUserId = request.query.lineUserId;
    if (!lineUserId) return reply.code(400).send({ error: "missing_lineUserId" });
    return listHoldings(lineUserId);
  });

// 新增（Create）：只新增，不覆蓋既有；標的已存在回 409。
app.post<{ Body: {
  lineUserId?: string; stockCode?: string; quantity?: number;
  averageCost?: number; purchaseDate?: string;
} }>("/api/agent/holdings", async (request, reply) => {
  if (!agentAuthed(request)) return reply.code(401).send({ error: "unauthorized" });
  const { lineUserId, stockCode, quantity, averageCost, purchaseDate } = request.body;
  if (!lineUserId || !stockCode || quantity === undefined || quantity < 0) {
    return reply.code(400).send({ error: "invalid_holding", need: ["lineUserId", "stockCode", "quantity>=0"] });
  }
  const summary = await getStockSummary(stockCode);
  if (!summary) return reply.code(400).send({ error: "unsupported_stock", stockCode });
  const result = await createHolding(lineUserId, stockCode, quantity, averageCost, purchaseDate);
  if (!result.created) {
    return reply.code(409).send({ error: "already_exists", stockCode, hint: "use PUT /api/agent/holdings to update" });
  }
  return { ok: true, created: true, holdings: result.holdings };
});

// 更新（Update）：更新既有標的欄位；全數賣出時傳 quantity=0 + soldPrice。標的不存在回 404。
app.put<{ Body: {
  lineUserId?: string; stockCode?: string; quantity?: number;
  averageCost?: number; purchaseDate?: string; soldPrice?: number; soldDate?: string;
} }>("/api/agent/holdings", async (request, reply) => {
  if (!agentAuthed(request)) return reply.code(401).send({ error: "unauthorized" });
  const { lineUserId, stockCode, quantity, averageCost, purchaseDate, soldPrice, soldDate } = request.body;
  if (!lineUserId || !stockCode) {
    return reply.code(400).send({ error: "invalid_request", need: ["lineUserId", "stockCode"] });
  }
  if (quantity !== undefined && quantity < 0) {
    return reply.code(400).send({ error: "invalid_quantity", need: ["quantity>=0"] });
  }
  const result = await updateHolding(lineUserId, stockCode, { quantity, averageCost, purchaseDate, soldPrice, soldDate });
  if (!result.updated) {
    return reply.code(404).send({ error: "holding_not_found", stockCode, hint: "use POST /api/agent/holdings to create" });
  }
  return { ok: true, updated: true, holdings: result.holdings };
});

app.post<{ Body: { message?: string; lineUserId?: string } }>(
  "/api/agent/analyze", async (request, reply) => {
    if (!agentAuthed(request)) return reply.code(401).send({ error: "unauthorized" });
    const { message, lineUserId } = request.body;
    if (!message) return reply.code(400).send({ error: "missing_message" });
    if (!lineUserId) return reply.code(400).send({ error: "missing_lineUserId" });
    const holdings = await listActiveHoldings(lineUserId);
    return invokeAgentCore({
      userId: lineUserId,
      message,
      evidence: { holdings },
    });
  });

app.post("/api/line/webhook", async (request, reply) => {
  if (!config.lineChannelSecret) {
    return reply.code(503).send({ error: "line_not_configured" });
  }
  const signature = request.headers["x-line-signature"] as string | undefined;
  const rawBody = (request as RawRequest).rawBody;
  if (!rawBody || !verifyLineSignature(rawBody, signature, config.lineChannelSecret)) {
    return reply.code(401).send({ error: "invalid_signature" });
  }
  const body = request.body as { events?: Parameters<typeof handleLineEvents>[0] };
  await handleLineEvents(body.events ?? []);
  return { ok: true };
});

async function shutdown() {
  await app.close();
  await pool?.end();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: config.host, port: config.port });
