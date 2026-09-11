/* =============================================================================
   Edge Function · sync-facultades
   Trae los planes de acción de las facultades desde la aplicación de Google.

   El origen ya existe y ya publica: un Apps Script desplegado como aplicación
   web que responde dos cosas.

     GET ?action=list        → { ok, data: [ {facultad, decano, fase_actual, …} ] }
     GET ?facultad=<CÓDIGO>  → { ok, found, row: { …, json_data: "<JSON>" } }

   `json_data` es una cadena con el plan entero dentro: la facultad, sus
   acciones, las actividades de cada acción y sus seguimientos por corte.

   -----------------------------------------------------------------------------
   Por qué el portal tira del origen en vez de leerlo en cada visita

   Se puede llamar a esa URL desde el navegador —responde JSON y permite
   cualquier origen— y durante un rato pareció lo más simple. No lo es: cada
   visitante esperaría entre uno y tres segundos, sin caché, y una página
   pública se quedaría en blanco cada vez que Google tarde o el despliegue del
   script cambie de identificador. Además el plan llega sin ninguna relación con
   el PDI: el pilar viene como texto y hay que resolverlo contra `pillars`.

   Sincronizando, el portal sirve siempre lo último que trajo, con la misma
   caché que el resto del sitio, y una caída del origen se nota en la bandeja de
   la intranet —donde alguien puede hacer algo— y no en la cara del visitante.

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
   lo que alguien revisó, y no hay forma de distinguir "la quitaron" de "la hoja
   vino incompleta esta vez".

   -----------------------------------------------------------------------------
   Despliegue

     supabase functions deploy sync-facultades
     supabase secrets set FACULTY_SOURCE_URL="https://script.google.com/macros/s/<ID>/exec"
     supabase secrets set FACULTY_SYNC_TOKEN="<una cadena larga y aleatoria>"

   Quien la llama se identifica de una de dos maneras:

     · con la sesión del portal, si su rol es `planeacion` o superior —es lo que
       usa el botón "Sincronizar ahora" de la intranet—, o
     · con la cabecera `x-sync-token`, para un cron que corra solo.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

/* --- La forma que sirve el origen ----------------------------------------- */

interface SourceActivity {
  id?: string;
  descripcion?: string;
  responsable?: string;
  fecha?: string;
  estado?: string;
  linkEvidencia?: string;
}

interface SourceFollowup {
  corte?: string;
  fecha?: string;
  avance?: number;
  estado?: string;
  notas?: string;
  linkEvidenciaAccion?: string;
  actividades?: SourceActivity[];
}

