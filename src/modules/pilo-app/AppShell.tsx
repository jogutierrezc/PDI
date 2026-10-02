/* =============================================================================
   Mr. Pilo · la app móvil · la conversación con un Pilo.

   Cabecera (menú, la cara de Pilo, su nombre con el espacio y el rol, y el
   interruptor de voz), conversación y caja de escribir. Es el mismo Pilo de
   su página: pregunta a la misma función con el mismo pedido, ve escribirse la
   respuesta y la lee con su voz. Las conversaciones son las de ese espacio
   (store.ts) y se guardan en el teléfono.

   La cara de la cabecera piensa mientras Pilo piensa y mueve el pico mientras
   lee. Sin conexión, Pilo aparece en su pose «en obra» y avisa; lo guardado se
   puede leer. Si el espacio está cerrado o pide sesión, se dice aquí mismo.

   Cuentas de Pilo (0120): con cuenta, la persona guarda las respuestas
   completas en su cuenta («Guardar») y el servidor la reconoce por su sesión;
   sin cuenta, con cada pregunta viaja cómo pidió que Pilo le diga y en qué
   tono, y «Guardar» invita a registrarse. Desde 960 px de ancho, el menú deja
   de ser un cajón y queda fijo a la izquierda (AppSide).
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent, RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import gsap from "gsap";
import { askQuestionStream, buildHistory, PiloError, rateAnswer } from "../../components/pilo/ai/client";
import type { AskHandlers, AskMeta, AskOptions, AskSource } from "../../components/pilo/ai/client";
import { Pilo } from "../pregunta/Pilo";
import type { PiloMojiHandle } from "../pregunta/Pilo";
import { newId, useConversations } from "../pregunta/store";
import type { Conversation, Turn } from "../pregunta/store";
import { asksRol, ROLE_OPTIONS, ROLE_QUESTION, roleView, wireRol } from "../pregunta/space";
import type { Rol, SpaceId, SpaceProfile } from "../pregunta/space";
import { RolePicker } from "../pregunta/RolePicker";
import { parseAnswer } from "../pregunta/AnswerText";
import { toPlain } from "../pregunta/markdown";
import { interruptedTurn, reduceSteps } from "../pregunta/answer-state";
import type { ThinkStep } from "../pregunta/answer-state";
import { useQueryClient } from "@tanstack/react-query";
import { extrasRole } from "./access";
import type { Door } from "./access";
import type { Role } from "../../components/pilo/ai/logic";
import { APP_LOGIN, APP_PILOS, APP_SPACES } from "./routes";
import type { AppTheme } from "./themes";
import { loadSaved, nextLast, openingId, readLast, removeSaved, savedEntries, writeLast } from "./saved";
import type { SavedEntry } from "./saved";
import { stopOfficial } from "./official-voice";
import { fromKeyboard, reducedMotion } from "./pwa";
import type { InstallWay } from "./pwa";
import { AppTurn } from "./AppTurn";
import type { Live, TurnVoice } from "./AppTurn";
import { AccountSheet, AppMenu, IphoneSheet, SourcesSheet } from "./AppMenu";
import { Icon } from "./icons";
import { AppSide } from "./AppSide";
import type { Person } from "./AppSide";
import { removeSavedAnswer, saveAnswer, savedDraft, savedKey, useSavedAnswers } from "./account/answers";
import type { SavedAnswer } from "./account/answers";
import { readVisitor, visitorWire } from "./account/visitor";
import { useAuth } from "../../lib/auth";
import { extrasFor, usePiloExtras } from "../../components/pilo/ai/extras";
import { pickPassages, turnFile } from "../pregunta/attach";
import { AttachButton, AttachTray, useAttachment } from "../pregunta/Extras";

type Over = null | "menu" | "fuentes" | "cuenta" | "iphone";

export interface ShellProps {
  space: SpaceProfile;
  door: Door;
  /** La configuración o la sesión aún se están leyendo. */
  waking: boolean;
  online: boolean;
  /** Quién usa la app: su cuenta de Pilo, la de la intranet, o nadie. */
  person: Person;
  /** Tiene una cuenta de Pilo activa (0120): cuenta como sesión y puede guardar respuestas. */
  member: boolean;
  /** Disposición de escritorio: el menú es una barra lateral fija. */
  wide: boolean;
  theme: AppTheme;
  onTheme: (theme: AppTheme) => void;
  voiceOn: boolean;
  onVoice: (on: boolean) => void;
  rol: Rol | null;
  onRol: (rol: Rol) => void;
  /** El lugar de la cara en la cabecera: la bienvenida vuela hasta aquí. */
  faceSlot: RefObject<HTMLDivElement>;
  /** La bienvenida está encima: la cara de la cabecera espera a que Pilo llegue. */
  welcoming: boolean;
  onWelcome: () => void;
  onSwitch: (space: SpaceId, open?: string) => void;
  install: { way: InstallWay; dismissed: boolean; run: () => void; dismiss: () => void };
}

