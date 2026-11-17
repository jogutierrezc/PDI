/* =============================================================================
   Pilo presentaciones · la llamada a Pilo Astra 1.0.

   Misma forma que pilo-ia (chat de OpenAI con `reasoning_effort`, SSE con
   `delta.content` y `delta.reasoning_content` o `reasoning`), con su propio
   lector porque pilo-ia/index.ts arranca un servidor al cargarse. Si el
   proveedor ignora `stream` y manda el JSON entero, también sirve. El
   razonamiento llega aparte y se entrega tal cual (en inglés); nunca entra en
   la respuesta. `fetchFn` se inyecta para las pruebas.
   ========================================================================== */

import type { Mensaje } from "./prompt.ts";

export interface DestinoAstra {
  url: string;
  model: string;
  key: string;
}

export type CodigoAstra = "proveedor" | "tiempo" | "cancelado" | "limite_proveedor" | "clave" | "vacio";

export class ErrorAstra extends Error {
  constructor(message: string, readonly code: CodigoAstra, readonly status = 502) {
    super(message);
  }
}

export interface OpcionesLlamada {
  dest: DestinoAstra;
  mensajes: Mensaje[];
  effort: "low" | "medium" | "high" | "none";
  maxTokens: number;
  esperaMs: number;
  signal?: AbortSignal;
  onThinking?: (texto: string) => void;
  fetchFn?: typeof fetch;
}

export interface RespuestaAstra {
  texto: string;
  pensamiento: string;
  finish: string;
}

const PENSAMIENTO_MAX = 40_000;

const pieza = (v: unknown): string =>
  typeof v === "string" ? v : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String((x as { text?: unknown })?.text ?? ""))).join("") : "";

/** Un objeto de chat (trozo `delta` o respuesta entera `message`) a texto, razonamiento y fin. */
function leerTrozo(json: unknown): { texto: string; pensamiento: string; finish: string; error: string } | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (j.error) {
    const e = j.error as { message?: unknown };
    return { texto: "", pensamiento: "", finish: "", error: String(e?.message ?? (typeof j.error === "string" ? j.error : JSON.stringify(j.error))).slice(0, 240) };
  }
  const choice = (Array.isArray(j.choices) ? j.choices[0] : null) as { delta?: Record<string, unknown>; message?: Record<string, unknown>; finish_reason?: unknown } | null;
  if (!choice) return null;
  const parte = choice.delta ?? choice.message ?? {};
  return {
    texto: pieza(parte.content),
    pensamiento: pieza(parte.reasoning_content) || pieza(parte.reasoning),
    finish: typeof choice.finish_reason === "string" ? choice.finish_reason : "",
    error: "",
  };
}

/** Sin el rol `system` (un proveedor que no lo acepta): la persona va dentro del primer mensaje del usuario. */
export function plegarSistema(m: Mensaje[]): Mensaje[] {
  const sistema = m.filter((x) => x.role === "system").map((x) => x.content).join("\n\n");
  const resto = m.filter((x) => x.role !== "system");
  const i = resto.findIndex((x) => x.role === "user");
  if (!sistema) return resto;
  if (i < 0) return [{ role: "user", content: sistema }, ...resto];
  return resto.map((x, k) => (k === i ? { ...x, content: `${sistema}\n\n---\n\n${x.content}` } : x));
}

const rolRechazado = (status: number, detalle: string) => (status === 400 || status === 422) && /\bsystem\b|\broles?\b|developer instruction|must alternate/i.test(detalle);

/** Lo que el modelo escribió entre <think>…</think> es razonamiento, no respuesta. */
export function separarPensamiento(crudo: string): { texto: string; pensamiento: string } {
  let pensamiento = "";
  const texto = crudo.replace(/<(think|thinking)>([\s\S]*?)<\/\1>/gi, (_m, _t, dentro: string) => {
    pensamiento += dentro;
    return "";
  });
  const abierto = texto.search(/<(think|thinking)>/i);
  return abierto >= 0 ? { texto: texto.slice(0, abierto), pensamiento: pensamiento + texto.slice(abierto).replace(/<\/?(think|thinking)>/gi, "") } : { texto, pensamiento };
}

