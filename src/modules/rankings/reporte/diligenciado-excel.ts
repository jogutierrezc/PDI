/* =============================================================================
   Excel de THE diligenciado · lee lo que Planeación ya escribió en el archivo
   (Value, Yes/No, Evidence1…n, Public y Comentarios de cada hoja SDGn) y lo
   convierte en un plan de respuestas para una oficina («Planeación
   Institucional» o la que se elija).

   Cómo se numera: igual que el catálogo (catalogo-excel.ts), del que se toma
   el id de cada fila por su hoja y su número de fila. Las opciones («4.2.1/2»)
   heredan del indicador padre: su cifra va a `valores["4.2.1/2"]` de la
   respuesta de 4.2.1; su sí/no suma al del padre (sí si alguna dice sí); sus
   evidencias y comentarios también van al padre.

   Evidencias: una URL https es un enlace (pública según «Public»); cualquier
   otro texto es una nota (clase «nota», 0152), que no cuenta como evidencia.

   El plan (`planificarImportacion`) es idempotente: compara con lo que ya hay
   y solo agrega evidencias que no estén (misma dirección o misma nota). No
   pisa respuestas aprobadas salvo que se pida. Puro: sin red ni React.
   ========================================================================== */

import type ExcelJS from "exceljs";
import { claveUrl } from "./analisis-evidencia";
import { leerCatalogo, numeroCelda, textoCelda } from "./catalogo-excel";
import { contarComentario, normalizarComentario } from "./comentario";
import { transicionPermitida } from "./estados";
import type { EstadoRespuesta, Indicador } from "./tipos";

export interface EvidenciaExcel {
  kind: "url" | "nota";
  /** La dirección (url) o el texto (nota). */
  valor: string;
  publica: boolean;
}

/** Lo diligenciado de un indicador (con sus opciones ya sumadas). */
export interface DatoIndicador {
  indicador: string;
  ods: number;
  valores: Record<string, number>;
  siNo: boolean | null;
  comentario: string;
  evidencias: EvidenciaExcel[];
  /** Dónde está en el Excel, para los avisos. */
  filas: string[];
}

export interface Problema {
  tipo: "valor" | "si_no" | "url" | "inexistente" | "comentario" | "sin_ref" | "aprobada" | "metrica";
  texto: string;
}

