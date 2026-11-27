/* =============================================================================
   Pilo en el Aula · el servicio web de Moodle (fase 2, 0300).

   Lo que pilo-aula puede pedirle a Moodle, y cómo. Lista cerrada de funciones;
   la dirección se revisa igual que en pilo-ia (https, dominio público, ruta
   fija, sin redirecciones) y el token va solo en el cuerpo del pedido.

   La regla que no se negocia: el usuario y el curso de cada pedido salen de la
   credencial firmada (AulaIdentidad), nunca de lo que diga el chat. Esa regla la
   aplican index.ts y notas.ts; aquí solo se arma y se revisa el pedido.
   ========================================================================== */

export const AULA_MOODLE_FNS = [
  "gradereport_user_get_grade_items",
  "mod_assign_get_assignments",
] as const;
export type AulaMoodleFn = (typeof AULA_MOODLE_FNS)[number];

export const MOODLE_PATH = "/webservice/rest/server.php";

const BLOCKED_HOST = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa|nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me)$/;

/** La dirección del servicio REST de un sitio, revisada. null si no es https con dominio público. */
export function moodleRestUrl(site: unknown): { url: string; host: string } | null {
  const raw = typeof site === "string" ? site.trim() : "";
  if (!raw || raw.length > 300 || /[\s\\@%?#]/.test(raw) || raw.includes("..") || !/^https:\/\//i.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || host.includes(":") || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(host)) return null;
  if (BLOCKED_HOST.test(host)) return null;
  let path = u.pathname.replace(/\/+$/, "");
  if (path.toLowerCase().endsWith(MOODLE_PATH)) path = path.slice(0, -MOODLE_PATH.length);
  if (path && (!/^(\/[A-Za-z0-9._~-]+)+$/.test(path) || path.split("/").some((p) => p === "." || p === ".."))) return null;
  return { url: `https://${host}${path}${MOODLE_PATH}`, host };
}

/** ¿Esa IP es privada, local o reservada? Lo que no se entiende cuenta como privado. */
export function privateAddress(ip: string): boolean {
  const text = String(ip ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!text.includes(":") || !/^[0-9a-f:.]+$/.test(text)) return true;
  if (text.includes(".") || /^::ffff:/.test(text) || /^64:ff9b:/.test(text)) return true;
  const head = parseInt(text.split(":")[0] || "0", 16);
  return head === 0 || (head & 0xfe00) === 0xfc00 || (head & 0xffc0) === 0xfe80 || (head & 0xff00) === 0xff00 || /^2001:0?db8:/.test(text);
}

/** El cuerpo de un pedido (form), con el token dentro. null si la función no está en la lista. */
export function moodleForm(token: string, fn: string, params: Record<string, string | number | (string | number)[]> = {}): string | null {
  if (!(AULA_MOODLE_FNS as readonly string[]).includes(fn)) return null;
  const form = new URLSearchParams();
  form.set("wstoken", token);
  form.set("wsfunction", fn);
  form.set("moodlewsrestformat", "json");
  for (const [key, value] of Object.entries(params)) {
    if (/^(wstoken|wsfunction|moodlewsrestformat)$/i.test(key)) continue;
    if (Array.isArray(value)) value.forEach((v, i) => form.append(`${key}[${i}]`, String(v)));
    else form.append(key, String(value));
  }
  return form.toString();
}

/** Un error de Moodle sin el token ni nada que se le parezca. */
export function moodleClean(text: unknown, token = ""): string {
  let t = String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
  if (token) for (const s of [token, encodeURIComponent(token)]) if (s.length >= 4) t = t.split(s).join("[token]");
  return t.replace(/wstoken=[^&\s]*/gi, "wstoken=[token]").replace(/\b[a-f0-9]{32}\b/gi, "[token]").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** ¿Moodle respondió con una excepción? Su código y su mensaje, limpios. */
export function moodleFault(data: unknown, token = ""): { code: string; message: string } | null {
  const o = data as { exception?: unknown; errorcode?: unknown; message?: unknown } | null;
  if (!o || typeof o !== "object" || (!o.exception && !o.errorcode)) return null;
  return { code: String(o.errorcode ?? "moodle").slice(0, 60), message: moodleClean(o.message, token) };
}
