/* =============================================================================
   Planeación y Seguimiento · importar la planificación desde Excel.

   `analizarLibro` es PURO (recibe hojas ya leídas como texto, sin DOM ni exceljs):
   valida cada fila contra las reglas de la plantilla (plantilla.ts) y devuelve las
   líneas listas y los problemas por hoja, fila y columna, explicados en español y
   con cómo arreglarlos. Una fila con error no se importa; las buenas sí. Lo vacío
   queda vacío: NO se inventa ni se rellena nada.

   `leerLibro` (exceljs, carga perezosa) lee el .xlsx en el navegador: el archivo no
   sale a ningún servidor. Las fórmulas no se evalúan (se ignoran y se avisa).
   ========================================================================== */

import {
  COLUMNAS, FORMATO_PLAN, HOJA_CONTROL, HOJA_LINEAS, MARCA_EJEMPLO, MAX_BYTES, MAX_COLUMNAS_LECTURA, MAX_FILAS_LECTURA, MAX_LINEAS, VERSION_FORMATO,
  baseDeEncabezado, type CampoId, type Columna,
} from "./columnas";
import {
  ANIO_FIN, ANIO_INI, ANIOS, CAMPUS, CAMPUS_TODOS, CLASIFICACIONES, CRITERIOS, FUENTES, PILARES, PRIORIDADES, RESULTADOS, VIABILIDADES, llano, type ClaveCriterio, type ClaveViabilidad, type Linea,
} from "./modelo";
import { columnasDeConfig, listaDeConfig, pilaresDeConfig, resolverPilar, type ConfigPlan } from "./modeloPlanes";

export { MAX_BYTES, MAX_LINEAS };

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

export interface LineaLeida {
  /** Fila del libro. */
  fila: number;
  no: string;
  nombre: string;
  /** La línea lista para importar; null si la fila tiene errores. */
  linea: Linea | null;
  problemas: Problema[];
}

export interface ResultadoImportacion {
  /** Si no se pudo leer el libro: por qué, en una frase. */
  error: string | null;
  origen: "plantilla" | "plan" | "otro" | null;
  lineas: LineaLeida[];
  /** Problemas que no son de una fila (hoja o columnas que faltan, filas de más…). */
  generales: Problema[];
  ejemplosIgnorados: number;
  formulasIgnoradas: number;
}

/** Una hoja leída del archivo como texto. `formulas` guarda «fila:columna» (desde 0) de las celdas con fórmula. */
export interface HojaCruda {
  nombre: string;
  oculta: boolean;
  filas: string[][];
  formulas?: Set<string>;
}

export class ErrorImportacion extends Error {}

const vacio = (error: string, generales: Problema[] = []): ResultadoImportacion => ({ error, origen: null, lineas: [], generales, ejemplosIgnorados: 0, formulasIgnoradas: 0 });

/* ---------- Lectura del archivo (exceljs) ---------- */

const MAX_TEXTO_CELDA = 5000;
const numeroATexto = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  const t = String(n);
  return /e/i.test(t) ? n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",") : t.replace(".", ",");
};

function textoDeValor(v: unknown, numFmt: string | undefined): { texto: string; formula: boolean } {
  if (v === null || v === undefined) return { texto: "", formula: false };
  if (typeof v === "string") return { texto: v.slice(0, MAX_TEXTO_CELDA), formula: false };
  if (typeof v === "number") {
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
  if (tamano > MAX_BYTES) throw new ErrorImportacion(`El archivo pesa ${(tamano / 1048576).toFixed(1).replace(".", ",")} MB y el máximo es ${MAX_BYTES / 1048576} MB. Revise que no tenga imágenes o datos de más.`);
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
        const { texto, formula } = textoDeValor(c.type === ExcelJS.ValueType.Merge && c.master !== c ? null : c.value, c.numFmt);
        if (formula) formulas.add(`${i - 1}:${j - 1}`);
        celdas.push(texto);
      }
      filas.push(celdas);
    }
    return { nombre: hoja.name, oculta: hoja.state !== "visible", filas, formulas };
  });
}

/** Lee y analiza un archivo. No lanza: el motivo va en `error`. */
export async function importarArchivo(origen: File | ArrayBuffer | Uint8Array, opciones: OpcionesAnalisis = {}): Promise<ResultadoImportacion> {
  try {
    return analizarLibro(await leerLibro(origen), opciones);
  } catch (e) {
    return vacio(e instanceof ErrorImportacion ? e.message : "No pude leer el archivo. Ábralo en Excel, guárdelo de nuevo como .xlsx y vuelva a intentarlo.");
  }
}

