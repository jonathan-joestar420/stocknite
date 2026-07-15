import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const PROFILE_URL = "https://api.line.me/v2/profile";

function redirectUri(): string {
  return `${config.publicBaseUrl.replace(/\/$/, "")}/auth/line/callback`;
}

/** 產生登入用亂數 state（防 CSRF）。 */
export function newState(): string {
  return randomBytes(16).toString("hex");
}

/** 導向 LINE 授權頁的 URL。 */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.lineLoginChannelId ?? "",
    redirect_uri: redirectUri(),
    state,
    scope: "profile openid",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** 用授權碼換 access token，再取得使用者 profile，回傳 LINE userId。 */
export async function exchangeCodeForUserId(
  code: string,
): Promise<{ userId: string; displayName?: string; pictureUrl?: string }> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: config.lineLoginChannelId ?? "",
      client_secret: config.lineLoginChannelSecret ?? "",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    throw new Error(`LINE token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const token = await tokenRes.json() as { access_token: string };
  const profileRes = await fetch(PROFILE_URL, {
    headers: { authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!profileRes.ok) {
    throw new Error(`LINE profile fetch failed: ${profileRes.status}`);
  }
  return await profileRes.json() as {
    userId: string; displayName?: string; pictureUrl?: string;
  };
}

// ---- 簽章 cookie（避免偽造他人 userId）----
function sessionSecret(): string {
  return config.lineLoginChannelSecret ?? config.lineChannelSecret ?? "stocknite-dev-secret";
}

export function signSession(userId: string): string {
  const payload = Buffer.from(userId).toString("base64url");
  const mac = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifySession(value: string | undefined): string | undefined {
  if (!value || !value.includes(".")) return undefined;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return undefined;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  return Buffer.from(payload, "base64url").toString("utf8");
}

/** 從 Cookie header 取出指定 cookie。 */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
