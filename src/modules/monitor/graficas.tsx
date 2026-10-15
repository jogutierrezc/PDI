/* =============================================================================
   Monitor · gráficas del mapa de riesgo (reprobación), con GSAP.

   · Barras: columnas por corte o por tramo; cada una lleva su forma (círculo, triángulo,
     cuadrado), su cifra y su etiqueta: nada se dice solo con color.
   · Ranking: barras horizontales de mayor a menor.
   · Dispersion: tamaño del grupo frente a reprobación, un punto por curso-grupo; el
     detalle sale al pasar el cursor, al enfocar o con las flechas, y hay una lista
     equivalente navegable por teclado.
   Al cambiar de alcance o de corte las barras y los puntos se mueven de donde estaban a
   donde van (solo transform y opacidad); con «reducir movimiento» llegan sin animar.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Forma, sinMovimiento } from "./piezas";
import { NOMBRE_NIVEL, TASA_ALTA, TASA_CRITICA, type GrupoRiesgo, type Nivel } from "./logica";

const coma1 = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Hace crecer (o cambiar) lo marcado con data-escala="id" y data-v="0..1" desde donde estaba; solo transform. */
function useCrece<T extends HTMLElement>(clave: string, eje: "x" | "y") {
  const ref = useRef<T>(null);
  const previo = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nodos = Array.from(el.querySelectorAll<HTMLElement>("[data-escala]"));
    const nuevo = new Map<string, number>();
    const prop = eje === "x" ? "scaleX" : "scaleY";
    const ctx = gsap.context(() => {
      nodos.forEach((n, i) => {
        const id = n.dataset.escala as string;
        const v = Number(n.dataset.v);
        nuevo.set(id, v);
        if (sinMovimiento()) {
          gsap.set(n, { [prop]: v });
          return;
        }
        const tenia = previo.current.has(id);
        gsap.fromTo(n, { [prop]: previo.current.get(id) ?? 0 }, { [prop]: v, duration: 0.45, ease: "power4.out", delay: tenia ? 0 : Math.min(i, 12) * 0.04, transformOrigin: eje === "x" ? "0 50%" : "50% 100%" });
      });
    }, el);
    previo.current = nuevo;
    return () => ctx.revert();
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/* --- Barras verticales ------------------------------------------------------------------------- */

export interface ItemBarra {
  id: string;
  etiqueta: string;
  sub?: string;
  valor: number;
  texto: string;
  nivel: Nivel;
}

export function Barras({ items, maximo, titulo }: { items: ItemBarra[]; maximo: number; titulo: string }) {
  const tope = Math.max(maximo, 1);
  const ref = useCrece<HTMLOListElement>(items.map((i) => `${i.id}:${i.valor}`).join("|"), "y");
  return (
    <ol ref={ref} className="mo-barras" aria-label={titulo}>
      {items.map((i) => (
        <li key={i.id} className="mo-barras__col" data-n={i.nivel}>
          <span className="mo-barras__valor">
            <Forma nivel={i.nivel} size={12} />
            <b>{i.texto}</b>
          </span>
          <span className="mo-barras__pista" aria-hidden="true">
            <i data-escala={i.id} data-v={i.valor / tope} data-n={i.nivel} style={{ transform: `scaleY(${i.valor / tope})` }} />
          </span>
          <span className="mo-barras__etiqueta">{i.etiqueta}</span>
          {i.sub && <small>{i.sub}</small>}
        </li>
      ))}
    </ol>
  );
}

/* --- Ranking horizontal ------------------------------------------------------------------------- */

export interface ItemRanking {
  id: string;
  nombre: string;
  sub: string;
  tasa: number;
  nivel: Nivel;
}

export function Ranking({ items, titulo, onAbrir }: { items: ItemRanking[]; titulo: string; onAbrir?: (i: ItemRanking, el: HTMLElement) => void }) {
  const ref = useCrece<HTMLOListElement>(items.map((i) => `${i.id}:${i.tasa}`).join("|"), "x");
  return (
    <ol ref={ref} className="mo-rank" aria-label={titulo}>
      {items.map((i) => (
        <li key={i.id} data-n={i.nivel}>
          <button type="button" disabled={!onAbrir} onClick={(ev) => onAbrir?.(i, ev.currentTarget)}>
            <span className="mo-rank__nombre">
              <b data-ghost>{i.nombre}</b>
              <small>{i.sub}</small>
            </span>
            <span className="mo-rank__pista" aria-hidden="true">
              <i data-escala={i.id} data-v={Math.max(0.005, i.tasa / 100)} data-n={i.nivel} style={{ transform: `scaleX(${Math.max(0.005, i.tasa / 100)})` }} />
            </span>
            <span className="mo-rank__valor">
              <Forma nivel={i.nivel} size={12} />
              <b>{coma1(i.tasa)} %</b>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* --- Dispersión: tamaño del grupo frente a reprobación -------------------------------------------- */

const FORMA_PT: Record<Nivel, string> = { NE: "M0 -6a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z", ED: "M0 -7 7 6h-14Z", RS: "M-6 -6h12v12h-12Z" };

export function Dispersion({ grupos, onAbrir }: { grupos: GrupoRiesgo[]; onAbrir?: (g: GrupoRiesgo) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(280, Math.min(900, Math.round(el.getBoundingClientRect().width))));
    medir();
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const W = ancho;
  const H = W < 480 ? 280 : 340;
  const m = { l: 44, r: 14, t: 14, b: 40 };
  const maxX = Math.max(10, ...grupos.map((g) => g.con));
  const topeX = Math.ceil(maxX / 10) * 10;
  const x = (v: number) => m.l + (v / topeX) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const puntos = useMemo(() => [...grupos].sort((a, b) => a.con - b.con || a.tasa - b.tasa), [grupos]);
  const g = puntos.find((p) => p.clave === activo) ?? null;

  // Cada punto viaja de donde estaba a donde queda (otro corte, otro alcance); los nuevos aparecen.
  const previo = useRef<Map<string, { x: number; y: number }> | null>(null);
  const clave = puntos.map((p) => `${p.clave}:${p.con}:${p.tasa}`).join("|");
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const nodos = Array.from(el.querySelectorAll<SVGGElement>("[data-pt]"));
    const ahora = new Map(nodos.map((n) => [n.dataset.pt as string, { x: Number(n.dataset.x), y: Number(n.dataset.y) }]));
    const antes = previo.current;
    previo.current = ahora;
    if (sinMovimiento()) return;
    const ctx = gsap.context(() => {
      nodos.forEach((n, i) => {
        const k = n.dataset.pt as string;
        const a = antes?.get(k);
        const c = ahora.get(k) as { x: number; y: number };
        if (a) gsap.fromTo(n, { x: a.x, y: a.y }, { x: c.x, y: c.y, duration: 0.45, ease: "power3.inOut" });
        else gsap.fromTo(n, { x: c.x, y: c.y, scale: 0.4, opacity: 0, transformOrigin: "0 0" }, { scale: 1, opacity: 1, duration: 0.3, ease: "power4.out", delay: Math.min(i, 20) * 0.012 });
      });
    }, el);
    return () => ctx.revert();
  }, [clave, W]); // eslint-disable-line react-hooks/exhaustive-deps

  const mover = (ev: React.KeyboardEvent) => {
    if (!puntos.length) return;
    const i = Math.max(0, puntos.findIndex((p) => p.clave === activo));
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") (ev.preventDefault(), setActivo(puntos[activo ? Math.min(puntos.length - 1, i + 1) : 0].clave));
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") (ev.preventDefault(), setActivo(puntos[activo ? Math.max(0, i - 1) : 0].clave));
    else if (ev.key === "Enter" && g && onAbrir) (ev.preventDefault(), onAbrir(g));
    else if (ev.key === "Escape") setActivo(null);
  };

  const texto = (p: GrupoRiesgo) => `${p.materia}, grupo ${p.grupo}: ${p.con} matrículas con nota, ${p.bajo} reprobadas, ${coma1(p.tasa)} % (${NOMBRE_NIVEL[p.nivel]})`;
  const marcasY = [0, 25, 50, 75, 100];
  const paso = topeX <= 40 ? 10 : topeX <= 100 ? 20 : 50;
  const marcasX = Array.from({ length: Math.floor(topeX / paso) + 1 }, (_, i) => i * paso);

  return (
    <div className="mo-disp" data-activo={activo ?? undefined}>
      <div className="mo-disp__barra">
        <p className="mo-panel__nota">Cada punto es un curso-grupo (código de materia + letra) con 5 o más matrículas con nota. Mientras más a la derecha, más grande el grupo; mientras más arriba, más reprobación.</p>
        <button type="button" className="mo-mas" aria-pressed={lista} onClick={() => setLista(!lista)}>
          {lista ? "Ver el diagrama" : "Ver como lista"}
        </button>
      </div>
      {puntos.length === 0 ? (
        <p className="mo-muted">No hay grupos con 5 o más matrículas con nota en este corte.</p>
      ) : lista ? (
        <div className="mo-tabla-envuelta">
          <table className="mo-tabla">
            <caption className="sr-only">Cursos-grupo, de mayor a menor reprobación</caption>
            <thead>
              <tr>
                <th scope="col">Curso y grupo</th>
                <th scope="col" className="num">
                  Con nota
                </th>
                <th scope="col" className="num">
                  Reprobadas
                </th>
                <th scope="col" className="num">
                  Tasa
                </th>
              </tr>
            </thead>
            <tbody>
              {[...puntos]
                .sort((a, b) => b.tasa - a.tasa || b.con - a.con)
                .slice(0, 60)
                .map((p) => (
                  <tr key={p.clave} data-n={p.nivel}>
                    <td>
                      <span className="mo-nombre">
                        <b>{p.materia}</b>
                        <small>Grupo {p.grupo}</small>
                      </span>
                    </td>
                    <td className="num">{p.con}</td>
                    <td className="num">{p.bajo}</td>
                    <td className="num">
                      <b>{coma1(p.tasa)} %</b> <Forma nivel={p.nivel} size={12} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mo-disp__cuerpo">
          <div ref={caja} className="mo-disp__caja" tabIndex={0} role="group" aria-label="Diagrama de dispersión: use las flechas para recorrer los grupos y Enter para abrir el curso" onKeyDown={mover} onBlur={() => setActivo(null)}>
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="mo-disp__svg">
              {marcasY.map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="mo-disp__rejilla" />
                  <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="mo-disp__eje">
                    {v} %
                  </text>
                </g>
              ))}
              {[TASA_ALTA, TASA_CRITICA].map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="mo-disp__umbral" />
                  <text x={W - m.r - 2} y={y(v) - 5} textAnchor="end" className="mo-disp__eje mo-disp__eje--umbral">
                    {v === TASA_CRITICA ? "crítica 50 %" : "alta 30 %"}
                  </text>
                </g>
              ))}
              {marcasX.map((v) => (
                <text key={v} x={x(v)} y={H - m.b + 18} textAnchor="middle" className="mo-disp__eje">
                  {v}
                </text>
              ))}
              <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="mo-disp__eje mo-disp__eje--titulo">
                Matrículas con nota en el grupo
              </text>
              {puntos.map((p) => (
                <g
                  key={p.clave}
                  data-pt={p.clave}
                  data-x={x(p.con)}
                  data-y={y(p.tasa)}
                  className="mo-pt"
                  data-n={p.nivel}
                  data-activo={p.clave === activo}
                  style={{ transform: `translate(${x(p.con)}px, ${y(p.tasa)}px)` }}
                  onMouseEnter={() => setActivo(p.clave)}
                  onMouseLeave={() => setActivo(null)}
                  onClick={() => onAbrir?.(p)}
                >
                  <circle r="14" className="mo-pt__area" />
                  <path d={FORMA_PT[p.nivel]} className="mo-pt__forma" />
                </g>
              ))}
            </svg>
          </div>
          <div className="mo-disp__detalle" aria-live="polite">
            {g ? (
              <>
                <span className="mo-nivel" data-n={g.nivel}>
                  <Forma nivel={g.nivel} />
                  <b>{coma1(g.tasa)} %</b>
                </span>
                <b>{g.materia}</b>
                <small>
                  Grupo {g.grupo} · {g.con} matrículas con nota · {g.bajo} reprobadas
                </small>
                {onAbrir && <small className="mo-muted">Clic o Enter para abrir el curso.</small>}
              </>
            ) : (
              <small className="mo-muted">Pase el cursor por un punto, o enfoque el diagrama y use las flechas, para ver el detalle de un grupo.</small>
            )}
          </div>
        </div>
      )}
      <ul className="mo-leyenda" aria-label="Leyenda">
        {(["NE", "ED", "RS"] as Nivel[]).map((n) => (
          <li key={n}>
            <Forma nivel={n} size={12} />
            {n === "NE" ? "Menos de 30 %" : n === "ED" ? "30 a 49 %: alta" : "50 % o más: crítica"}
          </li>
        ))}
      </ul>
    </div>
  );
}
