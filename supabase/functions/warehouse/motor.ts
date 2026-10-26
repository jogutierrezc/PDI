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
  /**
   * El periodo que el propio archivo dice tener (en el título, el nombre de la hoja…), si el reporte lo trae.
   * No entra en la huella ni se guarda: sirve para comprobar que el archivo es del periodo pedido.
   */
  periodoArchivo?: string | null;
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
export function leerXlsx(archivos: Record<string, Uint8Array>, opciones: { hoja?: number; encabezado?: string; minCeldas?: number } = {}): Hoja {
  return aHoja(matrizDeHoja(archivos, opciones.hoja ?? 0), opciones.encabezado, opciones.minCeldas);
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
export function aHoja(matriz: Celda[][], encabezado?: string, minCeldas = 1): Hoja {
  const lleno = (f: Celda[]) => f.some((x) => x !== null && String(x).trim() !== "");
  const llenas = (f: Celda[]) => f.filter((x) => x !== null && String(x).trim() !== "").length;
  // Con `minCeldas` (reportes con títulos de varias filas) el encabezado es la primera fila con al menos ese número de
  // celdas con contenido: los títulos ocupan una sola. Si ninguna alcanza, la primera fila con contenido, como siempre.
  let inicio = encabezado
    ? matriz.findIndex((f) => lleno(f) && normalizarColumna(String(f[0] ?? "")) === normalizarColumna(encabezado))
    : minCeldas > 1
      ? matriz.findIndex((f) => llenas(f) >= minCeldas)
      : matriz.findIndex(lleno);
  if (inicio < 0 && !encabezado && minCeldas > 1) inicio = matriz.findIndex(lleno);
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

/** Los nombres de las hojas de un .xlsx, en el orden de sus archivos (el mismo de `matrizDeHoja`). */
export function nombresDeHojas(archivos: Record<string, Uint8Array>): string[] {
  const libro = archivos["xl/workbook.xml"] ? texto(archivos["xl/workbook.xml"]) : "";
  const relaciones = archivos["xl/_rels/workbook.xml.rels"] ? texto(archivos["xl/_rels/workbook.xml.rels"]) : "";
  const destino = new Map<string, string>();
  for (const r of relaciones.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = r[1].match(/\bId="([^"]*)"/)?.[1];
    const objetivo = r[1].match(/\bTarget="([^"]*)"/)?.[1];
    if (id && objetivo) destino.set(id, objetivo);
  }
  const hojas: { numero: number; nombre: string }[] = [];
  for (const h of libro.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const nombre = h[1].match(/\bname="([^"]*)"/)?.[1];
    const rid = h[1].match(/\br:id="([^"]*)"/)?.[1];
    const numero = Number((rid ? (destino.get(rid) ?? "") : "").match(/sheet(\d+)\.xml/)?.[1]);
    if (nombre !== undefined && Number.isFinite(numero)) hojas.push({ numero, nombre: decodificar(nombre) });
  }
  return hojas.sort((a, b) => a.numero - b.numero).map((h) => h.nombre);
}

/** Los periodos («2026b») que nombra un texto, en minúscula y sin repetir. */
export function periodosEnTexto(textoLibre: unknown): string[] {
  const vistos = new Set<string>();
  for (const m of String(textoLibre ?? "").matchAll(/\b(20\d{2})([ab])\b/gi)) vistos.add(`${m[1]}${m[2].toLowerCase()}`);
  return [...vistos];
}

/**
 * El periodo que el archivo dice tener: en el nombre de sus hojas o en las primeras filas (títulos que arma la
 * plataforma, como «REPORTE CONSOLIDADO DE NÓMINA 2026B» o «PERIODO 2026B»). null si no dice ninguno o dice varios.
 * No sirve con reportes cuyo título es el que se envió en la petición: ese texto es eco, no confirmación.
 */
