/* =============================================================================
   Plan de Trabajo propio de la unidad · lógica pura.

   El plan puede venir de tres lados: la sincronización con la API del plan
   (solo lectura), un archivo de seguimiento (JSON o PDF, exportado por la
   aplicación del Plan de Trabajo) o lo que la unidad escribe a mano. Los dos
   últimos se guardan dentro de la sección «Objetivos y metas» como `plan`
   (PlanLocal) y, si existen, mandan sobre la sincronización.

   Nada aquí lanza: un archivo malo devuelve `{ error }` con un mensaje claro.
   ========================================================================== */

import type { PlanAccion, PlanActividad, RespuestaPlan } from "./plan-decanatura";

export type OrigenPlan = "json" | "pdf" | "manual" | "api";

export interface PlanLocal {
  origen: OrigenPlan;
  archivo?: string;
  importado_en: string;
  decano: string | null;
  acciones: PlanAccion[];
  actividades: PlanActividad[];
}

export type ResultadoLectura = { plan: PlanLocal; avisos: string[] } | { error: string };

const ESTADOS = ["Completado", "En proceso", "Pendiente"] as const;
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const textoONulo = (v: unknown): string | null => texto(v) || null;
const numeroONulo = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(texto(v).replace("%", ""));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
};
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estadoValido = (v: string): string | null => ESTADOS.find((e) => e.toLowerCase() === v.trim().toLowerCase()) ?? null;

