/* =============================================================================
   Warehouse UDES · motor (lógica pura, sin dependencias).

   Lo comparten la función `warehouse` (Deno) y la pantalla (vía
   src/modules/warehouse/motor.ts). Por eso no importa nada: ni el
   descompresor ni el cliente de Supabase. Quien llama descomprime el .xlsx
   (fflate) y le pasa los archivos de adentro.

   Un .xlsx es un zip con XML. De él solo hace falta la primera hoja y las
   cadenas compartidas; las fechas llegan como las deja el reporte (texto, o
   un número de serie si la celda lo era), sin interpretarlas.
   ========================================================================== */

export type Fila = Record<string, string | number | boolean | null>;

export interface Hoja {
  columnas: string[];
  filas: Fila[];
  /** Encabezados tal como venían en el archivo, en el mismo orden que `columnas`. */
  originales: string[];
}

/** «% Reprobados» → «pct_reprobados»; «Créd. según ubicación» → «cred_segun_ubicacion». */
export function normalizarColumna(texto: string): string {
  const base = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "columna";
}

/** Normaliza una lista de encabezados y desempata los repetidos (`_2`, `_3`…). */
export function normalizarEncabezados(encabezados: string[]): string[] {
  const vistos = new Map<string, number>();
  return encabezados.map((e) => {
    const base = normalizarColumna(e);
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificar(xml: string): string {
  return xml.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (todo, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : todo;
    }
    return ENTIDADES[e] ?? todo;
  });
}

const texto = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);

/** «AB» → 27 (columna base 0). */
function indiceColumna(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function cadenasCompartidas(xml: string): string[] {
  const salida: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let s = "";
    for (const t of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
    salida.push(decodificar(s));
  }
  return salida;
}

/**
 * Lee la hoja indicada (o la primera) de un .xlsx ya descomprimido.
 * `archivos` es el mapa nombre → bytes de las entradas del zip.
 * La primera fila no vacía son los encabezados; las filas vacías se saltan.
 */
export function leerXlsx(archivos: Record<string, Uint8Array>, opciones: { hoja?: number; encabezado?: string } = {}): Hoja {
  return aHoja(matrizDeHoja(archivos, opciones.hoja ?? 0), opciones.encabezado);
}

type Celda = string | number | boolean | null;

/** Las celdas de una hoja, fila por fila, sin interpretar encabezados. */
export function matrizDeHoja(archivos: Record<string, Uint8Array>, indice = 0): Celda[][] {
  const hojas = Object.keys(archivos)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const nombre = hojas[indice];
  if (!nombre) throw new Error("El archivo no es un Excel válido: no tiene hojas.");

  const compartidas = archivos["xl/sharedStrings.xml"] ? cadenasCompartidas(texto(archivos["xl/sharedStrings.xml"])) : [];
  const xml = texto(archivos[nombre]);

  const matriz: Celda[][] = [];
  for (const fila of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas: Celda[] = [];
    for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)\d+"/);
      if (!ref) continue;
      const tipo = c[1].match(/\bt="([^"]+)"/)?.[1] ?? "";
      const cuerpo = c[2] ?? "";
      let valor: Celda = null;
      if (tipo === "inlineStr") {
        let s = "";
        for (const t of cuerpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
        valor = decodificar(s);
      } else {
        const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v !== undefined) {
          if (tipo === "s") valor = compartidas[Number(v)] ?? "";
          else if (tipo === "str" || tipo === "e") valor = decodificar(v);
          else if (tipo === "b") valor = v === "1";
          else {
            const n = Number(v);
            valor = Number.isFinite(n) ? n : decodificar(v);
          }
        }
      }
      celdas[indiceColumna(ref[1])] = valor;
    }
    matriz.push(Array.from(celdas, (x) => x ?? null));
  }

  return matriz;
}

/** El número de hojas de un .xlsx. */
export function cuantasHojas(archivos: Record<string, Uint8Array>): number {
  return Object.keys(archivos).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length;
}

/**
 * Convierte una matriz en una hoja con encabezados. Sin `encabezado`, el
 * encabezado es la primera fila con contenido; con él, la primera fila cuya
 * primera celda, normalizada, es ese texto (los reportes de nómina y de uso de
 * aulas traen un título y una cabecera antes de la tabla).
 */
export function aHoja(matriz: Celda[][], encabezado?: string): Hoja {
  const lleno = (f: Celda[]) => f.some((x) => x !== null && String(x).trim() !== "");
  const inicio = encabezado ? matriz.findIndex((f) => lleno(f) && normalizarColumna(String(f[0] ?? "")) === normalizarColumna(encabezado)) : matriz.findIndex(lleno);
  if (inicio < 0) {
    if (encabezado) throw new Error(`No se encontró el encabezado «${encabezado}» en el archivo: el reporte cambió de forma.`);
    return { columnas: [], originales: [], filas: [] };
  }

  const originales = matriz[inicio].map((x) => String(x ?? "").trim());
  const columnas = normalizarEncabezados(originales.map((o, i) => o || `columna_${i + 1}`));
  const filas: Fila[] = [];
  for (const f of matriz.slice(inicio + 1)) {
    if (!f.some((x) => x !== null && String(x).trim() !== "")) continue;
    const fila: Fila = {};
    columnas.forEach((c, i) => {
      const x = f[i] ?? null;
      fila[c] = typeof x === "string" ? x.trim() : x;
    });
    filas.push(fila);
  }
  return { columnas, originales, filas };
}

