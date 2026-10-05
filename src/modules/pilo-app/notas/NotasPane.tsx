/* =============================================================================
   Mr. Pilo · Mis notas (beta) · /app/notas.

   Un estudiante con cuenta de Pilo conecta Génesis (el portal del estudiante)
   y Pilo le muestra su histórico de notas y cómo ha evolucionado. Solo
   lectura: Pilo no cambia nada en Génesis.

   Los pasos:
     1. La autorización amistosa (DataConsent, de terms/): sin la casilla, no
        se consulta nada. La segunda casilla decide si el permiso queda en
        este dispositivo o solo mientras la pestaña esté abierta.
     2. La sede (Génesis tiene un portal por sede), el código de estudiante
        y la contraseña: se usan una vez para entrar y no se guardan. La sede
        de la cuenta de Pilo viene elegida si casa con un portal; con un solo
        portal no se pregunta.
     3. Pilo leyendo: entra a Génesis y lee el polígrafo.
     4. Conectado, tres pestañas:
          Mi histórico   abre en el último periodo y deja recorrer los
                         anteriores; el polígrafo oficial se descarga en PDF.
          Mi evolución   la gráfica de promedios, lo que Pilo ve en el récord
                         y qué necesita para llegar a su meta (todo calculado
                         aquí, en logic.ts), y «Lo que le recomiendo»: al
                         pulsar el botón, y solo entonces, se envía a la IA un
                         resumen sin datos personales, y las recomendaciones
                         se escriben ahí mismo, con sus fuentes y con la
                         gráfica de fortalezas y áreas por reforzar. La IA
                         agrupa las materias y redacta; los números de las
                         gráficas son siempre los de las notas.
          Mi semestre    en construcción: sin datos.

   Otros estados: el permiso venció (se borra y se pide conectar de nuevo),
   Mis notas aún no está disponible, y sin conexión.

   Las notas y las recomendaciones viven en la memoria de esta pantalla: no
   se guardan en el dispositivo ni en el servidor. El permiso, donde diga
   logic.ts.

   Movimiento: lo que entra, entra una vez y solo con el dedo o el ratón
   (nunca con el teclado, ni con movimiento reducido), con transform y
   opacidad; la línea de la gráfica se dibuja una vez por conexión, no cada
   vez que se abre la pestaña. GSAP pone y quita el estado oculto, así que si
   se interrumpe no queda nada escondido.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { Pilo } from "../../pregunta/Pilo";
import type { PiloMojiHandle } from "../../pregunta/Pilo";
import { APP_ACCOUNT, APP_LOGIN } from "../routes";
import { Icon } from "../icons";
import { fromKeyboard, reducedMotion } from "../pwa";
import type { AccountState } from "../account/useAccount";
import { Field, Msg } from "../account/parts";
import { DataConsent } from "../terms/DataConsent";
import { asAdviceFailure, asFailure, connectGenesis, loadAdvice, loadHistory, loadPolygraphPdf, loadPortals } from "./api";
import { GOAL, TOP_MARK, adviceFailureOf, adviceSummary, areaBars, goalPlan, goalText, gradedCredits, summaryCourses } from "./logic";
import type { Advice, AdviceFailure, AdviceSummary, AreaBar, NotasHead } from "./logic";
import { CHART, PASS_MARK, STATE_LABEL, canUseNotas, chartOf, clearLink, courseName, courseState, evolution, findings, inProgress, nearestIndex, nota, notasMessage, periodLine, pickPortal, readLink, saveLink, settled, totals } from "./logic";
import type { CourseState, EvoRow, Finding, History, Link as GenesisLink, NotaPeriod, NotasFailure, PortalList } from "./logic";
import "../clases/clases.css";
import "./notas.css";

type Note = { tone: "ok" | "bad" | "info"; text: string };
type TabId = "historico" | "evolucion" | "semestre";
/** Cómo va «Lo que le recomiendo». El resultado vive aquí, en memoria: no se guarda en ningún lado. */
type AdviceState = { status: "reposo" } | { status: "pensando"; step: 0 | 1 } | { status: "listo"; advice: Advice; summary: AdviceSummary } | { status: "fallo"; failure: AdviceFailure };

/** Los pasos reales de un pedido de recomendaciones: lo que hace el dispositivo y lo que hace Pilo. */
const ADVICE_STEPS = ["Armando el resumen, sin su nombre ni su código", "Pilo lee los documentos de Enseñanza y escribe"];

/** Lo que Pilo está haciendo mientras lee; null si no está leyendo. */
type Phase = "entrando" | "leyendo" | "ordenando" | null;

const TABS: { id: TabId; label: string }[] = [
  { id: "historico", label: "Mi histórico" },
  { id: "evolucion", label: "Mi evolución" },
  { id: "semestre", label: "Mi semestre" },
];

const NO_PERIODS: NotaPeriod[] = [];

const PHASE_TEXT: Record<Exclude<Phase, null>, string> = {
  entrando: "Entrando a Génesis",
  leyendo: "Leyendo su polígrafo",
  ordenando: "Ordenando sus periodos",
};

/** Lo que Pilo promete, dicho otra vez al pie (el diseño aprobado). */
const PROMISES = [
  "Pilo solo lee: no matricula, no cambia notas ni datos, ni toca nada en Génesis.",
  "Sus notas son solo para usted: no entran a la memoria de Pilo ni las ve otra persona.",
  "Puede desconectarlo cuando quiera; al hacerlo se borra el permiso de este dispositivo.",
];

/** El glifo de cada estado: el mismo trazo, distinta forma. */
const STATE_GLYPH: Record<CourseState, JSX.Element> = {
  aprobada: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  reprobada: <path d="M6 6l12 12M18 6 6 18" />,
  homologada: <path d="M4 12h14M13 7l5 5-5 5" />,
  en_curso: <path d="M12 7v5l3 2M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z" />,
};