export interface DiligenciadoExcel {
  datos: DatoIndicador[];
  problemas: Problema[];
  /** Año de la edición que dice el archivo («Impact 2026», «Ratings 2027»), si lo dice. */
  anioArchivo: number | null;
  /** Año de los datos («información del año académico 2024»), si lo dice. */
  anioDatos: number | null;
  /** Celdas con algo diligenciado (para decir «el archivo viene vacío»). */
  celdas: number;
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

interface Columnas {
  fila: number;
  valor: number | null;
  siNo: number | null;
  evidencias: number[];
  publica: number | null;
  comentario: number | null;
}

function columnas(ws: ExcelJS.Worksheet): Columnas | null {
  for (let fila = 1; fila <= Math.min(5, ws.rowCount); fila++) {
    const h = new Map<number, string>();
    ws.getRow(fila).eachCell({ includeEmpty: false }, (c, col) => h.set(col, normal(textoCelda(c.value))));
    if (![...h.values()].includes("type")) continue;
    const buscar = (p: (t: string) => boolean) => [...h].find(([, t]) => p(t))?.[0] ?? null;
    return {
      fila,
      valor: buscar((t) => t.startsWith("value")),
      siNo: buscar((t) => t === "yes/no" || t.startsWith("yes/no")),
      evidencias: [...h].filter(([, t]) => /^evidence\s*\d*$/.test(t)).map(([c]) => c).sort((a, b) => a - b),
      publica: buscar((t) => t.startsWith("public")),
      comentario: buscar((t) => t.startsWith("comentario")),
    };
  }
  return null;
}

/** Sí/no de una celda: yes/sí/si/no. Nulo si está vacía; «invalido» si dice otra cosa. */
export function siNoDe(texto: string): boolean | null | "invalido" {
  const t = normal(texto).replace(/[.\s]+$/, "");
  if (!t) return null;
  if (t === "yes" || t === "si" || t === "true" || t === "1") return true;
  if (t === "no" || t === "false" || t === "0") return false;
  return "invalido";
}

/** Dirección de una celda: la del hipervínculo si lo tiene; si no, el texto. */
function enlaceDe(valor: unknown): string {
  if (valor && typeof valor === "object" && typeof (valor as { hyperlink?: unknown }).hyperlink === "string") {
    return String((valor as { hyperlink: string }).hyperlink).trim();
  }
  return textoCelda(valor);
}

/** Años que dice el archivo: el de la edición (nombre del archivo o títulos) y el de los datos. */
export function aniosDelArchivo(wb: ExcelJS.Workbook, nombreArchivo = ""): { anioArchivo: number | null; anioDatos: number | null } {
  const textos: string[] = [nombreArchivo];
  for (const ws of wb.worksheets.slice(0, 40)) {
    for (let f = 1; f <= Math.min(3, ws.rowCount); f++) ws.getRow(f).eachCell({ includeEmpty: false }, (c) => void textos.push(textoCelda(c.value)));
  }
  const todo = textos.join(" | ");
  const edicion = /(?:impact|ratings?|rankings?)\D{0,12}(20\d{2})/i.exec(todo)?.[1];
  const datos = /a[nñ]o acad[eé]mico\s+(20\d{2})/i.exec(todo)?.[1] ?? /data (?:year|from)\D{0,6}(20\d{2})/i.exec(todo)?.[1];
  return { anioArchivo: edicion ? Number(edicion) : null, anioDatos: datos ? Number(datos) : null };
}

/** Lee lo diligenciado del libro ya cargado. Pura. */
export function leerDiligenciado(wb: ExcelJS.Workbook, nombreArchivo = ""): DiligenciadoExcel {
  const catalogo = leerCatalogo(wb);
  const porCelda = new Map(catalogo.filas.map((f) => [`${f.hoja}#${f.fila}`, f]));
  const datos = new Map<string, DatoIndicador>();
  const problemas: Problema[] = [];
  const siNoOpciones = new Map<string, boolean[]>();
  let celdas = 0;

  for (const ws of wb.worksheets) {
    if (!/^SDG\s*\d{1,2}$/i.test(ws.name)) continue;
    const cols = columnas(ws);
    if (!cols) continue;
    const celda = (row: ExcelJS.Row, col: number | null) => (col === null ? "" : textoCelda(row.getCell(col).value));
    ws.eachRow((row, fila) => {
      if (fila <= cols.fila) return;
      const crudoValor = cols.valor === null ? null : row.getCell(cols.valor).value;
      const tValor = textoCelda(crudoValor);
      const tSiNo = celda(row, cols.siNo);
      const evs = cols.evidencias.map((c) => enlaceDe(row.getCell(c).value)).filter((t) => t !== "");
      const tPublica = celda(row, cols.publica);
      const tCom = celda(row, cols.comentario);
      if (!tValor && !tSiNo && evs.length === 0 && !tCom) return;
      celdas += [tValor, tSiNo, tCom].filter(Boolean).length + evs.length;
      const donde = `${ws.name} fila ${fila}`;

      const f = porCelda.get(`${ws.name}#${fila}`);
      if (!f) {
        problemas.push({ tipo: "sin_ref", texto: `${donde}: tiene datos pero no trae número de indicador; no se puede importar.` });
        return;
      }
      if (f.nivel === "metric") {
        problemas.push({ tipo: "metrica", texto: `${donde}: ${f.id} es una métrica, no un indicador; lo escrito ahí se omite.` });
        return;
      }
      const padre = f.nivel === "option" ? (f.padre ?? f.id) : f.id;
      let d = datos.get(padre);
      if (!d) {
        d = { indicador: padre, ods: f.ods, valores: {}, siNo: null, comentario: "", evidencias: [], filas: [] };
        datos.set(padre, d);
      }
      d.filas.push(donde);

      if (tValor) {
        const n = numeroCelda(crudoValor);
        if (n === null) problemas.push({ tipo: "valor", texto: `${donde} (${f.id}): el valor «${tValor}» no es un número; se omite.` });
        else d.valores[f.id] = n;
      }
      const sn = siNoDe(tSiNo);
      if (sn === "invalido") problemas.push({ tipo: "si_no", texto: `${donde} (${f.id}): «${tSiNo}» no es Yes ni No; se omite.` });
      else if (sn !== null) {
        if (f.nivel === "indicator") d.siNo = sn;
        else siNoOpciones.set(padre, [...(siNoOpciones.get(padre) ?? []), sn]);
      }
      const pub = siNoDe(tPublica) === true;
      for (const e of evs) {
        if (/^https:\/\/[^\s.]+\.\S+$/i.test(e)) d.evidencias.push({ kind: "url", valor: e, publica: pub });
        else {
          if (/^(https?:|www\.)/i.test(e)) problemas.push({ tipo: "url", texto: `${donde} (${f.id}): «${e}» no es una dirección https válida; queda como nota.` });
          d.evidencias.push({ kind: "nota", valor: e.slice(0, 1000), publica: false });
        }
      }
      if (tCom) {
        const prefijo = f.nivel === "option" && f.texto_en ? `${f.texto_es || f.texto_en}: ` : "";
        d.comentario = d.comentario ? `${d.comentario}\n${prefijo}${tCom}` : `${prefijo}${tCom}`;
      }
    });
  }

  // El sí/no de las opciones suma al padre si el padre no dijo nada: sí si alguna dice sí.
  for (const [padre, lista] of siNoOpciones) {
    const d = datos.get(padre);
    if (d && d.siNo === null) d.siNo = lista.some(Boolean);
  }
  // La hoja de control completa después: lo de las hojas SDG (y sus opciones) manda.
  celdas += leerControl(wb, datos, problemas);
  for (const d of datos.values()) {
    d.comentario = normalizarComentario(d.comentario);
    const c = contarComentario(d.comentario);
    if (c.estado === "over") {
      problemas.push({ tipo: "comentario", texto: `${d.indicador}: el comentario tiene ${c.caracteres} caracteres (máximo ${c.limite}); no se importa, recórtelo en el Excel.` });
      d.comentario = "";
    }
  }

  // Un indicador al que solo le quedaron celdas inválidas no se importa (ya tiene su aviso).
  const conAlgo = [...datos.values()].filter((d) => Object.keys(d.valores).length || d.siNo !== null || d.comentario || d.evidencias.length);
  return { datos: conAlgo, problemas, celdas, ...aniosDelArchivo(wb, nombreArchivo) };
}

/** Evidencia de una celda: URL https → enlace; otro texto → nota (con aviso si parecía URL). */
function evidenciaDe(e: string, publica: boolean, donde: string, problemas: Problema[]): EvidenciaExcel {
  if (/^https:\/\/[^\s.]+\.\S+$/i.test(e)) return { kind: "url", valor: e, publica };
  if (/^(https?:|www\.)/i.test(e)) problemas.push({ tipo: "url", texto: `${donde}: «${e}» no es una dirección https válida; queda como nota.` });
  return { kind: "nota", valor: e.slice(0, 1000), publica: false };
}

/**
 * Hoja «CONTROL UDES …» (vista consolidada: ODS, Indicador, …, Dato / valor,
 * Respuesta, Evidencia / URL, Pública, Comentarios). Completa lo que las hojas
 * SDG no trajeron; si ambas dicen algo, gana la hoja SDG. Devuelve cuántas
 * celdas diligenciadas leyó.
 */
function leerControl(wb: ExcelJS.Workbook, datos: Map<string, DatoIndicador>, problemas: Problema[]): number {
  const ws = wb.worksheets.find((w) => /^control/i.test(w.name.trim()));
  if (!ws) return 0;
  let cab = 0;
  const col: Record<"ind" | "valor" | "resp" | "ev" | "pub" | "com", number | null> = { ind: null, valor: null, resp: null, ev: null, pub: null, com: null };
  for (let f = 1; f <= Math.min(15, ws.rowCount) && !cab; f++) {
    const h = new Map<number, string>();
    ws.getRow(f).eachCell({ includeEmpty: false }, (c, n) => h.set(n, normal(textoCelda(c.value))));
    const buscar = (p: (t: string) => boolean) => [...h].find(([, t]) => p(t))?.[0] ?? null;
    col.ind = buscar((t) => t === "indicador");
    col.valor = buscar((t) => t.startsWith("dato"));
    if (col.ind === null || col.valor === null) continue;
    cab = f;
    col.resp = buscar((t) => t.startsWith("respuesta"));
    col.ev = buscar((t) => t.startsWith("evidencia"));
    col.pub = buscar((t) => t.startsWith("publica"));
    col.com = buscar((t) => t.startsWith("comentario"));
  }
  if (!cab) return 0;
  const celda = (row: ExcelJS.Row, c: number | null) => (c === null ? "" : textoCelda(row.getCell(c).value));
  let celdas = 0;
  for (let f = cab + 1; f <= ws.rowCount; f++) {
    const row = ws.getRow(f);
    const id = celda(row, col.ind).replace(/\s+/g, "");
    if (!/^\d{1,2}\.\d{1,2}\.\d{1,2}$/.test(id)) continue;
    const crudo = col.valor === null ? null : row.getCell(col.valor).value;
    const tValor = textoCelda(crudo);
    const tResp = celda(row, col.resp);
    const tEv = col.ev === null ? "" : enlaceDe(row.getCell(col.ev).value);
    const tCom = celda(row, col.com);
    if (!tValor && !tResp && !tEv && !tCom) continue;
    celdas += [tValor, tResp, tEv, tCom].filter(Boolean).length;
    const donde = `${ws.name} fila ${f} (${id})`;
    let d = datos.get(id);
    if (!d) {
      d = { indicador: id, ods: Number(id.split(".")[0]), valores: {}, siNo: null, comentario: "", evidencias: [], filas: [] };
      datos.set(id, d);
    }
    d.filas.push(`${ws.name} fila ${f}`);
    if (tValor && Object.keys(d.valores).length === 0) {
      const n = numeroCelda(crudo);
      if (n === null) problemas.push({ tipo: "valor", texto: `${donde}: el valor «${tValor}» no es un número; se omite.` });
      else d.valores[id] = n;
    }
    const sn = siNoDe(tResp);
    if (sn === "invalido") problemas.push({ tipo: "si_no", texto: `${donde}: «${tResp}» no es Sí ni No; se omite.` });
    else if (sn !== null && d.siNo === null) d.siNo = sn;
    if (tEv) {
      const ya = new Set(d.evidencias.map((e) => normal(e.valor)));
      for (const parte of tEv.split(/\s*[\n;]\s*|\s+(?=https:\/\/)/).filter(Boolean)) {
        if (!ya.has(normal(parte))) d.evidencias.push(evidenciaDe(parte, siNoDe(celda(row, col.pub)) === true, donde, problemas));
      }
    }
    if (tCom && !d.comentario) d.comentario = tCom;
  }
  return celdas;
}

/* ---------- Plan de importación -------------------------------------------- */

/** Respuesta ya guardada de la oficina destino (lo que se necesita para planear). */
export interface RespuestaExistente {
  id: string;
  indicador: string;
  estado: EstadoRespuesta;
  valores: Record<string, number | null>;
  si_no: boolean | null;
  comentario_es: string;
}

export interface EvidenciaExistente {
  response_id: string;
  kind: string;
  url: string | null;
  nombre: string;
}

export type Modo = "borrador" | "aprobado";

export interface AccionImportacion {
  indicador: string;
  /** Nula si hay que crear la respuesta. */
  respuestaId: string | null;
  estadoActual: EstadoRespuesta | null;
  valores: Record<string, number | null>;
  siNo: boolean | null;
  comentario: string;
  /** Estados por los que pasa, en orden (vacío si se queda donde está). */
  pasos: EstadoRespuesta[];
  evidencias: EvidenciaExcel[];
  /** Evidencias que ya estaban y no se repiten. */
  repetidas: number;
  pisaAprobada: boolean;
}

export interface PlanImportacion {
  acciones: AccionImportacion[];
  /** Aprobadas que no se tocan porque no se confirmó pisarlas. */
  aprobadasProtegidas: string[];
  problemas: Problema[];
  conteo: { crear: number; actualizar: number; evidencias: number; repetidas: number; aprobadasPisadas: number };
}

/**
 * Camino más corto de estados que Planeación puede recorrer de `de` a `a`
 * (las mismas reglas de estados.ts y del disparador). Vacío si ya está.
 */
export function caminoEstados(de: EstadoRespuesta, a: EstadoRespuesta): EstadoRespuesta[] {
  if (de === a) return [];
  const todos: EstadoRespuesta[] = ["none", "draft", "sent", "back", "ok"];
  const previo = new Map<EstadoRespuesta, EstadoRespuesta>();
  const cola: EstadoRespuesta[] = [de];
  const vistos = new Set([de]);
  while (cola.length) {
    const x = cola.shift() as EstadoRespuesta;
    for (const y of todos) {
      if (vistos.has(y) || !transicionPermitida(x, y, "planeacion")) continue;
      vistos.add(y);
      previo.set(y, x);
      if (y === a) {
        const camino: EstadoRespuesta[] = [a];
        let z = x;
        while (z !== de) {
          camino.unshift(z);
          z = previo.get(z) as EstadoRespuesta;
        }
        return camino;
      }
      cola.push(y);
    }
  }
  return [];
}

const claveNota = (t: string) => normal(t);

/** Compara lo leído con lo guardado y decide qué hacer. Pura e idempotente. */
export function planificarImportacion(p: {
  leido: DiligenciadoExcel;
  catalogo: Pick<Indicador, "id" | "nivel">[];
  existentes: RespuestaExistente[];
  evidencias: EvidenciaExistente[];
  modo: Modo;
  pisarAprobadas: boolean;
}): PlanImportacion {
  const ids = new Set(p.catalogo.filter((i) => i.nivel !== "metric").map((i) => i.id));
  const problemas: Problema[] = [...p.leido.problemas];
  const acciones: AccionImportacion[] = [];
  const aprobadasProtegidas: string[] = [];
  const conteo = { crear: 0, actualizar: 0, evidencias: 0, repetidas: 0, aprobadasPisadas: 0 };
  const destino: EstadoRespuesta = p.modo === "aprobado" ? "ok" : "draft";

  for (const d of p.leido.datos) {
    if (!ids.has(d.indicador)) {
      problemas.push({ tipo: "inexistente", texto: `${d.indicador}: no está en el catálogo del ciclo; se omite (${d.filas[0]}).` });
      continue;
    }
    const valores: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(d.valores)) {
      if (ids.has(k)) valores[k] = v;
      else problemas.push({ tipo: "inexistente", texto: `${k}: ese campo no está en el catálogo del ciclo; su cifra se omite.` });
    }
    const previa = p.existentes.find((r) => r.indicador === d.indicador) ?? null;
    if (previa?.estado === "ok" && !p.pisarAprobadas) {
      aprobadasProtegidas.push(d.indicador);
      problemas.push({ tipo: "aprobada", texto: `${d.indicador}: ya está aprobada; no se toca sin su confirmación.` });
      continue;
    }
    const pisaAprobada = previa?.estado === "ok";
    // Una aprobada que se vuelve a cargar como aprobada no cambia de estado.
    const pasos = previa ? caminoEstados(previa.estado, destino) : destino === "ok" ? ["ok" as EstadoRespuesta] : ["draft" as EstadoRespuesta];

    const ya = p.evidencias.filter((e) => previa && e.response_id === previa.id);
    const urls = new Set(ya.filter((e) => e.kind === "url" && e.url).map((e) => claveUrl(e.url as string)));
    const notas = new Set(ya.filter((e) => e.kind === "nota").map((e) => claveNota(e.nombre)));
    const nuevas: EvidenciaExcel[] = [];
    let repetidas = 0;
    for (const e of d.evidencias) {
      const k = e.kind === "url" ? claveUrl(e.valor) : claveNota(e.valor);
      const conjunto = e.kind === "url" ? urls : notas;
      if (conjunto.has(k)) {
        repetidas++;
        continue;
      }
      conjunto.add(k);
      nuevas.push(e);
    }

    acciones.push({
      indicador: d.indicador,
      respuestaId: previa?.id ?? null,
      estadoActual: previa?.estado ?? null,
      // Lo del Excel completa lo que ya había; no borra cifras de campos que el Excel no trae.
      valores: { ...(previa?.valores ?? {}), ...valores },
      siNo: d.siNo ?? previa?.si_no ?? null,
      comentario: d.comentario || previa?.comentario_es || "",
      pasos,
      evidencias: nuevas,
      repetidas,
      pisaAprobada,
    });
    if (previa) conteo.actualizar++;
    else conteo.crear++;
    if (pisaAprobada) conteo.aprobadasPisadas++;
    conteo.evidencias += nuevas.length;
    conteo.repetidas += repetidas;
  }
  return { acciones, aprobadasProtegidas, problemas, conteo };
}
