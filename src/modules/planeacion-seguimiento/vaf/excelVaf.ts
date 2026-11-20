/* =============================================================================
   Planeación y Seguimiento · VAF · plantillas de Excel e importadores de la financiación por línea y de la ejecución
   presupuestal (todo o nada: con un error no se carga nada). `analizar…` son PUROS (reciben hojas ya leídas como texto).
   Mismo estilo que la plantilla de actividades: amarillo = obligatorio, azul claro = opcional, gris = ejemplo (no se importa).
   ========================================================================== */

import { downloadBlob } from "../../admin/traslado/transfer";
import { construirLibro, type HojaExcel, type TipoCelda } from "../../informes/ui/excel";
import { baseDeEncabezado, type Tipo } from "../columnas";
import type { HojaCruda, Problema } from "../importar";
import { leerFecha, leerNumero } from "../importar";
import { llano } from "../modelo";
import type { FilaFinanciacion, FilaMov } from "./contratoVaf";
import { ROTULO_FINANCIACION, ROTULO_MOV, TIPOS_MOV, validarFinanciacion, validarMovimiento, type EstadoFinanciacion, type TipoMov } from "./modeloVaf";

export type TipoCargaVaf = "financiacion" | "ejecucion";
export const MAX_FILAS_VAF = 2000;
export const MARCA_EJEMPLO_VAF = "EJEMPLO";
export const HOJA_INSTRUCCIONES_VAF = "Instrucciones";
export const HOJA_LISTAS_VAF = "Listas";
export const HOJA_CONTROL_VAF = "_Control";
const HOJA_DATOS: Record<TipoCargaVaf, string> = { financiacion: "Financiación", ejecucion: "Ejecución" };
const FORMATO: Record<TipoCargaVaf, string> = { financiacion: "pdi-plan-vaf-financiacion", ejecucion: "pdi-plan-vaf-ejecucion" };

interface Col {
  id: string;
  base: string;
  pista: string;
  ancho: number;
  tipo: Tipo;
}
const c = (id: string, base: string, pista: string, ancho: number, tipo: Tipo): Col => ({ id, base, pista, ancho, tipo });
export const COLUMNAS_VAF: Record<TipoCargaVaf, Col[]> = {
  financiacion: [
    c("linea", "N.º de la línea", "elija de la lista", 38, "obligatoria"),
    c("anio", "Año", "AAAA, dentro del plan", 10, "obligatoria"),
    c("monto", "Monto aprobado", "en pesos, solo el número", 22, "obligatoria"),
    c("estado", "Estado", "Aprobada, Ajustada, Rechazada o Sin evaluar; vacío es Aprobada", 18, "diligenciar"),
    c("fuente", "Fuente de financiación", "hasta 200 caracteres", 34, "diligenciar"),
    c("nota", "Nota", "obligatoria si es Ajustada o Rechazada", 44, "diligenciar"),
  ],
  ejecucion: [
    c("linea", "N.º de la línea", "elija de la lista", 38, "obligatoria"),
    c("anio", "Año", "AAAA, dentro del plan", 10, "obligatoria"),
    c("tipo", "Tipo", "Aprobado, Modificación, Comprometido, Ejecutado o Pagado", 18, "obligatoria"),
    c("monto", "Monto", "en pesos; negativo solo en una Modificación", 22, "obligatoria"),
    c("fecha", "Fecha", "AAAA-MM-DD; vacía es hoy; no futura", 16, "diligenciar"),
    c("fuente", "Fuente", "hasta 200 caracteres", 30, "diligenciar"),
    c("referencia", "Referencia", "RP, contrato u orden; hasta 100", 22, "diligenciar"),
    c("nota", "Nota", "hasta 1.000 caracteres", 40, "diligenciar"),
  ],
};
const titulo = (k: Col) => `${k.base} (${k.pista})`;

