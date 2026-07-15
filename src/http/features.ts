import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { routeIntent } from "../intents/router.js";
import { conversationService } from "../services/conversation.js";
import { creditService } from "../services/credits.js";

function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionUser: (request: FastifyRequest) => string | undefined,
): string | undefined {
  const userId = sessionUser(request);
  if (!userId) reply.code(401).send({ error: "login_required" });
  return userId;
}

export function registerFeatureRoutes(
  app: FastifyInstance,
  sessionUser: (request: FastifyRequest) => string | undefined,
): void {
  // 只解析意圖，不會呼叫 AgentCore；方便網站預覽下一步。
  app.post<{ Body: { message?: string } }>("/api/intents/resolve", async (request, reply) => {
    const userId = requireUser(request, reply, sessionUser);
    if (!userId) return reply;
    const message = request.body?.message?.trim();
    if (!message) return reply.code(400).send({ error: "missing_message" });
    return routeIntent(message);
  });

  app.post<{ Body: { message?: string } }>("/api/assistant", async (request, reply) => {
    const userId = requireUser(request, reply, sessionUser);
    if (!userId) return reply;
    const message = request.body?.message?.trim();
    if (!message) return reply.code(400).send({ error: "missing_message" });
    const result = await conversationService.handle({ userId, message });
    return {
      mode: result.mode,
      intent: result.intent,
      answer: result.answer,
      credit: result.credit,
    };
  });

  app.get("/api/credits", async (request, reply) => {
    const userId = requireUser(request, reply, sessionUser);
    if (!userId) return reply;
    return creditService.status(userId);
  });

  app.post("/api/credits/check-in", async (request, reply) => {
    const userId = requireUser(request, reply, sessionUser);
    if (!userId) return reply;
    return creditService.checkIn(userId);
  });

  app.post<{ Body: { credits?: number; reference?: string } }>(
    "/api/credits/top-up",
    async (request, reply) => {
      const userId = requireUser(request, reply, sessionUser);
      if (!userId) return reply;
      try {
        return await creditService.topUp(
          userId,
          Number(request.body?.credits),
          request.body?.reference ?? `api:${Date.now()}`,
        );
      } catch (error) {
        const typed = error as Error & { code?: string };
        if (typed.code === "INVALID_TOP_UP_PACKAGE") {
          return reply.code(400).send({
            error: "invalid_top_up_package",
            message: typed.message,
          });
        }
        throw error;
      }
    },
  );
}
