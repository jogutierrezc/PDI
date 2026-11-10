/* =============================================================================
   Portal de alertas · gráficos.

   SVG a mano, sin librería, con los tokens del proyecto (tema claro y oscuro por tokens). Cada
   gráfico dice su cifra en texto y marca el nivel con forma además de color: círculo (NE),
   triángulo (ED) y cuadrado (RS). Lo estimado va con trama y lleva la palabra «estimado».
   Movimiento con GSAP, solo transform y opacidad, con menos de 600 ms y apagado con
   «reducir movimiento».
   ========================================================================== */

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { NOMBRE_NIVEL, TASA_ALTA, TASA_CRITICA, histogramaDe, nivelDeTasa, type CorteRiesgo, type CursoRiesgo, type Nivel } from "../monitor/logica";
import { sinMovimiento } from "../monitor/piezas";
import type { CeldaCalor, ColumnaPeriodo, Trayectoria } from "./cohorte";
import { PRUEBA, type CortesCompletos, type Proyeccion } from "./estimacion";

export const coma = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "sin dato" : n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));

/* --- Formas y chips de nivel ------------------------------------------------------------------- */

const FORMA: Record<Nivel, string> = { NE: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z", ED: "M8 2 14.5 13.5h-13Z", RS: "M3 3h10v10H3Z" };

export function Forma({ nivel, size = 12 }: { nivel: Nivel; size?: number }) {
  return (
    <svg className="al-forma" data-n={nivel} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={FORMA[nivel]} />
    </svg>
  );
}

export function Semaforo({ nivel, palabra = true }: { nivel: Nivel; palabra?: boolean }) {
  return (
    <span className="al-nivel" data-n={nivel} title={NOMBRE_NIVEL[nivel]}>
      <Forma nivel={nivel} />
      <b>{nivel}</b>
      {palabra && <span>{NOMBRE_NIVEL[nivel]}</span>}
    </span>
  );
}

export function Leyenda({ tasa = false, estimado = false }: { tasa?: boolean; estimado?: boolean }) {
  const texto: Record<Nivel, string> = tasa ? { NE: "Menos de 30 %", ED: "30 a 49 %: alta", RS: "50 % o más: crítica" } : { NE: "Nivel esperado", ED: "En desarrollo", RS: "Requiere seguimiento" };
  return (
    <ul className="al-leyenda" aria-label="Leyenda">
      {(["NE", "ED", "RS"] as Nivel[]).map((n) => (
        <li key={n}>
          <Forma nivel={n} />
          {tasa ? "" : <b>{n}</b>} {texto[n]}
        </li>
      ))}
      {estimado && (
        <li>
          <svg className="al-forma" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeDasharray="2 2" />
          </svg>
          Estimado
        </li>
      )}
    </ul>
  );
}

/** El aviso que acompaña a todo lo que se estima. */
export function AvisoEstimado({ children }: { children?: React.ReactNode }) {
  return (
    <p className="al-aviso" role="note">
      <b>Estimación.</b> {children ?? "Lo que lleva trama todavía no tiene notas. Se calcula con las notas previas y se reemplaza solo cuando llegan las reales."}
    </p>
  );
}

/* --- Animación de entrada ------------------------------------------------------------------------ */

/** Las barras y columnas de `[data-crece]` crecen desde su base cada vez que cambia `clave`. */
function useCrece<T extends Element>(clave: string, eje: "y" | "x" = "y") {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sinMovimiento()) return;
    const ctx = gsap.context(() => {
      gsap.from(el.querySelectorAll("[data-crece]"), eje === "y" ? { scaleY: 0, transformOrigin: "50% 100%", duration: 0.5, ease: "power3.out", stagger: 0.02, clearProps: "transform" } : { scaleX: 0, transformOrigin: "0% 50%", duration: 0.5, ease: "power3.out", stagger: 0.02, clearProps: "transform" });
    }, el);
    return () => ctx.revert();
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

function Trama({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="al-trama-fondo" />
        <line x1="0" y1="0" x2="0" y2="6" className="al-trama-raya" strokeWidth="2" />
      </pattern>
    </defs>
  );
}

const marcas = (tope: number, paso: number) => Array.from({ length: Math.floor(tope / paso) + 1 }, (_, i) => i * paso);

/* --- La cohorte en cada periodo (barras apiladas) ------------------------------------------------- */

export function Apilada({ columnas, grande = false }: { columnas: ColumnaPeriodo[]; grande?: boolean }) {
  const W = grande ? 720 : 560;
  const H = grande ? 300 : 250;
  const m = { l: 40, r: 10, t: 12, b: 30 };
  const [activo, setActivo] = useState<string | null>(null);
  const ref = useCrece<SVGSVGElement>(columnas.map((c) => `${c.periodo}${c.n}${c.RS}`).join());
  const paso = (W - m.l - m.r) / Math.max(1, columnas.length);
  const ancho = Math.min(72, paso * 0.62);
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - v);
  const lectura = activo ? columnas.find((c) => c.periodo === activo) : null;
  return (
    <div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Estudiantes por nivel en cada periodo">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-rejilla" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end">
              {v * 100} %
            </text>
          </g>
        ))}
        {columnas.map((c, i) => {
          const x = m.l + paso * i + (paso - ancho) / 2;
          let acc = 0;
          return (
            <g key={c.periodo} onMouseEnter={() => setActivo(c.periodo)} onMouseLeave={() => setActivo(null)}>
              {(["NE", "ED", "RS"] as Nivel[]).map((k) => {
                const h = (c[k] / Math.max(1, c.n)) * (H - m.t - m.b);
                const yy = y(0) - acc - h;
                acc += h;
                return <rect key={k} data-crece x={x} y={yy} width={ancho} height={h} className="al-nivel-relleno" data-n={k} />;
              })}
              <text x={x + ancho / 2} y={H - 10} textAnchor="middle" className={i === columnas.length - 1 ? "al-eje-fuerte" : undefined}>
                {c.periodo}
                {c.parcial ? " (parcial)" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="al-lectura" aria-live="polite">
        {lectura ? `${lectura.periodo}: ${lectura.NE} en NE, ${lectura.ED} en ED y ${lectura.RS} en RS, de ${lectura.n} estudiantes (${coma((100 * lectura.RS) / Math.max(1, lectura.n))} % requiere seguimiento).` : "Pase el cursor por una columna para leer el detalle."}
      </p>
    </div>
  );
}

/* --- Tasa de reprobación por corte ---------------------------------------------------------------- */

export interface PuntoCorteEst {
  corte: CorteRiesgo;
  tasa: number;
  con: number;
  hay: boolean;
  est: boolean;
}

const NOMBRE_CORTE: Record<CorteRiesgo, string> = { 1: "P1", 2: "P2", 3: "P3", 4: "Final" };

export function ColumnasCorte({ puntos, corte }: { puntos: PuntoCorteEst[]; corte: CorteRiesgo }) {
  const id = useId();
  const W = 560;
  const H = 260;
  const m = { l: 44, r: 10, t: 34, b: 34 };
  const tope = Math.max(30, Math.ceil(Math.max(1, ...puntos.map((p) => p.tasa)) / 10) * 10);
  const paso = (W - m.l - m.r) / puntos.length;
  const ancho = Math.min(80, paso * 0.62);
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - v / tope);
  const ref = useCrece<SVGSVGElement>(puntos.map((p) => `${p.corte}${p.tasa}${p.est}`).join());
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Tasa de reprobación por corte">
      <Trama id={id} />
      {marcas(tope, tope <= 40 ? 10 : 20).map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-rejilla" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end">
            {v} %
          </text>
        </g>
      ))}
      {puntos.map((p, i) => {
        const x = m.l + paso * i + (paso - ancho) / 2;
        const nivel = nivelDeTasa(p.tasa);
        const etiqueta = `${NOMBRE_CORTE[p.corte]}${p.est ? " (estimado)" : ""}`;
        if (!p.hay)
          return (
            <g key={p.corte}>
              <text x={x + ancho / 2} y={y(0) - 8} textAnchor="middle">
                sin notas
              </text>
              <text x={x + ancho / 2} y={H - 10} textAnchor="middle">
                {NOMBRE_CORTE[p.corte]}
              </text>
            </g>
          );
        return (
          <g key={p.corte}>
            <rect data-crece x={x} y={y(p.tasa)} width={ancho} height={Math.max(0, y(0) - y(p.tasa))} rx="5" className="al-nivel-relleno" data-n={nivel} data-est={p.est || undefined} fill={p.est ? `url(#${id})` : undefined}>
              <title>{`${etiqueta}: ${coma(p.tasa)} % de ${p.con.toLocaleString("es-CO")} matrículas`}</title>
            </rect>
            <g transform={`translate(${x + ancho / 2 - 6} ${y(p.tasa) - 30}) scale(.75)`}>
              <path d={FORMA[nivel]} className="al-forma" data-n={nivel} />
            </g>
            <text x={x + ancho / 2} y={y(p.tasa) - 6} textAnchor="middle" className="al-eje-fuerte">
              {coma(p.tasa)} %
            </text>
            <text x={x + ancho / 2} y={H - 10} textAnchor="middle" className={p.corte === corte ? "al-eje-fuerte" : undefined}>
              {etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- Ranking (cursos, facultades, programas) ------------------------------------------------------- */

export interface ItemRank {
  clave: string;
  nombre: string;
  sub?: string;
  /** Tasa de reprobación en %. */
  tasa: number;
  est?: boolean;
}

export function Ranking({ items, onAbrir, titulo }: { items: ItemRank[]; onAbrir?: (clave: string) => void; titulo: string }) {
  const ref = useCrece<HTMLUListElement>(items.map((i) => `${i.clave}${i.tasa}`).join(), "x");
  const tope = Math.max(20, ...items.map((i) => i.tasa));
  return (
    <ul ref={ref} className="al-rank" aria-label={titulo}>
      {items.map((i) => {
        const nivel = nivelDeTasa(i.tasa);
        const cuerpo = (
          <>
            <span className="al-rank__nombre">
              <Forma nivel={nivel} />
              <span>
                {i.nombre}
                {i.sub && <small>{i.sub}</small>}
              </span>
            </span>
            <span className="al-rank__pista" aria-hidden="true">
              <i data-crece data-n={nivel} data-est={i.est || undefined} style={{ width: `${(100 * i.tasa) / tope}%` }} />
            </span>
            <span className="al-rank__cifra">
              {coma(i.tasa)} %{i.est && <small> estimado</small>}
            </span>
          </>
        );
        return <li key={i.clave}>{onAbrir ? <button type="button" onClick={() => onAbrir(i.clave)}>{cuerpo}</button> : <div className="al-rank__fila">{cuerpo}</div>}</li>;
      })}
    </ul>
  );
}

/* --- Tamaño del grupo contra reprobación ------------------------------------------------------------ */

export interface PuntoGrupo {
  clave: string;
  nombre: string;
  grupo: string;
  con: number;
  bajo: number;
  tasa: number;
  est?: boolean;
}

export function DispersionGrupos({ grupos, onAbrir }: { grupos: PuntoGrupo[]; onAbrir?: (g: PuntoGrupo) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const previo = useRef<Map<string, { x: number; y: number }> | null>(null);
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  const id = useId();
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(300, Math.min(900, Math.round(el.getBoundingClientRect().width))));
    medir();
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, [lista]);

  const W = ancho;
  const H = W < 480 ? 290 : 340;
  const m = { l: 46, r: 14, t: 14, b: 42 };
  const topeX = Math.max(10, Math.ceil(Math.max(10, ...grupos.map((g) => g.con)) / 10) * 10);
  const x = (v: number) => m.l + (v / topeX) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - Math.min(100, v) / 100) * (H - m.t - m.b);
  const puntos = useMemo(() => [...grupos].sort((a, b) => a.con - b.con || a.tasa - b.tasa), [grupos]);
  const g = puntos.find((p) => p.clave === activo) ?? null;
  const clave = puntos.map((p) => `${p.clave}:${p.con}:${p.tasa}`).join("|");

  // Cada punto viaja de donde estaba a donde queda (otro corte, otro alcance); los nuevos aparecen.
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
        const a = antes?.get(n.dataset.pt as string);
        const c = ahora.get(n.dataset.pt as string) as { x: number; y: number };
        if (a) gsap.fromTo(n, { x: a.x, y: a.y }, { x: c.x, y: c.y, duration: 0.5, ease: "power3.inOut" });
        else gsap.fromTo(n, { x: c.x, y: c.y, scale: 0.4, opacity: 0, transformOrigin: "0 0" }, { scale: 1, opacity: 1, duration: 0.3, ease: "power4.out", delay: Math.min(i, 24) * 0.01 });
      });
    }, el);
    return () => ctx.revert();
  }, [clave, W, lista]); // eslint-disable-line react-hooks/exhaustive-deps

  const mover = (ev: React.KeyboardEvent) => {
    if (!puntos.length) return;
    const i = Math.max(0, puntos.findIndex((p) => p.clave === activo));
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") (ev.preventDefault(), setActivo(puntos[activo ? Math.min(puntos.length - 1, i + 1) : 0].clave));
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") (ev.preventDefault(), setActivo(puntos[activo ? Math.max(0, i - 1) : 0].clave));
    else if (ev.key === "Enter" && g && onAbrir) (ev.preventDefault(), onAbrir(g));
    else if (ev.key === "Escape") setActivo(null);
  };

  const paso = topeX <= 40 ? 10 : topeX <= 100 ? 20 : 50;
  return (
    <div>
      <div className="al-fila-ctrl">
        <p className="al-nota">Cada punto es un grupo. Más a la derecha, un grupo más grande; más arriba, más reprobación.</p>
        <button type="button" className="al-enlace" aria-pressed={lista} onClick={() => setLista(!lista)}>
          {lista ? "Ver el diagrama" : "Ver como lista"}
        </button>
      </div>
      {puntos.length === 0 ? (
        <p className="al-nota">No hay grupos con 5 o más matrículas con nota en este corte.</p>
      ) : lista ? (
        <div className="al-tabla-envuelta">
          <table className="al-tabla">
            <caption className="sr-only">Grupos, de mayor a menor reprobación</caption>
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
                  <tr key={p.clave}>
                    <td>
                      {p.nombre}, grupo {p.grupo}
                      {p.est ? " (estimado)" : ""}
                    </td>
                    <td className="num">{p.con}</td>
                    <td className="num">{p.bajo}</td>
                    <td className="num">
                      <b>{coma(p.tasa)} %</b> <Forma nivel={nivelDeTasa(p.tasa)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="al-disp">
          <div ref={caja} className="al-disp__caja" tabIndex={0} role="group" aria-label="Diagrama de dispersión: use las flechas para recorrer los grupos y Enter para abrir el curso" onKeyDown={mover} onBlur={() => setActivo(null)}>
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="al-svg">
              <Trama id={id} />
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-rejilla" />
                  <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
                    {v} %
                  </text>
                </g>
              ))}
              {[TASA_ALTA, TASA_CRITICA].map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-umbral" data-n={v === TASA_CRITICA ? "RS" : "ED"} />
                  <text x={W - m.r - 2} y={y(v) - 5} textAnchor="end" className="al-eje-umbral" data-n={v === TASA_CRITICA ? "RS" : "ED"}>
                    {v === TASA_CRITICA ? "crítica 50 %" : "alta 30 %"}
                  </text>
                </g>
              ))}
              {marcas(topeX, paso).map((v) => (
                <text key={v} x={x(v)} y={H - m.b + 18} textAnchor="middle">
                  {v}
                </text>
              ))}
              <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="al-eje-fuerte">
                Matrículas con nota en el grupo
              </text>
              {puntos.map((p) => {
                const nivel = nivelDeTasa(p.tasa);
                return (
                  <g
                    key={p.clave}
                    data-pt={p.clave}
                    data-x={x(p.con)}
                    data-y={y(p.tasa)}
                    className="al-pt"
                    data-n={nivel}
                    data-activo={p.clave === activo}
                    data-est={p.est || undefined}
                    style={{ transform: `translate(${x(p.con)}px, ${y(p.tasa)}px)` }}
                    onMouseEnter={() => setActivo(p.clave)}
                    onMouseLeave={() => setActivo(null)}
                    onClick={() => onAbrir?.(p)}
                  >
                    <circle r="13" className="al-pt__area" />
                    <path d={FORMA[nivel]} transform="translate(-8 -8)" className="al-pt__forma" fill={p.est ? `url(#${id})` : undefined} />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="al-disp__detalle" aria-live="polite">
            {g ? (
              <>
                <Semaforo nivel={nivelDeTasa(g.tasa)} palabra={false} />
                <b>
                  {g.nombre}, grupo {g.grupo}
                </b>
                <small>
                  {coma(g.tasa)} % de reprobación, {g.con} matrículas con nota, {g.bajo} reprobadas{g.est ? ". Estimado." : ""}
                </small>
                {onAbrir && <small className="al-muted">Clic o Enter para abrir el curso.</small>}
              </>
            ) : (
              <small className="al-muted">Pase el cursor por un punto, o enfoque el diagrama y use las flechas, para ver el detalle de un grupo.</small>
            )}
          </div>
        </div>
      )}
      <Leyenda tasa estimado={grupos.some((p) => p.est)} />
    </div>
  );
}

