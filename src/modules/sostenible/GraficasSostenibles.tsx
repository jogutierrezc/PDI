/* =============================================================================
   UDES Sostenible · gráficas publicadas desde Datos de Sostenibilidad.

   Lee sos_graficas_publicas() (migración 0202) y dibuja cada gráfica con la
   tabla mínima que entrega la base, agrupadas por sección del Observatorio.
   Barras y líneas, con globo de datos que sale también por teclado. Cualquier
   tipo de UDrive se dibuja como una de las dos (las líneas, áreas y combinadas
   de líneas, como líneas; el resto, como barras). Sin gráficas publicadas, o sin
   la migración, no dibuja nada: la página queda como estaba.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { FocusEvent, MouseEvent } from "react";
import { SECCIONES_SOS, useGraficasPublicas } from "../datos-sostenibilidad/sos";
import type { GraficaPublicaSos, SeccionSos } from "../datos-sostenibilidad/tipos";
import { colorDe, datosCategoricos, normalizarConfig, rangoDeEje } from "../udrive/lib/graficas";
import { textoNumero } from "../udrive/lib/valores";
import type { TablaDatos, TipoColumna } from "../udrive/tipos";
import "./graficas-sostenibles.css";

const TIPOS_COLUMNA: readonly string[] = ["texto", "numero", "porcentaje", "fecha", "lista"];
const COMO_LINEAS = new Set(["linea", "area", "dos-lineas"]);

/** La tabla mínima de la base como la espera la lógica de gráficas de UDrive. */
function tablaDe(g: GraficaPublicaSos): TablaDatos {
  return {
    columnas: g.columnas.map((c) => ({
      clave: c.clave,
      etiqueta: c.etiqueta,
      tipo: (TIPOS_COLUMNA.includes(c.tipo) ? c.tipo : "texto") as TipoColumna,
      obligatorio: false,
      opciones: [],
      min: null,
      max: null,
      calor: null,
    })),
    filas: g.filas.map((datos, i) => ({ id: String(i), datos })),
  };
}

interface Globo {
  x: number;
  y: number;
  texto: string;
}

const W = 640;
const H = 300;