/** Mayúsculas del PDF a oración: «GESTIÓN DE CALIDAD» → «Gestión de calidad». */
const oracion = (s: string) => {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** La nota más reciente que dice algo (texto, enlace o avance); si ninguna, la última. */
function notaVigente(notas: unknown): Record<string, unknown> | null {
  const lista = Array.isArray(notas) ? notas.filter(esObjeto) : [];
  if (!lista.length) return null;
  const ordenadas = [...lista].sort((a, b) => texto(a.fecha).localeCompare(texto(b.fecha)));
  const conContenido = ordenadas.filter((n) => texto(n.texto) || texto(n.link) || (numeroONulo(n.avance) ?? 0) > 0);
  return (conContenido.length ? conContenido : ordenadas).at(-1) ?? null;
}

/* ---------- JSON de seguimiento ------------------------------------------------ */

export function leerPlanJson(contenido: string, archivo = ""): ResultadoLectura {
  let bruto: unknown;
  try {
    bruto = JSON.parse(contenido);
  } catch {
    return { error: "El archivo no es un JSON válido." };
  }
  if (!esObjeto(bruto) || !Array.isArray(bruto.acciones)) return { error: "El JSON no trae la lista «acciones» del Plan de Trabajo." };

  const facultad = esObjeto(bruto.facultad) ? texto(bruto.facultad.codigo) : texto(bruto.facultad);
  const avisos: string[] = [];
  const acciones: PlanAccion[] = [];
  const actividades: PlanActividad[] = [];

  for (const crudo of bruto.acciones) {
    if (!esObjeto(crudo) || crudo.activa === false) continue;
    const id = texto(crudo.uid) || texto(crudo.id);
    const nombre = texto(crudo.accion) || texto(crudo.meta);
    if (!id || !nombre) {
      avisos.push("Se omitió una acción sin identificador o sin nombre.");
      continue;
    }
    const nota = notaVigente(crudo.notas);
    const estadoInicial = estadoValido(texto(crudo.estadoInicial));
    const estado = estadoValido(texto(nota?.estado)) ?? estadoInicial;
    const avanceNota = numeroONulo(nota?.avance);
    const avance = avanceNota !== null && (avanceNota > 0 || estado !== "Completado") ? avanceNota : estado === "Completado" ? 100 : avanceNota;
    const acts = (Array.isArray(crudo.actividades) ? crudo.actividades : []).filter(esObjeto).filter((a) => a.activa !== false);

    acciones.push({
      facultad,
      id,
      dimension: texto(crudo.dimension) || "d0",
      dimension_nombre: texto(crudo.dimensionNombre) || "Sin dimensión",
      accion: nombre,
      pilar: textoONulo(crudo.pilar),
      responsable: textoONulo(crudo.responsable),
      fecha_limite: textoONulo(crudo.fechaLimite),
      recursos: textoONulo(crudo.recursos),
      meta: textoONulo(crudo.meta),
      estado_inicial: estadoInicial,
      presupuesto_ordinario: crudo.presupuestoOrdinario === true,
      presupuesto_mejoramiento: crudo.presupuestoMejoramiento === true,
      n_actividades: acts.length,
      corte: textoONulo(nota?.fecha),
      avance,
      estado,
      notas: textoONulo(nota?.texto),
      link_evidencia_accion: textoONulo(nota?.link),
      veredicto_accion: null,
    });

    for (const a of acts) {
      const nA = notaVigente(a.notas);
      actividades.push({
        facultad,
        accion_id: id,
        id: texto(a.uid) || texto(a.id) || `${id}_act_${actividades.length + 1}`,
        descripcion: texto(a.descripcion),
        responsable: textoONulo(a.responsable),
        fecha: textoONulo(a.fecha),
        corte: textoONulo(nA?.fecha),
        estado: estadoValido(texto(nA?.estado)) ?? "Pendiente",
        link_evidencia: textoONulo(nA?.link),
        veredicto: null,
        comentario_auditor: null,
      });
    }
  }

  if (!acciones.length) return { error: "El JSON no trae ninguna acción activa." };
  return {
    plan: { origen: "json", archivo, importado_en: new Date().toISOString(), decano: textoONulo(bruto.decano), acciones, actividades },
    avisos,
  };
}

/* ---------- PDF de seguimiento -------------------------------------------------- */

const RUIDO = [/^Seguimiento Plan de Trabajo Anual/i, /^Planeación Institucional - UDES$/i, /^Pag\.\s*\d+\s*\/\s*\d+/i, /^REPORTE DE SEGUIMIENTO/i, /^RESUMEN DE AVANCE/i];

/**
 * Lee las líneas de texto del PDF «Seguimiento Plan de Trabajo Anual» (una cadena por renglón).
 * El PDF corta los responsables largos; el JSON es la fuente completa cuando se tiene.
 */
export function leerPlanPdf(lineas: string[], archivo = ""): ResultadoLectura {
  const limpias = lineas.map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !RUIDO.some((r) => r.test(l)));
  if (!limpias.some((l) => /^Acci[oó]n\s+\d+/i.test(l))) return { error: "No se reconocieron acciones en el PDF. ¿Es el «Reporte de seguimiento del Plan de Trabajo»? Si es una imagen escaneada, use el JSON." };

  let decano: string | null = null;
  let facultad = "";
  let dim = { id: "d0", nombre: "Sin dimensión" };
  const contadorDim = new Map<string, number>();
  const acciones: PlanAccion[] = [];
  const actividades: PlanActividad[] = [];
  const avisos: string[] = [];

  type Modo = "ninguno" | "titulo" | "meta" | "act" | "estadoAct" | "notas";
  let modo: Modo = "ninguno";
  let a: PlanAccion | null = null;
  let act: PlanActividad | null = null;
  let nota: { fecha: string; estado: string; avance: number | null; texto: string } | null = null;

  const cerrarNota = () => {
    if (a && nota) {
      a.corte = nota.fecha;
      a.estado = estadoValido(nota.estado) ?? a.estado;
      a.notas = nota.texto.trim() || null;
      if (nota.avance !== null && a.avance === null) a.avance = nota.avance;
    }
    nota = null;
  };

  for (const l of limpias) {
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^Facultad:\s*(.+)$/i))) {
      facultad = m[1].trim();
      continue;
    }
    if ((m = l.match(/^Decano\(a\):\s*(.+)$/i))) {
      decano = m[1].trim();
      continue;
    }
    if ((m = l.match(/^DIM\.?\s*(\d+)\s*:\s*(.+)$/i))) {
      cerrarNota();
      dim = { id: `d${m[1]}`, nombre: oracion(m[2]) };
      modo = "ninguno";
      continue;
    }
    if ((m = l.match(/^Acci[oó]n\s+(\d+)\s*(.*)$/i))) {
      cerrarNota();
      const n = (contadorDim.get(dim.id) ?? 0) + 1;
      contadorDim.set(dim.id, n);
      const estado = estadoValido(m[2]);
      a = {
        facultad,
        id: `${dim.id}_${n}`,
        dimension: dim.id,
        dimension_nombre: dim.nombre,
        accion: "",
        pilar: null,
        responsable: null,
        fecha_limite: null,
        recursos: null,
        meta: null,
        estado_inicial: estado,
        presupuesto_ordinario: false,
        presupuesto_mejoramiento: false,
        n_actividades: 0,
        corte: null,
        avance: null,
        estado,
        notas: null,
        link_evidencia_accion: null,
        veredicto_accion: null,
      };
      acciones.push(a);
      act = null;
      modo = "titulo";
      continue;
    }
    if (!a) continue;

    if ((m = l.match(/^Avance:\s*(\d+(?:[.,]\d+)?)\s*%\s*(?:Resp:\s*(.*))?$/i))) {
      a.avance = numeroONulo(m[1].replace(",", "."));
      if (m[2]) a.responsable = m[2].trim();
      modo = "ninguno";
      continue;
    }
    if ((m = l.match(/^Meta:\s*(.*)$/i)) && modo !== "notas") {
      a.meta = m[1].trim() || null;
      modo = "meta";
      continue;
    }
    if (/^ACTIVIDADES\b/i.test(l)) {
      modo = "act";
      act = null;
      continue;
    }
    if (/^Notas de la acci[oó]n/i.test(l)) {
      cerrarNota();
      modo = "notas";
      continue;
    }
    if ((m = l.match(/^Act\.\s*(\d+)\s*:\s*(.*)$/i))) {
      a.n_actividades += 1;
      act = {
        facultad,
        accion_id: a.id,
        id: `${a.id}_act_${m[1]}`,
        descripcion: m[2].trim(),
        responsable: null,
        fecha: null,
        corte: null,
        estado: "Pendiente",
        link_evidencia: null,
        veredicto: null,
        comentario_auditor: null,
      };
      actividades.push(act);
      modo = "act";
      continue;
    }
    if ((m = l.match(/^Estado:\s*([^(]+?)\s*(?:\((\d+)\s*%\))?$/i)) && act) {
      act.estado = estadoValido(m[1]) ?? act.estado;
      modo = "estadoAct";
      continue;
    }
    if (/^Sin evidencia$/i.test(l)) continue;
    if ((m = l.match(/^(https?:\/\/\S+)$/i))) {
      if (act && modo !== "notas") act.link_evidencia = m[1];
      else a.link_evidencia_accion = m[1];
      continue;
    }
    if (modo === "notas") {
      const n = l.match(/^(\d{4}-\d{2}-\d{2})\s*-\s*([^()]+?)\s*\((\d+)\s*%\)(?:\s*-\s*Sem\.\s*\w+)?\s*(?:-\s*(.*))?$/);
      if (n) {
        cerrarNota();
        nota = { fecha: n[1], estado: n[2], avance: numeroONulo(n[3]), texto: n[4] ?? "" };
      } else if (nota) nota.texto += ` ${l}`;
      continue;
    }
    // Renglones que continúan un texto largo.
    if (modo === "titulo") a.accion = `${a.accion} ${l}`.trim();
    else if (modo === "meta") a.meta = `${a.meta ?? ""} ${l}`.trim();
    else if (modo === "act" && act) act.descripcion = `${act.descripcion} ${l}`.trim();
  }
  cerrarNota();

  const validas = acciones.filter((x) => x.accion);
  if (!validas.length) return { error: "No se pudo leer ninguna acción del PDF." };
  if (validas.length < acciones.length) avisos.push("Se omitieron acciones sin nombre.");
  avisos.push("El PDF no trae fechas límite, recursos ni todo el nombre de los responsables; revíselos o importe el JSON.");
  for (const x of validas) {
    // Sin la meta aparte, la acción es la meta (así lo hace el JSON).
    if (!x.meta) x.meta = null;
    if (x.estado === "Completado" && x.avance === null) x.avance = 100;
  }
  return { plan: { origen: "pdf", archivo, importado_en: new Date().toISOString(), decano, acciones: validas, actividades }, avisos };
}

