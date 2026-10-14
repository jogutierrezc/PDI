/* =============================================================================
   Internacionalización · puente «Enviar a SNIES».

   Lleva filas APROBADAS del repositorio a una plantilla del módulo Reportes
   Institucionales, en el formato de ri_filas (NOMBRES, no códigos: el código
   lo pone Reportes al exportar para HECAA). No duplica la lógica de Reportes:
   usa su catálogo (snies/plantillas), su motor (canonizar y validarCeldas) y
   su contexto (catálogos de programas, municipios y países).

   Qué plantillas alimenta (evidencia: el catálogo de hoy tiene Participante,
   Inscritos, Inscritos por programa, Admitidos, Primer curso, Matriculados,
   Graduados y Docentes —esta sin campos—; NINGUNA de movilidad ni convenios):
     · participante — sí. Toda persona de la comunidad académica (también el
       estudiante o docente extranjero que llega) va en Participante, y sus
       obligatorios (documento, nombres, sexo, estado civil, nacimiento, país)
       son conceptos del repositorio. Se alimenta solo desde una hoja que los
       lleve todos (puedeAlimentar).
     · las de estudiantes (inscritos…graduados) — no: piden datos que no son
       de Internacionalización (código de estudiante, valor de matrícula,
       Saber 11/Pro, estrato…). Su cobertura se calcula igual, para verlo.
   El día que el catálogo tenga una plantilla de movilidad, basta con añadirla
   a PUENTE_SNIES (y a MAPEO_SNIES si trae campos nuevos).

   La escritura la hace int_enviar_snies (0151): comprueba en la base que cada
   fila de origen esté aprobada y AGREGA solo las que la entrega no tiene por
   su clave (idempotente, no pisa lo cargado por otros medios).
   ========================================================================== */

import { motor } from "../../reportes/motor";
import { documento } from "../../reportes/motor/texto";
import type { Campo, Contexto, ErrorFila, Fila, PlantillaId, PlantillaSpec } from "../../reportes/tipos";
import type { FilaConEstado, IntValor } from "../tipos";
import { cobertura, type Disponibles, mapeoDeCampo, plantillaDesdeSnies } from "./cobertura";
import { aFechaIso } from "./validacion";

export interface PuenteDef {
  plantilla: PlantillaId;
  /** Campos que identifican una fila en la plantilla: con ellos no se duplica. */
  clave: string[];
  porQue: string;
}

/** Plantillas SNIES que el repositorio puede alimentar. */
export const PUENTE_SNIES: readonly PuenteDef[] = [
  {
    plantilla: "participante",
    clave: ["NUM_DOCUMENTO"],
    porQue: "Las personas en movilidad entrante (y los visitantes) deben estar en Participante; sus obligatorios son conceptos del repositorio.",
  },
];

export function definicionPuente(plantilla: PlantillaId): PuenteDef | null {
  return PUENTE_SNIES.find((p) => p.plantilla === plantilla) ?? null;
}

/** ¿Puede una hoja (por sus conceptos) alimentar la plantilla? Faltan = obligatorios sin concepto. */
export function puedeAlimentar(spec: PlantillaSpec, disponibles: Disponibles): { si: boolean; faltan: string[] } {
  if (!definicionPuente(spec.id) || !spec.disponible) return { si: false, faltan: [] };
  const faltan = cobertura(plantillaDesdeSnies(spec), disponibles).obligatoriasFaltantes;
  return { si: faltan.length === 0, faltan };
}

export interface ContextoPuente {
  /** Contexto del motor de Reportes (catálogos y dominios); armarContexto() de reportes/util. */
  contexto: Contexto;
  /** Código del periodo («2026-2»). */
  periodo: string;
  /** Campus → municipio de su sede tal como lo nombra el catálogo («Bucaramanga (Santander)»). */
  sedePorCampus?: Readonly<Record<string, string>>;
}

const texto = (v: IntValor | undefined) => (v === null || v === undefined ? "" : String(v).trim());

