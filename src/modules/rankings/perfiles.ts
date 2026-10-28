/* =============================================================================
   Recolector de noticias · perfiles de ranking (migración 0242).

   Un perfil lee las mismas notas con su propia capa de búsqueda, su propio
   mínimo para reconocer una noticia y su propia decisión: ODS (el de siempre),
   THE Impact, THE World y UI GreenMetric. El catálogo de temas, los valores de
   fábrica, los léxicos y el motor son los de la función `noticias-ods`
   (supabase/functions/noticias-ods/perfiles.ts): la intranet los importa para no
   duplicarlos y para calcular la vista previa en vivo.

   Aquí: la configuración guardada (news_profiles), el color de cada tema, las
   funciones puras (vista previa, palabras propias resaltadas, publicación) y la
   llamada que lee con un perfil las notas ya guardadas. Sin la migración, todo
   sigue como en 0143: solo el perfil ODS, con sus valores de fábrica.
   ========================================================================== */

import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { leer, TEMA_PROPIO } from "../../../supabase/functions/noticias-ods/clasificar";
import { CATALOGO, FABRICA, PERFIL_IDS, leerConfig, leerPerfil, opcionesOds } from "../../../supabase/functions/noticias-ods/perfiles";
import type { ConfigPerfil, ModoPerfil, PerfilId, Tema } from "../../../supabase/functions/noticias-ods/perfiles";
import { odsVars } from "./ods";

export { CATALOGO, FABRICA, PERFIL_IDS, TEMA_PROPIO };
export type { ConfigPerfil, ModoPerfil, PerfilId, Tema };

/* ---------- Datos de cada perfil que solo la pantalla necesita --------------- */

export interface VistaPerfil {
  /** El color de la muestra del selector (token de la paleta categórica). */
  color: string;
  /** Qué publica y dónde aparece cuando recibe noticias y alguien aprueba. */
  donde: string;
  /** El punto final del flujo: «Informes públicos». */
  fin: string;
  /** Qué tan conectada está hoy la publicación (la verdad, no el deseo). */
  conexion: string;
}

export const VISTA: Record<PerfilId, VistaPerfil> = {
  ods: {
    color: "var(--brand-blue)",
    donde: "Informes por ODS con Pilo y carrusel de noticias del informe",
    fin: "Informes públicos",
    conexion: "Conectado: los informes ODS leen lo aprobado de este perfil. «Solo intranet» los cierra al público.",
  },
  impact: {
    color: "var(--pillar-2)",
    donde: "Evidencia limpia por indicador y carrusel final del informe de THE Impact",
    fin: "Evidencia por indicador",
    conexion: "Guardado: el modo y el interruptor ya funcionan, pero la evidencia por indicador y el carrusel todavía leen el perfil ODS.",
  },
  world: {
    color: "var(--pillar-4)",
    donde: "Panel de posición del ranking, solo intranet hasta que se abra",
    fin: "Panel de posición",
    conexion: "Guardado: el panel de posición todavía no lee noticias.",
  },
  green: {
    color: "var(--pillar-5)",
    donde: "Carpeta de la pregunta en Datos de Sostenibilidad, como evidencia propuesta",
    fin: "Datos de Sostenibilidad",
    conexion: "Guardado: Datos de Sostenibilidad todavía no ofrece lo aprobado como evidencia propuesta.",
  },
};

export const MODOS: { id: ModoPerfil; etiqueta: string }[] = [
  { id: "persona", etiqueta: "Una persona aprueba" },
  { id: "pilo", etiqueta: "Pilo aprueba lo claro" },
  { id: "cerrado", etiqueta: "Solo intranet" },
];

export const etiquetaModo = (m: ModoPerfil) => (m === "cerrado" ? "solo intranet" : m === "pilo" ? "Pilo aprueba lo claro" : "una persona aprueba");

/** Los pasos del flujo de publicación de un perfil: recolecta → Pilo lee → quién aprueba → dónde aparece. */
export function pasosPublicacion(perfil: PerfilId, modo: ModoPerfil): string[] {
  if (modo === "cerrado") return ["Recolecta", "Pilo lee", "Solo intranet"];
  return ["Recolecta", "Pilo lee", modo === "pilo" ? "Pilo aprueba lo claro" : "Una persona aprueba", VISTA[perfil].fin];
}

/** Cambia el modo y mantiene a Pilo de acuerdo: «Pilo aprueba lo claro» y el interruptor son lo mismo. */
export function conModo(c: ConfigPerfil, modo: ModoPerfil): ConfigPerfil {
  return { ...c, modo, pilo_aprueba: modo === "pilo" ? true : modo === "persona" ? false : c.pilo_aprueba };
}

