/* =============================================================================
   Intranet · Mr. Pilo con IA · La capa profunda de Pilo (presentación).

   Una pieza para proyectar, solo para la administración (/admin/mr-pilo/
   presentacion): cómo recorre Pilo sus capas —catálogo, reglas, respuestas
   guardadas, pasajes y la malla— hasta responder, sobre la estructura real y
   en vivo del Plan de Desarrollo, los informes de UDES en Cifras y los temas
   del Observatorio. Ocho pasos que se avanzan con ← → (o espacio, o Re Pág /
   Av Pág de un control de presentaciones); el último deja explorar la malla.

   Ocupa toda la pantalla, sin la barra de la intranet; Escape o «Salir»
   vuelven a la configuración de Mr. Pilo. El dibujo y el movimiento están en
   engine.ts; aquí, los datos y el texto de cada paso.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { usePillars, useProjects, useStructure } from "../../../../data/queries";
import { useOpenDataCatalog } from "../../../datos-abiertos/data/open-data";
import { OBS_TOPICS } from "../../../datos-abiertos/observatorio/data";
import { buildModel, createStage, SOURCE_ORDER, SOURCES, STEP_COUNT } from "./engine";
import type { PresentationData, SourceKey, StageHandle } from "./engine";
import "./presentation.css";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const MONEY = /dinero|peso|\$|cop\b|millones|presupuest/i;

/** Los datos del plan con la numeración del Mapa numerado (P1 › AE3 › LA12 › PR4). */
function usePresentationData(): { data: PresentationData | null; loading: boolean; error: boolean } {
  const pillars = usePillars();
  const structure = useStructure();
  const projects = useProjects();
  const catalog = useOpenDataCatalog();
  const data = useMemo(() => {
    if (!pillars.data || !structure.data || !projects.data) return null;
    const ordered = pillars.data.filter((p) => p.status === "publicado" && !MONEY.test(p.name)).sort((a, b) => a.position - b.position);
    const pIndex = new Map(ordered.map((p, i) => [p.id, i]));
    const areas = structure.data.filter((a) => pIndex.has(a.pillar_id)).sort((a, b) => pIndex.get(a.pillar_id)! - pIndex.get(b.pillar_id)! || a.position - b.position);
    const out: PresentationData = {
      pillars: ordered.map((p, i) => ({ code: `P${i + 1}`, name: p.name })),
      areas: [],
      lines: [],
      projects: [],
      reports: (catalog.data?.reports ?? []).map((r) => ({ code: r.code, name: r.name })),
      obs: OBS_TOPICS.map((t) => t.name),
    };
    const areaIndex = new Map<string, number>();
    const lineIndex = new Map<string, number>();
    for (const a of areas) {
      areaIndex.set(a.id, out.areas.length);
      out.areas.push({ code: `AE${out.areas.length + 1}`, name: a.name, p: pIndex.get(a.pillar_id)! });
      for (const l of [...(a.action_lines ?? [])].sort((x, y) => x.position - y.position)) {
        lineIndex.set(l.id, out.lines.length);
        out.lines.push({ code: `LA${out.lines.length + 1}`, name: l.name, a: areaIndex.get(a.id)! });
      }
    }
    for (const r of [...projects.data].sort((a, b) => a.position - b.position)) {
      if (MONEY.test(r.name)) continue;
      const to: ["l" | "a", number][] = [];
      for (const link of r.links ?? []) {
        if (link.action_line_id && lineIndex.has(link.action_line_id)) to.push(["l", lineIndex.get(link.action_line_id)!]);
        else if (link.area_id && areaIndex.has(link.area_id)) to.push(["a", areaIndex.get(link.area_id)!]);
      }
      if (to.length) out.projects.push({ code: `PR${out.projects.length + 1}`, name: r.name, to });
    }
    return out;
  }, [pillars.data, structure.data, projects.data, catalog.data]);
  return { data, loading: pillars.isPending || structure.isPending || projects.isPending, error: pillars.isError || structure.isError || projects.isError };
}

interface Step {
  short: string;
  layer?: number;
  title: string;
  body: ReactNode;
  extra?: ReactNode;
}

