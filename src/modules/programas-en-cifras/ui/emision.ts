/* =============================================================================
   Programas en Cifras · generar el Excel del Cuadro Maestro.

   Se parte del libro oficial del CNA («CNA - Cuadros Maestros», copiado en
   public/plantillas-cna) y se rellenan, con ExcelJS y en el navegador:

     · Cuadro 01 (formulario): por la etiqueta de cada campo, el valor va en la
       primera celda libre a su derecha (o debajo). Lo que no se encuentra se
       avisa en vez de adivinarlo.
     · Cuadros 04, 07, 08, 09 y, en salud, 10 (tablas): se ubica la fila de
       encabezados por sus títulos y se escribe una fila por registro; las
       listas del CNA llevan su posición («2. Maestría»).
     · Cuadros 02 y 03: la fila de periodos de la ventana, un renglón por año y
       periodo (I / II). Sus cifras las llena el sistema y todavía no está
       conectado.
     · Cuadros 02, 03, 05 y 06 quedan marcados «pendiente de conexión».

   Las plantillas de public/ llevan las validaciones de datos limitadas a las
   primeras 1 000 filas (el original las extiende a 1 048 576 y ExcelJS tarda
   un minuto y gasta 2 GB en leerlas).
   ========================================================================== */

import type { Cell, Worksheet } from "exceljs";
import { normalizar } from "../../internacionalizacion/lib/conceptos";
import { dominio, DESTINOS, opcionEmitida } from "../lib/destinos";
import type { ArchivoParaEmitir } from "../lib/emision-checks";
import { analizarPeriodo } from "../lib/periodos";
import type { ColumnaDestino, Datos, DestinoLocal } from "../tipos";

export const PLANTILLA_PROGRAMAS = "/plantillas-cna/cuadro-maestro-programas.xlsx";
export const PLANTILLA_SALUD = "/plantillas-cna/cuadro-maestro-programas-salud.xlsx";

const PENDIENTES: Record<string, string> = {
  "02": "Pendiente de conexión: este cuadro lo llena el sistema con Reportes SNIES y el Warehouse, y todavía no está conectado.",
  "03": "Pendiente de conexión: este cuadro lo llena el sistema con la nómina docente del Warehouse, y todavía no está conectado.",
  "05": "Pendiente de conexión: este cuadro viene de Internacionalización y todavía no está conectado.",
  "06": "Pendiente de conexión: este cuadro viene de Internacionalización y todavía no está conectado.",
};

