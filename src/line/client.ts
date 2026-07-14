import { config } from "../config.js";

export type LineMessage = { type: "text"; text: string };

export async function replyLine(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  if (!config.lineAccessToken) {
    console.info("LINE token absent; reply skipped", { messages });
    return;
  }
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.lineAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`LINE reply failed: ${response.status}`);
  }
}
