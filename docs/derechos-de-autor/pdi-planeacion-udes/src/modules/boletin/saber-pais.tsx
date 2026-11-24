/* =============================================================================
   Boletín · Saber PRO frente al país.

   Siete hojas A4, una entrada de la plantilla («saber:<conjunto>:pais»):

     1. Resumen: las seis competencias en el último año, con el promedio
        nacional, la UDES y cada campus.
     2 a 7. Una hoja por competencia (puntaje global, lectura crítica,
        razonamiento cuantitativo, competencias ciudadanas, comunicación
        escrita, inglés): la banda del país frente a la UDES y cada campus del
        último año, la evolución de la brecha con huecos rayados, las cifras de
        cierre y la tabla equivalente.

   Todo en milímetros y con la paleta fija del papel (--bol-div-*): azul si la
   UDES va sobre el país, terracota si va bajo. Un año sin dato se raya y la
   línea se corta; nunca se dibuja un cero. Mejorar es subir la brecha, no el
   puntaje bruto. La misma función (`saberPanorama`) arma la ficha web.
   ========================================================================== */

import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ALL_YEARS } from "../datos-abiertos/data/terms";
import {
  SABER_COMPETENCIES,
  SABER_FEW_LEVELS,
  SABER_FEW_MEAN,
  SABER_GAP_LEGEND,
  competencyInfo,
  saberGapTone,
  saberPanoGapDomain,
  saberPanorama,
} from "../datos-abiertos/data/saber-pro";
import type { SaberCompetency, SaberPanoPoint, SaberPanoRow, SaberPanoScope, SaberPanorama, SaberProData } from "../datos-abiertos/data/saber-pro";
import { SwatchLegend } from "./figures";
import "./saber-pais.css";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const signed = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};
const gapWords = (gap: number) => {
  const r = Math.abs(Math.round(gap));
  return r === 0 ? "igual al país" : `${r} ${r === 1 ? "punto" : "puntos"} ${gap > 0 ? "sobre" : "bajo"} el país`;
};
const sideWord = (sign: number) => (sign > 0 ? "sobre" : sign < 0 ? "bajo" : "igual que");

type SheetComponent = (props: {
  title: string;
  description?: string;
  source: string;
  notes?: [string, ReactNode][];
  cut?: string;
  wide?: boolean;
  children: ReactNode;
}) => ReactNode;

/** Las hojas piden el panorama hasta el corte del boletín, no el de todos los años publicados. */
function panoramaUpTo(data: SaberProData, cut: number): { pano: SaberPanorama; year: number } | null {
  const trimmed = cut === ALL_YEARS ? data : { ...data, results: data.results.filter((r) => r.year <= cut) };
  const probe = saberPanorama(trimmed, 0);
  const withData = probe.years.filter((y) => probe.rows.some((r) => r.serie.some((p) => p.year === y && p.value !== null)));
  if (!probe.rows.length || !withData.length) return null;
  const year = withData[withData.length - 1];
  return { pano: saberPanorama(trimmed, year), year };
}

/* --- Piezas de dibujo ------------------------------------------------------------- */

const place = (value: number, [lo, hi]: [number, number], from: number, span: number) => from + ((value - lo) / (hi - lo)) * span;

function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="1.6" className="bol-pais__hatch" />
    </pattern>
  );
}

const lastWith = (serie: SaberPanoPoint[], year: number) => serie.find((p) => p.year === year) ?? null;

interface BandItem {
  key: string;
  label: string;
  code?: string;
  point: SaberPanoPoint | null;
  strong?: boolean;
  note?: string;
}

/**
 * La banda del país frente a la UDES: una fila por ámbito (o por competencia),
 * con la marca del país, el punto de la UDES y la barra que los une.
 */
