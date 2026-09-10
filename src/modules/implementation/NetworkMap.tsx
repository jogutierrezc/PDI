/* =============================================================================
   Mapa numerado de relacionamiento · el lienzo

   Un solo mapa. Antes eran dos —relaciones arriba, presupuesto abajo— y
   compartían el 95 % del dibujo: las mismas columnas, los mismos nodos y las
   mismas curvas, con la única diferencia de qué aristas quedaban en pie. Dos
   lienzos idénticos uno encima de otro obligaban a recorrer el mapa dos veces y
   a perder la selección al bajar. Ahora el presupuesto es una vista más del
   mismo mapa, y lo seleccionado sobrevive al cambio de vista: es justamente
   entonces cuando interesa —"esta línea, ¿tiene dinero detrás?"—.

   El diseño de `Mapa_Red_Pilares_Proyectos.html` se conserva pieza a pieza:
   columnas a la izquierda, curvas de Bézier, resaltado de la cadena completa,
   leyenda por pilar que aísla, búsqueda, zoom y ficha flotante.

   Dos diferencias con el prototipo, deliberadas: los datos salen de Supabase en
   vez de un JSON pegado en el HTML, y los colores son los tokens del portal
   —validados para el tema oscuro— en vez de hexadecimales fijos. Y una adición:
   la quinta columna, los ODS.

   Dos formas de seleccionar, y hacen falta las dos:

     · Pasar el cursor previsualiza. Es el gesto del diseño original y sirve
       para recorrer el mapa rápido.
     · Pulsar fija. El resaltado se queda al retirar el cursor, así que se puede
       cambiar de vista, buscar otra cosa o desplazarse sin perderlo. Se suelta
       pulsando otra vez, con Escape o con "Restablecer vista".

   Sobre el movimiento del cursor: la ficha flotante se coloca escribiendo el
   estilo directamente sobre el nodo, sin pasar por el estado de React. Con
   `useState` en `mousemove`, cada píxel recorrido volvería a pintar las
   doscientas y pico curvas del mapa.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "../../components/ui/Icon";
import { formatBudget } from "../../data/pdi";
import { clip, indexNetwork, relatedTo, relatedToPillar, search } from "./network";
import type { Network, NetworkColumn, NetworkNode, Related } from "./network";

/** Dónde cae cada columna. Del diseño original, más la de ODS al final. */
const COL_X = { pilar: 300, area: 680, linea: 1225, proyecto: 1375, ods: 1920 } as const;
const MARGIN = 30;
const WIDTH = 2220;

const COLUMN_ORDER: NetworkColumn[] = ["pilar", "area", "linea", "proyecto", "ods"];

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

const COLUMN_LABEL: Record<NetworkColumn, string> = {
  pilar: "Pilar",
  area: "Área estratégica",
  linea: "Línea de acción",
  proyecto: "Proyecto",
  ods: "Objetivo de Desarrollo Sostenible",
};

