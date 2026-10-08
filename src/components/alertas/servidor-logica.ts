/* =============================================================================
   Alertas de emergencia · la lógica pura de la función `pilo-alertas`.

   Sin importar nada: la función del servidor es un solo archivo y lleva dentro
   una copia exacta de lo que sigue (entre las marcas «>>> lógica» y
   «<<< fin de la lógica»); una prueba vigila que sean iguales.
   ========================================================================== */

export type KindAlerta = "sismo" | "incendio" | "seguridad" | "general";
export type TipoAviso = "informativo" | "obligatoria" | "emergencia";

export const TIPOS_AVISO: readonly TipoAviso[] = ["informativo", "obligatoria", "emergencia"];

/** Una alerta lista para guardar en pilo_alerts. */
export interface AlertaNueva {
  ext_id: string;
  code: string;
  kind: KindAlerta;
  alert_type: TipoAviso;
  title: string;
  body: string;
  emitted_at: string | null;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** De qué se trata, por lo que dice el aviso: Aluna no lo trae como campo. */
export function tipoDeAlerta(titulo: unknown, cuerpo: unknown): KindAlerta {
  const t = sinTildes(`${typeof titulo === "string" ? titulo : ""} ${typeof cuerpo === "string" ? cuerpo : ""}`);
  if (/\b(sismo|temblor|terremoto|telurico|replica)/.test(t)) return "sismo";
  if (/\b(incendio|fuego|humo|conato|llamas)/.test(t)) return "incendio";
  if (/\b(amenaza|bomba|explosivo|disparo|balacera|intruso|atentado|armad[oa]|seguridad|secuestro)/.test(t)) return "seguridad";
  return "general";
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Un aviso de Aluna (del webhook o de GET /alertas) como alerta de Pilo; nada si no sirve. */
export function normalizarAviso(raw: unknown): AlertaNueva | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const id = typeof a.id === "string" || typeof a.id === "number" ? String(a.id).trim().slice(0, 80) : "";
  const title = texto(a.titulo, 300);
  if (!id || !title) return null;
  const tipo = TIPOS_AVISO.includes(a.tipo as TipoAviso) ? (a.tipo as TipoAviso) : "emergencia";
  const body = texto(a.cuerpo, 4000);
  const at = typeof a.emitido_at === "string" && !Number.isNaN(Date.parse(a.emitido_at)) ? new Date(a.emitido_at).toISOString() : null;
  return { ext_id: id, code: texto(a.codigo, 60), kind: tipoDeAlerta(title, body), alert_type: tipo, title, body, emitted_at: at };
}

/**
 * Lo que dice GET /alertas, listo para guardar. Se saltan los avisos que
 * reemplazan a otro (son el «todo despejado»: cierran, no abren) y los de un
 * tipo que la administración no quiso mostrar.
 */
export function alertasDeLista(lista: unknown, tipos: readonly string[]): AlertaNueva[] {
  if (!Array.isArray(lista)) return [];
  const out: AlertaNueva[] = [];
  for (const item of lista) {
    const raw = item as Record<string, unknown> | null;
    if (!raw || (raw.reemplaza_a !== undefined && raw.reemplaza_a !== null)) continue;
    const a = normalizarAviso(raw);
    if (a && tipos.includes(a.alert_type)) out.push(a);
  }
  return out;
}

/** Qué hacer con lo que Aluna dice que está activo frente a lo que Pilo tiene activo (de origen Aluna). */
export function planificarSync(activasAluna: readonly AlertaNueva[], activasPilo: readonly string[]): { abrir: AlertaNueva[]; cerrar: string[] } {
  const vivas = new Set(activasAluna.map((a) => a.ext_id));
  return { abrir: [...activasAluna], cerrar: activasPilo.filter((id) => !vivas.has(id)) };
}

/** La dirección de la API de Aluna: solo https, con un dominio de verdad (nada de IP ni red interna). */
export function direccionAluna(base: unknown, ruta: string): string | null {
  if (typeof base !== "string") return null;
  let u: URL;
  try {
    u = new URL(base.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  if (/^[0-9.]+$/.test(host) || host === "localhost" || /\.(local|internal|localhost|lan|home)$/.test(host)) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}${ruta}`;
}

/** Comparar sin que el tiempo delate cuántos caracteres coinciden. */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sha256Hex(entrada: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(entrada));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** La firma de Aluna: sha256(secreto + cuerpo) en hexadecimal, en el encabezado x-aluna-firma. */
export async function firmaAlunaValida(secreto: string, cuerpo: string, firma: string | null): Promise<boolean> {
  const dada = (firma ?? "").trim().toLowerCase();
  if (!secreto || !/^[0-9a-f]{64}$/.test(dada)) return false;
  return igualesEnTiempoConstante(await sha256Hex(secreto + cuerpo), dada);
}