export function periodoDelArchivo(archivos: Record<string, Uint8Array>): string | null {
  const vistos = new Set<string>();
  for (const n of nombresDeHojas(archivos)) periodosEnTexto(n).forEach((p) => vistos.add(p));
  try {
    // Solo las filas de título (una o dos celdas): una fila de datos puede traer un periodo que no es el del archivo.
    for (const f of matrizDeHoja(archivos, 0).slice(0, 6)) {
      if (f.filter((c) => c !== null && String(c).trim() !== "").length > 2) continue;
      for (const c of f) if (typeof c === "string") periodosEnTexto(c).forEach((p) => vistos.add(p));
    }
  } catch {
    // Sin hojas legibles: ya lo dirá el lector.
  }
  return vistos.size === 1 ? [...vistos][0] : null;
}

/** La última columna que es un periodo («2026b»): hasta dónde llega un histórico. */
export function ultimoPeriodoDe(hoja: Hoja): string | null {
  const periodos = hoja.columnas.filter((c) => /^20\d{2}[ab]$/.test(c)).sort();
  return periodos.length ? periodos[periodos.length - 1] : null;
}

/**
 * «Consolidado general de aspirantes» (Master): un libro con una hoja por tipo de aspirante («001 - NUEVO NACIONAL
 * (PREGRADO)»…) más «CONSOLIDADO POR TIPO» y «CONSOLIDADO POR PROGRAMA». Cada hoja trae títulos, la cabecera en la
 * tercera fila, una fila por programa (o por tipo) con celdas «N/M» (aspirantes ahora / histórico) y, al final, filas de
 * totales y un recuadro de convenciones. Se aplana en una sola tabla: `ambito` (detalle, consolidado_tipo,
 * consolidado_programa), `tipo`, `codigo`, `programa` y, por cada estado, `{estado}_actual` y `{estado}_historico`.
 * Los totales se saltan (se suman de las filas). Son conteos: ningún dato de personas.
 */
export function leerAspirantes(archivos: Record<string, Uint8Array>): Hoja {
  const columnas = ["ambito", "tipo", "codigo", "programa"];
  const originales = ["Ámbito", "Tipo de aspirante", "Código", "Programa"];
  const filas: Fila[] = [];
  const txt = (x: Celda | undefined) => String(x ?? "").trim();
  const llenas = (f: Celda[]) => f.filter((x) => x !== null && txt(x) !== "").length;
  const par = (x: Celda | undefined): [number | null, number | null] => {
    const m = txt(x).match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return [Number(m[1]), Number(m[2])];
    const n = typeof x === "number" ? x : txt(x) !== "" && Number.isFinite(Number(txt(x))) ? Number(txt(x)) : null;
    return [n, null];
  };
  for (let i = 0; i < cuantasHojas(archivos); i++) {
    const m = matrizDeHoja(archivos, i);
    const h = m.findIndex((f) => llenas(f) >= 5);
    if (h < 0) continue;
    const titulo = txt(m.slice(0, h).flat().find((x) => x !== null && txt(x) !== ""));
    const detalle = normalizarColumna(txt(m[h][0])) === "codigo";
    const ambito = detalle ? "detalle" : normalizarColumna(titulo).includes("tipo") ? "consolidado_tipo" : "consolidado_programa";
    const primera = detalle ? 2 : 1;
    const estados = m[h].map((x, k) => ({ k, nombre: normalizarColumna(txt(x)), original: txt(x) })).filter((c) => c.k >= primera && c.original !== "");
    for (const e of estados) {
      for (const [sufijo, rotulo] of [["actual", "actual"], ["historico", "histórico"]] as const) {
        const nombre = `${e.nombre}_${sufijo}`;
        if (!columnas.includes(nombre)) {
          columnas.push(nombre);
          originales.push(`${e.original} (${rotulo})`);
        }
      }
    }
    for (const r of m.slice(h + 1)) {
      if (llenas(r) === 0) continue;
      const primero = normalizarColumna(txt(r[0]));
      if (primero === "convenciones") break;
      if ((detalle ? normalizarColumna(txt(r[1])) : primero).startsWith("totales")) continue;
      const fila: Fila = {
        ambito,
        tipo: detalle ? titulo : ambito === "consolidado_tipo" ? txt(r[0]) : null,
        codigo: detalle ? txt(r[0]) || null : null,
        programa: detalle ? txt(r[1]) || null : ambito === "consolidado_programa" ? txt(r[0]) : null,
      };
      for (const e of estados) {
        const [actual, historico] = par(r[e.k]);
        fila[`${e.nombre}_actual`] = actual;
        fila[`${e.nombre}_historico`] = historico;
      }
      filas.push(fila);
    }
  }
  if (filas.length === 0) throw new Error("El archivo no trae hojas de aspirantes: el reporte cambió de forma.");
  for (const f of filas) for (const c of columnas) if (!(c in f)) f[c] = null;
  return { columnas, originales, filas };
}

