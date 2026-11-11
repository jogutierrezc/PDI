/* =============================================================================
   Intranet · Mr. Pilo con IA · la voz de un servidor propio («otro»).

   Cualquier servidor que hable el formato de OpenAI (POST /audio/speech):
   Kokoro con mlx-audio, Voice Studio, un servicio propio. La función del
   servidor (pilo-ia) manda {model, input, voice, response_format: "mp3", speed}
   y exige una dirección https://, un modelo y una clave.

   Aquí vive lo que la pantalla muestra antes de guardar: la dirección final a
   la que Pilo va a llamar (la misma cuenta de `endpoint()` en pilo-ia) y los
   avisos de lo que falta o suele fallar. Sin React: se prueba aparte.
   ========================================================================== */

export const VOZ_RUTA = "/audio/speech";

/** Un ejemplo probado: Kokoro (mlx-audio) con voz en español. La dirección y la clave son de cada quien. */
export const VOZ_KOKORO = {
  speech_path: VOZ_RUTA,
  speech_model: "mlx-community/Kokoro-82M-bf16",
  speech_voice: "ef_dora",
} as const;

/** La dirección final: dirección + ruta, igual que `endpoint()` de pilo-ia (sin repetir la ruta ni el /v1). */
export function vozPropiaUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, "");
  if (!b) return "";
  let p = "/" + (path.trim() || VOZ_RUTA).replace(/^\/+/, "");
  // Una ruta escrita dos veces («/audio/speech/audio/speech») se deja en una.
  const half = p.slice(0, p.length / 2);
  if (p.length > 2 && p.length % 2 === 0 && half + half === p) p = half;
  // Si pegaron la dirección completa, ya trae la ruta.
  if (p !== "/" && b.toLowerCase().endsWith(p.toLowerCase())) return b;
  if (/\/v1$/.test(b) && p.startsWith("/v1/")) p = p.slice(3);
  return `${b}${p}`;
}

export type VozAviso = { id: string; tone: "fail" | "warn"; title: string; detail: string };

export interface VozEntrada {
  /** La dirección propia de la voz, o la del texto si está vacía (como hace el servidor). */
  base: string;
  path: string;
  model: string;
  /** Si hay una clave que la voz pueda usar; `null` si aún no se sabe (la lista de claves no llegó). */
  hasKey: boolean | null;
}

/** Lo que falta o suele fallar, en orden de importancia. Vacío: todo en orden. */
export function vozPropiaAvisos(e: VozEntrada): VozAviso[] {
  const out: VozAviso[] = [];
  const url = vozPropiaUrl(e.base, e.path);
  if (!url) {
    out.push({ id: "url", tone: "fail", title: "Falta la dirección del servidor", detail: "Pegue la dirección https:// a la que Pilo va a pedir la voz." });
  } else if (!url.startsWith("https://")) {
    out.push({
      id: "https",
      tone: "fail",
      title: "La dirección debe empezar con https://",
      detail: "Pilo solo llama por https. Si el servidor está en un computador de la oficina, publíquelo con un túnel (por ejemplo, Cloudflare).",
    });
  } else {
    if (/\.trycloudflare\.com(\/|$)/i.test(url)) {
      out.push({
        id: "temporal",
        tone: "warn",
        title: "Es un túnel temporal",
        detail: "La dirección cambia cada vez que el túnel se reinicia. Cuando pase, vuelva aquí y péguela de nuevo.",
      });
    }
    if (!/\/v1(\/|$)/i.test(url)) {
      out.push({
        id: "v1",
        tone: "warn",
        title: "La dirección no lleva /v1",
        detail: "La mayoría de los servidores compatibles con OpenAI atienden en …/v1/audio/speech. Si la voz responde 404, agregue /v1 al final de la dirección.",
      });
    }
  }
  if (!e.model.trim()) {
    out.push({ id: "modelo", tone: "fail", title: "Falta el modelo", detail: "El servidor lo pide en cada lectura. Para Kokoro: mlx-community/Kokoro-82M-bf16." });
  }
  if (e.hasKey === false) {
    out.push({ id: "clave", tone: "fail", title: "Falta la clave", detail: "Pilo la envía en cada pedido. Si el servidor no la pide, escriba cualquiera." });
  }
  return out;
}
