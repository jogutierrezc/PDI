/* =============================================================================
   Edge Function · int-contactos

   La cara pública de «Contactos» (Internacionalización, migración 0167): una
   persona invitada, sin cuenta, comparte contactos académicos o de empleadores
   por un enlace. La función valida las filas con las plantillas de Rua
   (contactos.ts, el mismo módulo que usa la pantalla) y deja a la base las reglas
   que no se pueden saltar (vigencia, duplicados, límite, cierre). Habla con la base
   con la clave de servicio, porque las funciones int_contactos_* no las llama nadie
   más.

     info       { token }                       → la invitación (sin secretos) o 404
     identificar{ token, nombre, cargo, correo, campus_id? }
                                                → { aportante_id, sesion, nombre, cargo, correo, campus_id, enviados }
     microsoft_datos
                { token }  + Authorization: Bearer <access_token de Microsoft>
                                                → { nombre, correo } de la cuenta (no guarda nada)
     identificar_microsoft
                { token, cargo, campus_id?, nombre? } + Authorization: Bearer <access_token>
                                                → lo mismo que identificar, con el correo confirmado
     revisar    { token, aportante_id, sesion, tipo, filas:[{fila, cruda}] }
                                                → { resultados, enviados, limite }      (no guarda)
     enviar     { token, aportante_id, sesion, tipo, origen, archivo?, filas }
                                                → { resultados, creadas, actualizadas, omitidas, errores, enviados, limite }
     mis        { token, aportante_id, sesion } → { filas, limite }
     quitar     { token, aportante_id, sesion, ids } → { quitadas }

   Reglas:
     · Sin sesión de Supabase: es una página pública. Lo que la protege es el token
       de la invitación y, por persona, un secreto de sesión que solo vive en su
       navegador (la base guarda su SHA-256).
     · El correo de quien aporta a mano NO se verifica (no hay envío de correos): se
       comprueba el dominio permitido y queda `correo_verificado = false`. Quien entra
       con «Continuar con Microsoft» (migración 0171) queda con el correo confirmado: la
       función valida su token con Supabase Auth, exige que la identidad sea de Azure y
       que el dominio sea permitido. Los cinco dominios de la UDES se aceptan siempre.
     · Un campo oculto («web») cazado por un robot rechaza la petición; hay un tope
       de peticiones por minuto y por IP (en memoria, lo mejor que se puede aquí).
     · Hasta 500 filas por envío; el archivo grande lo parte la pantalla en tandas.

   Despliegue:
     supabase functions deploy int-contactos --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  combinarResultados,
  esTipoContacto,
  limpiar,
  MAX_FILAS_POR_ENVIO,
  plantillaDeTipo,
  prepararEnvio,
  totales,
  validarAportante,
} from "./contactos.ts";
import type { FilaEnvio, ResultadoBase } from "./contactos.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const TOKEN = /^[A-Za-z0-9_-]{8,40}$/;

// Un tope por IP: en memoria, por instancia. No es un muro, es un freno.
const PETICIONES = new Map<string, number[]>();
function demasiadas(ip: string): boolean {
  const ahora = Date.now();
  const recientes = (PETICIONES.get(ip) ?? []).filter((t) => ahora - t < 60_000);
  recientes.push(ahora);
  PETICIONES.set(ip, recientes);
  if (PETICIONES.size > 5000) for (const [k, v] of PETICIONES) if (!v.some((t) => ahora - t < 60_000)) PETICIONES.delete(k);
  return recientes.length > 90;
}

async function sha256(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function secreto(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Los errores de la base que son de la persona (vigencia, límite, sesión…) llevan un código P000x o 22023/42501. */
const esDePersona = (e: { code?: string }) => /^P000[2-8]$/.test(e.code ?? "") || ["22023", "42501"].includes(e.code ?? "");

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada." }, 500);

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
  if (demasiadas(ip)) return json({ error: "Demasiadas peticiones seguidas. Espere un minuto." }, 429);

  let c: Record<string, unknown> = {};
  try {
    const texto = await request.text();
    if (texto.length > 2_000_000) return json({ error: "El envío es demasiado grande." }, 413);
    c = JSON.parse(texto || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  if (limpiar(c.web)) return json({ error: "Petición no válida." }, 400);

  const token = String(c.token ?? "");
  if (!TOKEN.test(token)) return json({ error: "Este enlace no es válido." }, 404);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rpc = async <T>(nombre: string, args: Record<string, unknown>): Promise<{ data: T | null; respuesta: Response | null }> => {
    const r = await admin.rpc(nombre, args);
    if (r.error) {
      if (esDePersona(r.error)) return { data: null, respuesta: json({ error: r.error.message }, r.error.code === "P0002" ? 404 : r.error.code === "P0004" ? 401 : 400) };
      if (/does not exist|schema cache|permission denied/i.test(r.error.message)) return { data: null, respuesta: json({ error: "Falta aplicar la migración 0167 o la 0171 (Contactos).", code: "migracion" }, 500) };
      console.error("int-contactos", nombre, r.error.message);
      return { data: null, respuesta: json({ error: "No se pudo completar la operación. Intente de nuevo." }, 500) };
    }
    return { data: r.data as T, respuesta: null };
  };

  const accion = String(c.action ?? "");

  if (accion === "info") {
    const r = await rpc<Record<string, unknown> | null>("int_contactos_invitacion", { p_token: token });
    if (r.respuesta) return r.respuesta;
    return r.data ? json(r.data) : json({ error: "Este enlace no es válido." }, 404);
  }

  if (accion === "identificar") {
    const info = await rpc<{ dominios: string[]; campus: { id: string } | null } | null>("int_contactos_invitacion", { p_token: token });
    if (info.respuesta) return info.respuesta;
    if (!info.data) return json({ error: "Este enlace no es válido." }, 404);
    const { errores, datos } = validarAportante({ nombre: String(c.nombre ?? ""), cargo: String(c.cargo ?? ""), correo: String(c.correo ?? "") }, info.data.dominios);
    if (errores.length) return json({ error: errores.join(" ") }, 400);
    const campus = String(c.campus_id ?? "");
    if (campus && !UUID.test(campus)) return json({ error: "Campus no válido." }, 400);
    const clave = secreto();
    const r = await rpc<Record<string, unknown>>("int_contactos_identificar", {
      p_token: token,
      p_nombre: datos.nombre,
      p_cargo: datos.cargo,
      p_correo: datos.correo,
      p_campus: campus || null,
      p_hash: await sha256(clave),
    });
    if (r.respuesta) return r.respuesta;
    return json({ ...r.data, sesion: clave });
  }

  if (accion === "microsoft_datos" || accion === "identificar_microsoft") {
    const info = await rpc<{ dominios: string[]; campus: { id: string } | null } | null>("int_contactos_invitacion", { p_token: token });
    if (info.respuesta) return info.respuesta;
    if (!info.data) return json({ error: "Este enlace no es válido." }, 404);
    // La cuenta de Microsoft: el token lo emitió Supabase Auth al volver de Azure.
    const jwt = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (jwt.length < 20) return json({ error: "No llegó la confirmación de Microsoft. Intente de nuevo.", code: "microsoft" }, 401);
    const u = await admin.auth.getUser(jwt);
    const usuario = u.data.user;
    if (u.error || !usuario) return json({ error: "La confirmación de Microsoft venció. Vuelva a pulsar «Continuar con Microsoft».", code: "microsoft" }, 401);
    const deAzure = usuario.app_metadata?.provider === "azure" || (usuario.identities ?? []).some((x) => x.provider === "azure");
    if (!deAzure) return json({ error: "Esa sesión no es de una cuenta de Microsoft.", code: "microsoft" }, 401);
    const meta = (usuario.user_metadata ?? {}) as Record<string, unknown>;
    const correo = limpiar(usuario.email ?? meta.email).toLowerCase();
    const nombreMs = limpiar(meta.full_name ?? meta.name);
    const prueba = validarAportante({ nombre: nombreMs || "Sin nombre", cargo: "Cargo", correo }, info.data.dominios);
    if (prueba.errores.some((e) => /correo/i.test(e))) {
      return json({ error: `El correo de su cuenta Microsoft (${correo || "sin correo"}) no es un correo institucional de la UDES.`, code: "dominio" }, 400);
    }
    if (accion === "microsoft_datos") return json({ nombre: nombreMs, correo });

    const nombre = nombreMs || limpiar(c.nombre);
    const { errores, datos } = validarAportante({ nombre, cargo: String(c.cargo ?? ""), correo }, info.data.dominios);
    if (errores.length) return json({ error: errores.join(" ") }, 400);
    const campus = String(c.campus_id ?? "");
    if (campus && !UUID.test(campus)) return json({ error: "Campus no válido." }, 400);
    const clave = secreto();
    const r = await rpc<Record<string, unknown>>("int_contactos_identificar_microsoft", {
      p_token: token,
      p_nombre: datos.nombre,
      p_cargo: datos.cargo,
      p_correo: datos.correo,
      p_campus: campus || null,
      p_hash: await sha256(clave),
    });
    if (r.respuesta) return r.respuesta;
    return json({ ...r.data, sesion: clave });
  }

  // Las demás acciones piden la sesión de la persona.
  const aportante = String(c.aportante_id ?? "");
  const sesion = String(c.sesion ?? "");
  if (!UUID.test(aportante) || sesion.length < 20) return json({ error: "Su sesión venció. Vuelva a identificarse." }, 401);
  const hash = await sha256(sesion);

  if (accion === "mis") {
    const r = await rpc<unknown>("int_contactos_mis", { p_token: token, p_aportante: aportante, p_hash: hash });
    return r.respuesta ?? json(r.data);
  }

  if (accion === "quitar") {
    const ids = Array.isArray(c.ids) ? c.ids.map(String).filter((x) => UUID.test(x)) : [];
    const r = await rpc<number>("int_contactos_quitar", { p_token: token, p_aportante: aportante, p_hash: hash, p_ids: ids });
    return r.respuesta ?? json({ quitadas: r.data });
  }

  if (accion === "revisar" || accion === "enviar") {
    if (!esTipoContacto(c.tipo)) return json({ error: "Elija si son contactos académicos o de empleadores." }, 400);
    const tipo = c.tipo;
    const plantilla = plantillaDeTipo(tipo);
    const entrada = Array.isArray(c.filas) ? c.filas : [];
    if (entrada.length === 0) return json({ error: "No hay filas para enviar." }, 400);
    if (entrada.length > MAX_FILAS_POR_ENVIO) return json({ error: `Son ${entrada.length} filas: el máximo por envío es ${MAX_FILAS_POR_ENVIO}.` }, 400);
    const filas: FilaEnvio[] = entrada.map((f, i) => {
      const o = (f ?? {}) as { fila?: unknown; cruda?: Record<string, unknown> };
      const cruda: Record<string, string> = {};
      for (const col of plantilla.columnas) cruda[col.encabezado] = limpiar(o.cruda?.[col.encabezado]);
      return { fila: Number.isInteger(o.fila) ? Number(o.fila) : i + 1, cruda };
    });
    const { paraBase, locales, avisos } = prepararEnvio(plantilla, filas);

    if (accion === "revisar") {
      let deBase: ResultadoBase[] = [];
      let enviados = 0;
      let limite = 0;
      if (paraBase.length) {
        const r = await rpc<{ filas: ResultadoBase[]; enviados: number; limite: number }>("int_contactos_revisar", { p_token: token, p_aportante: aportante, p_hash: hash, p_tipo: tipo, p_filas: paraBase });
        if (r.respuesta) return r.respuesta;
        deBase = r.data!.filas;
        enviados = r.data!.enviados;
        limite = r.data!.limite;
      }
      return json({ resultados: combinarResultados(locales, deBase, avisos), enviados, limite });
    }

    const origen = c.origen === "excel" ? "excel" : "manual";
    let deBase: ResultadoBase[] = [];
    let extra: Record<string, unknown> = {};
    if (paraBase.length) {
      const r = await rpc<{ filas: ResultadoBase[] } & Record<string, unknown>>("int_contactos_recibir", {
        p_token: token,
        p_aportante: aportante,
        p_hash: hash,
        p_tipo: tipo,
        p_filas: paraBase,
        p_origen: origen,
        p_archivo: origen === "excel" ? limpiar(c.archivo).slice(0, 200) || null : null,
      });
      if (r.respuesta) return r.respuesta;
      deBase = r.data!.filas;
      extra = r.data!;
    }
    const resultados = combinarResultados(locales, deBase, avisos);
    const t = totales(resultados);
    return json({ resultados, creadas: t.crear, actualizadas: t.actualizar, omitidas: t.omitir, errores: t.error, enviados: extra.enviados ?? 0, limite: extra.limite ?? 0 });
  }

  return json({ error: "Acción desconocida." }, 400);
});
