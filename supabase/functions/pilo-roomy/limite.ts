/* =============================================================================
   Pilo Roomy · límite por persona y hora (mismo contador que el chat, pilo_visitor_hit;
   la huella lleva «roomy» para no mezclarse con otros cupos).
   ========================================================================== */

export function ventana(nowMs: number, segundos: number): { start: string; retryAfter: number } {
  const size = Math.max(1, Math.floor(segundos)) * 1000;
  const desde = Math.floor(nowMs / size) * size;
  return { start: new Date(desde).toISOString(), retryAfter: Math.max(1, Math.ceil((desde + size - nowMs) / 1000)) };
}

export async function huella(sal: string, dia: string, usuario: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${sal}|${dia}|roomy|u:${usuario}`);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** Suma un pedido y dice si cabe. Si el contador falla, no bloquea (igual que pilo-ia). */
export async function revisarLimite(o: { golpe: (huella: string, ventanaInicio: string) => Promise<number | null>; sal: string; usuario: string; limite: number; ahora?: number }): Promise<{ ok: true } | { ok: false; retry: number }> {
  const t = o.ahora ?? Date.now();
  const v = ventana(t, 3600);
  const n = await o.golpe(await huella(o.sal, new Date(t).toISOString().slice(0, 10), o.usuario), v.start);
  return n === null || o.limite <= 0 || n <= o.limite ? { ok: true } : { ok: false, retry: v.retryAfter };
}
