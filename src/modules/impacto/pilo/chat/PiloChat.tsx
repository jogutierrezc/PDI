/* =============================================================================
   Mr. Pilo Bot conversacional · la guía de los programas, hablando.

   El director escribe lo que quiere lograr —o elige preguntas por subtemas—
   y Pilo lo entiende, lo relaciona con las fichas que ya existen y propone:
     1. Entender, primero sin IA: los impactos por sus palabras
        (understand.matchGoals) y las fichas construidas que comparten
        palabras con lo escrito (understand.matchIndicators). Si la IA está
        encendida, la acción «entender» de pilo-ia afina eligiendo SOLO entre
        esas listas, y resume la necesidad; la respuesta dice que es con IA.
     2. Proponer con el mismo motor de siempre (recommend): la cadena completa
        por función y el resto parejo; lo que pidió el programa entra con su
        razón («Lo pidió el programa»).
     3. Analizar con los datos del programa: su cumplimiento frente a la meta
        2026 y la mediana de su facultad, los huecos de su cadena, lo que
        siguen programas parecidos y sus cifras P1P2P3.
   Nada se guarda hasta «Adoptar». A la derecha, el plan vivo: impactos,
   lo pedido, la cadena, la propuesta y sus conexiones con el PDI y los ODS.

   El escenario tiene tres temas —azul (el de siempre), claro y negro— y el
   panel de trabajo es la intranet de siempre. Pilo es el dibujo por capas
   (PiloSvgMoji): parpadea, mira y cambia de emoción; no mueve el pico.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { FUNCTION_LABEL, STAGE_LABEL, errorText, type ProgramSite, type Stage, type SubstantiveFunction } from "../../model";
import { useAdoptMany, useAdoptions, usePeerAdoptions, usePiloSettings, useSourceFigures, useValues, type Catalog, type ImpactBase } from "../../store";
import { DEFAULT_WEIGHTS, FNS, GOALS_PER_FN, PILO_GOALS, PILO_SIZES, STAGES, chainGaps, missingFunctions, recommend, type PiloIndicator, type PiloPick } from "../recommend";
import { PiloScene, type PiloOrigin } from "../PiloLauncher";
import { PiloSvgMoji } from "../../../../components/pilo/PiloSvgMoji";
import type { PiloSvgMood } from "../../../../components/pilo/PiloSvgMoji";
import { interpretNeed } from "../../../../components/pilo/ai/client";
import { usePiloAiConfig } from "../../../../components/pilo/ai/config";
import { useAuth } from "../../../../lib/auth";
import { usePortalData } from "../../portal/data";
import { programsOf } from "../../portal/analysis";
import { countStandings, median, metShare, programStandings } from "../../portal/standing";
import { detectIntent, matchGoals, matchIndicators, type Candidate, type Intent } from "./understand";
import { Icon } from "../../../../components/ui/Icon";
import "./chat.css";

type Tema = "azul" | "claro" | "negro";
const TEMAS: { id: Tema; label: string }[] = [
  { id: "azul", label: "Azul" },
  { id: "claro", label: "Claro" },
  { id: "negro", label: "Negro" },
];
const TEMA_KEY = "pilo-bot:tema";
const FN_CODE: Record<SubstantiveFunction, string> = { ensenanza: "ENS", investigacion: "INV", extension: "EXT" };
const ODS_NAME: Record<number, string> = {
  1: "Fin de la pobreza", 2: "Hambre cero", 3: "Salud y bienestar", 4: "Educación de calidad", 5: "Igualdad de género", 6: "Agua limpia",
  7: "Energía asequible", 8: "Trabajo decente", 9: "Industria e innovación", 10: "Reducción de desigualdades", 11: "Ciudades sostenibles",
  12: "Producción responsable", 13: "Acción por el clima", 14: "Vida submarina", 15: "Vida de ecosistemas", 16: "Paz y justicia", 17: "Alianzas",
};
const goalOf = (id: string) => PILO_GOALS.find((g) => g.id === id)!;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pct = (n: number | null) => (n === null ? "sin dato" : `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);

interface Msg {
  id: number;
  from: "pilo" | "me";
  /** «Sin IA» o «Lectura de Pilo · con IA». */
  ai?: boolean;
  plain?: boolean;
  body: ReactNode;
}

interface Wanted {
  reason: string;
  /** Lo encontró la IA (y no la búsqueda de palabras). */
  ai: boolean;
}

