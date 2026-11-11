/* =============================================================================
   Intranet · Mr. Pilo con IA · Voz · «Servidor propio».

   Los datos para que Pilo lea con la voz de un servidor que habla el formato
   de OpenAI (/audio/speech): dirección, ruta, modelo, voz y clave. Debajo se ve
   la dirección exacta a la que Pilo va a llamar y lo que falta, antes de
   guardar.

   La clave se guarda al momento y nunca vuelve completa; lo demás espera a
   «Guardar cambios» (la función del servidor usa lo guardado). La velocidad
   está en «Cómo suena» y viaja como `speed`.
   ========================================================================== */

import type { EditorApi } from "./sections";
import { Group, KeyField, StatusMark } from "./ui";
import { VOZ_KOKORO, vozPropiaAvisos, vozPropiaUrl } from "./voz-propia";

export function VozPropia({ ed }: { ed: EditorApi }) {
  const { s, set, setS, keys } = ed;
  // Sin dirección propia, el servidor usa la del texto: la pantalla hace la misma cuenta.
  const base = s.speech_base_url || s.base_url;
  const url = vozPropiaUrl(base, s.speech_path);
  const hasKey = keys
    ? Boolean(keys.keys?.voz?.has || keys.keys?.otro?.has || keys.keys?.[s.provider]?.has || keys.has_key)
    : null;
  const avisos = vozPropiaAvisos({ base, path: s.speech_path, model: s.speech_model, hasKey });
  const fails = avisos.filter((a) => a.tone === "fail").length;
  const badUrl = Boolean(base) && !url.startsWith("https://");

  return (
    <Group
      title="Servidor de voz propio"
      aside={
        <StatusMark tone={fails ? "fail" : avisos.length ? "warn" : "ok"}>
          {fails ? `Falta ${fails === 1 ? "1 dato" : `${fails} datos`}` : avisos.length ? "Revise los avisos" : "Listo para guardar"}
        </StatusMark>
      }
    >
      <p className="pis-lead">
        Sirve cualquier servidor que hable el formato de OpenAI (<code>/audio/speech</code>): Kokoro con mlx-audio, Voice Studio u otro propio. Puede
        estar en un computador de la oficina si se publica con https, por ejemplo con un túnel de Cloudflare.
      </p>

      <div className="pis-vp-presets" role="group" aria-label="Rellenar con un ejemplo">
        <span>Rellenar ruta, modelo y voz con</span>
        <button type="button" className="button-secondary" onClick={() => setS((prev) => ({ ...prev, ...VOZ_KOKORO }))}>
          Kokoro en español
        </button>
      </div>

      <div className="pis-grid">
        <label>
          Dirección del servidor
          <input
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            value={s.speech_base_url}
            placeholder={s.base_url ? `Vacío: la del texto (${s.base_url})` : "https://…/v1"}
            aria-invalid={badUrl || undefined}
            onChange={(e) => set("speech_base_url", e.target.value.trim())}
          />
        </label>
      </div>

      <div className="pis-grid pis-grid--3">
        <label>
          Ruta
          <input spellCheck={false} value={s.speech_path} placeholder="/audio/speech" onChange={(e) => set("speech_path", e.target.value.trim())} />
        </label>
        <label>
          Modelo
          <input spellCheck={false} value={s.speech_model} placeholder="mlx-community/Kokoro-82M-bf16" onChange={(e) => set("speech_model", e.target.value.trim())} />
        </label>
        <label>
          Voz (opcional)
          <input spellCheck={false} value={s.speech_voice} placeholder="ef_dora" onChange={(e) => set("speech_voice", e.target.value.trim())} />
        </label>
      </div>

      <p className="pis-vp-url" aria-live="polite">
        <span>Pilo llamará a</span>
        <code data-empty={url ? undefined : ""}>{url || "— falta la dirección —"}</code>
      </p>

      {avisos.length > 0 && (
        <ul className="pis-findings" aria-label="Lo que falta o conviene revisar">
          {avisos.map((a) => (
            <li key={a.id}>
              <StatusMark tone={a.tone === "fail" ? "fail" : "warn"}>{a.title}</StatusMark>
              <small>{a.detail}</small>
            </li>
          ))}
        </ul>
      )}

      <KeyField
        which="voz"
        label="Clave del servidor de voz"
        has={keys?.keys?.voz?.has ?? false}
        last4={keys?.keys?.voz?.last4 ?? ""}
      />
      <p className="pis-small">
        Si no pone una clave aquí, Pilo usa la de «otro servicio» o la del texto. Después de guardar, pulse la bocina de «Cómo suena» para oír la voz.
      </p>
    </Group>
  );
}
