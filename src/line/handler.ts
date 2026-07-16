import { invokeAgentCore } from "../agent/adapter.js";
import { listActiveHoldings, updateHolding, upsertHolding } from "../services/portfolio.js";
import { getLineMessageContent, replyLine } from "./client.js";

// agent 回傳的結構化 intent 契約（做法1：agent 解析、後端寫入）
interface ParsedHolding {
  stock_code?: string;
  stock_name?: string;
  quantity?: number;
  average_cost?: number;
  purchase_date?: string; // YYYY-MM-DD；未提供則留空
}
interface AgentIntent {
  intent?: "upsert_holding" | "remove_holding" | "chat";
  holdings?: ParsedHolding[];
  stock_code?: string;
}

/** 依 agent 結構化 intent 寫入/刪除持股；缺買進日期則要求補齊。回傳給使用者的訊息，或 null 表示非持股操作。 */
async function handleHoldingIntent(
  lineUserId: string, data: unknown, agentAnswer: string,
): Promise<string | null> {
  const intent = data as AgentIntent | undefined;
  if (!intent || typeof intent !== "object") return null;

  if (intent.intent === "remove_holding" && intent.stock_code) {
    // 標記為賣出（保留為過去持有，不刪除）；賣出價與日期可留空，之後於網站補上算已實現損益。
    const result = await updateHolding(lineUserId, intent.stock_code, { quantity: 0 });
    if (!result.updated) return `找不到 ${intent.stock_code} 這筆持股耶～`;
    return `已標記賣出 ${intent.stock_code} ✅\n可到網站補上賣出價與日期，計算已實現損益。`;
  }

  if (intent.intent === "upsert_holding" && Array.isArray(intent.holdings)) {
    const items = intent.holdings.filter((h) => h.stock_code && h.quantity && h.quantity > 0);
    if (!items.length) return null;
    const label = (h: ParsedHolding) => `${h.stock_name ?? h.stock_code} ${h.quantity}股`;

    const missingDate = items.filter((h) => !h.purchase_date);
    if (missingDate.length) {
      const names = missingDate.map((h) => h.stock_name ?? h.stock_code).join("、");
      return `我準備幫你記錄：${items.map(label).join("、")}\n` +
        `但「${names}」還缺少「買進日期」，我需要它才能存檔。\n` +
        `請補上買進日期（例如 2025-12-30），或重新上傳有含日期的截圖。`;
    }

    for (const h of items) {
      await upsertHolding(
        lineUserId, h.stock_code!, h.quantity!, h.average_cost, h.purchase_date,
      );
    }
    return `已存入 ✅ ${items.map((h) => `${label(h)}（${h.purchase_date}）`).join("、")}`;
  }

  return null;
}

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string; id?: string };
  postback?: { data?: string };
};

async function resolveAction(event: LineEvent): Promise<string> {
  const userId = event.source?.userId;
  if (!userId) return "這裡目前只支援一對一聊天喔～";

  // 圖片訊息（持股截圖）：下載 -> base64 -> 交給 agent 解析 -> 後端寫入
  if (event.message?.type === "image" && event.message.id) {
    const image = await getLineMessageContent(event.message.id);
    if (!image) return "圖片好像沒有下載成功～請再傳一次，或改用文字輸入持股。";
    const holdings = await listActiveHoldings(userId).catch(() => []);
    const agent = await invokeAgentCore({
      userId,
      message: "請解析這張持股截圖，回傳結構化持股；若截圖缺少買進日期請標示缺少。",
      evidence: holdings.length ? { holdings } : undefined,
      imageBase64: image.base64,
      imageMime: image.mime,
    });
    const reply = await handleHoldingIntent(userId, agent.data, agent.answer);
    return reply ?? agent.answer;
  }

  const action = new URLSearchParams(event.postback?.data ?? "").get("action");
  const text = event.message?.text?.trim() ?? "";

  // 「查股票」按鈕本身不帶內容，只是提示使用者輸入代號，直接回提示即可。
  if (action === "stock_search") return "想查哪一檔呢？直接回股票代號就好，例如：2330 🌙";

  // 不做本地意圖路由：所有文字訊息（含選單按鈕轉出的文字）一律直接交給 AgentCore agent 處理。
  const message = action === "portfolio_view"
    ? "我的持股"
    : action === "market_today"
      ? "今日市場"
      : action === "settings"
        ? "設定"
        : text;
  if (!message) return "跟我說點什麼吧～可以問持股、個股或市場近況 🌙";

  const holdings = await listActiveHoldings(userId).catch(() => []);
  const agent = await invokeAgentCore({
    userId,
    message,
    evidence: holdings.length ? { holdings } : undefined,
  });
  const reply = await handleHoldingIntent(userId, agent.data, agent.answer);
  return reply ?? agent.answer;
}

export async function handleLineEvent(event: LineEvent): Promise<void> {
  if (!event.replyToken) return;
  try {
    const text = event.type === "follow"
      ? "嗨，我是股奈 🌙\n想先看看「我的持股」、「今日市場」，還是查一檔股票？直接跟我說就好～"
      : await resolveAction(event);
    await replyLine(event.replyToken, [{ type: "text", text }]);
  } catch (error) {
    console.error("LINE event failed", error);
    await replyLine(event.replyToken, [{
      type: "text",
      text: "剛剛好像卡住了～請稍後再試一次；如果一直失敗，再回來找我。",
    }]);
  }
}

export async function handleLineEvents(events: LineEvent[]): Promise<void> {
  await Promise.allSettled(events.map(handleLineEvent));
}