/** Parte una lista en lotes (la base recibe hasta 2000 filas por llamada). */
export function enLotes<T>(lista: T[], tamano = 1000): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

/** SHA-256 en hexadecimal (Web Crypto: navegador, Deno y Node 20). */
export async function huellaSha256(bytes: Uint8Array): Promise<string> {
  const copia = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copia);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Huella del CONTENIDO (SHA-256 de encabezados y filas), no del archivo: dos
 * descargas del mismo reporte traen el mismo contenido pero bytes distintos
 * (el .xlsx lleva la hora de creación), y no deben contar como dos versiones.
 */
export async function huellaContenido(hoja: Hoja): Promise<string> {
  return huellaSha256(new TextEncoder().encode(JSON.stringify([hoja.columnas, hoja.filas])));
}

/** El periodo es «2026b»: año y letra a (primer semestre) o b (segundo). */
export function periodoValido(periodo: string): boolean {
  return /^[0-9]{4}[ab]$/.test(periodo);
}

/** Lo que el servidor de Master devuelve en `msg` cuando el reporte es un Excel: un zip en base64 («UEsDB…»). */
export function esExcelBase64(msg: unknown): msg is string {
  return typeof msg === "string" && msg.startsWith("UEsDB");
}

export function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* --- Lectores de formas especiales -------------------------------------------------------- */

/**
 * «Porcentaje de uso de aulas» (Galileo): un libro con una hoja por semana. Cada hoja trae un
 * bloque con la semana y sus fechas, y debajo la tabla «Nombre Aula, Nombre Corto, % Total de
 * uso, % de uso Lunes…». Se aplana en una sola tabla con `semana`, `inicio` y `fin` en cada fila.
 */
export function leerUsoAulas(archivos: Record<string, Uint8Array>): Hoja {
  const total = cuantasHojas(archivos);
  const columnas = ["semana", "inicio", "fin"];
  const originales = ["Semana", "Inicio", "Fin"];
  const filas: Fila[] = [];
  for (let i = 0; i < total; i++) {
    const m = matrizDeHoja(archivos, i);
    const valorDe = (rotulo: string) => {
      const f = m.find((x) => normalizarColumna(String(x[0] ?? "")) === rotulo);
      return f ? f[1] ?? null : null;
    };
    const semana = valorDe("semana");
    if (semana === null) continue; // una hoja sin bloque de semana no es de uso de aulas
    const t = aHoja(m.slice(Math.max(0, m.findIndex((f) => normalizarColumna(String(f[0] ?? "")) === "nombre_aula"))), "nombre_aula");
    if (i === 0 || columnas.length === 3) {
      for (let k = 0; k < t.columnas.length; k++) {
        columnas.push(t.columnas[k]);
        originales.push(t.originales[k]);
      }
    }
    for (const f of t.filas) filas.push({ semana, inicio: valorDe("inicio"), fin: valorDe("fin"), ...f });
  }
  if (filas.length === 0) throw new Error("El archivo no trae hojas de uso de aulas.");
  return { columnas, originales, filas };
}

/**
 * Lo que devuelven los catálogos de la API: `msg` es una lista de objetos, una lista de textos, un
 * objeto {clave: texto} o un objeto con una lista adentro (`contracts`). Se aplana a una tabla; lo que
 * es un objeto o una lista anidada queda como texto JSON, para no perderlo ni inventar columnas.
 */
export function aplanarJson(msg: unknown): Hoja {
  let lista: unknown[];
  if (Array.isArray(msg)) lista = msg;
  else if (msg && typeof msg === "object") {
    const o = msg as Record<string, unknown>;
    const arreglos = Object.entries(o).filter(([, v]) => Array.isArray(v) && v.length > 0);
    if (arreglos.length === 1) lista = arreglos[0][1] as unknown[];
    else if (arreglos.length > 1) lista = arreglos.flatMap(([k, v]) => (v as unknown[]).map((x) => (x && typeof x === "object" ? { grupo: k, ...(x as object) } : { grupo: k, valor: x })));
    else lista = Object.entries(o).map(([clave, valor]) => ({ clave, valor }));
  } else throw new Error("La respuesta de la plataforma no trae una lista.");
  if (lista.length === 0) throw new Error("La respuesta de la plataforma vino vacía.");

  const filas: Fila[] = [];
  const orden: string[] = [];
  for (const item of lista) {
    const base = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : { valor: item };
    const fila: Fila = {};
    for (const [k, v] of Object.entries(base)) {
      const nombre = normalizarColumna(k);
      if (!orden.includes(nombre)) orden.push(nombre);
      fila[nombre] = v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
    }
    filas.push(fila);
  }
  for (const f of filas) for (const c of orden) if (!(c in f)) f[c] = null;
  return { columnas: orden, originales: orden, filas };
}

/** Cómo se lee lo que entrega cada reporte. */
export type Lector = "hoja" | `encabezado:${string}` | "uso-aulas" | "json";

/** Lee un .xlsx ya descomprimido según el lector del reporte. */
export function leerSegun(lector: Lector, archivos: Record<string, Uint8Array>): Hoja {
  if (lector === "uso-aulas") return leerUsoAulas(archivos);
  if (lector.startsWith("encabezado:")) return leerXlsx(archivos, { encabezado: lector.slice("encabezado:".length) });
  return leerXlsx(archivos);
}
