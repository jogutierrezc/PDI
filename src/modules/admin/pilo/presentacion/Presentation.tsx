/* =============================================================================
   Intranet · Mr. Pilo con IA · La capa profunda de Pilo (presentación).

   Una pieza para proyectar, solo para la administración (/admin/mr-pilo/
   presentacion): cómo recorre Pilo su arquitectura bio-digital —las dos
   memorias (Hemisferio Estratégico de Planeación y Hemisferio Curricular de
   Enseñanza), las nuevas acciones que puede ejecutar (archivos, código, roles),
   sus filtros reflejos a 0 créditos, los puentes neuronales inter-hemisféricos y
   la red neuronal profunda de Gemma 4 31B (NVIDIA NIM)— hasta entregar una
   respuesta fundamentada y verificada.

   Nueve pasos que se avanzan con ← → (o espacio, o Re Pág / Av Pág); el
   último paso abre el explorador interactivo del cerebro de Mr. Pilo.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { usePillars, useProjects, useStructure } from "../../../../data/queries";
import { useOpenDataCatalog } from "../../../datos-abiertos/data/open-data";
import { OBS_TOPICS } from "../../../datos-abiertos/observatorio/data";
import {
  ALL_SOURCES,
  buildModel,
  createStage,
  SOURCE_ORDER,
  SOURCES,
  STEP_COUNT,
  TEACH_SOURCE_ORDER,
} from "./engine";
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

  return {
    data,
    loading: pillars.isPending || structure.isPending || projects.isPending,
    error: pillars.isError || structure.isError || projects.isError,
  };
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

  const initialOn = useMemo(() => {
    const map = {} as Record<SourceKey, boolean>;
    for (const k of ALL_SOURCES) map[k] = true;
    return map;
  }, []);

  const [on, setOn] = useState<Record<SourceKey, boolean>>(initialOn);
  const [bridgesOn, setBridgesOn] = useState(true);

  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLElement>(null);
  const stage = useRef<StageHandle | null>(null);
  const last = useRef(-1);

  useEffect(() => {
    const before = document.title;
    document.title = "La capa profunda de Mr. Pilo · Planeación Institucional UDES";
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
        gsap.from(story.current!.children, {
          autoAlpha: 0,
          y: back ? -8 : 10,
          filter: "blur(3px)",
          duration: 0.38,
          stagger: 0.05,
          ease: "power2.out",
        });
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
      /* sin pantalla completa */
    }
  };

  const toggle = (k: SourceKey) => {
    const next = !on[k];
    setOn((o) => ({ ...o, [k]: next }));
    stage.current?.toggleSource(k, next);
  };

  const toggleBridges = () => {
    const next = !bridgesOn;
    setBridgesOn(next);
    stage.current?.toggleBridges(next);
  };

  const steps: Step[] = model
    ? [
        // 0. El cerebro dual de Mr. Pilo
        {
          short: "El cerebro",
          title: "El cerebro de Mr. Pilo: dos memorias interconectadas",
          body: (
            <>
              Mr. Pilo opera como un cerebro bio-digital organizado en <b>dos hemisferios complementarios</b>: el{" "}
              <b>Hemisferio Estratégico</b> (Planeación Institucional: PDI, Cifras, Observatorio, Boletines e Impacto) y el{" "}
              <b>Hemisferio Curricular</b> (Enseñanza: innovación pedagógica, lineamientos, políticas, ODS y aulas Moodle).
              Juntos suman <b>{model.counts.totalNodes} nodos neuronales</b> vinculados por sinapsis activas.
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "12px" }}>
              <div className="cpp-hemi-group">
                <span className="cpp-hemi-title">
                  <i style={{ background: "#b592e6" }} /> Hemisferio Estratégico · Planeación
                </span>
                <div className="cpp-chips">
                  {SOURCE_ORDER.map((k) => (
                    <span key={k} className="cpp-chip">
                      <i style={{ background: SOURCES[k].color }} />
                      {SOURCES[k].name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="cpp-hemi-group">
                <span className="cpp-hemi-title">
                  <i style={{ background: "#38bdf8" }} /> Hemisferio Curricular · Enseñanza
                </span>
                <div className="cpp-chips">
                  {TEACH_SOURCE_ORDER.map((k) => (
                    <span key={k} className="cpp-chip">
                      <i style={{ background: SOURCES[k].color }} />
                      {SOURCES[k].name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="cpp-meter">
                <div>
                  <b>{model.counts.nodes}</b>
                  <small>nodos Planeación</small>
                </div>
                <div>
                  <b>{model.counts.teachNodes}</b>
                  <small>nodos Enseñanza</small>
                </div>
                <div>
                  <b>{model.counts.bridges}</b>
                  <small>puentes neuronales</small>
                </div>
              </div>
            </div>
          ),
        },

        // 1. Nuevas capacidades y acciones
        {
          short: "Acciones",
          title: "Nuevas capacidades: archivos, código y roles",
          body: (
            <>
              La nueva generación de Mr. Pilo amplía su alcance cognitivo con <b>acciones avanzadas</b> que van más allá
              de la consulta básica de texto, diseñadas para la productividad académica y administrativa.
            </>
          ),
          extra: (
            <div className="cpp-actions-grid">
              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cpp-cyan)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  Archivos adjuntos
                </b>
                <span>Lectura y extracción local segura de PDFs y hojas de cálculo (hasta 10 MB) sin almacenar ni filtrar datos.</span>
              </div>

              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Generación de código
                </b>
                <span>Explicación y desarrollo de scripts analíticos (SQL, TypeScript, fórmulas y métricas) para docentes y gestión.</span>
              </div>

              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Personalización por rol
                </b>
                <span>Voz y tono calibrados para estudiantes, profesores, directivos o personal administrativo con microexpresiones acordes.</span>
              </div>

              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  Cifras vivas auditadas
                </b>
                <span>Integración en vivo con pilo_facts: verificación matemática estricta sin redondeos ni alucinaciones numéricas.</span>
              </div>
            </div>
          ),
        },

        // 2. Llega una pregunta
        {
          short: "Pregunta",
          title: "Llega una pregunta: el estímulo sináptico",
          body: (
            <>
              La interacción comienza con un impulso sensorial: una persona escribe en lenguaje natural. Antes de activar
              inferencia profunda o gastar créditos, la señal viaja velozmente por los filtros reflejos del núcleo central.
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "10px" }}>
              <div className="cpp-q">{model.question}</div>
              <span className="cpp-badge" style={{ alignSelf: "flex-start" }}>
                Estímulo sensorial inicial · Entrada de señal
              </span>
            </div>
          ),
        },

        // 3. Catálogo y reglas
        {
          short: "Filtros 0cr",
          layer: 1,
          title: "Filtros reflejos: velocidad y 0 créditos",
          body: (
            <>
              El <b>catálogo oficial</b> (respuestas institucionales firmadas y capciosas) y las <b>reglas duras</b>{" "}
              (dinero, protección de datos personales, límites éticos) responden en menos de <b>40 ms</b>. Si la consulta
              no coincide con una respuesta predeterminada, continúa sin fricción hacia la memoria profunda.
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "8px" }}>
              <div className="cpp-credits">
                Costo en créditos: <b>0 créditos consumidos</b>
              </div>
              <div className="cpp-meter">
                <div>
                  <b>&lt; 40 ms</b>
                  <small>tiempo de respuesta</small>
                </div>
                <div>
                  <b>100%</b>
                  <small>respuestas oficiales firmadas</small>
                </div>
              </div>
            </div>
          ),
        },

        // 4. Respuestas guardadas y activación de pasajes
        {
          short: "Pasajes",
          layer: 2,
          title: "Activación sináptica: pasajes encendidos",
          body: (
            <>
              Si una respuesta previa sigue fresca, Pilo la sirve sin demora. Si no, la búsqueda semántica y vectorial
              despierta los pasajes pertinentes en ambos hemisferios. En la corteza se iluminan las neuronas asociadas al
              núcleo conceptual de <b>{model.focus?.name ?? "la pregunta"}</b>.
            </>
          ),
          extra: (
            <div className="cpp-meter">
              <div>
                <b>{model.matches.size}</b>
                <small>pasajes encendidos</small>
              </div>
              <div>
                <b>{model.counts.totalNodes}</b>
                <small>neuronas en la red</small>
              </div>
              <div>
                <b>2</b>
                <small>hemisferios activos</small>
              </div>
            </div>
          ),
        },

        // 5. Los puentes neuronales
        {
          short: "Puentes",
          layer: 3,
          title: "Puentes neuronales: interconexión entre hemisferios",
          body: (
            <>
              Lo institucional y lo pedagógico no funcionan en silos. Los <b>puentes neuronales</b> (migración 0122)
              unen Planeación y Enseñanza mediante reglas cruzadas: <b>ODS 4</b>, <b>Ley 30 de 1992</b>, <b>Decreto 1330</b> y
              resultados de aprendizaje. Permiten la <b>lectura «de visita»</b>: Pilo consulta el otro hemisferio indicando su procedencia exacta.
            </>
          ),
          extra: (
            <div className="cpp-neural-card">
              <span className="cpp-badge cpp-badge--bridge">Puente Neuronal Aprobado · Conexión 0122</span>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--cpp-ink)" }}>
                ⚡ <b>PR1 / LA21 ↔ ODS 4 y Resultados de Aprendizaje:</b> El proyecto institucional aterriza directamente
                en las directivas curriculares y el aula Moodle.
              </p>
              <div className="cpp-credits">
                Trazabilidad: <b>Procedencia de visita garantizada</b>
              </div>
            </div>
          ),
        },

        // 6. Cortex Gemma 4 31B
        {
          short: "Gemma 31B",
          layer: 4,
          title: "Cortex neuronal profundo: Gemma 4 31B (NVIDIA)",
          body: (
            <>
              Cuando la consulta exige correlacionar datos dispersos entre ambos hemisferios y redactar con criterio, entra
              en acción <b>Gemma 4 31B</b> vía <b>NVIDIA NIM</b>. Sus 31 mil millones de parámetros orquestan la atención
              sináptica multi-cabeza, conectando los fragmentos activados bajo un principio rector: <b>grounding estricto</b>, sin inventar cifras ni alucinar.
            </>
          ),
          extra: (
            <div className="cpp-neural-card">
              <span className="cpp-badge cpp-badge--gemma">NVIDIA NIM · google/gemma-4-31b-it</span>
              <div style={{ display: "grid", gap: "4px", fontSize: "0.85rem" }}>
                <div>
                  <b style={{ color: "#fbbf24" }}>Arquitectura:</b> Red de atención neuronal de 31B parámetros
                </div>
                <div>
                  <b style={{ color: "var(--cpp-cyan)" }}>Inferencia:</b> Aceleración por tensor cores en la nube
                </div>
                <div>
                  <b style={{ color: "#a78bfa" }}>Verificación:</b> Ponderación factual anclada 100% a las fuentes
                </div>
              </div>
            </div>
          ),
        },

        // 7. La respuesta fundamentada
        {
          short: "Respuesta",
          layer: 5,
          title: "La respuesta fundamentada emerge de la red",
          body: (
            <>
              La respuesta final es el resultado armónico de la malla, los puentes inter-hemisféricos y la síntesis
              neuronal de Gemma 4 31B. Cada afirmación incluye su cita numérica verificable, su procedencia institucional y la garantía de exactitud.
            </>
          ),
          extra: (
            <div className="cpp-ans">
              <span className="cpp-badge">Respuesta fundamentada · Síntesis multi-hemisferio</span>
              <p>
                {model.answer} <span className="cpp-cite">1</span> <span className="cpp-cite">2</span>
              </p>
              <div className="cpp-credits">
                Sello de autenticidad: <b>Fuentes institucionales UDES verificadas</b>
              </div>
            </div>
          ),
        },

        // 8. Explorar el cerebro de Mr. Pilo
        {
          short: "Explorar",
          title: "Explore el cerebro de Mr. Pilo",
          body: (
            <>
              Pase el puntero sobre cualquier neurona para inspeccionar su ruta completa, hemisferio y procedencia; haga
              clic para fijarla. Use los controles a continuación para filtrar fuentes y alternar la visibilidad de los puentes neuronales.
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "10px" }}>
              <div className="cpp-chips">
                <button
                  type="button"
                  className="cpp-chip cpp-chip--bridge"
                  aria-pressed={bridgesOn}
                  data-off={!bridgesOn || undefined}
                  onClick={toggleBridges}
                >
                  <i style={{ background: "#fbbf24" }} />
                  {bridgesOn ? "Puentes neuronales (visibles)" : "Puentes neuronales (ocultos)"}
                </button>
              </div>

              <span className="cpp-hemi-title" style={{ marginTop: "4px" }}>
                Filtrar fuentes en la red:
              </span>
              <div className="cpp-chips">
                {ALL_SOURCES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="cpp-chip"
                    aria-pressed={on[k]}
                    data-off={!on[k] || undefined}
                    onClick={() => toggle(k)}
                  >
                    <i style={{ background: SOURCES[k].color }} />
                    {SOURCES[k].name}
                  </button>
                ))}
              </div>
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
          Planeación Institucional & Vicerrectoría de Enseñanza · UDES
        </div>
        <span className="cpp-tag">Malla neuronal de 2 hemisferios · Puentes 0122 · Gemma 4 31B</span>
        <button className="cpp-ghost" type="button" onClick={fullscreen}>
          Pantalla completa
        </button>
        <Link className="cpp-ghost" to="/admin/mr-pilo?seccion=memoria">
          Salir
        </Link>
      </header>

      <section className="cpp-story" ref={story} aria-live="polite" key={step}>
        {!model ? (
          <p>
            {error
              ? "No se pudo leer la estructura del plan. Revise la conexión y vuelva a abrir la presentación."
              : loading
                ? "Leyendo la arquitectura neuronal de Mr. Pilo…"
                : "No hay datos para presentar."}
          </p>
        ) : current ? (
          <>
            {current.layer ? (
              <div className="cpp-layer">
                <i>{current.layer}</i>Capa cognitiva {current.layer} de 5
              </div>
            ) : null}
            <h1>{current.title}</h1>
            <p>{current.body}</p>
            {current.extra}
          </>
        ) : null}
      </section>

      <div className="cpp-stage" ref={host}>
        <canvas ref={canvas} role="img" aria-label="Malla cerebral y neuronal de Mr. Pilo con dos hemisferios y Gemma 4 31B" />
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
          <button
            className="cpp-round"
            type="button"
            aria-label="Paso anterior"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            className="cpp-round cpp-round--main"
            type="button"
            aria-label="Paso siguiente"
            disabled={step === STEP_COUNT - 1}
            onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}
          >
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
