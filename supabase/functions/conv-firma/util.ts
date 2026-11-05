/* =============================================================================
   conv-firma · utilidades: entorno, respuestas, criptografía de tokens y códigos,
   IP/país/agente de quien llama, fechas de Bogotá y enmascarado de datos.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export const ENV = (n: string): string => Deno.env.get(n) ?? "";

export const CORS = {
  "Access-Control-Allow-Origin": ENV("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-conv-firma-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Error de negocio: llega al cliente como { error, code } con el estado HTTP indicado. */
export class ErrorFirma extends Error {
  constructor(public code: string, message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// deno-lint-ignore no-explicit-any
export type Cliente = any;

export const cliente = (url: string, key: string, authorization?: string): Cliente =>
  createClient(url, key, { ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}), auth: { persistSession: false, autoRefreshToken: false } });

/* ---------- Constantes del proceso ---------------------------------------------------------------- */

export const VIGENCIA_ENLACE_DIAS = 15;
export const CODIGO_VIGENCIA_MS = 10 * 60 * 1000;
export const CODIGO_MAX_INTENTOS = 5;
export const CODIGO_ESPERA_S = 60;
export const CODIGO_MAX_ENVIOS_DIA = 10;
export const BLOQUEO_FALLOS = 20;
export const BLOQUEO_MS = 60 * 60 * 1000;
export const SESION_VIGENCIA_MS = 45 * 60 * 1000;
export const MOVIL_VIGENCIA_MS = 5 * 60 * 1000;
export const MAX_CUERPO_BYTES = 1_500_000;

/* ---------- Criptografía --------------------------------------------------------------------------- */

const enc = new TextEncoder();

export const aHex = (b: ArrayBuffer | Uint8Array): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const deHex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

export async function sha256Hex(datos: Uint8Array | string): Promise<string> {
  const bytes = typeof datos === "string" ? enc.encode(datos) : datos;
  return aHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export function base64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64(b64: string): Uint8Array {
  const limpio = b64.replace(/\s+/g, "");
  const s = atob(limpio);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function aBase64(b: Uint8Array): string {
  let s = "";
  const trozo = 0x8000;
  for (let i = 0; i < b.length; i += trozo) s += String.fromCharCode(...b.subarray(i, i + trozo));
  return btoa(s);
}

/** Token de 256 bits en base64url (43 caracteres). */
export const tokenNuevo = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const TOKEN_FORMATO = /^[A-Za-z0-9_-]{43}$/;

/** Código de 6 dígitos, uniforme (sin sesgo de módulo). */
export function codigoSeisDigitos(): string {
  const tope = 4_294_000_000 - (4_294_000_000 % 1_000_000);
  const a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= tope);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

const ALFABETO_ID = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** ID-XXXX-XXXX (sin caracteres que se confunden). */
export function codigoIdentidad(): string {
  const r = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALFABETO_ID[b % 32]).join("");
  return `ID-${r(4)}-${r(4)}`;
}

/** Comparación en tiempo constante de dos cadenas (hex u otras) de igual propósito. */
export function iguales(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

let pimienta: CryptoKey | null = null;
/**
 * HMAC-SHA256 con una clave del servidor (CONV_FIRMA_PIMIENTA; si falta, se deriva de la clave de servicio).
 * Los códigos de 6 dígitos solo son seguros guardados así: un SHA-256 simple se rompería con una tabla de
 * un millón de entradas si se filtrara la base.
 */
export async function hmac(mensaje: string): Promise<string> {
  if (!pimienta) {
    const secreto = ENV("CONV_FIRMA_PIMIENTA") || `conv-firma|${ENV("SUPABASE_SERVICE_ROLE_KEY")}`;
    pimienta = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return aHex(await crypto.subtle.sign("HMAC", pimienta, enc.encode(mensaje)));
}

/* ---------- Quién llama --------------------------------------------------------------------------- */

const IP_FORMATO = /^[0-9a-fA-F:.]{3,45}$/;

/** IP del cliente según el proxy (Traefik pone X-Real-Ip y X-Forwarded-For). Nunca confía en un encabezado vacío. */
export function ipDe(req: Request): string {
  const cand = [req.headers.get("x-real-ip"), (req.headers.get("x-forwarded-for") ?? "").split(",")[0], req.headers.get("cf-connecting-ip")];
  for (const c of cand) {
    const v = (c ?? "").trim();
    if (v && IP_FORMATO.test(v)) return v;
  }
  return "";
}

// deno-lint-ignore no-control-regex
export const agenteDe = (req: Request): string => (req.headers.get("user-agent") ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, 300);

/** País (ISO 3166-1 alfa-2) que declara el proxy, si lo hay. Nunca se inventa. */
export function paisDe(req: Request): string {
  if (ENV("CONV_FIRMA_PAIS_ENCABEZADOS") === "ninguno") return "";
  for (const h of ["cf-ipcountry", "x-vercel-ip-country", "x-country-code"]) {
    const v = (req.headers.get(h) ?? "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1") return v;
  }
  return "";
}

export function zonaHorariaValida(z: unknown): string {
  return typeof z === "string" && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(z) && z.length <= 64 ? z : "";
}

/** «84.88.12.34» → «84.88.12.x»; IPv6 conserva solo los tres primeros grupos. */
export function ipEnmascarada(ip: string | null | undefined): string {
  if (!ip) return "";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":x";
  const p = ip.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : "";
}

/** «Chrome · Windows» a partir del agente de usuario. */
export function dispositivoDe(ua: string | null | undefined): string {
  const u = ua ?? "";
  if (!u) return "";
  const b = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Navegador";
  const s = /Windows/.test(u) ? "Windows" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Mac OS X|Macintosh/.test(u) ? "macOS" : /Linux/.test(u) ? "Linux" : "";
  return s ? `${b} · ${s}` : b;
}

/** «mribas@ub.edu» → «m•••s@ub.edu». */
export function correoEnmascarado(c: string): string {
  const [u, d] = c.split("@");
  if (!u || !d) return "";
  return `${u.length <= 2 ? u[0] : u[0] + "•••" + u[u.length - 1]}@${d}`;
}

/* ---------- Fechas -------------------------------------------------------------------------------- */

export const fechaBogota = (d = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const utcLegible = (d: Date | string): string => {
  const f = typeof d === "string" ? new Date(d) : d;
  return f.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
};

export const appUrl = (): string => (ENV("CONV_URL_APP") || "https://planeacion.udes.edu.co").replace(/\/+$/, "");

export const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Nombre de archivo sin tildes ni símbolos. */
export const nombreSeguro = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "documento";

export const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const formatoCorreo = (c: string): boolean => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(c) && c.length <= 254;

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
