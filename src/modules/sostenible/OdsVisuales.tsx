/* =============================================================================
   Visuales de «UDES en Cifras» adaptados al informe ODS (y a la vista previa de
   Pilo Publica): antes y ahora, composición y mapa de calor.

   Vienen del portal de datos abiertos (evolución histórica, desglose en
   composición y mapa de calor) pero se dibujan en el lenguaje del cartel: el
   color del ODS, cifras tabulares, líneas finas, sin tarjetas ni sombras. HTML
   y CSS, no SVG: las cifras se leen al tamaño del texto y la tabla se recorre.

   Nunca llevan números propios: todo sale de las cifras del libro. Lo único que
   calculan es una diferencia (variación o % de la suma), y lo dicen.

   OdsPilo los anima con GSAP al entrar (clases ovz-fill, ovz-cell y ovz-delta);
   en reposo todo se ve completo, también con movimiento reducido.
   ========================================================================== */

import type { CSSProperties } from "react";
import "./ods-visuales.css";

export type TipoVisual = "compare" | "stack" | "heat";
export const esVisual = (t: string): t is TipoVisual => t === "compare" || t === "stack" || t === "heat";

export interface PuntoVisual {
  x: string;
  v: number | null;
  key: string;
  g?: string;
}

export interface VisualProps {
  puntos: PuntoVisual[];
  unidad: string;
  lang: "es" | "en";
  /** Cómo se escribe un número (cada pantalla tiene su formato). */
  fmt: (v: number) => string;
}

const T = {
  es: { sin: "s/d", suma: "Parte de la suma de las cifras que se muestran.", pp: "p. p.", var: "Variación", sube: "Sube", baja: "Baja", igual: "Sin cambio" },
  en: { sin: "n/a", suma: "Share of the sum of the figures shown.", pp: "pp", var: "Change", sube: "Up", baja: "Down", igual: "No change" },
};

const esPct = (u: string) => u.trim() === "%";
const sfx = (u: string) => (esPct(u) ? " %" : "");

/** Variación entre dos cifras: en porcentaje, puntos; en las demás, relativa. `null` si no hay base. */
function variacion(a: number, z: number, unidad: string, lang: "es" | "en", fmt: (v: number) => string): { texto: string; dir: "sube" | "baja" | "igual" } | null {
  const d = z - a;
  const dir = d > 0 ? "sube" : d < 0 ? "baja" : "igual";
  const signo = d > 0 ? "+" : d < 0 ? "−" : "";
  if (esPct(unidad)) return { texto: `${signo}${fmt(Number(Math.abs(d).toFixed(1)))} ${T[lang].pp}`, dir };
  if (a === 0) return null;
  return { texto: `${signo}${fmt(Number(Math.abs((d / a) * 100).toFixed(1)))} %`, dir };
}

/* ---------- Antes y ahora ---------------------------------------------------------- */

export function AntesYAhora({ puntos, unidad, lang, fmt }: VisualProps) {
  const ok = puntos.filter((p) => p.v !== null) as (PuntoVisual & { v: number })[];
  if (ok.length < 2) return null;
  const t = T[lang];
  const tope = Math.max(...ok.map((p) => Math.abs(p.v)), 1e-9);
  const a = ok[0];
  const z = ok[ok.length - 1];
  const c = variacion(a.v, z.v, unidad, lang, fmt);
  return (
    <div className="ovz ovz-cmp">
      <ol className="ovz-cmp__l">
        {puntos.map((p) => (
          <li key={p.key + p.x} className={p === z ? "is-ultimo" : undefined}>
            <span className="ovz-x">{p.x}</span>
            <span className="ovz-track" aria-hidden="true">
              {p.v !== null && <i className="ovz-fill" style={{ width: `${Math.max(1.5, (Math.abs(p.v) / tope) * 100)}%` }} />}
            </span>
            <b className="ovz-num">{p.v === null ? t.sin : `${fmt(p.v)}${sfx(unidad)}`}</b>
          </li>
        ))}
      </ol>
      {c && (
        <p className={`ovz-delta ovz-delta--${c.dir}`}>
          <span className="ovz-delta__n">
            <span aria-hidden="true">{c.dir === "sube" ? "↑" : c.dir === "baja" ? "↓" : "="}</span> {c.texto}
          </span>
          <small>
            {t.var} {a.x} → {z.x}
            <span className="ovz-sr"> ({t[c.dir]})</span>
          </small>
        </p>
      )}
    </div>
  );
}