const ESTADOS_TXT: [string, EstadoFinanciacion][] = [["aprobada", "aprobada"], ["ajustada", "ajustada"], ["rechazada", "rechazada"], ["sin evaluar", "sin_evaluar"], ["sin_evaluar", "sin_evaluar"]];
const TIPOS_TXT: [string, TipoMov][] = [...TIPOS_MOV.map((t): [string, TipoMov] => [llano(ROTULO_MOV[t]), t]), ["modificacion", "modificacion"]];

export interface OpcionesVaf {
  planId?: string;
  planNombre: string;
  lineas: readonly { no: string; nombre: string }[];
  anioIni: number;
  anioFin: number;
  hoy: string;
  ahora?: Date;
  logo?: string;
}
const textoLinea = (l: { no: string; nombre: string }): string => `${l.no} · ${l.nombre.replace(/\s+/g, " ").trim().slice(0, 100)}`;

/* ---------- Plantilla ---------- */

export function hojasPlantillaVaf(tipo: TipoCargaVaf, op: OpcionesVaf): HojaExcel[] {
  const cols = COLUMNAS_VAF[tipo];
  const lineasTxt = op.lineas.map(textoLinea);
  const l1 = op.lineas[0];
  const ej = (n: number): (string | number | null)[] => (tipo === "financiacion"
    ? [MARCA_EJEMPLO_VAF, op.anioIni, n === 0 ? 1_250_000_000 : 480_000_000, n === 0 ? "Aprobada" : "Ajustada", "Presupuesto ordinario institucional", n === 0 ? null : "Ejemplo de un ajuste: se reduce por el techo del año. Esta fila no se importa."]
    : [MARCA_EJEMPLO_VAF, op.anioIni, n === 0 ? "Aprobado" : "Ejecutado", n === 0 ? 1_250_000_000 : 310_000_000, `${op.anioIni}-03-15`, "Presupuesto ordinario institucional", "RP-1001", "Ejemplo. Esta fila no se importa."]);
  const filas = [0, 1].map((n) => { const f = ej(n); f[0] = `${MARCA_EJEMPLO_VAF} · ${l1 ? textoLinea(l1) : "línea de ejemplo"}`; return f; });
  const filasEj = filas.map((f) => [...f]);
  const ejemplos: { fila: number; columna: number; tipo: TipoCelda }[] = [0, 1].flatMap((fila) => cols.map((_, columna) => ({ fila, columna, tipo: "bloqueada" as const })));
  const idx = (id: string) => cols.findIndex((x) => x.id === id);
  const listas: Record<number, string[] | { rango: string }> = { [idx("linea")]: { rango: `'${HOJA_LISTAS_VAF}'!$A$2:$A$${Math.max(2, lineasTxt.length + 1)}` } };
  if (tipo === "financiacion") listas[idx("estado")] = ["Aprobada", "Ajustada", "Rechazada", "Sin evaluar"];
  else listas[idx("tipo")] = TIPOS_MOV.map((t) => ROTULO_MOV[t]);
  const nombre = tipo === "financiacion" ? "financiación por línea" : "ejecución presupuestal";
  const instr: [string, string][] = [
    ["Para qué sirve", `Es la plantilla para cargar de una sola vez la ${nombre} de «${op.planNombre}». Una fila por ${tipo === "financiacion" ? "línea y año" : "movimiento"}. La carga es de la VAF y del administrador.`],
    ["Todo o nada", `El archivo se lee en su navegador. Si una sola fila tiene un problema, no se carga ninguna: se le dice la fila y la columna. Hasta ${MAX_FILAS_VAF} filas.`],
    ["Filas de ejemplo", "Las dos primeras filas (gris, «EJEMPLO») no se importan; puede dejarlas o borrarlas."],
    ["Línea", "Elija de la lista: el N.º de la línea del plan (la clave). Obligatoria."],
    ["Año", `Entre ${op.anioIni} y ${op.anioFin} (la vigencia del plan). Obligatorio.`],
    ...(tipo === "financiacion"
      ? ([["Monto aprobado", "Lo que la VAF aprueba para esa línea y año, en pesos, solo el número (1250000000 o 1.250.000.000). Cero o más."], ["Estado", "Aprobada, Ajustada, Rechazada o Sin evaluar. Vacío cuenta como Aprobada. Una línea y un año ya cargados se reemplazan."], ["Nota", "Obligatoria (al menos 10 caracteres) si el estado es Ajustada o Rechazada."]] as [string, string][])
      : ([["Tipo", "Aprobado (el presupuesto del año), Modificación (adición o reducción), Comprometido, Ejecutado o Pagado."], ["Monto", "En pesos, distinto de cero. Solo una Modificación puede ser negativa; para corregir otro movimiento se anula en el portal, no se resta."], ["Fecha", "AAAA-MM-DD. Si la deja vacía se usa hoy; no puede ser futura. El libro es solo de adición: lo cargado no se edita ni se borra, se anula con un movimiento."]] as [string, string][])),
    ["Fórmulas", "No use fórmulas: escriba los datos. Lo que sea fórmula se ignora y se le avisa."],
  ];
  return [
    { nombre: HOJA_INSTRUCCIONES_VAF, banner: { titulo: `Plantilla de ${nombre} · Instrucciones`, subtitulo: op.planNombre, ayuda: "Lea esta hoja una vez; después llene la hoja de datos. Esta plantilla no envía nada." }, columnas: [{ titulo: "Tema", ancho: 30 }, { titulo: "Qué hacer o qué significa", ancho: 110 }], filas: instr, envolver: true },
    {
      nombre: HOJA_DATOS[tipo],
      banner: { titulo: `${HOJA_DATOS[tipo]} · ${op.planNombre}`, subtitulo: "Amarillo: obligatorio. Azul claro: opcional. Gris: ejemplo, no se importa.", ayuda: `Montos en pesos colombianos. Hasta ${MAX_FILAS_VAF} filas.` },
      columnas: cols.map((k) => ({ titulo: titulo(k), ancho: k.ancho })), filas: filasEj, tipos: cols.map((k) => k.tipo), celdas: ejemplos, listas, filasLibres: 60,
    },
    { nombre: HOJA_LISTAS_VAF, oculta: true, columnas: [{ titulo: "Línea", ancho: 60 }], filas: (lineasTxt.length ? lineasTxt : [""]).map((x) => [x]) },
    { nombre: HOJA_CONTROL_VAF, oculta: true, columnas: [{ titulo: "clave" }, { titulo: "valor" }], filas: [["formato", FORMATO[tipo]], ["version", 1], ["plan_id", op.planId ?? ""], ["plan", op.planNombre], ["generado", (op.ahora ?? new Date()).toISOString().slice(0, 10)]] },
  ];
}
export const nombreArchivoVaf = (tipo: TipoCargaVaf, plan: string): string => {
  const slug = plan.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `plantilla-${tipo === "financiacion" ? "financiacion" : "ejecucion"}-${slug || "plan"}.xlsx`;
};
export const construirPlantillaVaf = (tipo: TipoCargaVaf, op: OpcionesVaf): Promise<ArrayBuffer> => construirLibro(hojasPlantillaVaf(tipo, op), { logo: op.logo, filasLibres: 0 });
async function cargarLogo(): Promise<string | undefined> {
  try {
    const base = (import.meta.env.BASE_URL as string | undefined) ?? "/";
    const r = await fetch(`${base}logo-udes-blanco.png`);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return undefined;
  }
}
export async function descargarPlantillaVaf(tipo: TipoCargaVaf, op: OpcionesVaf): Promise<void> {
  const buffer = await construirPlantillaVaf(tipo, { ...op, logo: op.logo ?? (await cargarLogo()) });
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivoVaf(tipo, op.planNombre));
}