/** El dibujo: barras (agrupadas si hay varias series) o líneas, con ejes, leyenda y globo. */
function Dibujo({ g }: { g: GraficaPublicaSos }) {
  const caja = useRef<HTMLDivElement>(null);
  const [globo, setGlobo] = useState<Globo | null>(null);
  const tabla = useMemo(() => tablaDe(g), [g]);
  const config = useMemo(() => normalizarConfig(g.config, tabla), [g.config, tabla]);
  const { categorias, series } = useMemo(() => datosCategoricos(tabla, config), [tabla, config]);
  const lineas = COMO_LINEAS.has(config.tipo);

  if (!series.length || !categorias.length) return <p className="sos-gf__vacia">Esta gráfica no tiene datos para dibujar.</p>;

  const m = { l: 52, r: 16, t: 14, b: categorias.length > 6 ? 62 : 38 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const [min, max] = rangoDeEje(series.flatMap((s) => s.valores), { min: config.min, max: config.max }, !lineas);
  const Y = (v: number) => m.t + ih - ((v - min) / (max - min)) * ih;
  const paso = iw / categorias.length;
  const saltoRotulos = Math.max(1, Math.ceil(categorias.length / 10));
  const girar = categorias.length > 6;

  const mostrar = (e: MouseEvent<SVGElement> | FocusEvent<SVGElement>, texto: string) => {
    const a = e.currentTarget.getBoundingClientRect();
    const c = caja.current?.getBoundingClientRect();
    if (c) setGlobo({ x: a.left - c.left + a.width / 2, y: a.top - c.top, texto });
  };
  const ocultar = () => setGlobo(null);

  return (
    <div className="sos-gf__lienzo" ref={caja}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${config.titulo || g.nombre}: ${lineas ? "gráfica de líneas" : "gráfica de barras"} con ${categorias.length} categorías`}>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = min + ((max - min) * k) / 4;
          return (
            <g key={k} aria-hidden="true">
              <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} className="sos-gf__linea" />
              <text x={m.l - 8} y={Y(v) + 4} textAnchor="end" className="sos-gf__eje">
                {textoNumero(Math.round(v * 100) / 100)}
              </text>
            </g>
          );
        })}
        {categorias.map((c, i) =>
          i % saltoRotulos ? null : (
            <text
              key={i}
              aria-hidden="true"
              className="sos-gf__eje"
              textAnchor={girar ? "end" : "middle"}
              transform={girar ? `translate(${m.l + paso * i + paso / 2} ${H - m.b + 14}) rotate(-35)` : undefined}
              x={girar ? undefined : m.l + paso * i + paso / 2}
              y={girar ? undefined : H - m.b + 18}
            >
              {c.length > 14 ? `${c.slice(0, 13)}…` : c}
            </text>
          ),
        )}
        {lineas
          ? series.map((s, k) => {
              const color = colorDe(s.color);
              const pts = s.valores.map((v, i) => (v === null ? null : { x: m.l + paso * i + paso / 2, y: Y(v), v, c: categorias[i] }));
              const ok = pts.filter((p): p is NonNullable<typeof p> => p !== null);
              return (
                <g key={k}>
                  <path data-linea="" d={ok.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" />
                  {ok.map((p, i) => {
                    const texto = `${s.etiqueta} · ${p.c}: ${textoNumero(p.v)}`;
                    return (
                      <circle key={i} data-marca="" className="sos-gf__marca" tabIndex={0} role="img" aria-label={texto} cx={p.x} cy={p.y} r="4.5" fill="var(--surface, #fff)" stroke={color} strokeWidth="2.5" onMouseEnter={(e) => mostrar(e, texto)} onMouseLeave={ocultar} onFocus={(e) => mostrar(e, texto)} onBlur={ocultar} />
                    );
                  })}
                </g>
              );
            })
          : categorias.map((c, i) => {
              const ancho = Math.min(46, (paso * 0.72) / series.length);
              const x0 = m.l + paso * i + (paso - ancho * series.length) / 2;
              const base = Y(Math.max(0, min));
              return series.map((s, k) => {
                const v = s.valores[i];
                if (v === null) return null;
                const y = Y(v);
                const texto = `${series.length > 1 ? `${s.etiqueta} · ` : ""}${c}: ${textoNumero(v)}`;
                return (
                  <rect key={`${i}-${k}`} data-barra="" className="sos-gf__marca" tabIndex={0} role="img" aria-label={texto} x={x0 + ancho * k} y={Math.min(y, base)} width={Math.max(2, ancho - 2)} height={Math.max(1, Math.abs(base - y))} rx="3" fill={colorDe(s.color)} onMouseEnter={(e) => mostrar(e, texto)} onMouseLeave={ocultar} onFocus={(e) => mostrar(e, texto)} onBlur={ocultar} />
                );
              });
            })}
        <line x1={m.l} x2={W - m.r} y1={Y(Math.max(0, min))} y2={Y(Math.max(0, min))} className="sos-gf__base" aria-hidden="true" />
      </svg>
      {globo ? (
        <span className="sos-gf__globo" role="tooltip" style={{ left: globo.x, top: globo.y }}>
          {globo.texto}
        </span>
      ) : null}
      {series.length > 1 ? (
        <ul className="sos-gf__leyenda" aria-label="Series">
          {series.map((s, k) => (
            <li key={k}>
              <i style={{ background: colorDe(s.color) }} aria-hidden="true" />
              {s.etiqueta}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Una gráfica publicada: título, dibujo, nota y fuente. */
export function GraficaSos({ g }: { g: GraficaPublicaSos }) {
  const titulo = g.config.titulo?.trim() || g.nombre;
  return (
    <figure className="sos-gf">
      <figcaption>
        <h3 className="sos-gf__titulo">{titulo}</h3>
        {g.config.nota ? <p className="sos-gf__nota">{g.config.nota}</p> : null}
      </figcaption>
      <Dibujo g={g} />
      <p className="sos-gf__fuente">Fuente: {g.fuente || "Datos de Sostenibilidad"}</p>
    </figure>
  );
}

/** Las gráficas dadas, agrupadas por sección del Observatorio (o sin títulos si es una sola sección). */
export function GraficasPublicadas({ graficas, seccion }: { graficas: GraficaPublicaSos[]; seccion?: SeccionSos | "" }) {
  const visibles = graficas.filter((g) => !seccion || g.seccion === seccion).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  if (!visibles.length) return null;
  const grupos = SECCIONES_SOS.map((s) => ({ ...s, lista: visibles.filter((g) => g.seccion === s.id) })).filter((s) => s.lista.length);
  return (
    <div className="sos-gfs">
      {grupos.map((s) => (
        <section key={s.id} className="sos-gfs__seccion" aria-label={s.etiqueta}>
          {seccion ? null : <h3 className="sos-gfs__nombre">{s.etiqueta}</h3>}
          <div className="sos-gfs__rejilla">
            {s.lista.map((g) => (
              <GraficaSos key={g.id} g={g} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Lo que usan la página de respaldo y el bloque del CMS: lee lo publicado y lo dibuja (nada si no hay). */
export function GraficasSostenibles({ seccion }: { seccion?: SeccionSos | "" }) {
  const q = useGraficasPublicas();
  return <GraficasPublicadas graficas={q.data ?? []} seccion={seccion} />;
}

/** La sección de la página de respaldo: con su encabezado, y nada si no hay gráficas publicadas. */
export function SeccionGraficasSostenibles() {
  const q = useGraficasPublicas();
  if (!q.data?.length) return null;
  return (
    <section className="sos-section" id="graficas" aria-labelledby="sos-graficas">
      <div className="sos-wrap">
        <div className="sos-head">
          <p className="sos-eyebrow">Datos abiertos</p>
          <h2 id="sos-graficas">Las gráficas de los campus.</h2>
          <p>Salen de las tablas de Datos de Sostenibilidad, ya agregadas por campus y año.</p>
        </div>
        <GraficasPublicadas graficas={q.data} />
      </div>
    </section>
  );
}
