// Copia exacta de src/modules/rankings/informes/anios.ts (la función Deno no puede importar de src/).
// Si cambia el original, cambie también este archivo: tests/noticias/anios.test.ts lo vigila.

/** Años de diferencia entre la noticia y la edición que la reporta. */
export const DESFASE_NOTICIAS = 1;

/** Año de publicación de las noticias de una edición (edición 2026 → 2025). */
export const anioDeNoticias = (edicion: number): number => edicion - DESFASE_NOTICIAS;

/** Edición que reporta las noticias de un año (2025 → 2026). Inversa de anioDeNoticias. */
export const edicionDeNoticias = (anio: number): number => anio + DESFASE_NOTICIAS;

/** Fechas ISO [desde, hasta) de un año calendario, para filtrar published_on. */
export const rangoFechasDeAnio = (anio: number): { desde: string; hasta: string } => ({ desde: `${anio}-01-01`, hasta: `${anio + 1}-01-01` });
