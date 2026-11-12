/* =============================================================================
   Informes Institucionales · Alineación estratégica (sección tipo «pdi»).

   Lógica pura: normalizar/migrar el contenido, contar, avance y controles.
   Un pilar «incluido» es el que tiene una entrada en `contenido.alineacion`.
   Los informes anteriores solo traen `pilares` + `texto`: se leen como pilares
   incluidos con aporte vacío y el texto sigue disponible como «Texto anterior».
   ========================================================================== */

import { driveLibre, tablasLibre } from "./secciones-config";
import { tablaConDatos } from "./tabla-libre";
import { palabras } from "./tokens";
import type { AccionDePilar, AporteAPilar, BloqueLibre, Control, ContenidoSeccion, ElementoDrive } from "./types";

/** Palabras mínimas del aporte de un pilar para darlo por redactado. */
export const MINIMO_APORTE = 10;

const nuevoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);

export const aporteVacio = (pilar: string): AporteAPilar => ({ pilar, aporte: "", acciones: [] });
export const accionVacia = (): AccionDePilar => ({ id: nuevoId(), titulo: "", descripcion: "", bloques: [] });

/** ¿Los informes de este contenido ya usan la alineación por pilar? */
export const tieneAlineacion = (c: ContenidoSeccion | null | undefined): boolean => Array.isArray(c?.alineacion);

/** Los aportes del contenido. Sin `alineacion`, cada pilar marcado aparece con aporte vacío. Quita pilares repetidos. */
export function normalizarAlineacion(c: ContenidoSeccion | null | undefined): AporteAPilar[] {
  const vistos = new Set<string>();
  const base: AporteAPilar[] = Array.isArray(c?.alineacion) ? c!.alineacion! : (c?.pilares ?? []).map(aporteVacio);
  return base
    .filter((a) => a && typeof a.pilar === "string" && !vistos.has(a.pilar) && (vistos.add(a.pilar), true))
    .map((a) => ({ pilar: a.pilar, aporte: a.aporte ?? "", acciones: Array.isArray(a.acciones) ? a.acciones.map((x) => ({ ...x, titulo: x.titulo ?? "", descripcion: x.descripcion ?? "", bloques: Array.isArray(x.bloques) ? x.bloques : [] })) : [] }));
}

/** Texto de la versión anterior de la sección (antes de la alineación por pilar). */
export const textoAnterior = (c: ContenidoSeccion | null | undefined): string => (c?.texto ?? "").trim();

/** Guarda los aportes y deja `pilares` sincronizado (otras partes aún lo leen). */
export function conAlineacion(c: ContenidoSeccion, alineacion: AporteAPilar[]): ContenidoSeccion {
  return { ...c, alineacion, pilares: alineacion.map((a) => a.pilar) };
}

/* ---------- Conteos -------------------------------------------------------- */

const bloqueLleno = (b: BloqueLibre): boolean => (b.tipo === "texto" ? b.texto.trim() !== "" : b.tipo === "drive" ? b.drive.length > 0 : tablaConDatos(b));

export const accionTieneContenido = (a: AccionDePilar): boolean => a.titulo.trim() !== "" || a.descripcion.trim() !== "" || a.bloques.some(bloqueLleno);
export const aporteTieneContenido = (a: AporteAPilar): boolean => a.aporte.trim() !== "" || a.acciones.some(accionTieneContenido);

export type EstadoPilar = "sin-incluir" | "vacio" | "corto" | "listo";

/** Estado de un pilar: sin incluir, incluido sin aporte, aporte corto (menos de 10 palabras) o redactado. */
export function estadoDePilar(a: AporteAPilar | undefined): EstadoPilar {
  if (!a) return "sin-incluir";
  const n = palabras(a.aporte);
  if (n === 0 && !a.acciones.some(accionTieneContenido)) return "vacio";
  return n >= MINIMO_APORTE ? "listo" : "corto";
}

export const ETIQUETA_ESTADO: Record<EstadoPilar, string> = { "sin-incluir": "Sin aporte", vacio: "Por redactar", corto: "Aporte corto", listo: "Con aporte" };

