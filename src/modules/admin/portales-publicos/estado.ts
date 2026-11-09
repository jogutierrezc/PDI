/* =============================================================================
   Portales públicos · el estado que lee el sitio público.

   Una sola llamada (la función pub_estado, migración 0263) trae qué portales
   están abiertos y qué sobreescrituras del menú rigen hoy; el servidor ya
   calculó «vigente» con su propio reloj.

   FALLA ABIERTA. Si la migración no está aplicada, la función no existe, la
   red falla o la respuesta tarda, todo funciona como si esta pantalla no
   existiera: nada se oculta y nada se bloquea. La página pública nunca espera
   a esta consulta para pintarse: mientras no hay respuesta, el estado es el
   «vacío» (todo abierto). La última respuesta buena se recuerda en este
   navegador para que, en la visita siguiente, un portal cerrado ya se sepa
   cerrado en el primer pintado.
   ========================================================================== */

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

export interface PortalEstado {
  slug: string;
  rutas: string[];
  habilitado: boolean;
  mensaje: string;
  regreso: string | null;
}

export interface MenuEstado {
  oculto: boolean;
  etiqueta: string | null;
  destino: string | null;
}

export interface EstadoPublico {
  portales: PortalEstado[];
  /** Solo las sobreescrituras vigentes, por clave. */
  menu: Record<string, MenuEstado>;
}

/** Todo abierto, nada cambiado: lo que el sitio hacía antes de existir este módulo. */
export const ESTADO_ABIERTO: EstadoPublico = { portales: [], menu: {} };

export const CLAVE_ESTADO = ["pub", "estado"] as const;

/** Cuánto se espera a la base antes de seguir como si nada. */
const ESPERA_MS = 8000;
const CACHE = "pub:estado:v1";
const CACHE_VIDA_MS = 24 * 60 * 60 * 1000;

/* --- Destinos ---------------------------------------------------------------------------- */

/** Solo rutas internas («/…», sin «//» ni «/\» al comienzo) o https://. Misma regla que el CHECK de la base. */
export function destinoSeguro(destino: string | null | undefined): destino is string {
  if (!destino || destino.length > 500 || /[\s\u0000-\u001f\u007f]/.test(destino)) return false;
  return /^\/([^/\\]|$)/.test(destino) || /^https:\/\/[^/]/i.test(destino);
}

export const esExterno = (destino: string | null | undefined) => Boolean(destino && /^https:\/\//i.test(destino));

/* --- Lectura ------------------------------------------------------------------------------- */

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** Normaliza la respuesta de pub_estado; lo que no entienda, lo descarta (nunca lanza). */
export function leerRespuesta(raw: unknown): EstadoPublico {
  const out: EstadoPublico = { portales: [], menu: {} };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { portales?: unknown; menu?: unknown };
  for (const p of Array.isArray(r.portales) ? r.portales : []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const slug = texto(o.slug);
    if (!slug) continue;
    out.portales.push({
      slug,
      rutas: Array.isArray(o.rutas) ? o.rutas.filter((x): x is string => typeof x === "string" && x.startsWith("/")) : [],
      habilitado: o.habilitado !== false,
      mensaje: texto(o.mensaje),
      regreso: typeof o.regreso === "string" ? o.regreso : null,
    });
  }
  for (const m of Array.isArray(r.menu) ? r.menu : []) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    const clave = texto(o.clave);
    if (!clave || o.vigente !== true) continue;
    const etiqueta = texto(o.etiqueta).trim();
    out.menu[clave] = {
      oculto: o.oculto === true,
      etiqueta: etiqueta || null,
      // Defensa en profundidad: aunque la base lo valida, aquí tampoco se sigue un destino raro.
      destino: destinoSeguro(typeof o.destino === "string" ? o.destino : null) ? (o.destino as string) : null,
    };
  }
  return out;
}

function recordado(): EstadoPublico | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE);
    if (!raw) return undefined;
    const guardado = JSON.parse(raw) as { t?: number; estado?: unknown };
    if (typeof guardado.t !== "number" || Date.now() - guardado.t > CACHE_VIDA_MS) return undefined;
    return leerRespuesta(guardado.estado);
  } catch {
    return undefined;
  }
}

function recordar(raw: unknown) {
  try {
    window.localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), estado: raw }));
  } catch {
    /* Sin almacenamiento, solo se pierde el atajo del primer pintado. */
  }
}

async function leerEstado(): Promise<EstadoPublico> {
  const respuesta = await Promise.race([
    supabase.rpc("pub_estado" as never),
    new Promise<never>((_, rechazar) => window.setTimeout(() => rechazar(new Error("La consulta tardó demasiado.")), ESPERA_MS)),
  ]);
  const { data, error } = respuesta as { data: unknown; error: { message?: string } | null };
  if (error) throw new Error(error.message ?? "No se pudo leer el estado de los portales.");
  recordar(data);
  return leerRespuesta(data);
}

