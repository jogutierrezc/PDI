/* =============================================================================
   Rutas UDES · las paradas de una ruta nueva.

   Lógica pura de la carga de rutas: leer las paradas que se pegan y armar el
   recorrido completo del bus. El bus de la simulación recorre las paradas en
   orden y vuelve a la UDES, así que el recorrido tiene que cerrarse: o regresa
   directo a la primera parada, o regresa pasando por las mismas paradas.
   ========================================================================== */

import type { ParadaRuta, RegresoRuta } from "./tipos";

/** Colombia, con holgura: una coordenada fuera es casi seguro lat y lon invertidas. */
export const dentroDeColombia = (lon: number, lat: number) => lat >= -4.5 && lat <= 13.5 && lon >= -82 && lon <= -66;

/**
 * Lee las paradas pegadas, una por línea: «nombre; latitud; longitud».
 * Acepta ; o tabulación y coma decimal. Devuelve las paradas o el motivo del primer error.
 */
export function leerParadas(texto: string): { paradas: ParadaRuta[]; error: string | null } {
  const paradas: ParadaRuta[] = [];
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lineas.length; i++) {
    const partes = lineas[i].split(/[;\t]/).map((p) => p.trim());
    if (partes.length < 3) return { paradas, error: `Línea ${i + 1}: use «nombre; latitud; longitud».` };
    const lat = Number(partes[1].replace(",", "."));
    const lon = Number(partes[2].replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { paradas, error: `Línea ${i + 1}: la latitud y la longitud deben ser números.` };
    if (!dentroDeColombia(lon, lat)) return { paradas, error: `Línea ${i + 1}: esa coordenada queda fuera de Colombia. ¿Están invertidas la latitud y la longitud?` };
    if (!partes[0] || partes[0].length > 120) return { paradas, error: `Línea ${i + 1}: falta el nombre de la parada (hasta 120 caracteres).` };
    paradas.push({ name: partes[0], lat, lon });
  }
  if (paradas.length < 2) return { paradas, error: "Una ruta necesita al menos dos paradas." };
  return { paradas, error: null };
}

/**
 * El recorrido completo del bus, que siempre termina donde empezó (la UDES).
 *  · directo: de la última parada vuelve por el camino más corto a la primera.
 *  · mismas:  vuelve pasando por las paradas intermedias en sentido contrario (ida y vuelta).
 */
export function paradasDelRecorrido(paradas: ParadaRuta[], regreso: RegresoRuta): ParadaRuta[] {
  if (paradas.length < 2) return paradas;
  const primera = paradas[0];
  if (regreso === "directo") return [...paradas, { ...primera }];
  const vuelta = paradas
    .slice(0, -1)
    .reverse()
    .map((p, i, todas) => (i === todas.length - 1 ? { ...p } : { ...p, name: `${p.name} (regreso)` }));
  return [...paradas, ...vuelta];
}