/** Cómo se llama, en la fila de encabezados de la hoja, cada columna del destino. */
const ENCABEZADOS: Record<string, Record<string, RegExp>> = {
  cna04: {
    cedula: /^cedula/,
    nombres: /^nombres y apellidos/,
    nivel_formacion: /^nivel maximo de formacion/,
    titulo_maximo: /^titulo obtenido en nivel/,
    pais_titulo: /^pais de obtencion/,
    titulo_pregrado: /formacion de pregrado/,
    categoria_escalafon: /^categoria en el escalafon/,
    enlace_cvlac: /^enlace web al cvlac/,
    enlace_gruplac: /^enlace al gruplac/,
    reconocimiento: /^reconocimiento como investigador/,
    unidad_academica: /^facultad/,
    tipo_contratacion: /^tipo de contratacion/,
    tipo_dedicacion: /^tipo de dedicacion/,
    horas_docencia: /horas de docencia/,
    horas_investigacion: /horas de investigacion/,
    horas_extension: /horas de extension/,
    horas_gestion: /horas de gestion/,
    lugar_desarrollo: /^lugar de desarrollo 1/,
    modalidad_presencial: /^presencial$/,
    modalidad_virtual: /^virtual$/,
    modalidad_distancia: /^a distancia$/,
    modalidad_dual: /^dual$/,
    ciclo_tecnica: /^tecnica profesional$/,
    ciclo_tecnologico: /^tecnologico$/,
    ciclo_universitario: /^universitario$/,
  },
  cna07: {
    grupo: /^nombre de los grupos/,
    codigo_grupo: /^codigo del grupo/,
    categoria_737_2015: /737/,
    categoria_781_2017: /781/,
    categoria_833_2018: /833/,
    categoria_894_2021: /894/,
    categoria_957_2024: /957/,
  },
  cna08: {
    proyecto: /^nombre del proyecto/,
    tipo_proyecto: /^tipo de proyecto/,
    fuente_financiacion: /^fuente de financiacion/,
    financiador: /^nombre del financiador/,
    inicio: /^inicio/,
    fin: /^fin\b/,
    n_profesores: /profesores del programa/,
    n_estudiantes: /estudiantes del programa/,
  },
  cna09: {
    estrategia: /^estrategia/,
    anio: /^ano de realizacion/,
    actividades: /actividades realizadas/,
    estudiantes: /estudiantes participantes/,
    profesores: /profesores participantes/,
    administrativos: /administrativos participantes/,
    lugar_desarrollo: /^lugar de desarrollo 1/,
  },
  cna10: {
    escenario: /^nombre del escenario/,
    reps_prestador: /^codigo de prestador en el reps/,
    sede: /^nombre de la sede/,
    reps_sede: /^codigo de prestador \(?sede/,
    municipio: /^municipio/,
    estudiantes_simultaneos: /estudiantes en practica/,
    acreditado: /^acreditado/,
    hospital_universitario: /hospital universitario/,
    principal: /practica principal/,
    visitado: /^escenario visitado/,
    concepto_favorable_ciths: /concepto favorable/,
    acuerdo_ciths: /^numero del acuerdo/,
    fecha_acuerdo_ciths: /^fecha del acuerdo/,
    fecha_suscripcion_convenio: /^fecha de suscripcion/,
    fecha_vencimiento_convenio: /^fecha de vencimiento/,
  },
};

/** Las etiquetas del formulario del Cuadro 01. */
const ETIQUETAS_01: [string, RegExp][] = [
  ["denominacion", /^denominacion del programa/],
  ["unidad_academica", /^unidad academica del programa/],
  ["snies_actual", /^codigo snies actual vigente/],
  ["snies_anterior", /^si el programa ha cambiado su codigo snies/],
  ["registro_unico", /^es ofertado en registro unico/],
  ["codigo_registro_unico", /^codigo registro unico/],
  ["modalidades", /^en que modalidades se oferta/],
  ["ciclos_propedeuticos", /^es ofertado por ciclos propedeuticos/],
  ["programas_ciclo", /^codigos snies y nombres de los programas vinculados/],
  ["creditos", /^n de creditos segun plan/],
  ["admitidos_primer_periodo", /^n de estudiantes admitidos en el primer periodo/],
  ["anio_primera_cohorte", /^ano de la primera cohorte/],
  ["duracion_total", /^duracion total del programa/],
  ["periodicidad_admision", /^periodicidad de admision/],
  ["resoluciones_modificacion_rc", /^resolucion\(?es\)? de modificacion rc/],
  ["promociones_graduados", /^n de promociones de graduados/],
  ["promociones_ventana", /^n de promociones en la ventana/],
  ["graduados_total", /^n total de graduados/],
  ["graduados_ventana", /^n de graduados en la ventana/],
  ["modificacion_rc_proyectada", /^si la ies tiene proyectado/],
  ["lugar_desarrollo", /^lugar de desarrollo segun rc/],
  ["lugar_fecha_creacion", /^fecha de creacion/],
  ["lugar_resolucion", /^resolucion de modificacion de rc que incluye/],
  ["fecha_diligenciamiento", /^fecha de diligenciamiento/],
  ["fecha_autoevaluacion", /^fecha autoevaluacion/],
];

export interface ResultadoGenerar {
  buffer: ArrayBuffer;
  /** Cuadros que se rellenaron con un archivo. */
  llenados: string[];
  /** Cuadros que el sistema llena y todavía no están conectados. */
  pendientes: string[];
  /** Campos o columnas que no se encontraron en el libro del CNA. */
  sinUbicar: string[];
}

export interface EntradaGenerar {
  plantilla: ArrayBuffer;
  archivos: readonly ArchivoParaEmitir[];
  salud: boolean;
  /** Periodos de la ventana, del más antiguo al más reciente. */
  periodos: readonly string[];
  destinos?: readonly DestinoLocal[];
}

/* ---------- utilidades de celdas ----------------------------------------------------- */

function textoDeCelda(cell: Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown; formula?: string };
    if (o.richText) return o.richText.map((x) => x.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result !== undefined && o.result !== null) return String(o.result);
    return "";
  }
  return String(v);
}