/**
 * «Histórico de deserciones» (Davinci): la hoja «Histórico de deserciones» trae Estudiante (el código), Programa,
 * Periodo (de ingreso), PFP, Modalidad y una columna por periodo (2014a…) con el estado de ese periodo (MP, MAT, AUS,
 * DES, GRAD, DP, PFP o «-»); la hoja «Convenciones» solo explica esas siglas y no se guarda.
 */
export function leerDesercion(archivos: Record<string, Uint8Array>): Hoja {
  const h = leerXlsx(archivos, { minCeldas: 3 });
  if (h.columnas[0] !== "estudiante" || !h.columnas.some((c) => /^20\d{2}[ab]$/.test(c))) {
    throw new Error("El histórico de deserciones cambió de forma: se esperaba «Estudiante» y una columna por periodo.");
  }
  return h;
}

/**
 * Cómo se lee lo que entrega cada reporte. `tabla` salta los títulos de varias filas (el encabezado es la primera fila
 * con tres celdas llenas o más); `hoja` toma la primera fila con contenido.
 */
export type Lector = "hoja" | "tabla" | `encabezado:${string}` | "uso-aulas" | "json" | "aspirantes" | "desercion";

/** Lee un .xlsx ya descomprimido según el lector del reporte. */
export function leerSegun(lector: Lector, archivos: Record<string, Uint8Array>): Hoja {
  if (lector === "uso-aulas") return leerUsoAulas(archivos);
  if (lector === "aspirantes") return leerAspirantes(archivos);
  if (lector === "desercion") return leerDesercion(archivos);
  if (lector === "tabla") return leerXlsx(archivos, { minCeldas: 3 });
  if (lector.startsWith("encabezado:")) return leerXlsx(archivos, { encabezado: lector.slice("encabezado:".length) });
  return leerXlsx(archivos);
}

/** Cuántos lotes de filas viajan a la vez a la base. Más no acelera: la base escribe en fila y la red tiene tope. */
export const LOTES_EN_PARALELO = 4;
/** Filas por llamada: el máximo que acepta wh_agregar_filas. Menos viajes, igual trabajo en la base. */
export const FILAS_POR_LOTE = 2000;

/**
 * Corre `tarea` sobre cada lote, de a `paralelo` a la vez, y se detiene en el primer error (los lotes
 * que ya salieron terminan; no sale ninguno nuevo). Devuelve cuántos terminaron.
 */
export async function enParalelo<T>(lotes: T[], tarea: (lote: T, indice: number) => Promise<void>, paralelo = LOTES_EN_PARALELO): Promise<number> {
  let siguiente = 0;
  let hechos = 0;
  let fallo: unknown = null;
  await Promise.all(
    Array.from({ length: Math.min(paralelo, lotes.length) }, async () => {
      while (fallo === null && siguiente < lotes.length) {
        const i = siguiente++;
        try {
          await tarea(lotes[i], i);
          hechos++;
        } catch (e) {
          fallo = e ?? new Error("falló un lote");
        }
      }
    }),
  );
  if (fallo !== null) throw fallo;
  return hechos;
}

