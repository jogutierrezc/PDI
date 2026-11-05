/* =============================================================================
   Cumplimiento de Tipología · el cálculo del corte.

   Es el bloque «Cálculo» de `sincronizarModulo` de Roomy (biSync.js), sin la red
   ni la base: recibe los insumos que `ct_insumos` leyó del Warehouse, corre el
   motor sobre cada profesor y devuelve las filas que las funciones `ct_*`
   guardan. Escribir es de `api.ts`.

   Qué va a qué tabla importa más que cualquier otra cosa aquí:
     · `resumenes`     lo leen programas, decanos y vicerrectorías (ct_resumen).
     · `observaciones` también (ct_observacion): preventivas, recomendaciones…
     · `grupos`        también (ct_grupo_sin_matricula).
     · `master`        SOLO el administrador del módulo (ct_observacion_master):
                       la observación de 255 caracteres para Master y la ampliada.
                       Nunca se mezcla con las anteriores.
   ========================================================================== */

import {
  CAUSAS, PERFILES_TIPOLOGIA, REGLAS_BASE, TIPO,
  calcularMedidas, consideracionDeAprobacion, evaluarTipologia, horasContratoEsperadas, lecturaOperativa, perfilDeContrato, perfilSugerido,
  type Medidas, type Observacion, type Reglas,
} from "./tipologia";
import { componerObservacion255, contextoDeFila } from "./observacion255";
import { componerObservacionAmpliada } from "./observacionAmpliada";
import {
  clavesPosgrado, leerAprobacion, leerNomina, leerSemana, normalizarEstadoMaster, programaPrincipal,
  type FilaAprobacionWh, type FilaHorarioWh, type FilaNominaWh, type FilaPosgradoWh,
} from "./lectores";

export interface InsumosCorte {
  sede: "buc" | "cuc" | "val" | "bog";
  nomina: FilaNominaWh[];
  aprobacion: FilaAprobacionWh[] | null;
  horario: FilaHorarioWh[] | null;
  posgrado: FilaPosgradoWh[] | null;
}

export type Sugerencia = "mantener" | "cambiar" | "ajustar" | "sin_regla";

export interface Comparacion {
  perfil: string;
  nombre: string;
  incumplimientos: number;
  actual: boolean;
}

export interface RangoDesglose {
  campo: string;
  nombre: string;
  horas: number;
  min: number | null;
  max: number | null;
}

/** Una fila de `ct_resumen` (lo que lee el programa). */
export interface FilaResumenCorte {
  seudonimo: string;
  programa: string;
  contrato: string;
  perfil: string;
  escalafon: string;
  duracion: string;
  veredicto: string;
  horas_esperadas: number | null;
  horas_total: number;
  horas_docencia: number;
  horas_investigacion: number;
  horas_extension: number;
  horas_administracion: number;
  horas_bienestar: number;
  horas_ensenanza: number;
  horas_derivadas: number;
  horas_inv_ext: number;
  horas_gestion: number;
  horas_capacitacion: number;
  horas_comite: number;
  horas_preparacion: number;
  horas_pregrado: number;
  horas_posgrado: number;
  actividades: number;
  estado_master: string;
  preaprobacion: string;
  fuente_nomina: string;
  lectura_operativa: string;
  perfil_sugerido: string | null;
  sugerencia: Sugerencia;
  consideracion_aprobacion: boolean;
  incumplimientos: number;
  preventivas: number;
  causas: string[];
  comparacion: Comparacion[];
  desglose: RangoDesglose[];
  semana: number[][] | null;
  carga: { c: string; h: number; t: string }[];
}

export interface FilaObservacionCorte {
  seudonimo: string;
  orden: number;
  causa: string;
  categoria: string;
  tipo: string;
  texto: string;
  resumen: string;
}

export interface FilaGrupoCorte {
  seudonimo: string;
  codigo: string;
  nombre: string;
  grupo: string;
  capacidad: number;
  departamento: string;
  afectacion: string;
}

/** Lo que solo ve el administrador del módulo. */
export interface FilaMasterCorte {
  seudonimo: string;
  observacion_255: string;
  observacion_ampliada: string;
}

