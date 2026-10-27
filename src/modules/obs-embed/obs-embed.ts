/* =============================================================================
   Observatorio insertado · lo que no necesita pantalla (/obs-embed).

   La defensa real, en capas (el detalle y sus límites están en
   src/modules/admin/observatorio/README.md):
     1. ORIGEN: aquí se averigua quién aloja el marco. Se prefiere
        location.ancestorOrigins (Chrome, Safari), luego document.referrer, y
        solo al final el origen que declara el cargador (?origen=). La base
        compara ese host con la lista de dominios.
     2. La base (obs_publico_insertado, 0233) valida estado, vencimiento, clave,
        dominio y límite, y solo entrega lo publicado y agregado.
     3. frame-ancestors en el borde (vercel.json / Coolify): ver el README.
   ========================================================================== */

import { leerFiltros } from "../admin/observatorio/publicar/opciones";
import type { Aspecto, Idioma } from "../admin/observatorio/publicar/opciones";
import type { ObsDataset } from "../admin/observatorio/model";

export interface ParametrosEmbed {
  id: string;
  clave: string | null;
  aspecto: Aspecto | null;
  lang: Idioma | null;
  filtros: Record<string, string>;
  altura: number | null;
  /** Origen que declara el cargador: la última opción, el navegador ya sabe más. */
  origenDeclarado: string | null;
}

export function leerParametros(search: string): ParametrosEmbed {
  const q = new URLSearchParams(search);
  const aspecto = (q.get("aspecto") ?? "").toLowerCase();
  const lang = (q.get("idioma") ?? "").toLowerCase().slice(0, 2);
  const altura = Number(q.get("altura"));
  return {
    id: (q.get("id") ?? "").toLowerCase().slice(0, 32),
    clave: q.get("clave") ? q.get("clave")!.slice(0, 64) : null,
    aspecto: aspecto === "claro" || aspecto === "oscuro" || aspecto === "auto" ? aspecto : null,
    lang: lang === "es" || lang === "en" || lang === "pt" ? lang : null,
    filtros: leerFiltros(q.get("filtros")),
    altura: Number.isInteger(altura) && altura >= 120 && altura <= 2000 ? altura : null,
    origenDeclarado: q.get("origen") ? q.get("origen")!.slice(0, 300) : null,
  };
}

/** Quién aloja el marco. `confiable`: salió del navegador y no de un parámetro. */
export function origenAnfitrion(declarado: string | null, w: Window = window): { origen: string | null; confiable: boolean } {
  if (w.parent === w) return { origen: w.location.origin, confiable: true };
  const ancestros = (w.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestros && ancestros.length > 0 && ancestros[0] && ancestros[0] !== "null") return { origen: ancestros[0], confiable: true };
  try {
    if (w.document.referrer) return { origen: new URL(w.document.referrer).origin, confiable: true };
  } catch {
    /* referrer ilegible */
  }
  return { origen: declarado, confiable: false };
}

/* --- Caché de 1 hora en la sesión del marco (la base sigue mandando) ------------------- */

export const CACHE_MS = 60 * 60 * 1000;

export function leerCache<T>(clave: string, ahora = Date.now()): T | null {
  try {
    const raw = window.sessionStorage.getItem(clave);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw) as { t: number; data: T };
    return ahora - t < CACHE_MS ? data : null;
  } catch {
    return null;
  }
}

export function guardarCache(clave: string, data: unknown) {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* sin almacenamiento: no hay caché */
  }
}

/* --- Filtros por URL (fase 1): anio y cualquier columna de texto por su nombre --------- */

const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Filtra las filas de datos. Un filtro que no corresponde a ninguna columna ni al año se ignora. */
export function aplicarFiltros(dataset: ObsDataset, filtros: Record<string, string>): ObsDataset {
  let rows = dataset.rows;
  for (const [nombre, valor] of Object.entries(filtros)) {
    const k = norm(nombre);
    const buscado = norm(valor);
    if (k === "anio" || k === "ano" || k === "year") {
      if (rows.some((r) => r.year !== null)) rows = rows.filter((r) => r.kind !== "dato" || r.year === null || String(r.year) === buscado);
      continue;
    }
    const columna = dataset.columns.find((c) => norm(c.key) === k || norm(c.label) === k);
    if (columna) rows = rows.filter((r) => r.kind !== "dato" || norm(r.cells[columna.key]) === buscado);
  }
  return rows === dataset.rows ? dataset : { ...dataset, rows };
}

/* --- Mensajes ---------------------------------------------------------------------------- */

export type EstadoEmbed = "ok" | "no_existe" | "revocado" | "pausado" | "vencido" | "sin_publicar" | "dominio" | "clave" | "limite" | "error";

const TEXTOS: Record<Idioma, Record<EstadoEmbed | "cargando" | "ver", string>> = {
  es: {
    cargando: "Cargando…", ver: "Ver en el Observatorio", ok: "",
    no_existe: "Este contenido no existe.", revocado: "Este contenido fue retirado por quien lo publicó.", pausado: "Este contenido está en pausa.",
    vencido: "Este contenido ya venció.", sin_publicar: "Este contenido aún no está publicado.", dominio: "Esta página no está autorizada para mostrar este contenido.",
    clave: "Falta la clave de este contenido o no es correcta.", limite: "Demasiadas consultas. Intente de nuevo en un minuto.", error: "No se pudo cargar el contenido. Intente de nuevo.",
  },
  en: {
    cargando: "Loading…", ver: "View in the Observatory", ok: "",
    no_existe: "This content does not exist.", revocado: "This content was withdrawn by its publisher.", pausado: "This content is paused.",
    vencido: "This content has expired.", sin_publicar: "This content is not published yet.", dominio: "This page is not authorized to display this content.",
    clave: "The key for this content is missing or incorrect.", limite: "Too many requests. Try again in a minute.", error: "The content could not be loaded. Try again.",
  },
  pt: {
    cargando: "Carregando…", ver: "Ver no Observatório", ok: "",
    no_existe: "Este conteúdo não existe.", revocado: "Este conteúdo foi retirado por quem o publicou.", pausado: "Este conteúdo está em pausa.",
    vencido: "Este conteúdo expirou.", sin_publicar: "Este conteúdo ainda não foi publicado.", dominio: "Esta página não está autorizada a exibir este conteúdo.",
    clave: "A chave deste conteúdo está ausente ou incorreta.", limite: "Muitas consultas. Tente novamente em um minuto.", error: "Não foi possível carregar o conteúdo. Tente novamente.",
  },
};

export const textoEmbed = (lang: Idioma, clave: EstadoEmbed | "cargando" | "ver") => TEXTOS[lang][clave];