/* ---------- Importador ---------- */

export interface FilaLeidaVaf<T> {
  /** Fila del libro. */
  fila: number;
  datos: T | null;
  problemas: Problema[];
}
export interface ResultadoVaf<T> {
  error: string | null;
  filas: FilaLeidaVaf<T>[];
  generales: Problema[];
  ejemplosIgnorados: number;
  formulasIgnoradas: number;
}
const vacio = <T,>(error: string, generales: Problema[] = []): ResultadoVaf<T> => ({ error, filas: [], generales, ejemplosIgnorados: 0, formulasIgnoradas: 0 });

function analizar<T>(tipo: TipoCargaVaf, hojas: HojaCruda[], op: OpcionesVaf, armar: (celda: (id: string) => string, poner: (id: string, m: string) => void, linea: string | null) => T | null): ResultadoVaf<T> {
  const cols = COLUMNAS_VAF[tipo];
  const hoja = hojas.find((h) => llano(h.nombre) === llano(HOJA_DATOS[tipo]));
  if (!hoja) return vacio(`No encuentro la hoja «${HOJA_DATOS[tipo]}». Este libro tiene: ${hojas.filter((h) => !h.oculta).map((h) => `«${h.nombre}»`).join(", ") || "ninguna hoja visible"}. Use la plantilla y no cambie el nombre de sus hojas.`);
  const generales: Problema[] = [];
  const control = hojas.find((h) => llano(h.nombre) === llano(HOJA_CONTROL_VAF));
  const dic = new Map((control?.filas ?? []).map((f) => [llano(f[0] ?? ""), (f[1] ?? "").trim()]));
  if (dic.get("formato") && dic.get("formato") !== FORMATO[tipo]) return vacio(`Este libro es de otra plantilla (${dic.get("formato")}). Descargue la plantilla de ${tipo === "financiacion" ? "financiación" : "ejecución"}.`);
  if (op.planId && dic.get("plan_id") && dic.get("plan_id") !== op.planId) return vacio(`Esta plantilla se descargó para «${dic.get("plan") ?? "otro plan"}» y usted carga «${op.planNombre}». Descargue la plantilla de este plan.`);
  if (!control) generales.push({ nivel: "aviso", hoja: HOJA_CONTROL_VAF, fila: null, columna: null, mensaje: "El libro no trae la hoja oculta «_Control» de la plantilla: se leyó por los encabezados." });
  const obligatorias = new Set(cols.filter((x) => x.tipo === "obligatoria").map((x) => llano(x.base)));
  const filaEnc = hoja.filas.slice(0, 25).findIndex((f) => f.filter((t) => obligatorias.has(llano(baseDeEncabezado(t)))).length >= 3);
  if (filaEnc < 0) return vacio(`No encuentro los encabezados en la hoja «${hoja.nombre}» (${cols.filter((x) => x.tipo === "obligatoria").map((x) => x.base).join(", ")}). No los cambie: descargue la plantilla y copie sus datos.`, generales);
  const indice = new Map<string, number>();
  hoja.filas[filaEnc].forEach((t, i) => { const k = cols.find((x) => llano(x.base) === llano(baseDeEncabezado(t))); if (k && !indice.has(k.id)) indice.set(k.id, i); });
  const faltan = cols.filter((x) => x.tipo === "obligatoria" && !indice.has(x.id));
  if (faltan.length) return vacio(`A la hoja «${hoja.nombre}» le faltan columnas obligatorias: ${faltan.map((x) => `«${x.base}»`).join(", ")}. No cambie los encabezados.`, generales);
  const formulasIgnoradas = hoja.formulas?.size ?? 0;
  if (formulasIgnoradas) generales.push({ nivel: "aviso", hoja: hoja.nombre, fila: null, columna: null, mensaje: `Hay ${formulasIgnoradas} celda${formulasIgnoradas === 1 ? "" : "s"} con fórmula: se ignoraron. Escriba los datos directamente.` });
  const porClave = new Map(op.lineas.map((l) => [llano(l.no), l.no]));
  const filas: FilaLeidaVaf<T>[] = [];
  let ejemplosIgnorados = 0;
  let excedido = false;
  for (let r = filaEnc + 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r];
    if (fila.every((x) => !x.trim())) continue;
    const celda = (id: string) => (fila[indice.get(id) ?? -1] ?? "").trim();
    if (llano(celda("linea")).startsWith(llano(MARCA_EJEMPLO_VAF))) { ejemplosIgnorados += 1; continue; }
    if (filas.length >= MAX_FILAS_VAF) { excedido = true; break; }
    const problemas: Problema[] = [];
    const poner = (id: string, mensaje: string) => problemas.push({ nivel: "error", hoja: hoja.nombre, fila: r + 1, columna: cols.find((x) => x.id === id)?.base ?? null, mensaje });
    const lineaTxt = celda("linea");
    let linea: string | null = null;
    if (!lineaTxt) poner("linea", "Falta la línea. Elija el N.º de la lista.");
    else {
      const cod = /^\s*#?\s*([^\s·]+)\s*(?:·|$)/.exec(lineaTxt)?.[1] ?? "";
      linea = porClave.get(llano(cod)) ?? porClave.get(llano(lineaTxt)) ?? null;
      if (!linea) poner("linea", `«${lineaTxt.slice(0, 50)}» no es una línea de este plan. Elija una de la lista desplegable.`);
    }
    const datos = armar(celda, poner, linea);
    filas.push({ fila: r + 1, datos: problemas.length ? null : datos, problemas });
  }
  // Repetidos dentro de la hoja (línea + año en financiación): se avisa como error de la segunda fila.
  if (tipo === "financiacion") {
    const vistos = new Map<string, number>();
    for (const f of filas) {
      const d = f.datos as FilaFinanciacion | null;
      if (!d) continue;
      const k = `${llano(d.linea)}|${d.anio}`;
      const previa = vistos.get(k);
      if (previa !== undefined) { f.problemas.push({ nivel: "error", hoja: hoja.nombre, fila: f.fila, columna: "Año", mensaje: `La línea y el año ya están en la fila ${previa}. Cada línea lleva un solo monto por año.` }); f.datos = null; }
      else vistos.set(k, f.fila);
    }
  }
  if (excedido) generales.push({ nivel: "aviso", hoja: hoja.nombre, fila: null, columna: null, mensaje: `El libro tiene más de ${MAX_FILAS_VAF} filas: entraron las primeras ${MAX_FILAS_VAF}. Divida el archivo.` });
  if (!filas.length) generales.push({ nivel: "aviso", hoja: hoja.nombre, fila: filaEnc + 1, columna: null, mensaje: "No encontré ninguna fila para cargar. Escríbalas a partir de la tercera fila de datos (las dos primeras son ejemplos)." });
  return { error: null, filas, generales, ejemplosIgnorados, formulasIgnoradas };
}

