/* =============================================================================
   Traspaso de Pilo a un agente · lo que ve la persona.

   Pasos (el estado sale de la conversación, ver useTraspaso):
     1. Pilo pide los datos con el consentimiento de la Ley 1581 de 2012.
     2. Espera: «En un momento un Agente de la UDES te atenderá».
     3. El agente acepta: Pilo se despide y la cabecera pasa a su nombre y foto
        (mientras no haya foto, sus iniciales).
     4. Chat con el agente: adjuntos, emoticones, «escribiendo…», enviado /
        entregado / leído, aviso si lo reasignan, cola sin conexión.
     5. Cierre: Pilo vuelve y pregunta si sirvió (1 a 5). «Volver a Pilo».

   Se pinta dentro del panel del chat de Pilo (PiloEmbed, AskPilo) y usa sus
   tokens --ap-* para seguir sus temas.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ATTACHMENT_ACCEPT, attachmentProblem, MAX_FILES_PER_MESSAGE, mimeFor } from "../soporte/adjuntos";
import { initials } from "../soporte/estados";
import { POLICY_PATH } from "../pilo-app/terms/policy";
import { fileUrl } from "./api";
import type { FileInfo, Saved, View } from "./api";
import { enterBlock, enterHeader, enterMessages, enterNotice, useMotion } from "./motion";
import { formProblem } from "./reglas";
import type { Traspaso } from "./useTraspaso";
import "./traspaso.css";

const EMOJIS: [string, string][] = [
  ["🙂", "Sonrisa"], ["😊", "Contento"], ["😄", "Alegre"], ["🙏", "Gracias"], ["👍", "Pulgar arriba"], ["👌", "Perfecto"],
  ["👏", "Aplausos"], ["✅", "Hecho"], ["📄", "Documento"], ["📎", "Adjunto"], ["📞", "Teléfono"], ["❓", "Pregunta"],
];

const RATES = ["Nada útil", "Poco útil", "Más o menos", "Útil", "Muy útil"];

const clock = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const kindOf = (mime: string) => (mime.startsWith("image/") ? "IMG" : mime === "application/pdf" ? "PDF" : mime.includes("word") ? "DOC" : "XLS");

/** La cabecera cuando atiende un agente: su foto y su nombre (el diseño aprobado). */
export function AgentHeader({ t, onClose, children }: { t: Traspaso; onClose?: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const agent = t.view?.agent;
  useMotion(ref, () => enterHeader(Array.from(ref.current?.querySelectorAll("[data-hd]") ?? [])), [agent?.name]);
  return (
    <header className="ho-head" ref={ref}>
      {agent?.photo_url ? (
        <img className="ho-photo" data-hd src={agent.photo_url} alt={`Foto de ${agent.name}`} width={44} height={44} />
      ) : (
        <span className="ho-photo ho-photo-ini" data-hd role="img" aria-label={`Foto de ${agent?.name ?? "tu agente"} por llegar`}>
          {initials(agent?.name ?? "")}
        </span>
      )}
      <div className="ho-who" data-hd>
        <strong>{agent?.name ?? "Agente de la UDES"}</strong>
        <span>Agente de la UDES</span>
      </div>
      <span className={`ho-cx${t.connected ? "" : " re"}`} data-hd role="status">
        <i />
        {t.connected ? "En línea" : "Reconectando…"}
      </span>
      {children}
      {onClose ? (
        <button type="button" className="ho-ib" onClick={onClose} aria-label="Cerrar el chat">
          ✕
        </button>
      ) : null}
    </header>
  );
}

export function TraspasoBody({ t, label = "Pilo" }: { t: Traspaso; label?: string }) {
  const log = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<{ file: File; problem: string }[]>([]);
  const [pop, setPop] = useState<"clip" | "emoji" | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const messages = t.view?.messages ?? [];
  const chat = t.step === "chat";

  useMotion(
    log,
    () => {
      const fresh = Array.from(log.current?.querySelectorAll<HTMLElement>("[data-k]") ?? []).filter((el) => !seen.current.has(el.dataset.k ?? ""));
      fresh.forEach((el) => seen.current.add(el.dataset.k ?? ""));
      // Lo que se vuelve a pintar al recargar no se anima; solo lo que llega.
      enterMessages(fresh.slice(-6));
      const node = log.current;
      if (node) node.scrollTop = node.scrollHeight;
    },
    [messages.length, t.local.length, t.queued.length, t.agentTyping, t.step],
  );
  useMotion(noticeRef, () => t.notice && enterNotice(noticeRef.current), [t.notice]);

  const addFiles = (list: FileList | null) => {
    setPop(null);
    if (!list) return;
    const next = Array.from(list).map((file) => ({ file, problem: attachmentProblem(file) }));
    setFiles((f) => [...f, ...next].slice(0, MAX_FILES_PER_MESSAGE));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = files.filter((f) => !f.problem).map((f) => new File([f.file], f.file.name, { type: mimeFor(f.file) }));
    if (!draft.trim() && !ok.length) return;
    const text = draft;
    setDraft("");
    setFiles([]);
    setPop(null);
    await t.send(text, ok);
  };

  const open = async (file: FileInfo, saved: Saved) => {
    try {
      const url = await fileUrl(saved, file.path);
      if (file.mime.startsWith("image/")) setLightbox({ url, name: `${file.name} · ${size(file.size)}` });
      else window.open(url, "_blank", "noopener");
    } catch {
      /* el aviso de error lo da la cola */
    }
  };

  const lastOwn = [...messages].reverse().find((m) => m.kind === "incoming");

  return (
    <>
      {t.notice ? (
        <div className="ho-notice" ref={noticeRef} role="status">
          <span>{t.notice}</span>
          <button type="button" onClick={t.dismissNotice}>
            Entendido
          </button>
        </div>
      ) : null}

      <div className="ho-log" ref={log} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Mensajes del chat" tabIndex={0}>
        {t.local.map((l) => (
          <div key={l.id} className={`ho-mr${l.from === "student" ? " u" : ""}`} data-k={`l:${l.id}`}>
            {l.from === "pilo" ? <span className="ho-lab">{label}</span> : null}
            <div className={`ho-b ${l.from === "student" ? "u" : "p"}`}>{l.text}</div>
          </div>
        ))}

        {t.step === "form" ? <HandoffForm t={t} /> : null}

        {t.saved && t.step === "waiting" ? <WaitCard t={t} /> : null}

        {messages.map((m) => {
          if (m.kind === "activity") {
            return (
              <div key={m.id} className="ho-mr s" data-k={`m:${m.id}`}>
                <span className="ho-sys">{m.body}</span>
              </div>
            );
          }
          const own = m.kind === "incoming";
          const pilo = m.author_kind === "pilo";
          return (
            <div key={m.id} className={`ho-mr${own ? " u" : ""}`} data-k={`m:${m.id}`}>
              {pilo ? <span className="ho-lab">{label}</span> : !own ? <span className="ho-lab">{m.author_name}</span> : null}
              <div className={`ho-b ${own ? "u" : pilo ? "p" : "a"}`}>
                {m.body ? <span>{m.body}</span> : null}
                {m.files.map((f) => (
                  <button key={f.id} type="button" className="ho-file ho-press" onClick={() => t.saved && void open(f, t.saved)}>
                    <span className="ho-fi">{kindOf(f.mime)}</span>
                    <span className="ho-fn">
                      <b>{f.name}</b>
                      <span>{size(f.size)}</span>
                    </span>
                  </button>
                ))}
              </div>
              <span className="ho-time">
                {clock(m.created_at)}
                {own && m.id === lastOwn?.id ? ` · ${m.status === "read" ? "Leído" : m.status === "delivered" ? "Entregado" : "Enviado"}` : ""}
              </span>
            </div>
          );
        })}

        {t.queued.map((q) => (
          <div key={q.id} className="ho-mr u" data-k={`q:${q.id}`}>
            <div className="ho-b u">{q.text}</div>
            <span className="ho-time q">En cola · se envía al reconectar</span>
          </div>
        ))}

        {t.agentTyping ? (
          <div className="ho-mr" data-k="typing">
            <div className="ho-b a">
              <span className="ho-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
            <span className="ho-time">{t.view?.agent?.name.split(" ")[0] ?? "El agente"} está escribiendo…</span>
            <span className="ho-sr" role="status">
              {t.view?.agent?.name.split(" ")[0] ?? "El agente"} está escribiendo
            </span>
          </div>
        ) : null}

        {t.step === "rate" ? <Rating t={t} /> : null}

        {t.step === "thanks" ? (
          <div className="ho-mr s" data-k="fin">
            <button type="button" className="ho-cta ho-press" onClick={() => void t.back()}>
              Volver a Pilo
            </button>
          </div>
        ) : null}

        {!t.connected ? (
          <div className="ho-off" role="status">
            Sin conexión. Seguimos intentando; tus mensajes quedan en cola y se envían solos al reconectar.
          </div>
        ) : null}
        {t.error && t.step !== "form" ? (
          <p className="ho-error" role="alert">
            {t.error}
          </p>
        ) : null}
      </div>

      <div className="ho-foot">
        {files.length ? (
          <div className="ho-chips" role="group" aria-label="Archivos por enviar">
            {files.map((f, i) => (
              <div key={`${f.file.name}${i}`} className={`ho-chip${f.problem ? " err" : ""}`}>
                <span className="ho-fi">{kindOf(mimeFor(f.file) || "x")}</span>
                <span className="ho-fn">
                  <b>{f.file.name}</b>
                  <span role="status">{f.problem || size(f.file.size)}</span>
                </span>
                <button type="button" className="ho-ib" aria-label={`Quitar ${f.file.name}`} onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form className="ho-form" onSubmit={(e) => void submit(e)}>
          <div className="ho-rel">
            <button type="button" className="ho-ib ho-press" aria-label="Adjuntar" aria-haspopup="menu" aria-expanded={pop === "clip"} disabled={!chat} onClick={() => setPop(pop === "clip" ? null : "clip")}>
              📎
            </button>
            {pop === "clip" ? (
              <div className="ho-pop" role="menu" aria-label="Adjuntar">
                <button type="button" role="menuitem" onClick={() => { if (fileInput.current) { fileInput.current.accept = "image/*"; fileInput.current.click(); } }}>Imagen</button>
                <button type="button" role="menuitem" onClick={() => { if (fileInput.current) { fileInput.current.accept = ATTACHMENT_ACCEPT; fileInput.current.click(); } }}>Archivo</button>
                <p>Hasta 10 MB · imágenes, PDF, Word y Excel.</p>
              </div>
            ) : null}
          </div>
          <div className="ho-rel">
            <button type="button" className="ho-ib ho-press" aria-label="Emoticones" aria-haspopup="true" aria-expanded={pop === "emoji"} disabled={!chat} onClick={() => setPop(pop === "emoji" ? null : "emoji")}>
              🙂
            </button>
            {pop === "emoji" ? (
              <div className="ho-pop ho-eg" role="group" aria-label="Emoticones frecuentes">
                {EMOJIS.map(([c, n]) => (
                  <button key={c} type="button" aria-label={n} onClick={() => setDraft((d) => d + c)}>
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            className="ho-input"
            type="text"
            aria-label="Escribir mensaje"
            placeholder={chat ? "Escribe tu mensaje" : t.step === "waiting" ? "Un agente te atenderá en un momento" : "Escribe tu mensaje"}
            value={draft}
            disabled={!chat}
            maxLength={1000}
            autoComplete="off"
            onChange={(e) => {
              setDraft(e.target.value);
              t.typed();
            }}
          />
          <button type="submit" className="ho-send ho-press" aria-label="Enviar" disabled={!chat || (!draft.trim() && !files.some((f) => !f.problem))}>
            ➤
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </form>
        <div className="ho-lim">Hasta 10 MB por archivo · imágenes, PDF, Word y Excel</div>
        {t.step !== "thanks" && t.step !== "rate" ? (
          <button type="button" className="ho-back ho-press" onClick={() => void t.back()}>
            ← Volver a Pilo
          </button>
        ) : null}
      </div>
      {pop ? <button type="button" className="ho-clear" aria-label="Cerrar el menú" tabIndex={-1} onClick={() => setPop(null)} /> : null}

      {lightbox ? (
        <div className="ho-lbx" role="dialog" aria-modal="true" aria-label="Vista ampliada de la imagen">
          <div className="ho-lbx-top">
            <b>{lightbox.name}</b>
            <button type="button" className="ho-ib" aria-label="Cerrar la vista ampliada" onClick={() => setLightbox(null)} autoFocus>
              ✕
            </button>
          </div>
          <div className="ho-lbx-img">
            <img src={lightbox.url} alt={lightbox.name} />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** El formulario: nombre, correo, teléfono, ciudad y la autorización de datos (obligatoria). */
function HandoffForm({ t }: { t: Traspaso }) {
  const ref = useRef<HTMLFormElement>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", city: "", authorized: false });
  const [touched, setTouched] = useState(false);
  useMotion(ref, () => enterBlock(ref.current), []);
  const problem = formProblem(f);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!problem) void t.submit(f);
  };
  return (
    <form className="ho-form-card" ref={ref} onSubmit={submit} noValidate aria-label="Tus datos para pasar con un agente">
      <label className="ho-f">
        Nombre completo
        <input type="text" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required />
      </label>
      <label className="ho-f">
        Correo electrónico
        <input type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={160} required />
      </label>
      <label className="ho-f">
        Teléfono
        <input type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} required />
      </label>
      <label className="ho-f">
        Ciudad desde la que escribes
        <input type="text" autoComplete="address-level2" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={80} required />
      </label>
      <label className="ho-ck">
        <input type="checkbox" checked={f.authorized} onChange={(e) => setF({ ...f, authorized: e.target.checked })} aria-describedby="ho-ack" />
        <span>
          Autorizo a la Universidad de Santander el tratamiento de mis datos personales para atender esta solicitud, según la Ley 1581 de 2012. Conozco la{" "}
          <a href={POLICY_PATH} target="_blank" rel="noopener">
            política de tratamiento de datos personales
          </a>
          .
        </span>
      </label>
      <span id="ho-ack" className="ho-hint" role="status">
        {touched && problem ? problem : t.error}
      </span>
      <button type="submit" className="ho-cta ho-press" disabled={t.busy || !f.authorized}>
        {t.busy ? "Enviando…" : "Enviar y esperar al agente"}
      </button>
    </form>
  );
}

function WaitCard({ t }: { t: Traspaso }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotion(ref, () => enterBlock(ref.current), []);
  const pos = t.view?.position ?? 0;
  return (
    <div className="ho-wait" ref={ref} role="status">
      <span className="ho-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{t.view?.after_hours ? "Tu solicitud quedó en la fila. Te avisamos por correo." : `Buscando un agente disponible${pos > 1 ? ` · eres el turno ${pos}` : ""}`}</span>
    </div>
  );
}

function Rating({ t }: { t: Traspaso }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotion(ref, () => enterBlock(ref.current), []);
  const name = t.saved?.name.split(" ")[0] ?? "";
  return (
    <>
      <div className="ho-mr" data-k="encuesta">
        <span className="ho-lab">Pilo</span>
        <div className="ho-b p">Gracias por escribir, {name}. Antes de despedirme: ¿te sirvió la atención?</div>
      </div>
      <div className="ho-rate" ref={ref} role="group" aria-label="Califica la atención de 1 a 5">
        <b>Califica la atención</b>
        <div className="ho-rb">
          {RATES.map((w, i) => (
            <button key={w} type="button" className="ho-press" aria-label={`${i + 1} de 5, ${w}`} onClick={() => void t.score(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
        <div className="ho-rl">
          <span>1 · Nada útil</span>
          <span>5 · Muy útil</span>
        </div>
      </div>
    </>
  );
}

/** El botón para ofrecer el agente en el pie del chat de Pilo, o volver a la conversación que sigue abierta. */
export function AgentButton({ t }: { t: Traspaso }) {
  useEffect(() => undefined, []);
  if (t.saved && !t.shown && t.view && t.view.status !== "resolved") {
    return (
      <button type="button" className="ho-link" onClick={t.resume}>
        Volver con el agente
      </button>
    );
  }
  if (!t.enabled || t.saved) return null;
  return (
    <button type="button" className="ho-link" onClick={t.begin}>
      Hablar con un agente
    </button>
  );
}

export type { View };
