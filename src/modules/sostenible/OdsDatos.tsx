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
import { Visual, esVisual } from "./OdsVisuales";

const W = 420;
const H = 240;
const IZQ = 40;
const DER = 10;
const ARR = 24;
const ABA = 28;

/** Las marcas del eje: pasos «redondos» (1, 2, 2,5, 5, 10 × 10ⁿ), nunca 3,3 ni 1.666,7. */
function escala(minV: number, maxV: number): { min: number; max: number; marcas: number[] } {
  const alto = maxV > minV ? maxV : minV + 1;
  const crudo = (alto - Math.min(0, minV)) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(crudo)));
  const m = crudo / p;
  const paso = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const min = minV < 0 ? Math.floor(minV / paso) * paso : 0;
  const max = Math.ceil(alto / paso - 1e-9) * paso;
  const marcas: number[] = [];
  for (let v = min; v <= max + paso / 2; v += paso) marcas.push(Number(v.toFixed(6)));
  return { min, max, marcas };
}

/** ¿Los puntos son periodos (años)? Si no, son categorías y una línea no tiene sentido. */
const esTemporal = (g: GraficoPub) => g.puntos.length > 0 && g.puntos.every((p) => /^(19|20)\d{2}(?!\d)/.test(String(p.x).trim()));

/** Comparación entre categorías (no entre años): se dibuja en barras horizontales, donde las etiquetas nunca se cruzan. */
const esCategorias = (g: GraficoPub) => g.tipo !== "donut" && !esVisual(g.tipo) && !esTemporal(g);
const altoHorizontal = (n: number) => 16 + n * 30;

/** Parte una etiqueta larga en hasta 2 renglones de `max` caracteres. */
function partir(texto: string, max: number): string[] {
  const t = String(texto).trim();
  if (t.length <= max) return [t];
  const pal = t.split(/\s+/);
  let a = "";
  let i = 0;
  while (i < pal.length && (a + " " + pal[i]).trim().length <= max) a = (a + " " + pal[i++]).trim();
  let b = pal.slice(i).join(" ");
  if (!a) {
    a = t.slice(0, max);
    b = t.slice(max);
  }
  if (b.length > max) b = b.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
  return [a, b];
}

/** El nombre de una fuente en palabras de persona: nunca el nombre de una tabla de la base. */
const TABLAS: [RegExp, string, string][] = [
  [/^od_|^imp_/, "UDES en Cifras", "UDES in Figures"],
  [/^ranking_(responses|indicators|evidence|assignments|cycles)/, "Reporte de las oficinas de la UDES", "UDES offices' report"],
  [/^ranking_biblioteca/, "Biblioteca de evidencias de la UDES", "UDES evidence library"],
  [/^ds_/, "Datos de Sostenibilidad de la UDES", "UDES Sustainability Data"],
  [/^ugm_/, "UI GreenMetric (reporte de la UDES)", "UI GreenMetric (UDES report)"],
  [/^news_/, "Noticias de la UDES", "UDES news"],
  [/^wh_|^warehouse/, "Registros académicos de la UDES", "UDES academic records"],
];
function legible(texto: string, lang: Lang): string {
  return String(texto)
    .split(/\s*[;,]\s*/)
    .map((t) => {
      const k = t.trim();
      if (!k) return "";
      if (/^[a-z][a-z0-9_]*$/.test(k)) {
        const hit = TABLAS.find(([re]) => re.test(k));
        return hit ? (lang === "en" ? hit[2] : hit[1]) : k.replace(/_/g, " ");
      }
      return k;
    })
    .filter((t, i, a) => t && a.indexOf(t) === i)
    .join("; ");
}

const dec = (v: number) => Math.min(2, (String(v).split(".")[1] ?? "").length);
const num = (v: number, lang: Lang) => fmtN(v, lang, dec(v));

