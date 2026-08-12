import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EgressNotConfiguredError,
  EgressRequestError,
  getEgressStorageConfig,
  isEgressEnabled,
  listEgress,
  startRoomComposite,
  stopEgress,
} from "@/lib/livekit/egress";
import type { LiveKitConfig } from "@/lib/livekit/config";

/**
 * Cliente twirp de Egress. Lo que se prueba acá es la FORMA del request: si el
 * cuerpo va mal, Egress responde 200 y no graba, o graba en un bucket que no es
 * el nuestro. Nada de eso se ve en los logs de la app.
 */

const config: LiveKitConfig = {
  url: "wss://livekit.example",
  apiKey: "APIkey",
  apiSecret: "secreto-de-prueba",
};

const storage = {
  accessKeyId: "AKIA-ejemplo",
  secretAccessKey: "secreto-s3",
  region: "us-east-2",
  endpoint: "https://proyecto.supabase.co/storage/v1/s3",
  bucket: "grabaciones",
};

const fetchMock = vi.fn();

function ok(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

/** [url, cuerpo, headers] de la última llamada. */
function ultima() {
  const c = fetchMock.mock.calls.at(-1)!;
  const init = c[1] as RequestInit & { headers: Record<string, string> };
  return {
    url: String(c[0]),
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
    headers: init.headers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(ok({ egressId: "EG_1", status: "EGRESS_STARTING" }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startRoomComposite", () => {
  it("arma el request twirp que Egress espera", async () => {
    const info = await startRoomComposite({
      config,
      storage,
      room: "clase-ses-1",
      filepath: "ses-1/rec-1.mp4",
    });

    const { url, body } = ultima();
    // `wss:` no sirve para twirp: la llamada va por HTTPS.
    expect(url).toBe("https://livekit.example/twirp/livekit.Egress/StartRoomCompositeEgress");
    expect(body).toMatchObject({
      room_name: "clase-ses-1",
      layout: "speaker",
      audio_only: false,
    });

    const salida = (body.file_outputs as Array<Record<string, unknown>>)[0];
    expect(salida.file_type).toBe("MP4");
    expect(salida.filepath).toBe("ses-1/rec-1.mp4");
    expect(salida.s3).toMatchObject({
      access_key: "AKIA-ejemplo",
      secret: "secreto-s3",
      region: "us-east-2",
      endpoint: "https://proyecto.supabase.co/storage/v1/s3",
      bucket: "grabaciones",
      // Supabase Storage no sirve buckets como subdominio.
      force_path_style: true,
    });

    expect(info.egressId).toBe("EG_1");
  });

  it("firma con un token de 60 s acotado a ESA sala y con roomRecord", async () => {
    await startRoomComposite({ config, storage, room: "clase-ses-1", filepath: "a.mp4" });

    const token = ultima().headers.Authorization.replace("Bearer ", "");
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );

    expect(payload.video.room).toBe("clase-ses-1");
    expect(payload.video.roomRecord).toBe(true);
    // Es una credencial de gestión: no publica, no se suscribe, no modera.
    expect(payload.video.canPublish).toBe(false);
    expect(payload.video.canSubscribe).toBe(false);
    expect(payload.video.roomAdmin).toBeUndefined();
    expect(payload.exp - payload.iat).toBe(60);
  });

  it("acepta la respuesta con los nombres del proto", async () => {
    fetchMock.mockResolvedValue(ok({ egress_id: "EG_2", status: "EGRESS_ACTIVE" }));
    const info = await startRoomComposite({ config, storage, room: "clase-1", filepath: "a.mp4" });
    expect(info.egressId).toBe("EG_2");
  });

  it("convierte un error de twirp en EgressRequestError con su código", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: "not_found", msg: "room not found" }),
    });

    const error = await startRoomComposite({
      config,
      storage,
      room: "clase-1",
      filepath: "a.mp4",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(EgressRequestError);
    expect(error.code).toBe("not_found");
    // Es el caso normal de pedir grabar antes de que alguien entre: merece un
    // 409 con instrucción, no un 502.
    expect(error.salaInexistente).toBe(true);
  });

  it("un 500 sin cuerpo JSON también es un error tipado", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const error = await startRoomComposite({
      config,
      storage,
      room: "clase-1",
      filepath: "a.mp4",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(EgressRequestError);
    expect(error.status).toBe(500);
    expect(error.salaInexistente).toBe(false);
  });

  it("una caída de red no explota sin tipo", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const error = await startRoomComposite({
      config,
      storage,
      room: "clase-1",
      filepath: "a.mp4",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(EgressRequestError);
    expect(error.status).toBe(0);
  });
});

describe("stopEgress", () => {
  it("manda el id del trabajo en snake_case", async () => {
    fetchMock.mockResolvedValue(ok({ egressId: "EG_1", status: "EGRESS_ENDING" }));
    await stopEgress({ config, room: "clase-1", egressId: "EG_1" });

    const { url, body } = ultima();
    expect(url).toContain("/twirp/livekit.Egress/StopEgress");
    expect(body).toEqual({ egress_id: "EG_1" });
  });
});

describe("listEgress", () => {
  it("consulta por sala y devuelve los trabajos normalizados", async () => {
    fetchMock.mockResolvedValue(
      ok({ items: [{ egress_id: "EG_1", status: "EGRESS_ACTIVE", room_name: "clase-1" }] }),
    );

    const items = await listEgress({ config, room: "clase-1", activos: true });

    expect(ultima().body).toEqual({ room_name: "clase-1", active: true });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ egressId: "EG_1", status: "EGRESS_ACTIVE" });
  });

  it("una respuesta sin items no rompe", async () => {
    fetchMock.mockResolvedValue(ok({}));
    expect(await listEgress({ config, room: "clase-1" })).toEqual([]);
  });
});

