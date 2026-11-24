/* =============================================================================
   Pilo at Work · OneDrive y SharePoint (cliente).

   El token de Microsoft vive solo en la función pw-microsoft. Aquí se pide la lista, el
   texto y la subida a esa función.

   SUBIDA (decisión, verificada en la documentación vigente de Microsoft Graph):
     · Subida simple (PUT /content) hasta 1 MiB, por la función (Graph la admite hasta 250 MB,
       pero un JSON en base64 grande cruza mal los proxies, por eso el margen).
     · Más grande: sesión de subida (createUploadSession). La función abre la sesión (con el
       token) y devuelve la `uploadUrl`, que ya viene autenticada y vence sola; los trozos
       salen DIRECTO del navegador a esa URL (sin Authorization, como exige Microsoft), de
       12 × 320 KiB = 3 932 160 bytes (múltiplo de 320 KiB; Microsoft recomienda 5-10 MiB y
       acepta hasta 60 MiB por petición), con Content-Range, 3 reintentos por trozo con espera
       creciente, reanudación consultando nextExpectedRanges, progreso y cancelación (DELETE).
       Si el navegador no puede llegar directo (CORS/red), pasa solo a RELEVO: cada trozo viaja
       por pw-microsoft (acción archivos_trozo).
     · Tope de archivo que ofrece la interfaz: MAX_SUBIDA_MB (100 MB, también el máximo que
       acepta el servidor; la administración puede bajarlo en pw_config.subida_max_mb).
   ========================================================================== */

import { callFn } from "./api";

export const MAX_SUBIDA_MB = 100;
export const TROZO = 12 * 327_680;
export const SIMPLE_MAX = 1024 * 1024;

export interface ItemArchivo {
  id: string;
  nombre: string;
  tamano: number;
  modificado: string;
  carpeta: boolean;
  hijos: number;
  tipo: string;
  url: string;
  drive: string;
  padre: string;
  ruta: string;
}