/** Barras horizontales: el nombre a la izquierda (hasta 2 renglones), la barra y su valor al final. */
function Horizontal({ g, lang, pct }: { g: GraficoPub; lang: Lang; pct: boolean }) {
  const puntos = g.puntos;
  const n = puntos.length;
  const validos = puntos.filter((p) => p.v !== null) as (typeof puntos[number] & { v: number })[];
  const esc = escala(Math.min(0, ...validos.map((p) => p.v)), Math.max(...validos.map((p) => p.v)));
  const etiqW = 150;
  const x0 = etiqW + 10;
  const x1 = W - 54;
  const rango = esc.max - esc.min || 1;
  const X = (v: number) => x0 + ((x1 - x0) * (v - esc.min)) / rango;
  const alto = altoHorizontal(n);
  const fila = (alto - 16) / n;
  const mayor = validos.reduce((a, p) => (p.v > a ? p.v : a), -Infinity);
  const sfx = pct ? " %" : "";
  return (
    <>
      {esc.marcas.map((v, k) => (
        <line key={k} x1={X(v)} x2={X(v)} y1={4} y2={alto - 12} className="opd-grid" />
      ))}
      {puntos.map((p, i) => {
        const yc = 8 + fila * (i + 0.5);
        const lineas = partir(String(p.x), 30);
        const h = Math.min(14, fila * 0.55);
        return (
          <g key={p.key + p.x}>
            <text x={etiqW} y={yc - ((lineas.length - 1) * 4) + 2.5} textAnchor="end" className="opd-t-s">
              <title>{String(p.x)}</title>
              {lineas.map((l, j) => (
                <tspan key={j} x={etiqW} dy={j === 0 ? 0 : 8.5}>
                  {l}
                </tspan>
              ))}
            </text>
            {p.v === null ? (
              <text x={x0 + 4} y={yc + 2.5} className="opd-t-s">
                {lang === "en" ? "n/a" : "s/d"}
              </text>
            ) : (
              <>
                <rect className="opd-bh" x={Math.min(X(p.v), X(Math.max(0, esc.min)))} y={yc - h / 2} width={Math.max(1, Math.abs(X(p.v) - X(Math.max(0, esc.min))))} height={h} style={{ fill: "var(--ors-deep)", opacity: p.v === mayor ? 1 : 0.42, transformBox: "fill-box", transformOrigin: "0% 50%" }} />
                <text className="opd-lv opd-t-v" x={Math.max(X(p.v), X(Math.max(0, esc.min))) + 5} y={yc + 2.6}>
                  {num(p.v, lang)}
                  {sfx}
                </text>
              </>
            )}
          </g>
        );
      })}
      <line x1={X(Math.max(0, esc.min))} x2={X(Math.max(0, esc.min))} y1={4} y2={alto - 12} stroke="currentColor" strokeWidth={1} style={{ stroke: "var(--ors-rule)" }} />
    </>
  );
}

