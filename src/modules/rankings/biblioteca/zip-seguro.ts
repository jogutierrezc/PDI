/* =============================================================================
   Biblioteca de evidencias · leer un ZIP de hasta 500 MB sin cargarlo entero.

   No se usa el «Unzip» en flujo de fflate de punta a punta: un ZIP trae al
   final su directorio central (la lista de archivos, con tamaños, banderas y
   dónde empieza cada uno). Se leen solo esos bytes del final con File.slice,
   y luego cada archivo por separado (otro slice) con el Inflate en flujo de
   fflate. Así nunca hay más de un archivo en memoria, y se puede reintentar o
   reanudar uno sin releer el resto.

   Seguridad (zip-slip y compañía), en `revisarEntrada`:
     · la ruta se normaliza (barras, «.», nombres vacíos); una ruta absoluta,
       con unidad («C:») o con «..» se rechaza;
     · __MACOSX, .DS_Store, Thumbs.db y los ocultos («.algo») se omiten;
     · un ZIP dentro del ZIP (o 7z, rar…) se rechaza con mensaje claro;
     · un archivo cifrado se rechaza: el navegador no tiene la contraseña;
     · tope de archivos por ZIP y tope por archivo (el del bucket).

   Las funciones de aquí son puras salvo `leerDirectorio` y `extraerEntrada`,
   que reciben un Blob (File) y no tocan la red.
   ========================================================================== */

import { Inflate } from "fflate";

/** 500 MB: lo más grande que acepta la pantalla. */
export const LIMITE_ZIP = 500 * 1024 * 1024;
/** Tope de archivos por ZIP. */
export const LIMITE_ARCHIVOS = 5000;
/**
 * Tope por archivo: el del bucket «ranking-biblioteca» (0152). 50 MB es también
 * el límite global por defecto de Supabase Storage; si el del proyecto es
 * menor, manda ese (se configura fuera del código).
 */
export const LIMITE_ARCHIVO = 50 * 1024 * 1024;

const OMITIR_CARPETA = new Set(["__macosx", ".git", ".svn", "node_modules", "$recycle.bin"]);
const OMITIR_ARCHIVO = new Set([".ds_store", "thumbs.db", "desktop.ini", "icon\r"]);
const COMPRIMIDOS = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zipx", "cab", "iso"]);

/** Una entrada del directorio central. */
export interface EntradaZip {
  /** Ruta tal como viene en el ZIP (ya decodificada). */
  nombreCrudo: string;
  esCarpeta: boolean;
  cifrado: boolean;
  /** 0 = sin comprimir, 8 = deflate. Otros métodos no se pueden leer. */
  metodo: number;
  comprimido: number;
  tamano: number;
  /** Dónde empieza su cabecera local. */
  desplazamiento: number;
}

export type MotivoDescarte = "oculto" | "carpeta" | "ruta" | "anidado" | "cifrado" | "metodo" | "grande" | "vacio" | "tope";

/** Lo que se decide de una entrada antes de subir nada. */
export interface ArchivoZip {
  entrada: EntradaZip;
  /** Ruta normalizada («Informes/ODS 5/acta.pdf»); vacía si se rechazó por ruta. */
  ruta: string;
  nombre: string;
  carpeta: string;
  ext: string;
  /** Nulo si se guarda; si no, por qué no. */
  descarte: MotivoDescarte | null;
  aviso: string | null;
}

/* ---------- Rutas ---------------------------------------------------------- */

/**
 * Normaliza una ruta de ZIP. Devuelve null si es peligrosa (absoluta, con
 * unidad o que sube con «..»). Las barras invertidas cuentan como separador.
 */
export function normalizarRuta(cruda: string): string | null {
  const t = cruda.replace(/\\/g, "/").replace(/\0/g, "");
  if (!t.trim()) return null;
  if (t.startsWith("/") || /^[a-zA-Z]:/.test(t) || t.startsWith("//")) return null;
  const partes: string[] = [];
  for (const p of t.split("/")) {
    const s = p.trim();
    if (s === "" || s === ".") continue;
    if (s === "..") return null;
    partes.push(s);
  }
  return partes.length ? partes.join("/") : null;
}

export function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nombre);
  return m ? m[1].toLowerCase() : "";
}

