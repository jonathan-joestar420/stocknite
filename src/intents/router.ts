export type IntentName =
  | "analyze_holdings"
  | "analyze_recent"
  | "analysis_choice"
  | "credit_check_in"
  | "credit_balance"
  | "credit_top_up"
  | "credit_top_up_help"
  | "holding_create"
  | "holding_create_help"
  | "holding_list"
  | "market_today"
  | "stock_lookup"
  | "greeting"
  | "thanks"
  | "help"
  | "website"
  | "data_date"
  | "morning_brief"
  | "settings"
  | "unsupported_advice";

export interface IntentParams {
  stockCode?: string;
  quantity?: number;
  averageCost?: number;
  purchaseDate?: string;
  credits?: number;
  missing?: string[];
}

export interface IntentRoute {
  intent: IntentName;
  mode: "local" | "agentcore";
  handled: true;
  reply?: string;
  params?: IntentParams;
}

export const ANALYSIS_CHOICE_REPLY = [
  "我目前只會在你明確選擇後使用 AI 分析。",
  "請直接回覆「分析持股」或「分析近況」。",
  "也可以輸入「功能說明」查看其他操作。",
].join("\n");

export const HOLDING_INPUT_EXAMPLE =
  "請用這個格式輸入：新增持股 2330 50股 成本600 買進日2025-12-30";

const FIXED_REPLIES = {
  greeting: "嗨，我是股奈 🌙\n你可以查看持股、查股票、每日簽到，或選擇分析持股／分析近況。",
  thanks: "不客氣～需要時可以輸入「功能說明」。",
  help: [
    "目前可用功能：",
    "• 我的持股",
    "• 查詢股票，例如：2330",
    "• 今日市場",
    "• 新增持股",
    "• 我要簽到",
    "• 我的點數",
    "• 我要儲值",
    "• 分析持股",
    "• 分析近況",
  ].join("\n"),
  holdingCreateHelp: HOLDING_INPUT_EXAMPLE,
  topUpHelp: "請選擇儲值點數：10、30 或 100 點。\n例如輸入：儲值 10 點",
  morningBrief: "早安摘要功能仍在準備中，目前可以先使用「分析近況」。",
  settings: "設定功能：晨報時間 07:00（開發中）。\n可輸入「我的持股」查看資料。",
  website: "網頁版：https://stocknite.zzeric.com/me",
  dataDate: "目前示範市場資料截至 2025-12-31，並非即時行情。",
  advice: "股奈不提供明牌或買賣指令，但可以幫你做「分析持股」或「分析近況」。",
};