export function NotasPane({ state, online }: { state: AccountState; online: boolean }) {
  const { account, pending } = state;

  if (pending) {
    return (
      <p className="pc-wait" role="status">
        Pilo está revisando su cuenta…
      </p>
    );
  }

  if (!account || !canUseNotas(account)) {
    return (
      <section className="pc-sheet">
        <div className="pc-sheet__in">
          <p>
            {account
              ? account.status !== "activa"
                ? "Su cuenta de Pilo está suspendida. Escriba a la administración."
                : "Mis notas es para estudiantes: conecta a Pilo con su histórico de notas en Génesis."
              : "Mis notas es para estudiantes con cuenta de Pilo: conecta a Pilo con Génesis para ver su histórico de notas y cómo ha evolucionado."}
          </p>
          {!account && (
            <div className="pc-actions">
              <Link className="pa-btn pa-btn--line" to={APP_LOGIN}>
                Entrar
              </Link>
              <Link className="pa-btn pa-btn--main" to={APP_ACCOUNT}>
                Crear una cuenta
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Otra cuenta en el mismo dispositivo empieza de cero.
  return <Notas key={account.id} owner={account.id} campus={account.campus} online={online} />;
}

function Notas({ owner, campus, online }: { owner: string; /** La sede de la cuenta de Pilo, para proponer su portal. */ campus: string; online: boolean }) {
  const [link, setLink] = useState<GenesisLink | null>(() => readLink(owner));
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  /** Acaba de llegar el histórico y Pilo lo está acomodando: un instante, solo al conectar. */
  const [settling, setSettling] = useState(false);
  /** Mis notas no se puede usar todavía: el porqué. */
  const [off, setOff] = useState<string | null>(null);
  /** Un fallo que se dice donde esté la persona, con «Reintentar». */
  const [trouble, setTrouble] = useState<NotasFailure | null>(null);
  const [expired, setExpired] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  // El paso 1 (autorizar) y el paso 2 (la sede, el código y la contraseña de Génesis).
  const [granted, setGranted] = useState<{ keep: boolean } | null>(null);
  /** Las sedes en que se puede entrar; null mientras no se han leído. */
  const [sedes, setSedes] = useState<PortalList | null>(null);
  const [sedesTry, setSedesTry] = useState(0);
  const [portalId, setPortalId] = useState("");
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [errors, setErrors] = useState<{ sede?: string; code?: string; pass?: string }>({});
  const [connecting, setConnecting] = useState(false);

  const [tab, setTab] = useState<TabId>("historico");
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [advice, setAdvice] = useState<AdviceState>({ status: "reposo" });

  const root = useRef<HTMLDivElement>(null);
  const face = useRef<PiloMojiHandle>(null);
  const focusTo = useRef<"paso" | "pestanas" | "inicio" | "clave" | "sede" | null>(null);
  const stepHead = useRef<HTMLHeadingElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const startHead = useRef<HTMLDivElement>(null);
  /** Lo que llega entra animado solo si se pidió con el dedo o el ratón. */
  const animateNext = useRef(false);
  /** Qué acaba de cambiar con el dedo o el ratón, para animar solo eso. */
  const moved = useRef<"pestana" | "periodo" | null>(null);
  /** La línea de la gráfica ya se dibujó en esta conexión. */
  const drawn = useRef(false);
  const request = useRef<AbortController | null>(null);
  const adviceRequest = useRef<AbortController | null>(null);
  /** Las recomendaciones entran animadas solo si se pidieron con el dedo o el ratón. */
  const adviceIn = useRef(false);
  const settleTimer = useRef(0);

  useEffect(
    () => () => {
      request.current?.abort();
      adviceRequest.current?.abort();
      window.clearTimeout(settleTimer.current);
    },
    [],
  );

  /** Lo que se borra con la conexión: el pedido en curso y las recomendaciones que hubiera. */
  const dropAdvice = useCallback(() => {
    adviceRequest.current?.abort();
    adviceIn.current = false;
    setAdvice({ status: "reposo" });
  }, []);

  /** Un fallo de la función, llevado al estado que le toca. */
  const fail = useCallback((failure: NotasFailure, where: "conectar" | "leer") => {
    // No hubo pestañas que enfocar.
    if (focusTo.current === "pestanas") focusTo.current = null;
    if (failure.view === "vencido") {
      clearLink();
      setLink(null);
      setHistory(null);
      setGranted(null);
      setExpired(true);
      setNote(null);
      drawn.current = false;
      dropAdvice();
      focusTo.current = "inicio";
      return;
    }
    if (failure.view === "no_disponible") {
      setOff(failure.message);
      focusTo.current = "inicio";
      return;
    }
    if (failure.view === "sede") {
      // La sede elegida ya no está entre los portales: se lee la lista otra vez y se pide elegir.
      setPortalId("");
      setSedesTry((n) => n + 1);
      setErrors({ sede: failure.message });
      focusTo.current = "sede";
      return;
    }
    if (failure.view === "campo" && where === "conectar") {
      setErrors({ pass: failure.message });
      // El campo aún está deshabilitado: el foco llega cuando vuelva a estar disponible.
      focusTo.current = "clave";
      return;
    }
    setTrouble(failure);
  }, [dropAdvice]);

  const fetchHistory = useCallback(
    async (permit: string) => {
      request.current?.abort();
      const ctl = new AbortController();
      request.current = ctl;
      setLoading(true);
      setTrouble(null);
      try {
        const next = await loadHistory(permit, ctl.signal);
        if (ctl.signal.aborted) return;
        const show = () => {
          setHistory(next);
          setPeriodId((current) => (current && next.periods.some((p) => p.id === current) ? current : (next.periods[next.periods.length - 1]?.id ?? null)));
          setOff(null);
          setSettling(false);
          setLoading(false);
        };
        // Al conectar con el dedo o el ratón, Pilo dice un instante que está ordenando. Nunca al actualizar.
        if (animateNext.current && !reducedMotion()) {
          setSettling(true);
          settleTimer.current = window.setTimeout(show, 320);
        } else show();
      } catch (error) {
        if (ctl.signal.aborted) return;
        animateNext.current = false;
        setLoading(false);
        fail(asFailure(error), "leer");
      }
    },
    [fail],
  );

  // Con un permiso ya en el dispositivo (o en la memoria de la pestaña), se leen las notas al entrar.
  const permit = link?.permit;

  // Sin conectar, se leen las sedes: si Mis notas está apagada se dice de una vez, antes de pedir nada.
  useEffect(() => {
    if (permit || !online) return;
    const ctl = new AbortController();
    loadPortals(ctl.signal).then(
      (list) => {
        if (ctl.signal.aborted) return;
        setSedes(list);
        if (!list.on) return setOff(notasMessage("no_disponible"));
        // La elegida se respeta si sigue ahí; si no, la de la cuenta (o la única que haya).
        setPortalId((chosen) => (list.portals.some((p) => p.id === chosen) ? chosen : (pickPortal(list.portals, campus) ?? "")));
      },
      (error) => {
        if (!ctl.signal.aborted) fail(asFailure(error), "leer");
      },
    );
    return () => ctl.abort();
  }, [permit, online, sedesTry, campus, fail]);
  useEffect(() => {
    if (permit && online) void fetchHistory(permit);
  }, [permit, online, fetchHistory]);

  // El foco sigue al estado: al paso nuevo, a las pestañas recién leídas, o al comienzo si hubo que volver.
  useEffect(() => {
    const where = focusTo.current;
    if (!where) return;
    const el = where === "paso" ? stepHead.current : where === "pestanas" ? tabList.current?.querySelector<HTMLElement>('[aria-selected="true"]') : where === "clave" ? document.getElementById("pnt-pass") : where === "sede" ? document.getElementById("pnt-sede") : startHead.current;
    if (!el || (el as HTMLInputElement).disabled) return;
    focusTo.current = null;
    el.focus({ preventScroll: false });
  });

  const phase: Phase = connecting ? "entrando" : settling ? "ordenando" : loading && !history ? "leyendo" : null;

  // Cada paso de la lectura entra en su sitio; el que sale no se anima: ya no importa.
  useLayoutEffect(() => {
    if (!phase || reducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".pnt-reading__step", { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22, ease: "expo.out", clearProps: "opacity,transform" });
    }, root);
    return () => ctx.revert();
  }, [phase]);

  // Las pestañas entran una vez, al conectar. GSAP pone y quita el estado oculto: interrumpido, queda todo a la vista.
  useLayoutEffect(() => {
    if (!history || !animateNext.current) return;
    animateNext.current = false;
    if (reducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      const rows = gsap.utils.toArray<HTMLElement>("[data-in]").slice(0, 8);
      if (rows.length) gsap.fromTo(rows, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.24, stagger: 0.035, ease: "expo.out", clearProps: "opacity,transform" });
    }, root);
    return () => ctx.revert();
  }, [history]);

  // Al cambiar de pestaña o de periodo con el dedo o el ratón, lo nuevo entra; con el teclado aparece en su sitio.
  useLayoutEffect(() => {
    const what = moved.current;
    moved.current = null;
    if (!what || reducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      if (what === "pestana") gsap.fromTo(".pnt-panel", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, ease: "expo.out", clearProps: "opacity,transform" });
      else gsap.fromTo(".pnt-courses li", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.03, ease: "expo.out", clearProps: "opacity,transform" });
    }, root);
    return () => ctx.revert();
  }, [tab, periodId]);

  // La gráfica se dibuja una sola vez por conexión: la primera vez que se abre «Mi evolución».
  const ready = Boolean(history);
  useLayoutEffect(() => {
    if (tab !== "evolucion" || !ready || drawn.current || !root.current) return;
    drawn.current = true;
    if (reducedMotion()) return;
    const ctx = gsap.context(() => {
      const line = root.current?.querySelector<SVGPathElement>(".pnt-line--avg");
      const length = line?.getTotalLength?.() ?? 0;
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      // El acumulado aparece primero, quieto: es el fondo contra el que se lee cada semestre.
      tl.fromTo(".pnt-line--acc", { opacity: 0 }, { opacity: 1, duration: 0.3, clearProps: "opacity" }, 0);
      if (line && length > 0) tl.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.8, ease: "power1.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.1);
      tl.fromTo(".pnt-dot", { scale: 0.5, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: 0.22, stagger: 0.06, ease: "back.out(2)", clearProps: "opacity,transform" }, 0.14);
      tl.fromTo(".pnt-finds li", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, stagger: 0.05, ease: "expo.out", clearProps: "opacity,transform" }, 0.45);
    }, root);
    return () => ctx.revert();
  }, [tab, ready]);

  // Las recomendaciones recién escritas entran una vez: las barras crecen desde su base y las filas suben.
  const adviceReady = advice.status === "listo";
  useLayoutEffect(() => {
    if (!adviceReady || !adviceIn.current) return;
    adviceIn.current = false;
    if (reducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.fromTo(".pnt-area__fill", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.5, stagger: 0.05, ease: "power2.out", clearProps: "transform" }, 0);
      tl.fromTo(".pnt-recs > li", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, stagger: 0.05, clearProps: "opacity,transform" }, 0.1);
    }, root);
    return () => ctx.revert();
  }, [adviceReady]);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (connecting || !granted) return;
    const typed = code.trim();
    const problems = {
      sede: sedes?.portals.some((p) => p.id === portalId) ? undefined : sedes ? "Elija su sede." : "Aún no pude leer las sedes de Génesis. Intente de nuevo en un momento.",
      code: !typed ? "Escriba su código de estudiante." : /^\d{6,15}$/.test(typed) ? undefined : "El código de estudiante lleva solo números.",
      pass: pass ? undefined : "Escriba su contraseña de Génesis.",
    };
    setErrors(problems);
    if (problems.sede || problems.code || problems.pass) {
      animateNext.current = false;
      if (problems.sede && !sedes) setSedesTry((n) => n + 1);
      document.getElementById(problems.sede ? "pnt-sede" : problems.code ? "pnt-code" : "pnt-pass")?.focus();
      return;
    }
    setConnecting(true);
    setTrouble(null);
    setNote(null);
    try {
      const out = await connectGenesis(portalId, typed, pass);
      const saved = saveLink(owner, out, granted.keep);
      // La contraseña y el código ya cumplieron: no quedan ni en el formulario.
      setPass("");
      setCode("");
      setExpired(false);
      setTab("historico");
      drawn.current = false;
      setLink(saved);
      setNote({
        tone: "ok",
        text: saved.kept
          ? "Conectado. La conexión queda guardada solo en este dispositivo."
          : granted.keep
            ? "Conectado. No se pudo guardar en este dispositivo: la conexión dura mientras esta pestaña esté abierta."
            : "Conectado solo por esta vez: al cerrar la pestaña, no queda nada guardado.",
      });
      focusTo.current = "pestanas";
      if (animateNext.current) face.current?.nod();
    } catch (error) {
      animateNext.current = false;
      fail(asFailure(error), "conectar");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    request.current?.abort();
    window.clearTimeout(settleTimer.current);
    clearLink();
    setLink(null);
    setHistory(null);
    setGranted(null);
    setLoading(false);
    setSettling(false);
    setTrouble(null);
    setOff(null);
    setExpired(false);
    setCode("");
    setPass("");
    setTab("historico");
    setPeriodId(null);
    setAsTable(false);
    drawn.current = false;
    dropAdvice();
    setNote({ tone: "ok", text: "Se desconectó y se borró el permiso de este dispositivo." });
    focusTo.current = "inicio";
  };

  /** El polígrafo oficial: llega de Génesis y se descarga aquí mismo; no se guarda en ningún otro lado. */
  const downloadPdf = async () => {
    if (!link || downloading) return;
    setDownloading(true);
    setNote(null);
    try {
      const blob = await loadPolygraphPdf(link.permit);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "poligrafo.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 15_000);
      setNote({ tone: "ok", text: "Se descargó su polígrafo en PDF, tal como lo entrega Génesis." });
    } catch (error) {
      const failure = asFailure(error);
      if (failure.view === "vencido" || failure.view === "no_disponible") fail(failure, "leer");
      else setNote({ tone: "bad", text: failure.message });
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Pide las recomendaciones: es el único momento en que algo de las notas va a la IA, y va sin nombre, código
   * ni documento. Lo que vuelve se queda en la memoria de esta pantalla.
   */
  const askAdvice = async (event: MouseEvent) => {
    if (!history || !link || advice.status === "pensando") return;
    const summary = adviceSummary(history.periods, link.head);
    if (!summaryCourses(summary).length) return setAdvice({ status: "fallo", failure: adviceFailureOf("datos") });
    adviceRequest.current?.abort();
    const ctl = new AbortController();
    adviceRequest.current = ctl;
    adviceIn.current = !fromKeyboard(event);
    setAdvice({ status: "pensando", step: 0 });
    try {
      // El resumen ya está armado: lo que sigue es la espera de verdad.
      await Promise.resolve();
      if (ctl.signal.aborted) return;
      setAdvice({ status: "pensando", step: 1 });
      const got = await loadAdvice(summary, ctl.signal);
      if (ctl.signal.aborted) return;
      setAdvice({ status: "listo", advice: got, summary });
    } catch (error) {
      if (ctl.signal.aborted) return;
      adviceIn.current = false;
      setAdvice({ status: "fallo", failure: asAdviceFailure(error) });
    }
  };

  const pickTab = (next: TabId, pointer: boolean) => {
    if (next === tab) return;
    moved.current = pointer ? "pestana" : null;
    setTab(next);
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const to = e.key === "ArrowRight" ? (at + 1) % TABS.length : e.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    pickTab(TABS[to].id, false);
    tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  };

  /* --- Lo que se ve --------------------------------------------------------------------------- */

  const periods = history?.periods ?? NO_PERIODS;
  const current = link?.head.period ?? "";
  const sums = useMemo(() => totals(periods), [periods]);
  const evo = useMemo(() => evolution(periods), [periods]);
  const seen = useMemo(() => findings(periods, link?.head), [periods, link?.head]);
  const busy = connecting || loading;

  const live = (
    <div className="pc-live" aria-live="polite">
      {note && <Msg tone={note.tone}>{note.text}</Msg>}
    </div>
  );

  const offline = !online && (
    <section className="pcl-card pcl-card--note" role="status">
      <div className="pcl-face">
        <Pilo size="100%" emotion="obra" alive label="Mr. Pilo, en obra" />
      </div>
      <div>
        <h2>Estoy sin conexión</h2>
        <p>Necesito internet para leer sus notas en Génesis. {history ? "Lo que ve aquí es lo último que leí." : "Cuando vuelva la conexión, seguimos."}</p>
      </div>
    </section>
  );

  const retry = trouble && (
    <div className="pc-confirm" role="alert">
      <span>{trouble.message}</span>
      {trouble.view === "cuenta" ? (
        <Link className="pc-chip" data-strong to={APP_LOGIN}>
          Entrar con mi cuenta de Pilo
        </Link>
      ) : (
        link && (
          <button type="button" className="pc-chip" data-strong disabled={!online || loading} onClick={() => void fetchHistory(link.permit)}>
            Reintentar
          </button>
        )
      )}
    </div>
  );

  const reading = phase && (
    <div className="pnt-reading">
      <div className="pcl-face">
        <Pilo size="100%" mood="piensa" alive label="Mr. Pilo, leyendo" />
      </div>
      <p className="pnt-reading__step" role="status" key={phase}>
        {PHASE_TEXT[phase]}
      </p>
      <span className="pnt-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );

  /* Mis notas aún no está disponible. */
  if (off) {
    return (
      <div className="pcl pnt" ref={root}>
        <div ref={startHead} tabIndex={-1} className="pcl-start">
          <section className="pcl-card pcl-card--note">
            <div className="pcl-face">
              <Pilo size="100%" mood="duda" alive label="Mr. Pilo" />
            </div>
            <div>
              <h2>Mis notas aún no está disponible</h2>
              <p>{off}</p>
              <p className="pc-hint">No es algo que usted deba arreglar: depende de la administración de Génesis y de Pilo.</p>
              <div className="pcl-tools">
                <button type="button" className="pc-chip" data-strong disabled={!online} onClick={() => (link ? (setOff(null), void fetchHistory(link.permit)) : (setOff(null), setSedesTry((n) => n + 1)))}>
                  Intentar de nuevo
                </button>
                {link && (
                  <button type="button" className="pc-chip" onClick={disconnect}>
                    Desconectar
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
        {live}
      </div>
    );
  }

  /* Sin conectar: autorizar y, después, el código y la contraseña de Génesis. */
  if (!link) {
    return (
      <div className="pcl pnt" ref={root}>
        <div ref={startHead} tabIndex={-1} className="pcl-start">
          {expired && (
            <div className="pc-confirm" role="alert">
              <span>Su permiso de Génesis venció o fue retirado, y ya se borró de este dispositivo. Para seguir, autorice y conecte de nuevo.</span>
            </div>
          )}
          {offline}
          {connecting ? (
            reading
          ) : !granted ? (
            <DataConsent
              platform="genesis"
              className="pcl-consent"
              onAuthorize={({ keep }) => {
                setGranted({ keep });
                setNote(null);
                focusTo.current = "paso";
              }}
            />
          ) : (
            <section className="pcl-card" aria-labelledby="pnt-paso-h">
              <header className="pcl-card__head">
                <div className="pcl-face">
                  <Pilo ref={face} size="100%" mood="feliz" alive label="Mr. Pilo" />
                </div>
                <div>
                  <h2 id="pnt-paso-h" ref={stepHead} tabIndex={-1}>
                    Entre con su cuenta de Génesis
                  </h2>
                  <p>
                    {sedes?.portals.length === 1 ? `La misma del portal del estudiante de ${sedes.portals[0].name}.` : "La misma del portal del estudiante de su sede."} Pilo la usa una vez para entrar y
                    leer.
                  </p>
                </div>
              </header>
              <form className="pcl-card__body" onSubmit={(e) => void connect(e)} noValidate>
                <p className="pcl-granted">
                  {Icon.check}
                  <span>Autorizó a Pilo a consultar sus notas. {granted.keep ? "La conexión quedará guardada solo en este dispositivo." : "Solo por esta vez: al cerrar la pestaña, no queda nada guardado."}</span>
                </p>
                {/* La sede: Génesis tiene un portal por sede. Con uno solo no se pregunta. */}
                {sedes && sedes.portals.length > 1 ? (
                  <Field id="pnt-sede" label="Su sede" hint="Cada sede tiene su propio Génesis: entre al de la suya." error={errors.sede}>
                    {(aria) => (
                      <select
                        {...aria}
                        name="genesis-sede"
                        value={portalId}
                        onChange={(e) => {
                          setPortalId(e.target.value);
                          if (errors.sede) setErrors((x) => ({ ...x, sede: undefined }));
                        }}
                      >
                        {!portalId && <option value="">Elija su sede</option>}
                        {sedes.portals.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ) : (
                  errors.sede && (
                    <Msg tone="bad" alert>
                      {errors.sede}
                    </Msg>
                  )
                )}
                <Field id="pnt-code" label="Código de estudiante" error={errors.code}>
                  {(aria) => (
                    <input
                      {...aria}
                      type="text"
                      name="genesis-codigo"
                      inputMode="numeric"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={15}
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        if (errors.code) setErrors((x) => ({ ...x, code: undefined }));
                      }}
                    />
                  )}
                </Field>
                <Field id="pnt-pass" label="Contraseña de Génesis" hint="Se usa una sola vez para entrar a Génesis y no se guarda: ni aquí ni en el servidor." error={errors.pass}>
                  {(aria) => (
                    <input
                      {...aria}
                      type="password"
                      name="genesis-clave"
                      autoComplete="off"
                      maxLength={200}
                      value={pass}
                      onChange={(e) => {
                        setPass(e.target.value);
                        if (errors.pass) setErrors((x) => ({ ...x, pass: undefined }));
                      }}
                    />
                  )}
                </Field>
                {retry}
                <div className="pcl-row">
                  <button
                    type="submit"
                    className="pa-btn pa-btn--main"
                    disabled={!online}
                    onClick={(e) => {
                      // Con Enter o con el teclado, todo aparece en su sitio, sin recorrido.
                      animateNext.current = !fromKeyboard(e);
                    }}
                  >
                    Conectar con Génesis
                  </button>
                  <button
                    type="button"
                    className="pc-quiet"
                    onClick={() => {
                      setGranted(null);
                      setPass("");
                      setErrors({});
                      focusTo.current = "inicio";
                    }}
                  >
                    Volver a la autorización
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
        {live}
        <ul className="pc-hint pcl-notes">
          {PROMISES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    );
  }

  /* Conectado. */
  const period = periods.find((p) => p.id === periodId) ?? periods[periods.length - 1] ?? null;
  const newestFirst = [...periods].reverse();

  return (
    <div className="pcl pnt" ref={root}>
      <div ref={startHead} tabIndex={-1} className="pcl-start">
        {offline}
        <section className="pcl-state" aria-label={`Estado de la conexión con Génesis, sede ${link.portal.name}`}>
          <div className="pcl-state__who">
            <div className="pcl-face pcl-face--sm">
              <Pilo ref={face} size="100%" mood={loading ? "piensa" : "feliz"} alive label="Mr. Pilo" />
            </div>
            <p>
              <span className="pc-tag" data-t="ok">
                {Icon.check}
                Conectado
              </span>
              <b>{[`Génesis ${link.portal.name}`, "solo lectura", link.head.program ? courseName(link.head.program) : ""].filter(Boolean).join(" · ")}</b>
              <small>{link.kept ? "La conexión está guardada solo en este dispositivo." : "La conexión dura mientras esta pestaña esté abierta."}</small>
            </p>
          </div>
          <div className="pcl-tools">
            <button type="button" className="pc-chip" disabled={busy || !online} onClick={() => void fetchHistory(link.permit)}>
              {loading && history ? "Actualizando…" : "Actualizar"}
            </button>
            <button type="button" className="pc-chip" onClick={disconnect}>
              Desconectar
            </button>
          </div>
        </section>
      </div>

      {live}
      {retry}

      {!history ? (
        reading
      ) : (
        <>
          <div className="pnt-tabs" role="tablist" aria-label="Mis notas" ref={tabList} onKeyDown={onTabKey} data-in>
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`pnt-tab-${t.id}`} aria-selected={t.id === tab} aria-controls={`pnt-panel-${t.id}`} tabIndex={t.id === tab ? 0 : -1} onClick={(e) => pickTab(t.id, !fromKeyboard(e))}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "historico" && (
            <div className="pnt-panel" role="tabpanel" id="pnt-panel-historico" aria-labelledby="pnt-tab-historico" tabIndex={0}>
              {periods.length === 0 || !period ? (
                <p className="pcl-empty">Génesis no muestra periodos en su polígrafo todavía. Cuando tenga notas definitivas, aparecerán aquí.</p>
              ) : (
                <>
                  <dl className="pnt-totals" data-in>
                    <div>
                      <dt>Promedio acumulado</dt>
                      <dd>{nota(sums.accumulated)}</dd>
                    </div>
                    <div>
                      <dt>Créditos aprobados</dt>
                      <dd>{sums.approved}</dd>
                    </div>
                    <div>
                      <dt>{sums.periods === 1 ? "Periodo" : "Periodos"}</dt>
                      <dd>{sums.periods}</dd>
                    </div>
                  </dl>
                  <div className="pnt-periods" role="group" aria-label="Periodo" data-in>
                    {newestFirst.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={p.id === period.id}
                        onClick={(e) => {
                          if (p.id === period.id) return;
                          moved.current = fromKeyboard(e) ? null : "periodo";
                          setPeriodId(p.id);
                        }}
                      >
                        {i === 0 ? `${p.id} · último` : p.id}
                      </button>
                    ))}
                  </div>
                  <section className="pnt-card" aria-labelledby="pnt-periodo-h" data-in>
                    <div className="pnt-period-head">
                      <h2 id="pnt-periodo-h">{period.id}</h2>
                      <span className="pnt-muted">{periodLine(period)}</span>
                    </div>
                    {period.courses.length === 0 ? (
                      <p className="pnt-muted">Génesis no trae materias en este periodo.</p>
                    ) : (
                      <ul className="pnt-courses">
                        {period.courses.map((c, i) => {
                          const pending = inProgress(period, c, current);
                          const state = courseState(c, pending);
                          return (
                            <li key={`${c.code}-${i}`}>
                              <span className="pnt-course__name">{courseName(c.name) || c.code}</span>
                              <span className="pnt-course__def">{pending ? "—" : nota(c.def)}</span>
                              <span className="pnt-course__meta">
                                {c.credits > 0 && (
                                  <span>
                                    {c.credits} {c.credits === 1 ? "crédito" : "créditos"}
                                  </span>
                                )}
                                {c.group && <span>{courseName(c.group)}</span>}
                                {c.min !== null && !pending && <span>Se aprueba con {nota(c.min)}</span>}
                                <span className="pnt-state" data-s={state}>
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    {STATE_GLYPH[state]}
                                  </svg>
                                  {STATE_LABEL[state]}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {!settled(period) && period.courses.length > 0 && <p className="pnt-muted">Este periodo aún no tiene definitivas en Génesis.</p>}
                  </section>
                  {!history.record && <p className="pc-hint">Génesis no dejó leer el récord de notas: se muestra el polígrafo, sin la nota mínima de cada materia.</p>}
                  <div className="pnt-pdf" data-in>
                    <button type="button" className="pc-chip" data-strong disabled={downloading || !online} onClick={() => void downloadPdf()}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 3.5h7l4 4v13H7z" />
                        <path d="M14 3.5v4h4M12 11v6M9.5 14.5 12 17l2.5-2.5" />
                      </svg>
                      {downloading ? "Pidiendo el polígrafo…" : "Descargar mi polígrafo (PDF)"}
                    </button>
                    <span className="pnt-muted">El oficial, tal como lo entrega Génesis.</span>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "evolucion" && (
            <div className="pnt-panel" role="tabpanel" id="pnt-panel-evolucion" aria-labelledby="pnt-tab-evolucion" tabIndex={0}>
              {evo.filter((r) => r.avg !== null || r.acc !== null).length === 0 ? (
                <p className="pcl-empty">Todavía no hay promedios que mostrar: aparecerán cuando Génesis tenga su primer periodo con definitivas.</p>
              ) : (
                <>
                  <section className="pnt-card" aria-labelledby="pnt-evo-h">
                    <h2 id="pnt-evo-h">Su promedio, periodo a periodo</h2>
                    <ul className="pnt-legend" aria-label="Series de la gráfica">
                      <li>
                        <svg width="26" height="10" aria-hidden="true">
                          <path className="pnt-line pnt-key--avg" d="M1 5h24" strokeWidth="2.5" />
                          <circle className="pnt-key-dot" cx="13" cy="5" r="3.5" />
                        </svg>
                        Promedio del semestre
                      </li>
                      <li>
                        <svg width="26" height="10" aria-hidden="true">
                          <path className="pnt-line pnt-key--acc" d="M1 5h24" strokeWidth="2.5" />
                        </svg>
                        Promedio acumulado
                      </li>
                    </ul>
                    <EvoChart rows={evo} />
                    <button type="button" className="pnt-link" aria-expanded={asTable} aria-controls="pnt-evo-tabla" onClick={() => setAsTable((v) => !v)}>
                      {asTable ? "Ocultar la tabla" : "Ver como tabla"}
                    </button>
                    <div className="pnt-scroll" id="pnt-evo-tabla" hidden={!asTable}>
                      {asTable && <EvoTable rows={evo} />}
                    </div>
                  </section>

                  <section className="pnt-card" aria-labelledby="pnt-veo-h">
                    <h2 id="pnt-veo-h">Lo que veo en su récord</h2>
                    <FindingList items={seen} />
                    <p className="pnt-origin">Calculado en su dispositivo con las notas de su polígrafo.</p>
                  </section>

                  <GoalCard periods={periods} head={link.head} accumulated={sums.accumulated} approved={sums.approved} />

                  <AdviceCard state={advice} enabled={history.advice} online={online} accumulated={sums.accumulated} onAsk={(e) => void askAdvice(e)} />
                </>
              )}
            </div>
          )}

          {tab === "semestre" && (
            <div className="pnt-panel" role="tabpanel" id="pnt-panel-semestre" aria-labelledby="pnt-tab-semestre" tabIndex={0}>
              <section className="pnt-card pnt-soon" aria-labelledby="pnt-sem-h">
                <span className="pnt-badge">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 7v6M12 17h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                  En construcción
                </span>
                <h2 id="pnt-sem-h">Mi semestre con Pilo</h2>
                <p className="pnt-muted">Aquí verá sus notas de P1, P2 y P3 del periodo en curso, y cuánto necesita en cada corte para llegar a donde quiere. Todavía no está disponible.</p>
                <div className="pnt-cuts" aria-hidden="true">
                  {["P1", "P2", "P3"].map((cut) => (
                    <div key={cut}>
                      <b>{cut}</b>
                      <i />
                      <i />
                    </div>
                  ))}
                </div>
                <p className="pnt-muted">Vista previa, sin datos.</p>
              </section>
            </div>
          )}
        </>
      )}

      <ul className="pc-hint pcl-notes">
        {PROMISES.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/* --- La gráfica ---------------------------------------------------------------------------------- */

/**
 * Dos series en un solo eje: el promedio del semestre (continua, con puntos) y
 * el acumulado (punteada). La guía de 3,0 dice con cuánto se aprueba. Al pasar
 * o tocar, una cruz y una etiqueta con los dos valores del periodo. La tabla
 * («Ver como tabla») es la misma información para quien no ve la gráfica.
 */
function EvoChart({ rows }: { rows: EvoRow[] }) {
  const { W, H, L, R, T, B } = CHART;
  const shape = useMemo(() => chartOf(rows), [rows]);
  const [at, setAt] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const point = (e: PointerEvent<SVGRectElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    setAt(nearestIndex(((e.clientX - box.left) / box.width) * W, rows.length));
  };

  const passAt = shape.grid.find((g) => g.value === PASS_MARK)?.y;
  const row = at === null ? null : rows[at];

  return (
    <div className="pnt-chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Promedio del semestre y promedio acumulado en ${rows.length} ${rows.length === 1 ? "periodo" : "periodos"}. La tabla trae los valores.`}>
        {shape.grid.map((g) => (
          <g key={g.value}>
            <line className="pnt-grid" data-pass={g.value === PASS_MARK || undefined} x1={L} x2={W - R} y1={g.y} y2={g.y} />
            <text x={L - 6} y={g.y + 4} textAnchor="end">
              {nota(g.value)}
            </text>
          </g>
        ))}
        {passAt !== undefined && (
          <text x={W - R} y={passAt - 5} textAnchor="end">
            se aprueba con {nota(PASS_MARK)}
          </text>
        )}
        {shape.ticks.map((t) => (
          <text key={t.index} x={t.x} y={H - 6} textAnchor={t.anchor}>
            {t.label}
          </text>
        ))}
        <path className="pnt-line pnt-line--acc" d={shape.pathAcc} />
        <path className="pnt-line pnt-line--avg" d={shape.pathAvg} />
        {shape.avg.map((y, i) => (y === null ? null : <circle key={rows[i].id} className="pnt-dot" cx={shape.xs[i]} cy={y} r={4} />))}
        {at !== null && <line className="pnt-cross" x1={shape.xs[at]} x2={shape.xs[at]} y1={T} y2={H - B} />}
        <rect className="pnt-hit" x={L - 8} y={T} width={W - L - R + 16} height={H - T - B} onPointerMove={point} onPointerDown={point} onPointerLeave={() => setAt(null)} />
      </svg>
      {row && at !== null && (
        <div className="pnt-tip" style={{ left: `clamp(64px, ${(shape.xs[at] / W) * 100}%, calc(100% - 64px))` }} aria-hidden="true">
          <b>{row.id}</b>
          Semestre {nota(row.avg)}
          <br />
          Acumulado {nota(row.acc)}
        </div>
      )}
    </div>
  );
}

function EvoTable({ rows }: { rows: EvoRow[] }) {
  return (
    <table className="pnt-table">
      <caption className="pa-sr">Promedio del semestre y promedio acumulado por periodo</caption>
      <thead>
        <tr>
          <th scope="col">Periodo</th>
          <th scope="col">Semestre</th>
          <th scope="col">Acumulado</th>
          <th scope="col">Créditos</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th scope="row">{r.id}</th>
            <td>{nota(r.avg)}</td>
            <td>{nota(r.acc)}</td>
            <td>{r.credits || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FindingList({ items }: { items: Finding[] }) {
  if (!items.length) return <p className="pnt-muted">Con lo que hay en su polígrafo todavía no hay nada que señalar.</p>;
  return (
    <ul className="pnt-finds">
      {items.map((f) => (
        <li key={f.id}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 17l5-5 4 3 7-8" />
            <path d="M15 7h5v5" />
          </svg>
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* --- Qué necesita para llegar a su meta ---------------------------------------------------------- */

const pct = (v: number) => `${Math.max(0, Math.min(100, (v / TOP_MARK) * 100))}%`;

/**
 * La persona elige un promedio acumulado meta y se le dice cuánto debe promediar en los créditos que le faltan.
 * Es aritmética del dispositivo (goalPlan): no pasa por la IA ni sale de aquí. En el eje, tres marcas de forma
 * distinta —lo que lleva, la meta y lo que necesita—, cada una con su valor escrito al lado.
 */
function GoalCard({ periods, head, accumulated, approved }: { periods: NotaPeriod[]; head: NotasHead; accumulated: number | null; approved: number }) {
  const [goal, setGoal] = useState(() => Math.min(GOAL.max, Math.max(GOAL.min, Math.round(((accumulated ?? 3.8) + 0.2) * 10) / 10)));
  const graded = useMemo(() => gradedCredits(periods, head.period), [periods, head.period]);
  const plan = goalPlan({ accumulated, graded, approved, percent: head.creditsPercent, goal });
  const said = goalText(plan, goal);
  const scaled = plan.status === "posible" || plan.status === "cumplida" || plan.status === "inalcanzable";

  return (
    <section className="pnt-card" aria-labelledby="pnt-meta-h">
      <h2 id="pnt-meta-h">Qué necesita para llegar a su meta</h2>
      {plan.status === "sin_datos" || plan.status === "terminado" ? (
        <p className="pnt-goal__say">
          <b>{said.title}</b>
          <span>{said.detail}</span>
        </p>
      ) : (
        <>
          <div className="pnt-goal__pick">
            <label htmlFor="pnt-meta">Su meta de promedio acumulado</label>
            <output htmlFor="pnt-meta">{nota(goal)}</output>
            <input
              id="pnt-meta"
              type="range"
              min={GOAL.min}
              max={GOAL.max}
              step={GOAL.step}
              value={goal}
              aria-valuetext={`${nota(goal)} de promedio acumulado`}
              onChange={(e) => setGoal(Math.round(Number(e.target.value) * 10) / 10)}
            />
          </div>
          {scaled && (
            <>
              <div className="pnt-goal__axis" aria-hidden="true">
                <i className="pnt-goal__pass" style={{ left: pct(PASS_MARK) }} />
                <i className="pnt-mark pnt-mark--has" style={{ left: pct(plan.accumulated) }} />
                <i className="pnt-mark pnt-mark--goal" style={{ left: pct(goal) }} />
                <i className="pnt-mark pnt-mark--need" style={{ left: pct(Math.min(TOP_MARK, plan.needed)) }} />
              </div>
              <ul className="pnt-goal__key">
                <li>
                  <i className="pnt-mark pnt-mark--has" aria-hidden="true" />
                  Lleva <b>{nota(plan.accumulated)}</b>
                </li>
                <li>
                  <i className="pnt-mark pnt-mark--goal" aria-hidden="true" />
                  Meta <b>{nota(goal)}</b>
                </li>
                <li>
                  <i className="pnt-mark pnt-mark--need" aria-hidden="true" />
                  Necesita <b>{plan.status === "inalcanzable" ? `más de ${nota(TOP_MARK)}` : nota(plan.needed)}</b>
                </li>
              </ul>
            </>
          )}
          <p className="pnt-goal__say" role="status">
            <b>{said.title}</b>
            <span>{said.detail}</span>
          </p>
          <p className="pnt-origin">
            Calculado en su dispositivo. Es una cuenta aproximada: los créditos que le faltan salen de su avance en Génesis ({nota(head.creditsPercent).replace(/,0$/, "")} % del plan). La línea
            del eje marca {nota(PASS_MARK)}.
          </p>
        </>
      )}
    </section>
  );
}

/* --- Lo que le recomiendo -------------------------------------------------------------------------- */

/**
 * Las recomendaciones, escritas aquí mismo. En reposo, el botón y qué se envía; pensando, los pasos reales;
 * con resultado, la gráfica de áreas (si la IA las propuso), cada recomendación con su porqué, su acción y
 * sus fuentes —o dicho con palabras que es general, sin documento de la universidad—; y el error, con
 * reintento, o el tope del día.
 */
function AdviceCard({ state, enabled, online, accumulated, onAsk }: { state: AdviceState; enabled: boolean; online: boolean; accumulated: number | null; onAsk: (event: MouseEvent) => void }) {
  const bars = useMemo(() => (state.status === "listo" ? areaBars(state.summary, state.advice.areas, accumulated) : []), [state, accumulated]);

  return (
    <section className="pnt-card" aria-labelledby="pnt-rec-h">
      <h2 id="pnt-rec-h">Lo que le recomiendo</h2>

      {state.status === "reposo" &&
        (enabled ? (
          <>
            <p className="pnt-muted">Pilo interpreta sus notas, tiene en cuenta su programa y busca en los documentos de la universidad qué le puede servir.</p>
            <div className="pcl-tools">
              <button type="button" className="pc-chip" data-strong disabled={!online} onClick={onAsk}>
                Pedirle recomendaciones a Pilo
              </button>
            </div>
            <p className="pnt-origin">
              Al pulsar, envío a la IA un resumen de sus notas: programa, periodos, materias, créditos y definitivas. Sin su nombre, su código ni su documento. No se guarda.
            </p>
          </>
        ) : (
          <p className="pnt-muted">La universidad aún no ha habilitado las recomendaciones con IA en Mis notas. Lo de arriba sí es suyo desde ya: se calcula en su dispositivo.</p>
        ))}

      {state.status === "pensando" && (
        <div className="pnt-think" role="status">
          <span className="pnt-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <ol>
            {ADVICE_STEPS.map((text, i) => (
              <li key={text} data-s={i < state.step ? "hecho" : i === state.step ? "ahora" : "falta"}>
                {i < state.step ? Icon.check : <span aria-hidden="true">{i + 1}.</span>}
                <span>
                  {text}
                  {i < state.step ? " · listo" : i === state.step ? "…" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {state.status === "fallo" && (
        <div className="pc-confirm" role="alert">
          <span>{state.failure.message}</span>
          {state.failure.retry && (
            <button type="button" className="pc-chip" data-strong disabled={!online} onClick={onAsk}>
              Reintentar
            </button>
          )}
        </div>
      )}

      {state.status === "listo" && (
        <>
          {bars.length > 0 && <AreaChart bars={bars} />}
          <ol className="pnt-recs" aria-label="Recomendaciones de Pilo">
            {state.advice.recs.map((rec, i) => (
              <li key={`${i}-${rec.title}`}>
                <h3>{rec.title}</h3>
                {rec.why && <p>{rec.why}</p>}
                {rec.action && (
                  <p>
                    <b>Qué hacer: </b>
                    {rec.action}
                  </p>
                )}
                {rec.grounded ? (
                  <p className="pnt-rec__src">
                    <span>{rec.sources.length === 1 ? "Fuente:" : "Fuentes:"}</span>
                    {rec.sources.map((n) => {
                      const source = state.advice.sources.find((x) => x.n === n);
                      if (!source) return null;
                      const label = [source.title, source.section].filter(Boolean).join(" › ");
                      return source.path.startsWith("/") ? (
                        <Link key={n} to={source.path}>
                          {label}
                        </Link>
                      ) : source.path ? (
                        <a key={n} href={source.path} target="_blank" rel="noopener noreferrer">
                          {label}
                        </a>
                      ) : (
                        <span key={n}>{label}</span>
                      );
                    })}
                  </p>
                ) : (
                  <p className="pnt-rec__general">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 11v5M12 8h.01" />
                    </svg>
                    Recomendación general, sin documento de la universidad
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className="pnt-origin">
            Redactado por Pilo con IA, con un resumen de sus notas sin su nombre ni su código. Los números de las gráficas se calculan en su dispositivo. Verifique lo que le diga: puede
            equivocarse. No se guarda: al salir de esta pantalla, se borra.
          </p>
          <div className="pcl-tools">
            <button type="button" className="pc-chip" disabled={!online} onClick={onAsk}>
              Pedirlas de nuevo
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Fortalezas y áreas por reforzar: una barra por área con su promedio ponderado por créditos, de mayor a menor,
 * en un solo eje de 0 a 5 con la guía en 3,0. El valor va escrito junto a cada barra y el estado se dice con
 * glifo y palabra. Las áreas las agrupó la IA; los promedios son de las notas (areaBars).
 */
function AreaChart({ bars }: { bars: AreaBar[] }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="pnt-areas">
      <h3>Fortalezas y áreas por reforzar</h3>
      <ul aria-label="Promedio por área, de mayor a menor">
        {bars.map((b) => (
          <li key={b.name}>
            <span className="pnt-area__name">{b.name}</span>
            <span className="pnt-area__val">{nota(b.avg)}</span>
            <span className="pnt-area__track" aria-hidden="true">
              <i className="pnt-area__fill" data-strong={b.strong || undefined} style={{ width: pct(b.avg) }} />
            </span>
            <span className="pnt-area__state">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {b.strong ? <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" /> : <path d="M12 5v13M6.5 12.5 12 18l5.5-5.5" />}
              </svg>
              {b.strong ? "Fortaleza" : "Por reforzar"} · {b.count} {b.count === 1 ? "materia" : "materias"}
            </span>
          </li>
        ))}
      </ul>
      <p className="pnt-origin">
        Pilo agrupó sus materias en áreas; el promedio de cada una se calcula en su dispositivo con sus definitivas, ponderado por créditos. La línea marca {nota(PASS_MARK)}: con eso se
        aprueba. «Fortaleza» es ir en su promedio acumulado o por encima.
      </p>
      <button type="button" className="pnt-link" aria-expanded={asTable} aria-controls="pnt-areas-tabla" onClick={() => setAsTable((v) => !v)}>
        {asTable ? "Ocultar la tabla" : "Ver como tabla"}
      </button>
      <div className="pnt-scroll" id="pnt-areas-tabla" hidden={!asTable}>
        {asTable && (
          <table className="pnt-table">
            <caption className="pa-sr">Promedio ponderado por créditos de cada área</caption>
            <thead>
              <tr>
                <th scope="col">Área</th>
                <th scope="col">Promedio</th>
                <th scope="col">Materias</th>
                <th scope="col">Créditos</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.name}>
                  <th scope="row">{b.name}</th>
                  <td>{nota(b.avg)}</td>
                  <td>{b.count}</td>
                  <td>{b.credits}</td>
                  <td>{b.strong ? "Fortaleza" : "Por reforzar"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
