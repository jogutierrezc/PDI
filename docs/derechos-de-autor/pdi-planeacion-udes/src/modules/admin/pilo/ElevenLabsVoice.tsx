/* =============================================================================
   Intranet · Mr. Pilo con IA · la voz de ElevenLabs (0172).

   Tres grupos en Voz cuando ElevenLabs es la voz:
   · «Voz de ElevenLabs»      clave, modelo, voz de siempre y por estilo, formato,
                              ajustes, respaldo, prueba de la conexión y uso del mes.
   · «Probar emociones»       elegir una emoción y una frase y oírla.
   · «Hacer cantar a Pilo»    letra o tema + estilo → canción original; quién puede
                              pedirla y los topes (tabla pilo_extras, al momento).

   La clave se guarda al momento y nunca vuelve completa. Todo lo demás espera a
   «Guardar cambios» (la función del servidor usa lo guardado).
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { VoiceStyle } from "../../../components/pilo/ai/logic";
import type { EditorApi } from "./sections";
import { ELEVEN_FORMATS, ELEVEN_MODEL_IDS } from "./store";
import { Group, KeyField, StatusMark } from "./ui";
import { styleId } from "./voice-sample";
import { FISH_TONES } from "./VoiceStyles";
import {
  COST_NOTICE,
  ELEVEN_FORMAT_LABEL,
  ELEVEN_MODEL_LABEL,
  EMOTION_CHOICES,
  EMOTION_LINE,
  SING_LANG_CHOICES,
  SING_STYLE_CHOICES,
  elevenStatus,
  elevenVoices,
  singSong,
  tryEmotion,
  usageLine,
} from "./eleven";
import type { ElevenStatus, ElevenVoiceItem } from "./eleven";

type Note = { tone: "ok" | "fail" | "busy"; text: string } | null;

let player: HTMLAudioElement | null = null;
async function play(blob: Blob) {
  player?.pause();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  player = audio;
  try {
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.onpause = () => resolve();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const said = (note: Note) => (note ? <p role="status" className="pis-result">{note.tone === "busy" ? note.text : <StatusMark tone={note.tone}>{note.text}</StatusMark>}</p> : null);

export function ElevenLabsVoice({ ed }: { ed: EditorApi }) {
  return (
    <>
      <ElevenSettings ed={ed} />
      <ElevenEmotions ed={ed} />
      <ElevenSing ed={ed} />
    </>
  );
}

/* --- Conexión, voz y ajustes ---------------------------------------------------------------- */

