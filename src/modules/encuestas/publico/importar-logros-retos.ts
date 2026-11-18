/* =============================================================================
   Encuestas con Pilo · importar logros y retos desde Excel.

   Lee el libro de la plantilla (plantilla-logros-retos.ts) o el de «Mis envíos»
   (excel-envios.ts) y devuelve borradores de `AporteEnvio` con una lista de
   problemas por hoja, fila y columna, explicados en español. Cada fila se valida
   con las mismas reglas del formulario (lib/validacion.ts); una fila mala no
   hace perder las buenas. Nada sale al servidor: el libro se lee en el navegador
   y los aportes se cargan en el formulario para que la persona los revise.

   Seguridad: todo se trata como texto. Las fórmulas no se evalúan: se ignoran
   (su celda queda vacía) y se avisa. Un texto que empieza con «=» es solo texto.
   La lectura (exceljs, carga perezosa) está en `leerLibro`; el análisis
   (`analizarLibro`) es puro y es lo que cubren las pruebas.
   ========================================================================== */

import type { AporteEnvio, CifraEnvio, TipoAporte, TipoCifra } from "../tipos";
import { LIMITES, leerNumero, validarCifra, validarDescripcion, validarTitulo } from "../lib/validacion";
import type { CampoCifra, CifraBorrador } from "../lib/validacion";
import { FORMATO_ENVIOS, HOJA_CIFRAS, HOJA_CONTROL_ENVIOS, HOJA_ENVIOS, tipoDeUnidad, VERSION_ENVIOS } from "./excel-envios";
import { MARCA_EJEMPLO } from "./plantilla-logros-retos";

/** Tope del archivo (2 MB), de filas leídas por hoja y de columnas. */
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FILAS_LECTURA = 1000;
export const MAX_COLUMNAS_LECTURA = 20;
const MAX_TEXTO_CELDA = 5000;

export type NivelProblema = "error" | "aviso";

export interface Problema {
  nivel: NivelProblema;
  hoja: string;
  /** Fila del libro (la que ve la persona en Excel); null si es del libro entero. */
  fila: number | null;
  columna: string | null;
  /** Qué pasó y cómo arreglarlo, en lenguaje llano. */
  mensaje: string;
}

export interface AporteLeido {
  /** Fila en «Logros y retos». */
  fila: number;
  numero: string;
  tipo: TipoAporte | null;
  titulo: string;
  nCifras: number;
  /** El aporte listo para el formulario; null si la fila tiene errores. */
  aporte: AporteEnvio | null;
  problemas: Problema[];
}

export interface ResultadoImportacion {
  /** Si no se pudo leer el libro: por qué, en una frase. */
  error: string | null;
  origen: "plantilla" | "descarga" | null;
  aportes: AporteLeido[];
  /** Problemas que no son de un aporte (cifras sin su N.º, otra encuesta, filas de más). */
  generales: Problema[];
}

/** Una hoja leída del archivo, ya como texto. `formulas` guarda «fila:columna» (desde 0) de las celdas con fórmula. */
export interface HojaCruda {
  nombre: string;
  oculta: boolean;
  filas: string[][];
  formulas: Set<string>;
}

export class ErrorImportacion extends Error {}

const vacio = (error: string): ResultadoImportacion => ({ error, origen: null, aportes: [], generales: [] });

/* ---------- Lectura del archivo ---------- */

const numeroATexto = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  const t = String(n);
  return /e/i.test(t) ? n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",") : t.replace(".", ",");
};