function BandChart({ items, domain, year, label, width = 178 }: { items: BandItem[]; domain: [number, number]; year: number; label: string; width?: number }) {
  const uid = useId().replace(/:/g, "");
  const L = 46;
  const R = 26;
  const plot = width - L - R;
  const ROW = 6.4;
  const TOP = 5;
  const height = TOP + items.length * ROW + 1;
  const ticks: number[] = [];
  for (let v = domain[0]; v <= domain[1]; v += 10) ticks.push(v);

  return (
    <svg className="bol-chart bol-pais__band" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <Hatch id={`h${uid}`} />
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line className="bol-chart__grid" x1={place(v, domain, L, plot)} x2={place(v, domain, L, plot)} y1={TOP - 1.4} y2={height - 0.6} />
          <text className="bol-chart__tick" x={place(v, domain, L, plot)} y={2.6} textAnchor="middle">
            {v}
          </text>
        </g>
      ))}
      <text className="bol-chart__tick" x={0} y={2.6}>
        Puntos · {year}
      </text>
      {items.map((item, i) => {
        const y = TOP + i * ROW;
        const mid = y + 2.6;
        const p = item.point;
        const has = p !== null && p.value !== null;
        const few = p?.kind === "few";
        const faint = Boolean(p?.low) && has;
        const natX = p && p.national !== null ? place(p.national, domain, L, plot) : null;
        const valX = has ? place(p!.value!, domain, L, plot) : null;
        const tone = p && p.gap !== null ? saberGapTone(p.gap) : "mid";
        return (
          <g key={item.key} opacity={faint ? 0.6 : undefined}>
            <text className={item.strong ? "bol-pais__name bol-pais__name--strong" : "bol-pais__name"} x={0} y={mid + 0.8}>
              {item.code ? `${item.code}  ` : ""}
              {item.label}
            </text>
            {!has && (
              <>
                <rect x={L} y={y} width={plot} height={5.2} fill={`url(#h${uid})`} />
                <text className="bol-chart__tick" x={L + plot / 2} y={mid + 0.8} textAnchor="middle" style={{ fill: "var(--bol-ink-2)" }}>
                  {item.note ?? "Sin dato"}
                </text>
              </>
            )}
            {has && <line className="bol-chart__grid" x1={L} x2={L + plot} y1={mid} y2={mid} />}
            {has && natX !== null && !few && valX !== null && (
              <rect x={Math.min(natX, valX)} y={mid - 1.2} width={Math.max(0.5, Math.abs(valX - natX))} height={2.4} style={{ fill: `var(--bol-div-${tone})` } as CSSProperties} />
            )}
            {natX !== null && <line className="bol-pais__ghost" x1={natX} x2={natX} y1={y - 0.2} y2={y + 5.4} />}
            {has && valX !== null && (
              <circle className="bol-pais__dot" data-few={few || faint || undefined} cx={valX} cy={mid} r={1.35} strokeDasharray={few ? "0.6 0.5" : undefined} />
            )}
            {has && (
              <text className="bol-chart__value" x={width - 13.5} y={mid + 0.9} textAnchor="end">
                {integer.format(Math.round(p!.value!))}
              </text>
            )}
            {has && (
              <text className="bol-pais__gap" data-few={few || undefined} x={width} y={mid + 0.9} textAnchor="end">
                {p!.gap === null ? "sin país" : few ? `(${signed(p!.gap)})` : signed(p!.gap)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** La evolución de la brecha: el ámbito enfocado grueso con su área, los demás finos. */
function EvolutionChart({ rows, focusKey, years, width = 178, label }: { rows: SaberPanoRow[]; focusKey: string; years: number[]; width?: number; label: string }) {
  const uid = useId().replace(/:/g, "");
  const [lo, hi] = saberPanoGapDomain(rows, focusKey);
  const L = 12;
  const R = 26;
  const plot = width - L - R;
  const TOP = 3;
  const H = 46;
  const height = TOP + H + 6;
  const step = years.length > 1 ? plot / (years.length - 1) : 0;
  const X = (i: number) => L + i * step;
  const Y = (g: number) => TOP + (H * (hi - Math.max(lo, Math.min(hi, g)))) / (hi - lo);
  const zero = Y(0);
  const focus = rows.find((r) => r.scope.key === focusKey);
  const others = rows.filter((r) => r.scope.key !== focusKey);

  const runs = (serie: SaberPanoPoint[]) => {
    const out: { i: number; p: SaberPanoPoint }[][] = [];
    let cur: { i: number; p: SaberPanoPoint }[] | null = null;
    serie.forEach((p, i) => {
      if (p.gap === null) {
        cur = null;
        return;
      }
      if (!cur) {
        cur = [];
        out.push(cur);
      }
      cur.push({ i, p });
    });
    return out;
  };
  const path = (run: { i: number; p: SaberPanoPoint }[]) => run.map((r, j) => `${j ? "L" : "M"}${X(r.i).toFixed(2)} ${Y(r.p.gap!).toFixed(2)}`).join(" ");

  // Etiquetas al final de cada línea, separadas para que no se pisen.
  const ends = rows
    .map((r) => {
      const idx = r.serie.reduce((acc, p, i) => (p.gap !== null ? i : acc), -1);
      return idx < 0 ? null : { key: r.scope.key, text: r.scope.kind === "udes" ? "UDES" : r.scope.label, y: Y(r.serie[idx].gap!), x: X(idx), strong: r.scope.key === focusKey };
    })
    .filter((e): e is { key: string; text: string; y: number; x: number; strong: boolean } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) if (ends[i].y - ends[i - 1].y < 2.8) ends[i].y = ends[i - 1].y + 2.8;

  const grid: number[] = [];
  for (let g = Math.ceil(lo / 5) * 5; g <= hi; g += 5) if (g !== 0) grid.push(g);

  return (
    <svg className="bol-chart bol-pais__evo" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <Hatch id={`h${uid}`} />
        <clipPath id={`a${uid}`}>
          <rect x={0} y={0} width={width} height={zero} />
        </clipPath>
        <clipPath id={`b${uid}`}>
          <rect x={0} y={zero} width={width} height={height - zero} />
        </clipPath>
      </defs>
      {focus?.serie.map((p, i) =>
        p.gap === null ? <rect key={p.year} x={Math.max(L - 1, X(i) - step / 2)} y={TOP} width={Math.min(step, X(i) + step / 2 - Math.max(L - 1, X(i) - step / 2))} height={H} fill={`url(#h${uid})`} /> : null,
      )}
      {grid.map((g) => (
        <g key={g}>
          <line className="bol-chart__grid" x1={L} x2={L + plot} y1={Y(g)} y2={Y(g)} />
          <text className="bol-chart__tick" x={L - 1.2} y={Y(g) + 0.8} textAnchor="end">
            {signed(g)}
          </text>
        </g>
      ))}
      {others.map((r) =>
        runs(r.serie).map((run, k) =>
          run.length > 1 ? <path key={`${r.key}-${k}`} className="bol-pais__line" d={path(run)} fill="none" /> : null,
        ),
      )}
      {focus &&
        runs(focus.serie).map((run, k) => {
          if (run.length < 2) return null;
          const d = `${path(run)} L${X(run[run.length - 1].i).toFixed(2)} ${zero.toFixed(2)} L${X(run[0].i).toFixed(2)} ${zero.toFixed(2)} Z`;
          return (
            <g key={k}>
              <path d={d} clipPath={`url(#a${uid})`} style={{ fill: "var(--bol-div-pos-1)" }} opacity={0.5} />
              <path d={d} clipPath={`url(#b${uid})`} style={{ fill: "var(--bol-div-neg-1)" }} opacity={0.5} />
            </g>
          );
        })}
      <line className="bol-pais__zero" x1={L} x2={L + plot} y1={zero} y2={zero} />
      <text className="bol-chart__tick" x={L - 1.2} y={zero + 0.8} textAnchor="end" fontWeight={700}>
        0
      </text>
      {focus &&
        runs(focus.serie).map((run, k) => (run.length > 1 ? <path key={k} className="bol-pais__line bol-pais__line--focus" d={path(run)} fill="none" /> : null))}
      {focus?.serie.map((p, i) => {
        if (p.gap === null) return null;
        const hollow = p.low || p.kind === "few";
        return <circle key={p.year} className="bol-pais__dot" data-few={hollow || undefined} cx={X(i)} cy={Y(p.gap)} r={0.95} strokeDasharray={p.kind === "few" ? "0.5 0.4" : undefined} />;
      })}
      {years.map((y, i) => (
        <text key={y} className="bol-chart__year" x={X(i)} y={height - 0.6} textAnchor="middle">
          {y}
        </text>
      ))}
      {ends.map((e) => (
        <text key={e.key} className="bol-chart__tick" x={e.x + 1.8} y={e.y + 0.8} style={e.strong ? { fill: "var(--bol-navy)", fontWeight: 800 } : undefined}>
          {e.text}
        </text>
      ))}
    </svg>
  );
}

/** La tabla de la serie: una fila por ámbito, una columna por año y el cierre. */
function SeriesTable({ rows, years, caption }: { rows: SaberPanoRow[]; years: number[]; caption: string }) {
  return (
    <div className="bol-table-fit">
      <table className="bol-table bol-saber-gap" data-density="max">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Ámbito</th>
            {years.map((y) => (
              <th key={y} scope="col">
                {y}
              </th>
            ))}
            <th scope="col">Cambio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-level={row.scope.kind === "udes" ? "udes" : undefined}>
              <th scope="row">{row.scope.label}</th>
              {row.serie.map((p) => {
                if (p.gap === null) {
                  return (
                    <td key={p.year} data-empty>
                      —
                    </td>
                  );
                }
                if (p.kind === "few") {
                  return (
                    <td key={p.year} data-few>
                      ({signed(p.gap)})
                    </td>
                  );
                }
                return (
                  <td key={p.year} data-tone={saberGapTone(p.gap)} data-low={p.low || undefined}>
                    {signed(p.gap)}
                  </td>
                );
              })}
              <td data-empty={!row.variacion || undefined}>
                {row.variacion ? (row.variacion.few ? `(${signed(row.variacion.delta)})` : signed(row.variacion.delta)) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Hojas ------------------------------------------------------------------------- */

export function saberPaisUnits(data: SaberProData, cut: number, Sheet: SheetComponent): { node: ReactNode; title: string; tight?: boolean }[] {
  const built = panoramaUpTo(data, cut);
  if (!built) return [];
  const { pano, year } = built;
  const nationals = pano.rows.some((r) => r.serie.some((p) => p.national !== null));
  if (!nationals) return [];
  const span = `${pano.years[0]}–${pano.years[pano.years.length - 1]}`;
  const cutNote = cut === ALL_YEARS ? `Todos los años publicados (${span})` : `Hasta ${cut}`;
  const udes = pano.scopes.find((s) => s.kind === "udes");
  const sedes = pano.scopes.filter((s) => s.kind === "sede");
  const focus: SaberPanoScope | undefined = udes ?? sedes[0];
  if (!focus) return [];
  const rowOf = (scope: SaberPanoScope, competency: SaberCompetency) => pano.rows.find((r) => r.scope.key === scope.key && r.competency === competency);
  const nationalAt = (competency: SaberCompetency, y: number) => pano.rows.find((r) => r.competency === competency)?.serie.find((p) => p.year === y)?.national ?? null;
  const partialYear = sedes.length > 0 && sedes.every((s) => SABER_COMPETENCIES.every((c) => rowOf(s, c.key)?.serie.find((p) => p.year === year)?.value == null));
  const units: { node: ReactNode; title: string; tight?: boolean }[] = [];

  const readNote: [string, ReactNode] = [
    "Lectura",
    "Una barra va de la marca del país (línea punteada) al punto de la UDES. Azul si la UDES va sobre el país, terracota si va bajo; la cifra con signo dice cuántos puntos.",
  ];
  const fewNote: [string, ReactNode] = [
    "Pocos evaluados",
    `Con menos de ${SABER_FEW_MEAN} evaluados la cifra va entre paréntesis y sin barra; con menos de ${SABER_FEW_LEVELS}, atenuada.`,
  ];
  const methodNote: [string, ReactNode] = [
    "Método",
    "La brecha es el promedio de la UDES menos el promedio nacional del mismo año. Mejorar es subir la brecha, no el puntaje bruto. El promedio de toda la UDES es el oficial del ICFES; el de un campus es el promedio de sus evaluados.",
  ];
  const blankNote: ReactNode = partialYear ? `El ICFES publicó ${year} solo para toda la UDES; por eso los campus quedan rayados.` : "Un año sin dato se raya: no se dibuja como cero.";

  /* Hoja 1: las seis competencias en un año. */
  const summaryTitle = "Saber PRO · Frente al país · resumen";
  const summaryItems: BandItem[] = SABER_COMPETENCIES.map((c) => ({
    key: c.key,
    label: c.label,
    code: c.code,
    point: rowOf(focus, c.key)?.serie.find((p) => p.year === year) ?? null,
    note: "Sin dato",
  }));
  const above = summaryItems.filter((i) => i.point?.gap != null && Math.round(i.point.gap) > 0).length;
  const measured = summaryItems.filter((i) => i.point?.gap != null).length;

  units.push({
    title: summaryTitle,
    node: (
      <Sheet
        title={summaryTitle}
        description={`Cómo está ${focus.kind === "udes" ? "la UDES" : focus.label} frente al promedio nacional en las seis competencias genéricas de Saber PRO, en ${year}, y cuánto se aleja cada campus.`}
        source={data.source}
        notes={[readNote, fewNote, ["Año sin campus", blankNote], methodNote, ["Corte", cutNote]]}
        wide
      >
        <dl className="bol-saber-keys">
          <div>
            <dt>
              {focus.kind === "udes" ? "Toda la UDES" : focus.label} · {year}
            </dt>
            <dd>
              <b>{measured ? `${above} de ${measured}` : "—"}</b>
              <span>competencias sobre el país</span>
            </dd>
          </div>
          {(() => {
            const g = rowOf(focus, "global")?.serie.find((p) => p.year === year);
            return g && g.value !== null ? (
              <div>
                <dt>Puntaje global</dt>
                <dd>
                  <b>{integer.format(Math.round(g.value))}</b>
                  <span>{g.national !== null ? `país ${integer.format(Math.round(g.national))} · ${g.gap !== null ? gapWords(g.gap) : ""}` : "sin promedio nacional"}</span>
                </dd>
              </div>
            ) : null;
          })()}
        </dl>
        <BandChart items={summaryItems} domain={pano.domain.points} year={year} label={`Promedio de la UDES frente al promedio nacional en las seis competencias, ${year}`} />
        <SwatchLegend labels={SABER_GAP_LEGEND.map((s) => s.label)} colors={SABER_GAP_LEGEND.map((s) => `var(--bol-div-${s.tone})`)} />
        <div className="bol-table-fit">
          <table className="bol-table bol-saber-gap" data-density="max">
            <caption>Promedio de {year} y diferencia con el país, por campus</caption>
            <thead>
              <tr>
                <th scope="col">Competencia</th>
                <th scope="col">País</th>
                {pano.scopes.map((s) => (
                  <th key={s.key} scope="col">
                    {s.kind === "udes" ? "UDES" : s.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SABER_COMPETENCIES.map((c) => {
                const national = nationalAt(c.key, year);
                return (
                  <tr key={c.key}>
                    <th scope="row">{c.label}</th>
                    <td data-empty={national === null || undefined}>{national === null ? "—" : integer.format(Math.round(national))}</td>
                    {pano.scopes.map((s) => {
                      const p = rowOf(s, c.key)?.serie.find((x) => x.year === year);
                      if (!p || p.value === null) {
                        return (
                          <td key={s.key} data-empty>
                            —
                          </td>
                        );
                      }
                      const text = `${integer.format(Math.round(p.value))}${p.gap === null ? "" : ` (${signed(p.gap)})`}`;
                      return p.kind === "few" || p.gap === null ? (
                        <td key={s.key} data-few>
                          {text}
                        </td>
                      ) : (
                        <td key={s.key} data-tone={saberGapTone(p.gap)}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sheet>
    ),
  });

  /* Hojas 2 a 7: una por competencia. */
  for (const c of SABER_COMPETENCIES) {
    const info = competencyInfo(c.key);
    const title = `Saber PRO · Frente al país · ${info.label}`;
    const rows = pano.scopes.map((s) => rowOf(s, c.key)).filter((r): r is SaberPanoRow => r !== undefined);
    const focusRow = rows.find((r) => r.scope.key === focus.key);
    if (!focusRow || !rows.some((r) => r.serie.some((p) => p.gap !== null))) continue;
    const v = focusRow.variacion;
    const now = focusRow.serie.find((p) => p.year === year);
    const national = nationalAt(c.key, year);
    const items: BandItem[] = [
      ...rows.map((r) => ({
        key: r.scope.key,
        label: r.scope.kind === "udes" ? "Toda la UDES" : r.scope.label,
        point: r.serie.find((p) => p.year === year) ?? null,
        strong: r.scope.kind === "udes",
        note: r.scope.kind === "sede" && partialYear ? `Sin dato en ${year}` : "Sin dato",
      })),
    ];

    units.push({
      title,
      node: (
        <Sheet
          title={title}
          description={`El promedio de ${info.label.toLowerCase()} de la UDES y de cada campus frente al promedio nacional: el último año y cómo cambió la brecha con el país.`}
          source={data.source}
          notes={[
            readNote,
            fewNote,
            ["Huecos", blankNote],
            ["Evolución", "La línea gruesa es la brecha de la UDES; las finas, la de cada campus. Sobre el cero, la UDES supera al país. Un año sin dato corta la línea."],
            ["Corte", cutNote],
          ]}
          wide
        >
          <dl className="bol-saber-keys">
            {now && now.value !== null && (
              <div>
                <dt>
                  {focus.kind === "udes" ? "Promedio UDES" : focus.label} · {year}
                </dt>
                <dd>
                  <b>{integer.format(Math.round(now.value))}</b>
                  <span>
                    {national !== null ? `país ${integer.format(Math.round(national))}` : "sin promedio nacional"}
                    {now.gap !== null ? ` · ${gapWords(now.gap)}` : ""}
                  </span>
                </dd>
              </div>
            )}
            {v && (
              <div>
                <dt>Brecha desde {v.first.year}</dt>
                <dd>
                  <b>{v.few ? `(${signed(v.delta)})` : signed(v.delta)}</b>
                  <span>{v.label.toLowerCase()}</span>
                </dd>
              </div>
            )}
            {v && (
              <div>
                <dt>Años seguidos</dt>
                <dd>
                  <b>{v.streak}</b>
                  <span>{sideWord(v.sign)} el país</span>
                </dd>
              </div>
            )}
          </dl>

          <figure className="bol-pais__figure">
            <figcaption>
              {info.label}: promedio nacional (línea punteada) y promedio de la UDES, {year}
            </figcaption>
            <BandChart items={items} domain={pano.domain.points} year={year} label={`${info.label}: promedio nacional y de la UDES por campus, ${year}`} />
          </figure>
          <SwatchLegend labels={SABER_GAP_LEGEND.map((s) => s.label)} colors={SABER_GAP_LEGEND.map((s) => `var(--bol-div-${s.tone})`)} />

          <figure className="bol-pais__figure">
            <figcaption>Brecha con el país por año, en puntos (promedio menos nacional)</figcaption>
            <EvolutionChart rows={rows} focusKey={focus.key} years={pano.years} label={`${info.label}: brecha con el país por año, ${span}`} />
          </figure>

          {v && (
            <p className="bol-pais__close">
              <b>{v.label}.</b> En {v.first.year} la brecha era {signed(v.first.gap!)} y en {v.last.year}, {signed(v.last.gap!)}
              {v.few ? "; con menos de 10 evaluados en un extremo, la cifra no se compara" : ""}. Mejor año {v.best.year} ({signed(v.best.gap)}); peor {v.worst.year} ({signed(v.worst.gap)}).
              {v.low ? ` Algunos años tienen menos de ${SABER_FEW_LEVELS} evaluados.` : ""}
            </p>
          )}

          <SeriesTable rows={rows} years={pano.years} caption={`${info.label}: brecha con el país por año y ámbito, en puntos. Entre paréntesis, menos de ${SABER_FEW_MEAN} evaluados`} />
        </Sheet>
      ),
    });
  }
  return units;
}
