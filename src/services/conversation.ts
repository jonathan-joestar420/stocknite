import { randomUUID } from "node:crypto";
import {
  invokeAgentCore,
  type AgentRequest,
  type AgentResponse,
} from "../agent/adapter.js";
import { routeIntent } from "../intents/router.js";
import { getMarketSentiment, getStockSummary } from "./market.js";
import { listHoldings, upsertHolding } from "./portfolio.js";
import {
  creditService,
  type CreditAuthorization,
  type CreditService,
} from "./credits.js";

type DataRow = Record<string, unknown>;

export interface ConversationResult {
  mode: "local" | "agentcore";
  intent: string;
  answer: string;
  data?: unknown;
  credit?: unknown;
}

export interface ConversationDependencies {
  listHoldings(userId: string): Promise<DataRow[]>;
  getMarketSentiment(): Promise<DataRow | null>;
  getStockSummary(stockCode: string): Promise<DataRow | null>;
  upsertHolding(
    userId: string,
    stockCode: string,
    quantity: number,
    averageCost?: number,
    purchaseDate?: string,
  ): Promise<DataRow[]>;
  invokeAgentCore(request: AgentRequest): Promise<AgentResponse>;
  credits: CreditService;
}

function formatNumber(value: unknown, digits = 0): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("zh-TW", { maximumFractionDigits: digits })
    : "—";
}

function formatHoldings(rows: DataRow[]): string {
  if (!rows.length) {
    return "你目前沒有持股。請先輸入「我要儲存股票」查看新增格式。";
  }
  return [
    "你目前的持股：",
    ...rows.map((holding) =>
      `• ${holding.stock_name ?? ""} ${holding.stock_code}｜${formatNumber(holding.quantity)} 股｜成本 ${formatNumber(holding.average_cost, 2)}`,
    ),
  ].join("\n");
}

function formatMarket(market: DataRow | null): string {
  if (!market) return "目前沒有可用的市場近況資料。";
  return [
    `市場資料日期：${market.activity_date ?? "—"}`,
    `討論數：${formatNumber(market.posts)}`,
    `看多：${formatNumber(market.bullish)}`,
    `看空：${formatNumber(market.bearish)}`,
    `中立：${formatNumber(market.neutral)}`,
  ].join("\n");
}

function formatStock(stock: DataRow | null): string | null {
  if (!stock) return null;
  return [
    `${stock.stock_name ?? ""} ${stock.stock_code}`,
    `收盤價：${formatNumber(stock.close_price, 2)}`,
    `年度報酬：${formatNumber(stock.annual_return_pct, 2)}%`,
    `年度區間：${formatNumber(stock.year_low, 2)} ～ ${formatNumber(stock.year_high, 2)}`,
    "資料截至 2025-12-31。",
  ].join("\n");
}

function creditModeText(unlimited: boolean): string {
  return unlimited
    ? "現在仍是無限使用模式。"
    : "每次 AI 分析會扣除 1 credit。";
}

