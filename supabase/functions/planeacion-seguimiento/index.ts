/* =============================================================================
   Edge Function · planeacion-seguimiento

   Envía los avisos por correo de Planeación y Seguimiento (migración 0287). La base
   deja cada aviso en la cola ps_avisos (al asignar, transferir, devolver, cerrar una
   actividad y al generar vencimientos); esta función los toma y le pide a la función
   `correos` que los envíe con las plantillas editables c-ps-* (pantalla «Correos»).
   El correo sale por el mismo servidor, con el mismo tope, los mismos dominios
   permitidos y la misma bitácora (correo_log, destinatario enmascarado) que los demás.

   POST, dos acciones:

     { action: "avisos" }        → { ok, enviados, errores, omitidos, pendientes }
         Vacía la cola (hasta 3 intentos por aviso; luego queda en «error»).
         Quién: la sesión de alguien con acceso al módulo (ps_puede('ver')), el cron
         (cabecera x-ps-cron = secreto PS_AVISOS_CRON) o la clave de servicio.

     { action: "vencimientos" }  → { ok, generados:{por_vencer, vencidas, gestor}, enviados, … }
         LA LLAMA EL CRON, una vez al día (por ejemplo a las 7:00 de Bogotá). Genera los
         avisos de vencimiento del día (ps_generar_avisos_vencimiento: idempotente) y
         después vacía la cola. Solo con x-ps-cron o la clave de servicio.

   Variables de entorno:
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (las pone la plataforma)
     PS_AVISOS_CRON          secreto del cron (obligatorio para la acción vencimientos con cron)
     CORREOS_FUNCION_URL     opcional: dirección de la función `correos` si no es SUPABASE_URL/functions/v1/correos
     CORREOS_URL_PUBLICA     opcional: https://planeacion.udes.edu.co, para el enlace del botón
     PS_RUTA_ENLACE          opcional: ruta de la intranet del enlace (por omisión /admin/planeacion-seguimiento/mis-tareas)

   Despliegue: supabase functions deploy planeacion-seguimiento --no-verify-jwt  (las acciones validan la sesión a mano).
   Ver README.md de esta carpeta.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { enlaceDe, esPlantillaPs, estadoTrasIntento, iguales, INTENTOS, limpio, POR_LOTE, redactar, type AvisoCola } from "./avisos.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ps-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const ENV = (k: string) => Deno.env.get(k) ?? "";
// deno-lint-ignore no-explicit-any
type Cliente = any;
const PRESUPUESTO_MS = 100_000;
const MAX_LOTES = 5;

interface Resultado {
  enviados: number;
  errores: number;
  omitidos: number;
  pendientes: number;
}

/** Vacía la cola ps_avisos: hasta MAX_LOTES lotes de POR_LOTE dentro del presupuesto de tiempo. */
async function vaciarCola(admin: Cliente, url: string, serviceKey: string, origen: string): Promise<Resultado> {
  const sitio = /^https:\/\/[^/]+$/.test(origen) ? origen : ENV("CORREOS_URL_PUBLICA");
  const funcion = ENV("CORREOS_FUNCION_URL") || `${url.replace(/\/+$/, "")}/functions/v1/correos`;
  const ruta = ENV("PS_RUTA_ENLACE") || "/admin/planeacion-seguimiento/mis-tareas";
  const inicio = Date.now();
  const r: Resultado = { enviados: 0, errores: 0, omitidos: 0, pendientes: 0 };

  for (let lote = 0; lote < MAX_LOTES && Date.now() - inicio < PRESUPUESTO_MS; lote++) {
    const cola = await admin
      .from("ps_avisos")
      .select("id, plantilla, destinatario_id, actividad_id, datos, intentos")
      .eq("estado", "pendiente")
      .order("creado_en", { ascending: true })
      .limit(POR_LOTE);
    if (cola.error) throw new Error("No se pudo leer la cola de avisos.");
    const avisos = (cola.data ?? []) as AvisoCola[];
    if (!avisos.length) break;

    for (const aviso of avisos) {
      if (Date.now() - inicio >= PRESUPUESTO_MS) break;
      // Se reserva el aviso (compare-and-swap sobre los intentos): dos ejecuciones a la vez no lo envían dos veces.
      const reservado = await admin
        .from("ps_avisos")
        .update({ intentos: aviso.intentos + 1 })
        .eq("id", aviso.id)
        .eq("estado", "pendiente")
        .eq("intentos", aviso.intentos)
        .select("id");
      if (reservado.error || !reservado.data?.length) continue;

      if (!esPlantillaPs(aviso.plantilla)) {
        await admin.from("ps_avisos").update({ estado: "omitido", error: "Plantilla no válida." }).eq("id", aviso.id);
        r.omitidos++;
        continue;
      }
      const perfil = await admin.from("profiles").select("email, full_name, is_active").eq("id", aviso.destinatario_id).maybeSingle();
      const correo = limpio(perfil.data?.email, 254).toLowerCase();
      if (!perfil.data?.is_active || !correo) {
        await admin.from("ps_avisos").update({ estado: "omitido", error: "Sin correo o cuenta inactiva." }).eq("id", aviso.id);
        r.omitidos++;
        continue;
      }
      const texto = redactar(aviso);
      let motivo = "";
      try {
        const respuesta = await fetch(funcion, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({
            action: "ps",
            to: correo,
            nombre: limpio(perfil.data?.full_name, 120),
            clave: aviso.plantilla,
            valores: {
              titulo_aviso: texto.titulo,
              detalle: texto.detalle,
              oficina: texto.oficina,
              fecha_limite: texto.fecha_limite,
              dias: texto.dias,
              comentario: texto.comentario,
              autor: texto.autor,
            },
            enlace: enlaceDe(sitio, ruta, aviso.actividad_id),
            sitio,
          }),
        });
        const salida = (await respuesta.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (respuesta.ok && salida?.ok) {
          await admin.from("ps_avisos").update({ estado: "enviado", enviado_en: new Date().toISOString(), error: "" }).eq("id", aviso.id);
          r.enviados++;
          continue;
        }
        motivo = limpio(salida?.error, 280) || `La función de correos respondió ${respuesta.status}.`;
      } catch {
        motivo = "No se pudo llegar a la función de correos.";
      }
      r.errores++;
      // Hasta INTENTOS veces; después queda en error y no se reintenta solo.
      await admin.from("ps_avisos").update({ error: motivo, estado: estadoTrasIntento(aviso.intentos + 1, false, INTENTOS) }).eq("id", aviso.id);
    }
  }
  const restantes = await admin.from("ps_avisos").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
  r.pendientes = restantes.count ?? 0;
  return r;
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
  const accion = String(cuerpo.action ?? "");
  if (accion !== "avisos" && accion !== "vencimientos") return json({ error: "Acción desconocida." }, 400);

  const authorization = request.headers.get("Authorization") ?? "";
  const secreto = ENV("PS_AVISOS_CRON");
  const esCron =
    (secreto !== "" && iguales(request.headers.get("x-ps-cron") ?? "", secreto)) ||
    (authorization.startsWith("Bearer ") && iguales(authorization.slice(7), serviceKey));
  const admin: Cliente = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (accion === "vencimientos") {
      if (!esCron) return json({ error: "No autorizado." }, 401);
      const generados = await admin.rpc("ps_generar_avisos_vencimiento");
      if (generados.error) {
        return json({ error: /ps_generar_avisos_vencimiento/.test(generados.error.message) ? "Falta aplicar la migración 0287 (Planeación y Seguimiento, fase 2)." : "No se pudieron generar los avisos de vencimiento." }, 500);
      }
      const resultado = await vaciarCola(admin, url, serviceKey, request.headers.get("Origin") ?? "");
      return json({ ok: true, generados: generados.data, ...resultado });
    }

    // accion === "avisos": el cron o una sesión con acceso al módulo.
    if (!esCron) {
      if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
      const quien = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
      const permiso = await quien.rpc("ps_puede", { p_accion: "ver" });
      if (permiso.error) return json({ error: "No se pudo comprobar el permiso." }, 500);
      if (permiso.data !== true) return json({ error: "Sin acceso a Planeación y Seguimiento." }, 403);
    }
    const resultado = await vaciarCola(admin, url, serviceKey, request.headers.get("Origin") ?? "");
    return json({ ok: true, ...resultado });
  } catch (e) {
    // Solo el tipo de falla: el mensaje podría traer una dirección.
    const tipo = (e as { name?: string } | null)?.name ?? "Error";
    return json({ error: `Algo falló al atender el pedido (${tipo}). Revise los registros de la función planeacion-seguimiento.`, code: "interno" }, 500);
  }
});