function textoDeValor(v: unknown, numFmt: string | undefined): { texto: string; formula: boolean } {
  if (v === null || v === undefined) return { texto: "", formula: false };
  if (typeof v === "string") return { texto: v.slice(0, MAX_TEXTO_CELDA), formula: false };
  if (typeof v === "number") {
    // Una celda con formato de porcentaje guarda 0,72 y muestra 72 %: se lee lo que se ve.
    if (numFmt && numFmt.includes("%")) return { texto: `${numeroATexto(Math.round(v * 1e8) / 1e6)} %`, formula: false };
    return { texto: numeroATexto(v), formula: false };
  }
  if (typeof v === "boolean") return { texto: v ? "VERDADERO" : "FALSO", formula: false };
  if (v instanceof Date) return { texto: v.toISOString().slice(0, 10), formula: false };
  if (typeof v === "object") {
    const o = v as { formula?: unknown; sharedFormula?: unknown; richText?: { text: string }[]; text?: unknown; hyperlink?: string };
    if (o.formula !== undefined || o.sharedFormula !== undefined) return { texto: "", formula: true };
    if (Array.isArray(o.richText)) return { texto: o.richText.map((r) => r.text).join("").slice(0, MAX_TEXTO_CELDA), formula: false };
    if (typeof o.text === "string") return { texto: o.text.slice(0, MAX_TEXTO_CELDA), formula: false };
    if (typeof o.hyperlink === "string") return { texto: o.hyperlink.slice(0, MAX_TEXTO_CELDA), formula: false };
  }
  return { texto: "", formula: false };
}

/** Lee el archivo (exceljs se carga aquí) y lo deja como hojas de texto. Lanza `ErrorImportacion` con un mensaje claro. */
export async function leerLibro(origen: File | ArrayBuffer | Uint8Array): Promise<HojaCruda[]> {
  const tamano = "size" in origen ? origen.size : origen.byteLength;
  if (tamano > MAX_BYTES) throw new ErrorImportacion(`El archivo pesa ${(tamano / 1048576).toFixed(1).replace(".", ",")} MB y el máximo es ${MAX_BYTES / 1048576} MB. Un libro de logros y retos no debería pesar tanto: revise que no tenga imágenes o datos de más.`);
  const datos: ArrayBuffer | Uint8Array = "arrayBuffer" in origen && typeof origen.arrayBuffer === "function" ? await origen.arrayBuffer() : (origen as ArrayBuffer | Uint8Array);
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ErrorImportacion("Este archivo no es un libro de Excel (.xlsx). Si lo guardó como CSV, PDF o .xls, vuelva a guardarlo como «Libro de Excel (.xlsx)».");
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new ErrorImportacion("No pude abrir el archivo: parece dañado o no es un libro de Excel (.xlsx). Ábralo en Excel, guárdelo de nuevo y vuelva a intentarlo.");
  }
  return libro.worksheets.map((hoja) => {
    const filas: string[][] = [];
    const formulas = new Set<string>();
    const nf = Math.min(hoja.rowCount, MAX_FILAS_LECTURA);
    const nc = Math.min(hoja.columnCount, MAX_COLUMNAS_LECTURA);
    for (let i = 1; i <= nf; i++) {
      const fila = hoja.getRow(i);
      const celdas: string[] = [];
      for (let j = 1; j <= nc; j++) {
        const c = fila.getCell(j);
        const { texto, formula } = textoDeValor(c.value, c.numFmt);
        if (formula) formulas.add(`${i - 1}:${j - 1}`);
        celdas.push(texto);
      }
      filas.push(celdas);
    }
    return { nombre: hoja.name, oculta: hoja.state !== "visible", filas, formulas };
  });
}

/** Lee y analiza un archivo. No lanza: el motivo va en `error`. */
export async function importarArchivo(origen: File | ArrayBuffer | Uint8Array, opciones: { slug?: string } = {}): Promise<ResultadoImportacion> {
  try {
    return analizarLibro(await leerLibro(origen), opciones);
  } catch (e) {
    return vacio(e instanceof ErrorImportacion ? e.message : "No pude leer el archivo. Pruebe de nuevo con el libro de la plantilla.");
  }
}

/* ---------- Análisis (puro) ---------- */