export function Presentation() {
  const navigate = useNavigate();
  const { data, loading, error } = usePresentationData();
  const model = useMemo(() => (data ? buildModel(data) : null), [data]);
  const [step, setStep] = useState(0);
  const [on, setOn] = useState<Record<SourceKey, boolean>>({ pdi: true, cifras: true, obs: true, bol: true, imp: true });
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLElement>(null);
  const stage = useRef<StageHandle | null>(null);
  const last = useRef(-1);

  useEffect(() => {
    const before = document.title;
    document.title = "La capa profunda de Pilo · Planeación UDES";
    return () => {
      document.title = before;
    };
  }, []);

  useEffect(() => {
    if (!model || !canvas.current || !host.current || !tip.current) return;
    const s = createStage(canvas.current, host.current, tip.current, model, reduced());
    stage.current = s;
    last.current = -1;
    return () => {
      s.destroy();
      stage.current = null;
    };
  }, [model]);

  useLayoutEffect(() => {
    const s = stage.current;
    if (!s) return;
    s.step(step);
    s.setExplore(step === STEP_COUNT - 1);
    const back = step < last.current;
    last.current = step;
    if (!reduced() && story.current) {
      const ctx = gsap.context(() => {
        gsap.from(story.current!.children, { autoAlpha: 0, y: back ? -10 : 12, filter: "blur(4px)", duration: 0.45, stagger: 0.06, ease: "power3.out" });
      }, story);
      return () => ctx.revert();
    }
  }, [step, model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      } else if (e.key === "Home") setStep(0);
      else if (e.key === "End") setStep(STEP_COUNT - 1);
      else if (e.key === "Escape" && !document.fullscreenElement) navigate("/admin/mr-pilo?seccion=memoria");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const fullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* sin pantalla completa: se presenta igual */
    }
  };

  const toggle = (k: SourceKey) => {
    const next = !on[k];
    setOn((o) => ({ ...o, [k]: next }));
    stage.current?.toggleSource(k, next);
  };

  const chips = (
    <div className="cpp-chips">
      {SOURCE_ORDER.map((k) => (
        <span key={k} className="cpp-chip">
          <i style={{ background: SOURCES[k].color }} />
          {SOURCES[k].name}
        </span>
      ))}
    </div>
  );

  const steps: Step[] = model
    ? [
        {
          short: "La memoria",
          title: "Lo que Pilo sabe, visto por dentro",
          body: (
            <>
              Cada punto es algo que la universidad publica: un pilar, una línea de acción, un informe, un tema. Hoy son <b>{model.counts.nodes} nodos</b> y{" "}
              <b>{model.counts.edges} relaciones</b>, y todos salen de los portales.
            </>
          ),
          extra: chips,
        },
        {
          short: "La pregunta",
          title: "Llega una pregunta",
          body: "Alguien le escribe a Pilo en sus propias palabras. Antes de pensar en IA, la pregunta atraviesa capas que no gastan créditos.",
          extra: <div className="cpp-q">{model.question}</div>,
        },
        {
          short: "Catálogo y reglas",
          layer: 1,
          title: "Primero, lo que Planeación ya escribió",
          body: (
            <>
              El <b>catálogo</b> (respuestas oficiales y microexpresiones para capciosas) y las <b>reglas</b> (dinero, datos personales, el futuro) responden al instante. Esta
              pregunta no coincide: sigue de largo.
            </>
          ),
          extra: (
            <div className="cpp-credits">
              Costo hasta aquí: <b>0 créditos</b>
            </div>
          ),
        },
        {
          short: "Guardadas",
          layer: 2,
          title: "Después, lo que ya respondió",
          body: "Si alguien preguntó casi lo mismo y sus fuentes no han cambiado, Pilo repite esa respuesta. Si una fuente cambia, la respuesta guardada deja de servirse sola.",
          extra: (
            <div className="cpp-credits">
              Costo hasta aquí: <b>0 créditos</b>
            </div>
          ),
        },
        {
          short: "Pasajes",
          layer: 3,
          title: "Los pasajes: textos sueltos",
          body: (
            <>
              Por debajo, la memoria es un conjunto de pasajes: textos cortos con su página, su corte y su oficina. Pilo los busca por palabras, en español y sin tildes. Se
              encienden los que hablan de <b>{model.focus?.name ?? "la pregunta"}</b>.
            </>
          ),
          extra: (
            <div className="cpp-meter">
              <div>
                <b>{model.matches.size}</b>
                <small>pasajes encendidos</small>
              </div>
              <div>
                <b>{model.counts.nodes}</b>
                <small>pasajes en total</small>
              </div>
            </div>
          ),
        },
        {
          short: "La malla",
          layer: 4,
          title: "La malla: cada pasaje en su lugar",
          body: (
            <>
              Los pasajes se ordenan en la malla, la misma del Mapa numerado: <b>Pilar › Área estratégica › Línea de acción › Proyecto</b>. El pasaje encontrado deja de estar
              suelto: Pilo ve su ruta completa y todo lo que toca.
            </>
          ),
          extra: (
            <div className="cpp-meter">
              <div>
                <b>{model.focusLines}</b>
                <small>líneas de acción</small>
              </div>
              <div>
                <b>{model.focusPillars.length}</b>
                <small>pilares</small>
              </div>
              <div>
                <b>1</b>
                <small>proyecto</small>
              </div>
            </div>
          ),
        },
        {
          short: "La respuesta",
          layer: 5,
          title: "La respuesta sale de la malla",
          body: "Como es una pregunta de estructura, Pilo responde con la malla misma, sin redactar con IA. La IA (el anillo punteado) solo entra cuando hay que escribir con varios pasajes, y aun así cada cifra se revisa contra las fuentes.",
          extra: (
            <div className="cpp-ans">
              <span className="cpp-badge">De la malla de la memoria · sin IA</span>
              <p>
                {model.answer} <span className="cpp-cite">1</span>
              </p>
              <div className="cpp-credits">
                Costo total: <b>0 créditos</b>
              </div>
            </div>
          ),
        },
        {
          short: "Explorar",
          title: "Explore la malla",
          body: "Pase el puntero por un nodo para ver su ruta y lo que contiene; haga clic para fijarlo. Filtre por fuente con los botones.",
          extra: (
            <div className="cpp-chips">
              {SOURCE_ORDER.map((k) => (
                <button key={k} type="button" className="cpp-chip" aria-pressed={on[k]} data-off={!on[k] || undefined} onClick={() => toggle(k)}>
                  <i style={{ background: SOURCES[k].color }} />
                  {SOURCES[k].name}
                </button>
              ))}
            </div>
          ),
        },
      ]
    : [];
  const current = steps[step];

  return (
    <div className="cpp">
      <header className="cpp-top">
        <div className="cpp-brand">
          <b>Mr. Pilo · La capa profunda</b>
          Planeación Institucional · UDES
        </div>
        <span className="cpp-tag">Datos en vivo del PDI, UDES en Cifras y el Observatorio</span>
        <button className="cpp-ghost" type="button" onClick={fullscreen}>
          Pantalla completa
        </button>
        <Link className="cpp-ghost" to="/admin/mr-pilo?seccion=memoria">
          Salir
        </Link>
      </header>

      <section className="cpp-story" ref={story} aria-live="polite" key={step}>
        {!model ? (
          <p>{error ? "No se pudo leer la estructura del plan. Revise la conexión y vuelva a abrir la presentación." : loading ? "Leyendo la estructura del plan…" : "No hay datos para presentar."}</p>
        ) : current ? (
          <>
            {current.layer ? (
              <div className="cpp-layer">
                <i>{current.layer}</i>Capa {current.layer} de 5
              </div>
            ) : null}
            <h1>{current.title}</h1>
            <p>{current.body}</p>
            {current.extra}
          </>
        ) : null}
      </section>

      <div className="cpp-stage" ref={host}>
        <canvas ref={canvas} role="img" aria-label="La malla de la memoria de Mr. Pilo" />
        <div className="cpp-tip" ref={tip} />
      </div>

      <nav className="cpp-rail" aria-label="Pasos de la presentación">
        <div className="cpp-steps">
          {(steps.length ? steps : Array.from({ length: STEP_COUNT }, () => ({ short: "" }) as Step)).map((s, i) => (
            <button
              key={i}
              type="button"
              className="cpp-step"
              aria-current={i === step ? "step" : undefined}
              aria-label={`Paso ${i + 1}${s.short ? `: ${s.short}` : ""}`}
              style={{ ["--f" as string]: i <= step ? 1 : 0 }}
              onClick={() => setStep(i)}
            >
              <i />
              <span>{s.short}</span>
            </button>
          ))}
        </div>
        <div className="cpp-nav">
          <button className="cpp-round" type="button" aria-label="Paso anterior" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button className="cpp-round cpp-round--main" type="button" aria-label="Paso siguiente" disabled={step === STEP_COUNT - 1} onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <span className="cpp-keys">← → para avanzar · Esc para salir</span>
      </nav>
    </div>
  );
}
