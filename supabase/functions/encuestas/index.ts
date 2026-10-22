/* =============================================================================
   Edge Function · encuestas

   La cara pública de «Encuestas con Pilo» (migración 0179): las dependencias de la
   UDES envían «logros» y «retos» con cifras a una encuesta (la primera,
   `rendicion-2026`). La función valida con encuesta.ts (el mismo módulo que usa la
   pantalla) y deja a la base (enc_enviar) la validación final y el guardado
   atómico. Habla con la base con la clave de servicio: enc_enviar no la llama nadie
   más.

     info          { slug }                         → { encuesta: {slug,titulo,anio,intro,despedida,abierta,cierra_el} } o 404
     microsoft_datos
                   { slug } + Authorization: Bearer <access_token de Microsoft>
                                                    → { correo, nombre }   (no guarda nada)
     enviar        { slug, dependencia, aportes:[{tipo,titulo,descripcion,cifras:[{que,tipo,otro?,valor}]}], web? }
                   + Authorization: Bearer <access_token de Microsoft>
                                                    → { recibidos, cifras }        (flujo de aportes: rendicion-2026)
     reto          { slug }                         → { pregunta, pase }           (verificación contra robots, acceso abierto)
     responder     { slug, valores, pase?, reto_pase?, reto_respuesta?, nombre?, consentimiento?, web? }
                                                    → { ok, id }                   (encuestas del modelo nuevo, 0184)
                   Con Microsoft lleva el pase de microsoft_datos; abierta, el reto resuelto. Sin sesión.

   Reglas:
     · El correo sale SIEMPRE del token verificado en Supabase Auth (identidad de
       Azure y dominio de la UDES), nunca del cuerpo.
     · Un campo oculto («web») cazado por un robot rechaza la petición; hay un tope
       de peticiones por minuto y por IP (en memoria, lo mejor que se puede aquí).
     · Los errores de validación llevan { error, campo }.

   Despliegue:
     supabase functions deploy encuestas --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { correoPermitido, limpiar, normalizarAporte, validarEnvio } from "./encuesta.ts";
import type { AporteEnvio } from "./encuesta.ts";
import { comprobarReto, crearReto, dominioPermitido, huellaDe, MENSAJE_CIERRE, motivoCierre } from "./acceso.ts";
import type { AccesoEncuesta, EstadoEncuesta } from "./acceso.ts";
import { validarEstructura, validarRespuestas, valoresVisibles } from "./estructura.ts";
import type { Estructura, Valores } from "./estructura.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Un tope por IP: en memoria, por instancia. No es un muro, es un freno.
/* El pase: lo firma esta función con la clave de servicio (HMAC-SHA256) al confirmar la cuenta de Microsoft. Así el
   envío no depende de que la sesión de Microsoft siga viva: la página la cierra enseguida. Caduca en 3 horas. */
const PASE_MS = 3 * 3600_000;
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
const llave = (secreto: string) => crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
interface Pase { slug: string; correo: string; nombre: string; exp: number }
async function firmarPase(p: Pase, secreto: string): Promise<string> {
  const cuerpo = b64(new TextEncoder().encode(JSON.stringify(p)));
  return `${cuerpo}.${b64(await crypto.subtle.sign("HMAC", await llave(secreto), new TextEncoder().encode(cuerpo)))}`;
}
async function abrirPase(t: string, secreto: string): Promise<Pase | null> {
  const [cuerpo, firma] = t.split(".");
  if (!cuerpo || !firma) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await llave(secreto), deB64(firma), new TextEncoder().encode(cuerpo)))) return null;
    const p = JSON.parse(new TextDecoder().decode(deB64(cuerpo))) as Pase;
    return typeof p.exp === "number" && p.exp > Date.now() && typeof p.correo === "string" && typeof p.slug === "string" ? { ...p, nombre: String(p.nombre ?? "") } : null;
  } catch {
    return null;
  }
}

