/* =============================================================================
   Pregúntele a Pilo (/pregunta).

   Una conversación con Mr. Pilo sobre la Planeación Institucional de la UDES.
   Cada respuesta dice cómo se obtuvo (regla, respuesta guardada, lo publicado
   tal cual o redactada con IA) y trae sus fuentes numeradas: una cita abre la
   fuente al lado, con el pasaje resaltado y el enlace a la página exacta.

   Quién entra lo decide la administración en «Mr. Pilo con IA»: público, con
   sesión o solo administración. Qué memorias usa Pilo también es interno; el
   público solo ve lo que Pilo conoce. La primera vez aparece la bienvenida
   (Welcome.tsx). El tema (blanco, soleado o negro) y las conversaciones se
   recuerdan en el navegador (store.ts).
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import gsap from "gsap";
import { useAuth } from "../../lib/auth";
import { usePiloAiConfig } from "../../components/pilo/ai/config";
import { canUse } from "../../components/pilo/ai/logic";
import type { Role } from "../../components/pilo/ai/logic";
import { askQuestion, rateAnswer, sayWithPilo, stopPilo } from "../../components/pilo/ai/client";
import type { AskKind, AskResult, AskSource } from "../../components/pilo/ai/client";
import { Pilo as PiloMoji } from "./Pilo";
import type { MojiMood, PiloMojiHandle } from "./Pilo";
import { markWelcome, newId, seenWelcome, TEMAS, useConversations, useTema } from "./store";
import type { Conversation, Tema, Turn } from "./store";
import { Welcome } from "./Welcome";
import "./ask-pilo.css";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const SOURCES: { id: string; code: string; name: string; session?: boolean; hidden?: boolean }[] = [
  { id: "cifras", code: "CI", name: "UDES en Cifras" },
  { id: "boletines", code: "BO", name: "Boletines" },
  { id: "pdi", code: "PD", name: "Plan de Desarrollo" },
  { id: "observatorio", code: "OB", name: "Observatorio" },
  { id: "impacto", code: "IM", name: "Portal de Impacto", session: true },
  // Las respuestas oficiales del catálogo: no es una memoria que se lista, es Planeación hablando.
  { id: "catalogo", code: "PL", name: "Planeación Institucional", hidden: true },
];
const codeOf = (s: string) => SOURCES.find((x) => x.id === s)?.code ?? "··";
const nameOf = (s: string) => SOURCES.find((x) => x.id === s)?.name ?? s;

const SUGGESTIONS: { q: string; hint: string; trick?: boolean }[] = [
  { q: "¿Cuántos estudiantes tiene la UDES por sede?", hint: "UDES en Cifras" },
  { q: "¿Cómo va el pilar Personalización del Plan de Desarrollo?", hint: "Plan de Desarrollo" },
  { q: "¿Qué dice el último boletín estadístico?", hint: "Boletines" },
  { q: "¿Cuánto presupuesto tiene el pilar Ambiente tecnológico?", hint: "Pregunta capciosa", trick: true },
];

const BADGE: Record<AskKind, string> = {
  memoria: "De la memoria · sin IA",
  extracto: "De lo publicado · sin IA",
  ia: "Redactada con IA · cifras verificadas",
  regla: "Regla de Pilo · sin IA",
  nada: "Sin fuentes · sin IA",
  curada: "Respuesta de Planeación · sin IA",
  capciosa: "Respuesta rápida de Pilo",
};

const MOOD_OF: Record<AskKind, MojiMood> = { memoria: "feliz", extracto: "atento", ia: "feliz", regla: "cuidado", nada: "duda", curada: "feliz", capciosa: "cuidado" };

/* --- Iconos (un solo trazo, 2.2) --------------------------------------------------------- */

