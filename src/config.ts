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
  agentCoreArn: optional("AGENTCORE_ARN"),
  agentCoreQualifier: optional("AGENTCORE_QUALIFIER") ?? "DEFAULT",
  lineLoginChannelId: optional("LINE_LOGIN_CHANNEL_ID"),
  lineLoginChannelSecret: optional("LINE_LOGIN_CHANNEL_SECRET"),
  awsRegion: optional("AWS_REGION") ?? optional("AWS_DEFAULT_REGION") ?? "us-west-2",
  bedrockModelId:
    optional("BEDROCK_MODEL_ID") ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0",
};
