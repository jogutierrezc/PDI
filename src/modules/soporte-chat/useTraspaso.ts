/* =============================================================================
   Traspaso de Pilo a un agente · el estado del lado de la persona.

   Una sola fuente de verdad: la vista que devuelve la función `soporte`
   (`status` de la conversación). De ahí salen los pasos:

     sin conversación         → «form» (Pilo pide los datos) o nada
     pending / queued /
     offered                  → «waiting» (en la fila)
     open / snoozed           → «chat» (con el agente)
     resolved                 → «rate» (Pilo pregunta si sirvió) y «thanks»

   La conversación se recuerda en esta pestaña (sessionStorage) con su secreto,
   para seguir si la persona recarga. El tiempo real es un canal Broadcast de
   nombre aleatorio (avisos mínimos, sin texto); si falla, se consulta cada
   pocos segundos. Lo que se escribe sin conexión queda en cola y sale solo.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { asSoporteError } from "../soporte/llamada";
import { createOutbox } from "../soporte/outbox";
import type { Outbox } from "../soporte/outbox";
import { POLICY_VERSION } from "../pilo-app/terms/policy";
import { cancel, createConversation, fetchView, markRead, portalState, rate, readSaved, resumeConversation, sendMessage, uploadFile, writeSaved } from "./api";
import type { PortalState, Saved, Space, View } from "./api";
import { esperando, FRASES, formProblem, lastUnanswered, summarizeTurns, wantsAgent } from "./reglas";
import type { FormData } from "./reglas";

export type Step = "off" | "form" | "waiting" | "chat" | "rate" | "thanks";

export interface Local {
  id: string;
  from: "pilo" | "student";
  text: string;
}

interface Pair {
  q: string;
  a?: string;
}

export interface Traspaso {
  /** El portal tiene atención por agente activa. */
  enabled: boolean;
  portal: PortalState | null;
  step: Step;
  /** El panel del agente está a la vista (si no, se ve el chat de Pilo). */
  shown: boolean;
  view: View | null;
  saved: Saved | null;
  local: Local[];
  agentTyping: boolean;
  connected: boolean;
  queued: { id: string; text: string }[];
  notice: string;
  error: string;
  busy: boolean;
  /** La persona pidió el agente (botón o frase): Pilo pide los datos. */
  begin: () => void;
  /** Si la pregunta pide un agente, abre el traspaso y devuelve true (la pregunta no va a Pilo). */
  intercept: (question: string) => boolean;
  submit: (form: FormData) => Promise<void>;
  send: (text: string, files?: File[]) => Promise<void>;
  typed: () => void;
  score: (n: number) => Promise<void>;
  /** Vuelve a Pilo: si aún espera, cancela la solicitud; si ya chatea, solo cambia de vista. */
  back: () => Promise<void>;
  resume: () => void;
  clear: () => void;
  dismissNotice: () => void;
}

let counter = 0;
const nid = () => `l${(counter += 1)}`;

