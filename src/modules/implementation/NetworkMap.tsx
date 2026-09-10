/* =============================================================================
   Mapa numerado de relacionamiento · el lienzo

   El diseño de `Mapa_Red_Pilares_Proyectos.html`, con sus mismas piezas:
   columnas a la izquierda, curvas de Bézier entre ellas, resaltado de la cadena
   completa al posar el cursor, leyenda por pilar que aísla, búsqueda, zoom y
   una ficha flotante.

   Tres diferencias con el original, y las tres son deliberadas:

   1. Los datos salen de Supabase, no de un JSON pegado en el HTML. Añadir una
      línea de acción desde la intranet la dibuja aquí sin tocar código.

   2. Los colores son los del portal —`accentFor()` y los oficiales de cada
      ODS— en vez de la paleta suelta del prototipo. Los tokens del portal
      tienen su versión validada para el tema oscuro; unos hexadecimales fijos
      lo romperían, que es justo lo que el prototipo resolvía con su propio
      juego de variables.

   3. Hay una quinta columna, los ODS, que el prototipo no tenía.

   Sobre el movimiento del cursor: la ficha flotante se coloca escribiendo el
   estilo directamente sobre el nodo, sin pasar por el estado de React. Con
   `useState` en `mousemove`, cada píxel recorrido volvería a pintar las
   doscientas y pico curvas del mapa.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "../../components/ui/Icon";
import { formatBudget } from "../../data/pdi";
import { clip, indexNetwork, relatedTo, relatedToPillar, search } from "./network";
import type { Network, NetworkNode, Related } from "./network";

/** Dónde cae cada columna. Del diseño original, más la de ODS al final. */
const COL_X = { pilar: 300, area: 680, linea: 1225, proyecto: 1375, ods: 1920 } as const;
const MARGIN = 30;
const WIDTH = 2220;

/** Radio y tamaño de etiqueta por columna: el peso visual baja al bajar de
 *  nivel, que es lo que deja leer sesenta líneas sin que tapen a sus áreas. */
const SHAPE = {
  pilar: { r: 7, side: "end", perChar: 7.2 },
  area: { r: 4.5, side: "end", perChar: 6.0 },
  linea: { r: 3, side: "end", perChar: 5.7 },
  proyecto: { r: 7, side: "start", perChar: 6.6 },
  ods: { r: 6, side: "start", perChar: 5.7 },
} as const;

/** Tope de caracteres por etiqueta. Un nombre más largo invadiría la columna
 *  siguiente; completo sigue estando en la ficha flotante. */
const MAX_CHARS = { pilar: 46, area: 58, linea: 74, proyecto: 62, ods: 44 } as const;

export interface NetworkMapProps {
  network: Network;
  /** Los pilares de la leyenda, en el orden del plan. */
  legend: { id: string; name: string; color: string }[];
  /** Título accesible del lienzo. */
  label: string;
  /** Grosor de la curva según el valor: solo en el mapa de presupuesto. */
  weightByValue?: boolean;
  /** Nodos que la pestaña activa deja sin relaciones: se atenúan en vez de
   *  desaparecer, para que se vea qué falta. */
  dimmed?: Set<string>;
  /** Pie del lienzo. */
  footer: string;
}

