/* =============================================================================
   Portal de Impacto · el mapa de red de un programa (SVG, sin librería).

   Como el de la herramienta anterior: pasar sobre un indicador ilumina sus
   vecinos y apaga lo demás; un clic lo fija (otro clic o Esc lo suelta);
   «Solo cruces entre funciones» o «Todas las conexiones»; la leyenda de
   pilares y ODS filtra; el buscador encuentra por código o nombre; + y −
   acercan. Además, el indicador fijado abre su ficha, y la lista de
   conexiones sirve a quien no ve el dibujo.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, STAGE_LABEL } from "../model";
import type { PortalData } from "./data";
import { edgePath, layoutNetwork, neighbours, programNetwork } from "./network";
import type { NetEdge } from "./network";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.2;
const themeTone = (i: number) => `var(--od-line-${(i % 11) + 1})`;

export function ProgramNetwork({
  data,
  programId,
  programName,
  campusId,
  onOpen,
}: {
  data: PortalData;
  programId: string;
  programName: string;
  campusId: string | null;
  onOpen: (indicatorId: string) => void;
}) {
  const net = useMemo(() => programNetwork(data, programId, campusId), [data, programId, campusId]);
  const layout = useMemo(() => layoutNetwork(net.nodes), [net.nodes]);
  const [mode, setMode] = useState<"cruce" | "todas">("cruce");
  const [theme, setTheme] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);

  const crossEdges = net.edges.filter((e) => e.cross);
  const edges: NetEdge[] = mode === "cruce" ? crossEdges : net.edges;
  const toneOf = new Map(net.themes.map((t, i) => [t.key, themeTone(i)]));
  const byId = new Map(net.nodes.map((n) => [n.id, n]));
  const linked = new Set(net.edges.flatMap((e) => [e.a, e.b]));

  // Qué se ilumina: el nodo fijado o bajo el cursor, el tema elegido o la búsqueda.
  const focus = pinned ?? hover;
  const lit = useMemo(() => {
    if (focus) return new Set([focus, ...neighbours(edges, focus)]);
    if (theme) return new Set(edges.filter((e) => e.keys.includes(theme)).flatMap((e) => [e.a, e.b]));
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = net.nodes.filter((n) => n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)).map((n) => n.id);
      return new Set(hits.flatMap((id) => [id, ...neighbours(edges, id)]));
    }
    return null;
  }, [focus, theme, query, edges, net.nodes]);
  const edgeLit = (e: NetEdge) => (focus ? e.a === focus || e.b === focus : theme ? e.keys.includes(theme) : lit ? lit.has(e.a) && lit.has(e.b) : false);

  if (!net.nodes.length) {
    return <p className="ipo-muted">El programa aún no tiene indicadores{campusId ? " en esta sede" : ""}: sin ellos no hay red que dibujar.</p>;
  }

  const vb = layout.viewBox;
  const selected = focus ? byId.get(focus) : undefined;
  const selectedEdges = selected ? edges.filter((e) => e.a === selected.id || e.b === selected.id) : [];
  const keyLabel = (k: string) => (k === "ficha" ? "su ficha relacionada" : net.themes.find((t) => t.key === k)?.label ?? k);
  const pick = (id: string) => setPinned((p) => (p === id ? null : id));
  const onNodeKey = (event: KeyboardEvent, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(id);
    } else if (event.key === "Escape") setPinned(null);
  };

  return (
    <div className="inet">
      <div className="inet__bar">
        <ul className="inet__stats" aria-label="Resumen de la red">
          <li>
            <b>{net.nodes.length}</b> indicadores
          </li>
          <li>
            <b>{net.themes.length}</b> pilares y ODS en común
          </li>
          <li>
            <b>{crossEdges.length}</b> cruces entre funciones
          </li>
          <li>
            <b>{net.edges.length}</b> conexiones
          </li>
        </ul>
        <div className="ipo-pills" role="group" aria-label="Conexiones">
          <button type="button" aria-pressed={mode === "cruce"} onClick={() => setMode("cruce")}>
            Solo cruces entre funciones <small>{crossEdges.length}</small>
          </button>
          <button type="button" aria-pressed={mode === "todas"} onClick={() => setMode("todas")}>
            Todas las conexiones <small>{net.edges.length}</small>
          </button>
        </div>
        <label className="inet__search">
          <span className="sr-only">Buscar un indicador en la red</span>
          <input type="search" value={query} placeholder="Buscar por código o nombre" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="inet__zoom" role="group" aria-label="Acercar o alejar">
          <button type="button" aria-label="Alejar" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.2))}>
            −
          </button>
          <button type="button" aria-label="Acercar" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.2))}>
            +
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPinned(null);
              setTheme(null);
              setQuery("");
            }}
          >
            Restablecer
          </button>
        </div>
      </div>

      <div className="inet__stage" onClick={(e) => e.target === e.currentTarget && setPinned(null)}>
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          style={{ width: `${zoom * 100}%`, minWidth: `${Math.round(vb.w * 0.72 * zoom)}px` }}
          role="group"
          aria-label={`Mapa de red de ${programName}: ${net.nodes.length} indicadores unidos por ${net.edges.length} conexiones de pilares y ODS en común.`}
          onClick={(e) => e.target === e.currentTarget && setPinned(null)}
        >
          <g className="inet__hubedges">
            {net.nodes.map((n) => {
              const p = layout.nodes.get(n.id)!;
              return <line key={n.id} x1={p.x} y1={p.y} x2={layout.hub.x} y2={layout.hub.y} data-fade={(lit && !lit.has(n.id)) || undefined} />;
            })}
          </g>
          <g className="inet__edges">
            {edges.map((e) => {
              const a = layout.nodes.get(e.a)!;
              const b = layout.nodes.get(e.b)!;
              const on = edgeLit(e);
              return (
                <path
                  key={`${e.a}-${e.b}`}
                  d={edgePath(a, b, e.cross, layout.hub)}
                  data-kind={e.kind}
                  data-on={on || undefined}
                  data-fade={(lit && !on) || undefined}
                  style={on ? ({ "--edge": e.kind === "ficha" ? "var(--brand-navy)" : toneOf.get(theme && e.keys.includes(theme) ? theme : e.keys[0]) } as CSSProperties) : undefined}
                >
                  <title>
                    {byId.get(e.a)?.code} ↔ {byId.get(e.b)?.code} · {e.keys.map(keyLabel).join(", ")}
                  </title>
                </path>
              );
            })}
          </g>
          {FUNCTIONS.map((f) => (
            <text key={f} className="inet__fn" x={layout.titles[f].x} y={layout.titles[f].y} textAnchor={layout.titles[f].anchor} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
              {FUNCTION_LABEL[f]}
            </text>
          ))}
          <g className="inet__hub" aria-hidden="true">
            <circle cx={layout.hub.x} cy={layout.hub.y} r={13} />
            <text x={layout.hub.x} y={layout.hub.y - 20} textAnchor="middle">
              {programName.length > 30 ? `${programName.slice(0, 29)}…` : programName}
            </text>
          </g>
          <g className="inet__nodes">
            {net.nodes.map((n) => {
              const p = layout.nodes.get(n.id)!;
              return (
                <g
                  key={n.id}
                  className="inet__node"
                  role="button"
                  tabIndex={0}
                  aria-pressed={pinned === n.id}
                  aria-label={`${n.code} · ${n.name}. ${FUNCTION_LABEL[n.fn]}, ${STAGE_LABEL[n.stage]}${n.own ? ", propio del programa" : ""}.`}
                  data-own={n.own || undefined}
                  data-alone={!linked.has(n.id) || undefined}
                  data-fade={(lit && !lit.has(n.id)) || undefined}
                  data-pinned={pinned === n.id || undefined}
                  style={{ "--tone": FUNCTION_TONE[n.fn] } as CSSProperties}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => pick(n.id)}
                  onKeyDown={(e) => onNodeKey(e, n.id)}
                >
                  <circle cx={p.x} cy={p.y} r={14} className="inet__hit" />
                  <circle cx={p.x} cy={p.y} r={7.2} />
                  <text x={p.lx} y={p.ly} textAnchor={p.anchor}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="inet__foot">
        <div className="inet__legend">
          <span className="inet__legend-title">Función</span>
          {FUNCTIONS.map((f) => (
            <span key={f} className="inet__swatch" style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
              <i aria-hidden="true" /> {FUNCTION_LABEL[f]}
            </span>
          ))}
          <span className="inet__swatch" data-own>
            <i aria-hidden="true" /> Propio del programa
          </span>
          <span className="inet__swatch" data-hub>
            <i aria-hidden="true" /> El programa
          </span>
        </div>
        {net.themes.length > 0 ? (
          <div className="inet__legend" role="group" aria-label="Filtrar por pilar u ODS">
            <span className="inet__legend-title">Lo que comparten</span>
            {net.themes.map((t, i) => (
              <button
                key={t.key}
                type="button"
                className="inet__theme"
                aria-pressed={theme === t.key}
                title={t.hint || undefined}
                style={{ "--edge": themeTone(i) } as CSSProperties}
                onClick={() => setTheme((v) => (v === t.key ? null : t.key))}
              >
                <i aria-hidden="true" /> {t.label} <small>{t.edges}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="ipo-muted">Sus indicadores aún no comparten pilares ni ODS confirmados: por eso solo se unen al programa.</p>
        )}
      </div>

      {selected && (
        <div className="inet__detail" role="status" style={{ "--tone": FUNCTION_TONE[selected.fn] } as CSSProperties}>
          <div>
            <span className="inet__detail-code">
              {selected.code} · {FUNCTION_LABEL[selected.fn]} · {STAGE_LABEL[selected.stage]}
              {selected.own ? " · propio del programa" : ""}
            </span>
            <strong>{selected.name}</strong>
            <span>
              {selectedEdges.length
                ? `Se une con ${selectedEdges.length} ${selectedEdges.length === 1 ? "indicador" : "indicadores"} por ${[...new Set(selectedEdges.flatMap((e) => e.keys))].map(keyLabel).join(", ")}.`
                : "Sin hilo con otros indicadores en esta vista: solo se une al programa."}
            </span>
          </div>
          <button type="button" className="button-secondary" onClick={() => onOpen(selected.id)}>
            Ver ficha
          </button>
        </div>
      )}

      <details className="inet__list">
        <summary>Ver las conexiones como lista</summary>
        <ul>
          {net.nodes.map((n) => {
            const mine = net.edges.filter((e) => e.a === n.id || e.b === n.id);
            return (
              <li key={n.id}>
                <button type="button" className="oda-link-button" onClick={() => onOpen(n.id)}>
                  {n.code} · {n.name}
                </button>
                {mine.length
                  ? `: con ${mine.map((e) => `${byId.get(e.a === n.id ? e.b : e.a)?.code} (${e.keys.map(keyLabel).join(", ")})`).join("; ")}.`
                  : ": sin conexiones."}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