export function normalizeMessage(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[，,。.!！?？]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fixed(intent: IntentName, reply: string, params?: IntentParams): IntentRoute {
  return { intent, mode: "local", handled: true, reply, params };
}

function service(intent: IntentName, params?: IntentParams): IntentRoute {
  return { intent, mode: "local", handled: true, params };
}

function agent(intent: "analyze_holdings" | "analyze_recent"): IntentRoute {
  return { intent, mode: "agentcore", handled: true };
}

function normalizeDate(value: string): string {
  const [year = "", month = "", day = ""] = value.split(/[/-]/);
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseHoldingCreate(text: string): IntentRoute | null {
  if (!/(新增持股|儲存(?:股票|持股)|保存(?:股票|持股)|記錄(?:股票|持股)|今天買了|我買了)/.test(text)) {
    return null;
  }

  const stockCode = text.match(/(?:^|\D)(\d{4,6})(?!\d)/)?.[1];
  const quantity = text.match(/(\d+(?:\.\d+)?)\s*股/)?.[1];
  const averageCost = text.match(/(?:成本|均價|價格)\s*[:：]?\s*(\d+(?:\.\d+)?)/)?.[1];
  const purchaseDate = text.match(/(?:買進日(?:期)?|日期)\s*[:：]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/)?.[1];

  const missing: string[] = [];
  if (!stockCode) missing.push("股票代號");
  if (!quantity) missing.push("股數");
  if (!averageCost) missing.push("成本");
  if (!purchaseDate) missing.push("買進日期");

  if (missing.length) {
    return fixed(
      "holding_create_help",
      `還缺少：${missing.join("、")}。\n${HOLDING_INPUT_EXAMPLE}`,
      { missing },
    );
  }

  return service("holding_create", {
    stockCode,
    quantity: Number(quantity),
    averageCost: Number(averageCost),
    purchaseDate: normalizeDate(purchaseDate!),
  });
}

export function routeIntent(message: unknown): IntentRoute {
  const text = normalizeMessage(message);
  if (!text) return fixed("analysis_choice", ANALYSIS_CHOICE_REPLY);

  // 只有明確分析指令可以進 AgentCore；必須優先於「我的持股」等關鍵字。
  if (/^(分析持股|持股分析|持股健檢|分析我的持股|幫我分析(?:一下)?(?:我的)?持股)$/.test(text)) {
    return agent("analyze_holdings");
  }
  if (/^(分析近況|近況分析|分析市場近況|幫我分析(?:一下)?近況)$/.test(text)) {
    return agent("analyze_recent");
  }

  if (/^(我要簽到|每日簽到|簽到|領點數|領credit)$/.test(text)) {
    return service("credit_check_in");
  }
  if (/^(我的點數|查點數|點數餘額|我的credit|credit餘額|credit)$/.test(text)) {
    return service("credit_balance");
  }
  const topUp = text.match(/^(?:我要)?儲值\s*(10|30|100)\s*(?:點|credit)?$/);
  if (topUp?.[1]) return service("credit_top_up", { credits: Number(topUp[1]) });
  if (/^(我要儲值|儲值|儲值credit|儲值點數)$/.test(text)) {
    return fixed("credit_top_up_help", FIXED_REPLIES.topUpHelp);
  }

  const holdingCreate = parseHoldingCreate(text);
  if (holdingCreate) return holdingCreate;

  if (/^(我要|想要|幫我)?(?:新增|加入|儲存|保存|記錄)(?:一筆)?(?:股票|持股|庫存)$/.test(text) ||
      /^(怎麼|如何)(?:新增|儲存|記錄)(?:股票|持股)$/.test(text)) {
    return fixed("holding_create_help", FIXED_REPLIES.holdingCreateHelp);
  }
  if (/^(我的持股|查看持股|持股明細|我的投資組合|投資組合|庫存)$/.test(text)) {
    return service("holding_list");
  }
  if (/^(今日市場|市場情緒|今天盤勢|大盤情緒)$/.test(text)) {
    return service("market_today");
  }

  const stockCode = text.match(/^(?:查詢?|看看)?\s*(\d{4,6})(?:\s*(?:股票|股價|資料))?$/)?.[1];
  if (stockCode) return service("stock_lookup", { stockCode });

  if (/^(嗨|你好|哈囉|hi|hello)$/.test(text)) return fixed("greeting", FIXED_REPLIES.greeting);
  if (/^(謝謝|感謝|收到|了解|好的|ok)$/.test(text)) return fixed("thanks", FIXED_REPLIES.thanks);
  if (/^(功能說明|怎麼用|使用說明|可以做什麼|有哪些功能|help)$/.test(text)) {
    return fixed("help", FIXED_REPLIES.help);
  }
  if (/^(網站|網頁版|登入網站|看儀表板|我的頁面)$/.test(text)) {
    return fixed("website", FIXED_REPLIES.website);
  }
  if (/^(資料到哪天|是即時嗎|資料日期|最後更新|資料更新)$/.test(text)) {
    return fixed("data_date", FIXED_REPLIES.dataDate);
  }
  if (/^(晨報|早安摘要|每日摘要|通知設定|七點通知)$/.test(text)) {
    return fixed("morning_brief", FIXED_REPLIES.morningBrief);
  }
  if (text === "設定") return fixed("settings", FIXED_REPLIES.settings);
  if (/(推薦股票|給我明牌|該買哪一檔|現在能買嗎)/.test(text)) {
    return fixed("unsupported_advice", FIXED_REPLIES.advice);
  }

  // 任何未知內容都不呼叫 AgentCore。
  return fixed("analysis_choice", ANALYSIS_CHOICE_REPLY);
}