/* --- Distribución de los cursos por tramo de reprobación --------------------------------------------- */

export function HistogramaTramos({ cursos }: { cursos: CursoRiesgo[] }) {
  const tramos = histogramaDe(cursos);
  const W = 560;
  const H = 250;
  const m = { l: 36, r: 10, t: 24, b: 40 };
  const tope = Math.max(4, ...tramos.map((t) => t.cursos));
  const paso = (W - m.l - m.r) / tramos.length;
  const ancho = paso * 0.7;
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - v / tope);
  const ref = useCrece<SVGSVGElement>(tramos.map((t) => t.cursos).join());
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Cursos por tramo de reprobación">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={m.l} x2={W - m.r} y1={y(tope * f)} y2={y(tope * f)} className="al-rejilla" />
          <text x={m.l - 6} y={y(tope * f) + 4} textAnchor="end">
            {Math.round(tope * f)}
          </text>
        </g>
      ))}
      {tramos.map((t, i) => {
        const x = m.l + paso * i + (paso - ancho) / 2;
        return (
          <g key={t.desde}>
            <rect data-crece x={x} y={y(t.cursos)} width={ancho} height={Math.max(0, y(0) - y(t.cursos))} rx="4" className="al-nivel-relleno" data-n={t.nivel}>
              <title>{`${t.etiqueta} %: ${t.cursos} cursos`}</title>
            </rect>
            {t.cursos > 0 && (
              <text x={x + ancho / 2} y={y(t.cursos) - 6} textAnchor="middle" className="al-eje-fuerte">
                {t.cursos}
              </text>
            )}
            <text x={x + ancho / 2} y={H - 22} textAnchor="middle">
              {t.etiqueta}
            </text>
          </g>
        );
      })}
      <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="al-eje-fuerte">
        Reprobación del curso (%)
      </text>
    </svg>
  );
}

