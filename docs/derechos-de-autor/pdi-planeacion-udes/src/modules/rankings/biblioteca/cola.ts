/* =============================================================================
   Biblioteca de evidencias · cola de trabajo con concurrencia, reintentos y
   cancelación. No sabe de ZIP ni de Supabase: recibe la lista y la función
   que procesa cada elemento. La usa la subida (3 a la vez) y la prueban sin
   red.
   ========================================================================== */

export type ResultadoTarea<R> = { ok: true; valor: R; intentos: number } | { ok: false; error: string; intentos: number; cancelada: boolean };

export interface OpcionesCola<T, R> {
  concurrencia?: number;
  /** Reintentos después del primer intento (2 = hasta 3 intentos). */
  reintentos?: number;
  /** Espera antes del reintento n (ms). */
  espera?: (intento: number) => number;
  signal?: AbortSignal;
  /** Cada vez que termina uno (bien o mal). */
  alTerminar?: (item: T, indice: number, r: ResultadoTarea<R>) => void;
  /** ¿Vale la pena reintentar este error? (un archivo repetido no). */
  reintentable?: (e: unknown) => boolean;
}

const dormir = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok) => {
    if (ms <= 0 || signal?.aborted) return ok();
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), ok()), { once: true });
  });

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Procesa `items` con `trabajo`, `concurrencia` a la vez. Nunca lanza: cada resultado dice si falló. */
export async function ejecutarCola<T, R>(items: T[], trabajo: (item: T, signal?: AbortSignal) => Promise<R>, o: OpcionesCola<T, R> = {}): Promise<ResultadoTarea<R>[]> {
  const concurrencia = Math.max(1, o.concurrencia ?? 3);
  const reintentos = Math.max(0, o.reintentos ?? 2);
  const espera = o.espera ?? ((n) => 600 * 2 ** (n - 1));
  const resultados: ResultadoTarea<R>[] = new Array(items.length);
  let siguiente = 0;

  async function uno(i: number): Promise<ResultadoTarea<R>> {
    let intentos = 0;
    for (;;) {
      if (o.signal?.aborted) return { ok: false, error: "Cancelado", intentos, cancelada: true };
      intentos++;
      try {
        return { ok: true, valor: await trabajo(items[i], o.signal), intentos };
      } catch (e) {
        if (o.signal?.aborted) return { ok: false, error: "Cancelado", intentos, cancelada: true };
        const puede = o.reintentable ? o.reintentable(e) : true;
        if (!puede || intentos > reintentos) return { ok: false, error: mensaje(e), intentos, cancelada: false };
        await dormir(espera(intentos), o.signal);
      }
    }
  }

  async function obrero() {
    while (siguiente < items.length) {
      const i = siguiente++;
      const r = await uno(i);
      resultados[i] = r;
      o.alTerminar?.(items[i], i, r);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, items.length) }, obrero));
  return resultados;
}
