/* =============================================================================
   Edge Function · gestion-master

   Envía los avisos por correo de Gestión Master (migración 0194). La base deja
   cada aviso en la cola gm_avisos al enviar, aprobar, devolver o cerrar una
   solicitud; esta función los toma y le pide a la función `correos` que los
   envíe con las plantillas editables c-gm-* (pantalla «Correos»). Así el correo
   sale por el mismo servidor, con el mismo tope, los mismos dominios permitidos
   y la misma bitácora (correo_log) que los demás, y aquí queda además el
   resultado de cada aviso (gm_avisos.estado).

   Un solo POST, con la sesión de quien actúa (el navegador lo llama justo
   después de enviar o decidir una solicitud):

     { action: "avisos" }  → { ok, enviados, errores, pendientes }

   Quién puede: cualquiera con acceso al módulo (gm_puede('ver')). No decide a
   quién se escribe ni qué dice: eso ya está en la cola. Un aviso se intenta tres
   veces; después queda en «error» con el motivo, y no se vuelve a pedir.

   Variables de entorno:
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (las pone la plataforma)
     CORREOS_FUNCION_URL     opcional: la dirección de la función `correos` si no es SUPABASE_URL/functions/v1/correos
                             (recuerde que el gancho de cuentas va por https, no por la red interna: ver docs/correos-en-coolify.md)
     CORREOS_URL_PUBLICA     opcional: https://planeacion.udes.edu.co, para el enlace del botón

   Despliegue: igual que las demás funciones (ver docs/correos-en-coolify.md y src/modules/gestion-master/README.md).
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const ENV = (k: string) => Deno.env.get(k) ?? "";

const SEDES: Record<string, string> = { buc: "Bucaramanga", cuc: "Cúcuta", val: "Valledupar", bog: "Bogotá" };
const POR_LOTE = 20;
const INTENTOS = 3;

interface Aviso {
  id: number;
  solicitud_id: string | null;
  plantilla: string;
  destinatario_id: string;
  datos: Record<string, unknown>;
  intentos: number;
}

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** El título y el detalle de cada aviso, con lo que dejó la base. La nota de una decisión viaja tal cual: la función correos le quita los marcadores. */
function redactar(a: Aviso): { titulo: string; detalle: string } {
  const d = a.datos;
  const donde = `${s(d.periodo, 10).toUpperCase()} · ${SEDES[s(d.sede, 3)] ?? s(d.sede, 3)}`;
  const base = `${s(d.folio, 40)}: ${s(d.tipo, 80)}. Actividades: ${s(d.actividades, 400) || "sin detalle"}. ${donde}. Unidad: ${s(d.unidad, 120)}.`;
  const nota = s(d.nota, 600) ? ` Nota: ${s(d.nota, 600)}` : "";
  const paso = s(d.paso, 120);
  switch (a.plantilla) {
    case "c-gm-acuse":
      return { titulo: "Su solicitud quedó registrada", detalle: base };
    case "c-gm-turno":
      return { titulo: "Una solicitud espera su decisión", detalle: `${base} Solicitante: ${s(d.solicitante, 120)}.` };
    case "c-gm-avance":
      return { titulo: "Un paso aprobó su solicitud", detalle: `${base} Aprobó: ${paso}.${nota}` };
    case "c-gm-devuelta":
      return { titulo: "Su solicitud fue devuelta", detalle: `${base} Devolvió: ${paso}.${nota}` };
    default: {
      const estado = s(d.estado, 20);
      const titulo = /^reflejada/i.test(paso) ? "El Master ya refleja el cambio" : estado === "rechazada" ? "Su solicitud fue rechazada" : "Su solicitud fue aprobada";
      return { titulo, detalle: `${base} ${paso ? `Decidió: ${paso}.` : ""}${nota}` };
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const url = ENV("SUPABASE_URL");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "La función no está configurada." }, 500);

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  if (String(cuerpo.action ?? "") !== "avisos") return json({ error: "Acción desconocida." }, 400);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const quien = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const permiso = await quien.rpc("gm_puede", { p_accion: "ver" });
  if (permiso.error) return json({ error: /gm_puede/.test(permiso.error.message) ? "Falta aplicar la migración 0194 (Gestión Master)." : "No se pudo comprobar el permiso." }, 500);
  if (permiso.data !== true) return json({ error: "Sin acceso a Gestión Master." }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const cola = await admin
    .from("gm_avisos")
    .select("id, solicitud_id, plantilla, destinatario_id, datos, intentos")
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true })
    .limit(POR_LOTE);
  if (cola.error) return json({ error: "No se pudo leer la cola de avisos." }, 500);

  const origen = request.headers.get("Origin") ?? "";
  const sitio = /^https:\/\/[^/]+$/.test(origen) ? origen : ENV("CORREOS_URL_PUBLICA");
  const funcion = ENV("CORREOS_FUNCION_URL") || `${url.replace(/\/+$/, "")}/functions/v1/correos`;

  let enviados = 0;
  let errores = 0;
  for (const aviso of (cola.data ?? []) as Aviso[]) {
    // Se reserva el aviso (compare-and-swap sobre los intentos): dos pantallas abiertas no lo envían dos veces.
    const reservado = await admin
      .from("gm_avisos")
      .update({ intentos: aviso.intentos + 1 })
      .eq("id", aviso.id)
      .eq("estado", "pendiente")
      .eq("intentos", aviso.intentos)
      .select("id");
    if (reservado.error || !reservado.data?.length) continue;

    const perfil = await admin.from("profiles").select("email, full_name, is_active").eq("id", aviso.destinatario_id).maybeSingle();
    const correo = s(perfil.data?.email, 254).toLowerCase();
    if (!perfil.data?.is_active || !correo) {
      await admin.from("gm_avisos").update({ estado: "omitido", error: "Sin correo o cuenta inactiva." }).eq("id", aviso.id);
      continue;
    }
    const { titulo, detalle } = redactar(aviso);
    let motivo = "";
    try {
      const respuesta = await fetch(funcion, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({
          action: "gm",
          to: correo,
          nombre: s(perfil.data?.full_name, 120),
          clave: aviso.plantilla,
          valores: { folio: s(aviso.datos.folio, 40), titulo_aviso: titulo, detalle },
          enlace: aviso.solicitud_id && sitio ? `${sitio.replace(/\/+$/, "")}/admin/gestion-master/bandeja/${aviso.solicitud_id}` : "",
          sitio,
        }),
      });
      const salida = (await respuesta.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (respuesta.ok && salida?.ok) {
        await admin.from("gm_avisos").update({ estado: "enviado", enviado_en: new Date().toISOString(), error: "" }).eq("id", aviso.id);
        enviados++;
        continue;
      }
      motivo = s(salida?.error, 280) || `La función de correos respondió ${respuesta.status}.`;
    } catch {
      motivo = "No se pudo llegar a la función de correos.";
    }
    errores++;
    // Hasta INTENTOS veces; después queda en error y no se reintenta solo.
    await admin
      .from("gm_avisos")
      .update({ error: motivo, estado: aviso.intentos + 1 >= INTENTOS ? "error" : "pendiente" })
      .eq("id", aviso.id);
  }

  const restantes = await admin.from("gm_avisos").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
  return json({ ok: true, enviados, errores, pendientes: restantes.count ?? 0 });
});
