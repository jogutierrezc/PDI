/* =============================================================================
   CMS Portales · lógica pura.

   Rutas, árbol de páginas y estado de publicación. Sin Supabase ni React:
   así se prueba sin base y la intranet y el portal público la comparten.
   ========================================================================== */

import { definicion } from "./bloques";
import type { NodoMicrositio } from "./plantillas";
import type { Ancho, CmsBloque, CmsPagina, Espacio, Estilo, Fondo, Movimiento, PresetMovimiento, Props } from "./tipos";

/** Un segmento de URL: minúsculas, sin tildes, guiones entre palabras. */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** La ruta de una página hija: la de su padre más el segmento propio. */
export function rutaHija(rutaPadre: string, slug: string): string {
  return rutaPadre ? `${rutaPadre}/${slug}` : slug;
}

/** La última parte de la ruta: lo que el usuario escribió como slug. */
export function slugDeRuta(ruta: string): string {
  const partes = ruta.split("/");
  return partes[partes.length - 1] ?? "";
}

export type EstadoPublicacion = "sin-publicar" | "publicada" | "con-cambios";

/** Publicada: hay versión. Con cambios: se editó después de publicar. */
export function estadoPublicacion(p: Pick<CmsPagina, "publicada_version" | "publicada_en" | "actualizado_en">): EstadoPublicacion {
  if (p.publicada_version == null || !p.publicada_en) return "sin-publicar";
  return new Date(p.actualizado_en).getTime() > new Date(p.publicada_en).getTime() ? "con-cambios" : "publicada";
}

export interface NodoPagina {
  pagina: CmsPagina;
  hijos: NodoPagina[];
  profundidad: number;
}

/**
 * Árbol de páginas de un portal. Las portadas (ruta vacía) van primero;
 * después, por título. Un micrositio sin padre visible se muestra en la raíz
 * para que nunca desaparezca de la lista.
 */
export function arbol(paginas: CmsPagina[]): NodoPagina[] {
  const ids = new Set(paginas.map((p) => p.id));
  const porPadre = new Map<string | null, CmsPagina[]>();
  for (const p of paginas) {
    const clave = p.padre_id && ids.has(p.padre_id) ? p.padre_id : null;
    porPadre.set(clave, [...(porPadre.get(clave) ?? []), p]);
  }
  const ordenar = (a: CmsPagina, b: CmsPagina) => {
    if (a.ruta === "" && b.ruta !== "") return -1;
    if (b.ruta === "" && a.ruta !== "") return 1;
    return a.titulo.localeCompare(b.titulo, "es");
  };
  const construir = (padre: string | null, profundidad: number, visitados: Set<string>): NodoPagina[] =>
    (porPadre.get(padre) ?? [])
      .sort(ordenar)
      .filter((p) => !visitados.has(p.id))
      .map((p) => {
        visitados.add(p.id);
        return { pagina: p, profundidad, hijos: construir(p.id, profundidad + 1, visitados) };
      });
  return construir(null, 0, new Set());
}

/** Lista plana del árbol, en el orden en que se muestra. */
export function aplanar(nodos: NodoPagina[]): NodoPagina[] {
  return nodos.flatMap((n) => [n, ...aplanar(n.hijos)]);
}

/** ¿La ruta ya la usa otra página del mismo portal? */
export function rutaOcupada(paginas: CmsPagina[], portal: CmsPagina["portal"], ruta: string): boolean {
  return paginas.some((p) => p.portal === portal && p.ruta === ruta);
}

/* --- Claves reservadas de props: apariencia, movimiento y ocultar ------------------------- */

export const FONDOS: readonly Fondo[] = ["claro", "alterno", "marino"];
export const ESPACIOS: readonly Espacio[] = ["compacto", "normal", "amplio"];
export const PRESETS_MOVIMIENTO: readonly PresetMovimiento[] = ["palabras", "sube", "cascada", "zoom", "ninguna"];
export const CURVAS: readonly string[] = ["power3.out", "power4.out", "expo.out", "back.out(1.4)", "sine.inOut"];
export const ANCHOS: readonly Ancho[] = [4, 6, 8, 12];