const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const I = {
  plus: <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  close: <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  menu: <Svg size={20}><path d="M4 7h16M4 12h16M4 17h10" /></Svg>,
  send: <Svg size={18}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>,
  chev: <Svg size={12}><path d="M6 9l6 6 6-6" /></Svg>,
  speak: <Svg><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /></Svg>,
  copy: <Svg><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>,
  up: <Svg><path d="M7 11v9H4v-9zM7 11l4-8c1.7 0 2.6 1 2.3 2.7L12.8 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" /></Svg>,
  ext: <Svg size={15}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>,
  replay: <Svg size={15}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></Svg>,
  check: <Svg size={11}><path d="M5 12l5 5 9-10" /></Svg>,
  dash: <Svg size={10}><path d="M6 12h12" /></Svg>,
  spark: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
    </svg>
  ),
  trash: <Svg size={14}><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>,
  blanco: <Svg><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Svg>,
  soleado: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <path d="M12 1.8v2.6M12 19.6v2.6M3.6 3.6l1.9 1.9M18.5 18.5l1.9 1.9M1.8 12h2.6M19.6 12h2.6M3.6 20.4l1.9-1.9M18.5 5.5l1.9-1.9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  negro: <Svg><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></Svg>,
  globe: <Svg size={14}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>,
};

/* --- La página: quién entra --------------------------------------------------------------- */

