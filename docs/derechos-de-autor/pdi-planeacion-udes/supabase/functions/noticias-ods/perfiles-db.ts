/* =============================================================================
   Recolector de noticias · perfiles de ranking en la base (migración 0242).

   Lo que `noticias-ods` necesita para evaluar cada nota con todos los perfiles
   que reciben noticias, sin releerla: cargar la configuración y guardar la
   decisión y los temas de la nota en cada perfil que no es ODS (el perfil ODS
   sigue guardándose en news_items y news_ods, como desde 0143).

   Sin la migración 0242 nada de esto falla: se devuelven los valores de fábrica
   (solo ODS recibe) y no se escribe nada.
   ========================================================================== */

import { FABRICA, PERFIL_IDS, fuenteDeUrl, leerConfig, leerPerfil } from "./perfiles.ts";
import type { ConfigPerfil, PerfilId } from "./perfiles.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export type Perfiles = Record<PerfilId, ConfigPerfil>;

/** Las configuraciones de los cuatro perfiles; sin la tabla, las de fábrica. */
export async function cargarPerfiles(admin: Admin): Promise<{ perfiles: Perfiles; hay: boolean }> {
  const r = await admin.from("news_profiles").select("*");
  const hay = !r.error;
  const filas = new Map<string, Record<string, unknown>>(((r.data ?? []) as Record<string, unknown>[]).map((f) => [String(f.id), f]));
  const perfiles = Object.fromEntries(PERFIL_IDS.map((id) => [id, hay ? leerConfig(id, filas.get(id) ?? null) : FABRICA[id]])) as Perfiles;
  return { perfiles, hay };
}

/** ¿Este perfil lee la nota de esta fuente? Una fuente desconocida no se filtra. */
export const leeDeLaFuente = (c: ConfigPerfil, fuente: string | null) => c.recibe && (!fuente || c.fuentes.includes(fuente));

interface NotaParaPerfil {
  id: string;
  title: string;
  body: string;
}

/**
 * Evalúa una nota con cada perfil de ranking (impact, world, green) que recibe
 * noticias y la guarda en news_profile_notes y news_temas. Una nota que un perfil
 * ya tiene no se toca. Sin coincidencia alguna se guarda como «no», sin gastar IA.
 * Devuelve cuántos perfiles la guardaron.
 */
export async function evaluarEnPerfiles(admin: Admin, perfiles: Perfiles, nota: NotaParaPerfil, fuente: string | null, solo?: PerfilId): Promise<number> {
  let guardados = 0;
  for (const id of PERFIL_IDS) {
    if (id === "ods" || (solo && solo !== id)) continue;
    const cfg = perfiles[id];
    if (!leeDeLaFuente(cfg, fuente)) continue;
    const { temas, candidata } = leerPerfil(nota.title, nota.body, cfg);
    const { data, error } = await admin
      .from("news_profile_notes")
      .upsert(
        { news_id: nota.id, profile: id, state: temas.length || candidata ? "pending" : "no", ai_status: candidata ? "pendiente" : "none" },
        { onConflict: "news_id,profile", ignoreDuplicates: true },
      )
      .select("news_id");
    if (error || !(data ?? []).length) continue;
    if (temas.length) await admin.from("news_temas").upsert(temas.map((t) => ({ news_id: nota.id, profile: id, tema: t.tema, score: t.score, reason: t.reason.slice(0, 300), manual: false, by_ai: false })), { onConflict: "news_id,profile,tema", ignoreDuplicates: true });
    guardados++;
  }
  return guardados;
}

/**
 * Vuelve a leer, con la configuración de hoy, las notas de un perfil que nadie
 * ha decidido ni Pilo ha leído: recalcula sus temas y su estado. Lo que una
 * persona decidió o corrigió a mano no se toca.
 */
export async function reevaluarNota(admin: Admin, perfiles: Perfiles, nota: NotaParaPerfil, id: PerfilId): Promise<boolean> {
  if (id === "ods") return false;
  const cfg = perfiles[id];
  const { temas, candidata } = leerPerfil(nota.title, nota.body, cfg);
  // Solo si sigue sin decisión: el WHERE lo garantiza aunque alguien la decida mientras tanto.
  const { data, error } = await admin
    .from("news_profile_notes")
    .update({ state: temas.length || candidata ? "pending" : "no", ai_status: candidata ? "pendiente" : "none", ai_decision: null, ai_error: null })
    .eq("news_id", nota.id)
    .eq("profile", id)
    .is("reviewed_by", null)
    .is("decided_by", null)
    .in("ai_status", ["none", "pendiente", "error"]) // la lectura de Pilo no se pierde
    .select("news_id");
  if (error || !(data ?? []).length) return false;
  await admin.from("news_temas").delete().eq("news_id", nota.id).eq("profile", id).eq("manual", false);
  if (temas.length) await admin.from("news_temas").upsert(temas.map((t) => ({ news_id: nota.id, profile: id, tema: t.tema, score: t.score, reason: t.reason.slice(0, 300), manual: false, by_ai: false })), { onConflict: "news_id,profile,tema", ignoreDuplicates: true });
  return true;
}

export { fuenteDeUrl };