export function PiloChat({
  site,
  base,
  catalog,
  canEdit,
  origin,
  onClose,
  onClassic,
}: {
  site: ProgramSite;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
  origin: PiloOrigin;
  onClose: () => void;
  onClassic: () => void;
}) {
  const [tema, setTemaState] = useState<Tema>(() => {
    try {
      const v = window.localStorage.getItem(TEMA_KEY);
      return v === "claro" || v === "negro" ? v : "azul";
    } catch {
      return "azul";
    }
  });
  const setTema = (t: Tema) => {
    setTemaState(t);
    try {
      window.localStorage.setItem(TEMA_KEY, t);
    } catch {
      /* se queda en esta visita */
    }
  };

  const [goals, setGoals] = useState<string[]>([]);
  const [size, setSize] = useState<number | null>(null);
  const [wanted, setWanted] = useState<Map<string, Wanted>>(new Map());
  const [off, setOff] = useState<Set<string>>(new Set());
  const [adoptedNow, setAdoptedNow] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<PiloSvgMood>("emocionado");
  const [tab, setTab] = useState<"demostrar" | "saber">("demostrar");
  const [fnTab, setFnTab] = useState<SubstantiveFunction>("ensenanza");
  const [draft, setDraft] = useState("");
  const msgId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);

  /* --- Los datos, los mismos de la guía por pasos --------------------------------- */
  const published = useMemo(() => catalog.indicators.filter((i) => i.status === "publicado"), [catalog.indicators]);
  const byId = useMemo(() => new Map(published.map((i) => [i.id, i])), [published]);
  const own = useMemo(
    () => catalog.programIndicators.filter((i) => i.programId === site.programId && i.campusId === site.campusId && i.status !== "retirado"),
    [catalog.programIndicators, site.programId, site.campusId],
  );
  const ids = useMemo(() => published.map((i) => i.id), [published]);
  const adoptions = useAdoptions({ programId: site.programId, campusId: site.campusId });
  const values = useValues(ids, site);
  const peers = usePeerAdoptions(site);
  const settings = usePiloSettings();
  const sources = useSourceFigures(site);
  const portal = usePortalData();
  const adopt = useAdoptMany();
  const ai = usePiloAiConfig();
  const { profile } = useAuth();
  const aiOn = Boolean(ai.data?.enabled && profile?.is_active);

  const adopted = useMemo(() => new Set((adoptions.data ?? []).filter((a) => a.active).map((a) => a.indicatorId)), [adoptions.data]);
  const dimName = useMemo(() => new Map(base.dimensions.map((d) => [d.id, d.name])), [base.dimensions]);
  const candidates: Candidate[] = useMemo(
    () => published.map((i) => ({ id: i.id, code: i.code, name: i.name, description: i.description, fn: i.fn, stage: i.stage, dimensionName: i.dimensionId ? dimName.get(i.dimensionId) ?? null : null })),
    [published, dimName],
  );

  const sourcePeriods = useMemo(() => {
    const periods = [...new Set((sources.data ?? []).filter((f) => f.source === "p1p2p3").map((f) => f.period))].sort();
    const out = new Map<string, string[]>();
    if (!periods.length) return out;
    const codes = new Set((settings.data?.sourceMap.p1p2p3 ?? []).map((c) => c.toUpperCase()));
    for (const i of published) if (codes.has(i.code)) out.set(i.id, periods);
    return out;
  }, [sources.data, settings.data, published]);

  const toPilo = (i: (typeof published)[number]): PiloIndicator => ({
    id: i.id,
    code: i.code,
    name: i.name,
    fn: i.fn,
    stage: i.stage,
    dimensionName: i.dimensionId ? dimName.get(i.dimensionId) ?? null : null,
    cesu: i.cesu,
    programReports: i.programReports,
    mandatory: i.mandatory,
  });

  const engineInput = useMemo(() => {
    const years = new Map<string, number[]>();
    for (const v of values.data ?? []) {
      if (!v.programId || (v.valueNum === null && !v.valueText && !v.notApplicable)) continue;
      years.set(v.indicatorId, [...(years.get(v.indicatorId) ?? []), v.year]);
    }
    const pillar = new Map(base.pillars.map((p) => [p.id, p]));
    const alignments = new Map<string, string[]>();
    for (const a of catalog.alignments) {
      if (!a.confirmed && a.origin === "motor") continue;
      const label = a.target === "pilar" ? `Pilar ${pillar.get(a.pillarId ?? "")?.position ?? ""}`.trim() : `ODS ${a.sdg}`;
      alignments.set(a.indicatorId, [...(alignments.get(a.indicatorId) ?? []), label]);
    }
    return {
      indicators: published.map(toPilo),
      adopted,
      years,
      sourcePeriods,
      alignments,
      weights: settings.data?.weights ?? DEFAULT_WEIGHTS,
      peers: new Map((peers.data ?? []).map((p) => [p.indicatorId, p])),
      preferData: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [published, adopted, values.data, sourcePeriods, catalog.alignments, base.pillars, settings.data, peers.data]);

  const proposal = useMemo(() => (size ? recommend({ ...engineInput, goals, size }) : null), [engineInput, goals, size]);

  // Lo que pidió el programa entra con su razón, aunque el motor no lo hubiera elegido.
  const picks: PiloPick[] = useMemo(() => {
    const base = proposal?.picks ?? [];
    const extra: PiloPick[] = [];
    for (const [id, w] of wanted) {
      const ind = byId.get(id);
      if (!ind) continue;
      const inBase = base.find((p) => p.indicator.id === id);
      if (inBase) {
        if (!inBase.reasons.some((r) => r.startsWith("Lo pidió"))) inBase.reasons.unshift(`Lo pidió el programa: ${w.reason}`);
        continue;
      }
      extra.push({ indicator: toPilo(ind), score: 0, goalId: null, kept: adopted.has(id), mandatory: Boolean(ind.mandatory), chain: false, reasons: [`Lo pidió el programa: ${w.reason}`] });
    }
    return size ? [...base, ...extra] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, wanted, byId, adopted, size]);
  const locked = (p: PiloPick) => p.kept || p.mandatory;
  const chosen = picks.filter((p) => locked(p) || !off.has(p.indicator.id));
  const toAdd = chosen.filter((p) => !p.kept);

  const keptPicks: PiloPick[] = useMemo(
    () => [
      ...published.filter((i) => adopted.has(i.id)).map((i) => ({ indicator: toPilo(i), score: 0, goalId: null, kept: true, mandatory: false, chain: false, reasons: [] })),
      ...own.map((i) => ({ indicator: { id: i.id, code: i.code, name: i.name, fn: i.fn, stage: i.stage, dimensionName: null, cesu: [], programReports: true }, score: 0, goalId: null, kept: true, mandatory: false, chain: false, reasons: [] })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [published, adopted, own],
  );

  /* --- La conversación ----------------------------------------------------------- */
  const say = (from: Msg["from"], body: ReactNode, opts: { ai?: boolean; plain?: boolean } = {}) =>
    setMsgs((list) => [...list, { id: ++msgId.current, from, body, ...opts }]);
  const pilo = (body: ReactNode, opts: { ai?: boolean; plain?: boolean } = {}) => say("pilo", body, opts);

  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
    const last = log.querySelector<HTMLElement>(".pbc-msg:last-child");
    if (last && !reduced()) gsap.from(last, { autoAlpha: 0, y: 10, duration: 0.3, ease: "power3.out" });
  }, [msgs.length, busy]);

  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    pilo(
      <>
        <p>
          ¡Hola! Soy Mr. Pilo. Vamos a armar el plan de impacto de <b>{site.programName}</b> en {site.campusName}.
        </p>
        <p>
          Cuénteme con sus palabras qué quiere que el programa logre —por ejemplo, <i>«que nuestros graduados consigan empleo y que los estudiantes investiguen»</i>— o elija abajo por
          dónde empezar.
          {aiOn ? " Si escribe, lo relaciono con las fichas que ya existen." : ""}
        </p>
      </>,
      { plain: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goalPill = (id: string) => {
    const g = goalOf(id);
    return (
      <span key={id} className="pbc-gpill" data-fn={g.fn}>
        <i>{FN_CODE[g.fn]}</i>
        {g.title}
      </span>
    );
  };

  const withGoals = (list: string[]) => {
    let next = [...goals];
    for (const id of list) {
      if (next.includes(id)) continue;
      const fn = goalOf(id).fn;
      const same = next.filter((g) => goalOf(g).fn === fn);
      if (same.length >= GOALS_PER_FN.max) next = next.filter((g) => g !== same[0]);
      next.push(id);
    }
    return next;
  };

  /** Después de sumar impactos: pedir lo que falta, o el tamaño, o rehacer la propuesta. */
  const nextStep = (next: string[]) => {
    const missing = missingFunctions(next);
    if (missing.length) {
      setMood("atrevido");
      setFnTab(missing[0]);
      setTab("demostrar");
      pilo(
        <p>
          Para que la cadena explique cómo llega el programa a sus resultados, necesito al menos un impacto por función. Me falta <b>{missing.map((f) => FUNCTION_LABEL[f]).join(" y ")}</b>. ¿Qué quiere demostrar ahí?
        </p>,
      );
      return;
    }
    setMood("emocionado");
    if (!size) {
      pilo(
        <p>
          Ya tengo impactos en las tres funciones. <b>¿Cuántos indicadores puede reportar su equipo?</b>
        </p>,
      );
    } else {
      pilo(<p>Rehíce la propuesta con lo nuevo; mírela a la derecha.</p>);
    }
  };

  const think = async <T,>(work: () => Promise<T> | T, ms = 500): Promise<T> => {
    setBusy(true);
    setMood("pensar");
    try {
      const [out] = await Promise.all([Promise.resolve().then(work), new Promise((r) => setTimeout(r, reduced() ? 0 : ms))]);
      return out as T;
    } finally {
      setBusy(false);
    }
  };

  /* Escribir libremente. */
  const onText = async (text: string) => {
    say("me", text);
    const intent = detectIntent(text);
    if (intent) return onIntent(intent);
    const found = matchGoals(text).map((g) => g.id);
    const local = matchIndicators(text, candidates, 6);
    let summary = "";
    let usedAi = false;
    let aiGoals: string[] = [];
    let aiInds: { id: string; reason: string }[] = [];
    let aiFailed = "";
    await think(async () => {
      if (!aiOn) return;
      try {
        const pool = matchIndicators(text, candidates, 40).map((m) => m.item);
        const r = await interpretNeed({
          program: `${site.programName} (${site.campusName})`,
          text,
          goals: PILO_GOALS.map((g) => ({ id: g.id, fn: g.fn, title: g.title })),
          indicators: (pool.length ? pool : candidates.slice(0, 40)).map((i) => ({ id: i.id, code: i.code, name: i.name, fn: i.fn, stage: i.stage })),
        });
        usedAi = true;
        summary = r.summary;
        aiGoals = r.goals;
        aiInds = r.indicators;
      } catch (e) {
        aiFailed = (e as Error).message;
      }
    }, 700);

    const goalIds = [...new Set([...found, ...aiGoals])];
    const indMap = new Map<string, Wanted>();
    for (const m of local) indMap.set(m.item.id, { reason: `comparte «${m.hits.join("», «") || "palabras"}» con lo que escribió`, ai: false });
    for (const f of aiInds) indMap.set(f.id, { reason: f.reason || "responde a lo que pidió", ai: true });

    if (!goalIds.length && !indMap.size) {
      setMood("atrevido");
      pilo(
        <>
          <p>{summary || "No lo reconocí entre los impactos ni entre las fichas que ya existen."} ¿Me lo cuenta de otra forma, o elige abajo por función?</p>
          {aiFailed && <p className="pbc-note">No pude usar la IA ahora: {aiFailed}</p>}
        </>,
        { ai: usedAi },
      );
      return;
    }
    const next = withGoals(goalIds);
    setGoals(next);
    setWanted((w) => {
      const m = new Map(w);
      for (const [id, v] of indMap) if (!m.has(id)) m.set(id, v);
      return m;
    });
    setMood("emocionado");
    pilo(
      <>
        {summary ? <p>{summary}</p> : <p>Esto es lo que entendí de lo que escribió:</p>}
        {goalIds.length > 0 && <div className="pbc-tags">{goalIds.map(goalPill)}</div>}
        {indMap.size > 0 && (
          <>
            <p>Y estas fichas que ya existen responden a eso; las sumo a su propuesta:</p>
            <ul className="pbc-found">
              {[...indMap].map(([id, w]) => {
                const i = byId.get(id)!;
                return (
                  <li key={id}>
                    <b>
                      {i.code} · {i.name}
                    </b>
                    <small>
                      {FUNCTION_LABEL[i.fn]} · {STAGE_LABEL[i.stage]} · {w.reason}
                    </small>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {aiFailed && <p className="pbc-note">Lo entendí sin IA: {aiFailed}</p>}
      </>,
      { ai: usedAi },
    );
    nextStep(next);
  };

  /* Elegir un impacto de las sugerencias. */
  const onGoal = async (id: string) => {
    if (goals.includes(id)) return;
    say("me", goalOf(id).title);
    await think(() => undefined, 350);
    const next = withGoals([id]);
    setGoals(next);
    nextStep(next);
  };

  const onSize = async (n: number) => {
    say("me", `${PILO_SIZES.find((s) => s.n === n)?.name ?? ""} · ${n}`);
    await think(() => undefined, 800);
    setSize(n);
    setOff(new Set());
    setMood("emocionado");
    pilo(
      <p>
        Le propongo <b>{n} indicadores</b>, parejos entre las funciones y siempre con la cadena completa: insumos, procesos, productos e impacto real.
        {wanted.size ? ` Van también las ${wanted.size} fichas que usted pidió.` : ""} Puede quitar las que no le sirvan en el plan, o pedirme ajustes.
      </p>,
    );
  };

  /* Preguntas de análisis y ajustes. */
  const onIntent = async (intent: Intent) => {
    if (intent === "adoptar") return onAdopt();
    if (intent === "liviana") return onSize(12);
    if (intent === "porque") {
      await think(() => undefined, 400);
      setMood("emocionado");
      pilo(
        <p>
          Cada ficha entra por una razón, con los pesos que ajusta Planeación: <b>la cadena</b> (sin insumos, procesos, productos e impacto no se explica cómo llega el programa a
          sus resultados), <b>sus impactos</b>, <b>lo que usted pidió</b>, lo que ya siguen <b>programas parecidos</b> y lo que ya tiene <b>cifras</b>. En el plan, cada una dice la
          suya.
        </p>,
      );
      return;
    }
    if (intent.startsWith("mas:")) {
      const fn = intent.slice(4) as SubstantiveFunction;
      await think(() => undefined, 500);
      const wide = recommend({ ...engineInput, goals: goals.length ? goals : PILO_GOALS.filter((g) => g.fn === fn).slice(0, 1).map((g) => g.id), size: 36 });
      const add = wide.picks.filter((p) => p.indicator.fn === fn && !picks.some((x) => x.indicator.id === p.indicator.id) && !wanted.has(p.indicator.id)).slice(0, 2);
      setWanted((w) => {
        const m = new Map(w);
        add.forEach((p) => m.set(p.indicator.id, { reason: `pidió más de ${FUNCTION_LABEL[fn]}`, ai: false }));
        return m;
      });
      setMood("emocionado");
      pilo(add.length ? <p>Sumé {add.length} en {FUNCTION_LABEL[fn]}: {add.map((p) => `«${p.indicator.name}»`).join(" y ")}.</p> : <p>No encontré más fichas publicadas de {FUNCTION_LABEL[fn]} que no estén ya.</p>);
      if (!size) nextStep(goals);
      return;
    }
    if (intent === "estado") {
      await think(() => undefined, 700);
      const data = portal.data;
      if (!data) {
        setMood("atrevido");
        pilo(<p>No pude leer el cumplimiento del programa ahora{portal.isError ? `: ${errorText(portal.error)}` : ""}.</p>);
        return;
      }
      const rows = programStandings(data, site.programId, site.campusId);
      const c = countStandings(rows);
      const mine = metShare(c);
      const me = programsOf(data).find((p) => p.id === site.programId);
      const peersOfFaculty = me?.faculty ? programsOf(data).filter((p) => p.faculty?.id === me.faculty?.id) : [];
      const shares = peersOfFaculty.map((p) => metShare(countStandings(programStandings(data, p.id)))).filter((x): x is number => x !== null);
      const med = median(shares);
      const bars: [string, number, string][] = [
        ["Cumplidas", c.cumplida, "var(--status-done)"],
        ["En camino", c.en_camino, "var(--brand-blue)"],
        ["Rezagadas", c.rezagada, "var(--status-risk)"],
        ["Sin cifra", c.sin_cifra, "var(--ink-muted)"],
      ];
      const top = Math.max(1, ...bars.map((b) => b[1]));
      setMood(c.rezagada > c.cumplida ? "atrevido" : "emocionado");
      pilo(
        <>
          <p>
            {rows.length ? (
              <>
                De sus <b>{rows.length}</b> indicadores con meta 2026 en {site.campusName}: {c.cumplida} cumplidos, {c.en_camino} en camino, {c.rezagada} rezagados (por debajo del 70 % de
                su meta) y {c.sin_cifra} sin cifra, que no es lo mismo que cero.
              </>
            ) : (
              <>Todavía no tiene indicadores con meta en {site.campusName}; su plan empieza aquí.</>
            )}
          </p>
          {rows.length > 0 && (
            <div className="pbc-bars">
              {bars.map(([n, v, color]) => (
                <div key={n} className="pbc-bars__row">
                  <span>{n}</span>
                  <span className="pbc-bars__track">
                    <i style={{ width: `${(v / top) * 100}%`, background: color }} />
                  </span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          )}
          {mine !== null && (
            <p className="pbc-note">
              {mine} % de lo medido está cumplido{med !== null && me?.faculty ? `; la mediana de ${me.faculty.name} es ${Math.round(med)} %` : ""}.
            </p>
          )}
        </>,
      );
      return;
    }
    if (intent === "cadena") {
      await think(() => undefined, 500);
      const current = size ? chosen.concat(keptPicks.filter((k) => !chosen.some((c) => c.indicator.id === k.indicator.id))) : keptPicks;
      const gaps = chainGaps(current, FNS);
      setMood(gaps.length ? "atrevido" : "emocionado");
      pilo(
        gaps.length ? (
          <p>
            {size ? "Con la propuesta" : "Con lo que sigue hoy"}, a la cadena le {gaps.length === 1 ? "falta" : "faltan"}{" "}
            <b>{gaps.map((g) => `${FUNCTION_LABEL[g.fn]} · ${STAGE_LABEL[g.stage]}`).join(", ")}</b>.{!size ? " Por eso la propuesta que arme siempre lleva la cadena completa." : ""}
          </p>
        ) : (
          <p>La cadena está completa: cada función tiene insumos, procesos, productos e impacto real.</p>
        ),
      );
      return;
    }
    if (intent === "pares") {
      await think(() => undefined, 500);
      const top = (peers.data ?? [])
        .filter((p) => byId.has(p.indicatorId) && (p.faculty > 0 || p.all > 0))
        .sort((a, b) => b.faculty / Math.max(1, b.totalFaculty) - a.faculty / Math.max(1, a.totalFaculty) || b.all - a.all)
        .slice(0, 5);
      setMood("emocionado");
      pilo(
        top.length ? (
          <>
            <p>Lo que más siguen los programas parecidos (de su facultad, y luego de toda la universidad):</p>
            <ul className="pbc-found">
              {top.map((p) => (
                <li key={p.indicatorId}>
                  <b>{byId.get(p.indicatorId)!.name}</b>
                  <small>
                    {p.faculty} de {p.totalFaculty} en su facultad · {p.all} de {p.totalAll} en total{adopted.has(p.indicatorId) ? " · usted ya la sigue" : ""}
                  </small>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Todavía no hay programas parecidos con indicadores adoptados para comparar.</p>
        ),
      );
      return;
    }
    if (intent === "p1p2p3") {
      await think(() => undefined, 500);
      const last = [...(sources.data ?? [])].filter((f) => f.source === "p1p2p3").sort((a, b) => a.period.localeCompare(b.period)).at(-1);
      setMood("emocionado");
      pilo(
        last ? (
          <p>
            En los reportes P1P2P3 de <b>{last.period}</b>, {site.programName} en {site.campusName} tiene {pct(last.approvedRate)} de notas acumuladas aprobadas, promedio{" "}
            {last.averageGrade?.toLocaleString("es-CO", { maximumFractionDigits: 2 }) ?? "sin dato"}, y {pct(last.atRiskRate)} de sus estudiantes tuvo al menos un P1 por debajo de 3,0.
            {sourcePeriods.size ? " Con eso ya puede reportar las fichas que alimenta esa fuente." : ""}
          </p>
        ) : (
          <p>Todavía no hay reportes P1P2P3 cargados para {site.programName} en {site.campusName}.</p>
        ),
      );
    }
  };

  const onAdopt = async () => {
    if (!canEdit) {
      setMood("atrevido");
      pilo(<p>Solo quien edita el programa puede adoptar la propuesta. Puede compartirla con la dirección del programa.</p>);
      return;
    }
    if (!size) {
      pilo(<p>Primero armemos la propuesta: dígame cuántos indicadores puede reportar.</p>);
      return;
    }
    try {
      const count = await think(() => adopt.mutateAsync({ indicatorIds: toAdd.map((p) => p.indicator.id), programId: site.programId, campusId: site.campusId }), 600);
      setAdoptedNow(count);
      setMood("loco");
      window.setTimeout(() => setMood("emocionado"), 1600);
      pilo(
        <p>
          <b>¡Listo! {site.programName} adoptó {count} indicadores nuevos.</b> Quedan en «Mi programa» con su meta 2026 por sede. Cuando quiera, le cuento cómo van.
        </p>,
        { plain: true },
      );
    } catch (e) {
      setMood("atrevido");
      pilo(<p>No se pudo adoptar: {errorText(e)}</p>);
    }
  };

  /* --- Conexiones con el PDI y los ODS de lo elegido ------------------------------------ */
  const connections = useMemo(() => {
    const set = new Set((size ? chosen : [...wanted.keys()].map((id) => ({ indicator: { id } }))).map((p) => p.indicator.id));
    const pillars = new Map<string, number>();
    const ods = new Map<number, number>();
    for (const a of catalog.alignments) {
      if (!set.has(a.indicatorId) || (!a.confirmed && a.origin === "motor")) continue;
      if (a.target === "pilar" && a.pillarId) pillars.set(a.pillarId, (pillars.get(a.pillarId) ?? 0) + 1);
      if (a.target === "ods" && a.sdg) ods.set(a.sdg, (ods.get(a.sdg) ?? 0) + 1);
    }
    const pillar = new Map(base.pillars.map((p) => [p.id, p]));
    return {
      pillars: [...pillars].map(([id, n]) => ({ p: pillar.get(id), n })).filter((x) => x.p).sort((a, b) => b.n - a.n),
      ods: [...ods].sort((a, b) => b[1] - a[1]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.length, wanted, size, catalog.alignments, base.pillars]);

  /* --- El plan vivo: animaciones al cambiar ----------------------------------------------- */
  const planKey = `${goals.join(",")}|${size}|${wanted.size}|${adoptedNow}`;
  useLayoutEffect(() => {
    const root = planRef.current;
    if (!root || reduced()) return;
    const ctx = gsap.context(() => {
      gsap.from(".pbc-goal", { autoAlpha: 0, x: -8, duration: 0.28, stagger: 0.04, ease: "power3.out" });
      gsap.from(".pbc-cell:not([data-n='0'])", { scale: 0.7, autoAlpha: 0, duration: 0.32, stagger: 0.02, ease: "back.out(2)" });
      gsap.from(".pbc-item", { autoAlpha: 0, y: 6, duration: 0.26, stagger: 0.015, ease: "power3.out" });
    }, root);
    return () => ctx.revert();
  }, [planKey]);

  /* --- Las sugerencias ----------------------------------------------------------------------- */
  const stepNow = adoptedNow !== null ? 4 : size ? 3 : missingFunctions(goals).length ? 1 : 2;
  type Chip = { key: string; label: string; hint: string; used?: boolean; go: () => void };
  let chips: Chip[];
  if (tab === "saber") {
    chips = (
      [
        ["estado", "¿Cómo va mi programa?", "Cumplimiento frente a la meta 2026"],
        ["cadena", "¿Qué me falta en la cadena?", "Insumos, procesos, productos, impacto"],
        ["pares", "¿Qué siguen programas parecidos?", "Lo más adoptado"],
        ["p1p2p3", "¿Qué dicen mis cifras P1P2P3?", "Aprobación, promedio y alertas"],
      ] as [Intent, string, string][]
    ).map(([id, label, hint]) => ({ key: id, label, hint, go: () => { say("me", label); void onIntent(id); } }));
  } else if (stepNow === 2) {
    chips = PILO_SIZES.map((s) => ({ key: String(s.n), label: `${s.name} · ${s.n}`, hint: "recommended" in s && s.recommended ? "Recomendado" : s.perFn, go: () => void onSize(s.n) }));
  } else if (stepNow === 3) {
    chips = [
      { key: "masinv", label: "Más de Investigación", hint: "Dos más en esa función", go: () => { say("me", "Más de Investigación"); void onIntent("mas:investigacion"); } },
      { key: "masext", label: "Más de Extensión", hint: "Dos más en esa función", go: () => { say("me", "Más de Extensión"); void onIntent("mas:extension"); } },
      { key: "liviana", label: "Una opción más liviana", hint: "Lo esencial: 12", go: () => void onSize(12) },
      { key: "porque", label: "¿Por qué estos?", hint: "Qué pesó en cada uno", go: () => { say("me", "¿Por qué estos?"); void onIntent("porque"); } },
      { key: "adoptar", label: `Adoptar ${toAdd.length}`, hint: "Guardar en el programa", go: () => { say("me", "Adoptar la propuesta"); void onAdopt(); } },
    ];
  } else {
    chips = PILO_GOALS.filter((g) => g.fn === fnTab).map((g) => ({ key: g.id, label: g.title, hint: FUNCTION_LABEL[g.fn], used: goals.includes(g.id), go: () => void onGoal(g.id) }));
  }

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void onText(text);
  };

  const counts = useMemo(() => {
    const c = {} as Record<SubstantiveFunction, Record<Stage, number>>;
    for (const f of FNS) c[f] = { insumos: 0, procesos: 0, productos: 0, impacto: 0 };
    for (const p of chosen) c[p.indicator.fn][p.indicator.stage] += 1;
    return c;
  }, [chosen]);

  const titleId = "pbc-title";
  return (
    <PiloScene origin={origin} onClose={onClose} titleId={titleId}>
      <div className="pbc" data-tema={tema}>
        <header className="pbc-bar" data-anim>
          <div className="pbc-who">
            <b id={titleId}>Mr. Pilo Bot · {site.programName}</b>
            {site.campusName}
          </div>
          <ol className="pbc-steps" aria-label="Avance">
            {["Qué demostrar", "Cuánto reportar", "La propuesta", "Adoptar"].map((label, i) => (
              <li key={label} data-state={i + 1 < stepNow ? "done" : i + 1 === stepNow ? "now" : undefined} aria-current={i + 1 === stepNow ? "step" : undefined}>
                <i>{i + 1}</i>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <div className="pbc-temas" role="group" aria-label="Tema del escenario">
            {TEMAS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tema === t.id} onClick={() => setTema(t.id)}>
                <i data-t={t.id} />
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="pbc-guide" onClick={onClassic}>
            Guía por pasos
          </button>
          <button type="button" className="pbc-x" onClick={onClose} aria-label="Cerrar a Mr. Pilo Bot">
            <Icon name="close" size={16} />
          </button>
        </header>

        <section className="pbc-talk" aria-label="Conversación con Mr. Pilo">
          <div className="pbc-pilo">
            <span className="pbc-face">
              <PiloSvgMoji size={76} mood={mood} track idle alive label="Mr. Pilo" />
            </span>
            <div>
              <b>Mr. Pilo</b>
              <small>
                <i data-busy={busy || undefined} />
                {busy ? "Pensando…" : aiOn ? "Entiendo lo que escribe · con IA cuando hace falta" : "Listo para ayudarle"}
              </small>
            </div>
          </div>
          <div className="pbc-log" ref={logRef} aria-live="polite">
            {msgs.map((m) =>
              m.from === "me" ? (
                <div key={m.id} className="pbc-msg pbc-msg--me">
                  {m.body}
                </div>
              ) : (
                <div key={m.id} className="pbc-msg pbc-msg--pilo">
                  <img src={`${import.meta.env.BASE_URL}pilo-moods/feliz-160.webp`} alt="" width={28} height={28} />
                  <div className="pbc-bub">
                    {!m.plain && <span className="pbc-badge" data-ai={m.ai || undefined}>{m.ai ? "Lectura de Pilo · con IA" : "Sin IA"}</span>}
                    {m.body}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="pbc-msg pbc-msg--pilo">
                <img src={`${import.meta.env.BASE_URL}pilo-moods/piensa-160.webp`} alt="" width={28} height={28} />
                <span className="pbc-dots" aria-label="Pilo está pensando">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
          <div className="pbc-dock" data-anim>
            <div className="pbc-tabs" role="tablist">
              {(["demostrar", "saber"] as const).map((t) => (
                <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t === "demostrar" ? "Quiero demostrar…" : "Quiero saber…"}
                </button>
              ))}
              {tab === "demostrar" && stepNow === 1 && (
                <span className="pbc-fns">
                  {FNS.map((f) => (
                    <button key={f} type="button" aria-pressed={fnTab === f} data-fn={f} onClick={() => setFnTab(f)}>
                      <i />
                      {FUNCTION_LABEL[f]}
                    </button>
                  ))}
                </span>
              )}
            </div>
            <div className="pbc-chips">
              {chips.map((c) => (
                <button key={c.key} type="button" className="pbc-chip" data-used={c.used || undefined} disabled={busy || adoptedNow !== null} onClick={c.go}>
                  {c.label}
                  <small>{c.hint}</small>
                </button>
              ))}
            </div>
            <form
              className="pbc-composer"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label htmlFor="pbc-q" className="pbc-sr">
                Escriba a Mr. Pilo
              </label>
              <textarea
                id="pbc-q"
                rows={1}
                data-autofocus
                value={draft}
                maxLength={800}
                placeholder="Escriba lo que quiere lograr con su programa…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button type="submit" className="pbc-send" disabled={busy || !draft.trim() || adoptedNow !== null} aria-label="Enviar">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </form>
          </div>
        </section>

        <section className="pbc-plan" aria-label={`El plan de ${site.programName}`} data-anim>
          <div className="pbc-plan__head">
            <div>
              <h2>El plan de impacto de {site.programName}</h2>
              <small>Se arma mientras conversa, con las fichas y los datos del programa.</small>
            </div>
            <span className="pbc-draft" data-done={adoptedNow !== null || undefined}>
              {adoptedNow !== null ? `Adoptado · ${adoptedNow} nuevos` : "Borrador · nada se guarda hasta «Adoptar»"}
            </span>
          </div>
          <div className="pbc-plan__body" ref={planRef}>
            <section>
              <h3>
                1 · Lo que quiere demostrar <small>{goals.length} impactos</small>
              </h3>
              <div className="pbc-lanes">
                {FNS.map((f) => {
                  const list = goals.filter((g) => goalOf(g).fn === f);
                  return (
                    <div key={f} className="pbc-lane" data-fn={f}>
                      <h4>
                        <i />
                        {FUNCTION_LABEL[f]}
                      </h4>
                      {list.length ? (
                        list.map((g) => (
                          <div key={g} className="pbc-goal">
                            {goalOf(g).title}
                            <button type="button" aria-label={`Quitar ${goalOf(g).title}`} onClick={() => setGoals((x) => x.filter((y) => y !== g))} disabled={adoptedNow !== null}>
                              <Icon name="close" size={12} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="pbc-missing">Falta elegir al menos uno</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {wanted.size > 0 && (
              <section>
                <h3>
                  2 · Lo que pidió el programa <small>fichas que ya existen</small>
                </h3>
                <ul className="pbc-wanted">
                  {[...wanted].map(([id, w]) => {
                    const i = byId.get(id);
                    if (!i) return null;
                    return (
                      <li key={id} className="pbc-item" data-fn={i.fn}>
                        <span className="pbc-st">{STAGE_LABEL[i.stage]}</span>
                        <b>
                          {i.code} · {i.name}
                        </b>
                        <em>{w.ai ? "con IA · " : ""}{w.reason}</em>
                        <button
                          type="button"
                          aria-label={`Quitar ${i.name}`}
                          disabled={adoptedNow !== null}
                          onClick={() =>
                            setWanted((m) => {
                              const n = new Map(m);
                              n.delete(id);
                              return n;
                            })
                          }
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section>
              <h3>
                {wanted.size ? 3 : 2} · La cadena de valor <small>{size ? "cada casilla, cuántos indicadores" : "se llena con la propuesta"}</small>
              </h3>
              <div className="pbc-matrix">
                <span />
                {STAGES.map((s) => (
                  <span key={s}>{STAGE_LABEL[s]}</span>
                ))}
                {FNS.map((f) => (
                  <div key={f} className="pbc-row" data-fn={f}>
                    <span className="pbc-rowname">
                      <i />
                      {FUNCTION_LABEL[f]}
                    </span>
                    {STAGES.map((s) => (
                      <span key={s} className="pbc-cell" data-n={counts[f][s]}>
                        {counts[f][s] || "·"}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3>
                {wanted.size ? 4 : 3} · La propuesta <small>{size ? `${chosen.length} indicadores · ${toAdd.length} nuevos` : "aún no"}</small>
              </h3>
              {size ? (
                <div className="pbc-props">
                  {FNS.map((f) => {
                    const list = picks.filter((p) => p.indicator.fn === f);
                    return (
                      <div key={f} className="pbc-pgroup" data-fn={f}>
                        <h4>
                          <i />
                          {FUNCTION_LABEL[f]} · {list.filter((p) => locked(p) || !off.has(p.indicator.id)).length}
                        </h4>
                        <ol>
                          {list.map((p) => {
                            const out = !locked(p) && off.has(p.indicator.id);
                            return (
                              <li key={p.indicator.id} className="pbc-item" data-fn={f} data-off={out || undefined}>
                                <span className="pbc-st">{STAGE_LABEL[p.indicator.stage]}</span>
                                <b>
                                  {p.indicator.code} · {p.indicator.name}
                                </b>
                                <em title={p.reasons.join(" · ")}>{p.kept ? "Ya la sigue" : p.mandatory ? "Obligatoria" : p.chain ? "Cadena" : p.reasons[0] ?? ""}</em>
                                {!locked(p) && (
                                  <button
                                    type="button"
                                    aria-pressed={!out}
                                    aria-label={out ? `Volver a incluir ${p.indicator.name}` : `Quitar ${p.indicator.name}`}
                                    disabled={adoptedNow !== null}
                                    onClick={() =>
                                      setOff((s) => {
                                        const n = new Set(s);
                                        if (n.has(p.indicator.id)) n.delete(p.indicator.id);
                                        else n.add(p.indicator.id);
                                        return n;
                                      })
                                    }
                                  >
                                    <Icon name={out ? "plus" : "close"} size={12} />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="pbc-empty">Cuando elija cuánto puede reportar, aquí aparece la propuesta, ordenada por función y eslabón.</div>
              )}
            </section>

            <section>
              <h3>
                {wanted.size ? 5 : 4} · Con qué se conecta <small>el Plan de Desarrollo y los ODS</small>
              </h3>
              {connections.pillars.length || connections.ods.length ? (
                <div className="pbc-links">
                  {connections.pillars.map(({ p, n }) => (
                    <span key={p!.id} className="pbc-link">
                      <i>P{p!.position}</i>
                      {p!.name}
                      <small>· {n}</small>
                    </span>
                  ))}
                  {connections.ods.map(([o, n]) => (
                    <span key={o} className="pbc-link">
                      <i data-ods>ODS {o}</i>
                      {ODS_NAME[o] ?? ""}
                      <small>· {n}</small>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="pbc-empty">Cada ficha de su plan se conecta con los pilares del PDI y los ODS que tenga confirmados.</div>
              )}
            </section>
          </div>
          <div className="pbc-plan__foot">
            <p>
              {adoptedNow !== null
                ? "Adoptado. Siga en «Mi programa» para fijar las metas por sede."
                : size
                  ? canEdit
                    ? "Puede ajustar la propuesta conversando o en esta lista antes de adoptarla."
                    : "Solo quien edita el programa puede adoptar."
                  : "Cuénteme qué quiere demostrar y aquí va apareciendo el plan."}
            </p>
            <button type="button" className="button-primary pbc-adopt" disabled={!size || !canEdit || !toAdd.length || adoptedNow !== null || busy} onClick={() => { say("me", "Adoptar la propuesta"); void onAdopt(); }}>
              {adoptedNow !== null ? "Adoptado" : `Adoptar ${toAdd.length || ""}`.trim()}
            </button>
          </div>
        </section>
      </div>
    </PiloScene>
  );
}
