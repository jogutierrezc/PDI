/* =============================================================================
   Portal de agentes · la conversación: cabecera, hilo, compositor y contacto.

   Tiempo real: los mensajes llegan por postgres_changes (datos.ts); «escribiendo…»
   va por Broadcast en el canal `soporte:<channel_key>` (el mismo que escucha la
   persona) y nunca se guarda. Lo que se escribe sin conexión queda en la cola
   (outbox) como «En cola» y sale solo al reconectar.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { ATTACHMENT_ACCEPT, attachmentProblem, MAX_FILES_PER_MESSAGE, mimeFor, safeFileName } from "../soporte/adjuntos";
import { STATUS_LABEL } from "../soporte/estados";
import { soporte } from "../soporte/llamada";
import { createOutbox } from "../soporte/outbox";
import type { Outbox } from "../soporte/outbox";
import { actions, errorText, keys, signedUrl, uploadAttachment, useAgents, useHistory, useLabels, useMessages, usePolicy, useQuickReplies, useTeams } from "./datos";
import type { Attachment, Conv, Msg } from "./datos";
import { enterDialog, enterMessages, enterPane, enterPop, scrollToEnd, useMotion } from "./motion";
import { useMe } from "./sesion";
import { AVAILABILITY, Avatar, Dot, Icon, Notice, PortalTag, Tag, UndoToast } from "./ui";
import { fichaDe, tamano } from "./vistas";

const EMOJIS: [string, string][] = [
  ["🙂", "Sonrisa"], ["😊", "Contento"], ["😄", "Alegre"], ["😉", "Guiño"], ["🙏", "Gracias"], ["👍", "Pulgar arriba"],
  ["👌", "Perfecto"], ["👏", "Aplausos"], ["💪", "Fuerza"], ["🤝", "Acuerdo"], ["✅", "Hecho"], ["📌", "Importante"],
  ["📄", "Documento"], ["📎", "Adjunto"], ["📞", "Teléfono"], ["📧", "Correo"], ["🕐", "Hora"], ["📅", "Fecha"],
  ["💳", "Pago"], ["🎓", "Grado"], ["📚", "Libros"], ["❓", "Pregunta"], ["⚠️", "Atención"], ["🌟", "Estrella"],
];

interface Pending {
  id: string;
  name: string;
  size: number;
  mime: string;
  state: "up" | "ok" | "err";
  message: string;
  path?: string;
}

interface Outgoing {
  body: string;
  private: boolean;
  files: { path: string; name: string }[];
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

export function Hilo({ conv, connected, onBack, onTaken }: { conv: Conv; connected: boolean; onBack: () => void; onTaken: () => void }) {
  const me = useMe();
  const client = useQueryClient();
  const messages = useMessages(conv.id);
  const agents = useAgents();
  const teams = useTeams();
  const labels = useLabels();
  const quick = useQuickReplies();
  const policy = usePolicy();
  const history = useHistory(conv.contact_id, conv.id);

  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [popup, setPopup] = useState<"clip" | "emoji" | "move" | "tag" | null>(null);
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState(false);
  const [mail, setMail] = useState(true);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [undo, setUndo] = useState<{ text: string; until: number } | null>(null);
  const [problem, setProblem] = useState("");
  const [typing, setTyping] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [, tick] = useState(0);

  const thread = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<number>());
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);

  const isMine = conv.assignee_id === me.id;
  const isDirector = me.role === "director";
  const manages = (conv.status === "open" || conv.status === "snoozed") && (isMine || isDirector);
  const waiting = conv.status === "queued" || (conv.status === "offered" && conv.offered_to !== me.id);
  const canReply = conv.status === "open" && (isMine || isDirector);
  const composerOff = mode === "reply" && !canReply;
  const msgs = messages.data ?? [];

  /* --- La cola sin conexión --- */
  const outbox = useRef<Outbox<Outgoing>>();
  if (!outbox.current) {
    outbox.current = createOutbox<Outgoing>(
      async (p) => {
        await actions.send(conv.id, p.body, p.private, p.files);
      },
      () => (typeof navigator === "undefined" ? true : navigator.onLine),
      (_, p) => {
        void client.invalidateQueries({ queryKey: keys.msgs(conv.id) });
        void channel.current?.send({ type: "broadcast", event: "nuevo", payload: { from: "agent" } });
        // Si la persona no está mirando el chat, le llega el correo con el enlace para volver (0184).
        if (!p.private) void soporte({ action: "aviso_estudiante", id: conv.id }, { session: true }).catch(() => undefined);
      },
    );
  }
  useEffect(() => outbox.current?.subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => {
    if (connected) void outbox.current?.flush();
  }, [connected]);
  const queued = outbox.current.items();

  /* --- Escribiendo… y avisos (Broadcast) --- */
  useEffect(() => {
    const ch = supabase.channel(`soporte:${conv.channel_key}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "escribiendo" }, ({ payload }) => {
      if ((payload as { from?: string })?.from !== "student") return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 4000);
    }).on("broadcast", { event: "nuevo" }, () => void client.invalidateQueries({ queryKey: keys.msgs(conv.id) }));
    ch.subscribe();
    channel.current = ch;
    return () => {
      clearTimeout(typingTimer.current);
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [conv.channel_key, conv.id, client]);

  const announce = useCallback((event: "nuevo" | "estado") => void channel.current?.send({ type: "broadcast", event, payload: { from: "agent" } }), []);

  /* --- Leído: al ver mensajes de la persona --- */
  const unreadIncoming = msgs.some((m) => m.kind === "incoming" && m.status !== "read");
  useEffect(() => {
    if (!unreadIncoming || document.visibilityState === "hidden") return;
    void actions.markRead(conv.id).then(() => {
      void client.invalidateQueries({ queryKey: keys.unread });
      void client.invalidateQueries({ queryKey: keys.msgs(conv.id) });
    });
  }, [unreadIncoming, conv.id, client]);

  /* --- Movimiento: lo nuevo entra una vez --- */
  useMotion(
    thread,
    () => {
      const fresh = Array.from(thread.current?.querySelectorAll<HTMLElement>("[data-mid]") ?? []).filter((el) => !seen.current.has(Number(el.dataset.mid)));
      fresh.forEach((el) => seen.current.add(Number(el.dataset.mid)));
      // La primera carga entra en bloque corto; después, solo lo que llega.
      enterMessages(fresh.slice(-8));
      scrollToEnd(thread.current);
    },
    [msgs.length, queued.length, typing],
  );
  useMotion(paneRef, () => enterPane(paneRef.current), [conv.id]);
  useMotion(popRef, () => enterPop(popRef.current, popup === "move" ? "100% 0%" : "0% 100%"), [popup]);
  useMotion(dialogRef, () => dialog && enterDialog(scrimRef.current, dialogRef.current), [dialog]);

  // El «Deshacer» dura 10 s.
  useEffect(() => {
    if (!undo) return;
    const t = setInterval(() => {
      if (Date.now() >= undo.until) setUndo(null);
      else tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [undo]);

  /* --- Archivos --- */
  const addFiles = (list: FileList | File[]) => {
    setPopup(null);
    const files = Array.from(list);
    files.forEach((file) => {
      const id = crypto.randomUUID();
      const problemText = attachmentProblem(file);
      if (pending.length >= MAX_FILES_PER_MESSAGE) {
        setProblem(`Hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`);
        return;
      }
      const base: Pending = { id, name: file.name, size: file.size, mime: mimeFor(file), state: problemText ? "err" : "up", message: problemText || "Subiendo…" };
      setPending((p) => [...p, base]);
      if (problemText) return;
      void uploadAttachment(conv.id, file, safeFileName(file.name), base.mime).then(
        (path) => setPending((p) => p.map((x) => (x.id === id ? { ...x, state: "ok", message: "Listo para enviar", path } : x))),
        (e: Error) => setPending((p) => p.map((x) => (x.id === id ? { ...x, state: "err", message: errorText(e) } : x))),
      );
    });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!composerOff && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  /* --- Enviar --- */
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    const ready = pending.filter((p) => p.state === "ok" && p.path);
    if (composerOff || pending.some((p) => p.state === "up") || (!text && !ready.length)) return;
    setProblem("");
    outbox.current?.push({ body: text, private: mode === "note", files: ready.map((p) => ({ path: p.path as string, name: p.name })) });
    setDraft("");
    setPending((p) => p.filter((x) => x.state === "err"));
    setPopup(null);
  };

  const typed = (value: string) => {
    setDraft(value);
    const nowMs = Date.now();
    if (value && mode === "reply" && nowMs - lastTypingSent.current > 2500) {
      lastTypingSent.current = nowMs;
      void channel.current?.send({ type: "broadcast", event: "escribiendo", payload: { from: "agent", name: me.name } });
    }
  };

  const slash = draft.startsWith("/") && !draft.includes(" ") && mode === "reply";
  const quickList = useMemo(() => {
    if (!slash) return [];
    const q = draft.slice(1).toLowerCase();
    return (quick.data ?? []).filter((r) => !q || r.shortcut.includes(q) || r.title.toLowerCase().includes(q)).slice(0, 6);
  }, [slash, draft, quick.data]);

  /* --- Acciones de la cabecera --- */
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setProblem("");
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
      onTaken();
      void client.invalidateQueries({ queryKey: keys.msgs(conv.id) });
    }
  };

  const take = () => run(() => actions.take(conv.id), () => void soporte({ action: "tomada", id: conv.id }, { session: true }).catch(() => undefined));
  const reassign = (agentId: string, name: string) =>
    run(
      () => actions.reassign(conv.id, agentId, reason.trim()),
      () => {
        setPopup(null);
        setReason("");
        setUndo({ text: `Reasignaste la conversación a ${name}.`, until: Date.now() + 10_000 });
        announce("estado");
      },
    );
  const requeue = (teamId: string) =>
    run(
      () => actions.requeue(conv.id, teamId, reason.trim()),
      () => {
        setPopup(null);
        setReason("");
        announce("estado");
      },
    );
  const undoReassign = () => {
    setUndo(null);
    void run(() => actions.undo(conv.id), () => announce("estado"));
  };
  const resolve = () =>
    run(
      async () => {
        await soporte({ action: "resolver", id: conv.id, transcripcion: mail }, { session: true });
      },
      () => setDialog(false),
    );

  const lastAgentMsg = [...msgs].reverse().find((m) => m.kind === "outgoing" && m.author_kind === "agent");
  const otherAgents = (agents.data ?? []).filter((a) => a.active && a.id !== me.id);

  return (
    <>
      <section className="ag-hilo" ref={paneRef} aria-label="Conversación" onDragEnter={(e) => { e.preventDefault(); if (!composerOff) setDrag(true); }} onDragOver={(e) => e.preventDefault()}>
        <div className="ag-hilo-head">
          <button type="button" className="ag-btn ag-press ag-back" onClick={onBack}>
            <Icon name="back" size={16} />
            Lista
          </button>
          <div className="ag-hilo-who">
            <div className="ag-hilo-name">{conv.contact.name}</div>
            <div className="ag-sub">
              {conv.contact.city || "Sin ciudad"} · <PortalTag space={conv.space} /> · <Tag tone={conv.status === "open" ? "g" : conv.status === "resolved" ? "n" : "y"}>{STATUS_LABEL[conv.status]}</Tag>
            </div>
          </div>
          <div className="ag-row ag-wrap">
            {waiting ? (
              <button type="button" className="ag-btn ag-primary ag-press" onClick={() => void take()} disabled={busy}>
                Tomar conversación
              </button>
            ) : null}
            {conv.status === "offered" && conv.offered_to === me.id ? (
              <button type="button" className="ag-btn ag-primary ag-press" onClick={() => void run(() => actions.accept(conv.id), () => void soporte({ action: "tomada", id: conv.id }, { session: true }).catch(() => undefined))} disabled={busy}>
                Aceptar conversación
              </button>
            ) : null}
            {manages ? (
              <>
                <div className="ag-rel">
                  <button type="button" className="ag-btn ag-press" aria-haspopup="menu" aria-expanded={popup === "move"} onClick={() => setPopup(popup === "move" ? null : "move")}>
                    Reasignar
                  </button>
                  {popup === "move" ? (
                    <div className="ag-pop ag-pop-move" ref={popRef} role="menu" aria-label="Reasignar la conversación">
                      <h3>Agentes</h3>
                      {otherAgents.map((a) => (
                        <button key={a.id} type="button" role="menuitem" className="ag-it" data-pop-item disabled={a.availability === "fuera" || busy} onClick={() => void reassign(a.id, a.name)}>
                          <span>{a.name}</span>
                          <span className="ag-it-state">
                            <Dot color={AVAILABILITY[a.availability].color} />
                            {AVAILABILITY[a.availability].label}
                          </span>
                        </button>
                      ))}
                      {!otherAgents.length ? <p className="ag-pop-note">No hay más agentes en el equipo.</p> : null}
                      <h3>Equipo</h3>
                      {(teams.data ?? []).map((t) => (
                        <button key={t.id} type="button" role="menuitem" className="ag-it" data-pop-item disabled={busy} onClick={() => void requeue(t.id)}>
                          <span>{t.name}</span>
                          <span className="ag-sub">Vuelve a la cola</span>
                        </button>
                      ))}
                      <label className="ag-label ag-pop-pad">
                        Motivo (opcional)
                        <input className="ag-in" type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej.: es de pagos, no de inscripción" />
                      </label>
                      <p className="ag-pop-note">El motivo le llega a quien reciba la conversación como nota privada.</p>
                    </div>
                  ) : null}
                </div>
                <button type="button" className="ag-btn ag-press" onClick={() => void run(() => actions.snooze(conv.id))} disabled={busy || conv.status === "snoozed"}>
                  Posponer
                </button>
                <button type="button" className="ag-btn ag-done ag-press" onClick={() => setDialog(true)}>
                  Marcar como resuelta
                </button>
              </>
            ) : null}
            {conv.status === "resolved" ? (
              <button type="button" className="ag-btn ag-press" onClick={() => void run(() => actions.reopen(conv.id))} disabled={busy}>
                Reabrir
              </button>
            ) : null}
            {conv.status === "open" && !isMine && !isDirector ? <Tag tone="n">Ahora la atiende {agents.data?.find((a) => a.id === conv.assignee_id)?.name ?? "otro agente"}</Tag> : null}
            <button type="button" className="ag-btn ag-press ag-info-btn" aria-expanded={info} onClick={() => setInfo((v) => !v)}>
              <Icon name="info" size={16} />
              Contacto
            </button>
          </div>
        </div>

        {!connected ? (
          <div className="ag-offline" role="status">
            Sin conexión: seguimos intentando. Lo que escriba queda en cola y se envía solo al reconectar.
          </div>
        ) : null}
        {problem ? <Notice>{problem}</Notice> : null}

        <div className="ag-thread" ref={thread} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Mensajes de la conversación" tabIndex={0}>
          {messages.isPending ? <p className="ag-empty">Cargando mensajes…</p> : null}
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} showAck={m.id === lastAgentMsg?.id} onZoom={(a) => void openImage(a, setLightbox, setProblem)} />
          ))}
          {queued.map((q) => (
            <div key={q.id} className="ag-mr a" data-mid={-Number(q.id.slice(1))}>
              <div className={`ag-b ${q.payload.private ? "n" : "a"}`}>
                <span>{q.payload.body || "Archivo adjunto"}</span>
              </div>
              <span className="ag-ack q">En cola · se envía al reconectar</span>
            </div>
          ))}
          {typing ? (
            <div className="ag-mr" data-mid="-1">
              <div className="ag-b u">
                <span className="ag-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <span className="ag-ack">{conv.contact.name.split(" ")[0]} está escribiendo…</span>
              <span className="ag-sr" role="status">
                {conv.contact.name.split(" ")[0]} está escribiendo
              </span>
            </div>
          ) : null}
        </div>

        <div className="ag-composer" onDrop={onDrop} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}>
          {drag ? (
            <div className="ag-dz" onDragLeave={() => setDrag(false)} onDrop={onDrop}>
              Suelte aquí para adjuntar
              <span>Hasta 10 MB por archivo · imágenes, PDF, Word y Excel</span>
            </div>
          ) : null}

          {quickList.length || (slash && draft.length > 1) ? (
            <div className="ag-qr" role="group" aria-label="Respuestas rápidas">
              {quickList.map((r) => (
                <button key={r.id} type="button" onClick={() => setDraft(r.body)}>
                  <b>
                    /{r.shortcut} · {r.title}
                  </b>
                  <span>{r.body}</span>
                </button>
              ))}
              {!quickList.length ? <span className="ag-qr-none">No hay respuestas rápidas con ese nombre. Las administra el director.</span> : null}
            </div>
          ) : null}

          {pending.length ? (
            <div className="ag-chips" role="group" aria-label="Archivos por enviar">
              {pending.map((p) => {
                const f = fichaDe(p.mime || "application/octet-stream");
                return (
                  <div key={p.id} className={`ag-chip ${p.state}`}>
                    <span className="ag-fi" style={{ background: f.bg, color: f.fg }}>
                      {f.lab}
                    </span>
                    <span className="ag-fn">
                      <b>{p.name}</b>
                      <span>
                        {tamano(p.size)} · {f.kind}
                      </span>
                      {p.state === "up" ? <span className="ag-pbar"><i /></span> : null}
                      <span className="ag-st" role="status">
                        {p.message}
                      </span>
                    </span>
                    <button type="button" className="ag-x ag-press" aria-label={`Quitar ${p.name}`} onClick={() => setPending((l) => l.filter((x) => x.id !== p.id))}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="ag-row-between ag-wrap">
            <div className="ag-seg" role="group" aria-label="Tipo de mensaje">
              <button type="button" className={mode === "reply" ? "on" : ""} aria-pressed={mode === "reply"} onClick={() => setMode("reply")}>
                Responder
              </button>
              <button type="button" className={mode === "note" ? "on" : ""} aria-pressed={mode === "note"} onClick={() => setMode("note")}>
                Nota privada
              </button>
            </div>
            <span className="ag-sub">{mode === "note" ? "Solo la ve el equipo." : "Respuestas rápidas: escriba «/»"}</span>
          </div>

          <form className="ag-form" onSubmit={send}>
            <div className="ag-rel">
              <button type="button" className="ag-ib ag-press" aria-label="Adjuntar" aria-haspopup="menu" aria-expanded={popup === "clip"} disabled={composerOff} onClick={() => setPopup(popup === "clip" ? null : "clip")}>
                <Icon name="clip" />
              </button>
              {popup === "clip" ? (
                <div className="ag-pop ag-pop-up" ref={popRef} role="menu" aria-label="Adjuntar">
                  <button type="button" role="menuitem" className="ag-it" data-pop-item onClick={() => { if (fileInput.current) { fileInput.current.accept = "image/*"; fileInput.current.click(); } }}>
                    Imagen
                  </button>
                  <button type="button" role="menuitem" className="ag-it" data-pop-item onClick={() => { if (fileInput.current) { fileInput.current.accept = ATTACHMENT_ACCEPT; fileInput.current.click(); } }}>
                    Archivo
                  </button>
                  <p className="ag-pop-note">Hasta 10 MB · imágenes, PDF, Word y Excel.</p>
                </div>
              ) : null}
            </div>
            <div className="ag-rel">
              <button type="button" className="ag-ib ag-press" aria-label="Emoticones" aria-haspopup="true" aria-expanded={popup === "emoji"} disabled={composerOff} onClick={() => setPopup(popup === "emoji" ? null : "emoji")}>
                <Icon name="smile" />
              </button>
              {popup === "emoji" ? (
                <div className="ag-pop ag-pop-up" ref={popRef} role="group" aria-label="Emoticones frecuentes">
                  <div className="ag-eg">
                    {EMOJIS.map(([c, n]) => (
                      <button key={c} type="button" className="ag-em" aria-label={n} data-pop-item onClick={() => setDraft((d) => d + c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <textarea
              className="ag-ta"
              rows={2}
              aria-label="Mensaje"
              placeholder={composerOff ? "Tome la conversación para responder." : mode === "note" ? "Escriba una nota privada para el equipo…" : "Escriba su respuesta…"}
              value={draft}
              disabled={composerOff}
              onChange={(e) => typed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(e);
                }
              }}
            />
            <button type="submit" className="ag-btn ag-primary ag-press" disabled={composerOff || pending.some((p) => p.state === "up") || (!draft.trim() && !pending.some((p) => p.state === "ok"))}>
              Enviar
            </button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </form>
          <div className="ag-fine">Arrastre archivos al cuadro de mensaje o use el clip · hasta 10 MB por archivo · imágenes, PDF, Word y Excel</div>
        </div>

        {popup && popup !== "tag" ? <button type="button" className="ag-scrim-clear" aria-label="Cerrar el menú" tabIndex={-1} onClick={() => setPopup(null)} /> : null}
        {undo ? <UndoToast text={undo.text} seconds={Math.max(0, Math.ceil((undo.until - Date.now()) / 1000))} onUndo={undoReassign} /> : null}
      </section>

      <Contacto open={info} onClose={() => setInfo(false)} conv={conv} labels={(labels.data ?? []).map((l) => l.name)} history={history.data ?? []} longWait={policy.data?.long_wait_minutes ?? 10} onChanged={onTaken} popup={popup} setPopup={setPopup} />

      {dialog ? (
        <div className="ag-scrim" ref={scrimRef}>
          <div className="ag-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Marcar como resuelta">
            <h2>Marcar como resuelta</h2>
            <p>Al cerrar, Pilo vuelve a hablar con {conv.contact.name.split(" ")[0]} y le hace una encuesta corta: «¿Te sirvió la atención?», de 1 a 5.</p>
            <label className="ag-check">
              <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />
              <span>Enviar la transcripción a {conv.contact.email}</span>
            </label>
            {problem ? <Notice>{problem}</Notice> : null}
            <div className="ag-row ag-end">
              <button type="button" className="ag-btn ag-press" onClick={() => setDialog(false)}>
                Cancelar
              </button>
              <button type="button" className="ag-btn ag-done ag-press" onClick={() => void resolve()} disabled={busy}>
                Resolver y cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div className="ag-lbx" role="dialog" aria-modal="true" aria-label="Vista ampliada de la imagen">
          <div className="ag-lbx-top">
            <b>{lightbox.name}</b>
            <button type="button" className="ag-x ag-press" aria-label="Cerrar la vista ampliada" onClick={() => setLightbox(null)} autoFocus>
              <Icon name="close" />
            </button>
          </div>
          <div className="ag-lbx-img">
            <img src={lightbox.url} alt={lightbox.name} />
          </div>
        </div>
      ) : null}
    </>
  );
}

async function openImage(a: Attachment, set: (v: { url: string; name: string }) => void, fail: (m: string) => void) {
  try {
    set({ url: await signedUrl(a.path), name: `${a.name} · ${tamano(a.size)}` });
  } catch (e) {
    fail(errorText(e));
  }
}

async function download(a: Attachment, fail: (m: string) => void) {
  try {
    window.open(await signedUrl(a.path), "_blank", "noopener");
  } catch (e) {
    fail(errorText(e));
  }
}

/** Una burbuja del hilo según de quién es. */
function Bubble({ m, showAck, onZoom }: { m: Msg; showAck: boolean; onZoom: (a: Attachment) => void }) {
  const [problem, setProblem] = useState("");
  if (m.kind === "activity") {
    return (
      <div className="ag-mr s" data-mid={m.id}>
        <span className="ag-sys">{m.body}</span>
      </div>
    );
  }
  const side = m.kind === "incoming" ? "u" : m.kind === "private_note" ? "n" : m.author_kind === "pilo" ? "p" : "a";
  const mine = side === "a" || side === "n";
  const ackText = m.status === "read" ? "Leído" : m.status === "delivered" ? "Entregado" : "Enviado";
  return (
    <div className={`ag-mr${mine ? " a" : ""}`} data-mid={m.id}>
      {side === "p" ? <span className="ag-lab">Pilo</span> : null}
      {side === "n" ? <span className="ag-lab">Nota privada · solo el equipo · {m.author_name}</span> : null}
      {side === "a" ? <span className="ag-lab">{m.author_name}</span> : null}
      <div className={`ag-b ${side}`}>
        {m.body ? <span>{m.body}</span> : null}
        {m.files.map((f) =>
          f.mime.startsWith("image/") ? (
            <div key={f.id} className="ag-img">
              <ImageThumb file={f} onZoom={() => onZoom(f)} />
              <span className="ag-cap">
                {f.name} · {tamano(f.size)}
              </span>
            </div>
          ) : (
            <div key={f.id} className="ag-fc">
              <span className="ag-fi" style={{ background: fichaDe(f.mime).bg, color: fichaDe(f.mime).fg }}>
                {fichaDe(f.mime).lab}
              </span>
              <span className="ag-fn">
                <b>{f.name}</b>
                <span>
                  {tamano(f.size)} · {fichaDe(f.mime).kind}
                </span>
              </span>
              <button type="button" className="ag-dl ag-press" aria-label={`Descargar ${f.name}`} onClick={() => void download(f, setProblem)}>
                <Icon name="down" />
              </button>
            </div>
          ),
        )}
      </div>
      {problem ? <Notice>{problem}</Notice> : null}
      <span className="ag-time">{clock(m.created_at)}</span>
      {side === "a" && showAck ? <span className={`ag-ack${m.status === "read" ? " rd" : ""}`}>{ackText}</span> : null}
    </div>
  );
}

/** La miniatura de una imagen: la URL firmada se pide al aparecer. */
function ImageThumb({ file, onZoom }: { file: Attachment; onZoom: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    void signedUrl(file.path).then((u) => live && setUrl(u), () => undefined);
    return () => {
      live = false;
    };
  }, [file.path]);
  return (
    <button type="button" className="ag-th ag-press" aria-label={`Ampliar la imagen ${file.name}`} onClick={onZoom}>
      {url ? <img src={url} alt="" /> : <span className="ag-th-load">Cargando…</span>}
    </button>
  );
}

/** El panel del contacto: sus datos, el resumen de Pilo, las etiquetas y su historial. */
function Contacto({
  conv, labels, history, longWait, onChanged, popup, setPopup, open, onClose,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conv;
  labels: string[];
  history: { id: string; status: string; created_at: string }[];
  longWait: number;
  onChanged: () => void;
  popup: "clip" | "emoji" | "move" | "tag" | null;
  setPopup: (p: "clip" | "emoji" | "move" | "tag" | null) => void;
}) {
  const [problem, setProblem] = useState("");
  const set = async (next: string[] | null, priority: string | null) => {
    setProblem("");
    try {
      await actions.update(conv.id, next, priority);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    }
  };
  const free = labels.filter((l) => !conv.labels.includes(l));
  const waited = conv.waiting_since && (conv.status === "queued" || conv.status === "offered") ? Math.round((Date.now() - Date.parse(conv.waiting_since)) / 60000) : 0;
  return (
    <aside className="ag-contacto" data-open={open || undefined} aria-label="Contacto">
      <div className="ag-contact-head">
        <Avatar name={conv.contact.name} size={44} />
        <div className="ag-grow">
          <b className="ag-contact-name">{conv.contact.name}</b>
          <div className="ag-sub">Datos que dio a Pilo</div>
        </div>
        <button type="button" className="ag-x ag-press ag-contact-close" aria-label="Cerrar el contacto" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <dl className="ag-rows">
        <div><dt>Correo</dt><dd>{conv.contact.email}</dd></div>
        <div><dt>Teléfono</dt><dd>{conv.contact.phone || "—"}</dd></div>
        <div><dt>Ciudad</dt><dd>{conv.contact.city || "—"}</dd></div>
        <div><dt>Portal de origen</dt><dd>{conv.space === "planeacion" ? "Pilo" : "Pilo Académico"}</dd></div>
        <div><dt>Autorizó el uso de datos</dt><dd>Sí · Ley 1581 de 2012</dd></div>
        <div><dt>Satisfacción</dt><dd>{conv.csat ? `${conv.csat} de 5` : "Sin calificar"}</dd></div>
      </dl>
      {waited >= longWait ? <Tag tone="y">Supera el tope de espera</Tag> : null}
      <div className="ag-summary">
        <b>Resumen de Pilo</b>
        <span>{conv.pilo_summary || "Pilo no dejó resumen."}</span>
        {conv.unanswered ? <span className="ag-unans">No supo responder: {conv.unanswered}</span> : null}
      </div>
      <div className="ag-field">
        <b className="ag-lab">Prioridad</b>
        <select className="ag-in" value={conv.priority} onChange={(e) => void set(null, e.target.value)} aria-label="Prioridad">
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
      </div>
      <div className="ag-field">
        <b className="ag-lab">Etiquetas</b>
        <div className="ag-tags">
          {conv.labels.map((l) => (
            <span key={l} className="ag-tag ag-t-n ag-tag-x">
              {l}
              <button type="button" className="ag-x ag-press" aria-label={`Quitar la etiqueta ${l}`} onClick={() => void set(conv.labels.filter((x) => x !== l), null)}>
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
        <button type="button" className="ag-btn ag-press" aria-expanded={popup === "tag"} onClick={() => setPopup(popup === "tag" ? null : "tag")}>
          {popup === "tag" ? "Cerrar" : "Agregar etiqueta"}
        </button>
        {popup === "tag" ? (
          <div className="ag-tags">
            {free.map((l) => (
              <button key={l} type="button" className="ag-btn ag-press ag-sm" onClick={() => void set([...conv.labels, l], null)}>
                {l}
              </button>
            ))}
            {!free.length ? <span className="ag-sub">No hay más etiquetas. Las define el director.</span> : null}
          </div>
        ) : null}
      </div>
      {problem ? <Notice>{problem}</Notice> : null}
      <div className="ag-field">
        <b className="ag-lab">Conversaciones anteriores</b>
        <span className="ag-sub ag-copy">
          {history.length ? `${history.length === 1 ? "1 conversación anterior" : `${history.length} conversaciones anteriores`} (la última, ${new Date(history[0].created_at).toLocaleDateString("es-CO")}).` : "Es la primera vez que escribe."}
        </span>
      </div>
    </aside>
  );
}
