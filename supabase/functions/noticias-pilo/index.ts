/* =============================================================================
   Edge Function · noticias-pilo

   Mr. Pilo lee las noticias del recolector (migraciones 0143 y 0144). El
   léxico de `noticias-ods` deja en la fila de Pilo (ai_status = 'pendiente')
   toda nota con alguna coincidencia; aquí Pilo lee cada una (título y unas
   1.500 palabras), propone hasta 3 ODS con su razón, su confianza y, si lo
   reconoce, el indicador de THE, y escribe un resumen fiel. La lógica pura
   (mensajes, validación, decisión, ODS) está en logica.ts, con pruebas.

   Usa el mismo proveedor de Mr. Pilo: lo lee de pilo_ai_settings y
   pilo_ai_secret con la clave de servicio, como pilo-ia. La clave nunca
   sale de aquí. No gasta el cupo diario de Pilo (no escribe en pilo_ai_log,
   que cuenta ese cupo): la bitácora es news_runs, una fila por lote, y cada
   nota guarda ai_at y, si falló, ai_error.

     { action: "noticias", step: "estado" }
       → { ok, pendientes, errores, ia, motivo?, ajustes }
     { action: "noticias", step: "lote", limite?: 1..3 }
       → { ok, procesadas, aprobadas_por_pilo, para_revisar, descartadas, errores, quedan, alto? }
     { action: "noticias", step: "reintentar" }
       → { ok, devueltas }   las notas con error vuelven a la fila

   Reglas:
     · Solo Planeación o la administración, con sesión.
     · Pilo nunca cambia lo que decidió o corrigió una persona (logica.ts y
       el WHERE de cada escritura: reviewed_by nulo y estado «pending» o de Pilo).
     · Si la respuesta no sirve, ai_status = 'error' con el motivo y la nota
       queda «pending» para una persona. Nunca se aprueba por un error.
     · El proveedor tarda de 8 a 90 s por nota: se procesan pocas por llamada
       y no se empieza otra si ya pasaron 50 s. La intranet repite.
     · Un fallo del proveedor (clave, límite, modelo retirado) detiene el lote
       y deja la nota en la fila: no es culpa de la nota.

   Despliegue:
     supabase functions deploy noticias-pilo --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { decidirEstado, foldSystem, fusionarOds, leerAjustes, leerRespuesta, mensajesParaPilo, roleRejected, type Ajustes, type NotaActual } from "./logica.ts";
import { elegirProveedor, esperaTras429, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import { leer } from "../noticias-ods/clasificar.ts";
import { PERFIL_IDS, leerConfig, leerPerfil, opcionesOds } from "../noticias-ods/perfiles.ts";
import type { PerfilId } from "../noticias-ods/perfiles.ts";
import { fusionarTemas, leerRespuestaPerfil, mensajesParaPerfil } from "./perfil.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PRESUPUESTO_MS = 50_000;
const TOPE_LLAMADA_MS = 95_000;
const FIN_MS = 140_000;

const faltaMigracion = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));
const MIGRACION = { error: "Falta aplicar la migración 0144 (Pilo clasifica noticias).", code: "migracion" };
const MIGRACION_PERFILES = { error: "Falta aplicar la migración 0242 (perfiles del recolector).", code: "migracion" };

async function detalleProveedor(r: Response): Promise<string> {
  try {
    const t = await r.text();
    if (/^\s*</.test(t)) return "respondió una página web, no la API";
    try {
      const d = JSON.parse(t);
      return String(d?.message ?? d?.error?.message ?? d?.error ?? d?.detail ?? t).slice(0, 200);
    } catch {
      return t.slice(0, 200);
    }
  } catch {
    return "";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let cuerpo: { action?: string; step?: string; limite?: number; perfil?: string } = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  if (cuerpo.action !== "noticias") return json({ error: "Acción desconocida." }, 400);

  // Quién llama: solo Planeación o la administración, con sesión activa.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const who = await admin.auth.getUser(authorization.slice(7));
  if (who.error || !who.data.user) return json({ error: "Sesión inválida." }, 401);
  const { data: perfil } = await admin.from("profiles").select("role, is_active").eq("id", who.data.user.id).maybeSingle();
  if (!perfil?.is_active || !["planeacion", "admin"].includes(perfil.role)) return json({ error: "Solo Planeación o la administración." }, 403);

  // El proveedor de Mr. Pilo (0089, 0091) y los ajustes de las noticias (0144).
  const [{ data: settings }, { data: secret }, ajustesFila] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("news_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (ajustesFila.error) return json(faltaMigracion(ajustesFila.error) ? MIGRACION : { error: ajustesFila.error.message }, 500);
  // El perfil (0242): sin él, el de ODS de siempre. Con la migración, la confianza y «aprueba lo claro» son los del perfil.
  const perfilId = String(cuerpo.perfil ?? "ods") as PerfilId;
  if (!PERFIL_IDS.includes(perfilId)) return json({ error: "Perfil desconocido." }, 400);
  const esOds = perfilId === "ods";
  const perfilFila = await admin.from("news_profiles").select("*").eq("id", perfilId).maybeSingle();
  if (perfilFila.error && !esOds) return json(faltaMigracion(perfilFila.error) ? MIGRACION_PERFILES : { error: perfilFila.error.message }, 500);
  const cfgPerfil = leerConfig(perfilId, (perfilFila.error ? null : perfilFila.data) as Record<string, unknown> | null);
  const hayPerfil = !perfilFila.error && Boolean(perfilFila.data);
  const ajustes: Ajustes = hayPerfil ? { pilo_aprueba: cfgPerfil.pilo_aprueba, umbral: cfgPerfil.umbral_pilo } : leerAjustes(ajustesFila.data as Record<string, unknown> | null);
  // El proveedor de los rankings (0146): el de Mr. Pilo o Mistral con su clave guardada.
  const destino = elegirProveedor(leerAjustesIA(ajustesFila.data as Record<string, unknown> | null), settings as Record<string, unknown> | null, secret as Record<string, unknown> | null);
  const proveedor = destino.proveedor;
  const clave = destino.clave;
  const motivo = destino.ok ? null : destino.motivo ?? "La IA de los rankings no está lista.";

  const contar = async (estado: string) =>
    esOds
      ? admin.from("news_items").select("id", { count: "exact", head: true }).eq("ai_status", estado).is("reviewed_by", null)
      : admin.from("news_profile_notes").select("news_id", { count: "exact", head: true }).eq("profile", perfilId).eq("ai_status", estado).is("reviewed_by", null);

  const step = String(cuerpo.step ?? "");

  if (step === "estado") {
    const [p, e] = await Promise.all([contar("pendiente"), contar("error")]);
    if (p.error) return json(faltaMigracion(p.error) ? MIGRACION : { error: p.error.message }, 500);
    return json({ ok: true, pendientes: p.count ?? 0, errores: e.count ?? 0, ia: !motivo, ...(motivo ? { motivo } : {}), ajustes, eleccion: destino.eleccion, proveedor: destino.proveedor, modelo: destino.model, lote: destino.lote });
  }

  if (step === "reintentar") {
    const r = esOds
      ? await admin.from("news_items").update({ ai_status: "pendiente", ai_error: null }).eq("ai_status", "error").is("reviewed_by", null).select("id")
      : await admin.from("news_profile_notes").update({ ai_status: "pendiente", ai_error: null }).eq("profile", perfilId).eq("ai_status", "error").is("reviewed_by", null).select("news_id");
    if (r.error) return json(faltaMigracion(r.error) ? MIGRACION : { error: r.error.message }, 500);
    return json({ ok: true, devueltas: (r.data ?? []).length });
  }

  if (step !== "lote") return json({ error: "Paso desconocido." }, 400);
  if (motivo) return json({ error: motivo, code: "sin_ia" }, 503);

  // ai_batch (0146) o, si no lo dice, el automático del proveedor (5 con Mistral, 2 con los demás).
  const limite = Math.max(1, Math.min(8, Math.floor(Number(cuerpo.limite) || destino.lote)));
  type Fila = { id: string; title: string; body: string; section: string; campus: string; published_on: string | null; state: "pending" | "ok" | "no"; reviewed_by: string | null; decided_by: "persona" | "pilo" | null; news_ods: { ods: number; manual: boolean }[] | null; manualesT?: string[] };
  let filas: Fila[] = [];
  if (esOds) {
    const r = await admin
      .from("news_items")
      .select("id, title, body, section, campus, published_on, state, reviewed_by, decided_by, news_ods(ods, manual)")
      .eq("ai_status", "pendiente")
      .is("reviewed_by", null)
      .order("created_at", { ascending: true })
      .limit(limite);
    if (r.error) return json(faltaMigracion(r.error) ? MIGRACION : { error: r.error.message }, 500);
    filas = (r.data ?? []) as Fila[];
  } else {
    const r = await admin
      .from("news_profile_notes")
      .select("news_id, state, reviewed_by, decided_by, news_items!inner(title, body, section, campus, published_on)")
      .eq("profile", perfilId)
      .eq("ai_status", "pendiente")
      .is("reviewed_by", null)
      .order("created_at", { ascending: true })
      .limit(limite);
    if (r.error) return json(faltaMigracion(r.error) ? MIGRACION_PERFILES : { error: r.error.message }, 500);
    type FilaNota = { news_id: string; state: Fila["state"]; reviewed_by: string | null; decided_by: Fila["decided_by"]; news_items: { title: string; body: string; section: string; campus: string; published_on: string | null } };
    const notas = (r.data ?? []) as unknown as FilaNota[];
    const manuales = notas.length ? await admin.from("news_temas").select("news_id, tema").eq("profile", perfilId).eq("manual", true).in("news_id", notas.map((n) => n.news_id)) : { data: [] };
    const porNota = new Map<string, string[]>();
    for (const m of (manuales.data ?? []) as { news_id: string; tema: string }[]) porNota.set(m.news_id, [...(porNota.get(m.news_id) ?? []), m.tema]);
    filas = notas.map((n) => ({ id: n.news_id, ...n.news_items, state: n.state, reviewed_by: n.reviewed_by, decided_by: n.decided_by, news_ods: null, manualesT: porNota.get(n.news_id) ?? [] }));
  }

  const inicio = Date.now();
  const cuenta = { procesadas: 0, aprobadas_por_pilo: 0, para_revisar: 0, descartadas: 0, errores: 0 };
  let alto: { error: string; code: string } | null = null;
  const plegar = settings?.system_role === "user" && destino.eleccion === "pilo";

  const marcarError = async (id: string, mensaje: string) => {
    if (esOds) await admin.from("news_items").update({ ai_status: "error", ai_error: mensaje.slice(0, 300), ai_at: new Date().toISOString() }).eq("id", id).eq("ai_status", "pendiente");
    else await admin.from("news_profile_notes").update({ ai_status: "error", ai_error: mensaje.slice(0, 300), ai_at: new Date().toISOString() }).eq("news_id", id).eq("profile", perfilId).eq("ai_status", "pendiente");
    cuenta.errores++;
    cuenta.procesadas++;
  };

  for (const fila of filas) {
    const pasado = Date.now() - inicio;
    if (cuenta.procesadas > 0 && pasado > PRESUPUESTO_MS) break;
    const mensajes = esOds
      ? mensajesParaPilo(fila, leer(fila.title, fila.body, opcionesOds(cfgPerfil)).pistas)
      : mensajesParaPerfil(perfilId as Exclude<PerfilId, "ods">, fila, cfgPerfil.capas, leerPerfil(fila.title, fila.body, cfgPerfil).pistas);
    const unaVez = (doblar: boolean) =>
      fetch(destino.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(Math.max(10_000, Math.min(TOPE_LLAMADA_MS, FIN_MS - pasado))),
        body: JSON.stringify({
          model: destino.model,
          messages: doblar ? foldSystem(mensajes) : mensajes,
          temperature: 0.1,
          max_tokens: 700,
          ...(destino.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    // Ante un 429 (límite por segundo del plan gratuito de Mistral) espera hasta 3 s y reintenta una vez.
    const enviar = async (doblar: boolean) => {
      const r = await unaVez(doblar);
      if (r.status !== 429) return r;
      const espera = esperaTras429(r.headers.get("retry-after"));
      await r.body?.cancel();
      await new Promise((ok) => setTimeout(ok, espera));
      return unaVez(doblar);
    };

    let respuesta: Response;
    try {
      respuesta = await enviar(plegar);
      if (!respuesta.ok && !plegar && (respuesta.status === 400 || respuesta.status === 422) && roleRejected(respuesta.status, await detalleProveedor(respuesta.clone()))) {
        await respuesta.body?.cancel();
        respuesta = await enviar(true);
      }
    } catch (e) {
      const tiempo = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      // Una nota que hace tardar al proveedor no debe trabar la fila: queda con error y una persona la ve.
      if (tiempo) await marcarError(fila.id, "El proveedor tardó demasiado en leer esta nota.");
      else alto = { error: "No se pudo llegar al proveedor de Mr. Pilo.", code: "proveedor" };
      if (alto) break;
      continue;
    }
    if (!respuesta.ok) {
      const detalle = await detalleProveedor(respuesta);
      alto = {
        error: respuesta.status === 429 ? "El proveedor limitó los pedidos (429): espere un minuto y siga." : `El proveedor respondió ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`,
        code: respuesta.status === 429 ? "limite_proveedor" : "proveedor",
      };
      break;
    }
    let contenido = "";
    try {
      const datos = await respuesta.json();
      contenido = String(datos?.choices?.[0]?.message?.content ?? "");
    } catch {
      contenido = "";
    }
    if (!esOds) {
      // Un perfil de ranking: misma lectura y misma decisión, con sus temas en news_temas.
      const l = leerRespuestaPerfil(contenido, perfilId as Exclude<PerfilId, "ods">);
      if (!l.ok) {
        await marcarError(fila.id, l.error);
        continue;
      }
      const pp = l.propuesta;
      const manualesT = fila.manualesT ?? [];
      const ver = decidirEstado(
        { ods: pp.temas.map((t) => ({ ods: 0, indicador: null, confianza: t.confianza, razon: t.razon })), decision: pp.decision, confianza: pp.confianza, resumen: pp.resumen },
        { state: fila.state, reviewed_by: fila.reviewed_by, decided_by: fila.decided_by, manuales: manualesT.length },
        ajustes,
      );
      const baseP = { ai_status: "hecho", ai_decision: pp.decision, ai_summary: pp.resumen, ai_confidence: pp.confianza, ai_error: null, ai_at: new Date().toISOString() };
      let escritaP = admin.from("news_profile_notes").update(ver.state ? { ...baseP, state: ver.state, decided_by: ver.decided_by } : baseP).eq("news_id", fila.id).eq("profile", perfilId).is("reviewed_by", null);
      if (ver.state) escritaP = escritaP.or("state.eq.pending,decided_by.eq.pilo");
      const { data: hechaP, error: errorP } = await escritaP.select("news_id");
      if (errorP) {
        await marcarError(fila.id, "No se pudo guardar la lectura de Pilo.");
        continue;
      }
      if (!hechaP?.length) {
        // Una persona la decidió mientras Pilo leía: se guarda la lectura sin tocar el estado ni los temas.
        await admin.from("news_profile_notes").update(baseP).eq("news_id", fila.id).eq("profile", perfilId);
        ver.resultado = "revisar";
      }
      const fusion = fusionarTemas(manualesT, pp);
      if (fusion.borrar && hechaP?.length && ver.motivo !== "persona") {
        // Lo que Pilo propuso antes se reemplaza; lo que puso una persona y las palabras propias se quedan.
        await admin.from("news_temas").delete().eq("news_id", fila.id).eq("profile", perfilId).eq("manual", false).neq("tema", "propio");
        if (fusion.insertar.length) await admin.from("news_temas").upsert(fusion.insertar.map((t) => ({ news_id: fila.id, profile: perfilId, ...t })), { onConflict: "news_id,profile,tema", ignoreDuplicates: true });
      }
      cuenta.procesadas++;
      if (ver.resultado === "aprobada") cuenta.aprobadas_por_pilo++;
      else if (ver.resultado === "descartada") cuenta.descartadas++;
      else cuenta.para_revisar++;
      continue;
    }
    const lectura = leerRespuesta(contenido);
    if (!lectura.ok) {
      await marcarError(fila.id, lectura.error);
      continue;
    }
    const p = lectura.propuesta;
    const manuales = (fila.news_ods ?? []).filter((o) => o.manual).map((o) => o.ods);
    const actual: NotaActual = { state: fila.state, reviewed_by: fila.reviewed_by, decided_by: fila.decided_by, manuales: manuales.length };
    const veredicto = decidirEstado(p, actual, ajustes);

    // Primero la lectura de Pilo; el estado, solo si la nota sigue sin decisión de una persona.
    const ahora = new Date().toISOString();
    const base = { ai_status: "hecho", ai_decision: p.decision, ai_summary: p.resumen, ai_confidence: p.confianza, ai_error: null, ai_at: ahora };
    let escrita = admin.from("news_items").update(veredicto.state ? { ...base, state: veredicto.state, decided_by: veredicto.decided_by } : base).eq("id", fila.id).is("reviewed_by", null);
    if (veredicto.state) escrita = escrita.or("state.eq.pending,decided_by.eq.pilo");
    const { data: hecha, error: errorEscritura } = await escrita.select("id");
    if (errorEscritura) {
      await marcarError(fila.id, "No se pudo guardar la lectura de Pilo.");
      continue;
    }
    const deUnaPersona = !hecha?.length || veredicto.motivo === "persona";
    if (!hecha?.length) {
      // Una persona la decidió mientras Pilo leía: se guarda la lectura sin tocar el estado ni los ODS.
      await admin.from("news_items").update(base).eq("id", fila.id);
      veredicto.resultado = "revisar";
    }

    const ods = fusionarOds(manuales, p);
    if (ods.borrarNoManuales && !deUnaPersona) {
      await admin.from("news_ods").delete().eq("news_id", fila.id).eq("manual", false);
      if (ods.insertar.length) await admin.from("news_ods").upsert(ods.insertar.map((o) => ({ news_id: fila.id, ...o })), { onConflict: "news_id,ods", ignoreDuplicates: true });
    }

    cuenta.procesadas++;
    if (veredicto.resultado === "aprobada") cuenta.aprobadas_por_pilo++;
    else if (veredicto.resultado === "descartada") cuenta.descartadas++;
    else cuenta.para_revisar++;
  }

  const quedan = (await contar("pendiente")).count ?? 0;
  if (cuenta.procesadas || alto) {
    await admin.from("news_runs").insert({
      started_at: new Date(inicio).toISOString(),
      finished_at: new Date().toISOString(),
      source: `Pilo lee noticias${esOds ? "" : ` · ${perfilId}`} (${destino.model})`.slice(0, 200),
      seen: cuenta.procesadas,
      saved: cuenta.aprobadas_por_pilo,
      skipped: cuenta.descartadas,
      error: alto ? alto.error : cuenta.errores ? `${cuenta.errores} con error` : null,
    });
  }
  if (alto && !cuenta.procesadas) return json({ ...alto, quedan }, alto.code === "limite_proveedor" ? 429 : 502);
  return json({ ok: true, ...cuenta, quedan, ...(alto ? { alto } : {}) });
});
