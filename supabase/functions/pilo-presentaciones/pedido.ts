/* =============================================================================
   Pilo presentaciones · el pedido, validado (puro).
   ========================================================================== */

import { esTono } from "./tonos.ts";
import type { Tono } from "./tonos.ts";

export const MAX_INFORME_BYTES = 300_000;
export const MAX_ENFOQUE = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PedidoLeido {
  instancia_id: string;
  tono: Tono;
  duracion_min?: number;
  enfoque?: string;
  informe: unknown;
}

export type LecturaPedido = { ok: true; pedido: PedidoLeido } | { ok: false; error: string; code: string; status: number };

const mal = (error: string, code = "pedido", status = 400): LecturaPedido => ({ ok: false, error, code, status });

export function leerPedido(cuerpo: unknown): LecturaPedido {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return mal("Cuerpo inválido.");
  const c = cuerpo as Record<string, unknown>;
  const id = String(c.instancia_id ?? "");
  if (!UUID.test(id)) return mal("Falta el informe (instancia_id).");
  if (!esTono(c.tono)) return mal("Tono inválido: institucional, cercano, ejecutivo o academico.");
  let duracion: number | undefined;
  if (c.duracion_min !== undefined && c.duracion_min !== null && c.duracion_min !== "") {
    const n = Number(c.duracion_min);
    if (!Number.isFinite(n) || n < 1 || n > 180) return mal("La duración va de 1 a 180 minutos.");
    duracion = Math.round(n);
  }
  let enfoque: string | undefined;
  if (c.enfoque !== undefined && c.enfoque !== null) {
    if (typeof c.enfoque !== "string") return mal("El enfoque debe ser texto.");
    enfoque = c.enfoque.replace(/\s+/g, " ").trim();
    if (enfoque.length > MAX_ENFOQUE) return mal(`El enfoque admite hasta ${MAX_ENFOQUE} caracteres.`);
    if (!enfoque) enfoque = undefined;
  }
  if (!c.informe || typeof c.informe !== "object" || Array.isArray(c.informe)) return mal("Falta el informe (JSON plano).");
  const tam = new TextEncoder().encode(JSON.stringify(c.informe)).length;
  if (tam > MAX_INFORME_BYTES) return mal(`El informe pesa ${Math.round(tam / 1024)} KB y el tope es ${Math.round(MAX_INFORME_BYTES / 1000)} KB.`, "informe_grande", 413);
  return { ok: true, pedido: { instancia_id: id, tono: c.tono, duracion_min: duracion, enfoque, informe: c.informe } };
}
