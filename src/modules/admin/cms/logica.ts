/* =============================================================================
   CMS Portales · lógica pura.

   Rutas, árbol de páginas y estado de publicación. Sin Supabase ni React:
   así se prueba sin base y la intranet y el portal público la comparten.
   ========================================================================== */

import { definicion } from "./bloques";
import type { NodoMicrositio } from "./plantillas";
import type { Alineacion, Ancho, CmsBloque, CmsPagina, Espacio, Estilo, Fondo, Medida, Movimiento, PresetMovimiento, Props } from "./tipos";

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
export const ALINEACIONES: readonly Alineacion[] = ["izquierda", "centro", "derecha", "justificado"];
export const MEDIDAS: readonly Medida[] = ["estrecha", "amplia", "completa"];
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

/** Alineación del texto del bloque; sin dato válido, a la izquierda. */
export function alinearDe(props: Props): Alineacion {
  return ALINEACIONES.includes(props._alinear as Alineacion) ? (props._alinear as Alineacion) : "izquierda";
}

/** Ancho de los párrafos del bloque; sin dato válido, el estrecho de siempre. */
export function medidaDe(props: Props): Medida {
  return MEDIDAS.includes(props._medida as Medida) ? (props._medida as Medida) : "estrecha";
}

/** Devuelve las props con la alineación dada; no modifica el original. */
export function fijarAlinear(props: Props, alinear: Alineacion): Props {
  return { ...props, _alinear: alinear };
}

/** Devuelve las props con la medida dada; no modifica el original. */
export function fijarMedida(props: Props, medida: Medida): Props {
  return { ...props, _medida: medida };
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

export interface VideoDatos {
  proveedor: "youtube" | "vimeo";
  id: string;
}

/**
 * Qué video es, a partir de lo que pegue el usuario: un enlace de YouTube
 * (barra, corto, embed, shorts o en vivo), uno de Vimeo, o solo el código del
 * video. Se valida el sitio por su nombre exacto y el código por su forma:
 * lo que no cumpla devuelve null y no se incrusta.
 */
export function videoDatos(valor: unknown): VideoDatos | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (/^[\w-]{11}$/.test(v)) return { proveedor: "youtube", id: v };
  if (/^\d{6,10}$/.test(v)) return { proveedor: "vimeo", id: v };
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const id11 = /^[\w-]{11}$/;
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return id11.test(id) ? { proveedor: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const partes = url.pathname.split("/").filter(Boolean);
    const id = partes[0] === "watch" ? (url.searchParams.get("v") ?? "") : ["embed", "shorts", "live", "v"].includes(partes[0] ?? "") ? (partes[1] ?? "") : "";
    return id11.test(id) ? { proveedor: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).find((x) => /^\d+$/.test(x));
    return id ? { proveedor: "vimeo", id } : null;
  }
  return null;
}

/** La dirección del reproductor: siempre youtube-nocookie.com o player.vimeo.com. `inicio` en segundos. */
export function videoUrl(datos: VideoDatos, opciones: { inicio?: number; autoplay?: boolean } = {}): string {
  const inicio = Math.min(86400, Math.max(0, Math.floor(Number(opciones.inicio) || 0)));
  if (datos.proveedor === "youtube") {
    const q = new URLSearchParams({ rel: "0" });
    if (inicio > 0) q.set("start", String(inicio));
    if (opciones.autoplay) q.set("autoplay", "1");
    return `https://www.youtube-nocookie.com/embed/${datos.id}?${q.toString()}`;
  }
  const q = new URLSearchParams({ dnt: "1" });
  if (opciones.autoplay) q.set("autoplay", "1");
  return `https://player.vimeo.com/video/${datos.id}?${q.toString()}${inicio > 0 ? `#t=${inicio}s` : ""}`;
}

/** La portada de un video de YouTube (Vimeo no ofrece una sin consultar su API). */
export function videoMiniatura(datos: VideoDatos): string | null {
  return datos.proveedor === "youtube" ? `https://i.ytimg.com/vi/${datos.id}/hqdefault.jpg` : null;
}

