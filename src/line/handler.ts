import { invokeAgentCore } from "../agent/adapter.js";
import { getMarketSentiment, getStockSummary } from "../services/market.js";
import { listHoldings, upsertHolding } from "../services/portfolio.js";
import { replyLine } from "./client.js";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

function asText(value: unknown): string {
  return JSON.stringify(value, null, 2).slice(0, 4500);
}

async function resolveAction(event: LineEvent): Promise<string> {
  const userId = event.source?.userId;
  if (!userId) return "目前只支援一對一聊天。";
  const action = new URLSearchParams(event.postback?.data ?? "").get("action");
  const text = event.message?.text?.trim() ?? "";
  if (action === "stock_search") return "請輸入股票代號，例如：2330";
  if (action === "market_today" || text === "今日市場" || text === "市場情緒") {
    const data = await getMarketSentiment();
    return `最新市場情緒資料：\n${asText(data)}\n情緒代表討論傾向，不是漲跌預測。`;
  }
  if (action === "portfolio_view" || text === "我的持股") {
    const data = await listHoldings(userId);
    return data.length ? `你的持股：\n${asText(data)}` :
      "尚無持股。輸入「新增持股 2330 1000」即可建立。";
  }
  if (action === "settings" || text === "設定") {
    return "設定功能：晨報時間 07:00（開發中）\n可輸入「我的持股」查看資料。";
  }
  const holding = text.match(/^新增持股\s+([0-9A-Za-z]{2,10})\s+([0-9.]+)$/);
  if (holding) {
    const data = await upsertHolding(userId, holding[1]!, Number(holding[2]));
    return `已儲存，請確認：\n${asText(data)}`;
  }
  const stockCode = text.match(/^\d{4,6}$/)?.[0];
  if (stockCode) {
    const data = await getStockSummary(stockCode);
    return data ? `${stockCode} 股票摘要：\n${asText(data)}\n資料截至 2025-12-31。` :
      `找不到股票 ${stockCode}。`;
  }
  const holdings = await listHoldings(userId).catch(() => []);
  const agent = await invokeAgentCore({
    userId,
    message: text,
    evidence: holdings.length ? { holdings } : undefined,
  });
  return agent.answer;
}

export async function handleLineEvent(event: LineEvent): Promise<void> {
  if (!event.replyToken) return;
  try {
    const text = event.type === "follow"
      ? "嗨，我是股奈 🌙\n輸入 2330、今日市場或我的持股開始使用。"
      : await resolveAction(event);
    await replyLine(event.replyToken, [{ type: "text", text }]);
  } catch (error) {
    console.error("LINE event failed", error);
    await replyLine(event.replyToken, [{
      type: "text",
      text: "目前無法完成查詢，請稍後再試。",
    }]);
  }
}

export async function handleLineEvents(events: LineEvent[]): Promise<void> {
  await Promise.allSettled(events.map(handleLineEvent));
}