/** Une los renglones de una página de pdf.js: los trozos con casi la misma altura forman una línea. */
export function lineasDePdf(paginas: { items: { text: string; x: number; y: number }[] }[]): string[] {
  const salida: string[] = [];
  for (const p of paginas) {
    const filas: { y: number; items: { text: string; x: number }[] }[] = [];
    for (const it of p.items) {
      if (!it.text.trim()) continue;
      const fila = filas.find((f) => Math.abs(f.y - it.y) <= 2);
      if (fila) fila.items.push(it);
      else filas.push({ y: it.y, items: [it] });
    }
    filas.sort((a, b) => b.y - a.y);
    for (const f of filas) salida.push(f.items.sort((a, b) => a.x - b.x).map((i) => i.text.trim()).join(" "));
  }
  return salida;
}

/* ---------- Edición manual y mezcla ---------------------------------------------- */

/** Lo que se ve y se usa: el plan propio si existe; si no, el de la sincronización. */
export function planVigente(api: RespuestaPlan | undefined, local: PlanLocal | undefined): { acciones: PlanAccion[]; actividades: PlanActividad[]; decano: string | null; origen: OrigenPlan; traido_en: string | null } | null {
  if (local) return { acciones: local.acciones, actividades: local.actividades, decano: local.decano, origen: local.origen, traido_en: local.importado_en };
  if (api) return { acciones: api.acciones, actividades: api.actividades, decano: api.decano, origen: "api", traido_en: api.traido_en };
  return null;
}

