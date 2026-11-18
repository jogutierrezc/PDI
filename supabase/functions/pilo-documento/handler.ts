/* =============================================================================
   Pilo documento · el manejador del pedido, con sus dependencias por parámetro
   (sesión, contador, librerías). index.ts lo conecta; las pruebas, con dobles.

     POST { formato: "docx"|"xlsx", titulo, texto (Markdown de la respuesta, ≤200 000), plantilla?: "udes"|"simple" }
   Respuesta: el archivo (application/vnd.openxmlformats…) con X-Pilo-Archivo: nombre.
   Errores en JSON: 400 pedido · 401 sin_sesion · 413 grande · 429 limite · 500 interno.
   No usa ningún modelo: da forma a lo que Pilo ya escribió. Exige sesión y tiene límite por hora.
   ========================================================================== */

import { construirDocx, construirXlsx } from "./nucleo.ts";
import { revisarLimite } from "./limite.ts";

export const MAX_TEXTO = 200_000;
export const MAX_TITULO = 120;

export interface DepsManejador {
  configurado: boolean;
  anonKey: string;
  sal: string;
  usuarioDe: (token: string) => Promise<string | null>;
  golpe: (huella: string, ventanaInicio: string) => Promise<number | null>;
  /** Pedidos por persona y hora. */
  limiteHora: number;
  // deno-lint-ignore no-explicit-any
  docx: any;
  // deno-lint-ignore no-explicit-any
  excel: any;
  ahora?: () => Date;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Pilo-Archivo",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });

export const TIPOS = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const fechaLarga = (d: Date) => `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

/** Un nombre de archivo sin rutas ni signos raros. */
export const nombreArchivo = (titulo: string, ext: string) => `${titulo.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Pilo"}.${ext}`;

export function crearManejador(d: DepsManejador) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
    if (!d.configurado) return json({ error: "La función no está configurada." }, 500);

    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === d.anonKey) return json({ error: "Falta la sesión.", code: "sin_sesion" }, 401);
    const usuario = await d.usuarioDe(authorization.slice(7));
    if (!usuario) return json({ error: "Sesión inválida.", code: "sin_sesion" }, 401);

    const crudo = await request.text();
    if (crudo.length > MAX_TEXTO * 2) return json({ error: "El pedido es demasiado grande.", code: "grande" }, 413);
    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = JSON.parse(crudo || "{}");
    } catch {
      return json({ error: "Cuerpo inválido.", code: "pedido" }, 400);
    }
    const formato = cuerpo.formato;
    if (formato !== "docx" && formato !== "xlsx") return json({ error: "El formato debe ser docx o xlsx.", code: "pedido" }, 400);
    const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.replace(/\u0000/g, "") : "";
    if (!texto.trim()) return json({ error: "No hay texto con qué armar el documento.", code: "pedido" }, 400);
    if (texto.length > MAX_TEXTO) return json({ error: "El texto es demasiado largo para un documento.", code: "grande" }, 413);
    const titulo = (typeof cuerpo.titulo === "string" ? cuerpo.titulo : "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_TITULO) || "Documento de Mr. Pilo";
    const plantilla = cuerpo.plantilla === "simple" ? "simple" : "udes";

    const lim = await revisarLimite({ usuario, limite: d.limiteHora, sal: d.sal, golpe: d.golpe });
    if (!lim.ok) return json({ error: "Llegó al límite de documentos por esta hora. Vuelva a intentar más tarde.", code: "limite", retry_after: lim.retry }, 429, { "Retry-After": String(lim.retry) });

    try {
      const espec = { titulo, texto, plantilla, fecha: fechaLarga((d.ahora ?? (() => new Date()))()) } as const;
      const bytes = formato === "docx" ? await construirDocx(d.docx, espec) : await construirXlsx(d.excel, espec);
      return new Response(bytes, {
        status: 200,
        headers: { ...CORS, "Content-Type": TIPOS[formato], "Content-Length": String(bytes.length), "X-Pilo-Archivo": encodeURIComponent(nombreArchivo(titulo, formato)), "Cache-Control": "no-store" },
      });
    } catch {
      return json({ error: "No se pudo armar el documento.", code: "interno" }, 500);
    }
  };
}