const PETICIONES = new Map<string, number[]>();
function demasiadas(ip: string): boolean {
  const ahora = Date.now();
  const recientes = (PETICIONES.get(ip) ?? []).filter((t) => ahora - t < 60_000);
  recientes.push(ahora);
  PETICIONES.set(ip, recientes);
  if (PETICIONES.size > 5000) for (const [k, v] of PETICIONES) if (!v.some((t) => ahora - t < 60_000)) PETICIONES.delete(k);
  return recientes.length > 60;
}

interface FilaEncuesta {
  id: string;
  slug: string;
  titulo: string;
  anio: string;
  intro: string;
  despedida: string;
  abierta: boolean;
  cierra_el: string | null;
  abre_el: string | null;
  estado: EstadoEncuesta;
  acceso: AccesoEncuesta;
  dominios_permitidos: string[];
  una_por_persona: boolean;
  limite_respuestas: number | null;
  mensaje_cierre: string;
  modo_llenado: string;
  config_pilo: Record<string, unknown>;
  version_publicada_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function cargar(admin: Admin, slug: string): Promise<{ e: FilaEncuesta | null; error?: string }> {
  const r = await admin.from("enc_encuestas").select("*").eq("slug", slug).maybeSingle();
  if (r.error) return { e: null, error: r.error.message as string };
  return { e: (r.data ?? null) as FilaEncuesta | null };
}

async function estructuraPublicada(admin: Admin, e: FilaEncuesta): Promise<Estructura | null> {
  if (!e.version_publicada_id) return null;
  const v = await admin.from("enc_versiones").select("estructura").eq("id", e.version_publicada_id).maybeSingle();
  return (v.data?.estructura ?? null) as Estructura | null;
}

/** El flujo viejo (aportes con cifras, enc_enviar) sigue para las encuestas que lo piden en su configuración. */
const flujoDe = (e: FilaEncuesta): "aportes" | "respuestas" => (e.config_pilo?.flujo === "aportes" ? "aportes" : "respuestas");

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
    if (texto.length > 500_000) return json({ error: "El envío es demasiado grande." }, 413);
    c = JSON.parse(texto || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  if (limpiar(c.web)) return json({ error: "Petición no válida." }, 400);

  const slug = String(c.slug ?? "");
  if (!SLUG.test(slug) || slug.length > 60) return json({ error: "Esta encuesta no existe." }, 404);
  const accion = String(c.accion ?? c.action ?? "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (accion === "info") {
    const { e, error } = await cargar(admin, slug);
    if (error) {
      if (/does not exist|schema cache|permission denied|column/i.test(error)) return json({ error: "Falta aplicar la migración 0184 (Editor de encuestas con Pilo).", code: "migracion" }, 500);
      console.error("encuestas info", error);
      return json({ error: "No se pudo completar la operación. Intente de nuevo." }, 500);
    }
    if (!e) return json({ error: "Esta encuesta no existe." }, 404);
    const motivo = motivoCierre(e);
    // La estructura solo sale de una encuesta ya publicada: un borrador no se asoma.
    const estructura = e.estado === "borrador" ? null : await estructuraPublicada(admin, e);
    return json({
      encuesta: {
        slug: e.slug,
        titulo: e.titulo,
        anio: e.anio,
        intro: e.intro,
        despedida: e.despedida,
        abierta: motivo === null,
        cierra_el: e.cierra_el,
        abre_el: e.abre_el,
        estado: e.estado,
        motivo_cierre: motivo,
        mensaje_cierre: e.mensaje_cierre || (motivo ? MENSAJE_CIERRE[motivo] : ""),
        acceso: e.acceso,
        dominios: e.dominios_permitidos,
        una_por_persona: e.una_por_persona,
        modo_llenado: e.modo_llenado,
        config_pilo: e.config_pilo,
        flujo: flujoDe(e),
        estructura,
      },
    });
  }

  // Verificación contra robots (acceso abierto): una cuenta sencilla con su pase firmado.
  if (accion === "reto") {
    const { e } = await cargar(admin, slug);
    if (!e) return json({ error: "Esta encuesta no existe." }, 404);
    if (e.acceso !== "abierta") return json({ error: "Esta encuesta no usa verificación." }, 400);
    return json(await crearReto(slug, serviceKey));
  }

  // Envío de una encuesta del modelo nuevo: con el pase de Microsoft o, si el acceso es abierto, sin sesión.
  if (accion === "responder") {
    const { e, error } = await cargar(admin, slug);
    if (error) return json({ error: "No se pudo completar la operación. Intente de nuevo." }, 500);
    if (!e) return json({ error: "Esta encuesta no existe." }, 404);
    const motivo = motivoCierre(e);
    if (motivo) return json({ error: e.mensaje_cierre || MENSAJE_CIERRE[motivo], code: "cerrada" }, 403);
    if (flujoDe(e) === "aportes") return json({ error: "Esta encuesta recibe sus aportes por otro camino." }, 400);
    const estructura = await estructuraPublicada(admin, e);
    if (!estructura || validarEstructura(estructura).length) return json({ error: "La encuesta no está lista en el servidor. Avise a Planeación Institucional.", code: "migracion" }, 500);

    let correo: string | null = null;
    let verificado = false;
    let nombre = "";
    if (e.acceso === "microsoft") {
      const p = await abrirPase(limpiar(c.pase), serviceKey);
      if (!p || p.slug !== slug) return json({ error: "La confirmación de Microsoft venció. Vuelva a pulsar «Continuar con Microsoft».", code: "microsoft" }, 401);
      if (!correoPermitido(p.correo) || !dominioPermitido(p.correo, e.dominios_permitidos)) return json({ error: `El correo ${p.correo} no está entre los permitidos para esta encuesta.`, code: "dominio" }, 403);
      correo = p.correo;
      verificado = true;
      nombre = p.nombre;
    } else {
      const reto = await comprobarReto(slug, c.reto_pase, c.reto_respuesta, serviceKey);
      if (reto !== "ok") {
        const m = reto === "rapido" ? "Fue muy rápido. Espere unos segundos y envíe de nuevo." : reto === "vencido" ? "La verificación venció. Resuelva la cuenta de nuevo." : "Resuelva la cuenta para confirmar que es una persona.";
        return json({ error: m, code: "robot" }, 400);
      }
      if (e.config_pilo?.datos_personales === true) {
        nombre = limpiar(c.nombre).slice(0, 120);
        if (c.consentimiento !== true) return json({ error: "Para enviar sus datos necesitamos su consentimiento.", campo: "consentimiento" }, 400);
      }
    }

    // Solo cuenta lo que se ve con la lógica «mostrar si»; lo demás se descarta.
    const crudos = (c.valores !== null && typeof c.valores === "object" && !Array.isArray(c.valores) ? c.valores : {}) as Valores;
    const valores = valoresVisibles(estructura, crudos);
    const errores = validarRespuestas(estructura, valores);
    const primero = Object.entries(errores)[0];
    if (primero) return json({ error: primero[1], campo: primero[0], errores }, 400);

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
    const r = await admin.rpc("enc_enviar_respuesta", { p_slug: slug, p_correo: correo, p_verificado: verificado, p_nombre: nombre || null, p_consentimiento: c.consentimiento === true, p_valores: valores, p_huella: await huellaDe(ip, serviceKey) });
    if (r.error) {
      const { code = "", message } = r.error as { code?: string; message: string };
      if (code === "P0002") return json({ error: message }, 404);
      if (code === "P0003") return json({ error: e.mensaje_cierre || message, code: "cerrada" }, 403);
      if (code === "P0004") return json({ error: message, code: "frenado" }, 429);
      if (code === "P0005") return json({ error: message, code: "ya_respondio" }, 409);
      if (code === "P0006") return json({ error: e.mensaje_cierre || message, code: "limite" }, 403);
      if (code === "22023") return json({ error: message }, 400);
      if (/does not exist|schema cache|permission denied/i.test(message)) return json({ error: "Falta aplicar la migración 0184 (Editor de encuestas con Pilo).", code: "migracion" }, 500);
      console.error("encuestas responder", message);
      return json({ error: "No se pudo guardar su respuesta. Intente de nuevo." }, 500);
    }
    return json({ ok: true, id: (r.data as { id: string }).id });
  }

  if (accion === "microsoft_datos" || accion === "enviar") {
    let correo = "";
    let nombre = "";
    if (accion === "microsoft_datos") {
      // La cuenta de Microsoft: el token lo emitió Supabase Auth al volver de Azure.
      const jwt = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (jwt.length < 20) return json({ error: "No llegó la confirmación de Microsoft. Intente de nuevo.", code: "microsoft" }, 401);
      const u = await admin.auth.getUser(jwt);
      const usuario = u.data.user;
      if (u.error || !usuario) return json({ error: "La confirmación de Microsoft venció. Vuelva a pulsar «Continuar con Microsoft».", code: "microsoft" }, 401);
      const deAzure = usuario.app_metadata?.provider === "azure" || (usuario.identities ?? []).some((x) => x.provider === "azure");
      if (!deAzure) return json({ error: "Esa sesión no es de una cuenta de Microsoft.", code: "microsoft" }, 401);
      const meta = (usuario.user_metadata ?? {}) as Record<string, unknown>;
      correo = limpiar(usuario.email ?? meta.email).toLowerCase();
      nombre = limpiar(meta.full_name ?? meta.name);
    } else {
      // El envío llega minutos después, cuando la sesión de Microsoft ya se cerró: va con el pase que dio microsoft_datos.
      const p = await abrirPase(limpiar(c.pase), serviceKey);
      if (!p || p.slug !== slug) return json({ error: "La confirmación de Microsoft venció. Vuelva a pulsar «Continuar con Microsoft».", code: "microsoft" }, 401);
      correo = p.correo;
      nombre = p.nombre;
    }
    if (!correoPermitido(correo)) {
      return json({ error: `El correo de su cuenta Microsoft (${correo || "sin correo"}) no es un correo institucional de la UDES. Ingrese con su cuenta @udes.edu.co.`, code: "dominio" }, 403);
    }
    // Y de los dominios que esta encuesta permita (los de la encuesta pueden ser menos que los de la UDES).
    const { e: destino } = await cargar(admin, slug);
    if (destino && !dominioPermitido(correo, destino.dominios_permitidos)) {
      return json({ error: `Esta encuesta no admite el correo ${correo}. Ingrese con una cuenta permitida (${destino.dominios_permitidos.map((d) => `@${d}`).join(", ")}).`, code: "dominio" }, 403);
    }
    if (accion === "microsoft_datos") return json({ correo, nombre, pase: await firmarPase({ slug, correo, nombre, exp: Date.now() + PASE_MS }, serviceKey) });

    const dependencia = limpiar(c.dependencia);
    const aportes = c.aportes;
    const v = validarEnvio(dependencia, aportes);
    if (!v.ok) return json({ error: v.mensaje, campo: v.campo }, 400);
    const limpios = (aportes as AporteEnvio[]).map(normalizarAporte);

    const r = await admin.rpc("enc_enviar", { p_slug: slug, p_correo: correo, p_verificado: true, p_dependencia: dependencia, p_aportes: limpios });
    if (r.error) {
      const { code = "", message } = r.error;
      if (code === "P0002") return json({ error: message }, 404);
      if (code === "P0003") return json({ error: message, code: "cerrada" }, 403);
      if (code === "22023") {
        const m = /^([\w.\[\]]+): (.+)$/.exec(message);
        return json(m ? { error: m[2], campo: m[1] } : { error: message }, 400);
      }
      if (/does not exist|schema cache|permission denied/i.test(message)) return json({ error: "Falta aplicar la migración 0179 (Encuestas con Pilo).", code: "migracion" }, 500);
      console.error("encuestas enviar", message);
      return json({ error: "No se pudo guardar su envío. Intente de nuevo." }, 500);
    }
    return json(r.data);
  }

  return json({ error: "Acción desconocida." }, 400);
});
