import { getMuxClient } from "./client";

export async function getSignedPlaybackToken(
  playbackId: string,
): Promise<string> {
  const signingKey = process.env.MUX_SIGNING_KEY;
  const privateKey = process.env.MUX_PRIVATE_KEY;

  if (!signingKey || !privateKey) {
    return playbackId;
  }

  const mux = getMuxClient();
  const token = await mux.jwt.signPlaybackId(playbackId, {
    type: "video",
    expiration: "1h",
  });

  return token;
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
