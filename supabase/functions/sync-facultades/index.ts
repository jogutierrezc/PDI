/* =============================================================================
   Edge Function · sync-facultades
   Trae los planes de trabajo de las facultades desde la API «Plan de Trabajo
   Decanatura UDES 2026» (api-planes), con la misma clave que usa informe-plan.

     GET /planes       → { total, datos: [ { facultad, decano, fase_actual, … } ] }
     GET /acciones     → { total, datos: [ { facultad, accion por id d1_2, … } ] }
     GET /actividades  → { total, datos: [ { facultad, accion_id, id, corte, … } ] }
     GET /seguimientos → { total, datos: [ { facultad, accion_id, corte, … } ] }

   Sin `?facultad=` cada ruta devuelve todas; la sincronización llama cada una
   una sola vez y agrupa en memoria. `faculties.code` usa los mismos códigos
   que la API (FCS, FIT, FCMS, FCN, FCAV, FCEAC, CFTT), así que el encuentro
   con el catálogo del portal es directo.

   -----------------------------------------------------------------------------
   Por qué el portal sincroniza en vez de leer el origen en cada visita

   Cada visitante esperaría la respuesta de la API, sin caché, y una página
   pública se quedaría en blanco cada vez que la API tarde o cambie. Además
   el pilar llega como texto y hay que resolverlo contra `pillars`.

   Sincronizando, el portal sirve siempre lo último que trajo, con la misma
   caché que el resto del sitio, y una caída del origen se nota en la bandeja
   de la intranet —donde alguien puede hacer algo— y no en la cara del
   visitante.

   -----------------------------------------------------------------------------
   LA REGLA: la sincronización no pisa lo que decidió el portal

   Cada acción se reconoce por el identificador que le puso el origen
   (`source_id`, del estilo "d1_2") dentro de su facultad. Con él se actualiza
   solo lo que la facultad escribe —el texto de la acción, la meta, los
   recursos, el responsable, la fecha, las actividades y el seguimiento—.

   Se quedan intactos, porque son decisiones del portal y no del origen:
   `status` (si está publicada), `note`, `area_id` y `action_line_id`. Sin esa
   separación, corregir un anclaje sería inútil: la corrida siguiente lo
   borraría y nadie relacionaría una cosa con la otra.

   Tampoco borra. Una acción que desaparece del origen se reporta en la
   respuesta (`orphans`) y se deja como está: borrarla se llevaría por delante
   lo que alguien revisó, y no hay forma de distinguir "la quitaron" de "la
   hoja vino incompleta esta vez".

   -----------------------------------------------------------------------------
   Despliegue

     La clave y la dirección de la API son los secretos de informe-plan:
     PLAN_API_KEY y PLAN_API_URL (migración de configuración 0167).

     supabase secrets set FACULTY_SYNC_TOKEN="<una cadena larga y aleatoria>"

   Quien la llama se identifica de una de dos maneras:

     · con la sesión del portal, si su rol es `planeacion` o superior —es lo que
       usa el botón "Sincronizar ahora" de la intranet—, o
     · con la cabecera `x-sync-token`, para un cron que corra solo.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

/* --- Lo que devuelve cada ruta de la API ------------------------------------ */

interface ApiPlan {
  facultad?: string;
  decano?: string;
  fase_actual?: string;
  actualizado?: string;
}

interface ApiAccion {
  facultad?: string;
  id?: string;
  dimension?: string;
  dimension_nombre?: string;
  accion?: string;
  pilar?: string;
  responsable?: string;
  fecha_limite?: string;
  recursos?: string;
  meta?: string;
  estado_inicial?: string;
  presupuesto_ordinario?: boolean;
  presupuesto_mejoramiento?: boolean;
}

interface ApiActividad {
  facultad?: string;
  accion_id?: string;
  id?: string;
  descripcion?: string;
  responsable?: string;
  fecha?: string;
  corte?: string;
  estado?: string;
  link_evidencia?: string;
}

interface ApiSeguimiento {
  facultad?: string;
  accion_id?: string;
  corte?: string;
  fecha?: string;
  avance?: number;
  estado?: string;
  notas?: string;
  link_evidencia_accion?: string;
}

/** La fila de `faculties` que necesita la sincronización. */
interface FacultyRow {
  id: string;
  code: string;
  slug: string;
  name: string;
}