/* --- Distribución del promedio ------------------------------------------------------------------------- */

export function HistogramaPromedio({ promedios }: { promedios: number[] }) {
  const lo = 1.5;
  const paso = 0.25;
  const n = 14;
  const bins = Array.from({ length: n }, () => 0);
  for (const p of promedios) bins[Math.min(n - 1, Math.max(0, Math.floor((p - lo) / paso)))] += 1;
  const W = 560;
  const H = 240;
  const m = { l: 32, r: 10, t: 24, b: 36 };
  const bw = (W - m.l - m.r) / n;
  const tope = Math.max(3, ...bins);
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - v / tope);
  const ref = useCrece<SVGSVGElement>(bins.join());
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Estudiantes por rango de promedio">
      {bins.map((v, i) => {
        const a = lo + i * paso;
        const nivel: Nivel = a < 3 ? "RS" : a < 3.5 ? "ED" : "NE";
        return (
          <g key={i}>
            <rect data-crece x={m.l + i * bw + 1.5} y={y(v)} width={bw - 3} height={Math.max(0, y(0) - y(v))} rx="3" className="al-nivel-relleno" data-n={nivel}>
              <title>{`${coma(a, 2)} a ${coma(a + paso, 2)}: ${v} estudiantes`}</title>
            </rect>
            {v > 0 && (
              <text x={m.l + i * bw + bw / 2} y={y(v) - 5} textAnchor="middle" className="al-eje-fuerte">
                {v}
              </text>
            )}
            {i % 2 === 0 && (
              <text x={m.l + i * bw + bw / 2} y={H - 18} textAnchor="middle">
                {coma(a, 1)}
              </text>
            )}
          </g>
        );
      })}
      <text x={(m.l + W - m.r) / 2} y={H - 3} textAnchor="middle" className="al-eje-fuerte">
        Promedio del periodo
      </text>
    </svg>
  );
}