export interface ResultadoCorte {
  resumenes: FilaResumenCorte[];
  observaciones: FilaObservacionCorte[];
  grupos: FilaGrupoCorte[];
  master: FilaMasterCorte[];
  avisos: string[];
  reglas: Reglas;
}

const CAMPUS = { buc: "BUC", cuc: "CUC", val: "VAL", bog: "BOG" } as const;

/** Los rubros de la tipología con el rango que permite el perfil, para el desglose de la ficha. */
export function rangosDesglose(perfil: string, m: Medidas, reglas: Reglas = REGLAS_BASE): RangoDesglose[] {
  const r = reglas[perfil];
  if (!r || !["PLE-TC", "PLE-MT", "PMI-TC", "PMI-MT", "PIE-TC", "PLI-TC"].includes(perfil)) return [];
  const techo = Math.ceil(m.ensDirecta * 0.35 - 1e-9);
  const tope = perfil === "PLE-TC" || perfil === "PLE-MT" || perfil === "PLI-TC" ? Math.min(r.prepTope ?? Infinity, techo) : techo;
  const docMin = perfil === "PLI-TC" ? (r.docPosgradoMin ?? 0) + (r.docPregradoMin ?? 0) : (r.docMin ?? null);
  const docMax = perfil === "PLI-TC" ? (r.docPosgradoMaxRef ?? null) : (r.docMaxRef ?? null);
  return [
    { campo: "horas_ensenanza", nombre: "Enseñanza directa", horas: m.ensDirecta, min: docMin, max: docMax },
    { campo: "horas_derivadas", nombre: "Derivadas de la enseñanza", horas: m.derivadas, min: null, max: Number.isFinite(tope) ? tope : null },
    { campo: "horas_inv_ext", nombre: "Investigación y/o extensión", horas: m.invExt, min: r.ieMin ?? null, max: r.ieMaxRef ?? null },
    { campo: "horas_gestion", nombre: "Gestión académica", horas: m.gestionSinComite, min: r.gestionSug ?? null, max: r.gestionMax ?? null },
    { campo: "horas_capacitacion", nombre: "Capacitación", horas: perfil === "PLI-TC" ? m.capacitacionCFI : m.capacitacion, min: null, max: r.capacitacionMax ?? null },
    { campo: "horas_comite", nombre: "Comité de programa", horas: m.comite, min: null, max: r.comiteMax ?? null },
  ];
}

/** Con qué perfiles de las mismas horas de contrato encaja la distribución de este profesor. */
function compararPerfiles(m: Medidas, perfil: string, reglas: Reglas): Comparacion[] {
  const horas = horasContratoEsperadas(perfil);
  if (horas === null || !PERFILES_TIPOLOGIA.includes(perfil)) return [];
  return PERFILES_TIPOLOGIA.filter((c) => horasContratoEsperadas(c) === horas).map((c) => ({
    perfil: c,
    nombre: reglas[c]?.nombre ?? c,
    incumplimientos: evaluarTipologia(m, c, reglas).observaciones.filter((o) => o.tipo === TIPO.INCUMPLIMIENTO).length,
    actual: c === perfil,
  }));
}

/**
 * Corre el motor sobre todos los profesores de una sede.
 * Igual que en Roomy, ninguna fuente que falte detiene el corte: la aprobación de Master ausente deja el estado en
 * «sin dato» y el horario ausente deja la semana vacía; lo que no se pudo cruzar se dice en `avisos`.
 */
