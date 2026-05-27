import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";

export const runtime = "nodejs";

interface VttSegment {
  startSeconds: number;
  text: string;
}

/**
 * Parse a WebVTT string into an array of { startSeconds, text } segments.
 */
function parseVtt(vtt: string): VttSegment[] {
  const segments: VttSegment[] = [];
  const blocks = vtt.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    // Find the line with the timestamp arrow
    const tsIndex = lines.findIndex((l) => l.includes("-->"));
    if (tsIndex === -1) continue;

    const tsLine = lines[tsIndex];
    const match = tsLine.match(
      /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->/,
    );
    if (!match) continue;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const startSeconds = hours * 3600 + minutes * 60 + seconds;

    // Text is everything after the timestamp line
    const text = lines
      .slice(tsIndex + 1)
      .join(" ")
      .trim();

    if (text) {
      segments.push({ startSeconds, text });
    }
  }

  return segments;
}

interface MatchResult {
  text: string;
  timestampSeconds: number;
}

/**
 * Find VTT segments that match the query and return snippets with timestamps.
 */
function findMatchesInVtt(
  vttContent: string,
  query: string,
): MatchResult[] {
  const segments = parseVtt(vttContent);
  const queryLower = query.toLowerCase();
  const matches: MatchResult[] = [];

  for (const segment of segments) {
    if (segment.text.toLowerCase().includes(queryLower)) {
      matches.push({
        text: segment.text,
        timestampSeconds: segment.startSeconds,
      });
    }
  }

  // Also try matching across adjacent segments for multi-word queries
  if (matches.length === 0 && segments.length > 1) {
    for (let i = 0; i < segments.length - 1; i++) {
      const combined = `${segments[i].text} ${segments[i + 1].text}`;
      if (combined.toLowerCase().includes(queryLower)) {
        matches.push({
          text: combined,
          timestampSeconds: segments[i].startSeconds,
        });
      }
    }
  }

  return matches.slice(0, 5); // Max 5 matches per lesson
}

export async function GET(req: Request) {
  // --- Auth check ------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // --- Validation ------------------------------------------------------------
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const cohortParam = searchParams.get("cohortId");

  if (query.length < 2) {
    return NextResponse.json(
      { error: "El parametro 'q' debe tener al menos 2 caracteres" },
      { status: 422 },
    );
  }

  if (!cohortParam) {
    return NextResponse.json(
      { error: "cohortId es requerido" },
      { status: 422 },
    );
  }

  // Resolve slug or UUID to cohort ID
  const cohortId = await resolveCohortSlug(cohortParam);
  if (!cohortId) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  // --- Verify enrollment -----------------------------------------------------
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, cohort_id")
    .eq("student_id", user.id)
    .eq("cohort_id", cohortId)
    .eq("status", "active")
    .single();

  if (!enrollment) {
    return NextResponse.json(
      { error: "No tienes matricula activa en esta cohorte" },
      { status: 403 },
    );
  }

  // --- Get the program_id for this cohort ------------------------------------
  const { data: cohort } = await supabase
    .from("cohorts")
    .select("program_id")
    .eq("id", cohortId)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  // --- Fetch lessons belonging to this cohort's program ----------------------
  const { data: modules } = await supabase
    .from("program_modules")
    .select("id, title, slug")
    .eq("program_id", cohort.program_id);

  if (!modules || modules.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const moduleIds = modules.map((m) => m.id);
  const moduleMap = new Map(modules.map((m) => [m.id, m.title]));
  const moduleSlugMap = new Map(modules.map((m) => [m.id, m.slug ?? m.id]));

  // --- Fetch transcripts with textSearch -------------------------------------
  // The Supabase JS client supports .textSearch() on text columns that have
  // a tsvector index. We use websearch type with spanish config.
  const { data: transcripts, error: searchError } = await supabase
    .from("lesson_transcripts")
    .select(
      "lesson_id, content_vtt, lessons!inner(title, slug, module_id)",
    )
    .textSearch("content_text", query, {
      type: "websearch",
      config: "spanish",
    })
    .eq("status", "ready")
    .limit(20);

  if (searchError) {
    console.error("Search error:", searchError);
    return NextResponse.json(
      { error: "Error al realizar la busqueda" },
      { status: 500 },
    );
  }

  if (!transcripts || transcripts.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // --- Filter to lessons within this cohort's modules ------------------------
  // The textSearch doesn't scope by module, so we filter client-side.
  type TranscriptRow = (typeof transcripts)[number];

  interface SearchResultItem {
    lessonId: string;
    lessonSlug: string;
    lessonTitle: string;
    moduleSlug: string;
    moduleName: string;
    matches: MatchResult[];
  }

  const results: SearchResultItem[] = [];

  for (const row of transcripts as TranscriptRow[]) {
    const lesson = row.lessons as unknown as {
      title: string;
      slug: string | null;
      module_id: string;
    } | null;

    if (!lesson) continue;
    if (!moduleIds.includes(lesson.module_id)) continue;

    const moduleName: string = moduleMap.get(lesson.module_id) ?? "Modulo";
    const moduleSlug: string = moduleSlugMap.get(lesson.module_id) ?? lesson.module_id;

    // Find matching VTT segments
    const matches = row.content_vtt
      ? findMatchesInVtt(row.content_vtt, query)
      : [];

    // Even if we can't find VTT matches (e.g. tsvector matched stems),
    // still include the result with empty matches so the student knows
    // which lesson contains the topic.
    results.push({
      lessonId: row.lesson_id,
      lessonSlug: lesson.slug ?? row.lesson_id,
      lessonTitle: lesson.title,
      moduleSlug,
      moduleName,
      matches,
    });
  }

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