function Trazo({ g, lang, pct }: { g: GraficoPub; lang: Lang; pct: boolean }) {
  if (esCategorias(g)) return <Horizontal g={g} lang={lang} pct={pct} />;
  const puntos = g.puntos;
  /* Una línea solo une periodos: con categorías se dibujan barras. */
  const tipo = g.tipo === "line" && !esTemporal(g) ? "bar" : g.tipo;
  const categorias = tipo === "bar" && !esTemporal(g);
  const validos = puntos.filter((p) => p.v !== null) as (typeof puntos[number] & { v: number })[];
  const sfx = pct ? " %" : "";
  const n = puntos.length;
  const ultimoIdx = puntos.reduce((a, p, i) => (p.v !== null ? i : a), 0);
  /* Con muchas marcas en el eje, se rotulan solo algunas (siempre la última). */
  const paso = Math.ceil(n / 6);
  const rotula = (i: number) => (n - 1 - i) % paso === 0;

  if (tipo === "donut") {
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
  /* Etiquetas largas (categorías): hasta 2 renglones, a lo ancho de su hueco. */
  const maxCar = Math.max(6, Math.floor(pw / n / 5.6));
  const partes = puntos.map((p) => (categorias ? partir(String(p.x), maxCar) : [String(p.x)]));
  const renglones = Math.max(1, ...partes.map((x) => x.length));
  const aba = ABA + (renglones - 1) * 13;
  const ph = H - ARR - aba;
  const esc = escala(Math.min(0, ...validos.map((p) => p.v)), Math.max(...validos.map((p) => p.v)));
  const mn = esc.min;
  const mx = esc.max;
  const rango = mx - mn || 1;
  const X = (i: number) => IZQ + (pw * (i + 0.5)) / n;
  const Y = (v: number) => ARR + ph * (1 - (v - mn) / rango);

  const rejilla = esc.marcas.map((v, k) => {
    const y = Y(v);
    return (
      <g key={k}>
        <line x1={IZQ} x2={W - DER} y1={y} y2={y} className="opd-grid" />
        <text x={IZQ - 8} y={y + 4} textAnchor="end" className="opd-t-s">
          {fmtN(v, lang, dec(v))}
        </text>
      </g>
    );
  });
  const ejeX = puntos.map((p, i) =>
    rotula(i) || categorias ? (
      <text key={p.key + p.x} x={X(i)} y={H - 8 - (renglones - 1) * 13} textAnchor="middle" className="opd-t-s">
        <title>{String(p.x)}</title>
        {partes[i].map((l, j) => (
          <tspan key={j} x={X(i)} dy={j === 0 ? 0 : 13}>
            {l}
          </tspan>
        ))}
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

  if (tipo === "bar") {
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
        {n <= 6 || categorias ? puntos.map((_, i) => etiqueta(i)) : etiqueta(ultimoIdx)}
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

function Dato({ g, lang, uid, fuenteAparte }: { g: GraficoPub; lang: Lang; uid: string; fuenteAparte?: boolean }) {
  const pct = g.unidad.trim() === "%";
  const titulo = lang === "en" && g.titulo_en.trim() ? g.titulo_en : g.titulo;
  const tl = lang === "en" && g.titulo_en.trim() ? "en" : "es";
  const fuente = legible(lang === "en" ? g.fuente_en || g.fuente : g.fuente, lang);
  const visual = esVisual(g.tipo);
  const temporal = !visual && (esTemporal(g) || g.tipo === "donut");
  const sfx = pct ? " %" : "";
  const sin = tr(lang, "datos_sin");
  const ult = [...g.puntos].reverse().find((p) => p.v !== null);
  const resumen = g.puntos.map((p) => `${p.x}: ${p.v === null ? sin : num(p.v, lang) + sfx}`).join("; ");
  const rango = visual && g.tipo !== "compare" ? "" : g.puntos.length > 1 && g.tipo !== "donut" ? `${g.puntos[0].x} – ${g.puntos[g.puntos.length - 1].x}` : (g.puntos[g.puntos.length - 1]?.x ?? "");
  const nota = [rango, !pct ? g.unidad : ""].filter(Boolean).join(" · ");
  const alt = `${titulo}. ${resumen}`;
  if (!ult || ult.v === null) return null;

  return (
    <figure className={`opd${g.tipo === "heat" ? " opd--ancho" : ""}`} aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className="opd-title" lang={tl}>
        {titulo || "—"}
      </h3>
      {nota && <p className="opd-note">{nota}</p>}
      {temporal && (
        <p className="opd-big" aria-hidden="true">
          <span className="opi-cnt" data-to={ult.v} data-dec={dec(ult.v)} data-lang={lang}>
            {num(ult.v, lang)}
          </span>
          {pct && <small>%</small>}
          <span className="opd-big__x">{ult.x}</span>
        </p>
      )}
      {esVisual(g.tipo) ? (
        <Visual tipo={g.tipo} puntos={g.puntos} unidad={g.unidad} lang={lang} fmt={(v) => num(v, lang)} />
      ) : (
        <svg className="opd-svg" viewBox={`0 0 ${W} ${esCategorias(g) ? altoHorizontal(g.puntos.length) : H}`} role="img" aria-label={alt} focusable="false">
          <Trazo g={g} lang={lang} pct={pct} />
        </svg>
      )}
      {g.tipo !== "heat" && (
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
      )}
      {!fuenteAparte && (
        <figcaption className="opd-src">
          {tr(lang, "fuente")}: <span lang={lang}>{fuente || tr(lang, "datos_fuente_def")}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** La sección completa. Sin gráficos con datos, no pinta nada (ni su hueco). */
export function OdsDatos({ graficos, lang, titular }: { graficos: GraficoPub[]; lang: Lang; titular: ReactNode }) {
  const con = graficos.filter((g) => g.puntos.some((p) => p.v !== null));
  if (!con.length) return null;
  /* Agrupados por fuente: los gráficos que comparten fuente van juntos y la fuente se dice una sola vez. */
  const fuenteDe = (g: GraficoPub) => legible(lang === "en" ? g.fuente_en || g.fuente : g.fuente, lang) || tr(lang, "datos_fuente_def");
  const grupos: { fuente: string; items: { g: GraficoPub; i: number }[] }[] = [];
  con.forEach((g, i) => {
    const f = fuenteDe(g);
    const grupo = grupos.find((x) => x.fuente === f);
    if (grupo) grupo.items.push({ g, i });
    else grupos.push({ fuente: f, items: [{ g, i }] });
  });
  return (
    <section className="ors-sec ors-sec--white opi-sec" id="ors-datos" aria-labelledby="opi-datos-h">
      <div className="odsx-wrap">
        <header className="opi-head">
          {titular}
        </header>
        {grupos.map((grupo) => (
          <div className="opd-grupo" key={grupo.fuente}>
            <div className={`opd-grid-all${grupo.items.length === 1 ? " opd-grid-all--uno" : ""}`}>
              {grupo.items.map(({ g, i }) => (
                <Dato key={g.id} g={g} lang={lang} uid={`opd-${i}`} fuenteAparte={grupo.items.length > 1} />
              ))}
            </div>
            {grupo.items.length > 1 && (
              <p className="opd-src opd-src--grupo">
                {tr(lang, "fuente")}: <span lang={lang}>{grupo.fuente}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