export const tamanoLegible = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`);

/** Mismas reglas que el servidor: caracteres no permitidos, reservados y longitud. */
export function nombreInvalido(n: string, rutaPadre = ""): string {
  const x = n.trim();
  if (!x) return "Escriba un nombre.";
  if (x.length > 200) return "El nombre es demasiado largo (máximo 200 caracteres).";
  // eslint-disable-next-line no-control-regex
  if (/["*:<>?/\\|\u0000-\u001f]/.test(x)) return "El nombre no puede llevar \" * : < > ? / \\ |.";
  if (/[. ]$/.test(x)) return "El nombre no puede terminar en punto o espacio.";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(x) || /^~\$|^_vti_|^desktop\.ini$/i.test(x)) return "Ese nombre está reservado por Microsoft.";
  if (rutaPadre.length + x.length + 1 > 380) return "La ruta completa quedaría demasiado larga (máximo ~400 caracteres). Elija una carpeta menos profunda.";
  return "";
}

const aBase64 = (b: Blob) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => mal(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(b);
  });
const dormir = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      mal(new Error("Se canceló."));
    });
  });

export interface OpcionesSubida {
  drive: string;
  padre: string;
  nombre: string;
  conflicto?: "rename" | "replace" | "fail";
  maxMb?: number;
  onProgreso?: (fraccion: number) => void;
  signal?: AbortSignal;
}

/** Sube un archivo a OneDrive/SharePoint. Nunca sobrescribe en silencio: «rename» por defecto. */
export async function subirArchivo(blob: Blob, o: OpcionesSubida): Promise<ItemArchivo> {
  const mal = nombreInvalido(o.nombre);
  if (mal) throw new Error(mal);
  const tope = Math.min(o.maxMb ?? MAX_SUBIDA_MB, MAX_SUBIDA_MB);
  if (blob.size <= 0) throw new Error("El archivo está vacío.");
  if (blob.size > tope * 1048576) throw new Error(`El archivo pesa ${tamanoLegible(blob.size)} y el máximo es ${tope} MB.`);
  const conflicto = o.conflicto ?? "rename";
  const base = { drive: o.drive, padre: o.padre, nombre: o.nombre, conflicto };

  if (blob.size <= SIMPLE_MAX) {
    o.onProgreso?.(0.1);
    const r = await callFn<{ item: ItemArchivo }>("pw-microsoft", { action: "archivos_subir_simple", ...base, b64: await aBase64(blob) }, { timeoutMs: 60_000, signal: o.signal });
    o.onProgreso?.(1);
    return r.item;
  }

  const { uploadUrl } = await callFn<{ uploadUrl: string }>("pw-microsoft", { action: "archivos_sesion", ...base, tamano: blob.size }, { signal: o.signal });
  let relevo = false;
  let pos = 0;
  const total = blob.size;
  const cancelar = () => {
    // Limpia lo ya subido en Microsoft (mejor esfuerzo; el relevo no puede llegar a la URL).
    if (!relevo) void fetch(uploadUrl, { method: "DELETE" }).catch(() => undefined);
  };
  o.signal?.addEventListener("abort", cancelar, { once: true });

  /** Un trozo; devuelve el item si era el último. */
  const enviar = async (a: number, b: number): Promise<ItemArchivo | null> => {
    const trozo = blob.slice(a, b + 1);
    if (relevo) {
      const r = await callFn<{ item: ItemArchivo | null }>("pw-microsoft", { action: "archivos_trozo", uploadUrl, desde: a, hasta: b, total, b64: await aBase64(trozo) }, { timeoutMs: 120_000, signal: o.signal });
      return r.item;
    }
    const r = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${a}-${b}/${total}` }, body: trozo, signal: o.signal });
    if (r.status === 202) return null;
    if (r.status === 200 || r.status === 201) {
      const d = (await r.json().catch(() => ({}))) as { id?: string; name?: string; size?: number; webUrl?: string };
      return { id: d.id ?? "", nombre: d.name ?? o.nombre, tamano: d.size ?? total, modificado: new Date().toISOString(), carpeta: false, hijos: 0, tipo: "", url: d.webUrl ?? "", drive: o.drive, padre: o.padre, ruta: "" };
    }
    throw Object.assign(new Error(`Microsoft respondió ${r.status}.`), { status: r.status });
  };
  /** Dónde sigue la subida según Microsoft (para reanudar tras un corte). */
  const siguiente = async (): Promise<number | null> => {
    if (relevo) return null;
    try {
      const r = await fetch(uploadUrl, { signal: o.signal });
      const d = (await r.json()) as { nextExpectedRanges?: string[] };
      const n = Number(String(d.nextExpectedRanges?.[0] ?? "").split("-")[0]);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  let hecho: ItemArchivo | null = null;
  while (!hecho) {
    const a = pos;
    const b = Math.min(pos + TROZO, total) - 1;
    let ultimo: unknown;
    let enviado = false;
    for (let intento = 0; intento < 3 && !enviado; intento++) {
      if (o.signal?.aborted) throw new Error("Se canceló.");
      try {
        hecho = await enviar(a, b);
        enviado = true;
      } catch (e) {
        ultimo = e;
        const st = (e as { status?: number }).status;
        if (e instanceof TypeError && a === 0 && intento === 0 && !relevo) {
          relevo = true; // el navegador no llegó directo (CORS o red): se pasa al relevo
          continue;
        }
        if (st === 416) {
          const n = await siguiente();
          if (n !== null && n > a) {
            pos = n;
            enviado = true;
            hecho = null;
            break;
          }
        }
        if (st && st < 500 && st !== 429) throw e instanceof Error ? e : new Error("La subida falló.");
        await dormir(600 * 2 ** intento, o.signal);
      }
    }
    if (!enviado) {
      const n = await siguiente(); // última oportunidad: reanudar donde Microsoft dice
      if (n !== null && n > a) pos = n;
      else throw new Error(`Se cortó la subida (${ultimo instanceof Error ? ultimo.message : "red"}). Vuelva a intentarlo.`);
    } else if (!hecho && pos === a) pos = b + 1;
    o.onProgreso?.(Math.min(0.99, pos / total));
  }
  o.signal?.removeEventListener("abort", cancelar);
  o.onProgreso?.(1);
  return hecho;
}

/* --- Leer: texto de un archivo de OneDrive o SharePoint ------------------------------------ */

async function inflarRaw(datos: Uint8Array): Promise<string> {
  const copia = new Uint8Array(datos);
  return await new Response(new Blob([copia]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
}

/** El texto de un .docx, sin librerías: se abre el zip y se lee word/document.xml. */
export async function textoDeDocx(buffer: ArrayBuffer): Promise<string> {
  const u8 = new Uint8Array(buffer);
  const v = new DataView(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Ese archivo no parece un .docx.");
  const n = v.getUint16(eocd + 10, true);
  let off = v.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    if (v.getUint32(off, true) !== 0x02014b50) break;
    const metodo = v.getUint16(off + 10, true);
    const csize = v.getUint32(off + 20, true);
    const nlen = v.getUint16(off + 28, true);
    const elen = v.getUint16(off + 30, true);
    const clen = v.getUint16(off + 32, true);
    const lho = v.getUint32(off + 42, true);
    const nombre = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
    if (nombre === "word/document.xml") {
      const ini = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
      const datos = u8.subarray(ini, ini + csize);
      const xml = metodo === 0 ? new TextDecoder().decode(datos) : await inflarRaw(datos);
      return xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br[^>]*\/>|<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    off += 46 + nlen + elen + clen;
  }
  throw new Error("No encontré el texto dentro del .docx.");
}

/** El texto de un archivo: txt, md, csv, json y similares directo; .docx convertido aquí. Otros formatos: error claro. */
export async function leerTexto(drive: string, item: string, signal?: AbortSignal): Promise<{ nombre: string; texto: string; url: string; truncado: boolean }> {
  const r = await callFn<{ nombre: string; texto?: string; b64?: string; url: string; truncado?: boolean }>("pw-microsoft", { action: "archivos_leer", drive, item }, { timeoutMs: 60_000, signal });
  if (r.texto !== undefined) return { nombre: r.nombre, texto: r.texto, url: r.url, truncado: Boolean(r.truncado) };
  if (/\.docx$/i.test(r.nombre) && r.b64) {
    const bin = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
    const t = await textoDeDocx(bin.buffer);
    return { nombre: r.nombre, texto: t.slice(0, 60_000), url: r.url, truncado: t.length > 60_000 };
  }
  throw new Error("Por ahora Pilo lee texto (.txt, .md, .csv, .json) y .docx desde OneDrive o SharePoint. Para Excel o PDF, ábralo en OneDrive o descárguelo.");
}

/** Convierte texto plano en un .docx sencillo (reutiliza el paquete docx, ya instalado). */
export async function textoADocx(titulo: string, texto: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const doc = new Document({
    sections: [{ children: [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(titulo)] }), ...texto.split("\n").map((l) => new Paragraph({ children: [new TextRun(l)] }))] }],
  });
  return await Packer.toBlob(doc);
}