/** Sin tildes ni signos, en minúscula y con espacios simples: para reconocer encabezados. */
export const normalizar = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const esBase = (encabezado: string, base: string) => {
  const n = normalizar(encabezado);
  return n === base || n.startsWith(`${base} `);
};

const sinControl = (t: string) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const unaLinea = (t: string) => sinControl(t).replace(/\s+/g, " ").trim();
const parrafo = (t: string) => sinControl(t).replace(/\r\n?/g, "\n").trim();
const recorte = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const buscarHoja = (hojas: HojaCruda[], nombre: string) => hojas.find((h) => normalizar(h.nombre) === normalizar(nombre));

/** La fila del encabezado (primeras 15) y la posición de cada columna pedida. */
function encontrarEncabezado(hoja: HojaCruda, columnas: Record<string, string[]>, obligatorias: string[]): { fila: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(hoja.filas.length, 15); i++) {
    const usadas = new Set<number>();
    const col: Record<string, number> = {};
    // Las bases más largas primero: «tipo de cifra» antes que «tipo».
    const pedidas = Object.entries(columnas).sort((a, b) => Math.max(...b[1].map((x) => x.length)) - Math.max(...a[1].map((x) => x.length)));
    for (const [clave, bases] of pedidas) {
      const j = hoja.filas[i].findIndex((c, k) => !usadas.has(k) && bases.some((b) => esBase(c, b)));
      if (j >= 0) {
        col[clave] = j;
        usadas.add(j);
      }
    }
    if (obligatorias.every((k) => k in col)) return { fila: i, col };
  }
  return null;
}

const celda = (hoja: HojaCruda, i: number, j: number | undefined): string => (j === undefined ? "" : (hoja.filas[i]?.[j] ?? ""));
const tieneFormula = (hoja: HojaCruda, i: number, j: number | undefined): boolean => j !== undefined && hoja.formulas.has(`${i}:${j}`);

const claveNumero = (t: string): string => {
  const s = t.trim().replace(/[.,]0+$/, "");
  return /^\d+$/.test(s) ? String(Number(s)) : normalizar(s);
};

const tipoAporteDe = (t: string): TipoAporte | null => {
  const n = normalizar(t);
  return n === "logro" ? "logro" : n === "reto" ? "reto" : null;
};

const TIPOS_CIFRA_TEXTO: Record<string, TipoCifra> = { estudiantes: "estudiantes", estudiante: "estudiantes", programas: "programas", programa: "programas", porcentaje: "porcentaje", "%": "porcentaje", dinero: "dinero", $: "dinero", pesos: "dinero", otro: "otro" };

const COLUMNA_CAMPO: Record<CampoCifra, string> = { que: "Qué mide", tipo: "Tipo de cifra", otro: "Unidad", valor: "Valor" };

/** El control del libro: formato, versión, origen y encuesta. */
function leerControl(hojas: HojaCruda[]): Record<string, string> | null {
  const h = buscarHoja(hojas, HOJA_CONTROL_ENVIOS);
  if (!h) return null;
  const v: Record<string, string> = {};
  for (const f of h.filas) if (f[0]) v[f[0].trim()] = (f[1] ?? "").trim();
  return v;
}

interface CifraLeida {
  fila: number;
  cifra: CifraEnvio | null;
  problemas: Problema[];
}

