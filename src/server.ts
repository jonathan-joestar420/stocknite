import Fastify, { type FastifyRequest } from "fastify";
import { invokeAgentCore } from "./agent/adapter.js";
import { config } from "./config.js";
import { databaseHealth, pool } from "./db.js";
import { handleLineEvents } from "./line/handler.js";
import { lineMenu } from "./line/menu.js";
import { verifyLineSignature } from "./line/signature.js";
import { getMarketSentiment, getStockDailySnapshot, getStockHistory, getStockSummary } from "./services/market.js";
import { listHoldings, removeHolding, upsertHolding } from "./services/portfolio.js";
import { landingPage } from "./web.js";

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
app.post<{ Body: { message?: string; evidence?: unknown } }>(
  "/api/agent/analyze", async (request, reply) => {
    const id = userId(request);
    if (!id) return reply.code(401).send({ error: "missing_line_user" });
    if (!request.body.message) return reply.code(400).send({ error: "missing_message" });
    return invokeAgentCore({ userId: id, ...request.body, message: request.body.message });
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
