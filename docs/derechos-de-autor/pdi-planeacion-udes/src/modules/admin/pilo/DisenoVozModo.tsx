/* =============================================================================
   Intranet · Mr. Pilo · «Diseñar la voz de un modo» (modo secreto AWOO).

   Se escribe (o se ajusta) la descripción de la voz, se crean hasta 3
   candidatos con ElevenLabs, se escuchan y se elige uno: «Usar esta» lo guarda
   en la cuenta de ElevenLabs y agrega el estilo de voz «Awoo» con su id. Como
   el resto de la pantalla de Voz, el estilo queda en el borrador hasta
   «Guardar cambios». La clave no pasa por aquí (la usa solo el servidor).
   La voz es original: se describe cómo suena, nunca a quién se parece.
   ========================================================================== */

import { useState } from "react";
import type { EditorApi } from "./sections";
import { Group, StatusMark } from "./ui";
import {
  AWOO_DESCRIPTION,
  AWOO_EMOTIONS,
  AWOO_PARAMS,
  AWOO_SAMPLE,
  AWOO_SHOUT,
  AWOO_STYLE_NAME,
  DESIGN_LIMITS,
  designProblem,
  designVoices,
  saveDesignedVoice,
  withAwooStyle,
} from "./voz-awoo";
import type { VoiceCandidate } from "./voz-awoo";

type Note = { tone: "ok" | "fail" | "busy"; text: string } | null;

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function DisenoVozModo({ ed }: { ed: EditorApi }) {
  const { s, setS, keys, dirty } = ed;
  const [description, setDescription] = useState(AWOO_DESCRIPTION);
  const [text, setText] = useState(AWOO_SAMPLE);
  const [candidates, setCandidates] = useState<VoiceCandidate[]>([]);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const has = keys?.keys?.elevenlabs?.has ?? false;
  const current = s.voice_styles.find((x) => fold(x.name) === fold(AWOO_STYLE_NAME));

  if (s.needs0172) return null;

  async function create() {
    const problem = designProblem(description, text);
    if (problem) {
      setNote({ tone: "fail", text: problem });
      return;
    }
    setBusy("crear");
    setNote({ tone: "busy", text: "ElevenLabs está diseñando las voces (puede tardar medio minuto)…" });
    try {
      const list = await designVoices(description, text);
      setCandidates(list);
      setNote(list.length ? { tone: "ok", text: `Hay ${list.length} candidatos. Escúchelos y elija.` } : { tone: "fail", text: "ElevenLabs no devolvió candidatos. Pruebe con otra descripción." });
    } catch (error) {
      setNote({ tone: "fail", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function use(candidate: VoiceCandidate, index: number) {
    setBusy(candidate.id);
    setNote({ tone: "busy", text: `Guardando el candidato ${index + 1} como «${AWOO_STYLE_NAME}»…` });
    try {
      const voiceId = await saveDesignedVoice(candidate.id, description);
      setS((prev) => ({ ...prev, voice_styles: withAwooStyle(prev.voice_styles, voiceId) }));
      setCandidates([]);
      setNote({ tone: "ok", text: `Listo: la voz quedó en su cuenta de ElevenLabs y el estilo «${AWOO_STYLE_NAME}» se agregó aquí. Pulse «Guardar cambios» y pruebe el modo.` });
    } catch (error) {
      setNote({ tone: "fail", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Group title="Diseñar la voz de un modo" aside={<small>Voz original con ElevenLabs · modo AWOO</small>}>
      <p className="pis-lead">
        Describa cómo suena la voz y ElevenLabs crea tres candidatos para que usted escuche y elija uno. Se guarda como el estilo «{AWOO_STYLE_NAME}», y el modo secreto lo encuentra por ese nombre. La voz es original: describa la edad, el acento, el
        ritmo y la energía, nunca a quién se parece.
      </p>
      <p className="pis-small" role="note">
        Pedir los candidatos y guardar una voz gastan créditos y exigen un plan de ElevenLabs con diseño de voces (y espacio para una voz más en la cuenta). La clave necesita permiso de Text to Voice / Voices. Hasta 12 diseños por día.
      </p>
      {!has && <p className="pis-warn">Falta la clave de ElevenLabs: péguela arriba, en «Voz de ElevenLabs».</p>}

      <label>
        Descripción de la voz ({description.trim().length} de {DESIGN_LIMITS.descMax})
        <textarea rows={5} maxLength={DESIGN_LIMITS.descMax} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Texto de muestra, el primer saludo del modo ({text.trim().length} de {DESIGN_LIMITS.textMax}; mínimo {DESIGN_LIMITS.textMin})
        <textarea rows={4} maxLength={DESIGN_LIMITS.textMax} value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      <details>
        <summary>Perfil del modo y emociones</summary>
        <p className="pis-small">
          Tono del estilo: {AWOO_PARAMS.tone} · velocidad {AWOO_PARAMS.rate.toLocaleString("es-CO", { minimumFractionDigits: 2 })}× · tono de voz {AWOO_PARAMS.pitch.toLocaleString("es-CO", { minimumFractionDigits: 1 })}. Grito de guerra: «{AWOO_SHOUT.text}» con la
          emoción «{AWOO_SHOUT.tone}».
        </p>
        <ul className="pis-small">
          {AWOO_EMOTIONS.map((e) => (
            <li key={e.tone}>
              {e.tone}: emoción «{e.emotion}»{e.tag ? `, etiqueta ${e.tag} con Eleven v3 o v4` : ", sin etiqueta (se ajusta la estabilidad)"}
            </li>
          ))}
        </ul>
      </details>

      <div className="pis-row">
        <button type="button" className="button-primary" onClick={create} disabled={busy !== null || !has}>
          {busy === "crear" ? "Creando…" : "Crear candidatos"}
        </button>
        {current?.eleven_id && (
          <StatusMark tone="ok">
            El estilo «{current.name}» ya tiene la voz {current.eleven_id.slice(0, 8)}…
          </StatusMark>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="pis-voices">
          <h4>Candidatos</h4>
          <ul>
            {candidates.map((c, i) => (
              <li key={c.id}>
                <span className="pis-voices__main">
                  <span>
                    <strong>Candidato {i + 1}</strong>
                    <small>{c.seconds ? `${c.seconds.toLocaleString("es-CO")} s` : "muestra"}</small>
                  </span>
                </span>
                <span className="pis-voices__actions">
                  <audio controls preload="none" src={`data:audio/mpeg;base64,${c.audio}`} aria-label={`Candidato ${i + 1} de la voz`} />
                  <button type="button" className="button-primary" onClick={() => use(c, i)} disabled={busy !== null}>
                    {busy === c.id ? "Guardando…" : "Usar esta"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dirty && <p className="pis-small">Hay cambios sin guardar en Voz: pulse «Guardar cambios» para que el modo use la voz nueva.</p>}
      {note && (
        <p role="status" className="pis-result">
          {note.tone === "busy" ? note.text : <StatusMark tone={note.tone}>{note.text}</StatusMark>}
        </p>
      )}
    </Group>
  );
}
