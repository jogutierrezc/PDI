/* =============================================================================
   Internacionalización · cifras del periodo.

   Mismo cálculo que la RPC int_cifras (0151), en una función pura: la
   pantalla usa la RPC (respeta RLS y el campus de quien pregunta); esta copia
   sirve para las pruebas, para una vista previa antes de aprobar y para
   documentar las reglas:
     · cuenta solo lo APROBADO; el Director puede incluir desde «validado» o
       desde «enviado»;
     · movilidad: hojas de clase «movilidad»; el sentido es el de la columna
       «Sentido de la movilidad» o, si no la hay, el de la hoja; el país es el
       de la contraparte o, si no, la nacionalidad;
     · personas: documentos distintos en movilidad, por campus;
     · convenios vigentes: hojas de clase «convenio» cuyo inicio ya pasó, cuyo
       fin (si lo hay) no ha llegado y cuyo inicio + vigencia (años) cubre la
       fecha de referencia (el cierre del periodo o, sin cierre, hoy).
   ========================================================================== */

import type { FilaConEstado, IntEstado, IntHojaRow } from "../tipos";
import { aFechaIso, aNumero } from "./validacion";

export type Incluir = "aprobado" | "validado" | "enviado";

export function estadosQueCuentan(incluir: Incluir, director: boolean): IntEstado[] {
  if (!director || incluir === "aprobado") return ["aprobado"];
  return incluir === "validado" ? ["validado", "aprobado"] : ["enviado", "validado", "aprobado"];
}

export interface Cifras {
  incluye: IntEstado[];
  referencia: string;
  por_hoja: { hoja_id: string; campus_id: string; filas: number }[];
  movilidad: { campus_id: string; sentido: string; total: number }[];
  por_pais: { pais: string; sentido: string; total: number }[];
  personas: { campus_id: string; total: number }[];
  convenios_vigentes: { campus_id: string; total: number }[];
}

/** Lo que devuelve la RPC int_cifras: Cifras + el avance por campus y hoja. */
export interface CifrasRpc extends Cifras {
  periodo: string;
  avance: { campus_id: string; hoja_id: string; estado: IntEstado; filas: number }[];
}

const limpio = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Cuenta pares (a, b): [{a, b, total}]. */
function contar(pares: [string, string][]): { a: string; b: string; total: number }[] {
  const mapa = new Map<string, { a: string; b: string; total: number }>();
  for (const [a, b] of pares) {
    const k = `${a}\u0000${b}`;
    const actual = mapa.get(k);
    if (actual) actual.total++;
    else mapa.set(k, { a, b, total: 1 });
  }
  return [...mapa.values()];
}

/** Agrega las filas ya filtradas por campus visible. `referencia`: «AAAA-MM-DD». */
export function calcularCifras(
  filas: readonly FilaConEstado[],
  hojas: readonly Pick<IntHojaRow, "id" | "clase" | "sentido">[],
  opciones: { incluir?: Incluir; director?: boolean; referencia: string },
): Cifras {
  const incluye = estadosQueCuentan(opciones.incluir ?? "aprobado", Boolean(opciones.director));
  const hojaDe = new Map(hojas.map((h) => [h.id, h]));
  const cuenta = filas.filter((f) => incluye.includes(f.estado) && hojaDe.has(f.hoja_id));
  const ref = opciones.referencia;

  const porHoja = new Map<string, { hoja_id: string; campus_id: string; filas: number }>();
  for (const f of cuenta) {
    const k = `${f.hoja_id}|${f.campus_id}`;
    const actual = porHoja.get(k) ?? { hoja_id: f.hoja_id, campus_id: f.campus_id, filas: 0 };
    actual.filas++;
    porHoja.set(k, actual);
  }

  const mov = cuenta
    .filter((f) => hojaDe.get(f.hoja_id)?.clase === "movilidad")
    .map((f) => ({
      campus_id: f.campus_id,
      sentido: (limpio(f.datos.sentido_movilidad) || hojaDe.get(f.hoja_id)?.sentido || "sin sentido").toLowerCase(),
      pais: limpio(f.datos.pais_contraparte) || limpio(f.datos.nacionalidad) || "Sin país",
      doc: limpio(f.datos.numero_documento).replace(/[.,'’´`\s]/g, ""),
    }));

  const personas = new Map<string, Set<string>>();
  for (const m of mov) {
    if (!m.doc) continue;
    personas.set(m.campus_id, (personas.get(m.campus_id) ?? new Set()).add(m.doc));
  }

  const vigentes = new Map<string, number>();
  for (const f of cuenta) {
    if (hojaDe.get(f.hoja_id)?.clase !== "convenio") continue;
    const ini = aFechaIso(f.datos.fecha_inicio);
    const fin = aFechaIso(f.datos.fecha_fin);
    const anios = aNumero(f.datos.vigencia_anios);
    if (ini && ini > ref) continue;
    if (fin && fin < ref) continue;
    if (ini && anios !== null) {
      // Como «fecha + interval 'n months'» de Postgres: el día se ajusta al último del mes.
      const [a, m, d] = ini.split("-").map(Number);
      const mes = m - 1 + Math.trunc(anios * 12);
      const ultimo = new Date(Date.UTC(a, mes + 1, 0)).getUTCDate();
      const hasta = new Date(Date.UTC(a, mes, Math.min(d, ultimo))).toISOString().slice(0, 10);
      if (hasta < ref) continue;
    }
    vigentes.set(f.campus_id, (vigentes.get(f.campus_id) ?? 0) + 1);
  }

  return {
    incluye,
    referencia: ref,
    por_hoja: [...porHoja.values()],
    movilidad: contar(mov.map((m) => [m.campus_id, m.sentido])).map(({ a, b, total }) => ({ campus_id: a, sentido: b, total })),
    por_pais: contar(mov.map((m) => [m.pais, m.sentido]))
      .map(({ a, b, total }) => ({ pais: a, sentido: b, total }))
      .sort((x, y) => y.total - x.total || x.pais.localeCompare(y.pais, "es")),
    personas: [...personas].map(([campus_id, s]) => ({ campus_id, total: s.size })),
    convenios_vigentes: [...vigentes].map(([campus_id, total]) => ({ campus_id, total })),
  };
}

/** Total de un sentido («saliente» / «entrante») sumando campus. */
export function totalSentido(c: Pick<Cifras, "movilidad">, sentido: string): number {
  return c.movilidad.filter((m) => m.sentido === sentido).reduce((s, m) => s + m.total, 0);
}
