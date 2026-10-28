/* =============================================================================
   Recolector de noticias · lógica pura de la mesa de revisión.
   Sin React ni red: filtrar, elegir la siguiente nota, la pila de deshacer, el
   lote de alta afinidad, los conteos del riel y el progreso guardado.
   ========================================================================== */

import { temasDe } from "./noticias";
import type { NewsItem, NewsState } from "./noticias";

/** Filtro de estado de la franja de flujo: "all" son todas las cargadas. */
export type FiltroEstado = NewsState | "all";
/** Filtro del riel: 0 todas, -1 sin ODS, 1..17 un ODS. */
export const SIN_ODS = -1;

/** Filtro del riel de un perfil (0242): "" todas, "sin" las que no tienen tema, o el id de un tema («ods13», «ens», «SI», «propio»). */
export const SIN_TEMA = "sin";

export interface Filtro {
  estado: FiltroEstado;
  ods: number;
  q: string;
  /** Si viene, manda sobre `ods`: es el filtro de cualquier perfil. */
  tema?: string;
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const mejorAfinidad = (n: NewsItem) => temasDe(n).reduce((m, o) => Math.max(m, o.score), 0);

const tieneTema = (n: NewsItem, f: Filtro) => {
  if (f.tema !== undefined) return f.tema === "" || (f.tema === SIN_TEMA ? temasDe(n).length === 0 : temasDe(n).some((t) => t.tema === f.tema));
  return f.ods === 0 || (f.ods === SIN_ODS ? n.ods.length === 0 : n.ods.some((o) => o.ods === f.ods));
};

const porFecha = (a: NewsItem, b: NewsItem) => (b.published_on ?? "").localeCompare(a.published_on ?? "");

/** Las notas que pasan el filtro, de la más reciente a la más antigua. */
export function filtrar(notas: NewsItem[], f: Filtro): NewsItem[] {
  const q = normal(f.q);
  return notas
    .filter(
      (n) =>
        (f.estado === "all" || n.state === f.estado) &&
        tieneTema(n, f) &&
        (!q || normal(n.title).includes(q)),
    )
    .sort(porFecha);
}

/**
 * La nota que sigue a `id` dentro de la lista visible: la próxima por revisar
 * hacia abajo; si no hay, la primera por revisar hacia arriba; si tampoco,
 * ninguna. La propia `id` nunca es la siguiente.
 */
export function siguienteNota(lista: NewsItem[], id: string | null): string | null {
  const i = id ? lista.findIndex((n) => n.id === id) : -1;
  const pendiente = (n: NewsItem) => n.state === "pending" && n.id !== id;
  const abajo = lista.slice(i + 1).find(pendiente);
  if (abajo) return abajo.id;
  const arriba = lista.slice(0, Math.max(0, i)).find(pendiente);
  return arriba?.id ?? null;
}

/** Mover el cursor por la lista sin salirse de ella. */
export function mover(lista: NewsItem[], id: string | null, paso: 1 | -1): string | null {
  if (!lista.length) return null;
  const i = id ? lista.findIndex((n) => n.id === id) : -1;
  const j = i < 0 ? 0 : Math.min(lista.length - 1, Math.max(0, i + paso));
  return lista[j].id;
}

/* ---------- Deshacer ------------------------------------------------------- */

export interface Deshacer {
  /** Qué estado tenía cada nota antes del cambio. */
  antes: { id: string; state: NewsState }[];
  despues: NewsState;
  /** Para el aviso: «Aprobada «…»», «3 descartadas»… */
  texto: string;
}

export const PILA_MAX = 20;

export function apilar(pila: Deshacer[], d: Deshacer, max = PILA_MAX): Deshacer[] {
  return [...pila, d].slice(-max);
}

export function desapilar(pila: Deshacer[]): { ultima: Deshacer | null; resto: Deshacer[] } {
  if (!pila.length) return { ultima: null, resto: pila };
  return { ultima: pila[pila.length - 1], resto: pila.slice(0, -1) };
}

/** Los cambios que restauran el estado anterior, agrupados por estado (una llamada por grupo). */
export function restaurar(d: Deshacer): { state: NewsState; ids: string[] }[] {
  const grupos = new Map<NewsState, string[]>();
  for (const a of d.antes) grupos.set(a.state, [...(grupos.get(a.state) ?? []), a.id]);
  return [...grupos].map(([state, ids]) => ({ state, ids }));
}

/** Aplica un cambio de estado a la lista en memoria (lo que la caché muestra al instante). */
export function conEstados(notas: NewsItem[], cambios: Map<string, NewsState>): NewsItem[] {
  return notas.map((n) => (cambios.has(n.id) ? { ...n, state: cambios.get(n.id) as NewsState } : n));
}

/* ---------- Lote ----------------------------------------------------------- */

export const UMBRAL_ALTO = 80;

/** Las notas por revisar cuya mejor afinidad llega al umbral. */
export function altaAfinidad(notas: NewsItem[], umbral = UMBRAL_ALTO): NewsItem[] {
  return notas.filter((n) => n.state === "pending" && mejorAfinidad(n) >= umbral);
}

/* ---------- Conteos -------------------------------------------------------- */

export interface Conteo {
  pending: number;
  ok: number;
  no: number;
  total: number;
}

const vacio = (): Conteo => ({ pending: 0, ok: 0, no: 0, total: 0 });

/** Conteos por estado: de todas (clave 0), de cada ODS y de las que no tienen ODS (clave -1). */
export function contarRiel(notas: NewsItem[]): Map<number, Conteo> {
  const m = new Map<number, Conteo>();
  const sumar = (k: number, s: NewsState) => {
    const c = m.get(k) ?? vacio();
    c[s]++;
    c.total++;
    m.set(k, c);
  };
  for (const n of notas) {
    sumar(0, n.state);
    if (!n.ods.length) sumar(SIN_ODS, n.state);
    for (const o of n.ods) sumar(o.ods, n.state);
  }
  return m;
}

/** Conteos por estado de cada tema del perfil: clave "" todas, "sin" las que no tienen tema, o el id del tema. */
export function contarTemas(notas: NewsItem[]): Map<string, Conteo> {
  const m = new Map<string, Conteo>();
  const sumar = (k: string, s: NewsState) => {
    const c = m.get(k) ?? vacio();
    c[s]++;
    c.total++;
    m.set(k, c);
  };
  for (const n of notas) {
    const temas = temasDe(n);
    sumar("", n.state);
    if (!temas.length) sumar(SIN_TEMA, n.state);
    for (const t of temas) sumar(t.tema, n.state);
  }
  return m;
}

/* ---------- Tiempo --------------------------------------------------------- */

export function haceCuanto(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "nunca";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "nunca";
  const min = Math.max(0, Math.round((ahora - t) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorta(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return a && m && d ? `${d} ${MESES[m - 1]} ${a}` : "Sin fecha";
}

/* ---------- Progreso guardado de la carga ---------------------------------- */

/** next por "fuente|año"; -1 = esa fuente ya terminó ese año. */
export type Progreso = Record<string, number>;

export const claveProgreso = (fuente: string, year: number) => `${fuente}|${year}`;

/** Por dónde seguiría cada fuente del año; las terminadas no se incluyen. */
export function pendientesDe(progreso: Progreso, fuentes: string[], year: number): Record<string, number> {
  const r: Record<string, number> = {};
  for (const f of fuentes) {
    const v = progreso[claveProgreso(f, year)];
    if (v === undefined) continue;
    if (v >= 0) r[f] = v;
  }
  return r;
}