/**
 * Deja en cada fila solo lo que la política permite ANTES de enviarla. La base lo vuelve a aplicar (es
 * quien manda), pero así lo descartado —documento, dirección, salud— ni siquiera sale del navegador, y se
 * envía menos.
 */
export function recortarPorPolitica(filas: Fila[], politica: { modo: "permitir" | "excluir"; lista: string[] }): Fila[] {
  const lista = new Set(politica.lista);
  return filas.map((f) => {
    const salida: Fila = {};
    for (const [k, v] of Object.entries(f)) if (politica.modo === "permitir" ? lista.has(k) : !lista.has(k)) salida[k] = v;
    return salida;
  });
}

/* --- Columnas derivadas (no identifican a nadie) --------------------------------------------- */

/** Fecha de un Excel: «2001-04-09», «09/04/2001», «09-04-2001» o el número de serie de Excel. */
export function leerFecha(valor: unknown): Date | null {
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 1 && valor < 80_000) return new Date(Date.UTC(1899, 11, 30) + valor * 86_400_000);
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

/** Cuándo empieza el periodo (1 de febrero el «a», 1 de agosto el «b»): la edad se cuenta a esa fecha. */
const inicioDePeriodo = (periodo: string) => new Date(Date.UTC(+periodo.slice(0, 4), periodo.endsWith("a") ? 1 : 7, 1));

/** El grupo etario del estudio UDES (referencia: menores de 20; 21–25 y 26 o más tienen más riesgo de desertar). */
export function grupoEtario(nacimiento: unknown, periodo: string): "≤20" | "21–25" | "26+" | null {
  const f = leerFecha(nacimiento);
  if (!f || !periodoValido(periodo)) return null;
  const inicio = inicioDePeriodo(periodo);
  let edad = inicio.getUTCFullYear() - f.getUTCFullYear();
  if (inicio.getUTCMonth() < f.getUTCMonth() || (inicio.getUTCMonth() === f.getUTCMonth() && inicio.getUTCDate() < f.getUTCDate())) edad--;
  if (edad < 14 || edad > 90) return null; // un dato mal digitado no es un grupo
  return edad <= 20 ? "≤20" : edad <= 25 ? "21–25" : "26+";
}

/** ¿Viene de Santander? Con el departamento de la ficha. Vacío = desconocido. */
export function origenDe(departamento: unknown): "Santander" | "Otro departamento" | null {
  if (typeof departamento !== "string" || !departamento.trim()) return null;
  return normalizarColumna(departamento) === "santander" ? "Santander" : "Otro departamento";
}

/** Los conjuntos que traen la ficha del estudiante (36 columnas) y de los que se derivan el grupo etario y el origen. */
export const CONJUNTOS_CON_FICHA = ["dv_matric", "ms_nuevos", "ms_activos"];

/**
 * Añade a «Estudiantes matriculados» (y a los nuevos matriculados y los activos de Master, que traen la misma ficha)
 * el grupo etario y el origen, calculados con la fecha de nacimiento y el departamento ANTES de que la política los
 * descarte. Las dos columnas nuevas no permiten saber quién es. Cualquier otro conjunto pasa igual.
 */
export function derivarColumnas(conjunto: string, hoja: Hoja, periodo: string): Hoja {
  if (!CONJUNTOS_CON_FICHA.includes(conjunto) || !hoja.columnas.includes("fecha_nac")) return hoja;
  const columnas = [...hoja.columnas, "grupo_etario", "origen"];
  return {
    columnas,
    originales: [...hoja.originales, "Grupo etario (derivado)", "Origen (derivado)"],
    filas: hoja.filas.map((f) => ({ ...f, grupo_etario: grupoEtario(f.fecha_nac, periodo), origen: origenDe(f.departamento) })),
  };
}
