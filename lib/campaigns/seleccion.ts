/**
 * Reglas de la selección manual de destinatarios (0092).
 *
 * Viven acá y no en el componente porque son la traducción entre lo que se ve en
 * pantalla y lo que se guarda en la base, y equivocarse manda un correo a gente
 * que nadie eligió. Son puras a propósito: se pueden probar sin montar la UI.
 *
 * La distinción que sostiene todo: `null` (sin selección manual, o sea toda la
 * audiencia del filtro) NO es lo mismo que una lista que hoy contiene a todos.
 * Cuando la audiencia cambie, `null` seguirá alcanzando a todos y la lista no.
 */

/** Ids de la audiencia viva que quedan efectivamente seleccionados. */
export function seleccionEfectiva(
  audienceIds: string[],
  selected: string[] | null,
): string[] {
  if (selected === null) return audienceIds;
  const enAudiencia = new Set(audienceIds);
  // El filtrado va SIEMPRE primero: una selección guardada puede arrastrar a
  // quien ya salió de la cohorte, y contarlo daría un total que no existe.
  return selected.filter((id) => enAudiencia.has(id));
}

/**
 * Qué guardar en `email_campaigns.audience_student_ids`.
 *
 * Devuelve `null` cuando la selección cubre a toda la audiencia (que es lo que
 * la pantalla muestra como "todos") y la lista concreta en cualquier otro caso.
 *
 * `audienceReady` existe porque el caso peligroso no es la lista vacía sino la
 * audiencia DESCONOCIDA: mientras carga, `audienceIds` está vacío y comparar
 * tamaños da `0 === 0`, o sea "ya están todos". Guardar ahí convertía una
 * selección de doce personas en un envío a la cohorte entera.
 */
export function audienceStudentIdsParaGuardar(
  audienceIds: string[],
  selected: string[] | null,
  audienceReady: boolean,
): { ok: true; value: string[] | null } | { ok: false; reason: "audiencia-desconocida" | "nadie" } {
  if (!audienceReady) return { ok: false, reason: "audiencia-desconocida" };

  if (selected === null) return { ok: true, value: null };

  const efectiva = seleccionEfectiva(audienceIds, selected);

  // Con audiencia vacía de verdad no hay nada que seleccionar; el envío fallará
  // por audiencia vacía, que es un error distinto y ya tiene su mensaje.
  if (audienceIds.length === 0) return { ok: true, value: null };

  if (efectiva.length === 0) return { ok: false, reason: "nadie" };

  return { ok: true, value: efectiva.length === audienceIds.length ? null : efectiva };
}
