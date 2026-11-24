/* =============================================================================
   UDrive · la geometría del bloque «mapa» (OpenStreetMap), sin React.

   El mapa se arma con teselas estándar de OSM (Web Mercator, 256 px) puestas en
   una rejilla: el editor, el PDF y el Word usan estas mismas cuentas. El mapa
   se dibuja siempre sobre un lienzo lógico de ANCHO_MAPA × ALTO_MAPA píxeles;
   el ancho del bloque solo lo escala, así la zona que se ve no cambia.

   Política de uso de OSM: solo las teselas que se ven (nunca precarga), zoom
   entre ZOOM_MIN y ZOOM_MAX y la atribución siempre visible.
   ========================================================================== */

export const ANCHO_MAPA = 640;
export const ALTO_MAPA = 360;
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 18;
export const ATRIBUCION = "© colaboradores de OpenStreetMap";
/** Bucaramanga, sede principal: donde empieza un mapa nuevo. */
export const CENTRO_INICIAL = { lat: 7.1193, lng: -73.1227, zoom: 13 } as const;

export const LAT_MAX = 85.0511;

export const limitar = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Coordenadas en píxeles del mundo (a ese zoom) de un punto. */
export function proyectar(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const escala = 256 * 2 ** zoom;
  const la = limitar(lat, -LAT_MAX, LAT_MAX);
  const s = Math.sin((la * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * escala, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala };
}

/** Lo contrario: de píxeles del mundo a latitud y longitud. */
export function desproyectar(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const escala = 256 * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / escala;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / escala) * 360 - 180 };
}

export interface Tesela {
  url: string;
  /** Posición y tamaño dentro del lienzo lógico, en píxeles. */
  x: number;
  y: number;
}

export const urlTesela = (z: number, x: number, y: number): string => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** Las teselas que cubren el lienzo (como mucho 4 × 3 + el borde), sin repetir. */
export function teselasVisibles(lat: number, lng: number, zoom: number): Tesela[] {
  const c = proyectar(lat, lng, zoom);
  const izq = c.x - ANCHO_MAPA / 2;
  const arr = c.y - ALTO_MAPA / 2;
  const n = 2 ** zoom;
  const salida: Tesela[] = [];
  for (let ty = Math.floor(arr / 256); ty <= Math.floor((arr + ALTO_MAPA - 1) / 256); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(izq / 256); tx <= Math.floor((izq + ANCHO_MAPA - 1) / 256); tx++) {
      salida.push({ url: urlTesela(zoom, ((tx % n) + n) % n, ty), x: tx * 256 - izq, y: ty * 256 - arr });
    }
  }
  return salida;
}

/** Dónde cae un punto dentro del lienzo lógico (puede quedar fuera). */
export function puntoEnMapa(lat: number, lng: number, centro: { lat: number; lng: number; zoom: number }): { x: number; y: number } {
  const c = proyectar(centro.lat, centro.lng, centro.zoom);
  const p = proyectar(lat, lng, centro.zoom);
  return { x: p.x - c.x + ANCHO_MAPA / 2, y: p.y - c.y + ALTO_MAPA / 2 };
}

/** El punto geográfico bajo (x, y) del lienzo lógico: para mover el centro con un clic. */
export function puntoDesdeMapa(x: number, y: number, centro: { lat: number; lng: number; zoom: number }): { lat: number; lng: number } {
  const c = proyectar(centro.lat, centro.lng, centro.zoom);
  const g = desproyectar(c.x + x - ANCHO_MAPA / 2, c.y + y - ALTO_MAPA / 2, centro.zoom);
  return { lat: limitar(g.lat, -LAT_MAX, LAT_MAX), lng: ((g.lng + 540) % 360) - 180 };
}

export const redondear = (v: number): number => Math.round(v * 1e5) / 1e5;

/* ---------- buscar un lugar (Nominatim, de OpenStreetMap) ------------------------------------------ */

export interface Lugar {
  nombre: string;
  lat: number;
  lng: number;
}

/** Una consulta a Nominatim por acción de la persona (nunca mientras escribe). Máximo 5 resultados. */
export async function buscarLugar(consulta: string, signal?: AbortSignal): Promise<Lugar[]> {
  const q = consulta.trim().slice(0, 200);
  if (q.length < 3) return [];
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=${encodeURIComponent(q)}`, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(r.status === 429 ? "OpenStreetMap pide esperar un momento antes de otra búsqueda." : "No se pudo buscar el lugar. Inténtelo de nuevo.");
  const datos = (await r.json()) as unknown;
  if (!Array.isArray(datos)) return [];
  return datos.flatMap((d: unknown) => {
    const o = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
    const lat = Number(o.lat);
    const lng = Number(o.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof o.display_name !== "string") return [];
    return [{ nombre: o.display_name.slice(0, 200), lat: redondear(lat), lng: redondear(lng) }];
  });
}
