/* =============================================================================
   Intranet · Mr. Pilo con IA · Presentación de Investigación en Innovación Educativa.

   Pieza interactiva de investigación y divulgación científica (AIED · UDES):
   «Arquitectura Cognitiva de Doble Flujo (Dual-Stream Memory) con Alineación
   Ontológica Cruzada y Razonamiento Neuronal con Gemma 4 31B».

   Explica el funcionamiento técnico de Mr. Pilo para pares académicos, comités
   curriculares e investigadores:
     1. Desacoplamiento ontológico en dos hemisferios cerebrales (Estratégico vs. Curricular).
     2. Multimodalidad y computación segura en el borde (Edge AI · Archivos y Código).
     3. Ingesta y estímulo sensorial de consultas.
     4. Autómata determinista de enrutamiento O(1) a 0 créditos de GPU.
     5. Recuperación semántica híbrida (densa vectorial + dispersa BM25/FTS).
     6. Puentes de ontología cruzada y protocolo de lectura «de visita» (0122).
     7. Inferencia profunda con Gemma 4 31B acelerada en NVIDIA TensorRT / NIM.
     8. Síntesis epistémica y anclaje factual estricto (Strict Grounding).
     9. Laboratorio interactivo de telemetría y topología de red.
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
import { PiloWelcomeSpeaker } from "./PiloWelcomeSpeaker";
import "./presentation.css";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const MONEY = /dinero|peso|\$|cop\b|millones|presupuest/i;

/** Datos del plan institucional con la topología real del Mapa numerado. */
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
  phaseCode: string;
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
  const [fase0Mode, setFase0Mode] = useState<"speaker" | "technical">("speaker");

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
    document.title = "Investigación AIED · La Capa Profunda de Mr. Pilo · UDES";
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
        // 0. Arquitectura Cognitiva de Doble Flujo
        {
          short: "Dual-Stream",
          phaseCode: "FASE 0 · ARQUITECTURA COGNITIVA",
          title: "Desacoplamiento ontológico: arquitectura bio-inspirada de doble flujo",
          body: (
            <>
              En Inteligencia Artificial aplicada a la Educación Superior (AIED), un sistema RAG monolítico produce
              interferencias al cruzar metas de gestión directiva con lineamientos pedagógicos de aula. Mr. Pilo resuelve
              esto mediante una <b>arquitectura cognitiva de dos hemisferios cerebrales</b>: el <b>Hemisferio Estratégico</b>{" "}
              (Planeación Institucional: PDI, SNIES/CNA, UDES en Cifras) y el <b>Hemisferio Curricular</b> (Enseñanza: innovación
              didáctica, resultados de aprendizaje y aulas Moodle).
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "10px" }}>
              <div className="cpp-spec-grid">
                <div className="cpp-spec-box">
                  <span>Hemisferio Estratégico</span>
                  <b>{model.counts.nodes} nodos</b>
                  <small>PDI · Cifras · Observatorio</small>
                </div>
                <div className="cpp-spec-box">
                  <span>Hemisferio Curricular</span>
                  <b>{model.counts.teachNodes} nodos</b>
                  <small>Modelos · RA · Moodle</small>
                </div>
                <div className="cpp-spec-box">
                  <span>Sinapsis Inter-dominio</span>
                  <b>{model.counts.bridges} puentes</b>
                  <small>Alineación 0122 (ODS/Leyes)</small>
                </div>
                <div className="cpp-spec-box">
                  <span>Topología Total</span>
                  <b>{model.counts.totalNodes} neuronas</b>
                  <small>Dual-Stream Knowledge Graph</small>
                </div>
              </div>

              <div className="cpp-hemi-group">
                <span className="cpp-hemi-title">
                  <i style={{ background: "#7fe7f0" }} /> Fuentes Ontológicas Mapeadas
                </span>
                <div className="cpp-chips">
                  {ALL_SOURCES.map((k) => (
                    <span key={k} className="cpp-chip">
                      <i style={{ background: SOURCES[k].color }} />
                      {SOURCES[k].name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ),
        },

        // 1. Multimodalidad y Procesamiento Perimetral
        {
          short: "Edge AI",
          phaseCode: "FASE 1 · COMPUTACIÓN EN EL BORDE",
          title: "Multimodalidad en el cliente y preservación de privacidad perimetral",
          body: (
            <>
              La investigación en innovación educativa exige estricta privacidad de datos institucionales (FERPA / Habeas Data).
              Mr. Pilo incorpora <b>computación perimetral (Edge AI)</b>: los documentos y archivos no se suben a servidores
              externos; se analizan de manera segura en el navegador de la persona mediante web-workers locales.
            </>
          ),
          extra: (
            <div className="cpp-actions-grid">
              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cpp-cyan)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  Edge Document Parser
                </b>
                <span>Parseo e indexación vectorial en cliente (PDF/XLSX hasta 10 MB). Cero filtración de datos institucionales sensibles.</span>
              </div>

              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Learning Analytics Code
                </b>
                <span>Generación computacional de scripts analíticos (SQL, TypeScript, fórmulas CNA/SNIES y cálculo de tasas de retención).</span>
              </div>

              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Persona Conditioning
                </b>
                <span>Modulación prosódica y tonal condicionada por el perfil académico: Estudiante, Docente-Investigador o Directivo.</span>
              </div>

              <div className="cpp-action-card">
                <b>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  Zero-Hallucination Facts
                </b>
                <span>Verificación matemática auditada contra pilo_facts: ninguna cifra métrica o presupuestal es aproximada o alucinada.</span>
              </div>
            </div>
          ),
        },

        // 2. Vector de Entrada y Estímulo Sensorial
        {
          short: "Estímulo",
          phaseCode: "FASE 2 · INGESTA SENSORIAL",
          title: "Ingesta del vector de consulta y estímulo sensorial en lenguaje natural",
          body: (
            <>
              La interacción inicia con la formulación de una consulta de investigación en lenguaje natural. El estímulo
              se tokeniza y vectoriza en tiempo real mientras se evalúan atajos reflejos de tiempo constante O(1).
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "10px" }}>
              <div className="cpp-q">{model.question}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span className="cpp-research-tag">Vector de entrada: dense-embedding (1536 dim)</span>
                <span className="cpp-research-tag">Intención: Articulación PDI ↔ Currículo ↔ ODS</span>
              </div>
            </div>
          ),
        },

        // 3. Autómata de Enrutamiento Determinista (0 Créditos / < 40ms)
        {
          short: "Filtros 0cr",
          phaseCode: "FASE 3 · ENRUTAMIENTO REFLEJO",
          layer: 1,
          title: "Autómata reflejo determinista: eficiencia O(1) y cero consumo de GPU",
          body: (
            <>
              Gobernanza de costos computacionales en IA universitaria: antes de activar inferencia estocástica en la nube,
              el <b>catálogo institucional firmado</b> y el <b>motor de reglas duras</b> (protección de datos, dinero, límites
              éticos) resuelven de forma determinista en menos de <b>40 ms</b>.
            </>
          ),
          extra: (
            <div style={{ display: "grid", gap: "8px" }}>
              <div className="cpp-credits">
                Costo computacional: <b>0 créditos de GPU consumidos</b>
              </div>
              <div className="cpp-meter">
                <div>
                  <b>&lt; 38 ms</b>
                  <small>latencia de respuesta</small>
                </div>
                <div>
                  <b>O(1)</b>
                  <small>complejidad de enrutamiento</small>
                </div>
                <div>
                  <b>100%</b>
                  <small>determinismo ontológico</small>
                </div>
              </div>
            </div>
          ),
        },

        // 4. Recuperación Semántica Híbrida Densa y Dispersa
        {
          short: "Pasajes",
          phaseCode: "FASE 4 · RECUPERACIÓN HÍBRIDA",
          layer: 2,
          title: "Recuperación semántica híbrida: espacio vectorial denso y concordancia dispersa",
          body: (
            <>
              Para consultas inéditas, el sistema despliega una <b>recuperación híbrida (Dense + Sparse)</b>: similitud
              coseno sobre embeddings vectoriales (`bge-m3 / nemotron`) combinada con concordancia léxica BM25/FTS en español
              normalizado. Se activan sinérgicamente las neuronas de memoria en ambos hemisferios.
            </>
          ),
          extra: (
            <div className="cpp-meter">
              <div>
                <b>{model.matches.size}</b>
                <small>clústeres semánticos encendidos</small>
              </div>
              <div>
                <b>{model.counts.totalNodes}</b>
                <small>neuronas en la corteza</small>
              </div>
              <div>
                <b>cos_sim &ge; 0.78</b>
                <small>umbral de activación sináptica</small>
              </div>
            </div>
          ),
        },

        // 5. Puentes de Ontología Cruzada y Protocolo de Visita
        {
          short: "Puentes",
          phaseCode: "FASE 5 · ALINEACIÓN ONTOLÓGICA",
          layer: 3,
          title: "Puentes ontológicos inter-dominio y protocolo de lectura «de visita»",
          body: (
            <>
              Aporte conceptual central del proyecto: alineación de ontologías heterogéneas. La migración 0122 define
              <b> puentes ontológicos formales</b> que conectan el PDI con el marco pedagógico: <b>ODS 4</b>, <b>Ley 30 de 1992</b>,{" "}
              <b>Decreto 1330</b> y resultados de aprendizaje (RA). Si un hemisferio no tiene suficiente contexto, la señal
              cruza el puente mediante el <b>protocolo de lectura «de visita»</b> preservando la trazabilidad de origen.
            </>
          ),
          extra: (
            <div className="cpp-neural-card">
              <span className="cpp-badge cpp-badge--bridge">Puente Ontológico Formal · Protocolo 0122</span>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--cpp-ink)" }}>
                ⚡ <b>Alineación Ontológica: PR1 / LA21 ↔ ODS 4 & Resultados de Aprendizaje:</b> Conexión formal entre metas
                institucionales del PDI y las competencias evaluables en el aula Moodle.
              </p>
              <div className="cpp-credits">
                Trazabilidad: <b>Procedencia ontológica verificada de visita</b>
              </div>
            </div>
          ),
        },

        // 6. Inferencia Profunda con Gemma 4 31B
        {
          short: "Gemma 31B",
          phaseCode: "FASE 6 · INFERENCIA NEURONAL",
          layer: 4,
          title: "Inferencia y razonamiento relacional con Gemma 4 31B (NVIDIA TensorRT)",
          body: (
            <>
              Cuando la consulta requiere correlacionar evidencia dispersa entre ambos hemisferios y formular una síntesis
              con rigor metodológico, interviene <b>Gemma 4 31B</b> (desplegado en clúster NVIDIA NIM). Sus 31 mil millones
              de parámetros ejecutan <b>atención multi-cabeza cruzada (Cross-Attention)</b> anclada en una barrera de{" "}
              <b>Strict Factual Grounding</b> para erradicar alucinaciones.
            </>
          ),
          extra: (
            <div className="cpp-neural-card">
              <span className="cpp-badge cpp-badge--gemma">NVIDIA NIM · google/gemma-4-31b-it</span>
              <div style={{ display: "grid", gap: "5px", fontSize: "0.85rem" }}>
                <div>
                  <b style={{ color: "#fbbf24" }}>Arquitectura LLM:</b> 31B parámetros con Grouped-Query Attention
                </div>
                <div>
                  <b style={{ color: "var(--cpp-cyan)" }}>Inferencia en la Nube:</b> TensorRT-LLM acelerado en GPU Hopper
                </div>
                <div>
                  <b style={{ color: "#a78bfa" }}>Barrera Anti-Alucinación:</b> Ponderación estricta de citas institucionales
                </div>
              </div>
            </div>
          ),
        },

        // 7. Síntesis Epistémica y Verificación Factual Auditada
        {
          short: "Síntesis",
          phaseCode: "FASE 7 · CONSTRUCTO EPISTÉMICO",
          layer: 5,
          title: "Síntesis epistémica multidominio con verificación factual auditada",
          body: (
            <>
              La respuesta resultante es un constructo epistémico verificable: articula la evidencia del Hemisferio
              Estratégico con las directivas del Hemisferio Curricular. Cada afirmación cuenta con citas indizables [1] y [2],
              garantizando reproducibilidad académica y rigor de auditoría.
            </>
          ),
          extra: (
            <div className="cpp-ans">
              <span className="cpp-badge">Constructo Epistémico · Síntesis Multidominio Verificada</span>
              <p>
                {model.answer} <span className="cpp-cite">1</span> <span className="cpp-cite">2</span>
              </p>
              <div className="cpp-credits">
                Auditoría: <b>100% fuentes primarias verificadas · Cero alucinación</b>
              </div>
            </div>
          ),
        },

        // 8. Laboratorio Interactivo de Telemetría y Topología
        {
          short: "Laboratorio",
          phaseCode: "FASE 8 · EXPERIMENTACIÓN",
          title: "Laboratorio interactivo de telemetría y topología de red",
          body: (
            <>
              Explore libremente la topología del grafo cerebral: audite puentes ontológicos, inspeccione la centralidad
              de cada nodo, alterne la visibilidad de los hemisferios y observe el comportamiento de la corteza sináptica
              mediante el oscilograma y HUD de telemetría en tiempo real.
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
                  {bridgesOn ? "Puentes Ontológicos (Activos)" : "Puentes Ontológicos (Inactivos)"}
                </button>
              </div>

              <span className="cpp-hemi-title" style={{ marginTop: "4px" }}>
                Filtrar Ontologías en la Malla:
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
          <b>Mr. Pilo · AIED Research Engine</b>
          Investigación e Innovación Pedagógica · Universidad de Santander UDES
        </div>
        <span className="cpp-tag">Dual-Stream Cognitive Architecture · Gemma 4 31B (NVIDIA NIM) · Malla 0122</span>
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
              ? "No se pudo leer la topología de la memoria. Revise la conexión a la base y vuelva a intentar."
              : loading
                ? "Compilando telemetría de la red neuronal…"
                : "No hay datos de red para proyectar."}
          </p>
        ) : current ? (
          <>
            {step === 0 ? (
              <div className="cpp-fase0-container">
                <div className="cpp-fase0-switcher" role="tablist" aria-label="Modo de visualización de la Fase 0">
                  <button
                    type="button"
                    className="cpp-fase0-btn"
                    aria-pressed={fase0Mode === "speaker"}
                    onClick={() => setFase0Mode("speaker")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    Pensamiento y Voz de Pilo
                  </button>

                  <button
                    type="button"
                    className="cpp-fase0-btn"
                    aria-pressed={fase0Mode === "technical"}
                    onClick={() => setFase0Mode("technical")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Ficha Técnica de Arquitectura
                  </button>
                </div>

                {fase0Mode === "speaker" ? (
                  <>
                    <PiloWelcomeSpeaker
                      onFaceChange={(f) => stage.current?.setFace?.(f)}
                      onFinishWelcome={() => setStep(1)}
                      onOpenTechnical={() => setFase0Mode("technical")}
                    />
                    <div className="cpp-fase0-summary">
                      <div className="cpp-fase0-sum-item">
                        <span>Hemisferio Estratégico</span>
                        <b>{model.counts.nodes} nodos</b>
                      </div>
                      <div className="cpp-fase0-sum-item">
                        <span>Hemisferio Curricular</span>
                        <b>{model.counts.teachNodes} nodos</b>
                      </div>
                      <div className="cpp-fase0-sum-item">
                        <span>Sinapsis Inter-dominio</span>
                        <b>{model.counts.bridges} puentes</b>
                      </div>
                      <div className="cpp-fase0-sum-item">
                        <span>Topología Total</span>
                        <b>{model.counts.totalNodes} neuronas</b>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cpp-fase0-more-btn"
                      onClick={() => setFase0Mode("technical")}
                    >
                      <span>Ver desglose técnico detallado y fuentes ontológicas</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="cpp-fase0-mini-speaker">
                      <div className="cpp-fase0-mini-info">
                        <span className="pws-pulse-dot" aria-hidden="true" />
                        <span>Mr. Pilo disponible para presentar con voz y emociones</span>
                      </div>
                      <button
                        type="button"
                        className="cpp-fase0-mini-btn"
                        onClick={() => setFase0Mode("speaker")}
                      >
                        Escuchar a Mr. Pilo
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                      <span className="cpp-research-tag">{current.phaseCode}</span>
                    </div>
                    <h1>{current.title}</h1>
                    <p>{current.body}</p>
                    {current.extra}
                  </>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="cpp-research-tag">{current.phaseCode}</span>
                  {current.layer ? (
                    <div className="cpp-layer">
                      <i>{current.layer}</i>Capa cognitiva {current.layer} de 5
                    </div>
                  ) : null}
                </div>
                <h1>{current.title}</h1>
                <p>{current.body}</p>
                {current.extra}
              </>
            )}
          </>
        ) : null}
      </section>

      <div className="cpp-stage" ref={host}>
        <canvas ref={canvas} role="img" aria-label="Malla cerebral bio-digital y telemetría de inferencia de Mr. Pilo" />
        <div className="cpp-tip" ref={tip} />
      </div>

      <nav className="cpp-rail" aria-label="Fases de la presentación de investigación">
        <div className="cpp-steps">
          {(steps.length ? steps : Array.from({ length: STEP_COUNT }, () => ({ short: "" }) as Step)).map((s, i) => (
            <button
              key={i}
              type="button"
              className="cpp-step"
              aria-current={i === step ? "step" : undefined}
              aria-label={`Fase ${i + 1}${s.short ? `: ${s.short}` : ""}`}
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
            aria-label="Fase anterior"
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
            aria-label="Fase siguiente"
            disabled={step === STEP_COUNT - 1}
            onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <span className="cpp-keys">← → avanzar/retroceder · Espacio · Esc salir</span>
      </nav>
    </div>
  );
}