/** ¿Es basura del sistema u oculto? (__MACOSX/…, .DS_Store, «.algo», «~$doc.docx»). */
export function esOculto(ruta: string): boolean {
  const partes = ruta.split("/");
  const nombre = partes[partes.length - 1].toLowerCase();
  if (partes.slice(0, -1).some((c) => OMITIR_CARPETA.has(c.toLowerCase()) || c.startsWith("."))) return true;
  return OMITIR_ARCHIVO.has(nombre) || nombre.startsWith(".") || nombre.startsWith("~$") || nombre.startsWith("._");
}

/** Decide qué hacer con cada entrada. `n` cuenta los archivos ya admitidos. */
export function revisarEntrada(e: EntradaZip, admitidos: number): ArchivoZip {
  const ruta = normalizarRuta(e.nombreCrudo);
  const base = (motivo: MotivoDescarte | null, aviso: string | null, r = ruta ?? ""): ArchivoZip => {
    const partes = r.split("/");
    const nombre = partes[partes.length - 1] ?? "";
    return { entrada: e, ruta: r, nombre, carpeta: partes.slice(0, -1).join("/"), ext: extensionDe(nombre), descarte: motivo, aviso };
  };
  if (e.esCarpeta) return base("carpeta", null);
  if (ruta === null) return base("ruta", `Ruta insegura «${e.nombreCrudo}»: se rechaza (absoluta o con «..»).`, "");
  if (esOculto(ruta)) return base("oculto", null);
  const ext = extensionDe(ruta);
  if (COMPRIMIDOS.has(ext)) return base("anidado", `«${ruta}» es otro archivo comprimido (.${ext}): descomprímalo y súbalo aparte.`);
  if (e.cifrado) return base("cifrado", `«${ruta}» está cifrado con contraseña: no se puede leer en el navegador.`);
  if (e.metodo !== 0 && e.metodo !== 8) return base("metodo", `«${ruta}» usa un tipo de compresión que no se puede leer (método ${e.metodo}).`);
  if (e.tamano === 0) return base("vacio", `«${ruta}» está vacío.`);
  if (e.tamano > LIMITE_ARCHIVO) return base("grande", `«${ruta}» pesa ${mb(e.tamano)}; el máximo por archivo es ${mb(LIMITE_ARCHIVO)}.`);
  if (admitidos >= LIMITE_ARCHIVOS) return base("tope", `Se pasó el tope de ${LIMITE_ARCHIVOS} archivos por ZIP: «${ruta}» queda fuera.`);
  return base(null, null);
}

/** Revisa todas las entradas en orden y aplica el tope de archivos. */
export function revisarEntradas(entradas: EntradaZip[]): ArchivoZip[] {
  let admitidos = 0;
  return entradas.map((e) => {
    const a = revisarEntrada(e, admitidos);
    if (!a.descarte) admitidos++;
    return a;
  });
}

