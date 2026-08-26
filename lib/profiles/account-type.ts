/**
 * Naturaleza de una cuenta: alumno real, persona del equipo o cuenta de QA.
 *
 * ADR-0037. La columna es `profiles.account_type` (migración 0104).
 *
 * Este módulo existe para que la regla viva en UN solo lugar. El antecedente
 * directo es `isStaffEnrollment` (lib/admin/actividad-queries.ts), que resolvía
 * lo mismo pero solo miraba `system_role` y solo se aplicó en un consumidor: el
 * panel de actividad quedó limpio y los otros diez siguieron contando cuentas
 * del equipo. Cualquier consulta nueva que liste alumnos para un CORREO o para
 * un NÚMERO debe pasar por acá.
 *
 * Lo que este filtro NO hace: quitar acceso. Una cuenta 'staff' entra al aula,
 * rinde quiz y entra a la sala igual que antes — la resolución de permisos
 * (verify-enrollment, evaluation-access, conversaciones/access, …) ignora este
 * campo a propósito. Acá solo se decide quién cuenta y a quién se le escribe.
 */

export type AccountType = "real" | "staff" | "test";

/**
 * Fragmento a incluir en el `select()` de PostgREST cuando la consulta va a
 * filtrar por naturaleza de cuenta. Se expone como constante para que agregar
 * la columna no se olvide en un consumidor nuevo.
 */
export const ACCOUNT_TYPE_FIELD = "account_type";

/** Perfil mínimo que este módulo necesita para decidir. */
export type ProfileAccountRef = {
  account_type?: string | null;
} | null | undefined;

/**
 * `true` si la cuenta NO es de un alumno real (equipo o QA).
 *
 * Un `account_type` ausente o nulo se trata como REAL, no como interno: la
 * columna tiene default 'real' y not null, así que un nulo solo aparece si la
 * consulta olvidó pedir la columna. Fallar hacia "es real" mantiene a la
 * persona dentro de sus correos y sus métricas; el error inverso la borra de
 * los reportes y le corta las comunicaciones en silencio, que es mucho peor.
 */
export function isInternalAccount(accountType: string | null | undefined): boolean {
  return accountType === "staff" || accountType === "test";
}

/** `true` si el perfil corresponde a un alumno real (el que cuenta y recibe correos). */
export function isRealStudent(profile: ProfileAccountRef): boolean {
  return !isInternalAccount(profile?.account_type);
}

/**
 * Filtra una lista de matrículas dejando solo las de alumnos reales.
 *
 * Genérico sobre la forma de la fila porque cada consumidor arma su propio
 * `select` (unos traen `profiles(email, full_name)`, otros agregan más
 * columnas); lo único que se exige es poder llegar al perfil.
 */
export function onlyRealStudents<T>(
  rows: readonly T[],
  getProfile: (row: T) => ProfileAccountRef,
): T[] {
  return rows.filter((row) => isRealStudent(getProfile(row)));
}