export function analizarLibro(hojas: HojaCruda[], opciones: { slug?: string } = {}): ResultadoImportacion {
  const control = leerControl(hojas);
  if (!control) return vacio("Este libro no es de la plantilla de logros y retos de Pilo: no tiene la hoja de control. Descargue la plantilla desde la encuesta y llénela, o use un libro bajado de «Mis envíos».");
  if (control.formato !== FORMATO_ENVIOS) return vacio("Este libro es de otro formato y no se puede importar aquí. Use la plantilla de logros y retos de Pilo o un libro bajado de «Mis envíos».");
  const version = Number(control.version);
  if (!Number.isFinite(version) || version !== VERSION_ENVIOS) {
    return vacio(version > VERSION_ENVIOS ? "Este libro es de una versión más nueva de la plantilla. Descargue la plantilla de nuevo desde la encuesta." : "Este libro es de una versión anterior de la plantilla y ya no se puede importar. Descargue la plantilla actual desde la encuesta y pase sus datos.");
  }
  const origen: "plantilla" | "descarga" = control.origen === "plantilla" ? "plantilla" : "descarga";

  const hojaA = buscarHoja(hojas, HOJA_ENVIOS);
  const hojaC = buscarHoja(hojas, HOJA_CIFRAS);
  if (!hojaA) return vacio(`No encuentro la hoja «${HOJA_ENVIOS}». No cambie el nombre de las hojas de la plantilla.`);
  if (!hojaC) return vacio(`No encuentro la hoja «${HOJA_CIFRAS}». No cambie el nombre de las hojas de la plantilla.`);

  const cabA = encontrarEncabezado(hojaA, { numero: ["n", "numero"], tipo: ["tipo"], titulo: ["titulo"], descripcion: ["descripcion"], estado: ["estado"] }, ["tipo", "titulo", "descripcion"]);
  if (!cabA) return vacio(`En la hoja «${HOJA_ENVIOS}» no encuentro los encabezados Tipo, Título y Descripción. No los cambie ni los borre.`);
  const cabC = encontrarEncabezado(hojaC, { numero: ["n", "numero"], tipoCifra: ["tipo de cifra"], que: ["que mide"], valor: ["valor"], unidad: ["unidad"], titulo: ["titulo"] }, ["numero", "que", "valor"]);
  if (!cabC) return vacio(`En la hoja «${HOJA_CIFRAS}» no encuentro los encabezados N.º, Qué mide y Valor. No los cambie ni los borre.`);

  const generales: Problema[] = [];
  const aviso = (hoja: string, fila: number | null, columna: string | null, mensaje: string): Problema => ({ nivel: "aviso", hoja, fila, columna, mensaje });
  const error = (hoja: string, fila: number | null, columna: string | null, mensaje: string): Problema => ({ nivel: "error", hoja, fila, columna, mensaje });

  if (opciones.slug && control.encuesta && control.encuesta !== opciones.slug) {
    generales.push(aviso(HOJA_CONTROL_ENVIOS, null, null, `Este libro se preparó para otra encuesta («${control.encuesta}»). Se puede importar, pero revise que los aportes sean los que quiere enviar aquí.`));
  }
  if (origen === "descarga") {
    generales.push(aviso(HOJA_ENVIOS, null, null, "Este libro se bajó de «Mis envíos»: son aportes que ya envió. Si los importa se enviarán otra vez como aportes nuevos. Las descripciones o títulos que «Mis envíos» acortó, o los que no tienen cifras, aparecen con problemas para que los complete."));
  }
  if (hojaA.filas.length >= MAX_FILAS_LECTURA || hojaC.filas.length >= MAX_FILAS_LECTURA) {
    generales.push(aviso(HOJA_ENVIOS, null, null, `Solo se leen las primeras ${MAX_FILAS_LECTURA} filas de cada hoja. Si hay más, importe el libro en partes.`));
  }

  /* --- Cifras: se leen todas y se agrupan por N.º --- */
  const cifrasPorNumero = new Map<string, CifraLeida[]>();
  const numerosAportes = new Set<string>();
  const filasA: number[] = [];
  for (let i = cabA.fila + 1; i < hojaA.filas.length; i++) {
    const hay = ["tipo", "titulo", "descripcion"].some((k) => celda(hojaA, i, cabA.col[k]).trim() !== "" || tieneFormula(hojaA, i, cabA.col[k]));
    const n = celda(hojaA, i, cabA.col.numero);
    if (normalizar(n).startsWith(normalizar(MARCA_EJEMPLO)) || !hay) continue;
    filasA.push(i);
    if (n.trim()) numerosAportes.add(claveNumero(n));
  }

  for (let i = cabC.fila + 1; i < hojaC.filas.length; i++) {
    const n = celda(hojaC, i, cabC.col.numero);
    const que = unaLinea(celda(hojaC, i, cabC.col.que));
    const valorTxt = celda(hojaC, i, cabC.col.valor);
    const unidad = unaLinea(celda(hojaC, i, cabC.col.unidad));
    const tipoTxt = unaLinea(celda(hojaC, i, cabC.col.tipoCifra));
    const algo = que || valorTxt.trim() || unidad || tipoTxt || tieneFormula(hojaC, i, cabC.col.valor) || tieneFormula(hojaC, i, cabC.col.que);
    if (normalizar(n).startsWith(normalizar(MARCA_EJEMPLO)) || !algo) continue;
    const fila = i + 1;
    const problemas: Problema[] = [];
    for (const k of ["que", "valor", "tipoCifra", "unidad"] as const) {
      if (tieneFormula(hojaC, i, cabC.col[k])) problemas.push(aviso(HOJA_CIFRAS, fila, k === "que" ? "Qué mide" : k === "valor" ? "Valor" : k === "unidad" ? "Unidad" : "Tipo de cifra", "Esta celda tiene una fórmula y no se lee. Escriba el dato directamente, sin fórmula."));
    }
    if (!n.trim()) {
      problemas.push(error(HOJA_CIFRAS, fila, "N.º", `Falta el N.º. Escriba el número del logro o reto al que pertenece esta cifra (el de la hoja «${HOJA_ENVIOS}»).`));
      generales.push(...problemas);
      continue;
    }
    const clave = claveNumero(n);
    if (!numerosAportes.has(clave)) {
      generales.push(error(HOJA_CIFRAS, fila, "N.º", `El N.º ${recorte(n.trim(), 12)} no existe en la hoja «${HOJA_ENVIOS}» (o esa fila está vacía). Corrija el N.º o llene primero el logro o reto.`), ...problemas);
      continue;
    }
    // Tipo de cifra: el de su columna o, en un libro de «Mis envíos», el que sale de la unidad.
    let tipo: TipoCifra | "" = "";
    let otro = "";
    if (tipoTxt) {
      tipo = TIPOS_CIFRA_TEXTO[normalizar(tipoTxt)] ?? "";
      if (!tipo) problemas.push(error(HOJA_CIFRAS, fila, "Tipo de cifra", `«${recorte(tipoTxt)}» no es un tipo de cifra. Elija uno de la lista: Estudiantes, Programas, Porcentaje, Dinero u Otro.`));
    } else if (unidad) {
      tipo = tipoDeUnidad(unidad);
    }
    if (tipo === "otro") otro = unidad;
    if (tipoTxt === "" && unidad === "" && !problemas.some((p) => p.columna === "Tipo de cifra")) problemas.push(error(HOJA_CIFRAS, fila, "Tipo de cifra", "Elija el tipo de cifra de la lista: Estudiantes, Programas, Porcentaje, Dinero u Otro."));
    let cifra: CifraEnvio | null = null;
    if (!problemas.some((p) => p.nivel === "error")) {
      const borrador: CifraBorrador = { id: fila, que, tipo, otro, valor: valorTxt.trim() };
      const r = validarCifra(borrador);
      if ("error" in r) {
        let msg = r.error.mensaje;
        if (r.error.campo === "valor") msg = valorTxt.trim() ? `«${recorte(valorTxt.trim())}» no es un valor válido. ${r.error.mensaje} No escriba letras.` : "Falta el valor. Escriba solo el número, por ejemplo 1.250 o 12,5.";
        if (r.error.campo === "otro") msg = "El tipo es Otro: escriba en la columna Unidad una sola palabra de 2 a 20 letras, sin números ni símbolos (por ejemplo, Convenios).";
        if (r.error.campo === "que" && !que) msg = `Falta decir qué mide la cifra (de ${LIMITES.que.min} a ${LIMITES.que.max} caracteres).`;
        problemas.push(error(HOJA_CIFRAS, fila, COLUMNA_CAMPO[r.error.campo], msg));
      } else cifra = r.cifra;
    }
    // Una descarga de «Mis envíos» trae el título: si no coincide, probablemente el N.º está mal.
    const tituloCif = unaLinea(celda(hojaC, i, cabC.col.titulo));
    const filaAporte = filasA.find((x) => claveNumero(celda(hojaA, x, cabA.col.numero)) === clave);
    if (tituloCif && filaAporte !== undefined && !tieneFormula(hojaC, i, cabC.col.titulo) && normalizar(unaLinea(celda(hojaA, filaAporte, cabA.col.titulo))) !== normalizar(tituloCif)) {
      problemas.push(aviso(HOJA_CIFRAS, fila, "Título", `El título de esta fila no coincide con el del N.º ${clave} en «${HOJA_ENVIOS}». Confirme que el N.º es el correcto.`));
    }
    const lista = cifrasPorNumero.get(clave) ?? [];
    lista.push({ fila, cifra, problemas });
    cifrasPorNumero.set(clave, lista);
  }

  /* --- Aportes --- */
  const vistos = new Set<string>();
  const aportes: AporteLeido[] = [];
  for (const i of filasA) {
    const fila = i + 1;
    const numero = celda(hojaA, i, cabA.col.numero).trim();
    const problemas: Problema[] = [];
    for (const [k, nombre] of [["tipo", "Tipo"], ["titulo", "Título"], ["descripcion", "Descripción"]] as const) {
      if (tieneFormula(hojaA, i, cabA.col[k])) problemas.push(aviso(HOJA_ENVIOS, fila, nombre, "Esta celda tiene una fórmula y no se lee. Escriba el dato directamente, sin fórmula."));
    }
    const tipoTxt = unaLinea(celda(hojaA, i, cabA.col.tipo));
    const titulo = unaLinea(celda(hojaA, i, cabA.col.titulo));
    const descripcion = parrafo(celda(hojaA, i, cabA.col.descripcion));
    const estado = unaLinea(celda(hojaA, i, cabA.col.estado));
    if (estado) problemas.push(aviso(HOJA_ENVIOS, fila, "Estado", `Este aporte viene de «Mis envíos» y ya se envió (estado «${recorte(estado, 20)}»). Importarlo crea una copia nueva.`));

    const tipo = tipoAporteDe(tipoTxt);
    if (!tipo) problemas.push(error(HOJA_ENVIOS, fila, "Tipo", tipoTxt ? `«${recorte(tipoTxt)}» no es un tipo válido. Elija Logro o Reto de la lista desplegable.` : "Falta el tipo. Elija Logro o Reto de la lista desplegable."));
    const eTitulo = validarTitulo(titulo, tipo ?? "logro");
    if (eTitulo) problemas.push(error(HOJA_ENVIOS, fila, "Título", titulo ? `${eTitulo} Hoy tiene ${titulo.length}.` : `Falta el título. ${eTitulo}`));
    const eDesc = validarDescripcion(descripcion);
    if (eDesc) problemas.push(error(HOJA_ENVIOS, fila, "Descripción", descripcion ? `${eDesc} Hoy tiene ${descripcion.length}.` : `Falta la descripción. ${eDesc}`));

    let cifras: CifraLeida[] = [];
    if (!numero) {
      problemas.push(error(HOJA_ENVIOS, fila, "N.º", "Falta el N.º. Escriba el número de esta fila (1, 2, 3...) para enlazar sus cifras."));
    } else {
      const clave = claveNumero(numero);
      if (vistos.has(clave)) problemas.push(error(HOJA_ENVIOS, fila, "N.º", `El N.º ${numero} está repetido. Cada logro o reto lleva su propio número.`));
      vistos.add(clave);
      cifras = cifrasPorNumero.get(clave) ?? [];
      if (cifras.length === 0) problemas.push(error(HOJA_ENVIOS, fila, "Cifras", `No tiene cifras. Agregue al menos una fila en la hoja «${HOJA_CIFRAS}» con N.º ${numero}.`));
      if (cifras.length > LIMITES.cifras) problemas.push(error(HOJA_ENVIOS, fila, "Cifras", `Tiene ${cifras.length} cifras y el máximo es ${LIMITES.cifras}. Quite o junte algunas en la hoja «${HOJA_CIFRAS}».`));
      for (const c of cifras) problemas.push(...c.problemas);
    }
    const sinErrores = !problemas.some((p) => p.nivel === "error") && cifras.every((c) => c.cifra);
    aportes.push({
      fila,
      numero,
      tipo,
      titulo,
      nCifras: cifras.length,
      aporte: sinErrores && tipo ? { tipo, titulo, descripcion, cifras: cifras.map((c) => c.cifra as CifraEnvio) } : null,
      problemas,
    });
  }

  if (aportes.length === 0 && !generales.some((p) => p.nivel === "error")) {
    return { error: origen === "plantilla" ? `No encontré ningún logro ni reto. Llene la hoja «${HOJA_ENVIOS}» desde la primera fila libre (las filas de ejemplo no se importan) y vuelva a importar.` : "No encontré ningún logro ni reto en este libro.", origen, aportes, generales };
  }
  return { error: null, origen, aportes, generales };
}

