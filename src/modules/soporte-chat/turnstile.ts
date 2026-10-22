/* =============================================================================
   Traspaso de Pilo a un agente · el captcha invisible de Cloudflare (Turnstile).

   El formulario para pasar con un agente es público y lo puede llenar un
   robot. Turnstile comprueba a la persona casi siempre sin mostrar nada: el
   navegador resuelve un reto silencioso y entrega un token de un solo uso;
   la función `soporte` lo verifica con siteverify antes de crear la
   conversación (nadie confía en el token desde el navegador).

   Qué hay aquí: cargar el script una sola vez (solo cuando aparece el
   formulario) y dibujar el widget en su hueco. Si Turnstile no carga o
   está bloqueado, el formulario sigue: es el servidor el que exige el
   token cuando tiene la llave secreta puesta.
   ========================================================================== */

/** La sitekey del widget del portal (pública; la secreta vive solo en el servidor). */
export const TURNSTILE_SITEKEY = (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined) ?? "0x4AAAAAAFhRQJAXA6uPvme_";

interface TurnstileApi {
  render: (
    elemento: HTMLElement,
    opciones: {
      sitekey: string;
      action?: string;
      language?: string;
      theme?: string;
      callback: (token: string) => void;
      "error-callback"?: (codigo: string) => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
    },
  ) => string;
  remove: (id: string) => void;
}

let carga: Promise<TurnstileApi> | null = null;

function cargar(): Promise<TurnstileApi> {
  if (carga) return carga;
  carga = new Promise<TurnstileApi>((aceptar, negar) => {
    const ventana = window as unknown as { turnstile?: TurnstileApi };
    if (ventana.turnstile) return aceptar(ventana.turnstile);
    const guion = document.createElement("script");
    guion.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    guion.async = true;
    guion.defer = true;
    guion.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) aceptar(api);
      else {
        carga = null;
        negar(new Error("Turnstile no arrancó."));
      }
    };
    guion.onerror = () => {
      carga = null;
      negar(new Error("Turnstile no cargó."));
    };
    document.head.appendChild(guion);
  });
  return carga;
}

/**
 * Dibuja el widget en el hueco y avisa cada token nuevo. Devuelve la promesa de
 * cómo soltarlo (para el cleanup de React). Nunca lanza: sin Turnstile, sin captcha.
 */
export async function montarTurnstile(hueco: HTMLElement, alToken: (token: string) => void, alFallar?: () => void): Promise<() => void> {
  try {
    const api = await cargar();
    const id = api.render(hueco, {
      sitekey: TURNSTILE_SITEKEY,
      action: "agente",
      language: "es",
      callback: alToken,
      "expired-callback": () => alToken(""),
      "timeout-callback": () => alFallar?.(),
      "error-callback": () => alFallar?.(),
    });
    return () => {
      try {
        api.remove(id);
      } catch {
        /* ya se fue */
      }
    };
  } catch {
    alFallar?.();
    return () => undefined;
  }
}
