/* =============================================================================
   Portal de agentes · la cola de mensajes sin conexión.

   Lo que se escribe sin red (o cuando el envío falla) queda en la cola, se ve
   como «En cola» y sale solo, en orden, al reconectar. Un fallo detiene la
   cola en ese mensaje: nunca se envía uno después de otro que no salió.
   ========================================================================== */

export interface Queued<T> {
  id: string;
  payload: T;
  tries: number;
}

export interface Outbox<T> {
  /** Agrega un mensaje y, si hay red, intenta enviar. */
  push: (payload: T) => string;
  /** Intenta vaciar la cola; devuelve cuántos salieron. */
  flush: () => Promise<number>;
  items: () => readonly Queued<T>[];
  subscribe: (listener: () => void) => () => void;
}

export function createOutbox<T>(send: (payload: T) => Promise<void>, isOnline: () => boolean = () => true, onSent?: (id: string, payload: T) => void): Outbox<T> {
  let queue: Queued<T>[] = [];
  let running = false;
  let counter = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const flush = async (): Promise<number> => {
    if (running || !isOnline()) return 0;
    running = true;
    let sent = 0;
    try {
      while (queue.length && isOnline()) {
        const head = queue[0];
        try {
          await send(head.payload);
        } catch {
          queue = [{ ...head, tries: head.tries + 1 }, ...queue.slice(1)];
          emit();
          break;
        }
        queue = queue.slice(1);
        sent += 1;
        onSent?.(head.id, head.payload);
        emit();
      }
    } finally {
      running = false;
    }
    return sent;
  };

  return {
    push: (payload) => {
      counter += 1;
      const id = `q${counter}`;
      queue = [...queue, { id, payload, tries: 0 }];
      emit();
      void flush();
      return id;
    },
    flush,
    items: () => queue,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
