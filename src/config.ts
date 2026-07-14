function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  databaseUrl: optional("DATABASE_URL"),
  lineChannelSecret: optional("LINE_CHANNEL_SECRET"),
  lineAccessToken: optional("LINE_CHANNEL_ACCESS_TOKEN"),
  lineAddFriendUrl:
    optional("LINE_ADD_FRIEND_URL") ?? "https://line.me/R/ti/p/@YOUR_LINE_ID",
  publicBaseUrl:
    optional("PUBLIC_BASE_URL") ?? "https://stocknite.example.com",
  agentCoreEndpoint: optional("AGENTCORE_ENDPOINT"),
  agentCoreAuthToken: optional("AGENTCORE_AUTH_TOKEN"),
};