/* --- Quién subió y quién bajó ----------------------------------------------------------------------------- */

export function DispersionCambio({ t }: { t: Trayectoria[] }) {
  const filas = t.filter((x) => x.anterior);
  const W = 560;
  const H = 300;
  const m = { l: 42, r: 12, t: 14, b: 40 };
  const lo = 1.5;
  const hi = 5;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const ref = useCrece<SVGSVGElement>(String(filas.length));
  if (filas.length === 0) return <p className="al-nota">Es el primer periodo de esta cohorte: no hay promedio anterior con qué comparar.</p>;
  return (
    <div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Promedio anterior contra promedio actual">
        {[2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-rejilla" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end">
              {v},0
            </text>
            <text x={x(v)} y={H - 22} textAnchor="middle">
              {v},0
            </text>
          </g>
        ))}
        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} className="al-diagonal" />
        {filas.map((s) => (
          <g key={s.codigo} data-crece transform={`translate(${x((s.anterior?.promedio ?? 0))} ${y(s.actual.promedio)})`}>
            <path d={FORMA[s.actual.nivel]} transform="translate(-5 -5) scale(.62)" className="al-forma" data-n={s.actual.nivel}>
              <title>{`${s.codigo}: de ${coma(s.anterior?.promedio, 2)} a ${coma(s.actual.promedio, 2)}`}</title>
            </path>
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="al-eje-fuerte">
          Promedio del periodo anterior
        </text>
        <text transform={`translate(11 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="al-eje-fuerte">
          Promedio actual
        </text>
      </svg>
      <p className="al-nota">Quien está por debajo de la diagonal bajó su promedio.</p>
    </div>
  );
}

/* --- Trayectoria del promedio con proyección ---------------------------------------------------------------- */

export function GraficaTrayectoria({ puntos, proyeccion, siguiente }: { puntos: { periodo: string; promedio: number; parcial: boolean }[]; proyeccion: Proyeccion | null; siguiente: string }) {
  const W = 560;
  const H = 260;
  const m = { l: 40, r: 16, t: 16, b: 32 };
  const n = puntos.length + (proyeccion ? 1 : 0);
  const x = (i: number) => m.l + (i * (W - m.l - m.r)) / Math.max(1, n - 1);
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - (v - 1.5) / 3.5);
  const ref = useRef<SVGSVGElement>(null);
  const clave = puntos.map((p) => p.promedio).join();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sinMovimiento()) return;
    const ctx = gsap.context(() => {
      const linea = el.querySelector<SVGPathElement>("[data-linea]");
      if (linea) {
        const largo = linea.getTotalLength?.() ?? 0;
        if (largo) gsap.fromTo(linea, { strokeDasharray: largo, strokeDashoffset: largo }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" });
      }
      gsap.from(el.querySelectorAll("[data-proy]"), { opacity: 0, duration: 0.4, delay: 0.5, ease: "power2.out", clearProps: "opacity" });
    }, el);
    return () => ctx.revert();
  }, [clave]);
  const ultimo = puntos[puntos.length - 1];
  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.promedio)}`).join(" ");
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Promedio por periodo y proyección al siguiente">
      {[2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-rejilla" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end">
            {v},0
          </text>
        </g>
      ))}
      <line x1={m.l} x2={W - m.r} y1={y(PRUEBA)} y2={y(PRUEBA)} className="al-umbral" data-n="RS" />
      <text x={W - m.r} y={y(PRUEBA) - 5} textAnchor="end" className="al-eje-umbral" data-n="RS">
        Prueba 3,2
      </text>
      {proyeccion && ultimo && (
        <g data-proy>
          <path d={`M${x(puntos.length - 1)} ${y(ultimo.promedio)} L${x(puntos.length)} ${y(proyeccion.alto)} L${x(puntos.length)} ${y(proyeccion.bajo)} Z`} className="al-banda" />
          <path d={`M${x(puntos.length - 1)} ${y(ultimo.promedio)} L${x(puntos.length)} ${y(proyeccion.mu)}`} className="al-proyeccion" />
          <circle cx={x(puntos.length)} cy={y(proyeccion.mu)} r="4.5" className="al-punto-proy">
            <title>{`${siguiente}: ${coma(proyeccion.mu, 2)} (banda ${coma(proyeccion.bajo, 2)} a ${coma(proyeccion.alto, 2)}). Estimado.`}</title>
          </circle>
        </g>
      )}
      <path data-linea d={linea} className="al-linea" />
      {puntos.map((p, i) => (
        <g key={p.periodo}>
          <circle cx={x(i)} cy={y(p.promedio)} r={i === puntos.length - 1 ? 5 : 3.6} className={i === puntos.length - 1 ? "al-punto al-punto--ultimo" : "al-punto"}>
            <title>{`${p.periodo}: promedio ${coma(p.promedio, 2)}${p.parcial ? " (parcial)" : ""}`}</title>
          </circle>
          <text x={x(i)} y={H - 10} textAnchor="middle" className={i === puntos.length - 1 ? "al-eje-fuerte" : undefined}>
            {p.periodo}
            {p.parcial ? "*" : ""}
          </text>
        </g>
      ))}
      {proyeccion && (
        <text x={x(puntos.length)} y={H - 10} textAnchor="middle" className="al-eje-fuerte" data-proy>
          {siguiente} (est.)
        </text>
      )}
    </svg>
  );
}

