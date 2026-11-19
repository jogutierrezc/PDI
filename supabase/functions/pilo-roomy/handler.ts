/* =============================================================================
   Pilo Roomy · el manejador del pedido, con sus dependencias por parámetro
   (sesión, contador, llamada a Aluna). index.ts lo conecta; las pruebas, con dobles.

   La app de Pilo no habla con Aluna (Roomy): habla con esta función, que
     1. comprueba la sesión de Pilo y saca de ella el correo (la app NO lo manda),
     2. exige que sea @mail.udes.edu.co (el de profesores; los administrativos tienen otros dominios),
     3. llama a la función `pilo-puente` de Aluna con el secreto compartido,
     4. devuelve su respuesta.
   Contrato de Aluna: PILO_PUENTE.md (en la carpeta de la app).

     POST { accion: "estado" | "vincular" | "cursos" | "estudiantes" | "asistencia" | "registros" | "revocar",
            cedula?, nombre?  (vincular) · curso_id? (estudiantes, asistencia) }
   Éxito: lo que devuelve Aluna ({ ok: true, … }). Error: { ok: false, codigo, mensaje } con su estado HTTP.
   ========================================================================== */

import { revisarLimite } from "./limite.ts";

/** Los profesores (y los estudiantes) tienen correo @mail.udes.edu.co; los administrativos usan @udes.edu.co y los de las sedes, que no son profesores.
 *  Es un filtro grueso: quien manda es Aluna, que comprueba el correo contra la nómina o la cédula. Con «@» delante, un subdominio ajeno no pasa. */
export const DOMINIO = "@mail.udes.edu.co";
export const esCorreoDocente = (c: string) => c.endsWith(DOMINIO) && c.length > DOMINIO.length;
export const ACCIONES = ["estado", "vincular", "cursos", "estudiantes", "asistencia", "registros", "revocar"] as const;
type Accion = (typeof ACCIONES)[number];

export interface DepsRoomy {
  configurado: boolean;
  anonKey: string;
  sal: string;
  /** La función `pilo-puente` de Aluna y el secreto compartido (≥ 32 caracteres). */
  urlPuente: string;
  secreto: string;
  usuarioDe: (token: string) => Promise<{ id: string; correo: string } | null>;
  golpe: (huella: string, ventanaInicio: string) => Promise<number | null>;
  /** Pedidos por persona y hora. */
  limiteHora: number;
  /** `fetch` (se cambia en las pruebas). */
  llamar: (url: string, init: RequestInit) => Promise<Response>;
  /** Milisegundos que se espera a Aluna. */
  esperaMs?: number;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const error = (codigo: string, mensaje: string, status: number, extra: Record<string, string> = {}) => json({ ok: false, codigo, mensaje }, status, extra);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limpio = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valida la entrada y arma lo que se manda a Aluna (solo los campos de cada acción). */
export function armarPedido(accion: Accion, c: Record<string, unknown>): { ok: true; campos: Record<string, string> } | { ok: false; mensaje: string } {
  switch (accion) {
    case "vincular": {
      const cedula = limpio(c.cedula, 40).replace(/[^0-9A-Za-z]/g, "");
      const nombre = limpio(c.nombre, 120);
      if (cedula.length < 4 || cedula.length > 20) return { ok: false, mensaje: "La cédula no es válida." };
      if (nombre.length < 3) return { ok: false, mensaje: "Falta el nombre." };
      return { ok: true, campos: { cedula, nombre } };
    }
    case "estudiantes":
    case "asistencia": {
      const id = limpio(c.curso_id, 60);
      if (!UUID.test(id)) return { ok: false, mensaje: "El curso no es válido." };
      return { ok: true, campos: { curso_id: id.toLowerCase() } };
    }
    default:
      return { ok: true, campos: {} };
  }
}

export function crearManejador(d: DepsRoomy) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return error("METODO_NO_PERMITIDO", "Método no permitido.", 405);
    if (!d.configurado || !d.urlPuente || d.secreto.length < 32) return error("NO_CONFIGURADO", "La conexión con Roomy todavía no está configurada.", 503);

    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === d.anonKey) return error("SIN_SESION", "Falta la sesión.", 401);
    const usuario = await d.usuarioDe(authorization.slice(7));
    if (!usuario) return error("SIN_SESION", "Sesión inválida.", 401);
    const correo = usuario.correo.trim().toLowerCase();
    if (!esCorreoDocente(correo)) return error("CORREO_NO_VALIDO", "Pilo Docente es para cuentas con correo @mail.udes.edu.co.", 403);

    const crudo = await request.text();
    if (crudo.length > 4000) return error("SOLICITUD_INVALIDA", "El pedido es demasiado grande.", 413);
    let cuerpo: Record<string, unknown>;
    try {
      const x = JSON.parse(crudo || "{}");
      if (x === null || typeof x !== "object" || Array.isArray(x)) throw new Error();
      cuerpo = x as Record<string, unknown>;
    } catch {
      return error("SOLICITUD_INVALIDA", "Cuerpo inválido.", 400);
    }
    const accion = cuerpo.accion;
    if (typeof accion !== "string" || !(ACCIONES as readonly string[]).includes(accion)) return error("SOLICITUD_INVALIDA", "Acción desconocida.", 400);
    const pedido = armarPedido(accion as Accion, cuerpo);
    if (!pedido.ok) return error("SOLICITUD_INVALIDA", pedido.mensaje, 400);

    const lim = await revisarLimite({ usuario: usuario.id, limite: d.limiteHora, sal: d.sal, golpe: d.golpe });
    if (!lim.ok) return error("LIMITE", "Demasiadas consultas a Roomy en esta hora. Vuelva a intentar más tarde.", 429, { "Retry-After": String(lim.retry) });

    // La IP del usuario sirve a Aluna para su propio límite de intentos; sin ella, usa la de esta conexión.
    const ip = limpio((request.headers.get("x-forwarded-for") ?? "").split(",")[0], 64);
    const salida: Record<string, string> = { accion, correo, ...pedido.campos };
    if (accion === "vincular" && ip) salida.ip = ip;

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), d.esperaMs ?? 20_000);
    try {
      const r = await d.llamar(d.urlPuente, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-pilo-secret": d.secreto },
        body: JSON.stringify(salida),
        signal: control.signal,
      });
      const texto = await r.text();
      let datos: unknown;
      try {
        datos = JSON.parse(texto);
      } catch {
        return error("ROOMY_NO_DISPONIBLE", "Roomy no respondió como se esperaba.", 502);
      }
      if (datos === null || typeof datos !== "object" || Array.isArray(datos)) return error("ROOMY_NO_DISPONIBLE", "Roomy no respondió como se esperaba.", 502);
      const o = datos as Record<string, unknown>;
      // Un 401 de Aluna es un problema de configuración (el secreto), no de la persona: no se le pasa como «sin sesión».
      if (r.status === 401) return error("ROOMY_NO_CONFIGURADO", "La conexión con Roomy no está bien configurada.", 502);
      if (o.ok === true) return json(o, 200);
      const codigo = typeof o.codigo === "string" ? o.codigo.slice(0, 40) : "ERROR_ROOMY";
      const retry = r.headers.get("Retry-After");
      return error(codigo, typeof o.mensaje === "string" ? o.mensaje.slice(0, 300) : "Roomy no pudo atender el pedido.", r.status >= 400 && r.status < 600 ? r.status : 502, retry ? { "Retry-After": retry } : {});
    } catch {
      return error("ROOMY_NO_DISPONIBLE", "No hay conexión con Roomy.", 502);
    } finally {
      clearTimeout(reloj);
    }
  };
}