/**
 * El estado público. Nunca se queda esperando: sin respuesta (o con error) devuelve lo último que supo o,
 * si no sabe nada, «todo abierto». Se renueva cada minuto de uso, al volver a la pestaña y cada cinco minutos.
 */
export function useEstadoPublico(): EstadoPublico {
  const consulta = useQuery({
    queryKey: CLAVE_ESTADO,
    queryFn: leerEstado,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    // Un error no se reintenta en bucle: el sitio sigue abierto y la próxima ventana lo vuelve a intentar.
    retry: false,
    initialData: recordado,
    initialDataUpdatedAt: 0,
  });
  return consulta.data ?? ESTADO_ABIERTO;
}

/* --- Portales ------------------------------------------------------------------------------ */

const sinFinal = (ruta: string) => (ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta);

/** ¿Esta ruta cae dentro de ese prefijo? «/» solo vale para la portada exacta. */
function cae(path: string, prefijo: string): boolean {
  if (prefijo === "/") return path === "/";
  return path === prefijo || path.startsWith(`${prefijo}/`);
}

/** El portal que gobierna una ruta interna: el del prefijo más largo. Un destino externo no pertenece a ninguno. */
export function portalDeRuta(estado: EstadoPublico, destino: string): PortalEstado | null {
  if (!destino.startsWith("/")) return null;
  const path = sinFinal(destino.split(/[?#]/)[0] || "/");
  let mejor: PortalEstado | null = null;
  let largo = -1;
  for (const portal of estado.portales) {
    for (const prefijo of portal.rutas) {
      if (prefijo.length > largo && cae(path, sinFinal(prefijo))) {
        mejor = portal;
        largo = prefijo.length;
      }
    }
  }
  return mejor;
}

/** Marcos que se incrustan en otras páginas: en vez de la página de mantenimiento completa, un aviso corto. */
export const esMarcoInsertado = (path: string) => /^\/(pilo-embed|pilo-ensenanza-embed|obs-embed)(\/|$)/.test(path);

/* --- Menú ---------------------------------------------------------------------------------- */

export interface OriginalMenu {
  etiqueta: string;
  /** Sin destino, el vínculo abre un menú (los botones «Plan de Desarrollo», «UDES en Cifras» y «Observatorio»). */
  destino?: string | null;
  /** Para los vínculos sin destino: el portal al que dan paso, por si está deshabilitado. */
  portal?: string;
}

export interface VinculoAplicado {
  etiqueta: string;
  destino: string | null;
  externo: boolean;
}

/**
 * El vínculo tal como debe verse hoy: `null` si está oculto (por la administración) o si lleva a un portal
 * deshabilitado; si no, con la etiqueta y el destino sobreescritos que estén vigentes.
 */
export function aplicarMenu(estado: EstadoPublico, clave: string, original: OriginalMenu): VinculoAplicado | null {
  const fila = estado.menu[clave];
  if (fila?.oculto) return null;
  const etiqueta = fila?.etiqueta || original.etiqueta;
  const destino = fila?.destino || original.destino || null;
  const portal = destino ? portalDeRuta(estado, destino) : (estado.portales.find((p) => p.slug === original.portal) ?? null);
  if (portal && !portal.habilitado) return null;
  return { etiqueta, destino, externo: esExterno(destino) };
}

export interface MenuPublico {
  estado: EstadoPublico;
  /** El vínculo con las sobreescrituras puestas, o `null` si no debe verse. */
  aplicar: (clave: string, original: OriginalMenu) => VinculoAplicado | null;
  /** ¿Esta ruta interna pertenece a un portal deshabilitado? (Para quitarla de listas y del buscador.) */
  cerrada: (destino: string) => boolean;
  /** ¿Está oculto este vínculo por clave, sin mirar el portal? (Para entradas del buscador que no son el vínculo mismo.) */
  oculta: (clave: string) => boolean;
}

export function useMenuPublico(): MenuPublico {
  const estado = useEstadoPublico();
  const aplicar = useCallback((clave: string, original: OriginalMenu) => aplicarMenu(estado, clave, original), [estado]);
  const cerrada = useCallback((destino: string) => portalDeRuta(estado, destino)?.habilitado === false, [estado]);
  const oculta = useCallback((clave: string) => estado.menu[clave]?.oculto === true, [estado]);
  return useMemo(() => ({ estado, aplicar, cerrada, oculta }), [estado, aplicar, cerrada, oculta]);
}