export function AskPilo() {
  const config = usePiloAiConfig();
  const { profile, loading } = useAuth();
  const [tema, setTema] = useTema();
  const location = useLocation();
  const role = (profile?.is_active ? profile.role : null) as Role | null;

  useEffect(() => {
    const before = document.title;
    document.title = "Pregúntele a Pilo · Planeación UDES";
    return () => {
      document.title = before;
    };
  }, []);

  if (config.isPending || loading) {
    return (
      <div className="ap" data-tema={tema}>
        <div className="ap-gate" role="status">
          <PiloMoji size={96} mood="atento" alive />
          <p>Despertando a Pilo…</p>
        </div>
      </div>
    );
  }

  const rules = config.data;
  const allowed = rules ? canUse({ ...rules, portals: { ...rules.portals, pregunta: { on: rules.pregunta.on, aud: rules.pregunta.aud, fns: ["preguntar"] } } }, "pregunta", "preguntar", role) : null;
  if (!rules || !allowed?.ok) {
    const needsLogin = rules?.pregunta.on && rules.pregunta.aud === "sesion" && !role;
    return (
      <div className="ap" data-tema={tema}>
        <div className="ap-gate">
          <PiloMoji size={120} mood={needsLogin ? "atento" : "duda"} track alive />
          <h1>{needsLogin ? "Pilo lo espera adentro" : "Pilo está descansando"}</h1>
          <p>
            {needsLogin
              ? "Por ahora, Pregúntele a Pilo es para quienes tienen cuenta en la intranet de Planeación. Inicie sesión y vuelva."
              : !allowed
                ? "Pregúntele a Pilo no está abierto por ahora. Mientras tanto, las cifras oficiales están en UDES en Cifras."
                : allowed.ok
                  ? ""
                  : allowed.reason}
          </p>
          {needsLogin ? (
            <Link to="/acceso-intranet" state={{ from: location.pathname }}>
              Iniciar sesión
            </Link>
          ) : (
            <Link to="/datos-abiertos">Ir a UDES en Cifras</Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <Chat
      tema={tema}
      setTema={setTema}
      role={role}
      audience={rules.pregunta.aud}
      welcome={rules.pregunta.welcome}
      voice={{ advanced: rules.speechReady && canUse(rules, "pregunta", "voz", role).ok, rate: rules.voiceRate, pitch: rules.voicePitch }}
    />
  );
}

/* --- La conversación ----------------------------------------------------------------------- */

interface ChatProps {
  tema: Tema;
  setTema: (t: Tema) => void;
  role: Role | null;
  audience: "admin" | "sesion" | "publico";
  welcome: boolean;
  voice: { advanced: boolean; rate: number; pitch: number };
}

function Chat({ tema, setTema, role, audience, welcome, voice }: ChatProps) {
  const [convs, setConvs] = useConversations();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [source, setSource] = useState<{ turn: Turn; n: number; trigger: HTMLElement | null } | null>(null);
  const [showWelcome, setShowWelcome] = useState(() => welcome && !seenWelcome());
  const [scrolled, setScrolled] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const hello = useRef<PiloMojiHandle>(null);
  const slot = useRef<HTMLDivElement>(null);

  const current = convs.find((c) => c.id === currentId) ?? null;

  const toBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const s = scroll.current;
      if (s) s.scrollTo({ top: s.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
    });
  }, []);

  const patchTurn = (convId: string, turnId: string, patch: Partial<Turn>) =>
    setConvs((list) => list.map((c) => (c.id !== convId ? c : { ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) })));

  const ask = async (raw: string, replaceTurn?: string) => {
    const q = raw.replace(/\s+/g, " ").trim();
    if (!q || busy) return;
    setSource(null);
    stopPilo();
    const conv: Conversation = current ?? { id: newId(), title: q.slice(0, 80), at: Date.now(), turns: [] };
    const turn: Turn = { id: newId(), q };
    const before = conv.turns.filter((t) => t.id !== replaceTurn);
    const history = before.filter((t) => t.answer).slice(-2).map((t) => ({ q: t.q, a: t.answer!.text }));
    setConvs((list) => [{ ...conv, at: Date.now(), turns: [...before, turn] }, ...list.filter((c) => c.id !== conv.id)]);
    setCurrentId(conv.id);
    setBusy(true);
    toBottom();
    try {
      const answer = await askQuestion(q, history);
      patchTurn(conv.id, turn.id, { answer });
    } catch (e) {
      patchTurn(conv.id, turn.id, { error: (e as Error).message || "No pude hablar con Pilo ahora." });
    } finally {
      setBusy(false);
      toBottom();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = draft;
    setDraft("");
    void ask(v);
  };

  const startNew = () => {
    stopPilo();
    setCurrentId(null);
    setSource(null);
    setSideOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  };

  const remove = (id: string) => {
    setConvs((list) => list.filter((c) => c.id !== id));
    if (id === currentId) startNew();
  };

  // El campo crece con el texto.
  useLayoutEffect(() => {
    const t = input.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || showWelcome) return;
      setSource(null);
      setSideOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showWelcome]);

  useEffect(() => () => stopPilo(), []);

  const finishWelcome = () => {
    markWelcome(true);
    setShowWelcome(false);
    requestAnimationFrame(() => {
      hello.current?.nod();
      input.current?.focus({ preventScroll: true });
    });
  };

  const replayWelcome = () => {
    startNew();
    markWelcome(false);
    setShowWelcome(true);
  };

  const sessionOk = Boolean(role);

  return (
    <div className="ap" data-tema={tema}>
      <aside className="ap-side" data-open={sideOpen || undefined} aria-label="Pregúntele a Pilo">
        <div className="ap-side__top">
          <div>
            <div className="ap-side__name">Pregúntele a Pilo</div>
            <div className="ap-side__sub">Planeación Institucional · UDES</div>
          </div>
          <button type="button" className="ap-side__close" onClick={() => setSideOpen(false)} aria-label="Cerrar el menú">
            {I.close}
          </button>
        </div>
        <button type="button" className="ap-new" onClick={startNew}>
          {I.plus}Nueva conversación
        </button>
        <div className="ap-side__scroll">
          <h2>Conversaciones</h2>
          {convs.length === 0 && <p className="ap-empty-hist">Sus preguntas quedan aquí, solo en este navegador.</p>}
          {convs.map((c) => (
            <div key={c.id} className="ap-hist" aria-current={c.id === currentId}>
              <button
                type="button"
                onClick={() => {
                  setCurrentId(c.id);
                  setSource(null);
                  setSideOpen(false);
                }}
              >
                {c.title}
              </button>
              <button type="button" className="ap-hist__del" onClick={() => remove(c.id)} aria-label={`Borrar la conversación «${c.title}»`}>
                {I.trash}
              </button>
            </div>
          ))}
          <h2>Lo que conoce Pilo</h2>
          <ul className="ap-knows">
            {SOURCES.filter((s) => !s.hidden && (!s.session || sessionOk)).map((s) => (
              <li key={s.id}>
                <span className="ap-code" data-s={s.id}>
                  {s.code}
                </span>
                {s.name}
                {s.session && <small>con sesión</small>}
              </li>
            ))}
          </ul>
        </div>
        <div className="ap-side__foot">
          <div className="ap-access">
            {I.globe}
            <span>
              Acceso <b>{audience === "publico" ? "público" : audience === "sesion" ? "con sesión" : "de administración"}</b>
            </span>
          </div>
          {welcome && (
            <button type="button" className="ap-replay" onClick={replayWelcome}>
              {I.replay}Ver la bienvenida otra vez
            </button>
          )}
        </div>
      </aside>

      <main className="ap-main">
        <header className="ap-bar" data-scrolled={scrolled || undefined}>
          <button type="button" className="ap-bar__menu" onClick={() => setSideOpen(true)} aria-label="Abrir el menú">
            {I.menu}
          </button>
          <div className="ap-crumb">
            <span>
              <Link to="/">Planeación Institucional</Link> ›{" "}
            </span>
            <b>{current?.title ?? "Nueva conversación"}</b>
          </div>
          <div className="ap-temas" role="group" aria-label="Tema de color">
            {TEMAS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tema === t.id} onClick={() => setTema(t.id)} title={t.label}>
                {I[t.id]}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="ap-scroll" ref={scroll} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
          <div className="ap-col">
            {!current ? (
              <Hello slot={slot} moji={hello} hidden={showWelcome} onAsk={(q) => void ask(q)} />
            ) : (
              <div className="ap-msgs">
                {current.turns.map((t, i) => (
                  <TurnView
                    key={t.id}
                    turn={t}
                    live={i === current.turns.length - 1}
                    active={source?.turn.id === t.id ? source.n : null}
                    onSource={(n, trigger) => setSource({ turn: t, n, trigger })}
                    onRetry={() => void ask(t.q, t.id)}
                    onVote={(vote) => {
                      patchTurn(current.id, t.id, { vote });
                      if (t.answer?.answerId) void rateAnswer(t.answer.answerId, vote);
                    }}
                    voice={voice}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ap-dock">
          <form className="ap-composer" onSubmit={submit}>
            <label htmlFor="ap-q" className="ap-sr">
              Su pregunta para Pilo
            </label>
            <textarea
              id="ap-q"
              ref={input}
              rows={1}
              value={draft}
              maxLength={500}
              placeholder="Pregunte por una cifra, un pilar, un boletín…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="ap-send" disabled={busy || !draft.trim()} aria-label="Preguntar">
              {I.send}
            </button>
          </form>
          <p className="ap-note">Pilo responde con lo que publica la Oficina de Planeación y dice de dónde sale cada dato.</p>
        </div>

        <SourceDrawer source={source} onClose={() => setSource(null)} />
      </main>

      <div className="ap-scrim" data-on={sideOpen || (source && window.matchMedia("(max-width: 900px)").matches) || undefined} onClick={() => { setSideOpen(false); setSource(null); }} />

      {showWelcome && <Welcome tema={tema} target={slot} onDone={finishWelcome} />}
    </div>
  );
}

/* --- El saludo ----------------------------------------------------------------------------- */

function Hello({ slot, moji, hidden, onAsk }: { slot: React.RefObject<HTMLDivElement>; moji: React.RefObject<PiloMojiHandle>; hidden: boolean; onAsk: (q: string) => void }) {
  return (
    <>
      <section className="ap-hello">
        <div className="ap-hello__slot" ref={slot} style={{ visibility: hidden ? "hidden" : undefined }}>
          <PiloMoji ref={moji} size="100%" track idle alive label="Mr. Pilo" />
        </div>
        <h1>¿Qué quiere saber de la Planeación de la UDES?</h1>
        <p>
          Pregunte en sus palabras. Busco primero en lo que ya respondí y en lo publicado en los portales; solo redacto con IA cuando hace falta. Cada dato trae su fuente.
        </p>
      </section>
      <div className="ap-sugs">
        {SUGGESTIONS.map((s) => (
          <button key={s.q} type="button" className="ap-sug" onClick={() => onAsk(s.q)}>
            {s.q}
            <small data-trick={s.trick || undefined}>{s.hint}</small>
          </button>
        ))}
      </div>
    </>
  );
}

/* --- Un turno: la pregunta y lo que responde Pilo -------------------------------------------- */

function TurnView({
  turn,
  live,
  active,
  onSource,
  onRetry,
  onVote,
  voice,
}: {
  turn: Turn;
  live: boolean;
  active: number | null;
  onSource: (n: number, trigger: HTMLElement) => void;
  onRetry: () => void;
  onVote: (v: "up" | "down") => void;
  voice: ChatProps["voice"];
}) {
  const [trail, setTrail] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const face = useRef<PiloMojiHandle>(null);
  const a = turn.answer;
  const pending = !a && !turn.error;

  // Mientras busca, Pilo mira arriba pensando; al responder, habla un momento.
  useEffect(() => {
    if (!live) return;
    if (pending) {
      face.current?.look(0.5, -0.7);
      return;
    }
    face.current?.look(0, 0.2);
    face.current?.talk(true);
    const t = window.setTimeout(() => face.current?.talk(false), 1300);
    return () => window.clearTimeout(t);
  }, [pending, live]);

  // La respuesta llega por partes, 50 ms entre cada una.
  useLayoutEffect(() => {
    if (!live || pending || !body.current || reduced()) return;
    const ctx = gsap.context(() => {
      gsap.from(body.current!.children, { autoAlpha: 0, y: 8, duration: 0.35, stagger: 0.05, ease: "power3.out" });
    }, body);
    return () => ctx.revert();
  }, [live, pending]);

  const plain = a ? a.text.replace(/\s*\[\d+\]/g, "") : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${plain}\n\n${(a?.sources ?? []).map((s) => `[${s.n}] ${s.title} · ${location.origin}${s.path}`).join("\n")}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin portapapeles */
    }
  };

  return (
    <>
      <div className="ap-q">{turn.q}</div>
      <div className="ap-a">
        <PiloMoji ref={face} size={42} mood={pending ? "piensa" : a ? MOOD_OF[a.kind] : "cuidado"} emotion={pending ? undefined : a?.mood} />
        <div className="ap-a__body" ref={body} aria-live={live ? "polite" : undefined}>
          {pending && (
            <div className="ap-thinking">
              <span className="ap-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Buscando en lo que conozco…
            </div>
          )}
          {turn.error && (
            <div className="ap-error" role="alert">
              <span>{turn.error}</span>
              <button type="button" onClick={onRetry}>
                Preguntar de nuevo
              </button>
            </div>
          )}
          {a && (
            <>
              <div className="ap-prov">
                <span className="ap-badge" data-kind={a.kind}>
                  {a.kind === "ia" ? I.spark : null}
                  {a.kind === "ia" && a.verified === false ? "Redactada con IA · revise las cifras" : BADGE[a.kind]}
                </span>
                {a.trail.length > 0 && (
                  <button type="button" className="ap-trail-btn" aria-expanded={trail} onClick={() => setTrail((v) => !v)}>
                    Cómo respondí {I.chev}
                  </button>
                )}
              </div>
              {trail && (
                <ol className="ap-trail">
                  {a.trail.map((s, i) => (
                    <li key={i}>
                      <span className="ap-st" data-s={s.status}>
                        {s.status === "ok" ? I.check : s.status === "ai" ? I.spark : I.dash}
                      </span>
                      <span>
                        <b>{s.step}.</b> {s.detail}
                      </span>
                      <em className="ap-num">{s.ms >= 1000 ? `${(s.ms / 1000).toFixed(1).replace(".", ",")} s` : `${s.ms} ms`}</em>
                    </li>
                  ))}
                </ol>
              )}
              <div className="ap-a__text">
                {a.text.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>
                    {para.split(/(\[\d+\])/).map((part, j) => {
                      const m = part.match(/^\[(\d+)\]$/);
                      if (!m) return part;
                      const n = Number(m[1]);
                      const s = a.sources.find((x) => x.n === n);
                      if (!s) return null;
                      return (
                        <button key={j} type="button" className="ap-cite" aria-pressed={active === n} aria-label={`Fuente ${n}: ${s.title}`} onClick={(e) => onSource(n, e.currentTarget)}>
                          {n}
                        </button>
                      );
                    })}
                  </p>
                ))}
              </div>
              {a.unknown && a.unknown.length > 0 && <p className="ap-warn">Revise estos números antes de citarlos: no los encontré en las fuentes ({a.unknown.join(", ")}).</p>}
              {a.sources.length > 0 && (
                <div className="ap-srcs" aria-label="Fuentes">
                  {a.sources.map((s) => (
                    <button key={s.n} type="button" className="ap-src" aria-pressed={active === s.n} onClick={(e) => onSource(s.n, e.currentTarget)}>
                      <span className="ap-src__n">{s.n}</span>
                      <span className="ap-code" data-s={s.source}>
                        {codeOf(s.source)}
                      </span>
                      <span>
                        {s.title} {s.cut && <small>· {s.cut}</small>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ap-acts">
                <button type="button" className="ap-ic" onClick={() => void sayWithPilo(plain, { portal: "pregunta", ...voice })} aria-label="Escuchar la respuesta">
                  {I.speak}
                </button>
                <button type="button" className="ap-ic" onClick={copy} aria-label={copied ? "Copiada" : "Copiar la respuesta con sus fuentes"}>
                  {I.copy}
                  {copied && <span>Copiada</span>}
                </button>
                {a.kind !== "regla" && (
                  <>
                    <button type="button" className="ap-ic" aria-pressed={turn.vote === "up"} onClick={() => onVote("up")} aria-label="Me sirvió">
                      {I.up}
                    </button>
                    <button type="button" className="ap-ic" aria-pressed={turn.vote === "down"} onClick={() => onVote("down")} aria-label="No me sirvió">
                      <span style={{ display: "inline-flex", transform: "scaleY(-1)" }}>{I.up}</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* --- La fuente, al lado -------------------------------------------------------------------- */

const STOP = new Set(["como", "cual", "cuales", "cuanto", "cuantos", "cuantas", "donde", "cuando", "tiene", "tienen", "esta", "estan", "para", "sobre", "entre", "desde", "hasta", "este", "esta", "esos", "esas", "universidad", "udes", "que"]);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Resalta en el pasaje las palabras de la pregunta (por su raíz) y las cifras. */
function highlight(text: string, question: string): ReactNode[] {
  const roots = fold(question)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.slice(0, Math.max(4, w.length - 2)));
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/[\p{L}\d][\p{L}\d.,%]*/gu)) {
    const word = m[0];
    const f = fold(word);
    const hit = roots.some((r) => f.startsWith(r)) || /^\d[\d.,]*%?$/.test(word);
    if (!hit) continue;
    out.push(text.slice(last, m.index));
    out.push(<mark key={m.index}>{word}</mark>);
    last = (m.index ?? 0) + word.length;
  }
  out.push(text.slice(last));
  return out;
}

function SourceDrawer({ source, onClose }: { source: { turn: Turn; n: number; trigger: HTMLElement | null } | null; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(source);
  const s: AskSource | undefined = shown?.turn.answer?.sources.find((x) => x.n === shown.n);

  useEffect(() => {
    if (source) {
      setShown(source);
      const t = window.setTimeout(() => closeBtn.current?.focus({ preventScroll: true }), reduced() ? 0 : 200);
      return () => window.clearTimeout(t);
    }
  }, [source]);

  const close = () => {
    const trigger = shown?.trigger;
    onClose();
    trigger?.focus({ preventScroll: true });
  };

  const excerpt = useMemo(() => (s && shown ? highlight(s.excerpt, shown.turn.q) : null), [s, shown]);
  const external = s ? /^https?:/i.test(s.path) : false;

  return (
    <aside className="ap-drawer" data-open={source ? "" : undefined} aria-hidden={!source} aria-label="Fuente">
      <div className="ap-drawer__head">
        {s && <span className="ap-src__n">{s.n}</span>}
        <h2>Fuente</h2>
        <button ref={closeBtn} type="button" className="ap-x" onClick={close} aria-label="Cerrar la fuente">
          {I.close}
        </button>
      </div>
      {s && (
        <div className="ap-drawer__body">
          <div className="ap-dr__portal">
            <span className="ap-code" data-s={s.source}>
              {codeOf(s.source)}
            </span>
            {nameOf(s.source)}
          </div>
          <h3 className="ap-dr__title">{s.title}</h3>
          {s.section && <p className="ap-dr__sec">{s.section}</p>}
          <p className="ap-excerpt">{excerpt}</p>
          {(s.office || s.cut) && (
            <div className="ap-ticket">
              <b>{s.office || "Oficina de Planeación Institucional"}</b>
              {s.cut && (
                <div className="ap-ticket__row">
                  <span className="ap-ticket__cut">CORTE {s.cut.toUpperCase()}</span>
                </div>
              )}
            </div>
          )}
          {s.path &&
            (external ? (
              <a className="ap-open" href={s.path} target="_blank" rel="noopener noreferrer">
                Abrir el documento {I.ext}
              </a>
            ) : (
              <Link className="ap-open" to={s.path}>
                Abrir en {nameOf(s.source)} {I.ext}
              </Link>
            ))}
        </div>
      )}
    </aside>
  );
}
