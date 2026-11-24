/* =============================================================================
   Reportes Institucionales · ayudas de texto del motor.

   Funciones puras, sin dependencias: comparar sin tildes, decidir si una celda
   está vacía, limpiar documentos y leer fechas del manual (dd/mm/aaaa).
   ========================================================================== */

/** Sin tildes, en mayúsculas y con los espacios colapsados: «  bogotá  d.c » → «BOGOTA D.C». */
export function normalizar(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Vacío = null, undefined o solo espacios. */
export function vacio(v: string | undefined | null): boolean {
  return v == null || String(v).trim() === "";
}

/** Documento sin puntos, comas, apóstrofes (rectos o tipográficos) ni espacios. */
export function documento(v: string): string {
  return String(v ?? "").replace(/[.,'’´`\s]/g, "");
}

/** Fecha dd/mm/aaaa o dd-mm-aaaa → Date (hora local, 00:00), o null si no existe (31/02 no pasa). */
export function fecha(v: string): Date | null {
  const m = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[3]);
  const anio = Number(m[4]);
  if (mes < 1 || mes > 12 || dia < 1) return null;
  const d = new Date(anio, mes - 1, dia);
  // Date «corrige» los días de más (31/02 → 03/03); si cambió, la fecha no existe.
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}

/** Encabezado comparable: sin tildes, Ñ→N, mayúsculas y espacios → «_». */
export function encabezado(v: string | null | undefined): string {
  return normalizar(String(v ?? "").replace(/[ñÑ]/g, "N"))
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}
