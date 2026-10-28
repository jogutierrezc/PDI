/* =============================================================================
   Pilo at Work · el proveedor de texto: el MISMO que usa Pilo.

   Lee la misma configuración (pilo_ai_settings) y las mismas claves (pilo_ai_secret)
   que supabase/functions/pilo-ia, con las mismas direcciones y reglas. No se importa
   desde pilo-ia/index.ts porque ese archivo arranca su propio servidor al cargarse;
   aquí va lo mínimo (textTarget y endpoint de ese archivo, copiados tal cual).
   Las claves se quedan en el servidor: nunca viajan al navegador.
   ========================================================================== */

// deno-lint-ignore no-explicit-any
type Admin = any;

export const TEXT_PRESETS: Record<string, { url: string; model: string }> = {
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  freeai: { url: "https://api.free.ai/v1/chat/", model: "qwen7b" },
  nvidia: { url: "https://integrate.api.nvidia.com/v1/chat/completions", model: "google/gemma-4-31b-it" },
};

const looksLikeModel = (model: string) => /^[\w.:-][\w.:/-]*$/.test(model) && !/^https?:/.test(model);

export function endpoint(provider: string, base: string, path: string): string {
  let b = base.trim().replace(/\/+$/, "");
  let p = "/" + path.trim().replace(/^\/+/, "");
  const half = p.slice(0, p.length / 2);
  if (p.length > 2 && p.length % 2 === 0 && half + half === p) p = half;
  if (p !== "/" && b.toLowerCase().endsWith(p.toLowerCase())) return b;
  if (/\/v1$/.test(b) && p.startsWith("/v1/")) p = p.slice(3);
  if (provider === "mistral" && !/\/v1$/.test(b) && !p.startsWith("/v1/")) b = `${b}/v1`;
  return `${b}${p}`;
}

export function textTarget(provider: string, base: string, path: string, model: string): { url: string; model: string } {
  const preset = TEXT_PRESETS[provider];
  if (preset) return { url: preset.url, model: looksLikeModel(model) ? model : preset.model };
  return { url: endpoint(provider, base, path || "/chat/completions"), model };
}

export interface Destino {
  url: string;
  model: string;
  key: string;
  provider: string;
}

/** El proveedor de texto de Pilo y, si hay clave de NVIDIA y no es el principal, NVIDIA de apoyo. */
export async function leerProveedores(admin: Admin): Promise<{ principal: Destino | null; apoyo: Destino | null }> {
  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!settings) return { principal: null, apoyo: null };
  const keyOf = (provider: string) => String(secret?.[`${provider}_key`] ?? "");
  const provider = String(settings.provider ?? "mistral");
  const key = keyOf(provider) || String(secret?.api_key ?? "");
  const target = textTarget(provider, String(settings.base_url ?? ""), String(settings.chat_path ?? ""), String(settings.text_model ?? ""));
  const principal = target.url.startsWith("https://") && target.model && key ? { ...target, key, provider } : null;
  let apoyo: Destino | null = null;
  const nvKey = keyOf("nvidia");
  if (provider !== "nvidia" && nvKey) {
    const nv = TEXT_PRESETS.nvidia;
    apoyo = { url: nv.url, model: nv.model, key: nvKey, provider: "nvidia" };
  }
  return { principal, apoyo };
}

export interface Mensaje {
  role: string;
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Un pedido de chat. Si el principal falla (red, 429 o 5xx), se prueba el de apoyo.
 * Devuelve la respuesta cruda (para leer el flujo) o null si ninguno respondió.
 */
export async function llamar(
  destinos: { principal: Destino | null; apoyo: Destino | null },
  cuerpo: { messages: Mensaje[]; temperature?: number; max_tokens?: number; stream?: boolean; json?: boolean; tools?: unknown[] },
  signal?: AbortSignal,
): Promise<{ response: Response | null; error: string }> {
  const lista = [destinos.principal, destinos.apoyo].filter(Boolean) as Destino[];
  let error = "Pilo at Work aún no tiene proveedor de IA conectado.";
  for (const d of lista) {
    try {
      const response = await fetch(d.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${d.key}`, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model: d.model,
          messages: cuerpo.messages,
          temperature: cuerpo.temperature ?? 0.3,
          max_tokens: cuerpo.max_tokens ?? 1500,
          ...(cuerpo.stream ? { stream: true } : {}),
          ...(cuerpo.tools?.length ? { tools: cuerpo.tools, tool_choice: "auto" } : {}),
          ...(cuerpo.json && d.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (response.ok) return { response, error: "" };
      error = `El proveedor respondió ${response.status}.`;
      await response.body?.cancel();
      if (response.status !== 429 && response.status < 500) break;
    } catch (e) {
      error = e instanceof Error && e.name === "AbortError" ? "Se canceló." : "No se pudo hablar con el proveedor de IA.";
      if (signal?.aborted) break;
    }
  }
  return { response: null, error };
}