const maestra = (c: Cell): Cell => (c.isMerged ? c.master : c);

function fechaUtc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/** El valor tal como va en el libro: número, fecha, opción numerada o texto. */
export function valorParaLibro(c: ColumnaDestino, valor: unknown): string | number | Date | null {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const v = typeof valor === "number" ? valor : String(valor).trim();
  if (c.tipo === "numero" || c.tipo === "porcentaje") {
    const n = typeof v === "number" ? v : Number(v.replace(",", "."));
    return Number.isNaN(n) ? String(v) : n;
  }
  if (c.tipo === "fecha") return fechaUtc(String(v)) ?? String(v);
  if (c.tipo === "lista") {
    const d = dominio(c.dominio);
    return d ? opcionEmitida(d, String(v)) : String(v);
  }
  return String(v);
}

function escribir(cell: Cell, valor: string | number | Date, plantillaEstilo?: Cell) {
  cell.value = valor;
  if (plantillaEstilo && !cell.border) cell.style = { ...plantillaEstilo.style };
  if (valor instanceof Date && (!cell.numFmt || cell.numFmt === "General")) cell.numFmt = "dd/mm/yyyy";
}

const hojaDe = (hojas: Worksheet[], cuadro: string): Worksheet | undefined => hojas.find((h) => h.name.startsWith(`${cuadro}.`));

/* ---------- tablas (04, 07, 08, 09, 10) ------------------------------------------------ */

interface Ubicacion {
  fila: number;
  columnas: Map<string, number>;
  n: number | null;
}

function ubicarEncabezados(hoja: Worksheet, reglas: Record<string, RegExp>): Ubicacion | null {
  let mejor: Ubicacion | null = null;
  for (let r = 1; r <= Math.min(30, hoja.rowCount); r++) {
    const columnas = new Map<string, number>();
    let n: number | null = null;
    hoja.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const t = normalizar(textoDeCelda(cell));
      if (!t) return;
      if (n === null && /^(n|no|n 0)$/.test(t)) n = c;
      for (const [clave, re] of Object.entries(reglas)) if (!columnas.has(clave) && re.test(t)) columnas.set(clave, c);
    });
    if (columnas.size >= 2 && (!mejor || columnas.size > mejor.columnas.size)) mejor = { fila: r, columnas, n };
  }
  return mejor;
}

function llenarTabla(hoja: Worksheet, destino: DestinoLocal, archivos: readonly ArchivoParaEmitir[], sinUbicar: string[]): number {
  const reglas = ENCABEZADOS[destino.id];
  if (!reglas) return 0;
  const ub = ubicarEncabezados(hoja, reglas);
  if (!ub) {
    sinUbicar.push(`${destino.nombre}: no se encontró la fila de encabezados.`);
    return 0;
  }
  const registros: { archivo: ArchivoParaEmitir; datos: Datos; mapa: Record<string, string> }[] = [];
  for (const a of archivos) {
    const r = a.respuestas.find((x) => x.destino_id === destino.id);
    if (!r) continue;
    for (const datos of a.filas) registros.push({ archivo: a, datos, mapa: r.mapa });
  }
  for (const c of destino.columnas) if (c.clave in reglas && !ub.columnas.has(c.clave) && registros.some((x) => x.mapa[c.clave])) sinUbicar.push(`${destino.nombre}: la columna «${c.etiqueta}» no está en el libro.`);
  const inicio = ub.fila + 1;
  const modelo = hoja.getRow(inicio);
  registros.forEach((reg, i) => {
    const fila = hoja.getRow(inicio + i);
    if (ub.n !== null) escribir(fila.getCell(ub.n), i + 1, i > 0 ? modelo.getCell(ub.n) : undefined);
    for (const [clave, colIdx] of ub.columnas) {
      const dc = destino.columnas.find((x) => x.clave === clave);
      const origen = reg.mapa[clave];
      if (!dc || !origen) continue;
      const v = valorParaLibro(dc, reg.datos[origen]);
      if (v === null) continue;
      escribir(fila.getCell(colIdx), v, i > 0 ? modelo.getCell(colIdx) : undefined);
    }
    fila.commit();
  });
  return registros.length;
}

