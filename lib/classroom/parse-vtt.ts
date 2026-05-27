export type TranscriptSegment = {
  index: number;
  start: number;
  end: number;
  text: string;
};

function parseTimestamp(raw: string): number {
  const parts = raw.trim().split(":");
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (
      parseInt(h, 10) * 3600 +
      parseInt(m, 10) * 60 +
      parseFloat(s.replace(",", "."))
    );
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m, 10) * 60 + parseFloat(s.replace(",", "."));
  }
  return 0;
}

const HTML_TAG_RE = /<[^>]+>/g;
const TIMESTAMP_RE = /^[\d:.]+\s*-->\s*[\d:.]+/;

export function parseVTT(vtt: string): TranscriptSegment[] {
  const normalized = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleaned = normalized.replace(/^﻿/, "");

  const blocks = cleaned.split(/\n\n+/).filter((b) => b.trim().length > 0);

  const segments: TranscriptSegment[] = [];
  let index = 0;

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim());

    let timeLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (TIMESTAMP_RE.test(lines[i])) {
        timeLine = i;
        break;
      }
    }

    if (timeLine === -1) continue;

    const [startRaw, endRaw] = lines[timeLine].split("-->");
    if (!startRaw || !endRaw) continue;

    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw.split(/\s/)[0]);

    const textLines = lines.slice(timeLine + 1).filter((l) => l.length > 0);
    if (textLines.length === 0) continue;

    const text = textLines.join(" ").replace(HTML_TAG_RE, "").trim();
    if (text.length === 0) continue;

    segments.push({ index, start, end, text });
    index++;
  }

  return segments.sort((a, b) => a.start - b.start);
}
