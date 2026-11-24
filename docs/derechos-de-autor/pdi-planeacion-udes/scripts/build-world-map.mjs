/* =============================================================================
   Genera src/modules/datos-abiertos/data/world-map.ts: el mapa del mundo de
   movilidad internacional.

   Fuente: Natural Earth (dominio público), países admin-0.
   · 1:110m para las siluetas: liviano y suficiente a ancho de página.
   · 1:50m solo para la lista de países y su punto de rótulo: los países que no
     caben en 1:110m (Singapur, Malta, Barbados…) se dibujan como punto y se
     pueden capturar igual.

   Proyección Natural Earth I (la misma fórmula de d3.geoNaturalEarth1), sin
   Antártida. El código de cada país es ISO 3166-1 alfa-3: es lo que guarda
   od_map_values.department_code en los mapas entrante y saliente.

   Ejecutar con: node scripts/build-world-map.mjs [ruta-110m.geojson] [ruta-50m.geojson]
   Sin rutas, descarga los archivos de GitHub.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const WIDTH = 1000;
const MIN_LAT = -57;
const MAX_LAT = 84;
const OUT = "src/modules/datos-abiertos/data/world-map.ts";

/** Ciudades de los campus (longitud, latitud). Un campus nuevo se añade aquí. */
const CAMPUS_LONLAT = {
  bucaramanga: [-73.1227, 7.1193],
  cucuta: [-72.5078, 7.8939],
  valledupar: [-73.2532, 10.4631],
  bogota: [-74.0721, 4.711],
};

/** Nombres en español que Natural Earth no trae como se usan en Colombia. */
const NAMES = { TWN: "Taiwán", SWZ: "Esuatini", CZE: "Chequia", PSE: "Palestina" };

/** Territorios sin sentido para movilidad académica. */
const SKIP = new Set(["ATA", "ATF", "HMD", "SGS", "IOT", "KAS", "PCN"]);

async function load(path, name) {
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.json();
}

const code = (p) => (/^[A-Z]{3}$/.test(p.ISO_A3_EH) ? p.ISO_A3_EH : p.ADM0_A3);

function naturalEarth(lon, lat) {
  const lambda = (lon * Math.PI) / 180;
  const phi = (Math.max(MIN_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const p2 = phi * phi;
  const p4 = p2 * p2;
  const x = lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [x, -y];
}

const [left] = naturalEarth(-180, 0);
const [right] = naturalEarth(180, 0);
const [, top] = naturalEarth(0, MAX_LAT);
const [, bottom] = naturalEarth(0, MIN_LAT);
const K = WIDTH / (right - left);
const HEIGHT = Math.round((bottom - top) * K);
const round = (n) => Math.round(n * 10) / 10;
const project = (lon, lat) => {
  const [x, y] = naturalEarth(lon, lat);
  return [round((x - left) * K), round((y - top) * K)];
};

function ringPath(ring) {
  const points = [];
  for (const [lon, lat] of ring) {
    const point = project(lon, lat);
    const last = points[points.length - 1];
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.7) continue;
    points.push(point);
  }
  if (points.length < 3) return { d: "", area: 0 };
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  return { d: `M${points.map((p) => p.join(" ")).join("L")}Z`, area: Math.abs(area / 2) };
}

function shapePath(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const rings = polygons.flatMap((polygon) => polygon.map(ringPath)).filter((r) => r.d);
  const biggest = Math.max(0, ...rings.map((r) => r.area));
  // Islas diminutas fuera: a este tamaño son ruido. La mayor siempre se queda.
  return rings.filter((r) => r.area >= 2 || r.area === biggest).map((r) => r.d).join("");
}

const [small, detailed] = await Promise.all([
  load(process.argv[2], "ne_110m_admin_0_countries.geojson"),
  load(process.argv[3], "ne_50m_admin_0_countries.geojson"),
]);

/**
 * Un territorio dependiente comparte el código ISO de su país (las islas
 * australianas del Índico son AUS). Por código se queda la unidad más poblada:
 * el país, no su dependencia.
 */
function byCode(features) {
  const kept = new Map();
  for (const f of features) {
    const current = kept.get(code(f.properties));
    if (!current || (f.properties.POP_EST ?? 0) > (current.properties.POP_EST ?? 0)) kept.set(code(f.properties), f);
  }
  return [...kept.values()];
}

const shapes = new Map(byCode(small.features).map((f) => [code(f.properties), shapePath(f.geometry)]));
const countries = byCode(detailed.features)
  .map((f) => f.properties)
  .filter((p) => !SKIP.has(code(p)))
  .map((p) => ({
    code: code(p),
    name: NAMES[code(p)] ?? (p.NAME_ES || p.NAME),
    c: project(p.LABEL_X, p.LABEL_Y),
    ...(shapes.get(code(p)) ? { d: shapes.get(code(p)) } : {}),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

const campusPoints = Object.fromEntries(Object.entries(CAMPUS_LONLAT).map(([slug, [lon, lat]]) => [slug, project(lon, lat)]));

writeFileSync(
  OUT,
  `/* =============================================================================
   Mapa del mundo para movilidad internacional.

   Generado con scripts/build-world-map.mjs a partir de Natural Earth (1:110m
   para las siluetas, 1:50m para la lista de países), en proyección Natural
   Earth I y ${WIDTH}×${HEIGHT}. Un país sin silueta (\`d\`) es demasiado pequeño a
   esta escala y se dibuja como punto. No editar a mano: regenerar con el script.
   ========================================================================== */

export interface CountryShape {
  /** ISO 3166-1 alfa-3. */
  code: string;
  name: string;
  d?: string;
  /** Punto de rótulo en coordenadas del mapa. */
  c: [number, number];
}

export const WORLD_WIDTH = ${WIDTH};
export const WORLD_HEIGHT = ${HEIGHT};

/** Ubicación de las ciudades de los campus en el mapa del mundo, por slug. */
export const WORLD_CAMPUS_POINTS: Record<string, [number, number]> = ${JSON.stringify(campusPoints)};

export const COUNTRIES: CountryShape[] = ${JSON.stringify(countries)};
`,
);

console.log(`${OUT}: ${countries.length} países, ${shapes.size} siluetas, ${WIDTH}×${HEIGHT}`);