export function useTraspaso(space: Space, pairs: Pair[]): Traspaso {
  const [portal, setPortal] = useState<PortalState | null>(null);
  const [saved, setSaved] = useState<Saved | null>(() => (typeof window === "undefined" ? null : readSaved(space)));
  const [view, setView] = useState<View | null>(null);
  const [shown, setShown] = useState(() => (typeof window === "undefined" ? false : readSaved(space) !== null));
  const [formOpen, setFormOpen] = useState(false);
  const [local, setLocal] = useState<Local[]>([]);
  const [agentTyping, setAgentTyping] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [channelOk, setChannelOk] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const lastAgent = useRef<string | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTypingSent = useRef(0);
  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  /* --- ¿Hay atención por agente en este portal? --- */
  useEffect(() => {
    let live = true;
    void portalState(space).then(
      (p) => live && setPortal(p),
      () => live && setPortal(null),
    );
    return () => {
      live = false;
    };
  }, [space]);

  /* --- El enlace de «vuelva a su conversación»: ?reanudar=<token> (0184) --- */
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("reanudar");
    if (!token) return;
    history.replaceState(null, "", window.location.pathname);
    let live = true;
    void resumeConversation(token).then(
      (vuelta) => {
        if (!live) return;
        const s: Saved = { id: vuelta.id, secret: vuelta.secret, channel: vuelta.channel, name: vuelta.nombre, email: vuelta.correo };
        writeSaved(vuelta.space, s);
        setSaved(s);
        setShown(true);
      },
      () => {
        if (live) setNotice("Ese enlace ya no sirve. Vuelve a pedir un agente desde Pilo.");
      },
    );
    return () => {
      live = false;
    };
  }, []);

  /* --- La cola de lo escrito sin conexión --- */
  const outbox = useRef<Outbox<{ text: string; files: { ruta: string; nombre: string }[] }>>();
  if (!outbox.current) {
    outbox.current = createOutbox(
      async (p) => {
        const s = savedRef.current;
        if (!s) throw new Error("sin conversación");
        await sendMessage(s, p.text, p.files);
      },
      () => (typeof navigator === "undefined" ? true : navigator.onLine),
      () => void refresh(),
    );
  }
  useEffect(() => outbox.current?.subscribe(() => tick((n) => n + 1)), []);

  /* --- Leer el estado --- */
  const refresh = useCallback(async () => {
    const s = savedRef.current;
    if (!s) return;
    try {
      // La conversación es corta: cada lectura trae todo, y así los estados de lectura siempre están al día.
      const v = await fetchView(s, 0);
      setView(v);
      setOnline(true);
      setError("");
      if (v.agent?.name && lastAgent.current && lastAgent.current !== v.agent.name) setNotice(`Te pasamos con ${v.agent.name}, que ya conoce tu caso.`);
      lastAgent.current = v.agent?.name ?? lastAgent.current;
    } catch (e) {
      const err = asSoporteError(e);
      if (err.code === "acceso") {
        writeSaved(space, null);
        setSaved(null);
        setView(null);
        return;
      }
      if (err.code === "red") setOnline(false);
    }
  }, [space]);

  const reload = refresh;

  const status = view?.status;
  useEffect(() => {
    if (!saved) return;
    void reload();
  }, [saved, reload]);

  useEffect(() => {
    if (!saved || status === "resolved") return;
    const every = channelOk ? 12_000 : 4_000;
    const t = setInterval(() => void reload(), every);
    return () => clearInterval(t);
  }, [saved, status, channelOk, reload]);

  /* --- Tiempo real: avisos por el canal aleatorio --- */
  useEffect(() => {
    if (!saved) return;
    const ch = supabase.channel(`soporte:${saved.channel}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "escribiendo" }, ({ payload }) => {
      if ((payload as { from?: string })?.from !== "agent") return;
      setAgentTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setAgentTyping(false), 4000);
    })
      .on("broadcast", { event: "nuevo" }, () => void reload())
      .on("broadcast", { event: "estado" }, () => void reload())
      .on("broadcast", { event: "leido" }, () => void reload())
      .subscribe((s) => setChannelOk(s === "SUBSCRIBED"));
    channel.current = ch;
    return () => {
      clearTimeout(typingTimer.current);
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [saved, reload]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void outbox.current?.flush();
      void reload();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [reload]);

  /* --- Leído: al ver lo que escribió el agente --- */
  const unreadAgent = view?.messages.some((m) => m.kind === "outgoing" && m.author_kind === "agent" && m.status !== "read") ?? false;
  useEffect(() => {
    if (!saved || !shown || !unreadAgent || document.visibilityState === "hidden") return;
    void markRead(saved).then(() => void reload(), () => undefined);
  }, [saved, shown, unreadAgent, reload]);

  /* --- Pasos --- */
  const step: Step = useMemo(() => {
    if (!saved) return formOpen ? "form" : "off";
    if (!view) return "waiting";
    if (view.status === "resolved") return view.csat ? "thanks" : "rate";
    if (view.status === "open" || view.status === "snoozed") return "chat";
    return "waiting";
  }, [saved, view, formOpen]);

  const enabled = Boolean(portal?.agent_on);

  const begin = useCallback(() => {
    setError("");
    setShown(true);
    setFormOpen(true);
    setLocal((l) => (l.some((x) => x.id === "oferta") ? l : [...l, { id: "oferta", from: "pilo", text: FRASES.oferta }]));
  }, []);

  const intercept = useCallback(
    (question: string) => {
      if (!enabled || savedRef.current || !wantsAgent(question)) return false;
      setError("");
      setShown(true);
      setFormOpen(true);
      setLocal((l) => [...l.filter((x) => x.id !== "oferta" && x.id !== "pide"), { id: "pide", from: "pilo", text: FRASES.pedirDatos }]);
      return true;
    },
    [enabled],
  );

  const submit = useCallback(
    async (form: FormData) => {
      const problem = formProblem(form);
      if (problem) {
        setError(problem);
        return;
      }
      setBusy(true);
      setError("");
      try {
        const pairsNow = pairsRef.current;
        const out = await createConversation(space, {
          nombre: form.name.trim(),
          correo: form.email.trim().toLowerCase(),
          telefono: form.phone.trim(),
          ciudad: form.city.trim(),
          politica: `v${POLICY_VERSION}`,
          resumen: summarizeTurns(pairsNow),
          pregunta: lastUnanswered(pairsNow),
          web: form.web,
          turnstile: form.turnstile,
        });
        const s: Saved = { id: out.id, secret: out.secret, channel: out.channel, name: form.name.trim(), email: form.email.trim().toLowerCase() };
        writeSaved(space, s);
        lastAgent.current = null;
        const lines: Local[] = [{ id: "espera", from: "pilo", text: esperando(form.name) }];
        const st = portal;
        if (out.after_hours) lines.push({ id: "fuera", from: "pilo", text: st?.messages?.closed || FRASES.fueraDeHorario });
        else if (st && st.online === 0) lines.push({ id: "ocupados", from: "pilo", text: st.messages?.busy || FRASES.ocupados });
        setLocal((l) => [...l.filter((x) => x.id !== "oferta" && x.id !== "pide"), ...lines]);
        setSaved(s);
        setFormOpen(false);
      } catch (e) {
        setError(asSoporteError(e).message);
      } finally {
        setBusy(false);
      }
    },
    [space, portal],
  );

  const send = useCallback(async (text: string, files: File[] = []) => {
    const s = savedRef.current;
    const t = text.trim();
    if (!s || (!t && !files.length)) return;
    setError("");
    try {
      const uploaded: { ruta: string; nombre: string }[] = [];
      for (const f of files) uploaded.push({ ruta: await uploadFile(s, f, f.type), nombre: f.name });
      outbox.current?.push({ text: t, files: uploaded });
    } catch (e) {
      setError(asSoporteError(e).message);
    }
  }, []);

  const typed = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    void channel.current?.send({ type: "broadcast", event: "escribiendo", payload: { from: "student" } });
  }, []);

  const score = useCallback(
    async (n: number) => {
      const s = savedRef.current;
      if (!s) return;
      try {
        await rate(s, n);
        setLocal((l) => [...l, { id: `r${n}`, from: "student", text: `Califiqué la atención con ${n} de 5.` }, { id: "gracias", from: "pilo", text: FRASES.gracias }]);
        await reload();
      } catch (e) {
        setError(asSoporteError(e).message);
      }
    },
    [reload],
  );

  const clear = useCallback(() => {
    writeSaved(space, null);
    setSaved(null);
    setView(null);
    setLocal([]);
    setShown(false);
    setFormOpen(false);
    setNotice("");
    lastAgent.current = null;
  }, [space]);

  const back = useCallback(async () => {
    const s = savedRef.current;
    if (s && (view?.status === "queued" || view?.status === "offered" || view?.status === "pending")) {
      try {
        await cancel(s);
      } catch {
        /* igual vuelve a Pilo */
      }
      clear();
      return;
    }
    if (!s || view?.status === "resolved") {
      clear();
      return;
    }
    setShown(false);
  }, [view, clear]);

  return {
    enabled,
    portal,
    step,
    shown,
    view,
    saved,
    local,
    agentTyping,
    connected: online && (channelOk || !saved),
    queued: (outbox.current?.items() ?? []).map((q) => ({ id: q.id, text: q.payload.text || "Archivo adjunto" })),
    notice,
    error,
    busy,
    begin,
    intercept,
    submit,
    send,
    typed,
    score,
    back,
    resume: () => setShown(true),
    clear,
    dismissNotice: () => setNotice(""),
  };
}