export const ESTILO_DEFECTO: Estilo = { fondo: "claro", espacio: "normal" };
export const MOVIMIENTO_DEFECTO: Movimiento = { preset: "sube", dur: 0.7, stagger: 0.08, delay: 0, ease: "power3.out" };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numeroEn = (v: unknown, min: number, max: number, defecto: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : defecto;

/** Apariencia del bloque. Lo que no es válido cae al valor por defecto. */
export function estiloDe(props: Props): Estilo {
  const e = props._estilo;
  if (!esObjeto(e)) return { ...ESTILO_DEFECTO };
  return {
    fondo: FONDOS.includes(e.fondo as Fondo) ? (e.fondo as Fondo) : ESTILO_DEFECTO.fondo,
    espacio: ESPACIOS.includes(e.espacio as Espacio) ? (e.espacio as Espacio) : ESTILO_DEFECTO.espacio,
  };
}

/**
 * Entrada animada del bloque. Sin `_mov`, el preset es el del tipo en el
 * registro (hero: palabras, cinta: ninguna, frentes: cascada, texto y cta: sube).
 * Los valores numéricos se acotan para que un dato raro no rompa la animación.
 */
export function movimientoDe(tipo: string, props: Props): Movimiento {
  const base: Movimiento = { ...MOVIMIENTO_DEFECTO, preset: definicion(tipo)?.movimiento ?? MOVIMIENTO_DEFECTO.preset };
  const m = props._mov;
  if (!esObjeto(m)) return base;
  return {
    preset: PRESETS_MOVIMIENTO.includes(m.preset as PresetMovimiento) ? (m.preset as PresetMovimiento) : base.preset,
    dur: numeroEn(m.dur, 0.2, 1.6, base.dur),
    stagger: numeroEn(m.stagger, 0, 0.25, base.stagger),
    delay: numeroEn(m.delay, 0, 1, base.delay),
    ease: typeof m.ease === "string" && CURVAS.includes(m.ease) ? m.ease : base.ease,
  };
}

/** ¿El bloque está oculto en el editor? La página publicada no lo muestra. */
export function ocultoDe(props: Props): boolean {
  return props._oculto === true;
}

/** Devuelve las props con la apariencia dada; no modifica el original. */
export function fijarEstilo(props: Props, estilo: Estilo): Props {
  return { ...props, _estilo: { fondo: estilo.fondo, espacio: estilo.espacio } };
}

/** Devuelve las props con la entrada dada; no modifica el original. */
export function fijarMovimiento(props: Props, mov: Movimiento): Props {
  return { ...props, _mov: { preset: mov.preset, dur: mov.dur, stagger: mov.stagger, delay: mov.delay, ease: mov.ease } };
}

/** Devuelve las props con el ocultar dado; no modifica el original. */
export function fijarOculto(props: Props, oculto: boolean): Props {
  return { ...props, _oculto: oculto };
}

/* --- Sincronización del borrador con la base --------------------------------------------- */

/** Un bloque tal como está en el lienzo, en su orden. */
export interface LineaBloque {
  id: string;
  tipo: string;
  ancho: Ancho;
  props: Props;
}

export interface PlanSincronizacion {
  /** Ids de bloques que estaban en la base y ya no están en el lienzo. */
  borrar: string[];
  /** Todos los bloques del lienzo, con su posición como `orden`. Se escriben con upsert. */
  guardar: (LineaBloque & { orden: number })[];
}

/** Lo que ya se sabe de un bloque guardado; con sus datos completos se evitan escrituras repetidas. */
export type BloqueExistente = Pick<CmsBloque, "id"> & Partial<Pick<CmsBloque, "orden" | "tipo" | "ancho" | "props">>;

const igual = (a: BloqueExistente, b: LineaBloque & { orden: number }): boolean =>
  a.orden === b.orden && a.tipo === b.tipo && a.ancho === b.ancho && JSON.stringify(a.props) === JSON.stringify(b.props);

/**
 * Qué hacer en la base para que quede igual que el lienzo. Los bloques nuevos
 * ya traen su id (se genera en el cliente), así que el upsert sirve para
 * ambos casos. El orden es la posición en la lista. Si `existentes` trae los
 * datos completos, solo se escriben los bloques nuevos o distintos.
 */
export function planSincronizacion(existentes: BloqueExistente[], lista: LineaBloque[]): PlanSincronizacion {
  const enLista = new Set(lista.map((b) => b.id));
  const previos = new Map(existentes.map((b) => [b.id, b]));
  const guardar = lista.map((b, orden) => ({ id: b.id, orden, tipo: b.tipo, ancho: b.ancho, props: b.props }));
  return {
    borrar: existentes.map((b) => b.id).filter((id) => !enLista.has(id)),
    guardar: guardar.filter((b) => {
      const previo = previos.get(b.id);
      return !previo || !igual(previo, b);
    }),
  };
}

/** Un valor compuesto «ranking/categoria» (p. ej. «impact/o4») en sus dos ids; null si no tiene esa forma. */
export function parejaCategoria(valor: unknown): { ranking: string; categoria: string } | null {
  if (typeof valor !== "string") return null;
  const [ranking, categoria, ...resto] = valor.split("/");
  return ranking && categoria && resto.length === 0 ? { ranking, categoria } : null;
}

/** Qué crear y qué omitir al importar un árbol de micrositios. */
export interface PlanImportacion {
  /** Páginas que faltan, en el orden del árbol (padre antes que hijo). `padreRuta` es «» para la portada. */
  crear: { nodo: NodoMicrositio; ruta: string; padreRuta: string }[];
  /** Rutas que ya existen en el portal y no se tocan. */
  omitir: string[];
}

/**
 * Compara el árbol de micrositios con las páginas que ya existen. Cada ruta
 * sale de su padre (la de la portada es «») y su slug. Lanza si un padre no
 * aparece antes que su hijo: la plantilla lo cumple, pero el error se ve pronto.
 */
export function planImportacion(existentes: Pick<CmsPagina, "ruta">[], nodos: NodoMicrositio[]): PlanImportacion {
  const ocupadas = new Set(existentes.map((p) => p.ruta));
  const rutaDeSlug = new Map<string, string>();
  const crear: PlanImportacion["crear"] = [];
  const omitir: string[] = [];
  for (const nodo of nodos) {
    let padreRuta = "";
    if (nodo.padre !== null) {
      const ruta = rutaDeSlug.get(nodo.padre);
      if (ruta === undefined) throw new Error(`El micrositio «${nodo.slug}» cuelga de «${nodo.padre}», que no está antes en el árbol.`);
      padreRuta = ruta;
    }
    const ruta = rutaHija(padreRuta, nodo.slug);
    rutaDeSlug.set(nodo.slug, ruta);
    if (ocupadas.has(ruta)) {
      omitir.push(ruta);
      continue;
    }
    ocupadas.add(ruta);
    crear.push({ nodo, ruta, padreRuta });
  }
  return { crear, omitir };
}

/**
 * Destino de un botón escrito por el usuario. Solo rutas internas («/ruta») o
 * https. Cualquier otro esquema (javascript:, data:, http:…), una dirección
 * relativa a protocolo («//sitio») o con espacios devuelve null.
 */
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v || /[\\\s]/.test(v) || /[\u0000-\u001f]/.test(v)) return null;
  if (v.startsWith("/")) return v.startsWith("//") ? null : v;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && url.hostname ? v : null;
  } catch {
    return null;
  }
}
