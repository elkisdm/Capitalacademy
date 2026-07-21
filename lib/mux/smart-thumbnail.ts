const SYSTEM_PROMPT = `Eres un editor de video experto en miniaturas (thumbnails) que maximizan el clic.
Recibes 6 fotogramas numerados (0 a 5) de la grabación de una clase.
Elige el fotograma MAS atractivo para invitar a ver la clase:
- Presentador/a visible y expresivo, rostro nitido, buena iluminacion.
- Imagen clara y bien compuesta.
Descarta: pantallas negras o en blanco, transiciones/desenfoques, diapositivas
ilegibles, pantallas de carga, fotogramas vacios o congelados.
Si NINGUNO sirve, devuelve index -1.

Responde SIEMPRE y SOLO con este JSON, sin texto adicional:
{"index": N}
donde N es el numero (0-5) del mejor fotograma, o -1 si ninguno es adecuado.`;

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface IndexPayload {
  index: number;
}

const DEFAULT_BUDGET_MS = 8000;

function buildCandidateTimes(durationSeconds: number): number[] {
  const times = Array.from({ length: 6 }, (_, i) =>
    Math.round(durationSeconds * (0.1 + (0.75 * i) / 5)),
  );
  return Array.from(new Set(times));
}

/**
 * Elige, con IA de visión, el frame más atractivo de una grabación para usar
 * como miniatura (invitar al clic). Genera ~6 candidatos entre el 10% y el 85%
 * de la duración, se los muestra a gpt-5.4-mini en baja resolución y devuelve el
 * `time` (segundos) del frame elegido, o null si falla / no hay uno bueno.
 * NUNCA lanza: cualquier error o timeout devuelve null (el webhook cae al
 * thumbnail default sin romperse). Presupuesto de tiempo duro vía AbortController.
 */
export async function pickSmartThumbnailTime(
  playbackId: string,
  durationSeconds: number,
  opts?: { budgetMs?: number },
): Promise<number | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || durationSeconds < 30) {
    return null;
  }

  const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS;
  const candidateTimes = buildCandidateTimes(durationSeconds);
  const candidateUrls = candidateTimes.map(
    (t) => `https://image.mux.com/${playbackId}/thumbnail.webp?time=${t}&width=320`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), budgetMs);

  try {
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Imagen 0..${candidateUrls.length - 1} en este orden: fotogramas de la grabación en distintos momentos.`,
      },
      ...candidateUrls.map((url) => ({
        type: "image_url",
        image_url: { url, detail: "low" },
      })),
    ];

    const requestBody = {
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 50,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown error");
      console.error(`smart-thumbnail: OpenAI API error ${res.status}: ${errorText}`);
      return null;
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("smart-thumbnail: OpenAI returned empty content");
      return null;
    }

    const parsed = JSON.parse(rawContent) as IndexPayload;
    const index = parsed.index;

    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= candidateTimes.length
    ) {
      return null;
    }

    return candidateTimes[index];
  } catch (err) {
    console.error("smart-thumbnail:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
