/* =============================================================================
   UDES Sostenible · sección «Datos» del informe de un ODS (Pilo Publica).

   Los gráficos del informe en el lenguaje del cartel: color del ODS, número
   grande tabular, líneas finas, regla superior, sin tarjetas ni sombras. SVG
   propio (barras, línea y anillo), sin librería.

   Accesibles: el SVG lleva aria-label con la serie y una tabla equivalente
   queda oculta a la vista. En reposo todo se ve completo; OdsPilo anima al
   entrar (clases opd-ln, opd-br, opd-dn, opd-dt, opd-lv) y no lo hace con
   movimiento reducido.
   ========================================================================== */

import type { ReactNode } from "react";
import type { GraficoPub } from "../rankings/informes/tipos";
import { fmtN } from "./OdsReportParts";
import { tr } from "./i18n";
import type { Lang } from "./i18n";

const W = 420;
const H = 240;
const IZQ = 40;
const DER = 10;
const ARR = 24;
const ABA = 28;

/** Un tope «redondo» para el eje. */
function bonito(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

const dec = (v: number) => Math.min(2, (String(v).split(".")[1] ?? "").length);
const num = (v: number, lang: Lang) => fmtN(v, lang, dec(v));

function Trazo({ g, lang, pct }: { g: GraficoPub; lang: Lang; pct: boolean }) {
  const puntos = g.puntos;
  const validos = puntos.filter((p) => p.v !== null) as (typeof puntos[number] & { v: number })[];
  const sfx = pct ? " %" : "";
  const n = puntos.length;
  const ultimoIdx = puntos.reduce((a, p, i) => (p.v !== null ? i : a), 0);
  /* Con muchas marcas en el eje, se rotulan solo algunas (siempre la última). */
  const paso = Math.ceil(n / 6);
  const rotula = (i: number) => (n - 1 - i) % paso === 0;

  if (g.tipo === "donut") {
    const ult = validos[validos.length - 1];
    const v = Math.max(0, Math.min(100, ult.v));
    const cx = W / 2;
    const cy = H / 2;
    return (
      <>
        <circle cx={cx} cy={cy} r={78} fill="none" style={{ stroke: "var(--ors-rule)" }} strokeWidth={10} />
        <circle className="opd-dn" data-v={v} cx={cx} cy={cy} r={78} fill="none" style={{ stroke: "var(--ors-deep)" }} strokeWidth={10} pathLength={100} strokeDasharray={`${v} 100`} transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy + 8} textAnchor="middle" className="opd-t-c">
          {ult.x}
        </text>
      </>
    );
  }

  const pw = W - IZQ - DER;
  const ph = H - ARR - ABA;
  const mn = Math.min(0, ...validos.map((p) => p.v));
  const mx = bonito(Math.max(...validos.map((p) => p.v)) * 1.05) || 1;
  const rango = mx - mn || 1;
  const X = (i: number) => IZQ + (pw * (i + 0.5)) / n;
  const Y = (v: number) => ARR + ph * (1 - (v - mn) / rango);

  const rejilla = [0, 1, 2, 3].map((k) => {
    const v = mn + (rango * k) / 3;
    const y = Y(v);
    return (
      <g key={k}>
        <line x1={IZQ} x2={W - DER} y1={y} y2={y} className="opd-grid" />
        <text x={IZQ - 8} y={y + 4} textAnchor="end" className="opd-t-s">
          {fmtN(Number(v.toFixed(1)), lang, dec(Number(v.toFixed(1))))}
        </text>
      </g>
    );
  });
  const ejeX = puntos.map((p, i) =>
    rotula(i) ? (
      <text key={p.key + p.x} x={X(i)} y={H - 8} textAnchor="middle" className="opd-t-s">
        {p.x}
      </text>
    ) : null,
  );
  const etiqueta = (i: number) => {
    const p = puntos[i];
    if (p.v === null) return null;
    return (
      <text key={`v${i}`} className="opd-lv opd-t-v" x={X(i)} y={Y(p.v) - 8} textAnchor="middle">
        {num(p.v, lang)}
        {sfx}
      </text>
    );
  };

  if (g.tipo === "bar") {
    const bw = Math.min(40, (pw / n) * 0.5);
    const cero = Y(Math.max(0, mn));
    return (
      <>
        {rejilla}
        {puntos.map((p, i) =>
          p.v === null ? (
            <text key={p.key + p.x} x={X(i)} y={cero - 6} textAnchor="middle" className="opd-t-s">
              {lang === "en" ? "n/a" : "s/d"}
            </text>
          ) : (
            <rect
              key={p.key + p.x}
              className="opd-br"
              x={X(i) - bw / 2}
              y={Math.min(Y(p.v), cero)}
              width={bw}
              height={Math.max(1, Math.abs(cero - Y(p.v)))}
              style={{ fill: "var(--ors-deep)", opacity: i === ultimoIdx ? 1 : 0.42, transformBox: "fill-box", transformOrigin: "50% 100%" }}
            />
          ),
        )}
        {ejeX}
        {n <= 6 ? puntos.map((_, i) => etiqueta(i)) : etiqueta(ultimoIdx)}
      </>
    );
  }

  /* Línea: se corta donde falta el dato. */
  let d = "";
  let abierto = false;
  puntos.forEach((p, i) => {
    if (p.v === null) {
      abierto = false;
      return;
    }
    d += `${abierto ? " L" : d ? " M" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`;
    abierto = true;
  });
  const idx = puntos.map((p, i) => (p.v !== null ? i : -1)).filter((i) => i >= 0);
  return (
    <>
      {rejilla}
      <path className="opd-ln" d={d} fill="none" style={{ stroke: "var(--ors-deep)" }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="butt" pathLength={1} strokeDasharray="1 1" />
      {idx.map((i) => (
        <rect key={puntos[i].key + puntos[i].x} className="opd-dt" x={X(i) - (i === ultimoIdx ? 5 : 3.5)} y={Y(puntos[i].v as number) - (i === ultimoIdx ? 5 : 3.5)} width={i === ultimoIdx ? 10 : 7} height={i === ultimoIdx ? 10 : 7} style={{ fill: i === ultimoIdx ? "var(--ors-deep)" : "var(--ors-paper)", stroke: "var(--ors-deep)", transformBox: "fill-box", transformOrigin: "center" }} strokeWidth={2} />
      ))}
      {ejeX}
      {etiqueta(ultimoIdx)}
    </>
  );
}

function Dato({ g, lang, uid }: { g: GraficoPub; lang: Lang; uid: string }) {
  const pct = g.unidad.trim() === "%";
  const titulo = lang === "en" && g.titulo_en.trim() ? g.titulo_en : g.titulo;
  const tl = lang === "en" && g.titulo_en.trim() ? "en" : "es";
  const fuente = lang === "en" ? g.fuente_en : g.fuente;
  const sfx = pct ? " %" : "";
  const sin = tr(lang, "datos_sin");
  const ult = [...g.puntos].reverse().find((p) => p.v !== null);
  const resumen = g.puntos.map((p) => `${p.x}: ${p.v === null ? sin : num(p.v, lang) + sfx}`).join("; ");
  const rango = g.puntos.length > 1 && g.tipo !== "donut" ? `${g.puntos[0].x} – ${g.puntos[g.puntos.length - 1].x}` : (g.puntos[g.puntos.length - 1]?.x ?? "");
  const nota = [rango, !pct ? g.unidad : ""].filter(Boolean).join(" · ");
  const alt = `${titulo}. ${resumen}`;
  if (!ult || ult.v === null) return null;

  return (
    <figure className="opd" aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className="opd-title" lang={tl}>
        {titulo || "—"}
      </h3>
      {nota && <p className="opd-note">{nota}</p>}
      <p className="opd-big" aria-hidden="true">
        <span className="opi-cnt" data-to={ult.v} data-dec={dec(ult.v)} data-lang={lang}>
          {num(ult.v, lang)}
        </span>
        {pct && <small>%</small>}
        <span className="opd-big__x">{ult.x}</span>
      </p>
      <svg className="opd-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} focusable="false">
        <Trazo g={g} lang={lang} pct={pct} />
      </svg>
      <table className="opi-vh">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">{tr(lang, "datos_periodo")}</th>
            <th scope="col">
              {tr(lang, "datos_valor")}
              {g.unidad && !pct ? ` (${g.unidad})` : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {g.puntos.map((p) => (
            <tr key={p.key + p.x}>
              <th scope="row">{p.x}</th>
              <td>{p.v === null ? sin : num(p.v, lang) + sfx}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="opd-src">
        {tr(lang, "fuente")}: <span lang={lang}>{fuente || tr(lang, "datos_fuente_def")}</span>
      </figcaption>
    </figure>
  );
}

/** La sección completa. Sin gráficos con datos, no pinta nada (ni su hueco). */
export function OdsDatos({ graficos, lang, titular }: { graficos: GraficoPub[]; lang: Lang; titular: ReactNode }) {
  const con = graficos.filter((g) => g.puntos.some((p) => p.v !== null));
  if (!con.length) return null;
  return (
    <section className="ors-sec ors-sec--white opi-sec" id="ors-datos" aria-labelledby="opi-datos-h">
      <div className="odsx-wrap">
        <header className="opi-head">
          {titular}
        </header>
        <div className={`opd-grid-all${con.length === 1 ? " opd-grid-all--uno" : ""}`}>
          {con.map((g, i) => (
            <Dato key={g.id} g={g} lang={lang} uid={`opd-${i}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