/* ---------- Cuadro 01 (formulario) ------------------------------------------------------ */

/** La celda donde va el valor de un campo: la primera libre a la derecha de su etiqueta, o la de abajo. */
function celdaDeValor(hoja: Worksheet, etiqueta: Cell): Cell | null {
  const base = maestra(etiqueta);
  const fila = Number(base.row);
  const hasta = Math.min(hoja.columnCount + 1, Number(base.col) + 14);
  for (let c = Number(base.col) + 1; c <= hasta; c++) {
    const cell = hoja.getCell(fila, c);
    const m = maestra(cell);
    if (m.address === base.address) continue;
    if (textoDeCelda(m).trim()) return abajo(hoja, base);
    return m;
  }
  return abajo(hoja, base);
}

function abajo(hoja: Worksheet, base: Cell): Cell | null {
  const cell = maestra(hoja.getCell(Number(base.row) + 1, Number(base.col)));
  return textoDeCelda(cell).trim() ? null : cell;
}

function llenarFormulario(hoja: Worksheet, destino: DestinoLocal, archivos: readonly ArchivoParaEmitir[], periodos: readonly string[], sinUbicar: string[]): number {
  const dueno = archivos.find((a) => a.respuestas.some((r) => r.destino_id === destino.id));
  if (!dueno) return 0;
  const mapa = dueno.respuestas.find((r) => r.destino_id === destino.id)!.mapa;
  const datos: Datos = dueno.filas[0] ?? {};
  const valorDe = (clave: string): string | number | Date | null => {
    const dc = destino.columnas.find((x) => x.clave === clave);
    const origen = mapa[clave];
    return dc && origen ? valorParaLibro(dc, datos[origen]) : null;
  };
  const etiquetas = new Map<string, Cell>();
  const rotulos: { texto: string; cell: Cell }[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    fila.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const t = normalizar(textoDeCelda(cell));
      if (!t) return;
      rotulos.push({ texto: t, cell });
      for (const [clave, re] of ETIQUETAS_01) if (!etiquetas.has(clave) && re.test(t)) etiquetas.set(clave, cell);
    });
  });
  let escritos = 0;
  const poner = (cell: Cell | null | undefined, v: string | number | Date | null): boolean => {
    if (!cell || v === null) return false;
    escribir(cell, v);
    escritos++;
    return true;
  };
  for (const [clave] of ETIQUETAS_01) {
    const v = valorDe(clave);
    if (v === null) continue;
    const etiqueta = etiquetas.get(clave);
    if (!etiqueta || !poner(celdaDeValor(hoja, etiqueta), v)) sinUbicar.push(`Cuadro 01: no se encontró dónde escribir «${destino.columnas.find((x) => x.clave === clave)?.etiqueta ?? clave}».`);
  }
  // Las resoluciones llevan «Número», «Fecha» (y «Vigencia») en la misma fila que su título.
  const enFila = (re: RegExp, sub: string): Cell | null => {
    const titulo = rotulos.find((r) => re.test(r.texto));
    if (!titulo) return null;
    const hit = rotulos.find((r) => Number(r.cell.row) === Number(titulo.cell.row) && r.texto === sub && Number(r.cell.col) > Number(titulo.cell.col));
    return hit ? celdaDeValor(hoja, hit.cell) : null;
  };
  const resoluciones: [string, RegExp, string][] = [
    ["resolucion_rc_numero", /^resolucion de registro calificado/, "numero"],
    ["resolucion_rc_fecha", /^resolucion de registro calificado/, "fecha"],
    ["resolucion_acreditacion_numero", /^resolucion de acreditacion/, "numero"],
    ["resolucion_acreditacion_fecha", /^resolucion de acreditacion/, "fecha"],
    ["resolucion_acreditacion_vigencia", /^resolucion de acreditacion/, "vigencia"],
  ];
  for (const [clave, re, sub] of resoluciones) {
    const v = valorDe(clave);
    if (v === null) continue;
    if (!poner(enFila(re, sub), v)) sinUbicar.push(`Cuadro 01: no se encontró dónde escribir «${destino.columnas.find((x) => x.clave === clave)?.etiqueta ?? clave}».`);
  }
  // La ventana de observación: «Desde» y «hasta».
  if (periodos.length) {
    const desde = rotulos.find((r) => r.texto === "desde");
    const hasta = rotulos.find((r) => r.texto === "hasta");
    if (!poner(desde ? celdaDeValor(hoja, desde.cell) : null, periodos[0])) sinUbicar.push("Cuadro 01: no se encontró dónde escribir el inicio de la ventana de observación.");
    if (!poner(hasta ? celdaDeValor(hoja, hasta.cell) : null, periodos[periodos.length - 1])) sinUbicar.push("Cuadro 01: no se encontró dónde escribir el fin de la ventana de observación.");
  }
  return escritos;
}