export function AppShell({ space, door, waking, online, person, member, wide, theme, onTheme, voiceOn, onVoice, rol, onRol, faceSlot, welcoming, onWelcome, onSwitch, install }: ShellProps) {
  const prefix = space.storagePrefix;
  const usual = space.id === "planeacion";
  const location = useLocation();
  const [convs, setConvs] = useConversations(prefix);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    // La que se pidió desde el menú del otro Pilo; si no, la última de este.
    const state = location.state as { open?: unknown; nueva?: unknown } | null;
    const asked = state?.open;
    if (typeof asked === "string" && convs.some((c) => c.id === asked)) return asked;
    // «Nueva conversación», pedida desde el perfil o las guardadas.
    if (state?.nueva === true) return null;
    return openingId(readLast(), space.id, convs);
  });
  const current = convs.find((c) => c.id === currentId) ?? null;

  // Al abrir la app otra vez, se vuelve a esta conversación.
  useEffect(() => {
    writeLast(nextLast(readLast(), space.id, currentId));
  }, [space.id, currentId]);

  /* --- Quién pregunta, y lo que cambia con eso ---------------------------------------------- */

  const askRol = asksRol(space, door.cfg);
  const who = askRol ? rol : null;
  const view = useMemo(() => roleView(space, door.cfg, who), [space, door.cfg, who]);
  const sent = wireRol(who);
  // Las funciones ampliadas (0119): si esta persona puede adjuntar un archivo en este Pilo. Lo decide la administración.
  // Una cuenta de Pilo activa entra como «miembro»: vale para «Con sesión», nunca para «Solo administración».
  const { profile, session } = useAuth();
  const userId = session?.user.id;
  const extras = extrasFor(usePiloExtras().data, space.id, extrasRole((profile?.is_active ? profile.role : null) as Role | null, member));
  const attach = useAttachment(extras.fileMaxMb);
  // Lo que viaja a la función además de la pregunta. En el Pilo de la Universidad, nada: el pedido es el de siempre.
  const wire: AskOptions | undefined = useMemo(() => (usual ? undefined : { portal: space.portal, rol: sent }), [usual, space.portal, sent]);
  const voice: TurnVoice = useMemo(() => (usual ? door.voice : { ...door.voice, rol: sent, mood: view.mood }), [usual, door.voice, sent, view.mood]);

  const open = door.state === "abierto";
  const can = open && online && !waking;
  const autoRead = voiceOn && voice.advanced;

  /* --- Estado de la conversación -------------------------------------------------------------- */

  const [busy, setBusy] = useState(false);
  // Una pregunta que llega ya escrita (Mis clases › «Preguntarle a Pilo»): queda en la caja para que la persona la lea y la envíe.
  const [draft, setDraft] = useState(() => {
    const asked = (location.state as { pregunta?: unknown } | null)?.pregunta;
    return typeof asked === "string" ? asked.slice(0, 500) : "";
  });
  const [live, setLive] = useState<Live | null>(null);
  const [fresh, setFresh] = useState<Map<string, "entera" | "en vivo">>(() => new Map());
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [sounding, setSounding] = useState(false);
  const [over, setOver] = useState<Over>(null);
  const [quick, setQuick] = useState(false);
  const [shownSources, setShownSources] = useState<{ sources: AskSource[]; focus: number | null }>({ sources: [], focus: null });
  const [others, setOthers] = useState<Partial<Record<SpaceId, Conversation[]>>>({});
  const run = useRef<{ ctl: AbortController; convId: string; turnId: string; text: string; meta: AskMeta | null; steps: ThinkStep[]; startedAt: number } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const face = useRef<PiloMojiHandle>(null);
  const pinned = useRef(true);
  // Los turnos que nacieron en esta visita entran animados; los guardados, no.
  const born = useRef(new Set<string>());

  /* --- Las respuestas guardadas en la cuenta (0120) -------------------------------------------- */

  const client = useQueryClient();
  const keptList = useSavedAnswers(userId, member);
  const kept = useMemo(() => new Set((keptList.data ?? []).map((s) => s.id)), [keptList.data]);
  const [keeping, setKeeping] = useState<string | null>(null);

  const toBottom = useCallback(() => {
    pinned.current = true;
    requestAnimationFrame(() => {
      const s = scroll.current;
      if (s) s.scrollTop = s.scrollHeight;
    });
  }, []);

  // La conversación sigue a la respuesta solo si la persona está al final: si subió a leer, no se la mueve.
  useEffect(() => {
    const s = scroll.current;
    if (s && pinned.current) s.scrollTop = s.scrollHeight;
  }, [convs, live, currentId]);

  // El campo crece con el texto, hasta su tope.
  useLayoutEffect(() => {
    const t = input.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, 132)}px`;
  }, [draft]);

  // Al salir, el pedido en curso se cancela y Pilo se calla.
  useEffect(
    () => () => {
      run.current?.ctl.abort();
      run.current = null;
      stopOfficial();
    },
    [],
  );

  const patchTurn = (convId: string, turnId: string, patch: Partial<Turn>) =>
    setConvs((list) => list.map((c) => (c.id !== convId ? c : { ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) })));

  /** Detener: el pedido se cancela y lo escrito se conserva. */
  const stop = () => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    r.ctl.abort();
    patchTurn(r.convId, r.turnId, interruptedTurn(r.text, r.meta));
    setLive(null);
    setBusy(false);
    setStatus(r.text.trim() ? "Detuvo la respuesta: quedó incompleta." : "Detuvo la pregunta.");
  };

  const ask = async (raw: string, replaceTurn?: string) => {
    const q = raw.replace(/\s+/g, " ").trim();
    if (!q || !can) return;
    stopOfficial();
    setNote("");
    // Otra pregunta mientras Pilo escribe: la anterior se corta y queda como incompleta.
    const cut = run.current;
    const cutPatch = cut ? interruptedTurn(cut.text, cut.meta) : null;
    if (cut) {
      run.current = null;
      cut.ctl.abort();
    }
    const patched = (turns: Turn[]) => (cut && cutPatch ? turns.map((t) => (t.id === cut.turnId ? { ...t, ...cutPatch } : t)) : turns);
    const conv: Conversation = current ?? { id: newId(), title: q.slice(0, 80), at: Date.now(), turns: [] };
    const attached = attach.attachment;
    const picked = attached ? pickPassages(attached.passages, q) : [];
    const doc = attached ? { name: attached.name, passages: picked } : null;
    const turn: Turn = { id: newId(), q, ...(attached ? { file: turnFile(attached, picked.length) } : {}) };
    born.current.add(turn.id);
    const before = patched(conv.turns.filter((t) => t.id !== replaceTurn));
    // Lo que la persona escribió y el texto final de cada respuesta: el servidor arma el contexto.
    const history = buildHistory(before.map((t) => ({ q: t.q, a: t.answer?.text })));
    setConvs((list) => [{ ...conv, at: Date.now(), turns: [...before, turn] }, ...list.filter((c) => c.id !== conv.id).map((c) => (cut && c.id === cut.convId ? { ...c, turns: patched(c.turns) } : c))]);
    setCurrentId(conv.id);
    const ctl = new AbortController();
    const mine = { ctl, convId: conv.id, turnId: turn.id, text: "", meta: null as AskMeta | null, steps: [] as ThinkStep[], startedAt: Date.now() };
    run.current = mine;
    const show = () => setLive({ turnId: mine.turnId, text: mine.text, meta: mine.meta, steps: mine.steps, startedAt: mine.startedAt });
    show();
    setBusy(true);
    setStatus("Pilo está pensando.");
    toBottom();
    try {
      const handlers: AskHandlers = {
        signal: ctl.signal,
        onMeta: (meta) => {
          if (run.current !== mine) return;
          mine.meta = meta;
          show();
        },
        onStep: (step) => {
          if (run.current !== mine) return;
          mine.steps = reduceSteps(mine.steps, step);
          show();
        },
        onDelta: (text) => {
          if (run.current !== mine) return;
          mine.text += text;
          show();
        },
      };
      // Con un archivo adjunto viajan, además, los pasajes que tienen que ver con esta pregunta: el archivo no se sube.
      // Sin cuenta viaja, además, cómo pidió que Pilo le diga y en qué tono. Con cuenta, nada: el servidor la reconoce por su sesión.
      const visitor = visitorWire(readVisitor(), member);
      const answer =
        wire || doc || visitor
          ? await askQuestionStream(q, history, handlers, { ...(wire ?? {}), ...(doc ? { doc } : {}), ...(visitor ? { visitor } : {}) })
          : await askQuestionStream(q, history, handlers);
      if (run.current !== mine) return;
      setFresh((f) => new Map(f).set(turn.id, mine.text.trim() ? "en vivo" : "entera"));
      // Los pasos y los segundos del flujo no se guardan con la respuesta.
      const rest = { ...answer };
      delete rest.steps;
      delete rest.seconds;
      patchTurn(conv.id, turn.id, { answer: rest });
      setStatus(`Pilo respondió: ${toPlain(parseAnswer(answer.text))}`);
    } catch (e) {
      // Cortado por «Detener» o por otra pregunta: ya quedó resuelto.
      if (run.current !== mine) return;
      const message = (e instanceof PiloError && e.code === "cancelado" ? "" : (e as Error).message) || "No pude hablar con Pilo ahora.";
      patchTurn(conv.id, turn.id, interruptedTurn(mine.text, mine.meta, message));
      setStatus(mine.text.trim() ? "La respuesta quedó incompleta." : message);
    } finally {
      if (run.current === mine) {
        run.current = null;
        setLive(null);
        setBusy(false);
      }
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy && !draft.trim()) return stop();
    const v = draft;
    setDraft("");
    void ask(v);
  };

  const cancelRun = () => {
    run.current?.ctl.abort();
    run.current = null;
    setLive(null);
    setBusy(false);
  };

  /** «Guardar» junto a una respuesta completa: la guarda en la cuenta, o la quita. Sin cuenta, invita a registrarse. */
  const keep = async (t: Turn, viaKeyboard: boolean) => {
    if (!member) {
      setQuick(viaKeyboard);
      setOver("cuenta");
      return;
    }
    if (!current || !t.answer || keeping) return;
    setKeeping(t.id);
    setNote("");
    try {
      if (t.savedId && kept.has(t.savedId)) {
        const id = t.savedId;
        await removeSavedAnswer(id);
        client.setQueryData<SavedAnswer[]>(savedKey(userId), (list) => (list ?? []).filter((s) => s.id !== id));
        patchTurn(current.id, t.id, { savedId: undefined });
        setStatus("Se quitó de sus guardadas.");
      } else {
        const draft = savedDraft(space.id, t.q, t.answer);
        if (!draft) return;
        const row = await saveAnswer(draft);
        client.setQueryData<SavedAnswer[]>(savedKey(userId), (list) => [row, ...(list ?? [])]);
        patchTurn(current.id, t.id, { savedId: row.id });
        setStatus("Guardada en su cuenta.");
        if (!viaKeyboard) face.current?.nod();
      }
    } catch (e) {
      setNote((e as Error).message || "No se pudo guardar la respuesta.");
    } finally {
      setKeeping(null);
    }
  };

  /* --- Menú y hojas --------------------------------------------------------------------------- */

  // En el escritorio el menú está siempre a la vista: las conversaciones del otro Pilo se leen al entrar.
  useEffect(() => {
    if (wide) setOthers(Object.fromEntries(APP_SPACES.filter((s) => s !== space.id).map((s) => [s, loadSaved(s)])));
  }, [wide, space.id]);

  const show = (which: Exclude<Over, null>, event?: MouseEvent | null) => {
    setQuick(fromKeyboard(event));
    if (which === "menu") setOthers(Object.fromEntries(APP_SPACES.filter((s) => s !== space.id).map((s) => [s, loadSaved(s)])));
    setOver(which);
  };
  /** Con Escape (o Enter sobre «Cerrar») se cierra en seco; con un toque, deslizando. */
  const hide = (event?: MouseEvent | null) => {
    setQuick(event === undefined ? true : fromKeyboard(event));
    setOver(null);
  };

  const startNew = () => {
    stopOfficial();
    cancelRun();
    attach.clear();
    setCurrentId(null);
    setNote("");
    setOver(null);
  };

  const openSaved = (entry: SavedEntry) => {
    stopOfficial();
    setOver(null);
    if (entry.space !== space.id) return onSwitch(entry.space, entry.id);
    cancelRun();
    attach.clear();
    setCurrentId(entry.id);
    toBottom();
  };

  const deleteSaved = (entry: SavedEntry) => {
    if (entry.space !== space.id) {
      setOthers((o) => ({ ...o, [entry.space]: removeSaved(entry.space, entry.id) }));
      return;
    }
    if (run.current?.convId === entry.id) cancelRun();
    setConvs((list) => list.filter((c) => c.id !== entry.id));
    if (entry.id === currentId) {
      stopOfficial();
      attach.clear();
    setCurrentId(null);
    }
  };

  const saved = useMemo(() => savedEntries({ ...others, [space.id]: convs }), [others, space.id, convs]);

  /* --- La cara de la cabecera -------------------------------------------------------------------- */

  const working = busy && !live?.text;
  const writing = busy && !working;

  // Cambiar de tema: un pulso de la cara lo confirma (entera, sin deformarla).
  const pulse = (event: MouseEvent) => {
    const el = faceSlot.current;
    if (!el || reducedMotion() || fromKeyboard(event)) return;
    gsap.fromTo(el, { scale: 0.96 }, { scale: 1, duration: 0.22, ease: "power3.out", overwrite: true, clearProps: "transform" });
  };

  // Al llegar de la bienvenida, Pilo asiente desde su sitio.
  const wasWelcoming = useRef(welcoming);
  useEffect(() => {
    // No se enfoca el campo: en un teléfono eso sube el teclado sin que nadie lo pida.
    if (wasWelcoming.current && !welcoming) face.current?.nod();
    wasWelcoming.current = welcoming;
  }, [welcoming]);

  const toggleVoice = () => {
    if (!voice.advanced) {
      setNote("La voz de Pilo no está disponible ahora: queda el texto.");
      return;
    }
    if (voiceOn) stopOfficial();
    setNote("");
    onVoice(!voiceOn);
  };

  const roleName = ROLE_OPTIONS.find((o) => o.id === who && o.id !== "general")?.short;
  const under = APP_PILOS[space.id].under + (roleName ? ` · ${roleName}` : "");
  const voiceLabel = !voice.advanced ? "La voz de Pilo no está disponible ahora" : voiceOn ? "Pilo lee las respuestas con su voz. Apagar" : "Leer las respuestas con la voz de Pilo";
  const needsRol = askRol && rol === null && !welcoming && open;
  const placeholder = !online ? "Sin conexión" : waking ? "Despertando a Pilo…" : !open ? "Pilo no está disponible aquí" : "Escriba su pregunta";

  const shown = { ...person, saved: member ? (keptList.data?.length ?? null) : null };

  return (
    <>
      {wide && (
        <AppSide
          space={space.id}
          saved={saved}
          currentId={currentId}
          active="chat"
          person={shown}
          onOpen={openSaved}
          onDelete={deleteSaved}
          onNew={startNew}
          onSwitch={(id) => id !== space.id && onSwitch(id)}
        />
      )}
      <header className="pa-bar">
        <div className="pa-bar__in" data-wide={wide || undefined}>
          {!wide && (
            <button type="button" className="pa-icon" onClick={(e) => show("menu", e)} aria-label="Abrir el menú" aria-haspopup="dialog" aria-expanded={over === "menu"}>
              {Icon.menu}
            </button>
          )}
          <div className="pa-bar-face" ref={faceSlot} style={{ visibility: welcoming ? "hidden" : undefined }}>
            <Pilo ref={face} size="100%" mood={working ? "piensa" : "feliz"} emotion={working ? undefined : !online ? "obra" : view.expression} talking={sounding || writing} alive label="Mr. Pilo" />
          </div>
          <div className="pa-bar-id">
            <strong>Mr. Pilo</strong>
            <span>{working ? "Pensando…" : sounding ? "Hablando" : writing ? "Escribiendo…" : under}</span>
          </div>
          <button type="button" className="pa-icon" aria-pressed={autoRead} aria-disabled={!voice.advanced || undefined} aria-label={voiceLabel} title={voiceLabel} onClick={toggleVoice}>
            {autoRead ? Icon.voice : Icon.mute}
          </button>
        </div>
      </header>

      <div
        className="pa-msgs"
        ref={scroll}
        onScroll={(e) => {
          const s = e.currentTarget;
          pinned.current = s.scrollHeight - s.scrollTop - s.clientHeight < 48;
        }}
      >
        <div className="pa-col">
          {!online && (
            <section className="pa-card" role="status">
              <div className="pa-card__face">
                <Pilo size="100%" emotion="obra" alive label="Mr. Pilo, en obra" />
              </div>
              <h2>Estoy sin conexión</h2>
              <p>Necesito internet para responder. Mientras vuelve, sus conversaciones guardadas se pueden leer desde el menú.</p>
            </section>
          )}

          {online && !waking && !open && (
            <section className="pa-card">
              <div className="pa-card__face">
                <Pilo size="100%" mood={door.state === "sesion" ? "atento" : "duda"} alive label="Mr. Pilo" />
              </div>
              <h2>{door.state === "sesion" ? "Pilo lo espera adentro" : "Pilo está descansando"}</h2>
              <p>{door.message}</p>
              {door.state === "sesion" && (
                <>
                  <Link className="pa-btn pa-btn--main" to={APP_LOGIN}>
                    Entrar con mi cuenta de Pilo
                  </Link>
                  <Link className="pa-card__alt" to="/acceso-intranet" state={{ from: location.pathname }}>
                    Soy personal con cuenta en la intranet
                  </Link>
                </>
              )}
            </section>
          )}

          {!current ? (
            (open || waking) && (
              <div className="pa-msg">
                <div className="pa-msg__face">
                  <Pilo size="100%" mood="feliz" emotion={view.expression} />
                </div>
                <div className="pa-msg__body">
                  <div className="pa-bubble">
                    <p>{space.hello.h1}</p>
                  </div>
                  <p className="pa-hint">{space.note}</p>
                  {needsRol && <RolePicker variant="chat" value={rol} onPick={onRol} legend={ROLE_QUESTION} />}
                </div>
              </div>
            )
          ) : (
            current.turns.map((t) => (
              <AppTurn
                key={t.id}
                turn={t}
                stream={live && live.turnId === t.id ? live : null}
                fresh={fresh.get(t.id)}
                animate={born.current.has(t.id)}
                autoRead={autoRead}
                voice={voice}
                expression={view.expression}
                onTyped={() =>
                  setFresh((f) => {
                    if (!f.has(t.id)) return f;
                    const next = new Map(f);
                    next.delete(t.id);
                    return next;
                  })
                }
                onRetry={() => void ask(t.q, t.id)}
                onVote={(vote) => {
                  patchTurn(current.id, t.id, { vote });
                  if (t.answer) void rateAnswer({ answerId: t.answer.answerId, vote, question: t.q, text: t.answer.text, kind: t.answer.kind, ...(wire ?? {}) });
                }}
                onSources={(sources, focus) => {
                  setShownSources({ sources, focus });
                  setQuick(false);
                  setOver("fuentes");
                }}
                onSound={setSounding}
                onVoiceLost={() => setNote("La voz de Pilo no está disponible ahora: queda el texto.")}
                saved={Boolean(t.savedId && kept.has(t.savedId))}
                saving={keeping === t.id}
                onSave={(_trigger, viaKeyboard) => void keep(t, viaKeyboard)}
              />
            ))
          )}

          {note && (
            <p className="pa-note" role="status">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="pa-dock">
        <div className="pa-dock__in">
          {!current && can && (
            <div className="pa-sugs" role="group" aria-label="Preguntas sugeridas">
              {view.suggestions.map((s) => (
                <button key={s.q} type="button" className="pa-sug" onClick={() => void ask(s.q)}>
                  {s.q}
                </button>
              ))}
            </div>
          )}

          {!current && install.way && !install.dismissed && !welcoming && (
            <div className="pa-install">
              <span>{wide ? "Instale a Pilo en su computador." : "Lleve a Pilo en su teléfono."}</span>
              <button type="button" className="pa-btn pa-btn--main" onClick={(e) => (install.way === "iphone" ? show("iphone", e) : install.run())}>
                Instalar a Pilo
              </button>
              <button type="button" className="pa-icon" onClick={install.dismiss} aria-label="Ahora no">
                {Icon.close}
              </button>
            </div>
          )}

          <AttachTray state={attach} />
          <form className="pa-compose" data-clip={extras.files && can ? "" : undefined} onSubmit={submit}>
            {extras.files && can && <AttachButton onPick={attach.pick} disabled={Boolean(attach.reading)} />}
            <label htmlFor="pa-q" className="pa-sr">
              Su pregunta para Pilo
            </label>
            <textarea
              id="pa-q"
              ref={input}
              rows={1}
              value={draft}
              maxLength={500}
              disabled={!can}
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="pa-send" disabled={!can || (!busy && !draft.trim())} aria-label={busy && !draft.trim() ? "Detener la respuesta" : busy ? "Detener y preguntar esto" : "Enviar la pregunta"}>
              {busy && !draft.trim() ? Icon.stop : Icon.send}
            </button>
          </form>
        </div>
        <div className="pa-sr" role="status" aria-live="polite">
          {status}
        </div>
      </div>

      <div className="pa-scrim" data-open={(over !== null && !(wide && over === "menu")) || undefined} data-quick={quick || undefined} onClick={(e) => hide(e)} aria-hidden="true" />

      {/* En el escritorio el menú es la barra lateral: el cajón no se monta. */}
      {!wide && (
        <AppMenu
          open={over === "menu"}
          quick={quick}
          onClose={hide}
          space={space.id}
          saved={saved}
          currentId={currentId}
          onOpen={openSaved}
          onDelete={deleteSaved}
          onNew={startNew}
          onSwitch={(id) => {
            setOver(null);
            if (id !== space.id) onSwitch(id);
          }}
          theme={theme}
          onTheme={(id, e) => {
            onTheme(id);
            pulse(e);
          }}
          onWelcome={() => {
            stopOfficial();
            cancelRun();
            setOver(null);
            onWelcome();
          }}
          person={shown}
        />
      )}
      <SourcesSheet open={over === "fuentes"} quick={quick} onClose={hide} sources={shownSources.sources} focus={shownSources.focus} space={space} />
      <AccountSheet open={over === "cuenta"} quick={quick} onClose={hide} />
      <IphoneSheet open={over === "iphone"} quick={quick} onClose={hide} />
    </>
  );
}
