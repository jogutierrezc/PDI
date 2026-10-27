/* =============================================================================
   Observatorio · lógica pura del registro de insertados (O2): estado que ve la
   persona, comprobación de que el contenido sigue publicado, dominios y
   vistas de 30 días. Espeja lo que decide la base (0233) para avisar antes.
   ========================================================================== */

import type { Dominio, Insertado, Metrica, Observatorio, Tema } from "./api";
import type { ObsView } from "../model";

export type EstadoFila = "activo" | "pausado" | "revocado" | "vencido" | "sindatos";

export const ETIQUETA_FILA: Record<EstadoFila, string> = { activo: "Activo", pausado: "Pausado", revocado: "Revocado", vencido: "Vencido", sindatos: "Sin publicar" };
export const ETIQUETA_TIPO = { portada: "Portada", tema: "Tema", seccion: "Sección", visor: "Visor" } as const;

/** ¿Sigue publicado lo que apunta el insertado? Sin datos suficientes se da por bueno (la base manda). */
export function contenidoPublicado(ins: Pick<Insertado, "tipo" | "tema_slug" | "visor_id">, obs: Pick<Observatorio, "estado"> | undefined, temas: Tema[], vistas: ObsView[] | undefined): { ok: boolean; why: string } {
  if (!obs) return { ok: false, why: "El observatorio ya no existe" };
  if (obs.estado !== "publicado") return { ok: false, why: `El observatorio está en ${obs.estado}` };
  if (ins.tipo === "portada") return temas.some((t) => t.status === "publicado" && !t.archivado) ? { ok: true, why: "" } : { ok: false, why: "No hay temas publicados" };
  let slug = ins.tema_slug;
  if (ins.tipo === "visor" && vistas) {
    const v = vistas.find((x) => x.id === ins.visor_id);
    if (!v) return { ok: false, why: "El visor ya no existe" };
    if (!v.visible) return { ok: false, why: "El visor está oculto" };
    slug = v.topic;
  }
  const t = temas.find((x) => x.slug === slug);
  if (!t) return { ok: false, why: "El tema ya no está en este observatorio" };
  if (t.archivado) return { ok: false, why: `El tema «${t.nombre ?? t.slug}» está archivado` };
  if (t.status !== "publicado") return { ok: false, why: `El tema «${t.nombre ?? t.slug}» está en borrador` };
  return { ok: true, why: "" };
}

export function estadoFila(ins: Insertado, publicado: { ok: boolean }, ahora = Date.now()): EstadoFila {
  if (ins.estado === "revocado") return "revocado";
  if (ins.vence_en && new Date(ins.vence_en).getTime() <= ahora) return "vencido";
  if (ins.estado === "pausado") return "pausado";
  return publicado.ok ? "activo" : "sindatos";
}

/** Igual que obs_dominio_permitido: *.udes.edu.co siempre; lo externo, solo lo aprobado (comodín «*.x» = cualquier subdominio de x). */
export function hostPermitido(host: string, dominios: Pick<Dominio, "host" | "estado">[]): boolean {
  const h = host.toLowerCase();
  if (h === "udes.edu.co" || h.endsWith(".udes.edu.co")) return true;
  return dominios.some((d) => d.estado === "aprobado" && (d.host === h || (d.host.startsWith("*.") && h.endsWith(d.host.slice(1)))));
}

/** Vistas por día de los últimos `dias` días (el más viejo primero) y los dominios que las dieron. */
export function resumenMetricas(metricas: Metrica[], insertadoId: string, dias = 30, hoy = new Date()) {
  const serie = new Array<number>(dias).fill(0);
  const dominios = new Set<string>();
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  for (const m of metricas) {
    if (m.insertado_id !== insertadoId) continue;
    const i = dias - 1 - Math.round((base - Date.parse(`${m.dia}T00:00:00Z`)) / 86_400_000);
    if (i >= 0 && i < dias) serie[i] += m.vistas;
    dominios.add(m.dominio);
  }
  return { serie, total: serie.reduce((a, b) => a + b, 0), dominios: [...dominios].sort() };
}