/* ---------- Composición ---------------------------------------------------------------- */

export function Composicion({ puntos, unidad, lang, fmt }: VisualProps) {
  const ok = puntos.filter((p) => p.v !== null && (p.v as number) > 0) as (PuntoVisual & { v: number })[];
  const total = ok.reduce((s, p) => s + p.v, 0);
  if (ok.length < 2 || total <= 0) return null;
  const t = T[lang];
  const parte = (v: number) => (v / total) * 100;
  const pct = (v: number) => `${fmt(Number(parte(v).toFixed(1)))} %`;
  const tinte = (i: number) => Math.max(18, 100 - i * 13);
  return (
    <div className="ovz ovz-stk">
      <div className="ovz-bar" role="img" aria-label={ok.map((p) => `${p.x}: ${pct(p.v)}`).join("; ")}>
        {ok.map((p, i) => (
          <i key={p.key + p.x} className="ovz-fill ovz-seg" style={{ width: `${parte(p.v)}%`, "--t": `${tinte(i)}%` } as CSSProperties} />
        ))}
      </div>
      <ol className="ovz-leyenda">
        {ok.map((p, i) => (
          <li key={p.key + p.x}>
            <i className="ovz-sw" style={{ "--t": `${tinte(i)}%` } as CSSProperties} aria-hidden="true" />
            <span className="ovz-x">{p.x}</span>
            <span className="ovz-num">
              {fmt(p.v)}
              {sfx(unidad)}
            </span>
            <span className="ovz-pc">{pct(p.v)}</span>
          </li>
        ))}
      </ol>
      <p className="ovz-note">{t.suma}</p>
    </div>
  );
}

/* ---------- Mapa de calor ------------------------------------------------------------------ */

export function MapaDeCalor({ puntos, unidad, lang, fmt }: VisualProps) {
  const t = T[lang];
  const filas: string[] = [];
  const cols: string[] = [];
  const celda = new Map<string, number | null>();
  for (const p of puntos) {
    const g = p.g || p.key;
    if (!filas.includes(g)) filas.push(g);
    if (!cols.includes(p.x)) cols.push(p.x);
    celda.set(`${g}§${p.x}`, p.v);
  }
  if (filas.length < 1 || cols.length < 2) return null;
  const numericas = cols.every((c) => /^(19|20)\d{2}$/.test(c));
  if (numericas) cols.sort((a, b) => Number(a) - Number(b));
  const vals = [...celda.values()].filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const inten = (v: number) => (mx === mn ? 0.6 : (v - mn) / (mx - mn));
  return (
    <div className="ovz ovz-heat">
      <div className="ovz-scroll">
        <table data-filas={filas.length} data-cols={cols.length}>
          <thead>
            <tr>
              <th scope="col">
                <span className="ovz-sr">{lang === "en" ? "Measure" : "Medida"}</span>
              </th>
              {cols.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f}>
                <th scope="row">{f}</th>
                {cols.map((c) => {
                  const v = celda.get(`${f}§${c}`);
                  if (v === null || v === undefined) {
                    return (
                      <td key={c} className="ovz-cell ovz-nd">
                        {t.sin}
                      </td>
                    );
                  }
                  const i = inten(v);
                  return (
                    <td key={c} className={`ovz-cell${i > 0.55 ? " is-hi" : ""}`} style={{ "--i": i.toFixed(3) } as CSSProperties}>
                      {fmt(v)}
                      {sfx(unidad)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** El visual que corresponde al tipo. */
export function Visual({ tipo, ...p }: VisualProps & { tipo: TipoVisual }) {
  return tipo === "compare" ? <AntesYAhora {...p} /> : tipo === "stack" ? <Composicion {...p} /> : <MapaDeCalor {...p} />;
}
