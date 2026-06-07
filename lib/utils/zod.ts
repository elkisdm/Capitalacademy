import { z } from "zod";

/**
 * Valida formato UUID de forma PERMISIVA: cualquier `8-4-4-4-12` hexadecimal,
 * que es lo que Postgres acepta como tipo `uuid`.
 *
 * NO usar `z.string().uuid()` para IDs del classroom: los IDs semilla
 * (ej. `d0000000-0000-0000-0000-000000000001`) son uuids válidos para Postgres
 * pero NO cumplen los nibbles de versión/variante de RFC 4122, así que
 * `z.string().uuid()` los rechaza con 422 y rompe progress/comments/quiz.
 */
export const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "ID inválido",
  );