interface SourceAction {
  id?: string;
  dimension?: string;
  dimensionNombre?: string;
  accion?: string;
  pilar?: string;
  responsable?: string;
  fechaLimite?: string;
  recursos?: string;
  meta?: string;
  estadoInicial?: string;
  presupuestoOrdinario?: boolean;
  presupuestoMejoramiento?: boolean;
  actividades?: SourceActivity[];
  seguimientos?: SourceFollowup[];
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

interface SourcePlan {
  facultad?: { codigo?: string; nombre?: string; tieneInforme?: boolean };
  decano?: string;
  fechaElaboracion?: string;
  periodo?: string;
  acciones?: SourceAction[];
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
 *  escrito en la hoja no debe tumbar la sincronización de toda una facultad. */
function toProgress(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function readSource(base: string, query: string): Promise<unknown> {
  const url = `${base}${base.includes("?") ? "&" : "?"}${query}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`El origen respondió ${response.status} en ${query}`);
  return await response.json();
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
  const source = Deno.env.get("FACULTY_SOURCE_URL");
  const expected = Deno.env.get("FACULTY_SYNC_TOKEN");

  // Decir cuál falta, y no "algo falta". Las tres primeras las inyecta la
  // plataforma; `FACULTY_SOURCE_URL` hay que ponerla a mano con
  // `supabase secrets set`, y es la que se olvida.
  const missing = [
    !url && "SUPABASE_URL",
    !anonKey && "SUPABASE_ANON_KEY",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !source && "FACULTY_SOURCE_URL",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error("Faltan variables de entorno:", missing.join(", "));
    return json(
      {
        error: `Falta configurar ${missing.join(", ")}.`,
        advice:
          "Ponlas con: supabase secrets set FACULTY_SOURCE_URL=\"https://script.google.com/macros/s/<ID>/exec\"",
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

  /* --- Qué facultades trae el origen --------------------------------------- */

  let list: { data?: { facultad?: string; timestamp?: string }[] };
  try {
    list = (await readSource(source, "action=list")) as typeof list;
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "El origen no respondió." }, 502);
  }

  const codes = (list.data ?? []).map((row) => text(row.facultad)).filter(Boolean);
  const stampByCode = new Map(
    (list.data ?? []).map((row) => [text(row.facultad).toUpperCase(), text(row.timestamp)]),
  );

  const report = {
    source: codes.length,
    faculties: 0,
    actions: { created: 0, updated: 0 },
    activities: 0,
    followups: 0,
    /** Acciones que están en el portal pero ya no vienen del origen. No se
     *  borran: se avisan, para que alguien mire. */
    orphans: [] as { faculty: string; source_id: string; title: string }[],
    skipped: [] as { faculty: string; reason: string }[],
  };

  for (const code of codes) {
    const faculty = facultyByCode.get(code.toUpperCase());
    if (!faculty) {
      // No se inventa la facultad: se crea desde la intranet con su slug y su
      // código, y la corrida siguiente la encuentra.
      report.skipped.push({ faculty: code, reason: "no existe en el portal" });
      continue;
    }

    let plan: SourcePlan;
    try {
      const detail = (await readSource(source, `facultad=${encodeURIComponent(code)}`)) as {
        found?: boolean;
        row?: { decano?: string; fase_actual?: string; json_data?: string };
      };

      if (!detail.found || !detail.row?.json_data) {
        report.skipped.push({ faculty: code, reason: "el origen no devolvió el plan" });
        continue;
      }

      plan = JSON.parse(detail.row.json_data) as SourcePlan;

      await admin
        .from("faculties")
        .update({
          // El nombre y la decanatura los manda el origen: es quien los sabe.
          name: text(plan.facultad?.nombre) || faculty.name,
          dean: text(plan.decano) || text(detail.row.decano),
          phase: text(detail.row.fase_actual),
          period: text(plan.periodo),
          plan_date: toDate(plan.fechaElaboracion),
          source_updated_at: stampByCode.get(code.toUpperCase()) || null,
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

    for (const action of plan.acciones ?? []) {
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
        dimension_name: text(action.dimensionNombre),
        declared_pillar: text(action.pilar),
        title,
        owner: text(action.responsable),
        goal: text(action.meta),
        resources: text(action.recursos),
        deadline: toDate(action.fechaLimite),
        deadline_label: text(action.fechaLimite),
        initial_status: toStatus(action.estadoInicial),
        budget_ordinary: action.presupuestoOrdinario === true,
        budget_improvement: action.presupuestoMejoramiento === true,
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

      // El estado de cada actividad no está en la actividad: vive en el último
      // seguimiento, que las vuelve a listar con su avance. Se indexa primero.
      const latest = [...(action.seguimientos ?? [])].sort((a, b) =>
        text(a.fecha) < text(b.fecha) ? 1 : -1,
      )[0];
      const stateBySource = new Map(
        (latest?.actividades ?? []).map((row) => [text(row.id), row]),
      );

      const activities = (action.actividades ?? [])
        .map((activity, index) => {
          const id = text(activity.id);
          if (!id || !text(activity.descripcion)) return null;
          const reported = stateBySource.get(id);
          return {
            action_id: actionId,
            source_id: id,
            description: text(activity.descripcion),
            owner: text(activity.responsable),
            due_date: toDate(activity.fecha),
            due_label: text(activity.fecha),
            status_label: text(reported?.estado),
            evidence_url: text(reported?.linkEvidencia),
            position: index + 1,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (activities.length > 0) {
        const { error } = await admin
          .from("faculty_activities")
          .upsert(activities, { onConflict: "action_id,source_id" });
        if (error) report.skipped.push({ faculty: code, reason: `${sourceId}: ${error.message}` });
        else report.activities += activities.length;
      }

      /* --- Los seguimientos ----------------------------------------------- */

      const followups = (action.seguimientos ?? [])
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
            evidence_url: text(followup.linkEvidenciaAccion),
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