export interface NetworkMapProps {
  network: Network;
  /** Los pilares de la leyenda, en el orden del plan. */
  legend: { id: string; name: string; color: string }[];
  /** Título accesible del lienzo. */
  label: string;
  /** Grosor de la curva según el valor: solo en las vistas de presupuesto. */
  weightByValue?: boolean;
  /** Nodos que la vista activa deja sin relaciones: se atenúan en vez de
   *  desaparecer, para que se vea qué falta. */
  dimmed?: Set<string>;
  /** Pie del lienzo. */
  footer: string;
  /** Vuelve a pedir los datos. El mapa se dibuja con lo que hay en caché, y
   *  quien acaba de editar un proyecto en otra pestaña necesita forzarlo. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function NetworkMap({
  network,
  legend,
  label,
  weightByValue = false,
  dimmed,
  footer,
  onRefresh,
  refreshing = false,
}: NetworkMapProps) {
  /** Lo que se está rozando con el cursor. Previsualiza. */
  const [hover, setHover] = useState<string | null>(null);
  /** Lo que quedó fijado al pulsar. Sobrevive al cursor, a la búsqueda y al
   *  cambio de vista. Puede ser un nodo (`p:…`, `l:…`) o un pilar entero de la
   *  leyenda (`pillar:…`). */
  const [pinned, setPinned] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  /** Qué nodo recibe el foco del teclado. Un solo punto de tabulación para
   *  todo el mapa; dentro se navega con las flechas. */
  const [cursor, setCursor] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());

  const index = useMemo(() => indexNetwork(network), [network]);

  /** Los nodos de cada columna, de arriba abajo: es como se mueve el teclado. */
  const byColumn = useMemo(() => {
    const map = new Map<NetworkColumn, NetworkNode[]>();
    for (const column of COLUMN_ORDER) {
      map.set(
        column,
        network.nodes.filter((node) => node.column === column).sort((a, b) => a.y - b.y),
      );
    }
    return map;
  }, [network.nodes]);

  const resolve = useCallback(
    (target: string | null): Related | null => {
      if (!target) return null;
      if (target.startsWith("pillar:")) return relatedToPillar(network, target.slice(7));
      return relatedTo(index, target);
    },
    [network, index],
  );

  // Qué se queda encendido. Manda el cursor del ratón, porque es una
  // previsualización y tiene que responder al instante; después lo fijado; y si
  // no hay nada de eso, la búsqueda. Null = el mapa entero.
  const found: Related | null = useMemo(() => {
    if (hover) return resolve(hover);
    if (pinned) return resolve(pinned);
    return search(network, index, query);
  }, [hover, pinned, query, network, index, resolve]);

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

  const togglePin = (id: string) => setPinned((current) => (current === id ? null : id));

  const reset = () => {
    setScale(1);
    setQuery("");
    setPinned(null);
    setHover(null);
    if (wrapRef.current) {
      wrapRef.current.scrollTop = 0;
      wrapRef.current.scrollLeft = 0;
    }
  };

  /* --- Teclado -----------------------------------------------------------
     Un mapa de más de cien nodos no puede ser cien paradas de tabulación: quien
     navega con teclado tendría que atravesarlo entero para llegar al
     repositorio documental. En su lugar, el mapa es una sola parada y por
     dentro se recorre con las flechas —arriba y abajo dentro de la columna,
     izquierda y derecha saltando por las relaciones—, que es como se lee. */
  const move = (from: NetworkNode, key: string): NetworkNode | undefined => {
    if (key === "ArrowUp" || key === "ArrowDown") {
      const list = byColumn.get(from.column) ?? [];
      const at = list.findIndex((node) => node.id === from.id);
      return list[at + (key === "ArrowDown" ? 1 : -1)];
    }

    // Izquierda y derecha siguen una relación real, no la posición: saltar a
    // "lo que esté enfrente" llevaría a un nodo con el que no se tiene nada
    // que ver.
    const list =
      key === "ArrowRight" ? (index.out.get(from.id) ?? []) : (index.into.get(from.id) ?? []);
    const next = list[0];
    return next ? index.byId.get(key === "ArrowRight" ? next.to : next.from) : undefined;
  };

  const onKeyDown = (event: ReactKeyboardEvent<SVGGElement>) => {
    if (event.key === "Escape") {
      setPinned(null);
      setHover(null);
      return;
    }

    const current = cursor ? index.byId.get(cursor) : undefined;
    if (!current) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePin(current.id);
      return;
    }

    if (!event.key.startsWith("Arrow")) return;
    const next = move(current, event.key);
    if (!next) return;

    event.preventDefault();
    setCursor(next.id);
    setHover(next.id);
    const element = nodeRefs.current.get(next.id);
    element?.focus();
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  // El nodo que lleva la parada de tabulación: el que tenga el foco, y si
  // ninguno lo ha tenido todavía, el primer pilar.
  const tabStop = cursor ?? byColumn.get("pilar")?.[0]?.id ?? network.nodes[0]?.id ?? null;

  const shown = hover ?? pinned;
  const hovered = shown && !shown.startsWith("pillar:") ? index.byId.get(shown) : undefined;
  const pinnedPillar = pinned?.startsWith("pillar:")
    ? legend.find((pillar) => pillar.id === pinned.slice(7))
    : undefined;
  const pinnedNode = pinned && !pinned.startsWith("pillar:") ? index.byId.get(pinned) : undefined;

  return (
    <div className="netmap">
      <div className="netmap__legend" role="group" aria-label="Aislar un pilar del mapa">
        {legend.map((pillar) => {
          const key = `pillar:${pillar.id}`;
          const on = pinned === key;
          return (
            <button
              key={pillar.id}
              type="button"
              className={`netmap__legend-item${pinned?.startsWith("pillar:") && !on ? " is-dim" : ""}`}
              aria-pressed={on}
              onClick={() => togglePin(key)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="netmap__swatch"
                style={{ background: pillar.color }}
                aria-hidden="true"
              />
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

        {onRefresh && (
          <button
            type="button"
            className="button-ghost"
            onClick={onRefresh}
            disabled={refreshing}
            title="Vuelve a pedir pilares, estructura y proyectos"
          >
            {refreshing ? "Actualizando…" : "Actualizar datos"}
          </button>
        )}

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

      {/* Lo fijado se dice con palabras y no solo con el resaltado: al cambiar
          de vista o desplazarse, el nodo encendido puede quedar fuera de
          pantalla y el mapa parecería medio apagado sin motivo. */}
      {(pinnedNode || pinnedPillar) && (
        <p className="netmap__pinned" role="status">
          <span>
            Fijado: <b>{pinnedNode ? `${pinnedNode.code}. ${pinnedNode.name}` : pinnedPillar!.name}</b>
            {pinnedNode ? ` · ${COLUMN_LABEL[pinnedNode.column]}` : " · pilar completo"}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setPinned(null)}
            aria-label="Soltar la selección"
          >
            <Icon name="close" size={14} />
          </button>
        </p>
      )}

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
                const faded = active !== null && !active.edges.has(item.key);

                return (
                  <path
                    key={item.key}
                    className={`netmap__link${faded ? " is-faded" : ""}`}
                    d={curve(COL_X[from.column], yOf(from), COL_X[to.column], yOf(to))}
                    stroke={item.color}
                    strokeWidth={weightByValue ? 0.8 + (item.value / maxValue) * 4 : 1}
                  />
                );
              })}
            </g>

            <g className="netmap__nodes" onKeyDown={onKeyDown}>
              {network.nodes.map((node) => {
                const shape = SHAPE[node.column];
                const x = COL_X[node.column];
                const y = yOf(node);
                const text = `${node.code}. ${clip(node.name, MAX_CHARS[node.column])}`;
                const width = text.length * shape.perChar;
                const labelX = shape.side === "end" ? x - shape.r - 8 : x + shape.r + 8;
                const faded = active !== null && !active.nodes.has(node.id);
                const isDim = dimmed?.has(node.id) ?? false;
                const isPinned = pinned === node.id;

                return (
                  <g
                    key={node.id}
                    ref={(element) => {
                      if (element) nodeRefs.current.set(node.id, element);
                      else nodeRefs.current.delete(node.id);
                    }}
                    className={`netmap__node netmap__node--${node.column}${faded ? " is-faded" : ""}${isDim ? " is-dim" : ""}${isPinned ? " is-pinned" : ""}`}
                    role="button"
                    aria-pressed={isPinned}
                    tabIndex={tabStop === node.id ? 0 : -1}
                    aria-label={`${COLUMN_LABEL[node.column]} ${node.code}. ${node.name}`}
                    onMouseEnter={() => setHover(node.id)}
                    onMouseLeave={() => {
                      setHover(null);
                      hideTooltip();
                    }}
                    onMouseMove={showTooltip}
                    onFocus={() => {
                      setCursor(node.id);
                      setHover(node.id);
                    }}
                    onBlur={() => setHover(null)}
                    onClick={() => togglePin(node.id)}
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
                    {/* El anillo del nodo fijado: el resaltado por sí solo no
                        distingue "esto es lo que elegí" de "esto está en la
                        cadena de lo que elegí". */}
                    {isPinned && (
                      <circle cx={x} cy={y} r={shape.r + 4} className="netmap__ring" fill="none" />
                    )}
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
          `aria-label` de cada nodo, que es donde toca. */}
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
            <small className="netmap__tooltip-hint">
              {pinned === hovered.id ? "Pulsa para soltar" : "Pulsa para fijar"}
            </small>
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
