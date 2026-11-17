/* =============================================================================
   Pilo presentaciones · límite por persona y hora.

   Mismo contador que el chat con Astra (pilo_visitor_hit, ventana de una hora,
   tope astra_limite_hora de pw_config); la huella lleva «presentaciones» para
   no mezclarse con el cupo del chat. Sin base ni red aquí: `golpe` se inyecta.
   ========================================================================== */

/** La ventana fija en que cae un momento. */
export function ventana(nowMs: number, segundos: number): { start: string; retryAfter: number } {
  const size = Math.max(1, Math.floor(segundos)) * 1000;
  const desde = Math.floor(nowMs / size) * size;
  return { start: new Date(desde).toISOString(), retryAfter: Math.max(1, Math.ceil((desde + size - nowMs) / 1000)) };
}

export const cabe = (golpes: number, limite: number) => limite <= 0 || golpes <= limite;

export async function huella(sal: string, dia: string, usuario: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${sal}|${dia}|presentaciones|u:${usuario}`);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** Suma un pedido y dice si cabe. Si el contador falla, no bloquea (igual que pilo-ia). */
export async function revisarLimite(o: { golpe: (huella: string, ventanaInicio: string) => Promise<number | null>; sal: string; usuario: string; limite: number; ahora?: number }): Promise<{ ok: true } | { ok: false; retry: number }> {
  const t = o.ahora ?? Date.now();
  const v = ventana(t, 3600);
  const n = await o.golpe(await huella(o.sal, new Date(t).toISOString().slice(0, 10), o.usuario), v.start);
  return n === null || cabe(n, o.limite) ? { ok: true } : { ok: false, retry: v.retryAfter };
}