/** La dirección para incrustar el video, sin reproducción automática; null si el enlace no es de un sitio permitido. */
export function videoEmbed(valor: unknown): string | null {
  const datos = videoDatos(valor);
  return datos ? videoUrl(datos) : null;
}

/**
 * Una cifra escrita a la española («1.250», «3,5», «12») como número, con sus
 * decimales. Si no es solo un número (p. ej. «12 mil»), null: esa cifra no cuenta.
 */
export function leerCifra(valor: unknown): { n: number; decimales: number } | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(v)) return null;
  const limpio = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(v) ? v.replace(/\./g, "") : v;
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? { n, decimales: limpio.split(".")[1]?.length ?? 0 } : null;
}

/** Límites de la altura del bloque HTML, en píxeles. */
export const ALTO_HTML = { min: 80, max: 2000, defecto: 320, tope: 20000 } as const;

/**
 * El documento que se pinta dentro del marco aislado del bloque HTML. El
 * código del usuario nunca se inyecta en la página: solo viaja aquí, dentro de
 * un iframe sandbox sin allow-same-origin. Un pequeño script avisa la altura
 * del contenido al padre por postMessage; `token` solo identifica el marco.
 */
export function documentoHtml({ html, css, js, token, ajustar }: { html: string; css: string; js: string; token: string; ajustar: boolean }): string {
  const aviso = ajustar
    ? `<script>(function(){var t=${JSON.stringify(token)};function e(){parent.postMessage({cmsHtml:t,alto:Math.ceil(document.body.getBoundingClientRect().height)},"*")}if(window.ResizeObserver)new ResizeObserver(e).observe(document.body);addEventListener("load",e);e()})()</script>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flow-root;font-family:system-ui,sans-serif}</style><style>${css}</style></head><body>${html}${aviso}<script>${js}</script></body></html>`;
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

/* --- Mapa de OpenStreetMap (bloque «contacto-mapa») ---------------------------------------------- */

/** Una coordenada escrita a mano («7.1397» o «7,1397») como número dentro de ±`limite`; si no lo es, null. */
export function coordenadaDe(valor: unknown, limite: number): number | null {
  const t = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim().replace(",", ".") : "";
  if (!/^-?\d{1,3}(\.\d{1,8})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= limite ? n : null;
}

/**
 * Las direcciones del mapa para una latitud y una longitud: el marco incrustado
 * (solo openstreetmap.org/export/embed.html, con bbox y marcador calculados aquí)
 * y el enlace al mapa grande. Si las coordenadas no son números en rango, null:
 * ningún texto escrito por una persona llega a la dirección.
 */
export function mapaOsm(latitud: unknown, longitud: unknown, zoom: unknown): { incrustado: string; enlace: string } | null {
  const lat = coordenadaDe(latitud, 90);
  const lon = coordenadaDe(longitud, 180);
  if (lat === null || lon === null) return null;
  const z = Math.min(19, Math.max(10, Math.round(Number(zoom)) || 16));
  // Medio ancho del recuadro: una vez y media el ancho de una baldosa a ese acercamiento.
  const dLon = (360 / 2 ** z) * 1.5;
  const dLat = dLon * 0.75 * Math.cos((lat * Math.PI) / 180);
  const f = (n: number) => n.toFixed(6);
  const caja = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n, i) => f(Math.max(i % 2 === 0 ? -180 : -90, Math.min(i % 2 === 0 ? 180 : 90, n)))).join(",");
  return {
    incrustado: `https://www.openstreetmap.org/export/embed.html?bbox=${caja}&layer=mapnik&marker=${f(lat)},${f(lon)}`,
    enlace: `https://www.openstreetmap.org/?mlat=${f(lat)}&mlon=${f(lon)}#map=${z}/${f(lat)}/${f(lon)}`,
  };
}