/** El interruptor «Pilo aprueba lo claro»: no reabre un perfil que está en «solo intranet». */
export function conPilo(c: ConfigPerfil, aprueba: boolean): ConfigPerfil {
  return { ...c, pilo_aprueba: aprueba, modo: c.modo === "cerrado" ? "cerrado" : aprueba ? "pilo" : "persona" };
}

/* ---------- Los temas: nombre y color ------------------------------------------ */

const TODOS: Record<string, Tema> = {};
for (const id of PERFIL_IDS) for (const t of CATALOGO[id].temas) TODOS[t.id] = t;

export const temaInfo = (id: string): Tema => TODOS[id] ?? { id, cod: "+", corto: "Palabra propia", nombre: "Palabra propia", grupo: "" };

/** Los pilares y las categorías toman la paleta categórica del sistema (--pillar-N); la marca siempre lleva su código y su nombre. */
const COLOR_TEMA: Record<string, string> = {
  ens: "var(--pillar-1)",
  ent: "var(--pillar-2)",
  cal: "var(--pillar-3)",
  int: "var(--pillar-4)",
  ind: "var(--pillar-5)",
  SI: "var(--pillar-5)",
  EC: "var(--pillar-3)",
  WS: "var(--pillar-6)",
  WR: "var(--pillar-2)",
  TR: "var(--pillar-1)",
  ED: "var(--pillar-4)",
  GD: "var(--brand-navy)",
};

/** Variables --k (fondo) y --ko (tinta) de un tema: el color oficial del ODS, la paleta del sistema o el gris de «palabra propia». */
export function temaVars(id: string): CSSProperties {
  const m = /^ods(\d{1,2})$/.exec(id);
  if (m) return odsVars(Number(m[1]));
  return { "--k": COLOR_TEMA[id] ?? "var(--ink-secondary)", "--ko": "var(--surface)" } as CSSProperties;
}

/* ---------- Configuración guardada --------------------------------------------- */

export type Perfiles = Record<PerfilId, ConfigPerfil>;

const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));

/** Las cuatro configuraciones. Sin la migración 0242 (`hay` falso), las de fábrica: solo ODS recibe. */
export function useNewsProfiles(): { perfiles: Perfiles; hay: boolean; cargando: boolean } {
  const q = useQuery({
    queryKey: ["noticias", "perfiles"],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<{ perfiles: Perfiles; hay: boolean }> => {
      const r = await supabase.from("news_profiles" as never).select("*");
      if (r.error) {
        if (noExiste(r.error)) return { perfiles: FABRICA, hay: false };
        throw new Error(r.error.message);
      }
      const filas = new Map(((r.data as unknown as Record<string, unknown>[] | null) ?? []).map((f) => [String(f.id), f]));
      return { perfiles: Object.fromEntries(PERFIL_IDS.map((id) => [id, leerConfig(id, filas.get(id) ?? null)])) as Perfiles, hay: true };
    },
  });
  return { perfiles: q.data?.perfiles ?? FABRICA, hay: q.data?.hay ?? false, cargando: q.isPending };
}

/** Guarda la configuración de uno o varios perfiles (solo los que se pasan). Para ODS también mantiene news_settings (0144). */
export function useSaveNewsProfiles() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ cambios, by }: { cambios: Partial<Perfiles>; by: string | null }) => {
      for (const id of PERFIL_IDS) {
        const c = cambios[id];
        if (!c) continue;
        const cfg = leerConfig(id, c as unknown as Record<string, unknown>);
        const r = await supabase
          .from("news_profiles" as never)
          .upsert({ id, ...cfg, updated_by: by, updated_at: new Date().toISOString() } as never, { onConflict: "id" });
        if (r.error) throw new Error(noExiste(r.error) ? "Falta aplicar la migración 0242 (perfiles del recolector)." : r.error.message);
        if (id === "ods") {
          // Lo que lea todavía news_settings (0144) sigue de acuerdo con el perfil ODS.
          await supabase
            .from("news_settings" as never)
            .update({ pilo_aprueba: cfg.pilo_aprueba, umbral: Math.max(50, Math.min(100, cfg.umbral_pilo)), updated_by: by, updated_at: new Date().toISOString() } as never)
            .eq("id", 1);
        }
      }
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["noticias", "perfiles"] });
      void cliente.invalidateQueries({ queryKey: ["noticias", "ajustes"] });
      void cliente.invalidateQueries({ queryKey: ["noticias", "pilo"] });
    },
  });
}

export const cambioDePerfil = (a: ConfigPerfil, b: ConfigPerfil) => JSON.stringify(a) !== JSON.stringify(b);

/* ---------- Leer con un perfil las notas ya guardadas -------------------------- */

