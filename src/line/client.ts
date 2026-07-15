import { config } from "../config.js";

export type LineMessage = { type: "text"; text: string };

/** 下載 LINE 訊息的圖片內容，回傳 base64 與 mime。 */
export async function getLineMessageContent(
  messageId: string,
): Promise<{ base64: string; mime: string } | null> {
  if (!config.lineAccessToken) {
    console.info("LINE token absent; content fetch skipped");
    return null;
  }
  const response = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { authorization: `Bearer ${config.lineAccessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`LINE content fetch failed: ${response.status}`);
  }
  const mime = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: buffer.toString("base64"), mime };
}

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