/** Copia la sincronización a un plan propio para poder corregirla a mano. */
export function desdeApi(api: RespuestaPlan): PlanLocal {
  return { origen: "api", importado_en: api.traido_en, decano: api.decano, acciones: api.acciones, actividades: api.actividades };
}

export function planVacio(): PlanLocal {
  return { origen: "manual", importado_en: new Date().toISOString(), decano: null, acciones: [], actividades: [] };
}

export function accionNueva(plan: PlanLocal, dimension: string, nombreDimension: string): PlanAccion {
  const n = plan.acciones.filter((a) => a.dimension === dimension).length + 1;
  let id = `${dimension}_${n}`;
  while (plan.acciones.some((a) => a.id === id)) id += "x";
  return {
    facultad: plan.acciones[0]?.facultad ?? "",
    id,
    dimension,
    dimension_nombre: nombreDimension,
    accion: "",
    pilar: null,
    responsable: null,
    fecha_limite: null,
    recursos: null,
    meta: null,
    estado_inicial: "Pendiente",
    presupuesto_ordinario: false,
    presupuesto_mejoramiento: false,
    n_actividades: 0,
    corte: null,
    avance: null,
    estado: "Pendiente",
    notas: null,
    link_evidencia_accion: null,
    veredicto_accion: null,
  };
}

export function actividadNueva(plan: PlanLocal, accionId: string): PlanActividad {
  const n = plan.actividades.filter((x) => x.accion_id === accionId).length + 1;
  return { facultad: plan.acciones[0]?.facultad ?? "", accion_id: accionId, id: `${accionId}_act_${n}_${Date.now().toString(36)}`, descripcion: "", responsable: null, fecha: null, corte: null, estado: "Pendiente", link_evidencia: null, veredicto: null, comentario_auditor: null };
}

/** Cambia una acción y mantiene al día su conteo de actividades. */
export function conAccion(plan: PlanLocal, id: string, cambios: Partial<PlanAccion>): PlanLocal {
  return { ...plan, origen: plan.origen === "api" ? "manual" : plan.origen, acciones: plan.acciones.map((a) => (a.id === id ? { ...a, ...cambios } : a)) };
}

export function sinAccion(plan: PlanLocal, id: string): PlanLocal {
  return { ...plan, acciones: plan.acciones.filter((a) => a.id !== id), actividades: plan.actividades.filter((x) => x.accion_id !== id) };
}

export function conActividad(plan: PlanLocal, id: string, cambios: Partial<PlanActividad>): PlanLocal {
  return { ...plan, actividades: plan.actividades.map((x) => (x.id === id ? { ...x, ...cambios } : x)) };
}

export function conActividadNueva(plan: PlanLocal, accionId: string): PlanLocal {
  const nueva = actividadNueva(plan, accionId);
  return { ...plan, actividades: [...plan.actividades, nueva], acciones: plan.acciones.map((a) => (a.id === accionId ? { ...a, n_actividades: a.n_actividades + 1 } : a)) };
}

export function sinActividad(plan: PlanLocal, id: string): PlanLocal {
  const quitada = plan.actividades.find((x) => x.id === id);
  return {
    ...plan,
    actividades: plan.actividades.filter((x) => x.id !== id),
    acciones: plan.acciones.map((a) => (quitada && a.id === quitada.accion_id ? { ...a, n_actividades: Math.max(0, a.n_actividades - 1) } : a)),
  };
}

export { ESTADOS as ESTADOS_PLAN };
