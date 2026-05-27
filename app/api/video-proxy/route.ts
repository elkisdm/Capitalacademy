import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playbackId = searchParams.get("id");

  if (!playbackId || !/^[a-zA-Z0-9]+$/.test(playbackId)) {
    return NextResponse.json({ error: "Invalid playback ID" }, { status: 400 });
  }

  const muxUrl = `https://stream.mux.com/${playbackId}/medium.mp4`;

  const muxRes = await fetch(muxUrl);

  if (!muxRes.ok) {
    return NextResponse.json(
      { error: "Video not available", status: muxRes.status },
      { status: muxRes.status },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", muxRes.headers.get("content-type") ?? "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  if (muxRes.headers.get("content-length")) {
    headers.set("Content-Length", muxRes.headers.get("content-length")!);
  }
  headers.set("Cache-Control", "public, max-age=3600");

  return new NextResponse(muxRes.body, { status: 200, headers });
}