/* ---------- Lo que se muestra y lo que se agrega ---------- */

/** Todos los problemas del resultado, en orden de hoja y fila. */
export const todosLosProblemas = (r: ResultadoImportacion): Problema[] => [...r.generales, ...r.aportes.flatMap((a) => a.problemas)];

export const esValido = (a: AporteLeido): boolean => a.aporte !== null;

export type MotivoOmitido = "problemas" | "repetido" | "no-cabe";
export interface Plan {
  leido: AporteLeido;
  /** Se agregará al formulario. */
  incluir: boolean;
  motivo?: MotivoOmitido;
}

const llaveAporte = (tipo: string, titulo: string) => `${tipo}:${normalizar(titulo)}`;

/**
 * Qué se agrega: los válidos, sin repetir lo que la persona ya escribió (mismo tipo y título), y solo
 * los que caben en el máximo del envío. Lo que ya está en el formulario no se toca.
 */
export function planDeAgregado(r: ResultadoImportacion, yaHay: readonly AporteEnvio[], max: number = LIMITES.aportes): Plan[] {
  const existentes = new Set(yaHay.map((a) => llaveAporte(a.tipo, a.titulo)));
  let cupo = Math.max(0, max - yaHay.length);
  return r.aportes.map((leido) => {
    if (!leido.aporte) return { leido, incluir: false, motivo: "problemas" as const };
    const llave = llaveAporte(leido.aporte.tipo, leido.aporte.titulo);
    if (existentes.has(llave)) return { leido, incluir: false, motivo: "repetido" as const };
    if (cupo <= 0) return { leido, incluir: false, motivo: "no-cabe" as const };
    cupo--;
    existentes.add(llave);
    return { leido, incluir: true };
  });
}

export const TEXTO_OMITIDO: Record<MotivoOmitido, string> = {
  problemas: "Tiene problemas: corríjalos en el Excel y vuelva a importar.",
  repetido: "Ya tiene un aporte igual (mismo tipo y título) en el formulario: no se agrega otra vez.",
  "no-cabe": `No cabe: un envío lleva hasta ${LIMITES.aportes} aportes. Envíe estos y vuelva a empezar.`,
};

export const resumenImportacion = (r: ResultadoImportacion): { total: number; listos: number; conProblemas: number } => {
  const listos = r.aportes.filter(esValido).length;
  return { total: r.aportes.length, listos, conProblemas: r.aportes.length - listos };
};