/** dd/mm/aaaa desde «AAAA-MM-DD». */
function fechaSnies(v: IntValor | undefined): string {
  const iso = aFechaIso(v);
  if (!iso) return texto(v);
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function valorDeCampo(campo: Campo, datos: Readonly<Record<string, IntValor>>, campusId: string, ctx: ContextoPuente): string {
  const mapeo = mapeoDeCampo(campo);
  let v = "";
  if (campo.codigo === "AÑO") v = ctx.periodo.slice(0, 4);
  else if (campo.codigo === "SEMESTRE") v = ctx.periodo.slice(5);
  else if (mapeo.concepto_id === "campus") v = ctx.sedePorCampus?.[campusId] ?? "";
  else if (mapeo.concepto_id) v = campo.formato === "fecha" ? fechaSnies(datos[mapeo.concepto_id]) : texto(datos[mapeo.concepto_id]);
  if (!v) return "";
  if (campo.formato === "documento") v = documento(v);
  return campo.fuente ? motor.canonizar(campo, v, ctx.contexto) : v;
}

/** Una fila del repositorio como fila de la plantilla (nombres, no códigos). */
export function filaSnies(spec: PlantillaSpec, datos: Readonly<Record<string, IntValor>>, campusId: string, ctx: ContextoPuente): Fila {
  const fila: Fila = {};
  for (const campo of spec.campos) fila[campo.codigo] = valorDeCampo(campo, datos, campusId, ctx);
  return fila;
}

/** La clave de una fila, como la calcula int_enviar_snies (sin puntos ni espacios, en mayúsculas). */
export function claveDeFila(fila: Fila, clave: readonly string[]): string {
  return clave.map((k) => documento(fila[k] ?? "").toUpperCase()).join("|");
}

export interface EnvioSnies {
  /** Lo que se manda a int_enviar_snies: {origen, datos}. */
  filas: { origen: string; datos: Fila }[];
  /** Filas aprobadas que el motor de Reportes rechaza (no se mandan). */
  rechazadas: { origen: string; errores: ErrorFila[] }[];
  /** Filas que no estaban aprobadas (no se mandan). */
  noAprobadas: number;
  /** Repetidas por la clave dentro del mismo envío (se manda la primera). */
  repetidas: number;
}

/**
 * Arma el envío: solo filas aprobadas, convertidas a la plantilla, validadas
 * con el motor de Reportes (obligatorios, formatos y catálogos), sin repetir
 * clave. No toca la base.
 */
export function construirEnvioSnies(spec: PlantillaSpec, filas: readonly FilaConEstado[], ctx: ContextoPuente): EnvioSnies {
  const def = definicionPuente(spec.id);
  if (!def) throw new Error(`El repositorio de Internacionalización no alimenta la plantilla SNIES «${spec.nombre}».`);
  const aprobadas = filas.filter((f) => f.estado === "aprobado");
  const armadas = aprobadas.map((f) => ({ origen: f.id, datos: filaSnies(spec, f.datos, f.campus_id, ctx) }));
  const errores = motor.validarCeldas(spec, armadas.map((a) => a.datos), ctx.contexto);
  const porFila = new Map<number, ErrorFila[]>();
  for (const e of errores) porFila.set(e.fila, [...(porFila.get(e.fila) ?? []), e]);

  const salida: EnvioSnies = { filas: [], rechazadas: [], noAprobadas: filas.length - aprobadas.length, repetidas: 0 };
  const vistas = new Set<string>();
  armadas.forEach((a, i) => {
    const errs = porFila.get(i);
    if (errs?.length) {
      salida.rechazadas.push({ origen: a.origen, errores: errs });
      return;
    }
    const k = claveDeFila(a.datos, def.clave);
    if (vistas.has(k)) {
      salida.repetidas++;
      return;
    }
    vistas.add(k);
    salida.filas.push(a);
  });
  return salida;
}
