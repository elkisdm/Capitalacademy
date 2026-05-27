import { getMuxClient } from "./client";

export async function getSignedPlaybackToken(
  playbackId: string,
): Promise<string> {
  // Assets created with playback_policies: ["public"] don't need signed tokens.
  // Only sign if the asset uses "signed" policy (future feature).
  // For now, all assets are public — return the playbackId as-is.
  return playbackId;
}

export async function getSignedThumbnailUrl(
  playbackId: string,
): Promise<string> {
  const signingKey = process.env.MUX_SIGNING_KEY;
  const privateKey = process.env.MUX_PRIVATE_KEY;

  if (!signingKey || !privateKey) {
    return `https://image.mux.com/${playbackId}/thumbnail.webp`;
  }

  const mux = getMuxClient();
  const token = await mux.jwt.signPlaybackId(playbackId, {
    type: "thumbnail",
    expiration: "24h",
  });

  return `https://image.mux.com/${playbackId}/thumbnail.webp?token=${token}`;
}