const anioDe = (t: string): number | null => (/^\d{4}$/.test(t.replace(/[.,]/g, "")) ? Number(t.replace(/[.,]/g, "")) : null);

export function analizarFinanciacion(hojas: HojaCruda[], op: OpcionesVaf): ResultadoVaf<FilaFinanciacion> {
  return analizar<FilaFinanciacion>("financiacion", hojas, op, (celda, poner, linea) => {
    const anioT = celda("anio");
    const anio = anioDe(anioT);
    if (anio === null) poner("anio", anioT ? `«${anioT.slice(0, 20)}» no es un año. Escriba cuatro cifras, por ejemplo ${op.anioIni}.` : "Falta el año.");
    if (anio !== null && (anio < op.anioIni || anio > op.anioFin)) poner("anio", `El año ${anio} está fuera de la vigencia del plan (${op.anioIni} a ${op.anioFin}).`);
    const montoT = celda("monto");
    const monto = montoT ? leerNumero(montoT) : null;
    if (monto === null) poner("monto", montoT ? `El monto «${montoT.slice(0, 30)}» no es un número. Escriba solo el valor en pesos, sin letras.` : "Falta el monto aprobado.");
    const estT = celda("estado");
    const est = estT ? ESTADOS_TXT.find(([x]) => x === llano(estT))?.[1] : "aprobada";
    if (!est) poner("estado", `«${estT.slice(0, 30)}» no es un estado. Elija Aprobada, Ajustada, Rechazada o Sin evaluar.`);
    const fila: FilaFinanciacion = { linea: linea ?? "", anio: anio ?? 0, montoAprobado: monto ?? 0, fuente: celda("fuente"), estado: (est ?? "aprobada") as EstadoFinanciacion, nota: celda("nota") };
    if (anio !== null && anio >= op.anioIni && anio <= op.anioFin && monto !== null && est) {
      const campoDe: Record<string, string> = { "fn-anio": "anio", "fn-monto": "monto", "fn-fuente": "fuente", "fn-nota": "nota" };
      for (const e of validarFinanciacion({ anio, monto, fuente: fila.fuente, estado: fila.estado, nota: fila.nota }, { ini: op.anioIni, fin: op.anioFin })) poner(campoDe[e.campo] ?? "anio", e.mensaje);
    }
    return fila;
  });
}