export function calcularCorte(insumos: InsumosCorte, reglas: Reglas = REGLAS_BASE): ResultadoCorte {
  const campus = CAMPUS[insumos.sede];
  const avisos: string[] = [];
  const posgrado = clavesPosgrado(insumos.posgrado);
  const profesores = leerNomina(insumos.nomina, posgrado);
  const master = leerAprobacion(insumos.aprobacion);
  const semanas = leerSemana(insumos.horario);

  if (profesores.length === 0) avisos.push("La nómina no trajo profesores con actividades.");
  if (!insumos.aprobacion?.length) avisos.push("No hay estado de aprobación de Master (ms_aprob): todos los profesores quedan «sin dato en Master».");
  if (!insumos.horario?.length) avisos.push("No hay horarios (ms_hordep): la distribución semanal queda vacía.");
  if (!posgrado) avisos.push("No hay «Matriculados por grupo (posgrado)» (ms_posg): el nivel de cada actividad se deduce del nombre del departamento o carrera.");

  // Hay posgrado en la nómina: el Warehouse la entrega completa, así que «sin horas de posgrado» ya no es «falta la fuente».
  const posgradoCargado = profesores.some((p) => p.niveles.includes("Posgrado"));
  if (!posgradoCargado) avisos.push("Ninguna actividad se reconoció como de posgrado: los profesores PLI-TC quedan «pendiente de fuente».");

  // Un curso cuyos grupos están todos vacíos sobra entero de la programación; un grupo suelto vacío es otra conversación.
  const cursos = new Map<string, { total: number; cero: number }>();
  for (const p of profesores) {
    for (const a of p.actividades) {
      if (!a.grupo) continue;
      const c = cursos.get(a.codigo) ?? { total: 0, cero: 0 };
      c.total += 1;
      if (a.matriculados === 0) c.cero += 1;
      cursos.set(a.codigo, c);
    }
  }
  const afectacionDe = (codigo: string) => {
    const c = cursos.get(codigo);
    return c && c.cero === c.total ? "Curso completamente sin matrícula" : "Grupos con cero matriculados";
  };

  const resumenes: FilaResumenCorte[] = [];
  const observaciones: FilaObservacionCorte[] = [];
  const grupos: FilaGrupoCorte[] = [];
  const maestros: FilaMasterCorte[] = [];

  for (const p of profesores) {
    const perfil = perfilDeContrato(p.contrato);
    const medidas = calcularMedidas(p.actividades, { campus, posgradoCargado });
    const { observaciones: reglasRotas, veredicto } = evaluarTipologia(medidas, perfil, reglas);
    const sugerido = veredicto === "No cumple" ? perfilSugerido(medidas, perfil, reglas) : null;
    const consideracion = consideracionDeAprobacion({ medidas, perfil, observaciones: reglasRotas, sugerido, reglas });

    // El perfil sugerido y la consideración de aprobación no son reglas rotas, pero sí parte de lo que hay que decir.
    const obs: Observacion[] = [...reglasRotas];
    if (sugerido) {
      obs.push({
        causa: "PERFIL_SUGERIDO",
        categoria: CAUSAS.PERFIL_SUGERIDO.categoria,
        tipo: TIPO.RECOMENDACION,
        texto: `El profesor se ajusta mejor a otro perfil. Recomendación: actualizar la tipología a ${sugerido}${reglas[sugerido]?.nombre ? ` (${reglas[sugerido].nombre})` : ""}; con ese perfil su distribución actual cumple sin mover una hora.`,
        resumen: `Encaja en ${sugerido} sin mover horas`,
      });
    }
    if (consideracion) obs.push(consideracion);

    const estadoDeNomina = normalizarEstadoMaster(""); // la nómina nueva no trae ESTADO: lo da ms_aprob
    const maestro = master.get(p.seudonimo);
    const estadoMaster = estadoDeNomina !== "SIN_DATO_MASTER" ? estadoDeNomina : (maestro?.estado ?? "SIN_DATO_MASTER");
    const preaprobacion = estadoMaster === "PREAPROBADA" ? (maestro?.preaprobacion && maestro.preaprobacion !== "SIN_DATO_MASTER" ? maestro.preaprobacion : "AUTOMATICA") : "SIN_DATO_MASTER";
    const fuenteNomina = p.niveles.includes("Pregrado") ? (p.niveles.includes("Posgrado") ? "AMBAS" : "PREGRADO") : p.niveles.includes("Posgrado") ? "POSGRADO" : "";

    const comparacion = compararPerfiles(medidas, perfil, reglas);
    const cercano = comparacion.filter((c) => !c.actual).sort((a, b) => a.incumplimientos - b.incumplimientos)[0];
    const actual = comparacion.find((c) => c.actual);
    const sugerencia: Sugerencia = veredicto === "Cumple" ? "mantener" : veredicto === "No cumple" ? (sugerido ? "cambiar" : "ajustar") : "sin_regla";
    // «Ajustar hacia X»: ningún perfil cumple del todo, pero X deja menos reglas rotas que el actual.
    const perfilSugeridoFinal = sugerido ?? (sugerencia === "ajustar" && cercano && actual && cercano.incumplimientos < actual.incumplimientos ? cercano.perfil : null);

    const programa = programaPrincipal(p.actividades);
    const resumen: FilaResumenCorte = {
      seudonimo: p.seudonimo,
      programa,
      contrato: p.contrato,
      perfil,
      escalafon: p.escalafon,
      duracion: p.duracion,
      veredicto,
      horas_esperadas: horasContratoEsperadas(perfil),
      horas_total: medidas.total,
      horas_docencia: medidas.docencia,
      horas_investigacion: medidas.investigacion,
      horas_extension: medidas.extension,
      horas_administracion: medidas.administracion,
      horas_bienestar: medidas.bienestarMaster,
      horas_ensenanza: medidas.ensDirecta,
      horas_derivadas: medidas.derivadas,
      horas_inv_ext: medidas.invExt,
      horas_gestion: medidas.gestion,
      horas_capacitacion: medidas.capacitacion,
      horas_comite: medidas.comite,
      horas_preparacion: medidas.preparacion,
      horas_pregrado: medidas.docPregrado,
      horas_posgrado: medidas.docPosgrado,
      actividades: medidas.actividades,
      estado_master: estadoMaster,
      preaprobacion,
      fuente_nomina: fuenteNomina,
      lectura_operativa: lecturaOperativa(veredicto, estadoMaster, preaprobacion, { consideracion: Boolean(consideracion) }),
      perfil_sugerido: perfilSugeridoFinal,
      sugerencia,
      consideracion_aprobacion: Boolean(consideracion),
      incumplimientos: obs.filter((o) => o.tipo === TIPO.INCUMPLIMIENTO).length,
      preventivas: obs.filter((o) => o.tipo === TIPO.PREVENTIVA).length,
      causas: [...new Set(obs.filter((o) => [TIPO.INCUMPLIMIENTO, TIPO.PREVENTIVA, TIPO.CODIFICACION, TIPO.FUENTE].includes(o.tipo)).map((o) => o.causa))],
      comparacion,
      desglose: rangosDesglose(perfil, medidas, reglas),
      semana: semanas.get(p.seudonimo) ?? null,
      carga: p.actividades.map((a) => ({ c: a.codigo, h: Number(a.horas) || 0, t: a.tipo ?? "" })),
    };
    resumenes.push(resumen);

    // Las dos observaciones para Master se arman con la fila ya completa, como en Roomy. Van aparte (ct_observacion_master).
    maestros.push({
      seudonimo: p.seudonimo,
      observacion_255: componerObservacion255({ ...contextoDeFila(resumen), observaciones: obs }).texto,
      observacion_ampliada: componerObservacionAmpliada({
        fila: { ...resumen, seudonimo: p.seudonimo, sede: campus, estado_master_texto: "" },
        observaciones: obs,
      }),
    });

    obs.forEach((o, i) => {
      observaciones.push({ seudonimo: p.seudonimo, orden: i, causa: o.causa, categoria: o.categoria, tipo: o.tipo, texto: o.texto, resumen: o.resumen });
    });

    for (const g of medidas.gruposSinMatricula) {
      grupos.push({
        seudonimo: p.seudonimo,
        codigo: g.codigo,
        nombre: g.nombre ?? "",
        grupo: g.grupo ?? "",
        capacidad: g.capacidad ?? 0,
        departamento: g.departamento ?? "",
        afectacion: afectacionDe(g.codigo),
      });
    }
  }

  return { resumenes, observaciones, grupos, master: maestros, avisos, reglas };
}

export type { Medidas };
