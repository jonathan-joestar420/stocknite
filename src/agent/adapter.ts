import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { config } from "../config.js";

export interface AgentRequest {
  userId: string;
  message: string;
  evidence?: unknown;
}

export interface AgentResponse {
  mode: "agentcore" | "bedrock" | "pending_integration";
  answer: string;
  data?: unknown;
}

/**
 * 統一 AI 入口。所有「洞察 / 對話」都應呼叫這個函式，
 * 不要在其他模組直接呼叫 Bedrock 或 AgentCore。
 * 優先序：AgentCore Runtime(ARN) -> 舊版 HTTP endpoint -> 直接 Bedrock。
 */
export async function invokeAgentCore(
  request: AgentRequest,
): Promise<AgentResponse> {
  if (config.agentCoreArn) {
    return invokeAgentRuntime(request);
  }
  if (config.agentCoreEndpoint) {
    const response = await fetch(config.agentCoreEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.agentCoreAuthToken
          ? { authorization: `Bearer ${config.agentCoreAuthToken}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`AgentCore returned ${response.status}`);
    return { mode: "agentcore", ...(await response.json() as object) } as AgentResponse;
  }
  return invokeBedrock(request);
}

const DISCLAIMER = "（僅供參考，非投資建議）";

/** 把使用者問題與持股資料組成給 agent 的 prompt。 */
function buildPrompt(request: AgentRequest): string {
  const hasEvidence =
    request.evidence !== undefined &&
    request.evidence !== null &&
    !(Array.isArray(request.evidence) && request.evidence.length === 0);
  if (!hasEvidence) return request.message;
  return `${request.message}\n\n[使用者持股資料 JSON，截至 2025-12-31]\n${JSON.stringify(request.evidence).slice(0, 6000)}`;
}

/** AgentCore Runtime 每位使用者一個穩定 session（>=33 字元、限合法字元）。 */
function sessionIdFor(userId: string): string {
  const safe = `stocknite-${userId}`.replace(/[^0-9A-Za-z_.-]/g, "");
  return safe.length >= 33 ? safe.slice(0, 100) : safe.padEnd(33, "0");
}

const agentCore = new BedrockAgentCoreClient({ region: config.awsRegion });

/** 透過 AWS SDK 呼叫 Bedrock AgentCore Runtime。契約：payload {prompt}，回傳 {result}。 */
export async function invokeAgentRuntime(
  request: AgentRequest,
): Promise<AgentResponse> {
  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: config.agentCoreArn,
    qualifier: config.agentCoreQualifier,
    runtimeSessionId: sessionIdFor(request.userId),
    contentType: "application/json",
    accept: "application/json",
    payload: new TextEncoder().encode(
      JSON.stringify({ prompt: buildPrompt(request) }),
    ),
  });

  const out = await agentCore.send(command);
  const text = out.response ? await out.response.transformToString() : "";
  let answer = text;
  try {
    const parsed = JSON.parse(text) as { result?: unknown; answer?: unknown };
    const value = parsed.result ?? parsed.answer;
    if (typeof value === "string") answer = value;
    else if (value !== undefined) answer = JSON.stringify(value);
  } catch {
    // 非 JSON，直接當純文字回覆
  }
  return { mode: "agentcore", answer: guardCompliance(answer) };
}

const SYSTEM_PROMPT = [
  "你是「股奈 StockNite」的台股投資陪伴助理。",
  "現在時間固定為 2025 年 12 月 31 日，所有資料與提問都以此時點為準，不要引用 2026 年之後的資訊。",
  "使用繁體中文，語氣像懂投資的朋友，回答精簡、白話、重點條列。",
  "嚴禁提供任何投資建議或買賣指令：不得出現「買進、賣出、加碼、減碼、進場、出場、目標價、該買、該賣、建議持有」等字眼。",
  "你只能提供「洞察、體檢、提醒」，例如集中度、估值、殖利率、法人動向、社群情緒等客觀解讀。",
  "若提供的資料不足以回答，請誠實說明，不要杜撰任何數字。",
  `每則回答最後獨立一行加註：${DISCLAIMER}`,
].join("\n");

const bedrock = new BedrockRuntimeClient({ region: config.awsRegion });

/** 直接呼叫 Bedrock Claude（AgentCore 未設定時的後備），回傳與 AgentCore 相同介面。 */
export async function invokeBedrock(
  request: AgentRequest,
): Promise<AgentResponse> {
  const userContent = buildPrompt(request);
  const command = new InvokeModelCommand({
    modelId: config.bedrockModelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const response = await bedrock.send(command);
  const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const raw = payload.content?.map((block) => block.text ?? "").join("").trim()
    ?? "";
  return { mode: "bedrock", answer: guardCompliance(raw) };
}

/** 輕量法遵護欄：確保有免責聲明，並在偵測到指令性字眼時加註提醒。 */
function guardCompliance(text: string): string {
  const fallback = "抱歉，我這邊暫時無法產生回覆，請稍後再試。";
  let out = text || fallback;
  const forbidden = /(買進|賣出|加碼|減碼|進場|出場|目標價|該買|該賣)/;
  if (forbidden.test(out)) {
    out +=
      "\n\n提醒：以上為資料解讀，不構成買賣建議，投資決策請自行評估。";
  }
  if (!out.includes(DISCLAIMER)) {
    out += `\n${DISCLAIMER}`;
  }
  return out;
}
