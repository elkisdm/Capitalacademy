import Mux from "@mux/mux-node";

let client: Mux | null = null;

export function getMuxClient() {
  if (client) return client;
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error("Mux credentials are not configured");
  }
  client = new Mux({
    tokenId,
    tokenSecret,
    jwtSigningKey: process.env.MUX_SIGNING_KEY ?? null,
    jwtPrivateKey: process.env.MUX_PRIVATE_KEY ?? null,
  });
  return client;
}