/** La acción ya guardada, para saber qué es nuevo y qué se actualiza. */
interface KnownAction {
  id: string;
  source_id: string;
  title: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  // supabase-js manda dos cabeceras propias en cada petición, además de las que
  // se declaran aquí: `x-client-info` (la pone auth-js por defecto) y `apikey`
  // (la añade el cliente de funciones). Si no están en esta lista, el navegador
  // rechaza el preflight aunque la función responda 200: el log dice
  // "OPTIONS | 200" y la consola dice "Request header field x-client-info is
  // not allowed by Access-Control-Allow-Headers". Cuesta de ver porque las dos
  // cosas parecen contradecirse, y no se contradicen.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparación en tiempo constante: un `===` sobre el token filtra, por lo que
 *  tarda en fallar, cuántos caracteres del principio son correctos. */
function sameToken(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** El origen escribe "Por definir" donde todavía no hay fecha. Es información,
 *  no un error: se guarda el texto tal cual y la fecha queda nula. */
function toDate(value: unknown): string | null {
  const clean = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

const STATUS: Record<string, "pendiente" | "proceso" | "completado"> = {
  "pendiente": "pendiente",
  "en proceso": "proceso",
  "completado": "completado",
  "completada": "completado",
};

function toStatus(value: unknown): "pendiente" | "proceso" | "completado" {
  return STATUS[text(value).toLowerCase()] ?? "pendiente";
}

/** El avance llega de 0 a 100. Se recorta en vez de rechazarse: un 120 mal
 *  escrito en el origen no debe tumbar la sincronización de toda una facultad. */
function toProgress(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function pedir(base: string, clave: string, ruta: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${base.replace(/\/$/, "")}/${ruta}`, {
    headers: { "x-api-key": clave },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`El origen respondió ${response.status} en /${ruta}.`);
  const body = (await response.json()) as { datos?: Record<string, unknown>[] };
  return body.datos ?? [];
}

/* -----------------------------------------------------------------------------
   Una excepción sin recoger sale de la plataforma como `EDGE_FUNCTION_ERROR`:
   un 500 sin mensaje, sin línea y sin pista de en qué paso estaba. Quien lo ve
   solo sabe que "algo falló en el servidor", que es lo mismo que no saber nada.

   Envolver el manejador convierte eso en un mensaje que se puede leer desde la
   intranet, y deja la traza en los logs de la función para quien pueda verlos.
   -------------------------------------------------------------------------- */

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (cause) {
    console.error("sync-facultades falló:", cause);
    return json(
      {
        error: cause instanceof Error ? cause.message : "Error inesperado en la sincronización.",
        where: "Excepción no controlada; mira los logs de la función para la traza completa.",
      },
      500,
    );
  }
});

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiBase = Deno.env.get("PLAN_API_URL");
  const apiKey = Deno.env.get("PLAN_API_KEY");
  const expected = Deno.env.get("FACULTY_SYNC_TOKEN");

  // Decir cuál falta, y no "algo falta". Las tres primeras las inyecta la
  // plataforma; la clave y la dirección de la API hay que ponerlas a mano, y
  // son las mismas de informe-plan.
  const missing = [
    !url && "SUPABASE_URL",
    !anonKey && "SUPABASE_ANON_KEY",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !apiBase && "PLAN_API_URL",
    !apiKey && "PLAN_API_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error("Faltan variables de entorno:", missing.join(", "));
    return json(
      {
        error: `Falta configurar ${missing.join(", ")}.`,
        advice: "Son los secretos de informe-plan: PLAN_API_URL y PLAN_API_KEY.",
      },
      500,
    );
  }

  /* --- Quién llama -------------------------------------------------------- */

  const givenToken = request.headers.get("x-sync-token") ?? "";
  let allowed = Boolean(expected) && sameToken(givenToken, expected as string);

  if (!allowed) {
    // Sin token, se exige una sesión del portal con rol suficiente. Se
    // comprueba con la clave anónima y el JWT de quien llama, nunca con la de
    // servicio: preguntar "¿quién eres?" con la llave maestra siempre dice que
    // sí.
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization) return json({ error: "Falta identificarse." }, 401);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: auth } = await caller.auth.getUser();
    if (!auth?.user) return json({ error: "La sesión no es válida." }, 401);

    // Se lee el perfil con el cliente de quien llama, no con el de servicio:
    // así las políticas de `profiles` siguen mandando y esta comprobación no
    // puede ver más de lo que esa persona ve.
    const { data: profile } = await caller
      .from("profiles")
      .select("role, is_active")
      .eq("id", auth.user.id)
      .maybeSingle();

    allowed =
      profile?.is_active === true &&
      (profile.role === "planeacion" || profile.role === "admin");
  }

  if (!allowed) {
    return json({ error: "Hace falta rol de planeación para sincronizar." }, 403);
  }

  /* --- El catálogo de facultades del portal -------------------------------- */

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: faculties, error: facultiesError } = await admin
    .from("faculties")
    .select("id, code, slug, name");
  if (facultiesError) {
    console.error("Al leer faculties:", facultiesError);
    return json(
      { error: `No se pudo leer el catálogo de facultades: ${facultiesError.message}` },
      500,
    );
  }

  const facultyByCode = new Map(
    ((faculties ?? []) as FacultyRow[]).map((row) => [row.code.toUpperCase(), row]),
  );

  /* --- El origen: las cuatro rutas, cada una una sola vez ------------------ */

  let planes: ApiPlan[];
  let acciones: ApiAccion[];
  let actividades: ApiActividad[];
  let seguimientos: ApiSeguimiento[];
  try {
    [planes, acciones, actividades, seguimientos] = (await Promise.all([
      pedir(apiBase as string, apiKey as string, "planes"),
      pedir(apiBase as string, apiKey as string, "acciones"),
      pedir(apiBase as string, apiKey as string, "actividades"),
      pedir(apiBase as string, apiKey as string, "seguimientos"),
    ])) as [ApiPlan[], ApiAccion[], ApiActividad[], ApiSeguimiento[]];
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "El origen no respondió." }, 502);
  }

  // El corte de cada acción que trae datos más recientes: el seguimiento con
  // la fecha más alta. Las actividades se reportan por corte, y la fila que
  // manda es la de ese último corte.
  const lastCutByAction = new Map<string, { corte: string; fecha: string }>();
  for (const row of seguimientos) {
    const key = `${text(row.facultad).toUpperCase()}|${text(row.accion_id)}`;
    const corte = text(row.corte);
    const fecha = text(row.fecha);
    if (!corte || !fecha) continue;
    const best = lastCutByAction.get(key);
    if (!best || fecha > best.fecha) lastCutByAction.set(key, { corte, fecha });
  }

  const actividadesByAction = new Map<string, ApiActividad[]>();
  for (const row of actividades) {
    const key = `${text(row.facultad).toUpperCase()}|${text(row.accion_id)}`;
    if (!actividadesByAction.has(key)) actividadesByAction.set(key, []);
    actividadesByAction.get(key)!.push(row);
  }

  const seguimientosByAction = new Map<string, ApiSeguimiento[]>();
  for (const row of seguimientos) {
    const key = `${text(row.facultad).toUpperCase()}|${text(row.accion_id)}`;
    if (!seguimientosByAction.has(key)) seguimientosByAction.set(key, []);
    seguimientosByAction.get(key)!.push(row);
  }

  const accionesByFaculty = new Map<string, ApiAccion[]>();
  for (const row of acciones) {
    const key = text(row.facultad).toUpperCase();
    if (!accionesByFaculty.has(key)) accionesByFaculty.set(key, []);
    accionesByFaculty.get(key)!.push(row);
  }

  /* --- El reporte de la corrida -------------------------------------------- */

  const report = {
    source: planes.length,
    faculties: 0,
    actions: { created: 0, updated: 0 },
    activities: 0,
    followups: 0,
    /** Acciones que están en el portal pero ya no vienen del origen. No se
     *  borran: se avisan, para que alguien mire. */
    orphans: [] as { faculty: string; source_id: string; title: string }[],
    skipped: [] as { faculty: string; reason: string }[],
  };

  for (const plan of planes) {
    const code = text(plan.facultad).toUpperCase();
    const faculty = facultyByCode.get(code);

    if (!faculty) {
      // No se inventa la facultad: se crea desde la intranet con su slug y su
      // código, y la corrida siguiente la encuentra.
      report.skipped.push({ faculty: code, reason: "no existe en el portal" });
      continue;
    }

    try {
      await admin
        .from("faculties")
        .update({
          // El nombre, el período y la fecha del plan ya no los manda el
          // origen: se quedan con lo que tiene el portal.
          dean: text(plan.decano),
          phase: text(plan.fase_actual),
          source_updated_at: toDate(plan.actualizado),
          synced_at: new Date().toISOString(),
        })
        .eq("id", faculty.id);

      report.faculties += 1;
    } catch (cause) {
      report.skipped.push({
        faculty: code,
        reason: cause instanceof Error ? cause.message : "no se pudo leer el plan",
      });
      continue;
    }

    /* --- Las acciones ------------------------------------------------------ */

    // Este error se ignoraba. Si la consulta falla, `known` queda vacío y la
    // corrida cree que ninguna acción existe todavía: insertaría duplicados de
    // todo el plan de la facultad. Mejor saltarla y decirlo.
    const { data: knownRows, error: knownError } = await admin
      .from("faculty_actions")
      .select("id, source_id, title")
      .eq("faculty_id", faculty.id);

    if (knownError) {
      report.skipped.push({
        faculty: code,
        reason: `no se pudieron leer sus acciones ya guardadas: ${knownError.message}`,
      });
      continue;
    }

    const known = (knownRows ?? []) as KnownAction[];
    const idBySource = new Map(known.map((row) => [row.source_id, row.id]));
    const seen = new Set<string>();

    let position = 0;

    for (const action of accionesByFaculty.get(code) ?? []) {
      const sourceId = text(action.id);
      const title = text(action.accion);
      if (!sourceId || !title) continue;

      seen.add(sourceId);
      position += 1;

      // Solo lo que escribe la facultad. `status`, `note`, `area_id` y
      // `action_line_id` no están aquí a propósito.
      const values = {
        faculty_id: faculty.id,
        source_id: sourceId,
        dimension: text(action.dimension),
        dimension_name: text(action.dimension_nombre),
        declared_pillar: text(action.pilar),
        title,
        owner: text(action.responsable),
        goal: text(action.meta),
        resources: text(action.recursos),
        deadline: toDate(action.fecha_limite),
        deadline_label: text(action.fecha_limite),
        initial_status: toStatus(action.estado_inicial),
        budget_ordinary: action.presupuesto_ordinario === true,
        budget_improvement: action.presupuesto_mejoramiento === true,
        position,
      };

      let actionId = idBySource.get(sourceId);

      if (actionId) {
        const { error } = await admin.from("faculty_actions").update(values).eq("id", actionId);
        if (error) {
          report.skipped.push({ faculty: code, reason: `${sourceId}: ${error.message}` });
          continue;
        }
        report.actions.updated += 1;
      } else {
        const { data, error } = await admin
          .from("faculty_actions")
          .insert(values)
          .select("id")
          .single();
        if (error || !data) {
          report.skipped.push({ faculty: code, reason: `${sourceId}: ${error?.message}` });
          continue;
        }
        actionId = (data as { id: string }).id;
        report.actions.created += 1;
      }

      /* --- Las actividades ------------------------------------------------ */

      // Cada actividad llega una vez por corte; se guarda la fila del último
      // corte con datos, que es la que trae el estado vigente.
      const lastCut = lastCutByAction.get(`${code}|${sourceId}`)?.corte ?? "";
      const byId = new Map<string, ApiActividad>();
      for (const row of actividadesByAction.get(`${code}|${sourceId}`) ?? []) {
        const id = text(row.id);
        if (!id || !text(row.descripcion)) continue;
        const current = byId.get(id);
        if (!current || (lastCut && text(row.corte) === lastCut)) byId.set(id, row);
      }

      const activities = [...byId.values()].map((activity, index) => ({
        action_id: actionId,
        source_id: text(activity.id),
        description: text(activity.descripcion),
        owner: text(activity.responsable),
        due_date: toDate(activity.fecha),
        due_label: text(activity.fecha),
        status_label: text(activity.estado),
        evidence_url: text(activity.link_evidencia),
        position: index + 1,
      }));

      if (activities.length > 0) {
        const { error } = await admin
          .from("faculty_activities")
          .upsert(activities, { onConflict: "action_id,source_id" });
        if (error) report.skipped.push({ faculty: code, reason: `${sourceId}: ${error.message}` });
        else report.activities += activities.length;
      }

      /* --- Los seguimientos ----------------------------------------------- */

      const followups = (seguimientosByAction.get(`${code}|${sourceId}`) ?? [])
        .map((followup) => {
          const cut = text(followup.corte);
          if (!cut) return null;
          return {
            action_id: actionId,
            cut,
            reported_on: toDate(followup.fecha),
            progress: toProgress(followup.avance),
            status_label: text(followup.estado),
            note: text(followup.notas),
            evidence_url: text(followup.link_evidencia_accion),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (followups.length > 0) {
        const { error } = await admin
          .from("faculty_followups")
          .upsert(followups, { onConflict: "action_id,cut" });
        if (error) report.skipped.push({ faculty: code, reason: `${sourceId}: ${error.message}` });
        else report.followups += followups.length;
      }
    }

    for (const row of known) {
      if (!seen.has(row.source_id)) {
        report.orphans.push({ faculty: code, source_id: row.source_id, title: row.title });
      }
    }
  }

  return json({ ok: true, ...report });
}
