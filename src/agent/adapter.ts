import { config } from "../config.js";

export interface AgentRequest {
  userId: string;
  message: string;
  evidence?: unknown;
}

export interface AgentResponse {
  mode: "agentcore" | "pending_integration";
  answer: string;
  data?: unknown;
}

export async function invokeAgentCore(
  request: AgentRequest,
): Promise<AgentResponse> {
  if (!config.agentCoreEndpoint) {
    return {
      mode: "pending_integration",
      answer: "AgentCore 尚未設定；目前回傳已驗證的結構化資料。",
      data: request.evidence,
    };
  }
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
