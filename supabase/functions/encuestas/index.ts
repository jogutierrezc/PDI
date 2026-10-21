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
                                                    → { recibidos, cifras }

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
    const r = await admin.from("enc_encuestas").select("slug,titulo,anio,intro,despedida,abierta,cierra_el").eq("slug", slug).maybeSingle();
    if (r.error) {
      if (/does not exist|schema cache|permission denied/i.test(r.error.message)) return json({ error: "Falta aplicar la migración 0179 (Encuestas con Pilo).", code: "migracion" }, 500);
      console.error("encuestas info", r.error.message);
      return json({ error: "No se pudo completar la operación. Intente de nuevo." }, 500);
    }
    if (!r.data) return json({ error: "Esta encuesta no existe." }, 404);
    return json({ encuesta: r.data });
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
