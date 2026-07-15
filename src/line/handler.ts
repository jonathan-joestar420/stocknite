import { invokeAgentCore } from "../agent/adapter.js";
import { getMarketSentiment, getStockSummary } from "../services/market.js";
import { listHoldings, removeHolding, upsertHolding } from "../services/portfolio.js";
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
    await removeHolding(lineUserId, intent.stock_code);
    return `已移除 ${intent.stock_code} ✅`;
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

function asText(value: unknown): string {
  return JSON.stringify(value, null, 2).slice(0, 4500);
}

function num(v: unknown, digits = 0): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

/** 格式化日期為 YYYY-MM-DD（相容 Date 物件或字串）。 */
function ymd(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}

/** 計算單筆損益（需有成本）。回傳金額與百分比字串，無成本則回 null。 */
function profitLoss(h: Record<string, unknown>): { amount: number; pct: number } | null {
  const cost = Number(h.average_cost);
  const qty = Number(h.quantity);
  const mv = Number(h.market_value);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(qty) || !Number.isFinite(mv)) return null;
  const basis = cost * qty;
  const amount = mv - basis;
  return { amount, pct: basis ? (amount / basis) * 100 : 0 };
}

/** 把持股列表格式化成易讀文字（LINE 顯示用）。 */
function formatHoldings(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) {
    return "你目前沒有持股。\n可以傳一張持股截圖，或輸入「今天買了台積電50股 成本2400 買進日2025-12-30」來匯入。";
  }
  let totalMv = 0;
  let totalBasis = 0;
  const lines = rows.map((h) => {
    const weight = h.weight != null ? `${(Number(h.weight) * 100).toFixed(1)}%` : "—";
    const date = ymd(h.purchase_date) ?? "無日期";
    const pl = profitLoss(h);
    totalMv += Number(h.market_value) || 0;
    if (pl) totalBasis += Number(h.average_cost) * Number(h.quantity);
    const plStr = pl
      ? `${pl.amount >= 0 ? "+" : ""}${num(pl.amount)}（${pl.amount >= 0 ? "+" : ""}${pl.pct.toFixed(1)}%）`
      : "—";
    return `• ${h.stock_name ?? ""} ${h.stock_code}｜${num(h.quantity)} 股｜成本 ${num(h.average_cost, 2)}` +
      `｜現價 ${num(h.close_price, 2)}｜市值 ${num(h.market_value)}（${weight}）` +
      `｜損益 ${plStr}｜買進 ${date}`;
  });
  const totalPl = totalMv - totalBasis;
  const totalPct = totalBasis ? (totalPl / totalBasis) * 100 : 0;
  const totalPlStr = totalBasis
    ? `，總損益 ${totalPl >= 0 ? "+" : ""}${num(totalPl)}（${totalPl >= 0 ? "+" : ""}${totalPct.toFixed(1)}%）`
    : "";
  return `你的持股（總市值 ${num(totalMv)} 元${totalPlStr}）：\n${lines.join("\n")}`;
}

async function resolveAction(event: LineEvent): Promise<string> {
  const userId = event.source?.userId;
  if (!userId) return "目前只支援一對一聊天。";

  // 圖片訊息（持股截圖）：下載 -> base64 -> 交給 agent 解析 -> 後端寫入
  if (event.message?.type === "image" && event.message.id) {
    const image = await getLineMessageContent(event.message.id);
    if (!image) return "圖片下載失敗，請重新上傳，或改用文字輸入持股。";
    const holdings = await listHoldings(userId).catch(() => []);
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
  if (action === "stock_search") return "請輸入股票代號，例如：2330";
  if (action === "market_today" || text === "今日市場" || text === "市場情緒") {
    const data = await getMarketSentiment();
    return `最新市場情緒資料：\n${asText(data)}\n情緒代表討論傾向，不是漲跌預測。`;
  }
  if (action === "portfolio_view" || text === "我的持股") {
    const data = await listHoldings(userId) as Array<Record<string, unknown>>;
    return formatHoldings(data);
  }
  if (action === "settings" || text === "設定") {
    return "設定功能：晨報時間 07:00（開發中）\n可輸入「我的持股」查看資料。";
  }
  const holding = text.match(/^新增持股\s+([0-9A-Za-z]{2,10})\s+([0-9.]+)$/);
  if (holding) {
    const data = await upsertHolding(userId, holding[1]!, Number(holding[2])) as Array<Record<string, unknown>>;
    return `已儲存 ✅\n${formatHoldings(data)}`;
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
  // 若 agent 回傳結構化持股 intent，則寫入/刪除 DB；否則當一般聊天回覆。
  const holdingReply = await handleHoldingIntent(userId, agent.data, agent.answer);
  return holdingReply ?? agent.answer;
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
