/* =============================================================================
   El proveedor de IA de los rankings (noticias-pilo y pilo-rankingsod).

   news_settings (0146): ai_provider 'pilo' | 'mistral', ai_model,
   ai_vision_model, ai_batch.
     · 'pilo'    el mismo proveedor y modelo de Mr. Pilo (pilo_ai_settings).
     · 'mistral' Mistral con la clave de Mistral que ya guarda Mr. Pilo
                 (pilo_ai_secret.mistral_key, 0091). Ninguna clave nueva, ni en
                 el cliente ni en news_settings. Modelo de texto
                 'mistral-small-latest' (o 'mistral-large-latest'…).
   Visión (opcional): solo si ai_vision_model está definido (con Mistral,
   p. ej. 'pixtral-12b-2409', que acepta la imagen por URL https).
   Lote: ai_batch > 0 manda (1 a 8); 0 = automático: 5 con Mistral, 2 con
   NVIDIA y con los demás. No gasta el cupo diario de /pregunta.
   Lógica pura: la prueba está en tests/noticias/proveedor-rankings.test.ts.
   ========================================================================== */

import { textTarget, TEXT_PRESETS } from "../noticias-pilo/logica.ts";

export type ProveedorRankings = "pilo" | "mistral";

export interface AjustesIA {
  ai_provider: ProveedorRankings;
  ai_model: string;
  ai_vision_model: string;
  ai_batch: number;
}

export const AJUSTES_IA_DE_PARTIDA: AjustesIA = { ai_provider: "pilo", ai_model: "", ai_vision_model: "", ai_batch: 0 };
export const MODELO_MISTRAL = "mistral-small-latest";
export const MODELOS_MISTRAL = ["mistral-small-latest", "mistral-large-latest"];
export const VISION_MISTRAL = "pixtral-12b-2409";

const esModelo = (m: string) => /^[\w.:-][\w.:/-]{0,99}$/.test(m) && !/^https?:/.test(m);
const esModeloMistral = (m: string) => esModelo(m) && /^(?:mistral|open-mistral|ministral|magistral|pixtral|codestral)-[\w.-]+$/.test(m);

/** Los ajustes de news_settings, leídos con cuidado. */
export function leerAjustesIA(fila: Record<string, unknown> | null | undefined): AjustesIA {
  const lote = Math.floor(Number(fila?.ai_batch));
  return {
    ai_provider: fila?.ai_provider === "mistral" ? "mistral" : "pilo",
    ai_model: typeof fila?.ai_model === "string" ? fila.ai_model.trim() : "",
    ai_vision_model: typeof fila?.ai_vision_model === "string" ? fila.ai_vision_model.trim() : "",
    ai_batch: Number.isFinite(lote) && lote >= 0 && lote <= 8 ? lote : 0,
  };
}

export interface DestinoIA {
  ok: boolean;
  /** «pilo» o «mistral», como se eligió. */
  eleccion: ProveedorRankings;
  /** El proveedor real («mistral», «nvidia»…). */
  proveedor: string;
  url: string;
  model: string;
  clave: string;
  /** Modelo de visión, o null si no se usa. */
  vision: string | null;
  /** Notas o párrafos por llamada. */
  lote: number;
  /** El proveedor pide JSON con response_format (Mistral). */
  json: boolean;
  /** Si no se puede usar, por qué, en palabras. */
  motivo?: string;
}

/** El lote automático según el proveedor real. */
export const loteAutomatico = (proveedor: string) => (proveedor === "mistral" ? 5 : 2);

/**
 * El destino de las llamadas: con 'pilo', el proveedor y modelo de Mr. Pilo
 * (y su modelo de texto); con 'mistral', Mistral con su clave guardada.
 * Nunca devuelve una clave que no exista: si falta, `ok` es false y `motivo`
 * lo dice.
 */
export function elegirProveedor(ajustes: AjustesIA, pilo: Record<string, unknown> | null | undefined, secreto: Record<string, unknown> | null | undefined): DestinoIA {
  const vision = ajustes.ai_vision_model && esModelo(ajustes.ai_vision_model) ? ajustes.ai_vision_model : null;
  if (ajustes.ai_provider === "mistral") {
    const clave = String(secreto?.mistral_key ?? "") || (pilo?.provider === "mistral" ? String(secreto?.api_key ?? "") : "");
    const model = esModeloMistral(ajustes.ai_model) ? ajustes.ai_model : MODELO_MISTRAL;
    const lote = ajustes.ai_batch || loteAutomatico("mistral");
    const base = { eleccion: "mistral" as const, proveedor: "mistral", url: TEXT_PRESETS.mistral.url, model, clave, vision, lote, json: true };
    if (!clave) return { ...base, ok: false, clave: "", motivo: "No hay clave de Mistral guardada: la administración debe ponerla en Mr. Pilo con IA › Conexión (proveedor Mistral)." };
    return { ...base, ok: true };
  }
  const proveedor = String(pilo?.provider ?? "mistral");
  const clave = String(secreto?.[`${proveedor}_key`] ?? "") || String(secreto?.api_key ?? "");
  const destino = textTarget(proveedor, String(pilo?.base_url ?? ""), String(pilo?.chat_path ?? ""), String(pilo?.text_model ?? ""));
  const model = ajustes.ai_model && esModelo(ajustes.ai_model) ? ajustes.ai_model : destino.model;
  const base = { eleccion: "pilo" as const, proveedor, url: destino.url, model, clave, vision, lote: ajustes.ai_batch || loteAutomatico(proveedor), json: proveedor === "mistral" };
  const motivo = !pilo
    ? "Falta la migración 0089 de Mr. Pilo con IA."
    : !pilo.enabled
      ? "Mr. Pilo con IA está apagado: la administración lo enciende en Mr. Pilo con IA › Conexión."
      : !(destino.url.startsWith("https://") && model && clave)
        ? "Mr. Pilo con IA aún no está conectado: la administración debe poner el proveedor y la clave."
        : null;
  return motivo ? { ...base, ok: false, motivo } : { ...base, ok: true };
}

/** Cuánto esperar ante un 429 antes del único reintento: lo que pida el proveedor, entre 1 y 3 s. */
export const esperaTras429 = (retryAfter: string | null) => Math.min(3, Math.max(1, Number(retryAfter) || 1.2)) * 1000;