export function NetworkMap({
  network,
  legend,
  label,
  weightByValue = false,
  dimmed,
  footer,
}: NetworkMapProps) {
  const [focus, setFocus] = useState<string | null>(null);
  const [pinnedPillar, setPinnedPillar] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => indexNetwork(network), [network]);

  // Qué se queda encendido. Manda el cursor; si no hay cursor, el pilar fijado
  // desde la leyenda; si no, la búsqueda. Null = el mapa entero.
  const found: Related | null = useMemo(() => {
    if (focus) return relatedTo(index, focus);
    if (pinnedPillar) return relatedToPillar(network, pinnedPillar);
    return search(network, index, query);
  }, [focus, pinnedPillar, query, network, index]);

  // Una búsqueda sin resultados apagaría el mapa entero, que se lee como una
  // pantalla rota. Se deja visible y se dice con palabras que no hay nada.
  const empty = found !== null && found.nodes.size === 0;
  const active = empty ? null : found;

  const maxValue = useMemo(
    () => Math.max(1, ...network.edges.map((item) => item.value)),
    [network.edges],
  );

  // El zoom con Ctrl + rueda se registra a mano: React marca `wheel` como
  // pasivo y `preventDefault()` dentro de un onWheel de JSX no detiene el zoom
  // del navegador.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setScale((current) => clamp(current + (event.deltaY < 0 ? 0.1 : -0.1)));
    };

    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  const height = network.height + MARGIN * 2;
  const yOf = (node: NetworkNode) => node.y + MARGIN;

  const showTooltip = (event: ReactMouseEvent) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.display = "block";
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  };

  const hideTooltip = () => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  };

  const hovered = focus ? index.byId.get(focus) : undefined;

  const reset = () => {
    setScale(1);
    setQuery("");
    setPinnedPillar(null);
    setFocus(null);
    if (wrapRef.current) {
      wrapRef.current.scrollTop = 0;
      wrapRef.current.scrollLeft = 0;
    }
  };

  return (
    <div className="netmap">
      <div className="netmap__legend" role="group" aria-label="Aislar un pilar del mapa">
        {legend.map((pillar) => {
          const on = pinnedPillar === pillar.id;
          return (
            <button
              key={pillar.id}
              type="button"
              className={`netmap__legend-item${pinnedPillar && !on ? " is-dim" : ""}`}
              aria-pressed={on}
              onClick={() => setPinnedPillar(on ? null : pillar.id)}
            >
              <span className="netmap__swatch" style={{ background: pillar.color }} aria-hidden="true" />
              {pillar.name}
            </button>
          );
        })}
      </div>

      <div className="netmap__toolbar">
        <label className="netmap__search">
          <span className="sr-only">Buscar en el mapa por código o nombre</span>
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            placeholder="Buscar por código o nombre (ej. LA12, PR4, Personalización)…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <button type="button" className="button-ghost" onClick={reset}>
          Restablecer vista
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Alejar"
          onClick={() => setScale((current) => clamp(current / 1.2))}
        >
          −
        </button>
        <span className="netmap__zoom" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Acercar"
          onClick={() => setScale((current) => clamp(current * 1.2))}
        >
          +
        </button>
      </div>

      {empty && (
        <p className="netmap__empty" role="status">
          Nada en el mapa coincide con «{query.trim()}». Prueba con un número (LA12, PR4) o con
          parte de un nombre.
        </p>
      )}

      <p className="netmap__columns" aria-hidden="true">
        Pilar (P) <i>·</i> Área estratégica (AE) <i>·</i> Línea de acción (LA) <i>·</i> Proyecto (PR){" "}
        <i>·</i> Objetivo de Desarrollo Sostenible (ODS)
      </p>

      <div className="netmap__wrap" ref={wrapRef}>
        <div className="netmap__stage" style={{ transform: `scale(${scale})` }}>
          <svg
            width={WIDTH}
            height={height}
            viewBox={`0 0 ${WIDTH} ${height}`}
            role="img"
            aria-label={label}
          >
            <g className="netmap__links">
              {network.edges.map((item) => {
                const from = index.byId.get(item.from);
                const to = index.byId.get(item.to);
                if (!from || !to) return null;
                const x1 = COL_X[from.column];
                const x2 = COL_X[to.column];
                const y1 = yOf(from);
                const y2 = yOf(to);
                const faded = active !== null && !active.edges.has(item.key);

                return (
                  <path
                    key={item.key}
                    className={`netmap__link${faded ? " is-faded" : ""}`}
                    d={curve(x1, y1, x2, y2)}
                    stroke={item.color}
                    strokeWidth={weightByValue ? 0.8 + (item.value / maxValue) * 4 : 1}
                  />
                );
              })}
            </g>

            <g className="netmap__nodes">
              {network.nodes.map((node) => {
                const shape = SHAPE[node.column];
                const x = COL_X[node.column];
                const y = yOf(node);
                const text = `${node.code}. ${clip(node.name, MAX_CHARS[node.column])}`;
                const width = text.length * shape.perChar;
                const labelX = shape.side === "end" ? x - shape.r - 8 : x + shape.r + 8;
                const faded = active !== null && !active.nodes.has(node.id);
                const isDim = dimmed?.has(node.id) ?? false;

                return (
                  <g
                    key={node.id}
                    className={`netmap__node netmap__node--${node.column}${faded ? " is-faded" : ""}${isDim ? " is-dim" : ""}`}
                    onMouseEnter={() => setFocus(node.id)}
                    onMouseLeave={() => {
                      setFocus(null);
                      hideTooltip();
                    }}
                    onMouseMove={showTooltip}
                  >
                    <title>
                      {node.code}. {node.name}
                    </title>
                    {/* El fondo de la etiqueta va debajo del texto y encima de
                        las curvas: sin él, sesenta nombres sobre doscientas
                        líneas de colores no se leen. */}
                    <rect
                      className="netmap__label-bg"
                      x={shape.side === "end" ? labelX - width - 4 : labelX - 4}
                      y={y - 8}
                      width={width + 8}
                      height={16}
                    />
                    <text
                      className="netmap__label"
                      x={labelX}
                      y={y + 4}
                      textAnchor={shape.side === "end" ? "end" : "start"}
                    >
                      {text}
                    </text>
                    <circle cx={x} cy={y} r={shape.r} fill={node.color} className="netmap__dot" />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* La ficha flotante vive fuera del SVG: así el zoom no la agranda y el
          texto se lee al mismo tamaño en todo el recorrido.

          `aria-hidden`: sigue al ratón y cambia con cada nodo que se roza. Un
          lector de pantalla la anunciaría en bucle, y lo que dice ya está en el
          <title> de cada nodo, que es donde toca. */}
      <div className="netmap__tooltip" ref={tooltipRef} aria-hidden="true">
        {hovered && (
          <>
            <strong>
              {hovered.code}. {hovered.name}
            </strong>
            {hovered.meta.map((line, i) => (
              <small key={i}>{line}</small>
            ))}
            {hovered.value > 0 && <small>Valor estimado: {formatBudget(hovered.value)}</small>}
          </>
        )}
      </div>

      <p className="netmap__footer">{footer}</p>
    </div>
  );
}

/** La curva del diseño: horizontal en los extremos, con el codo en el medio. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function clamp(value: number): number {
  return Math.min(3, Math.max(0.25, value));
}