/* --- Notas de los cortes, con lo estimado ---------------------------------------------------------------------- */

export function NotasCorte({ c }: { c: CortesCompletos }) {
  const id = useId();
  const W = 560;
  const H = 230;
  const m = { l: 40, r: 12, t: 26, b: 32 };
  const items = [
    ...c.valores.map((v, i) => ({ nombre: `P${i + 1}`, v, est: c.estimado[i], banda: c.bandas[i] })),
    { nombre: "Final", v: c.final, est: c.finalEstimado, banda: c.bandaFinal },
  ];
  const paso = (W - m.l - m.r) / items.length;
  const ancho = Math.min(76, paso * 0.62);
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - (v - 1.5) / 3.5);
  const ref = useCrece<SVGSVGElement>(items.map((i) => i.v).join());
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="al-svg" role="img" aria-label="Notas por corte">
      <Trama id={id} />
      {[2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="al-rejilla" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end">
            {v},0
          </text>
        </g>
      ))}
      <line x1={m.l} x2={W - m.r} y1={y(3)} y2={y(3)} className="al-umbral" data-n="RS" />
      {items.map((it, i) => {
        const x = m.l + paso * i + (paso - ancho) / 2;
        if (it.v === null)
          return (
            <g key={it.nombre}>
              <text x={x + ancho / 2} y={y(1.5) - 8} textAnchor="middle">
                sin nota
              </text>
              <text x={x + ancho / 2} y={H - 10} textAnchor="middle">
                {it.nombre}
              </text>
            </g>
          );
        const nivel: Nivel = it.v < 3 ? "RS" : it.v < 3.5 ? "ED" : "NE";
        return (
          <g key={it.nombre}>
            <rect data-crece x={x} y={y(it.v)} width={ancho} height={Math.max(0, y(1.5) - y(it.v))} rx="5" className="al-nivel-relleno" data-n={nivel} data-est={it.est || undefined} fill={it.est ? `url(#${id})` : undefined}>
              <title>{`${it.nombre}: ${coma(it.v, 2)}${it.est ? " (estimado)" : ""}`}</title>
            </rect>
            {it.est && it.banda && <line x1={x + ancho / 2} x2={x + ancho / 2} y1={y(it.banda.alto)} y2={y(it.banda.bajo)} className="al-error" />}
            <text x={x + ancho / 2} y={y(it.banda?.alto ?? it.v) - 6} textAnchor="middle" className="al-eje-fuerte">
              {coma(it.v, 2)}
            </text>
            <text x={x + ancho / 2} y={H - 10} textAnchor="middle">
              {it.nombre}
              {it.est ? " (est.)" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- Mapa de calor: semestre por periodo ------------------------------------------------------------------------ */

export function MapaCalor({ semestres, periodos, celdas, semestre, periodo }: { semestres: number[]; periodos: string[]; celdas: Map<string, CeldaCalor>; semestre: number | null; periodo: string }) {
  if (semestres.length === 0) return <p className="al-nota">Todavía no hay semestre cargado: llega del reporte de créditos (dv_cred) del Warehouse. Cuando esté, aquí se compara cada semestre con los demás y con los periodos anteriores.</p>;
  return (
    <div className="al-tabla-envuelta">
      <table className="al-calor">
        <thead>
          <tr>
            <th />
            {periodos.map((p) => (
              <th key={p} scope="col">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semestres.map((s) => (
            <tr key={s} data-sel={s === semestre}>
              <th scope="row">Semestre {s}</th>
              {periodos.map((p) => {
                const c = celdas.get(`${s}|${p}`);
                return (
                  <td key={p}>
                    {c ? (
                      <span className="al-calor__celda" data-sel={s === semestre && p === periodo} data-parcial={c.parcial || undefined} style={{ ["--v" as string]: `${Math.round(8 + 70 * Math.min(1, c.pctRS / 0.55))}%` }} title={`${c.n} estudiantes${c.parcial ? ", periodo parcial" : ""}`}>
                        {coma(c.pctRS * 100, 0)} %
                      </span>
                    ) : (
                      <span className="al-muted" title="Menos de 5 estudiantes">
                        sin dato
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Dos barras para comparar (sin escenario y con escenario) ------------------------------------------------------- */

export function Pares({ titulo, sin, con, tope, formato }: { titulo: string; sin: number; con: number; tope: number; formato: (v: number) => string }) {
  const ref = useCrece<HTMLDivElement>(`${sin}${con}`, "x");
  return (
    <div ref={ref} className="al-par">
      <div className="al-par__l">
        <span>{titulo}</span>
        <span>
          <b>{formato(con)}</b> con el escenario, {formato(sin)} sin él
        </span>
      </div>
      <div className="al-par__t" aria-hidden="true">
        <i data-crece data-k="sin" style={{ width: `${(100 * sin) / Math.max(0.0001, tope)}%` }} />
      </div>
      <div className="al-par__t" aria-hidden="true">
        <i data-crece data-k="con" style={{ width: `${(100 * con) / Math.max(0.0001, tope)}%` }} />
      </div>
    </div>
  );
}

/* --- La escala de 0 a 5 con la nota de aprobar a la vista --------------------------------------------------------------- */

export function Escala({ nota, aprueba = 3 }: { nota: number | null; aprueba?: number }) {
  const pos = (v: number) => `${(100 * v) / 5}%`;
  return (
    <div className="al-escala" role="img" aria-label={nota === null ? "Sin nota" : `Nota ${coma(nota, 2)} en una escala de 0 a 5; aprobar es ${coma(aprueba, 1)}`}>
      <span className="al-escala__riel" />
      {[aprueba, 3.5].map((v) => (
        <span key={v} className="al-escala__marca" style={{ left: pos(v) }}>
          <i />
          <small>{coma(v, 1)}</small>
        </span>
      ))}
      {nota !== null && <span className="al-escala__nota" style={{ left: pos(nota) }} />}
    </div>
  );
}