export function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "").replace(".", ",")} MB`;
}

/* ---------- Árbol previo ------------------------------------------------------ */

export interface NodoArbol {
  nombre: string;
  ruta: string;
  archivos: number;
  bytes: number;
  /** Archivos que no se subirán (anidados, cifrados, muy grandes…). */
  alertas: number;
  hijos: NodoArbol[];
}

/** Árbol de carpetas con conteos y tamaños de lo que sí se guarda, y alertas de lo que no. */
export function construirArbol(archivos: ArchivoZip[]): NodoArbol {
  const raiz: NodoArbol = { nombre: "", ruta: "", archivos: 0, bytes: 0, alertas: 0, hijos: [] };
  for (const a of archivos) {
    if (a.descarte === "carpeta" || a.descarte === "oculto" || !a.ruta) continue;
    const partes = a.carpeta ? a.carpeta.split("/") : [];
    const camino = [raiz];
    let nodo = raiz;
    for (let i = 0; i < partes.length; i++) {
      let hijo = nodo.hijos.find((h) => h.nombre === partes[i]);
      if (!hijo) {
        hijo = { nombre: partes[i], ruta: partes.slice(0, i + 1).join("/"), archivos: 0, bytes: 0, alertas: 0, hijos: [] };
        nodo.hijos.push(hijo);
      }
      nodo = hijo;
      camino.push(hijo);
    }
    for (const n of camino) {
      if (a.descarte) n.alertas++;
      else {
        n.archivos++;
        n.bytes += a.entrada.tamano;
      }
    }
  }
  const ordenar = (n: NodoArbol) => {
    n.hijos.sort((x, y) => x.nombre.localeCompare(y.nombre, "es", { numeric: true }));
    n.hijos.forEach(ordenar);
  };
  ordenar(raiz);
  return raiz;
}

export interface ResumenZip {
  guardar: number;
  bytes: number;
  omitidos: number;
  rechazados: number;
  avisos: string[];
}

export function resumirZip(archivos: ArchivoZip[]): ResumenZip {
  const r: ResumenZip = { guardar: 0, bytes: 0, omitidos: 0, rechazados: 0, avisos: [] };
  for (const a of archivos) {
    if (a.descarte === "carpeta") continue;
    if (!a.descarte) {
      r.guardar++;
      r.bytes += a.entrada.tamano;
    } else if (a.descarte === "oculto") r.omitidos++;
    else {
      r.rechazados++;
      if (a.aviso) r.avisos.push(a.aviso);
    }
  }
  return r;
}

/* ---------- Nombres (CP437 cuando el ZIP no marca UTF-8) --------------------- */

// Mitad alta de CP437/CP850 para lo que más sale en español; lo demás, «_».
const CP437: Record<number, string> = {
  0x80: "Ç", 0x81: "ü", 0x82: "é", 0x83: "â", 0x84: "ä", 0x85: "à", 0x87: "ç", 0x88: "ê", 0x89: "ë", 0x8a: "è",
  0x8b: "ï", 0x8c: "î", 0x8d: "ì", 0x8e: "Ä", 0x90: "É", 0x93: "ô", 0x94: "ö", 0x95: "ò", 0x96: "û", 0x97: "ù",
  0x99: "Ö", 0x9a: "Ü", 0xa0: "á", 0xa1: "í", 0xa2: "ó", 0xa3: "ú", 0xa4: "ñ", 0xa5: "Ñ", 0xa6: "ª", 0xa7: "º",
  0xa8: "¿", 0xad: "¡", 0xb5: "Á", 0xd6: "Í", 0xe0: "Ó", 0xe9: "Ú", 0xb7: "À", 0xd2: "Ê", 0xd4: "È",
};

export function decodificarNombre(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder("utf-8").decode(bytes);
  try {
    // Muchos programas escriben UTF-8 sin marcar la bandera.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let s = "";
    for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : (CP437[b] ?? "_");
    return s;
  }
}

/* ---------- Directorio central ---------------------------------------------- */

const u16 = (d: DataView, o: number) => d.getUint16(o, true);
const u32 = (d: DataView, o: number) => d.getUint32(o, true);
const u64 = (d: DataView, o: number) => Number(d.getBigUint64(o, true));

/** Posición del fin del directorio central (EOCD) dentro de `cola`, o -1. */
export function buscarFinDirectorio(cola: Uint8Array): number {
  for (let i = cola.length - 22; i >= 0; i--) {
    if (cola[i] === 0x50 && cola[i + 1] === 0x4b && cola[i + 2] === 0x05 && cola[i + 3] === 0x06) return i;
  }
  return -1;
}

export class ZipInvalido extends Error {}

/** Interpreta los bytes del directorio central. Puro: lo usan `leerDirectorio` y las pruebas. */
export function interpretarDirectorio(cd: Uint8Array, total: number): EntradaZip[] {
  const d = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const salida: EntradaZip[] = [];
  let o = 0;
  for (let i = 0; i < total; i++) {
    if (o + 46 > cd.length || u32(d, o) !== 0x02014b50) throw new ZipInvalido("El índice del ZIP está dañado.");
    const bandera = u16(d, o + 8);
    const metodo = u16(d, o + 10);
    let comprimido = u32(d, o + 20);
    let tamano = u32(d, o + 24);
    const ln = u16(d, o + 28);
    const lx = u16(d, o + 30);
    const lc = u16(d, o + 32);
    let desplazamiento = u32(d, o + 42);
    const nombreBytes = cd.subarray(o + 46, o + 46 + ln);
    let nombre = decodificarNombre(nombreBytes, (bandera & 0x800) !== 0);
    // Campos extra: ZIP64 (0x0001) y ruta Unicode de Info-ZIP (0x7075).
    let x = o + 46 + ln;
    const finX = x + lx;
    while (x + 4 <= finX) {
      const id = u16(d, x);
      const tam = u16(d, x + 2);
      let p = x + 4;
      if (id === 0x0001) {
        if (tamano === 0xffffffff && p + 8 <= x + 4 + tam) (tamano = u64(d, p)), (p += 8);
        if (comprimido === 0xffffffff && p + 8 <= x + 4 + tam) (comprimido = u64(d, p)), (p += 8);
        if (desplazamiento === 0xffffffff && p + 8 <= x + 4 + tam) desplazamiento = u64(d, p);
      } else if (id === 0x7075 && tam > 5) {
        nombre = new TextDecoder("utf-8").decode(cd.subarray(x + 9, x + 4 + tam));
      }
      x += 4 + tam;
    }
    salida.push({
      nombreCrudo: nombre,
      esCarpeta: nombre.endsWith("/") || nombre.endsWith("\\"),
      cifrado: (bandera & 0x1) !== 0,
      metodo,
      comprimido,
      tamano,
      desplazamiento,
    });
    o += 46 + ln + lx + lc;
  }
  return salida;
}

const bytesDe = async (b: Blob): Promise<Uint8Array> => new Uint8Array(await b.arrayBuffer());

/** Lee solo el índice del ZIP (unos KB del final), sin cargar el archivo. */
export async function leerDirectorio(zip: Blob): Promise<EntradaZip[]> {
  if (zip.size < 22) throw new ZipInvalido("El archivo no es un ZIP.");
  const cola = await bytesDe(zip.slice(Math.max(0, zip.size - 65_557)));
  const fin = buscarFinDirectorio(cola);
  if (fin < 0) throw new ZipInvalido("El archivo no es un ZIP o está incompleto (no tiene índice al final).");
  const d = new DataView(cola.buffer, cola.byteOffset, cola.byteLength);
  let total = u16(d, fin + 10);
  let tamCd = u32(d, fin + 12);
  let inicioCd = u32(d, fin + 16);
  // ZIP64: el localizador va 20 bytes antes del EOCD.
  if ((total === 0xffff || inicioCd === 0xffffffff) && fin >= 20 && u32(d, fin - 20) === 0x07064b50) {
    const pos64 = u64(d, fin - 12);
    const r64 = await bytesDe(zip.slice(pos64, pos64 + 56));
    const d64 = new DataView(r64.buffer, r64.byteOffset, r64.byteLength);
    if (u32(d64, 0) !== 0x06064b50) throw new ZipInvalido("El índice ZIP64 está dañado.");
    total = u64(d64, 32);
    tamCd = u64(d64, 40);
    inicioCd = u64(d64, 48);
  }
  if (inicioCd + tamCd > zip.size) throw new ZipInvalido("El ZIP está incompleto: el índice apunta fuera del archivo.");
  return interpretarDirectorio(await bytesDe(zip.slice(inicioCd, inicioCd + tamCd)), total);
}

/**
 * Extrae un archivo: lee su cabecera local y descomprime en flujo (Inflate de
 * fflate) por trozos de 1 MB, con tope de tamaño. Devuelve los bytes del archivo.
 */
export async function extraerEntrada(zip: Blob, e: EntradaZip, signal?: AbortSignal): Promise<Uint8Array> {
  const cab = await bytesDe(zip.slice(e.desplazamiento, e.desplazamiento + 30));
  const d = new DataView(cab.buffer, cab.byteOffset, cab.byteLength);
  if (cab.length < 30 || u32(d, 0) !== 0x04034b50) throw new ZipInvalido("La cabecera del archivo dentro del ZIP está dañada.");
  const inicio = e.desplazamiento + 30 + u16(d, 26) + u16(d, 28);
  const datos = zip.slice(inicio, inicio + e.comprimido);
  if (e.metodo === 0) return bytesDe(datos);

  const salida = new Uint8Array(e.tamano);
  let escrito = 0;
  let error: Error | null = null;
  const inflar = new Inflate((trozo) => {
    if (escrito + trozo.length > salida.length) {
      error = new ZipInvalido("El archivo descomprimido es más grande de lo que dice el ZIP (posible bomba ZIP).");
      return;
    }
    salida.set(trozo, escrito);
    escrito += trozo.length;
  });
  const PASO = 1024 * 1024;
  for (let o = 0; o < datos.size; o += PASO) {
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    inflar.push(await bytesDe(datos.slice(o, o + PASO)), o + PASO >= datos.size);
    if (error) throw error;
  }
  if (datos.size === 0) inflar.push(new Uint8Array(0), true);
  if (escrito !== e.tamano) throw new ZipInvalido("El archivo dentro del ZIP está incompleto.");
  return salida;
}

/** SHA-256 en hexadecimal (crypto.subtle). */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