/* ---------- Valores de una celda ---------- */

type Leido<T> = { ok: true; valor: T } | { ok: false; mensaje: string };
const bien = <T>(valor: T): Leido<T> => ({ ok: true, valor });
const mal = (mensaje: string): Leido<never> => ({ ok: false, mensaje });

/** «$ 6.971.769.559,00», «6971769559», «1.250», «12,5» → número. Nulo si no es un número. */
export function leerNumero(texto: string): number | null {
  let t = texto.replace(/[$\s%]/g, "");
  if (!t || !/^[-+]?[\d.,]+$/.test(t)) return null;
  const punto = t.includes(".");
  const coma = t.includes(",");
  if (punto && coma) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (coma) t = /^[-+]?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (punto && /^[-+]?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const esFechaReal = (y: number, m: number, d: number): boolean => {
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

/** AAAA-MM-DD, DD/MM/AAAA o número de serie de Excel → AAAA-MM-DD. */
export function leerFecha(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m && esFechaReal(+m[1], +m[2], +m[3])) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m && esFechaReal(+m[3], +m[2], +m[1])) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{5}(,\d+)?$/.test(t)) {
    const n = Math.floor(Number(t.replace(",", ".")));
    if (n >= 36526 && n <= 73415) return new Date((n - 25569) * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

const SI = new Set(["si", "s", "1", "verdadero", "true", "x"]);
const NO = new Set(["no", "n", "0", "falso", "false"]);

/* ---------- Análisis ---------- */

export interface OpcionesAnalisis {
  /** Nombres de las unidades del portal; sin esta lista no se valida «Oficina responsable» (se conserva el texto). */
  oficinas?: string[];
  /** Nombres de los campus del portal (sin «Todos», que siempre vale). Por omisión, los de la matriz real. */
  campus?: readonly string[];
  /** Fase 3B: la configuración de la plantilla del plan (columnas obligatorias y opcionales, listas, pilares). Sin ella, la del PDIFyT. */
  config?: ConfigPlan | null;
  /** Años del plan (para las columnas «% de inversión» y el aviso de fechas). Por omisión, los del PDIFyT. */
  anios?: readonly number[];
}

const nombresHoja = (h: HojaCruda) => llano(h.nombre);
const textoCelda = (fila: string[], i: number | undefined) => (i === undefined ? "" : (fila[i] ?? "").trim());

function hallarEncabezado(filas: string[][], cols: readonly Columna[]): number {
  const obl = cols.filter((c) => c.tipo === "obligatoria");
  const minimo = Math.min(3, obl.length);
  const clave = new Set(obl.map((c) => llano(c.base)));
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    const hallados = filas[i].filter((c) => clave.has(llano(baseDeEncabezado(c)))).length;
    if (hallados >= minimo) return i;
  }
  return -1;
}

export function analizarLibro(hojas: HojaCruda[], opciones: OpcionesAnalisis = {}): ResultadoImportacion {
  const cfg = opciones.config ?? null;
  const ANIOS_P = opciones.anios ?? ANIOS;
  const cols = columnasDeConfig(cfg, ANIOS_P);
  const ANIO_I = ANIOS_P[0] ?? ANIO_INI;
  const ANIO_F = ANIOS_P[ANIOS_P.length - 1] ?? ANIO_FIN;
  const esObl = (id: CampoId) => cols.find((c) => c.id === id)?.tipo === "obligatoria";
  const lClasif = listaDeConfig(cfg, "clasif");
  const lPrioridad = listaDeConfig(cfg, "prioridad");
  const lResultado = listaDeConfig(cfg, "resultado");
  const lFuente = listaDeConfig(cfg, "fuente");
  const hoja = hojas.find((h) => nombresHoja(h) === llano(HOJA_LINEAS));
  if (!hoja) {
    return vacio(`No encuentro la hoja «${HOJA_LINEAS}». Este libro tiene: ${hojas.filter((h) => !h.oculta).map((h) => `«${h.nombre}»`).join(", ") || "ninguna hoja visible"}. Use la plantilla de la página «Cargar la planificación» y no cambie el nombre de sus hojas.`);
  }
  const generales: Problema[] = [];
  const aviso = (mensaje: string, fila: number | null = null, columna: string | null = null): Problema => ({ nivel: "aviso", hoja: hoja.nombre, fila, columna, mensaje });

  // Hoja de control: dice si el libro es de la plantilla.
  const control = hojas.find((h) => nombresHoja(h) === llano(HOJA_CONTROL));
  const dic = new Map((control?.filas ?? []).map((f) => [llano(f[0] ?? ""), (f[1] ?? "").trim()]));
  let origen: ResultadoImportacion["origen"] = "otro";
  if (dic.get("formato") === FORMATO_PLAN) {
    origen = dic.get("origen") === "plan" ? "plan" : "plantilla";
    if (Number(dic.get("version")) > VERSION_FORMATO) generales.push({ nivel: "aviso", hoja: HOJA_CONTROL, fila: null, columna: null, mensaje: "El libro es de una versión más nueva de la plantilla. Se leyó con las reglas de esta, descargue la plantilla de nuevo si algo no cuadra." });
  } else {
    generales.push({ nivel: "aviso", hoja: HOJA_CONTROL, fila: null, columna: null, mensaje: "El libro no trae la hoja oculta «_Control» de la plantilla: se leyó por los encabezados. Si algo sale mal, descargue la plantilla y copie sus datos." });
  }

  const filaEnc = hallarEncabezado(hoja.filas, cols);
  if (filaEnc < 0) {
    return vacio(`No encuentro los encabezados en la hoja «${hoja.nombre}» (N.º, Clasificación, Nombre, Campus…). No los cambie ni borre la banda de arriba: descargue la plantilla y copie sus datos.`, generales);
  }
  const encabezados = hoja.filas[filaEnc];
  const indice = new Map<CampoId, number>();
  encabezados.forEach((t, i) => {
    const base = llano(baseDeEncabezado(t));
    const c = cols.find((x) => llano(x.base) === base);
    if (c && !indice.has(c.id)) indice.set(c.id, i);
  });
  const faltan = cols.filter((c) => !indice.has(c.id));
  const faltanObl = faltan.filter((c) => c.tipo === "obligatoria");
  if (faltanObl.length) {
    return vacio(`A la hoja «${hoja.nombre}» le faltan columnas obligatorias: ${faltanObl.map((c) => `«${c.base}»`).join(", ")}. No cambie los encabezados: descargue la plantilla y copie sus datos.`, generales);
  }
  if (faltan.length) generales.push(aviso(`No hay columna para: ${faltan.map((c) => `«${c.base}»`).join(", ")}. Esas líneas quedan sin ese dato (no se inventa).`, filaEnc + 1));

  let formulasIgnoradas = 0;
  hoja.formulas?.forEach(() => (formulasIgnoradas += 1));
  if (formulasIgnoradas) generales.push(aviso(`Hay ${formulasIgnoradas} celda${formulasIgnoradas === 1 ? "" : "s"} con fórmula: se ignoraron y quedaron vacías. Escriba los datos directamente, sin fórmulas.`));

  const listaCampus = [...(opciones.campus ?? CAMPUS), CAMPUS_TODOS];
  const oficinas = opciones.oficinas ? new Map(opciones.oficinas.map((o) => [llano(o), o])) : null;
  const vistos = new Map<string, number>();
  const lineas: LineaLeida[] = [];
  let ejemplosIgnorados = 0;
  let excedido = false;

  for (let r = filaEnc + 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r];
    if (fila.every((c) => !c.trim())) continue;
    const celda = (id: CampoId) => textoCelda(fila, indice.get(id));
    if (llano(celda("no")).startsWith(llano(MARCA_EJEMPLO))) {
      ejemplosIgnorados += 1;
      continue;
    }
    if (lineas.length >= MAX_LINEAS) {
      excedido = true;
      break;
    }
    const nFila = r + 1;
    const problemas: Problema[] = [];
    const err = (c: Columna | string, mensaje: string) => problemas.push({ nivel: "error", hoja: hoja.nombre, fila: nFila, columna: typeof c === "string" ? c : c.base, mensaje });
    const av = (c: Columna | string, mensaje: string) => problemas.push({ nivel: "aviso", hoja: hoja.nombre, fila: nFila, columna: typeof c === "string" ? c : c.base, mensaje });
    const col = (id: CampoId) => cols.find((c) => c.id === id) ?? COLUMNAS.find((c) => c.id === id)!;
    const ver = <T,>(id: CampoId, f: (t: string) => Leido<T>, obligatoria = false): T | null => {
      const t = celda(id);
      if (!t) {
        if (obligatoria && esObl(id)) err(col(id), `Falta ${col(id).base.toLowerCase()}. Es obligatoria: escríbala en la celda amarilla.`);
        return null;
      }
      const r2 = f(t);
      if (!r2.ok) {
        err(col(id), r2.mensaje);
        return null;
      }
      return r2.valor;
    };
    const deLista = (lista: readonly string[], etiqueta: string, tolerante = false) => (t: string): Leido<string> => {
      const hallada = lista.find((x) => llano(x) === llano(t));
      if (hallada) return bien(hallada);
      if (tolerante) return bien(t);
      return mal(`«${t}» no es ${etiqueta} válido. Elija uno de la lista desplegable: ${lista.join(", ")}.`);
    };

    const no = ver("no", (t) => (t.length > 40 ? mal("El N.º es muy largo (máximo 40 caracteres). Use un número corto, como 1, 2, 3…") : bien(t)), true);
    const clasif = ver("clasif", deLista(lClasif, "una clasificación"), true);
    const nombre = ver("nombre", (t) => (t.length > 300 ? mal(`El nombre tiene ${t.length} caracteres y el máximo es 300. Acórtelo.`) : bien(t)), true);
    const descripcion = ver("descripcion", (t) => (t.length > 1000 ? mal(`La descripción tiene ${t.length} caracteres y el máximo es 1.000. Acórtela.`) : bien(t)));
    const campus = ver("campus", deLista(listaCampus, "un campus"), true);
    const pilar = ver(
      "pilar",
      (t) => {
        const delPlan = resolverPilar(cfg, t);
        if (delPlan) return bien(delPlan);
        if (pilaresDeConfig(cfg)) return mal(`«${t}» no es un pilar de este plan. Elija uno de la lista desplegable (${pilaresDeConfig(cfg)!.join("; ")}).`);
        const cod = /^P\s*(\d)/i.exec(t.trim());
        const hallado = cod ? Object.keys(PILARES).find((k) => k === `P${cod[1]}`) : Object.keys(PILARES).find((k) => llano(PILARES[k]) === llano(t));
        return hallado ? bien(`${hallado}. ${PILARES[hallado]}`) : mal(`«${t}» no es un pilar del plan. Elija uno de la lista desplegable (${Object.entries(PILARES).map(([k, v]) => `${k}. ${v}`).join("; ")}).`);
      },
      true,
    );
    const monto = ver(
      "monto",
      (t) => {
        const n = leerNumero(t);
        if (n === null) return mal(`El monto «${t}» no es un número. Escriba solo el valor en pesos, por ejemplo 6971769559 o 6.971.769.559, sin letras ni la palabra «millones».`);
        if (n < 0) return mal("El monto no puede ser negativo.");
        return bien(Math.round(n));
      },
      true,
    );
    const prioridad = ver("prioridad", deLista(lPrioridad, "una prioridad"), true);

    const resultadoTxt = celda("resultado");
    const resultado = resultadoTxt ? (lResultado.find((x) => llano(x) === llano(resultadoTxt)) ?? resultadoTxt) : null;
    if (resultado && !lResultado.some((x) => x === resultado)) av(col("resultado"), `«${resultado}» no es un resultado conocido (${lResultado.join(", ")}). Se importa tal como está.`);
    const fuenteTxt = celda("fuente");
    const fuente = fuenteTxt ? (lFuente.find((x) => llano(x) === llano(fuenteTxt)) ?? fuenteTxt) : null;
    if (fuente && !lFuente.some((x) => x === fuente)) av(col("fuente"), `«${fuente}» no está en la lista de fuentes. Se importa tal como está; si es un error de escritura, elíjala de la lista.`);

    const siNo = (id: CampoId): boolean | null =>
      ver(id, (t) => (SI.has(llano(t)) ? bien(true) : NO.has(llano(t)) ? bien(false) : mal(`«${t}» no es Sí ni No. Elija Sí o No de la lista, o deje la celda vacía si no se evaluó.`)));
    const criterios = Object.fromEntries(Object.keys(CRITERIOS).map((k) => [k, siNo(`crit:${k}`)])) as Record<ClaveCriterio, boolean | null>;
    const viabilidad = Object.fromEntries(Object.keys(VIABILIDADES).map((k) => [k, siNo(`viab:${k}`)])) as Record<ClaveViabilidad, boolean | null>;

    const fechaDe = (id: CampoId) => ver(id, (t) => { const f = leerFecha(t); return f ? bien(f) : mal(`«${t}» no es una fecha válida. Escríbala como AAAA-MM-DD (por ejemplo 2027-01-18) o como fecha de Excel.`); });
    const inicio = fechaDe("inicio");
    const fin = fechaDe("fin");
    if (inicio && fin && fin < inicio) err(col("fin"), `La fecha de fin (${fin}) es anterior a la de inicio (${inicio}). Corrija una de las dos.`);
    for (const [etq, f] of [["inicio", inicio], ["fin", fin]] as const) {
      if (f && (Number(f.slice(0, 4)) < ANIO_I || Number(f.slice(0, 4)) > ANIO_F)) av(col(etq), `La fecha ${f} queda fuera del plan (${ANIO_I} a ${ANIO_F}). Se importa tal como está.`);
    }

    const pct: Record<string, number> = {};
    let suma = 0;
    let algunoPct = false;
    for (const a of ANIOS_P) {
      const v = ver(`pct:${a}`, (t) => {
        const n = leerNumero(t);
        if (n === null) return mal(`«${t}» no es un número. Escriba el porcentaje de 0 a 100 (12 para 12 %).`);
        if (n < 0 || n > 100) return mal(`El porcentaje ${t} está fuera de 0 a 100. Escriba 12 para 12 %.`);
        return bien(n);
      });
      if (v !== null) algunoPct = true;
      pct[String(a)] = v === null ? 0 : v / 100;
      suma += v ?? 0;
    }
    if (algunoPct) {
      const valores = ANIOS_P.map((a) => pct[String(a)] * 100);
      if (suma > 0 && suma <= 1.5 && valores.every((x) => x <= 1)) av("% de inversión", "Todos los porcentajes están entre 0 y 1: parece que escribió fracciones (0,12). Escriba 12 para 12 %; se leyó como puntos y la suma no da 100.");
      else if (Math.abs(suma - 100) > 0.05) av("% de inversión", `Los porcentajes suman ${(Math.round(suma * 100) / 100).toLocaleString("es-CO")} y deberían sumar 100. Se importa tal como está.`);
    }

    const origenTxt = celda("origen");
    const oficinaTxt = celda("oficina");
    let oficina: string | null = null;
    if (oficinaTxt) {
      if (!oficinas) oficina = oficinaTxt;
      else if (oficinas.has(llano(oficinaTxt))) oficina = oficinas.get(llano(oficinaTxt)) ?? null;
      else av(col("oficina"), `«${oficinaTxt}» no es una unidad del portal. Elija una de la lista desplegable; se importa sin oficina.`);
    }
    const correo = celda("gestorCorreo");
    let gestorCorreo: string | null = null;
    if (correo) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) gestorCorreo = correo.toLowerCase();
      else av(col("gestorCorreo"), `«${correo}» no parece un correo. Se importa sin él.`);
    }

    if (no) {
      const previa = vistos.get(llano(no));
      if (previa !== undefined) err(col("no"), `El N.º «${no}» ya está en la fila ${previa}. Cada línea lleva su propio N.º: cámbielo o borre la fila repetida.`);
      else vistos.set(llano(no), nFila);
    }

    const hayError = problemas.some((p) => p.nivel === "error");
    lineas.push({
      fila: nFila,
      no: no ?? "",
      nombre: nombre ?? "",
      problemas,
      linea: hayError || !no || !nombre
        ? null
        : { no, clasif: clasif ?? "", nombre, descripcion, campus: campus ?? "", pilar: pilar ?? "", monto, prioridad: prioridad ?? "", resultado, fuente, criterios, viabilidad, inicio, fin, pct, origen: origenTxt || null, oficina, gestorCorreo },
    });
  }
  if (excedido) generales.push(aviso(`El libro tiene más de ${MAX_LINEAS} líneas: entraron las primeras ${MAX_LINEAS} y el resto no se leyó. Divida el archivo.`));
  if (!lineas.length) generales.push(aviso("No encontré ninguna línea para importar. Escriba las líneas a partir de la tercera fila de datos (las dos primeras son ejemplos).", filaEnc + 1));
  return { error: null, origen, lineas, generales, ejemplosIgnorados, formulasIgnoradas };
}

/* ---------- Resultado ---------- */

export const lineasListas = (r: ResultadoImportacion): Linea[] => r.lineas.flatMap((l) => (l.linea ? [l.linea] : []));
export const conErrores = (r: ResultadoImportacion): LineaLeida[] => r.lineas.filter((l) => !l.linea);
export const problemasDe = (r: ResultadoImportacion): Problema[] => [...r.generales, ...r.lineas.flatMap((l) => l.problemas)];
/** «Hoja «Líneas del plan», fila 9, columna «Monto»»: dónde está el problema. */
export const dondeEsta = (p: Problema): string => [`Hoja «${p.hoja}»`, p.fila !== null ? `fila ${p.fila}` : "", p.columna ? `columna «${p.columna}»` : ""].filter(Boolean).join(", ");