export function createConversationService(dependencies: ConversationDependencies) {
  const {
    listHoldings: loadHoldings,
    getMarketSentiment: loadMarket,
    getStockSummary: loadStock,
    upsertHolding: saveHolding,
    invokeAgentCore: invokeAgent,
    credits,
  } = dependencies;

  async function authorizeAgentCore(userId: string, intent: string) {
    return credits.authorizeQuestion(userId, `${intent}:${randomUUID()}`);
  }

  async function invokeWithRefund(
    userId: string,
    authorization: CreditAuthorization,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    try {
      return await invokeAgent(request);
    } catch (error) {
      try {
        await credits.refundQuestion(userId, authorization);
      } catch (refundError) {
        console.error("credit refund failed", refundError);
      }
      throw error;
    }
  }

  return {
    inspect: routeIntent,

    async handle({ userId, message }: { userId: string; message: string }): Promise<ConversationResult> {
      if (!userId) throw new Error("userId is required");
      const route = routeIntent(message);

      if (route.mode === "agentcore") {
        if (route.intent === "analyze_holdings") {
          const holdings = await loadHoldings(userId);
          if (!holdings.length) {
            return {
              mode: "local",
              intent: "analyze_holdings_empty",
              answer: "你目前沒有持股。請先輸入「我要儲存股票」完成新增。",
            };
          }

          const authorization = await authorizeAgentCore(userId, route.intent);
          if (!authorization.allowed) {
            return {
              mode: "local",
              intent: "insufficient_credit",
              answer: "點數不足。可以先輸入「我要簽到」或「我要儲值」。",
              credit: authorization,
            };
          }

          const response = await invokeWithRefund(userId, authorization, {
            userId,
            message: [
              "請根據 current_holdings 分析這位使用者目前的持股需求。",
              "先列出目前持股，再說明資料是否完整、集中度，以及下一步值得查看的項目。",
              "不要新增、修改或刪除任何持股。",
            ].join("\n"),
            evidence: { holdings },
          });
          return {
            mode: "agentcore",
            intent: route.intent,
            answer: response.answer,
            data: response.data,
            credit: authorization,
          };
        }

        const [market, holdings] = await Promise.all([
          loadMarket(),
          loadHoldings(userId).catch(() => []),
        ]);
        const authorization = await authorizeAgentCore(userId, route.intent);
        if (!authorization.allowed) {
          return {
            mode: "local",
            intent: "insufficient_credit",
            answer: "點數不足。可以先輸入「我要簽到」或「我要儲值」。",
            credit: authorization,
          };
        }

        const response = await invokeWithRefund(userId, authorization, {
          userId,
          message: [
            "請分析目前市場近況，說明討論情緒與使用者近期需要留意的資訊。",
            "不要提供買賣指令。",
            `[市場資料 JSON] ${JSON.stringify(market ?? {})}`,
          ].join("\n"),
          evidence: { market, holdings },
        });
        return {
          mode: "agentcore",
          intent: route.intent,
          answer: response.answer,
          data: response.data,
          credit: authorization,
        };
      }

      switch (route.intent) {
        case "holding_list":
          return { mode: "local", intent: route.intent, answer: formatHoldings(await loadHoldings(userId)) };
        case "market_today":
          return { mode: "local", intent: route.intent, answer: formatMarket(await loadMarket()) };
        case "stock_lookup": {
          const stockCode = route.params?.stockCode;
          if (!stockCode) throw new Error("stockCode is required");
          const stock = await loadStock(stockCode);
          return {
            mode: "local",
            intent: route.intent,
            answer: formatStock(stock) ?? `找不到股票 ${stockCode}。`,
          };
        }
        case "holding_create": {
          const { stockCode, quantity, averageCost, purchaseDate } = route.params ?? {};
          if (!stockCode || quantity === undefined || averageCost === undefined || !purchaseDate) {
            throw new Error("complete holding fields are required");
          }
          const holdings = await saveHolding(
            userId,
            stockCode,
            quantity,
            averageCost,
            purchaseDate,
          );
          return {
            mode: "local",
            intent: route.intent,
            answer: `已儲存 ${stockCode} ${formatNumber(quantity)} 股 ✅\n${formatHoldings(holdings)}`,
          };
        }
        case "credit_check_in": {
          const result = await credits.checkIn(userId);
          const mode = creditModeText(result.unlimited);
          return {
            mode: "local",
            intent: route.intent,
            answer: result.awarded
              ? `簽到成功，獲得 ${result.awardedCredits} credit！目前記帳餘額 ${result.balance} 點。${mode}`
              : `今天已經簽到過了，目前記帳餘額 ${result.balance} 點。${mode}`,
            credit: result,
          };
        }
        case "credit_balance": {
          const result = await credits.status(userId);
          return {
            mode: "local",
            intent: route.intent,
            answer: `目前記帳餘額 ${result.balance} credit。${creditModeText(result.unlimited)}`,
            credit: result,
          };
        }
        case "credit_top_up": {
          const amount = route.params?.credits;
          if (amount === undefined) throw new Error("credits are required");
          const result = await credits.topUp(userId, amount, `chat:${randomUUID()}`);
          return {
            mode: "local",
            intent: route.intent,
            answer: `已儲值 ${result.addedCredits} credit，目前記帳餘額 ${result.balance} 點。${creditModeText(result.unlimited)}`,
            credit: result,
          };
        }
        default:
          return {
            mode: "local",
            intent: route.intent,
            answer: route.reply ?? "請輸入「功能說明」查看可用功能。",
          };
      }
    },
  };
}

export const conversationService = createConversationService({
  listHoldings: async (userId) => listHoldings(userId),
  getMarketSentiment: async () => getMarketSentiment(),
  getStockSummary: async (stockCode) => getStockSummary(stockCode),
  upsertHolding: async (...args) => upsertHolding(...args),
  invokeAgentCore,
  credits: creditService,
});