export function analizarEjecucion(hojas: HojaCruda[], op: OpcionesVaf): ResultadoVaf<FilaMov> {
  return analizar<FilaMov>("ejecucion", hojas, op, (celda, poner, linea) => {
    const anioT = celda("anio");
    const anio = anioDe(anioT);
    if (anio === null) poner("anio", anioT ? `«${anioT.slice(0, 20)}» no es un año. Escriba cuatro cifras, por ejemplo ${op.anioIni}.` : "Falta el año.");
    const tipoT = celda("tipo");
    const tipoMov = TIPOS_TXT.find(([x]) => x === llano(tipoT))?.[1];
    if (!tipoMov) poner("tipo", tipoT ? `«${tipoT.slice(0, 30)}» no es un tipo. Elija Aprobado, Modificación, Comprometido, Ejecutado o Pagado.` : "Falta el tipo de movimiento.");
    if (anio !== null && (anio < op.anioIni || anio > op.anioFin)) poner("anio", `El año ${anio} está fuera de la vigencia del plan (${op.anioIni} a ${op.anioFin}).`);
    const montoT = celda("monto");
    const monto = montoT ? leerNumero(montoT) : null;
    if (monto === null) poner("monto", montoT ? `El monto «${montoT.slice(0, 30)}» no es un número. Escriba solo el valor en pesos, sin letras.` : "Falta el monto.");
    const fechaT = celda("fecha");
    const fecha = fechaT ? leerFecha(fechaT) : op.hoy;
    if (!fecha) poner("fecha", `«${fechaT.slice(0, 30)}» no es una fecha válida. Escríbala como AAAA-MM-DD.`);
    const fila: FilaMov = { linea: linea ?? "", anio: anio ?? 0, tipo: tipoMov ?? "ejecutado", monto: monto ?? 0, fecha: fecha ?? op.hoy, fuente: celda("fuente"), referencia: celda("referencia"), nota: celda("nota") };
    if (anio !== null && anio >= op.anioIni && anio <= op.anioFin && tipoMov && monto !== null && fecha) {
      const campoDe: Record<string, string> = { "mv-anio": "anio", "mv-tipo": "tipo", "mv-monto": "monto", "mv-fecha": "fecha", "mv-fuente": "fuente", "mv-referencia": "referencia", "mv-nota": "nota" };
      for (const e of validarMovimiento({ anio, tipo: tipoMov, monto, fecha, fuente: fila.fuente, referencia: fila.referencia, nota: fila.nota }, { hoy: op.hoy, ini: op.anioIni, fin: op.anioFin })) poner(campoDe[e.campo] ?? "monto", e.mensaje);
    }
    return fila;
  });
}

export const filasListasVaf = <T,>(r: ResultadoVaf<T>): T[] => r.filas.flatMap((f) => (f.datos ? [f.datos] : []));
export const problemasVaf = <T,>(r: ResultadoVaf<T>): Problema[] => [...r.generales, ...r.filas.flatMap((f) => f.problemas)];
export { ROTULO_FINANCIACION };