export async function llamarAstra(o: OpcionesLlamada): Promise<RespuestaAstra> {
  const f = o.fetchFn ?? fetch;
  const control = new AbortController();
  let venció = false;
  const reloj = setTimeout(() => {
    venció = true;
    control.abort();
  }, Math.max(1000, o.esperaMs));
  const cancelar = () => control.abort();
  if (o.signal?.aborted) cancelar();
  o.signal?.addEventListener("abort", cancelar, { once: true });

  const enviar = (mensajes: Mensaje[]) =>
    f(o.dest.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${o.dest.key}`, "Content-Type": "application/json" },
      signal: control.signal,
      body: JSON.stringify({ model: o.dest.model, messages: mensajes, temperature: 0.3, max_tokens: o.maxTokens, stream: true, reasoning_effort: o.effort }),
    });

  try {
    let r = await enviar(o.mensajes);
    if (!r.ok && (r.status === 400 || r.status === 422) && o.mensajes.some((m) => m.role === "system")) {
      const detalle = await r.clone().text().catch(() => "");
      if (rolRechazado(r.status, detalle)) {
        await r.body?.cancel().catch(() => {});
        r = await enviar(plegarSistema(o.mensajes));
      }
    }
    if (!r.ok) {
      const detalle = (await r.text().catch(() => "")).slice(0, 200);
      if (r.status === 429) throw new ErrorAstra("Astra limitó los pedidos (429): espere un minuto y vuelva a intentar.", "limite_proveedor", 429);
      if (r.status === 401 || r.status === 403) throw new ErrorAstra(`Astra rechazó la clave (${r.status}): la administración debe revisarla en Pilo Work.`, "clave", 502);
      throw new ErrorAstra(`Astra respondió ${r.status}${detalle ? `: ${detalle}` : ""}.`, "proveedor", 502);
    }

    let texto = "";
    let pensamiento = "";
    let finish = "";
    let error = "";
    let eventos = 0;
    let crudo = "";
    const decoder = new TextDecoder();
    let resto = "";
    const lector = r.body?.getReader();
    const linea = (l: string) => {
      const m = /^data:\s?(.*)$/.exec(l.trim());
      if (!m) return;
      const dato = m[1].trim();
      if (!dato || dato === "[DONE]") return;
      let json: unknown;
      try {
        json = JSON.parse(dato);
      } catch {
        return;
      }
      const t = leerTrozo(json);
      if (!t) return;
      eventos++;
      if (t.error) error = t.error;
      if (t.finish) finish = t.finish;
      texto += t.texto;
      if (t.pensamiento && pensamiento.length < PENSAMIENTO_MAX) {
        pensamiento += t.pensamiento;
        o.onThinking?.(t.pensamiento);
      }
    };
    while (lector) {
      const { value, done } = await lector.read();
      if (done) break;
      const s = decoder.decode(value, { stream: true });
      if (crudo.length < 600_000) crudo += s;
      resto += s;
      const partes = resto.split(/\r?\n/);
      resto = partes.pop() ?? "";
      for (const l of partes) linea(l);
    }
    if (resto) linea(resto);
    if (!eventos) {
      // El proveedor no hizo streaming: el cuerpo es un JSON entero.
      try {
        const t = leerTrozo(JSON.parse(crudo));
        if (t) {
          texto = t.texto;
          pensamiento = t.pensamiento.slice(0, PENSAMIENTO_MAX);
          finish = t.finish;
          error = t.error;
          if (pensamiento) o.onThinking?.(pensamiento);
        }
      } catch {
        /* cuerpo ilegible: se informa abajo */
      }
    }
    const sep = separarPensamiento(texto);
    if (sep.pensamiento && !pensamiento) {
      pensamiento = sep.pensamiento.slice(0, PENSAMIENTO_MAX);
      o.onThinking?.(pensamiento);
    }
    texto = sep.texto.trim();
    if (!texto) {
      if (error) throw new ErrorAstra(`Astra respondió con un error: ${error}`, "proveedor", 502);
      throw new ErrorAstra(`Astra no devolvió texto (finish_reason=${finish || "?"}${pensamiento ? "; solo llegó razonamiento: suba el tope de tokens en Pilo Work" : ""}).`, "vacio", 502);
    }
    return { texto, pensamiento, finish };
  } catch (e) {
    if (e instanceof ErrorAstra) throw e;
    if (venció) throw new ErrorAstra("Astra tardó más de lo que se puede esperar. Pruebe con menos duración o inténtelo de nuevo.", "tiempo", 504);
    if (o.signal?.aborted || control.signal.aborted) throw new ErrorAstra("Se canceló la presentación.", "cancelado", 499);
    throw new ErrorAstra("No se pudo llegar a Astra.", "proveedor", 502);
  } finally {
    clearTimeout(reloj);
    o.signal?.removeEventListener("abort", cancelar);
  }
}
