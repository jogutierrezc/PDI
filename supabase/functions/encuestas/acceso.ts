/* =============================================================================
   Encuestas con Pilo · acceso y envíos sin sesión (migración 0184)

   Puro y sin dependencias de Deno (usa Web Crypto, que hay también en el
   navegador y en Node): quién puede responder y cuándo, el reto contra robots y
   la huella de la IP. La usa la función `encuestas`; se prueba aparte.

   El reto contra robots no necesita un servicio externo: la función entrega una
   cuenta sencilla y un pase firmado (HMAC) con la hora y la respuesta cifrada;
   al enviar, la respuesta tiene que coincidir y haber pasado un mínimo de
   segundos (un robot que rellena al instante no pasa). Es un freno, no un muro:
   el muro de verdad son el límite por huella y el límite de respuestas de la base.
   ========================================================================== */

export type AccesoEncuesta = "microsoft" | "abierta";
export type EstadoEncuesta = "borrador" | "publicada" | "pausada" | "cerrada";

export interface Recepcion {
  estado: EstadoEncuesta;
  abre_el: string | null;
  cierra_el: string | null;
}

export type MotivoCierre = "borrador" | "pausada" | "cerrada" | "aun_no" | "vencida";

/** «AAAA-MM-DD» de hoy en Bogotá (UTC−5, sin horario de verano). */
export const hoyBogota = (ahora: number = Date.now()): string => new Date(ahora - 5 * 3600_000).toISOString().slice(0, 10);

/** Por qué no recibe respuestas, o null si recibe. */
export function motivoCierre(e: Recepcion, hoy: string = hoyBogota()): MotivoCierre | null {
  if (e.estado === "borrador") return "borrador";
  if (e.estado === "pausada") return "pausada";
  if (e.estado === "cerrada") return "cerrada";
  if (e.abre_el && hoy < e.abre_el) return "aun_no";
  if (e.cierra_el && hoy > e.cierra_el) return "vencida";
  return null;
}

export const MENSAJE_CIERRE: Record<MotivoCierre, string> = {
  borrador: "Esta encuesta todavía no está publicada.",
  pausada: "Esta encuesta está en pausa. Vuelva más tarde.",
  cerrada: "Esta encuesta ya no recibe respuestas.",
  aun_no: "Esta encuesta aún no abre.",
  vencida: "El plazo de esta encuesta terminó.",
};

/** ¿El correo es de uno de los dominios (o de un subdominio suyo)? Sin dominios configurados no se acepta nada. */
export function dominioPermitido(correo: string, dominios: readonly string[]): boolean {
  const d = correo.slice(correo.lastIndexOf("@") + 1).trim().toLowerCase();
  return dominios.some((x) => {
    const dom = x.trim().toLowerCase().replace(/^@/, "");
    return dom !== "" && (d === dom || d.endsWith(`.${dom}`));
  });
}

/* ---------- Firma y reto ---------- */

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const llave = (secreto: string) => crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function firmar(obj: unknown, secreto: string): Promise<string> {
  const cuerpo = b64(enc.encode(JSON.stringify(obj)));
  return `${cuerpo}.${b64(await crypto.subtle.sign("HMAC", await llave(secreto), enc.encode(cuerpo)))}`;
}

export async function abrir<T>(token: string, secreto: string): Promise<T | null> {
  const [cuerpo, firma] = String(token ?? "").split(".");
  if (!cuerpo || !firma) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await llave(secreto), deB64(firma), enc.encode(cuerpo)))) return null;
    return JSON.parse(new TextDecoder().decode(deB64(cuerpo))) as T;
  } catch {
    return null;
  }
}

export const RETO = { minimoMs: 3000, maximoMs: 2 * 3600_000 } as const;

interface CuerpoReto {
  slug: string;
  t: number;
  r: string;
}

const respuestaCifrada = async (slug: string, respuesta: number, secreto: string) => b64(await crypto.subtle.sign("HMAC", await llave(secreto), enc.encode(`${slug}:${respuesta}`)));

/** Una cuenta sencilla y el pase que la respalda. `azar` (0 a 1) se pasa en las pruebas. */
export async function crearReto(slug: string, secreto: string, ahora: number = Date.now(), azar: () => number = Math.random): Promise<{ pregunta: string; pase: string }> {
  const a = 2 + Math.floor(azar() * 8);
  const b = 2 + Math.floor(azar() * 8);
  const cuerpo: CuerpoReto = { slug, t: ahora, r: await respuestaCifrada(slug, a + b, secreto) };
  return { pregunta: `¿Cuánto es ${a} + ${b}?`, pase: await firmar(cuerpo, secreto) };
}

export type ResultadoReto = "ok" | "falta" | "incorrecto" | "vencido" | "rapido";

export async function comprobarReto(slug: string, pase: unknown, respuesta: unknown, secreto: string, ahora: number = Date.now()): Promise<ResultadoReto> {
  if (typeof pase !== "string" || pase === "") return "falta";
  const c = await abrir<CuerpoReto>(pase, secreto);
  if (!c || c.slug !== slug || typeof c.t !== "number") return "incorrecto";
  const n = Number(String(respuesta ?? "").trim());
  if (!Number.isInteger(n)) return "incorrecto";
  if (ahora - c.t > RETO.maximoMs) return "vencido";
  if (ahora - c.t < RETO.minimoMs) return "rapido";
  return (await respuestaCifrada(slug, n, secreto)) === c.r ? "ok" : "incorrecto";
}

/** Una huella estable de la IP, que no la revela. */
export async function huellaDe(ip: string, secreto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(`${ip}|${secreto}`));
  return Array.from(new Uint8Array(h)).slice(0, 16).map((x) => x.toString(16).padStart(2, "0")).join("");
}
