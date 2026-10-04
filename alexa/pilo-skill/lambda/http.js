/* =============================================================================
   Mr. Pilo en Alexa · los pedidos por la red.

   Las skills alojadas por Alexa corren en Node 16, que no trae `fetch` ni
   `AbortSignal.timeout`. Aquí está lo mínimo de los dos que usa la skill: en
   un Node que sí trae `fetch` se usa el suyo.
   ========================================================================== */

import https from "node:https";

const abortError = () => Object.assign(new Error("El pedido se canceló."), { name: "AbortError" });

/** Lo que la skill usa de `fetch`: status, ok, headers.get, json() y el cuerpo por partes (body.getReader().read()). */
export function nodeFetch(url, { method = "GET", headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const request = https.request(url, { method, headers: { ...headers, ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) } }, (res) => {
      const chunks = res[Symbol.asyncIterator]();
      const status = res.statusCode ?? 0;
      resolve({
        status,
        ok: status >= 200 && status < 300,
        headers: {
          get(name) {
            const value = res.headers[String(name).toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : (value ?? null);
          },
        },
        body: {
          getReader: () => ({
            async read() {
              const { done, value } = await chunks.next();
              return { done: Boolean(done), value };
            },
          }),
        },
        async json() {
          const parts = [];
          for await (const part of res) parts.push(part);
          return JSON.parse(Buffer.concat(parts).toString("utf8"));
        },
      });
    });
    // Al cancelar se corta la conexión: quien esté leyendo el cuerpo recibe el error.
    const onAbort = () => request.destroy(abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
    request.on("close", () => signal?.removeEventListener("abort", onAbort));
    request.on("error", reject);
    request.end(body);
  });
}

/** El `fetch` del sistema si lo hay; si no, el de aquí. */
export const netFetch = (url, init) => (typeof globalThis.fetch === "function" ? globalThis.fetch(url, init) : nodeFetch(url, init));

/** Una señal que se cumple sola pasado un plazo. */
export function timeoutSignal(ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  timer.unref?.();
  return ctl.signal;
}