/** Elementos de UDrive de todas las acciones (la vista previa los necesita para cargarlos). */
export const driveDeAlineacion = (c: ContenidoSeccion | null | undefined): ElementoDrive[] =>
  normalizarAlineacion(c).flatMap((a) => a.acciones.flatMap((x) => driveLibre({ bloques: x.bloques })));

export const tablasDeAlineacion = (c: ContenidoSeccion | null | undefined): number => normalizarAlineacion(c).reduce((s, a) => s + a.acciones.reduce((t, x) => t + tablasLibre({ bloques: x.bloques }), 0), 0);

/* ---------- Avance y controles --------------------------------------------- */

/**
 * 0 sin empezar, 1 en curso, 2 lista.
 * Lista: hay al menos un pilar incluido, todos tienen aporte de 10 palabras o más y ninguna acción queda sin título.
 * En curso: hay algo (un pilar incluido, texto o una acción). Contenido anterior sin `alineacion`: se conserva la regla de antes (3 pilares marcados).
 */
export function avanceAlineacion(c: ContenidoSeccion | null | undefined): 0 | 1 | 2 {
  if (!tieneAlineacion(c)) {
    const n = c?.pilares?.length ?? 0;
    return n >= 3 ? 2 : n > 0 || textoAnterior(c) ? 1 : 0;
  }
  const al = normalizarAlineacion(c);
  if (!al.length) return textoAnterior(c) ? 1 : 0;
  const completo = al.every((a) => palabras(a.aporte) >= MINIMO_APORTE && a.acciones.every((x) => x.titulo.trim() !== ""));
  return completo ? 2 : 1;
}

export interface PilarEtiqueta {
  id: string;
  numeral: string;
}

/** Mensajes del panel lateral: qué le falta a cada pilar y a cada acción. */
export function controlesAlineacion(c: ContenidoSeccion | null | undefined, pilares: PilarEtiqueta[] = []): Control[] {
  const nombre = (id: string) => {
    const p = pilares.find((x) => x.id === id);
    return p ? `Pilar ${p.numeral}` : "Un pilar";
  };
  const al = normalizarAlineacion(c);
  const out: Control[] = [];
  if (!tieneAlineacion(c)) {
    out.push(al.length ? { nivel: "warn", texto: "Contenido de la versión anterior: redacte el aporte a cada pilar marcado" } : { nivel: "warn", texto: "Aún no hay pilares con aporte" });
    return out;
  }
  if (!al.length) return [{ nivel: "warn", texto: "Aún no hay pilares con aporte" }];
  for (const a of al) {
    const n = palabras(a.aporte);
    const nom = nombre(a.pilar);
    if (n === 0) out.push({ nivel: "warn", texto: `${nom} sin aporte` });
    else if (n < MINIMO_APORTE) out.push({ nivel: "warn", texto: `${nom}: el aporte tiene ${n} ${n === 1 ? "palabra" : "palabras"} (mínimo ${MINIMO_APORTE})` });
    const sinTitulo = a.acciones.filter((x) => !x.titulo.trim()).length;
    if (sinTitulo) out.push({ nivel: "warn", texto: `${nom}: ${sinTitulo === 1 ? "una acción sin título" : `${sinTitulo} acciones sin título`}` });
  }
  if (!out.length) out.push({ nivel: "ok", texto: `${al.length} ${al.length === 1 ? "pilar con aporte" : "pilares con aporte"}` });
  const acciones = al.reduce((s, a) => s + a.acciones.length, 0);
  if (acciones) out.push({ nivel: "ok", texto: `${acciones} ${acciones === 1 ? "acción articulada" : "acciones articuladas"}` });
  return out;
}

/** Mueve una acción una posición (−1 sube, +1 baja). */
export function moverAccion(acciones: AccionDePilar[], i: number, d: -1 | 1): AccionDePilar[] {
  const j = i + d;
  if (j < 0 || j >= acciones.length) return acciones;
  const n = [...acciones];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
