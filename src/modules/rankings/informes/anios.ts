/* =============================================================================
   Informes ODS · año de las noticias de cada edición (regla del 2026-10-14).

   Las noticias del año N van al informe de la EDICIÓN N+1: las de 2025 van a
   la edición 2026; las de 2024, a la 2025. Esta es la única fuente de la regla.
   La función de Pilo (supabase/functions/pilo-rankingsod/anios.ts) es una copia
   de este archivo: si cambia aquí, cámbiela allá (la prueba lo vigila).
   ========================================================================== */

/** Años de diferencia entre la noticia y la edición que la reporta. */
export const DESFASE_NOTICIAS = 1;

/** Año de publicación de las noticias de una edición (edición 2026 → 2025). */
export const anioDeNoticias = (edicion: number): number => edicion - DESFASE_NOTICIAS;

/** Edición que reporta las noticias de un año (2025 → 2026). Inversa de anioDeNoticias. */
export const edicionDeNoticias = (anio: number): number => anio + DESFASE_NOTICIAS;

/** Fechas ISO [desde, hasta) de un año calendario, para filtrar published_on. */
export const rangoFechasDeAnio = (anio: number): { desde: string; hasta: string } => ({ desde: `${anio}-01-01`, hasta: `${anio + 1}-01-01` });