function ElevenSettings({ ed }: { ed: EditorApi }) {
  const { s, setS, set, keys, dirty } = ed;
  const [status, setStatus] = useState<ElevenStatus | null>(null);
  const [voices, setVoices] = useState<ElevenVoiceItem[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [voiceInput, setVoiceInput] = useState("");
  const has = keys?.keys?.elevenlabs?.has ?? false;
  const taggedModel = s.eleven_model === "eleven_v3" || s.eleven_model === "eleven_v4";
  const main = s.voice_styles.find((x) => x.id === s.voice_style) ?? s.voice_styles[0];
  const patchStyle = (id: string, patch: Partial<VoiceStyle>) => setS((prev) => ({ ...prev, voice_styles: prev.voice_styles.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  async function connect() {
    setBusy(true);
    setNote({ tone: "busy", text: "Preguntando a ElevenLabs…" });
    const result = await elevenStatus();
    setStatus(result);
    setNote(null);
    setBusy(false);
  }

  async function listVoices() {
    setBusy(true);
    setNote({ tone: "busy", text: "Pidiendo la lista de voces…" });
    try {
      setVoices(await elevenVoices());
      setNote(null);
    } catch (error) {
      setNote({ tone: "fail", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function addStyle() {
    const id = voiceInput.trim();
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) {
      setNote({ tone: "fail", text: "El id de la voz son letras y números (unos 20). Elíjala de la lista o péguela de elevenlabs.io › Voices." });
      return;
    }
    const label = name.trim() || (s.voice_styles.length === 0 ? "Pilo" : `Estilo ${s.voice_styles.length + 1}`);
    const style: VoiceStyle = { id: styleId(label, s.voice_styles.map((x) => x.id)), name: label, path: "", seconds: 0, eleven_id: id };
    setS((prev) => ({ ...prev, voice_styles: [...prev.voice_styles, style], voice_style: prev.voice_style || style.id }));
    setName("");
    setVoiceInput("");
    setNote({ tone: "ok", text: `Agregado el estilo «${style.name}». Guarde los cambios y pruébelo.` });
  }

  if (s.needs0172) {
    return (
      <Group title="Voz de ElevenLabs">
        <p className="pis-warn">Falta aplicar la migración 0172 en la base para guardar la voz de ElevenLabs.</p>
      </Group>
    );
  }

  return (
    <Group title="Voz de ElevenLabs" aside={<small>Emociones con etiquetas · también canta</small>}>
      <p className="pis-lead">
        Pilo habla con una voz de su cuenta de ElevenLabs. Con Eleven v3 o v4 la emoción se pide con etiquetas de audio puestas por el servidor (nunca las escribe quien conversa); con los otros modelos se
        ajusta la estabilidad y el estilo.
      </p>
      <p className="pis-small" role="note">{COST_NOTICE}</p>

      <KeyField which="elevenlabs" label="Clave de ElevenLabs (elevenlabs.io › Developers › API Keys)" has={has} last4={keys?.keys?.elevenlabs?.last4 ?? ""} />

      <div className="pis-grid pis-grid--3">
        <label>
          Modelo
          <select value={s.eleven_model} onChange={(e) => set("eleven_model", e.target.value)}>
            {ELEVEN_MODEL_IDS.map((m) => (
              <option key={m} value={m}>
                {ELEVEN_MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Formato de salida
          <select value={s.eleven_format} onChange={(e) => set("eleven_format", e.target.value)}>
            {ELEVEN_FORMATS.map((f) => (
              <option key={f} value={f}>
                {ELEVEN_FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Si ElevenLabs falla o no tiene créditos
          <select value={s.eleven_fallback} onChange={(e) => set("eleven_fallback", e.target.value as typeof s.eleven_fallback)}>
            <option value="ninguno">Avisar del error (sin voz)</option>
            <option value="fishaudio">Que lea Fish Audio</option>
            <option value="nvidia">Que lea NVIDIA</option>
          </select>
          <small className="pis-small">El respaldo es otra voz del servicio, nunca la del navegador.</small>
        </label>
      </div>

      <div className="pis-grid pis-grid--3">
        <label>
          Voz de siempre (id)
          <input value={s.eleven_voice_id} spellCheck={false} placeholder="p. ej. JBFqnCBsd6RMkjVDRZzb" onChange={(e) => set("eleven_voice_id", e.target.value.trim())} />
          <small className="pis-small">Los estilos de abajo pueden traer la suya.</small>
        </label>
        <label>
          Estabilidad · {s.eleven_stability.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          <input type="range" min={0} max={1} step={0.05} value={s.eleven_stability} onChange={(e) => set("eleven_stability", Number(e.target.value))} />
          <small className="pis-small">{taggedModel ? "En v3 y v4 se ajusta a Creativa (0), Natural (0,5) o Robusta (1)." : "Baja: más emoción. Alta: más monótona."}</small>
        </label>
        <label>
          Parecido a la voz · {s.eleven_similarity.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          <input type="range" min={0} max={1} step={0.05} value={s.eleven_similarity} onChange={(e) => set("eleven_similarity", Number(e.target.value))} />
        </label>
        <label>
          Estilo · {s.eleven_style.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          <input type="range" min={0} max={1} step={0.05} value={s.eleven_style} disabled={taggedModel} onChange={(e) => set("eleven_style", Number(e.target.value))} />
          <small className="pis-small">{taggedModel ? "No se usa con v3 ni v4." : "Más estilo, más lento."}</small>
        </label>
        <label>
          Velocidad · {s.eleven_speed.toLocaleString("es-CO", { minimumFractionDigits: 2 })}×
          <input type="range" min={0.7} max={1.2} step={0.05} value={s.eleven_speed} onChange={(e) => set("eleven_speed", Number(e.target.value))} />
        </label>
        <label className="pis-check">
          <input type="checkbox" checked={s.eleven_speaker_boost} disabled={taggedModel} onChange={(e) => set("eleven_speaker_boost", e.target.checked)} />
          Refuerzo del hablante (speaker boost)
        </label>
      </div>

      <div className="pis-row">
        <button type="button" className="button-primary" onClick={connect} disabled={busy || !has}>
          Probar la conexión
        </button>
        <button type="button" className="button-secondary" onClick={listVoices} disabled={busy || !has}>
          Ver las voces de mi cuenta
        </button>
        {!has && <small className="pis-small">Pegue primero la clave.</small>}
      </div>
      {status && (
        <p role="status" className="pis-result">
          <StatusMark tone={status.ok ? "ok" : status.limited ? "warn" : "fail"}>{usageLine(status)}</StatusMark>
        </p>
      )}

      {voices && (
        <div className="pis-voices">
          <h4>Voces de su cuenta</h4>
          {voices.length === 0 ? (
            <p className="pis-small">La cuenta no devolvió voces.</p>
          ) : (
            <ul>
              {voices.map((v) => (
                <li key={v.id}>
                  <span className="pis-voices__main">
                    <span>
                      <strong>{v.name}</strong>
                      <small>
                        {[v.category, v.detail].filter(Boolean).join(" · ")} · {v.id}
                      </small>
                    </span>
                  </span>
                  <span className="pis-voices__actions">
                    {v.preview && <audio controls preload="none" src={v.preview} aria-label={`Muestra de ${v.name}`} />}
                    <button type="button" className="button-secondary" onClick={() => set("eleven_voice_id", v.id)}>
                      Usar como la de siempre
                    </button>
                    <button type="button" className="button-secondary" onClick={() => setVoiceInput(v.id)}>
                      Para un estilo
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="pis-voices">
        <h4>Estilos de voz</h4>
        {s.voice_styles.length === 0 ? (
          <p className="pis-small">Sin estilos, suena la voz de siempre. Un estilo le da a Pilo otra voz y otro tono (por ejemplo, otra para Pregúntele a Pilo).</p>
        ) : (
          <ul>
            {s.voice_styles.map((style) => (
              <li key={style.id} data-main={style.id === main?.id || undefined}>
                <label className="pis-voices__main">
                  <input type="radio" name="voz-principal-eleven" checked={style.id === main?.id} onChange={() => set("voice_style", style.id)} />
                  <span>
                    <strong>{style.name}</strong>
                    <small>{style.eleven_id ? `voz ${style.eleven_id.slice(0, 8)}…` : "usa la voz de siempre"}{style.id === main?.id ? " · la de siempre" : ""}</small>
                  </span>
                </label>
                <label className="pis-voices__tone">
                  <span className="sr-only">Id de la voz de «{style.name}»</span>
                  <input value={style.eleven_id ?? ""} spellCheck={false} placeholder="id de la voz" onChange={(e) => patchStyle(style.id, { eleven_id: e.target.value.trim() })} />
                </label>
                <label className="pis-voices__tone">
                  <span className="sr-only">Tono de «{style.name}»</span>
                  <select value={style.tone ?? ""} onChange={(e) => patchStyle(style.id, { tone: e.target.value })}>
                    {FISH_TONES.map(([id, text]) => (
                      <option key={id} value={id}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="pis-voices__actions">
                  <button
                    type="button"
                    className="pis-link pis-link--danger"
                    onClick={() =>
                      setS((prev) => {
                        const styles = prev.voice_styles.filter((x) => x.id !== style.id);
                        const portals = Object.fromEntries(Object.entries(prev.voice_portal_styles).filter(([, id]) => id !== style.id));
                        return { ...prev, voice_styles: styles, voice_style: prev.voice_style === style.id ? (styles[0]?.id ?? "") : prev.voice_style, voice_portal_styles: portals };
                      })
                    }
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="pis-voices__add">
          <label>
            Nombre
            <input value={name} maxLength={40} placeholder="Pilo" onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Id de la voz en ElevenLabs
            <input value={voiceInput} spellCheck={false} placeholder="id de la voz" onChange={(e) => setVoiceInput(e.target.value)} />
          </label>
          <button type="button" className="button-secondary" onClick={addStyle} disabled={!voiceInput.trim()}>
            Agregar estilo
          </button>
        </div>
        {dirty && <p className="pis-small">Hay cambios sin guardar: las pruebas usan lo guardado.</p>}
      </div>
      {said(note)}
    </Group>
  );
}

/* --- Probar emociones ------------------------------------------------------------------------- */

function ElevenEmotions({ ed }: { ed: EditorApi }) {
  const { s, dirty } = ed;
  const [emotion, setEmotion] = useState("emocionado");
  const [line, setLine] = useState(EMOTION_LINE);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const tagged = s.eleven_model === "eleven_v3" || s.eleven_model === "eleven_v4";

  async function hear() {
    if (dirty) {
      setNote({ tone: "fail", text: "Guarde los cambios para probar: la función del servidor usa lo guardado." });
      return;
    }
    setBusy(true);
    setNote({ tone: "busy", text: "Pidiendo la voz a ElevenLabs…" });
    const result = await tryEmotion(line.slice(0, 300), emotion);
    if ("error" in result) setNote({ tone: "fail", text: result.error });
    else {
      setNote({ tone: "ok", text: `Sonó (${(result.ms / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} s).` });
      await play(result.audio);
    }
    setBusy(false);
  }

  return (
    <Group title="Probar emociones" aside={<small>{tagged ? "Con etiquetas de audio" : "Con estabilidad y estilo"}</small>}>
      <p className="pis-lead">
        Elija una emoción y una frase y oiga cómo la dice Pilo. {tagged ? "Con este modelo la emoción es una etiqueta al comienzo de la frase." : "Con este modelo la emoción mueve la estabilidad, el estilo y la velocidad."} Cada prueba gasta créditos.
      </p>
      <div className="pis-grid">
        <label>
          Emoción
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
            {EMOTION_CHOICES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Frase
          <input value={line} maxLength={300} onChange={(e) => setLine(e.target.value)} />
        </label>
      </div>
      <div className="pis-row">
        <button type="button" className="button-primary" onClick={hear} disabled={busy || !line.trim()}>
          {busy ? "Sonando…" : "Oír"}
        </button>
      </div>
      {said(note)}
    </Group>
  );
}

/* --- Hacer cantar a Pilo ---------------------------------------------------------------------- */

const SING_AUDIENCES: [string, string][] = [
  ["nadie", "Nadie"],
  ["admin", "Solo administración"],
  ["sesion", "Con sesión de la intranet"],
  ["publico", "Todos"],
];
const SING_SPACES: [string, string][] = [
  ["planeacion", "Pilo de la Universidad"],
  ["ensenanza", "Pilo en Enseñanza"],
];
const SING_KEY = ["pilo-ia", "cantar-admin"];

type SingRow = { space: string; sing_aud?: string; sing_daily?: number; sing_max_chars?: number; sing_max_seconds?: number };

function useSingRows() {
  return useQuery({
    queryKey: SING_KEY,
    retry: false,
    queryFn: async (): Promise<SingRow[] | null> => {
      const { data, error } = await supabase.from("pilo_extras").select("*");
      return error ? null : ((data ?? []) as SingRow[]);
    },
  });
}

function useSaveSing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ space, patch }: { space: string; patch: Record<string, string | number> }) => {
      const { error } = await supabase.from("pilo_extras").update({ ...patch, updated_at: new Date().toISOString() }).eq("space", space);
      if (error) throw new Error(error.message);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: SING_KEY }),
  });
}

function ElevenSing({ ed }: { ed: EditorApi }) {
  const { dirty } = ed;
  const rows = useSingRows();
  const save = useSaveSing();
  const [modo, setModo] = useState<"voz" | "musica">("voz");
  const [letra, setLetra] = useState("");
  const [tema, setTema] = useState("");
  const [estilo, setEstilo] = useState("jingle");
  const [idioma, setIdioma] = useState("es");
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [song, setSong] = useState<{ url: string } | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const missing = rows.data === null || (rows.data ?? []).some((r) => r.sing_aud === undefined);
  const row = (space: string) => rows.data?.find((r) => r.space === space);

  async function generate() {
    if (dirty) {
      setNote({ tone: "fail", text: "Guarde los cambios para cantar: la función del servidor usa lo guardado." });
      return;
    }
    setBusy(true);
    setNote({ tone: "busy", text: modo === "musica" ? "Componiendo con Eleven Music (puede tardar un minuto)…" : "Pilo está cantando…" });
    const result = await singSong({ letra, tema, estilo, idioma, modo });
    if ("error" in result) {
      setNote({ tone: "fail", text: result.error });
    } else {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(result.audio);
      setSong({ url: urlRef.current });
      setNote({ tone: "ok", text: `Lista (${(result.ms / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} s).` });
    }
    setBusy(false);
  }

  const number = (space: string, field: "sing_daily" | "sing_max_chars" | "sing_max_seconds", label: string, min: number, max: number, fallback: number) => {
    const value = row(space)?.[field] ?? fallback;
    return (
      <label>
        {label}
        <input
          key={`${space}-${field}-${value}`}
          type="number"
          min={min}
          max={max}
          defaultValue={value}
          disabled={missing || rows.isPending}
          onBlur={(e) => {
            const n = Math.min(max, Math.max(min, Math.round(Number(e.target.value)) || fallback));
            e.target.value = String(n);
            if (n !== value) save.mutate({ space, patch: { [field]: n } });
          }}
        />
      </label>
    );
  };

  return (
    <Group title="Hacer cantar a Pilo" aside={<small>Composiciones originales</small>}>
      <p className="pis-lead">
        Pilo canta <strong>composiciones originales</strong>: un jingle de la UDES, un saludo cantado, un cumpleaños. No canta canciones de otras personas ni «al estilo de» un artista: el servidor rechaza esos pedidos y
        ElevenLabs también. Se pide desde aquí y, en el chat de la app, escribiendo «cántame…» (un tema o una letra original): lo decide la audiencia de abajo.
      </p>
      <p className="pis-small" role="note">{COST_NOTICE}</p>

      <div className="pis-choice" role="radiogroup" aria-label="Cómo canta">
        <button type="button" role="radio" aria-checked={modo === "voz"} onClick={() => setModo("voz")}>
          <strong>Con la voz de Pilo (experimental)</strong>
          <span>Eleven v3/v4 con la etiqueta [sings]: la voz de Pilo recita la letra con melodía; sin acompañamiento. Hace falta la letra.</span>
        </button>
        <button type="button" role="radio" aria-checked={modo === "musica"} onClick={() => setModo("musica")}>
          <strong>Canción con acompañamiento (Eleven Music)</strong>
          <span>Una canción completa con su propio cantante y música. No usa la voz de Pilo: la API de música no permite elegir la voz. Solo planes de pago.</span>
        </button>
      </div>

      <div className="pis-grid">
        <label>
          Estilo
          <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
            {SING_STYLE_CHOICES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Idioma
          <select value={idioma} onChange={(e) => setIdioma(e.target.value)}>
            {SING_LANG_CHOICES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        De qué trata {modo === "musica" ? "(si no escribe la letra, la compone el modelo)" : "(opcional)"}
        <input value={tema} maxLength={200} placeholder="Un saludo de bienvenida a los estudiantes nuevos de la UDES" onChange={(e) => setTema(e.target.value)} />
      </label>
      <label>
        Letra original
        <textarea value={letra} rows={6} maxLength={1500} placeholder={"Bienvenidos a la UDES,\nun lugar para crecer…"} onChange={(e) => setLetra(e.target.value)} />
        <small className="pis-small">Las líneas entre corchetes, llaves o ángulos se descartan.</small>
      </label>
      <div className="pis-row">
        <button type="button" className="button-primary" onClick={generate} disabled={busy || (!letra.trim() && !tema.trim())}>
          {busy ? "Cantando…" : "Hacer cantar"}
        </button>
      </div>
      {said(note)}
      {song && (
        <div className="pis-result">
          <audio controls src={song.url} aria-label="Canción generada" />
          <a className="button-secondary" href={song.url} download="pilo-cancion.mp3">
            Descargar MP3
          </a>
        </div>
      )}

      <header className="pis-group__head">
        <h3>Quién puede pedir que Pilo cante</h3>
        <small role="status">{missing ? <StatusMark tone="warn">Falta la migración 0172</StatusMark> : save.isPending ? "Guardando…" : save.isError ? <StatusMark tone="fail">No se guardó</StatusMark> : "Cada cambio se aplica al momento"}</small>
      </header>
      <p className="pis-small">Nace apagado. La administración siempre puede probar desde aquí; fuera de aquí, solo quien el Pilo permita.</p>
      {SING_SPACES.map(([space, label]) => (
        <div key={space} className="pis-grid pis-grid--3" role="group" aria-label={`Cantar en ${label}`}>
          <label>
            {label}
            <select
              value={row(space)?.sing_aud ?? "nadie"}
              disabled={missing || rows.isPending}
              onChange={(e) => save.mutate({ space, patch: { sing_aud: e.target.value } })}
            >
              {SING_AUDIENCES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          {number(space, "sing_daily", "Canciones nuevas al día (0 = ninguna)", 0, 200, 10)}
          {number(space, "sing_max_chars", "Máximo de caracteres de la letra", 100, 1500, 600)}
          {number(space, "sing_max_seconds", "Duración máxima (segundos)", 10, 180, 60)}
        </div>
      ))}
      {save.isError && <p className="pis-error" role="alert">No se guardó: {(save.error as Error).message}</p>}
    </Group>
  );
}