export interface AvanceEvaluacion {
  seen: number;
  saved: number;
}

/**
 * Lee con un perfil las notas ya guardadas (sin descargar nada): la función
 * `noticias-ods` las trae de la base de a tandas y dice dónde seguir. Con
 * `reevaluar`, las que nadie decidió ni Pilo leyó se vuelven a puntuar.
 */
export async function evaluarPerfil(perfil: PerfilId, { reevaluar = false, alAvanzar }: { reevaluar?: boolean; alAvanzar?: (a: AvanceEvaluacion) => void } = {}): Promise<AvanceEvaluacion> {
  const total: AvanceEvaluacion = { seen: 0, saved: 0 };
  let start = 0;
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const r = await supabase.functions.invoke("noticias-ods", { body: { action: "evaluar", perfil, start, limite: 150, reevaluar } });
    if (r.error) {
      const ctx = (r.error as { context?: Response }).context;
      let mensaje = r.error.message;
      try {
        const j = ctx ? ((await ctx.json()) as { error?: string }) : null;
        if (j?.error) mensaje = j.error;
      } catch {
        /* se queda el mensaje general */
      }
      throw new Error(mensaje);
    }
    const d = r.data as { seen: number; saved: number; next: number; fin: boolean };
    total.seen += d.seen;
    total.saved += d.saved;
    alAvanzar?.({ ...total });
    if (d.fin) break;
    start = d.next;
  }
  return total;
}

/* ---------- Vista previa en vivo ----------------------------------------------- */

export interface TemaLeido {
  tema: string;
  score: number;
}

/** Los temas que el léxico propone para un texto con la configuración dada (los ODS del perfil ODS como «odsN»; las palabras propias como «propio»). */
export function leerTemas(perfil: PerfilId, titulo: string, texto: string, cfg: ConfigPerfil): TemaLeido[] {
  if (perfil === "ods") {
    const l = leer(titulo, texto, opcionesOds(cfg));
    return [...l.afinidad.map((a) => ({ tema: `ods${a.ods}`, score: a.score })), ...(l.propia ? [{ tema: TEMA_PROPIO, score: l.propia.score }] : [])];
  }
  return leerPerfil(titulo, texto, cfg).temas.map((t) => ({ tema: t.tema, score: t.score }));
}

/** En cuántas notas el léxico propondría algún tema (con título y extracto: es lo que la intranet tiene a la mano). */
export function contarPropuestas(notas: { title: string; excerpt: string }[], perfil: PerfilId, cfg: ConfigPerfil): number {
  let n = 0;
  for (const nota of notas) if (leerTemas(perfil, nota.title, nota.excerpt, cfg).length) n++;
  return n;
}

/* ---------- Palabras propias resaltadas ---------------------------------------- */

/** Sin tildes ni mayúsculas, con todo lo que no es letra o número hecho espacio, carácter por carácter (los índices no se mueven). */
function plegar(s: string): string {
  let r = "";
  for (const c of s) {
    const f = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    r += /[a-z0-9]/.test(f[0] ?? "") ? f[0] : " ";
  }
  return r;
}

export interface Trozo {
  texto: string;
  coincide: boolean;
}

/**
 * Parte un texto en trozos y marca los que coinciden con las palabras propias,
 * como las lee el motor: sin tildes ni mayúsculas, y una palabra solo cuenta al
 * principio de una palabra del texto.
 */
export function resaltar(texto: string, palabras: string[]): Trozo[] {
  const lista = palabras.map((p) => plegar(p).replace(/s+/g, " ").trim()).filter(Boolean);
  if (!lista.length || !texto) return [{ texto, coincide: false }];
  const unidades = Array.from(texto);
  // El texto plegado con los espacios colapsados, como lo lee el motor, y de dónde viene cada carácter.
  let plano = "";
  const origen: number[] = [];
  unidades.forEach((c, i) => {
    const f = plegar(c);
    if (f === " " && (!plano || plano.endsWith(" "))) return;
    plano += f;
    origen.push(i);
  });
  const marcas = new Array<boolean>(unidades.length).fill(false);
  for (const aguja of lista) {
    let i = plano.indexOf(aguja);
    while (i !== -1) {
      if (i === 0 || plano[i - 1] === " ") for (let k = origen[i]; k <= origen[i + aguja.length - 1]; k++) marcas[k] = true;
      i = plano.indexOf(aguja, i + 1);
    }
  }
  const trozos: Trozo[] = [];
  unidades.forEach((c, i) => {
    const ult = trozos[trozos.length - 1];
    if (ult && ult.coincide === marcas[i]) ult.texto += c;
    else trozos.push({ texto: c, coincide: marcas[i] });
  });
  return trozos;
}
