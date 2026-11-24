/* =============================================================================
   Municipios de Colombia para el mapa de origen.

   Descarga la DIVIPOLA del DANE (datos.gov.co, conjunto gdxc-w37w: código,
   nombre, departamento y centroide de los 1.122 municipios) y la proyecta en
   el mismo lienzo de 600×826 que el mapa por departamento (colombia-map.ts).

   La proyección es Mercator; sus cuatro constantes se ajustaron con las
   ciudades de los tres campus, que ya estaban ubicadas en ese lienzo, y caen
   a menos de medio punto de su sitio. San Andrés y Providencia van en el
   recuadro de la esquina, como en cualquier mapa oficial de Colombia.

   Ejecutar con: node scripts/build-municipios.mjs
   ========================================================================== */

import { writeFileSync } from "node:fs";

const FUENTE = "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000";
const SALIDA = new URL("../src/modules/datos-abiertos/data/colombia-municipios.ts", import.meta.url);

// x = AX·lon + BX ; y = AY·mercator(lat) + BY
const AX = 49.4976;
const BX = 3912.508;
const AY = -2818.699;
const BY = 616.62;

// Recuadro del archipiélago (esquina superior izquierda del lienzo).
const RECUADRO = { "88001": [34, 58], "88564": [58, 30] };

const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
const num = (s) => Number(String(s).replace(",", "."));

const MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
function titulo(nombre) {
  return nombre
    .toLowerCase()
    .split(/(\s+|-|\()/)
    .map((p, i) => (i > 0 && MENORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("")
    .replace(/\bD\.c\./i, "D. C.");
}

const filas = await (await fetch(FUENTE)).json();
if (!Array.isArray(filas) || filas.length < 1000) throw new Error(`DIVIPOLA incompleta: ${filas.length} filas`);

const municipios = filas
  .map((f) => {
    const code = f.cod_mpio;
    const [x, y] = RECUADRO[code] ?? [AX * num(f.longitud) + BX, AY * mercator(num(f.latitud)) + BY];
    return [code, titulo(f.nom_mpio), Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  })
  .sort((a, b) => a[0].localeCompare(b[0]));

const cuerpo = `/* =============================================================================
   Municipios de Colombia: código DIVIPOLA, nombre y centroide en el lienzo
   del mapa (600×826, Mercator, el mismo de colombia-map.ts).

   GENERADO por scripts/build-municipios.mjs a partir de la DIVIPOLA del DANE.
   No editar a mano. ${municipios.length} municipios.
   ========================================================================== */

/** [código DIVIPOLA, nombre, x, y]. Los dos primeros dígitos son el departamento. */
export type Municipio = [code: string, name: string, x: number, y: number];

/** Recuadro de San Andrés y Providencia en el lienzo. */
export const ARCHIPELAGO_BOX = { x: 14, y: 14, w: 64, h: 60 };

export const MUNICIPIOS: Municipio[] = ${JSON.stringify(municipios)};
`;

writeFileSync(SALIDA, cuerpo);
console.log(`OK  ${municipios.length} municipios → ${SALIDA.pathname}`);