describe("getEgressStorageConfig", () => {
  const env = {
    SUPABASE_S3_ACCESS_KEY_ID: "AKIA",
    SUPABASE_S3_SECRET_ACCESS_KEY: "shh",
    SUPABASE_S3_REGION: "us-east-2",
    NEXT_PUBLIC_SUPABASE_URL: "https://proyecto.supabase.co",
  };

  it("deriva el endpoint S3 de la URL del proyecto", () => {
    expect(getEgressStorageConfig(env)).toEqual({
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      region: "us-east-2",
      endpoint: "https://proyecto.supabase.co/storage/v1/s3",
      bucket: "grabaciones",
    });
  });

  it("tolera la barra final de la URL", () => {
    const config = getEgressStorageConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://p.co/" });
    expect(config.endpoint).toBe("https://p.co/storage/v1/s3");
  });

  it("nombra TODAS las variables que faltan, no la primera", () => {
    const error = (() => {
      try {
        getEgressStorageConfig({});
      } catch (e) {
        return e as EgressNotConfiguredError;
      }
    })();

    expect(error).toBeInstanceOf(EgressNotConfiguredError);
    expect(error!.missing).toEqual([
      "SUPABASE_S3_ACCESS_KEY_ID",
      "SUPABASE_S3_SECRET_ACCESS_KEY",
      "SUPABASE_S3_REGION",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  });
});

describe("isEgressEnabled", () => {
  it("solo se enciende con un valor explícito", () => {
    expect(isEgressEnabled({ LIVEKIT_EGRESS_ENABLED: "true" })).toBe(true);
    expect(isEgressEnabled({ LIVEKIT_EGRESS_ENABLED: "1" })).toBe(true);
    expect(isEgressEnabled({ LIVEKIT_EGRESS_ENABLED: "ON" })).toBe(true);
    expect(isEgressEnabled({ LIVEKIT_EGRESS_ENABLED: "false" })).toBe(false);
    // Que la variable exista pero vacía NO enciende nada: es el estado por
    // defecto de un entorno recién creado.
    expect(isEgressEnabled({ LIVEKIT_EGRESS_ENABLED: "" })).toBe(false);
    expect(isEgressEnabled({})).toBe(false);
  });
});