/* ---------- Cuadros 02 y 03: la fila de periodos --------------------------------------------- */

function llenarPeriodos(hoja: Worksheet, periodos: readonly string[]) {
  let inicio = 0;
  for (let r = 1; r <= 20; r++) {
    const a = normalizar(textoDeCelda(hoja.getCell(r, 2)));
    const b = normalizar(textoDeCelda(hoja.getCell(r, 3)));
    if (/^ano$/.test(a) && /periodo/.test(b)) inicio = r + 1;
  }
  if (!inicio) return;
  // El libro trae algunos renglones de ejemplo: se reemplazan por los de la ventana.
  let r = inicio;
  while (/^\d{4}$/.test(String(textoDeCelda(hoja.getCell(r, 2))).trim())) r++;
  const previos = r - inicio;
  periodos.forEach((p, i) => {
    const x = analizarPeriodo(p);
    if (!x) return;
    hoja.getCell(inicio + i, 2).value = x.anio;
    hoja.getCell(inicio + i, 3).value = x.semestre === 1 ? "I" : "II";
  });
  for (let k = periodos.length; k < previos; k++) {
    hoja.getCell(inicio + k, 2).value = null;
    hoja.getCell(inicio + k, 3).value = null;
  }
}

function marcarPendiente(hoja: Worksheet, texto: string) {
  const cell = hoja.getCell("B5");
  cell.value = texto;
  cell.font = { bold: true, color: { argb: "FFB45309" } };
}

/* ---------- el libro completo -------------------------------------------------------------------- */

export async function generarCuadroMaestro(e: EntradaGenerar): Promise<ResultadoGenerar> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(e.plantilla);
  const hojas = libro.worksheets;
  const destinos = e.destinos ?? DESTINOS;
  const llenados: string[] = [];
  const pendientes: string[] = [];
  const sinUbicar: string[] = [];

  for (const d of destinos) {
    if (d.sistema !== "CNA" || !d.cuadro) continue;
    const hoja = hojaDe(hojas, d.cuadro);
    if (!hoja) continue;
    if (d.automatico) {
      marcarPendiente(hoja, PENDIENTES[d.cuadro] ?? "Pendiente de conexión.");
      if (d.cuadro === "02" || d.cuadro === "03") llenarPeriodos(hoja, e.periodos);
      pendientes.push(d.nombre);
      continue;
    }
    if (d.solo_salud && !e.salud) continue;
    const n = d.cuadro === "01" ? llenarFormulario(hoja, d, e.archivos, e.periodos, sinUbicar) : llenarTabla(hoja, d, e.archivos, sinUbicar);
    if (n > 0) llenados.push(d.nombre);
  }
  const escrito = await libro.xlsx.writeBuffer();
  const buffer = escrito instanceof ArrayBuffer ? escrito : (escrito as Uint8Array).buffer.slice((escrito as Uint8Array).byteOffset, (escrito as Uint8Array).byteOffset + (escrito as Uint8Array).byteLength);
  return { buffer: buffer as ArrayBuffer, llenados, pendientes, sinUbicar };
}

/** Descarga un libro con un Blob. */
export function descargarLibro(buffer: ArrayBuffer, nombre: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
