/* =============================================================================
   Tablero IGA · detalle de un programa, para cualquier tema.

   Recorre TODAS las tablas conectadas en la Guía de datos (cualquier tema del
   observatorio) y toma lo que cada una trae de ese programa y sede: la última
   cifra de cada medida y su serie en el tiempo, junto al promedio de su facultad.
   Una tabla entra si trae la columna «programa»; sin ella (agregada a otro nivel)
   no puede hablar de un programa y se omite. Funciones puras.
   ========================================================================== */

import type { ObsColumn, ObsDataset } from "../model";
import type { Indicador } from "../guia/api";
import { numberOf, textOf } from "../../../datos-abiertos/data/free-sets";
import { num, pct } from "./financiero-datos";

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const TIEMPO = /^(periodo|semestre|anio|ano|year|vigencia|corte)$/;

export interface BloqueDetalle {
  id: string;
  indicador: string;
  titulo: string;
  tema: string;
  clave: string;
  col: ObsColumn;
  periodos: string[];
  programa: (number | null)[];
  facultad: (number | null)[];
  ultimo: { t: string; v: number } | null;
}

function col(ds: ObsDataset, nombre: string): ObsColumn | undefined {
  return ds.columns.find((c) => plano(c.key) === nombre || plano(c.label).replace(/\s+/g, "_") === nombre);
}

const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Fracciones (0–1) que se leen como porcentaje; el resto se escribe tal cual. */
const FRACCION = /(desercion|descuento|nomina|costos?_directos|exc_|contribucion|tasa|proporcion)/;
const YA_PORCENTAJE = /^(pct_|porcentaje)/;

export function formatoMedida(c: Pick<ObsColumn, "key" | "format">, v: number): string {
  const k = plano(c.key);
  if (c.format === "porcentaje" || FRACCION.test(k)) return Math.abs(v) <= 3 ? pct(v, 1) : `${num(v)} %`;
  if (YA_PORCENTAJE.test(k)) return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v)} %`;
  return Number.isInteger(v) ? num(v) : new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v);
}

export function bloquesDelPrograma(indicadores: Indicador[], datasets: ObsDataset[], p: { programa: string; sede: string; facultad: string }, excluir: (i: Indicador) => boolean = () => false): BloqueDetalle[] {
  const out: BloqueDetalle[] = [];
  for (const ind of indicadores) {
    if (ind.origen_tipo !== "tabla" || !ind.origen_ref || excluir(ind)) continue;
    const ds = datasets.find((d) => d.id === ind.origen_ref);
    if (!ds) continue;
    const cPrograma = col(ds, "programa");
    if (!cPrograma) continue;
    const cSede = col(ds, "sede");
    const cFac = col(ds, "facultad");
    const cTiempo = ds.columns.find((c) => TIEMPO.test(plano(c.key)));
    const medidas = ds.columns.filter((c) => c.kind === "cifra" && c !== cTiempo);
    const propias = ds.rows.filter((r) => r.kind === "dato" && textOf(r.cells[cPrograma.key]) === p.programa && (!cSede || !p.sede || textOf(r.cells[cSede.key]) === p.sede));
    if (!propias.length) continue;
    const delaFac = cFac && p.facultad ? ds.rows.filter((r) => r.kind === "dato" && textOf(r.cells[cFac.key]) === p.facultad) : [];
    const tiempoDe = (r: (typeof ds.rows)[number]) => (cTiempo ? textOf(r.cells[cTiempo.key]) : "");
    const periodos = [...new Set(propias.map(tiempoDe))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    for (const m of medidas) {
      const vals = periodos.map((t) => {
        const xs = propias.filter((r) => tiempoDe(r) === t).map((r) => numberOf(r.cells[m.key])).filter((v): v is number => v !== null);
        return xs.length ? xs[0] : null;
      });
      if (vals.every((v) => v === null)) continue;
      const fac = periodos.map((t) => prom(delaFac.filter((r) => tiempoDe(r) === t).map((r) => numberOf(r.cells[m.key])).filter((v): v is number => v !== null)));
      let u: BloqueDetalle["ultimo"] = null;
      for (let i = vals.length - 1; i >= 0; i -= 1) if (vals[i] !== null) { u = { t: periodos[i], v: vals[i] as number }; break; }
      out.push({
        id: `${ind.id}:${m.key}`,
        indicador: ind.nombre,
        titulo: medidas.length > 1 ? `${ind.nombre} · ${m.label}` : ind.nombre,
        tema: ind.tema_slug,
        clave: ind.clave,
        col: m,
        periodos,
        programa: vals,
        facultad: fac,
        ultimo: u,
      });
    }
  }
  return out;
}
