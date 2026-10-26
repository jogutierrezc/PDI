/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · estado de una cifra frente a
   su meta, sin React.

     Superada   supera la meta
     Cumplida   igual a la meta
     Parcial    entre el 70 % de la meta y la meta
     Rezagada   menos del 70 % de la meta

   Si el indicador debe bajar (deserción, registros en trámite) la lógica se
   invierte: estar por debajo de la meta la supera, y el avance se mide como
   meta ÷ valor. En el papel el estado va siempre con forma y con palabra
   (vista.css: .vi-st), nunca solo con color.

   `semaforo` y `resultadoMeta` de cifras-vivas.ts siguen igual para el editor:
   tienen otros cortes (90 %) y tres niveles. Esta es la escala del papel.
   ========================================================================== */

export type EstadoMeta = "superada" | "cumplida" | "parcial" | "rezagada";

export const ETIQUETA_ESTADO_META: Record<EstadoMeta, string> = {
  superada: "Superada",
  cumplida: "Cumplida",
  parcial: "Parcial",
  rezagada: "Rezagada",
};

/** Desde qué fracción de la meta un resultado es «Parcial» y no «Rezagada». */
export const CORTE_PARCIAL = 0.7;

const IGUAL = 1e-9;

export function estadoMeta(valor: number | null | undefined, meta: number | null | undefined, mayorMejor = true): EstadoMeta | null {
  if (valor === null || valor === undefined || meta === null || meta === undefined) return null;
  if (!Number.isFinite(valor) || !Number.isFinite(meta)) return null;
  if (Math.abs(valor - meta) <= IGUAL * Math.max(1, Math.abs(meta))) return "cumplida";
  if (mayorMejor ? valor > meta : valor < meta) return "superada";
  // Del lado malo de la meta: cuánto se alcanzó de lo pedido.
  const avance = mayorMejor ? (meta > 0 ? valor / meta : 0) : valor > 0 ? meta / valor : 0;
  return avance >= CORTE_PARCIAL ? "parcial" : "rezagada";
}

/** Fracción de la meta alcanzada (1 = cumplida), para dibujar barras. Nulo si no hay con qué calcular. */
export function avanceFrenteAMeta(valor: number | null | undefined, meta: number | null | undefined, mayorMejor = true): number | null {
  if (valor === null || valor === undefined || meta === null || meta === undefined) return null;
  if (!Number.isFinite(valor) || !Number.isFinite(meta)) return null;
  if (mayorMejor) return meta > 0 ? Math.max(0, valor / meta) : null;
  if (valor <= 0) return meta > 0 ? 2 : 1;
  return meta > 0 ? Math.max(0, meta / valor) : 0;
}

export interface Conteo {
  superada: number;
  cumplida: number;
  parcial: number;
  rezagada: number;
  sinMeta: number;
}

export function contarEstados(estados: (EstadoMeta | null)[]): Conteo {
  const c: Conteo = { superada: 0, cumplida: 0, parcial: 0, rezagada: 0, sinMeta: 0 };
  for (const e of estados) {
    if (e) c[e]++;
    else c.sinMeta++;
  }
  return c;
}
