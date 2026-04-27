import { WebClient } from "@slack/web-api";

let client: WebClient | null = null;

export function getSlackClient() {
  if (client) return client;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }
  client = new WebClient(token);
  return client;
}
