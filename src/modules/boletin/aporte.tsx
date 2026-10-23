/* =============================================================================
   Boletín · Aporte de los programas (Saber PRO y Saber TyT).

   Hojas A4 en milímetros, sin animación y con la paleta fija del papel
   (--bol-div-*). Cada cifra lleva su glifo o su número: todo se lee sin color,
   y las cifras de programas con menos de 10 evaluados van entre paréntesis.

   Una entrada del boletín por competencia con modelo, en el orden del
   tablero: lectura crítica, razonamiento cuantitativo, competencias
   ciudadanas e inglés. El puntaje global y la comunicación escrita no tienen
   modelo en los documentos y no tienen hoja: no se muestran vacías.

     · Saber PRO, por competencia: «Aporte por programa» y «Cuadrantes de
       aporte». Una hoja más para toda la prueba: diferencia entre programas,
       método, límites y cita.
     · Saber TyT, por competencia: una hoja con el aporte y lo que pesa
       Saber 11. Una hoja más con diferencia entre programas, método y cita.

   Las cifras salen de data/saber-aporte.ts (lectura de figura, con la
   advertencia de que los dos documentos se contradicen en puntos concretos).
   ========================================================================== */

import type { ReactNode } from "react";
import {
  APORTE_CITA,
  APORTE_CONTRADICCIONES,
  APORTE_FEW,
  APORTE_LIMITS,
  APORTE_ATTEN,
  APORTE_MODELED,
  APORTE_NOBS,
  APORTE_NPROG,
  APORTE_STEPS,
  APORTE_TESTS,
  APORTE_VERDICT_SHORT,
  COEF_PRO,
  COEF_PRO_LABELS,
  COEF_TYT,
  COEF_TYT_LABELS,
  FIG5,
  NCOMP,
  PRO_CUADRANTES,
  QUAD_DEFS,
  QUAD_NAMES,
  TYT_LECTURA,
  VAR_PRO,
  VAR_TYT,
  aporteAt,
  aporteCompLabel,
  aporteCounts,
  aporteNum as nf,
  aporteRefList,
  aporteRows,
  aporteSigned as sg,
  aporteSummary,
  icc,
  isAporteComp,
} from "../datos-abiertos/data/saber-aporte";
import type { AporteComp, AportePart, AporteRowView, AporteStatus, AporteTest } from "../datos-abiertos/data/saber-aporte";
import type { Report } from "../datos-abiertos/data/types";
import { DataTable } from "./figures";

type SheetComponent = (props: {
  title: string;
  description?: string;
  source: string;
  notes?: [string, ReactNode][];
  cut?: string;
  wide?: boolean;
  children: ReactNode;
}) => ReactNode;
type ContinuationComponent = (props: { title: string; from: number; to: number; total: number; children: ReactNode }) => ReactNode;

/** Programas que caben en una hoja con el dibujo completo; con más, sigue en continuación. */
const MAX_ROWS = 28;

/* --- Claves y entradas --------------------------------------------------------------- */

/** Las hojas del aporte que un informe puede publicar: las de cada bloque que tiene. */
export function aporteRefs(report: Report): { ref: string; title: string }[] {
  const list: { ref: string; title: string }[] = [];
  if ((report.saberPro ?? []).some((sp) => sp.results.length > 0)) list.push(...aporteRefList("pro"));
  if ((report.saberTyt ?? []).length > 0) list.push(...aporteRefList("tyt"));
  return list;
}

/** La oficina que reporta la hoja "aporte:<prueba>:<parte>", para acreditarla en la contraportada. */
export function aporteOfficeOf(ref: string): string | undefined {
  const parsed = ref.startsWith("aporte:") ? parseAporteKey(ref.slice(7)) : null;
  return parsed ? APORTE_TESTS[parsed.test].office : undefined;
}

/** "pro:lc" o "tyt:metodo". */
export function parseAporteKey(key: string): { test: AporteTest; part: AportePart } | null {
  const [test, part] = key.split(":");
  if (test !== "pro" && test !== "tyt") return null;
  if (part === "metodo" || isAporteComp(part)) return { test, part };
  return null;
}

/* --- Dibujos en milímetros ------------------------------------------------------------ */

const TONE: Record<AporteStatus, { line: string; fill: string; ring: string }> = {
  up: { line: "var(--bol-div-pos-2)", fill: "var(--bol-div-pos-2)", ring: "var(--bol-div-pos-2)" },
  down: { line: "var(--bol-div-neg-2)", fill: "var(--bol-div-neg-2)", ring: "var(--bol-div-neg-2)" },
  "edge-up": { line: "var(--bol-div-pos-1)", fill: "#ffffff", ring: "var(--bol-div-pos-2)" },
  "edge-down": { line: "var(--bol-div-neg-1)", fill: "#ffffff", ring: "var(--bol-div-neg-2)" },
  none: { line: "var(--bol-ink-3)", fill: "#ffffff", ring: "var(--bol-ink-3)" },
  few: { line: "var(--bol-ink-3)", fill: "#ffffff", ring: "var(--bol-ink-3)" },
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** El bosque de la hoja: nombre, evaluados, punto con su intervalo, cifras y lectura. */
function PaperForest({ rows, test }: { rows: AporteRowView[]; test: AporteTest }) {
  const T = APORTE_TESTS[test];
  const W = 178;
  const rh = 3.8;
  const top = 10;
  const px = 62;
  const pw = 66;
  const H = top + rows.length * rh + 9;
  const X = (v: number) => px + (aporteAt(v, T.dom) / 100) * pw;
  const ticks: number[] = [];
  for (let v = T.dom[0]; v <= T.dom[1] + 1e-9; v += T.step) ticks.push(v);
  return (
    <svg className="bol-chart bol-aporte-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aporte de cada programa con su intervalo">
      <g fontSize="2.3" fontWeight="700" fill="var(--bol-navy)">
        <text x="0" y="6.4">Programa</text>
        <text x="57" y="6.4" textAnchor="end">n</text>
        <text x="141" y="6.4" textAnchor="end">Aporte</text>
        <text x="144" y="6.4">Intervalo</text>
        <text x="166" y="6.4">Lectura</text>
      </g>
      {ticks.map((v) => (
        <g key={v}>
          <text x={r2(X(v))} y="6.4" fontSize="2.2" textAnchor="middle" fill="var(--bol-ink-3)">
            {v === 0 ? "0" : sg(v, 0)}
          </text>
          <line x1={r2(X(v))} x2={r2(X(v))} y1={top - 1.4} y2={H - 7} stroke="var(--bol-rule)" strokeWidth="0.15" />
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * rh;
        const cy = y + rh / 2;
        const t = TONE[r.s];
        const few = r.s === "few";
        const strong = r.s === "up" || r.s === "down";
        const op = r.n < APORTE_ATTEN && r.n >= APORTE_FEW ? 0.66 : 1;
        return (
          <g key={r.name} opacity={op}>
            {i % 2 === 1 && <rect x="0" y={r2(y)} width={W} height={rh} fill="var(--bol-paper-2)" opacity="0.6" />}
            <text x="0.8" y={r2(cy + 0.9)} fontSize="2.45" fill="var(--bol-ink)">{r.name}</text>
            <text x="57" y={r2(cy + 0.9)} fontSize="2.35" textAnchor="end" fill="var(--bol-ink-2)">{nf(r.n, 0)}</text>
            <line x1={r2(X(r.lo))} x2={r2(X(r.hi))} y1={r2(cy)} y2={r2(cy)} stroke={t.line} strokeWidth={few ? 0.3 : 0.5} strokeDasharray={few ? "0.6 0.6" : undefined} />
            {few ? (
              <rect x={r2(X(r.e) - 0.8)} y={r2(cy - 0.8)} width="1.6" height="1.6" fill="#ffffff" stroke={t.ring} strokeWidth="0.3" transform={`rotate(45 ${r2(X(r.e))} ${r2(cy)})`} />
            ) : (
              <circle cx={r2(X(r.e))} cy={r2(cy)} r="0.95" fill={t.fill} stroke={t.ring} strokeWidth="0.35" />
            )}
            <text x="141" y={r2(cy + 0.9)} fontSize="2.45" fontWeight="700" textAnchor="end" fill="var(--bol-ink)">{few ? `(${sg(r.e)})` : sg(r.e)}</text>
            <text x="144" y={r2(cy + 0.9)} fontSize="2.3" fill="var(--bol-ink-2)">{sg(r.lo)} a {sg(r.hi)}</text>
            <text
              x="166"
              y={r2(cy + 0.9)}
              fontSize="2.3"
              fontWeight={strong ? 700 : 500}
              fill={r.s === "up" ? "var(--bol-div-pos-2)" : r.s === "down" ? "var(--bol-div-neg-3)" : "var(--bol-ink-2)"}
            >
              {APORTE_VERDICT_SHORT[r.s]}
            </text>
          </g>
        );
      })}
      <line x1={r2(X(0))} x2={r2(X(0))} y1={top - 1.4} y2={H - 7} stroke="var(--bol-ink)" strokeWidth="0.45" />
      <line x1={px} x2={px + pw} y1={H - 7} y2={H - 7} stroke="var(--bol-ink)" strokeWidth="0.2" />
      <g fontSize="2.2" fill="var(--bol-ink-2)">
        <text x={r2(X(0) - 1)} y={H - 3.6} textAnchor="end">← bajo lo esperado</text>
        <text x={r2(X(0) + 1)} y={H - 3.6}>sobre lo esperado →</text>
      </g>
    </svg>
  );
}

/** Reparto de cada programa en los cuatro grupos de aporte, con sus cifras al lado. */
function PaperQuadrants({ rows }: { rows: (AporteRowView & { q: readonly [number, number, number, number] })[] }) {
  const W = 178;
  const rh = 4.2;
  const top = 10;
  const px = 62;
  const pw = 66;
  const H = top + rows.length * rh + 3;
  const cols = ["var(--bol-div-neg-2)", "var(--bol-div-neg-1)", "var(--bol-div-pos-1)", "var(--bol-div-pos-2)"];
  const cx = [143, 152, 161, 170];
  return (
    <svg className="bol-chart bol-aporte-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reparto de cada programa en los cuatro grupos de aporte">
      <g fontSize="2.3" fontWeight="700" fill="var(--bol-navy)">
        <text x="0" y="6.4">Programa</text>
        <text x="57" y="6.4" textAnchor="end">n</text>
        <text x={px} y="6.4">Reparto de los evaluados (100 %)</text>
        {QUAD_NAMES.map((n, k) => (
          <text key={n} x={cx[k]} y="6.4" textAnchor="end">{n}</text>
        ))}
        <text x="178" y="6.4" textAnchor="end">&gt;150</text>
      </g>
      {rows.map((r, i) => {
        const y = top + i * rh;
        const cy = y + rh / 2;
        const few = r.n < APORTE_FEW;
        const op = r.n < APORTE_ATTEN && !few ? 0.66 : 1;
        let x = px;
        return (
          <g key={r.name} opacity={op}>
            {i % 2 === 1 && <rect x="0" y={r2(y)} width={W} height={rh} fill="var(--bol-paper-2)" opacity="0.6" />}
            <text x="0.8" y={r2(cy + 0.9)} fontSize="2.45" fill="var(--bol-ink)">{r.name}</text>
            <text x="57" y={r2(cy + 0.9)} fontSize="2.35" textAnchor="end" fill="var(--bol-ink-2)">{nf(r.n, 0)}</text>
            {r.q.map((v, k) => {
              const w = (v / 100) * pw;
              const at = x;
              x += w;
              return <rect key={QUAD_NAMES[k]} x={r2(at)} y={r2(cy - 1.4)} width={r2(w)} height="2.8" fill={few ? "var(--bol-rule)" : cols[k]} />;
            })}
            {r.q.map((v, k) => (
              <text key={QUAD_NAMES[k]} x={cx[k]} y={r2(cy + 0.9)} fontSize="2.3" textAnchor="end" fill="var(--bol-ink)">
                {few ? `(${nf(v, 1)})` : nf(v, 1)}
              </text>
            ))}
            <text x="178" y={r2(cy + 0.9)} fontSize="2.35" fontWeight="700" textAnchor="end" fill="var(--bol-ink)">
              {few ? "(" : ""}
              {nf(r.q[2] + r.q[3], 0)}
              {few ? ")" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** La Tabla 3: cuántas de las cuatro competencias mejoraron frente a Saber 11. */
function PaperPositives() {
  const W = 178;
  const fills = ["var(--bol-seq-4)", "var(--bol-seq-3)", "var(--bol-seq-2)", "var(--bol-seq-1)", "var(--bol-navy)"];
  let x = 0;
  return (
    <svg className="bol-chart bol-aporte-svg" viewBox={`0 0 ${W} 9`} role="img" aria-label={`Competencias con variación positiva: ${NCOMP.join(", ")} por ciento`}>
      {NCOMP.map((v, i) => {
        const w = (v / 100) * W;
        const at = x;
        x += w;
        return (
          <g key={i}>
            <rect x={r2(at)} y="0" width={r2(w)} height="5.4" fill={fills[i]} />
            <text x={r2(at + w / 2)} y="3.7" fontSize="2.4" fontWeight="700" textAnchor="middle" fill={i < 2 ? "var(--bol-ink)" : "#ffffff"}>{v} %</text>
            <text x={r2(at + w / 2)} y="8.4" fontSize="2.2" textAnchor="middle" fill="var(--bol-ink-2)">{i === 0 ? "0 competencias" : i === 4 ? "4" : i}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- Piezas de las hojas ------------------------------------------------------------------ */

function Legend() {
  const mark = (style: Record<string, string | number>) => <i style={{ display: "inline-block", width: "2.4mm", height: "2.4mm", verticalAlign: "-0.3mm", marginRight: "1.2mm", ...style }} />;
  return (
    <p className="bol-aporte-legend">
      <span>{mark({ background: "var(--bol-div-pos-2)" })}▲ sobre lo esperado (sin cruzar el cero)</span>
      <span>{mark({ background: "var(--bol-div-neg-2)" })}▼ bajo lo esperado</span>
      <span>{mark({ background: "#fff", border: "0.3mm solid var(--bol-ink-3)", borderRadius: "50%" })}○ no se distingue de cero</span>
      <span>{mark({ background: "#fff", border: "0.3mm solid var(--bol-div-pos-2)", borderRadius: "50%" })}◐ toca el cero</span>
      <span>{mark({ background: "#fff", border: "0.3mm solid var(--bol-ink-3)", transform: "rotate(45deg) scale(0.75)" })}◇ menos de 10 evaluados (entre paréntesis)</span>
    </p>
  );
}

function Keys({ items }: { items: { label: string; value: string; sub: string }[] }) {
  return (
    <dl className="bol-saber-keys">
      {items.map((k) => (
        <div key={k.label}>
          <dt>{k.label}</dt>
          <dd>
            <b>{k.value}</b>
            <span>{k.sub}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bol-aporte-block">
    <h4>{title}</h4>
    {children}
  </div>
);

function Cite({ test }: { test: AporteTest }) {
  const c = APORTE_CITA[test];
  return (
    <div className="bol-aporte-cite">
      <b>Cita.</b> {c.authors} ({c.year}). <i>{c.title}</i> {c.rest} https://doi.org/{c.doi}. {c.note}
    </div>
  );
}

const Steps = ({ test }: { test: AporteTest }) => (
  <ol className="bol-aporte-list" data-numbered>
    {APORTE_STEPS.map(([title, text]) => (
      <li key={title}>
        <b>{title}:</b> {text(APORTE_TESTS[test].label)}
      </li>
    ))}
  </ol>
);

/* --- Hojas ----------------------------------------------------------------------------------- */

type Unit = { node: ReactNode; title: string; tight?: boolean };

function forestSheets(test: AporteTest, comp: AporteComp, Sheet: SheetComponent, Continuation: ContinuationComponent): Unit[] {
  const T = APORTE_TESTS[test];
  const lab = aporteCompLabel(comp);
  const rows = aporteRows(test, comp).sort((a, b) => (test === "pro" ? b.e - a.e : b.n - a.n || b.e - a.e));
  if (!rows.length) return [];
  const c = aporteCounts(rows);
  const f = icc((test === "pro" ? VAR_PRO : VAR_TYT).final[comp]);
  const title = `${T.label} · Aporte de los programas · ${lab}`;
  const first = rows.slice(0, MAX_ROWS);
  const rest = rows.slice(MAX_ROWS);
  const isPro = test === "pro";
  const keys = [
    {
      label: "Se distinguen de cero",
      value: `${c.dist} de ${c.n}`,
      sub: c.dist ? `▲ ${c.up} sobre lo esperado · ▼ ${c.down} bajo lo esperado${c.edge ? ` · ◐ ${c.edge} tocan el cero` : ""}` : c.edge ? `◐ ${c.edge} tocan el cero` : "ninguno",
    },
    { label: "Diferencia entre programas", value: `${nf(f, f < 10 ? 1 : 0)} %`, sub: "de la variación de los puntajes está entre programas" },
    {
      label: "Evaluados en el modelo",
      value: nf(APORTE_NOBS[test][comp], 0),
      sub: isPro ? `${APORTE_NPROG.pro[comp]} programas, con Saber 11 y Saber PRO` : comp === "ing" ? "13 programas (Fig. 1); la Tabla 5 dice 410" : "8 programas, Saber 11 de 2014 a 2021",
    },
  ];
  const sentence = `${aporteSummary(rows, comp)} El programa explica ${nf(f, f < 10 ? 1 : 0)} % de la variación; el resto está entre estudiantes de un mismo programa. No es una clasificación.`;
  const notes: [string, ReactNode][] = isPro
    ? [
        ["Lectura", "Cada fila es un programa: el punto es su aporte y la línea su intervalo. Si no cruza el cero, la fila lleva ▲ o ▼. Método y límites: hoja de método de Saber PRO."],
        ["Intervalo", `${T.ci} ${T.ciNote} Menos de 30 evaluados: fila atenuada; menos de 10: cifra entre paréntesis y sin tono.`],
        ["Dos documentos", APORTE_CONTRADICCIONES.pro],
        ["Corte", `${T.cut}; ${T.pop}; ${T.scale.toLowerCase()}.`],
        ["Procedencia", `${T.office}. Documento N.º 30, versión 2, DOI ${T.doi}.`],
      ]
    : [
        ["Lectura", "Cada fila es un programa; el punto es su aporte y la línea su intervalo de 95 %. Si no cruza el cero, la fila lleva ▲ o ▼."],
        ["Intervalo", `${T.ciNote} Menos de 30 evaluados: fila atenuada; menos de 10: cifra entre paréntesis y sin tono.`],
        ["Dos documentos", APORTE_CONTRADICCIONES.tyt],
        ["Método", "Modelo jerárquico de intercepto aleatorio por programa, con los puntajes de Saber 11 como controles. Cero es el programa promedio de UDESTEC."],
        ["Corte", `${T.cut}; ${T.pop}; ${T.scale.toLowerCase()}.`],
        ["Procedencia", `${T.office}. Documento de trabajo N.º 21, versión 1, DOI ${T.doi}.`],
      ];
  const coefRows = !isPro ? COEF_TYT[comp].map(([n, , e, se]) => ({ label: n, cells: [sg(e), nf(se, 2)] })) : [];

  const units: Unit[] = [
    {
      title,
      node: (
        <Sheet
          title={title}
          description={
            isPro
              ? "Cuántos puntos de Saber PRO suma cada programa por encima o por debajo de lo esperado para estudiantes que llegaron con el mismo resultado en Saber 11. Cero es el programa promedio."
              : "Cuántos puntos de Saber TyT suma cada programa tecnológico de UDESTEC por encima o por debajo de lo esperado para estudiantes que llegaron con el mismo resultado en Saber 11."
          }
          source={T.office}
          notes={notes}
          wide
        >
          <Keys items={keys} />
          <Legend />
          <div className="bol-aporte-fig">
            <PaperForest rows={first} test={test} />
          </div>
          <p className="bol-aporte-read">
            <b>Lectura.</b> {isPro ? sentence : `${TYT_LECTURA[comp]} Se reporta con su intervalo y su n; no se usa como clasificación de programas ni como indicador de desempeño docente (pp. 11 y 12).`}
          </p>
          {!isPro && (
            <Block title="Lo que traían al ingresar: puntos de Saber TyT por punto de Saber 11 (Tabla 5, p. 8)">
              <DataTable head={["Predictor", "Estimador", "Error estándar"]} rows={coefRows} />
            </Block>
          )}
        </Sheet>
      ),
    },
  ];
  if (rest.length) {
    units.push({
      title,
      tight: true,
      node: (
        <Continuation title={title} from={MAX_ROWS + 1} to={rows.length} total={rows.length}>
          <div className="bol-aporte-fig">
            <PaperForest rows={rest} test={test} />
          </div>
        </Continuation>
      ),
    });
  }
  return units;
}

function quadrantSheet(comp: AporteComp, Sheet: SheetComponent): Unit[] {
  const T = APORTE_TESTS.pro;
  const lab = aporteCompLabel(comp);
  const f5 = FIG5[comp];
  const rows = aporteRows("pro", comp)
    .map((r) => ({ ...r, q: PRO_CUADRANTES[comp][r.name] }))
    .filter((r): r is AporteRowView & { q: [number, number, number, number] } => Boolean(r.q))
    .sort((a, b) => b.q[2] + b.q[3] - (a.q[2] + a.q[3]));
  if (!rows.length) return [];
  const above = f5[2] + f5[3];
  const textShare = comp === "lc" ? 48 : comp === "rc" ? 55 : null;
  const title = `${T.label} · Cuadrantes de aporte · ${lab}`;
  const tones = ["var(--bol-div-neg-2)", "var(--bol-div-neg-1)", "var(--bol-div-pos-1)", "var(--bol-div-pos-2)"];
  return [
    {
      title,
      node: (
        <Sheet
          title={title}
          description="Un grupo por estudiante según su punto de partida (Saber 11, corte en 50) y su llegada (Saber PRO, corte en 150, la mitad de la escala). Describe el trayecto; no es el aporte del modelo."
          source={T.office}
          notes={[
            ["Lectura", "Cada barra suma 100 %. Las cuatro columnas de la derecha repiten el reparto y la última suma los que salieron sobre 150 (AA+ y AA++)."],
            ["Pocos evaluados", "Menos de 30: fila atenuada. Menos de 10: cifras entre paréntesis y barra gris."],
            ["Corte", `${T.cut}. ${T.pop}.`],
            ["Procedencia", `${T.office}. Documento N.º 30, Figura 5 (p. 10) y Tabla 2 (p. 11).`],
          ]}
          wide
        >
          <div className="bol-aporte-tiles">
            {f5.map((v, i) => (
              <div key={QUAD_NAMES[i]} style={{ borderTop: `1mm solid ${tones[i]}` }}>
                <small>{QUAD_NAMES[i]}</small>
                <b>{v} %</b>
                <span>{QUAD_DEFS[i]}</span>
              </div>
            ))}
          </div>
          <div className="bol-aporte-fig">
            <PaperQuadrants rows={rows} />
          </div>
          <p className="bol-aporte-read">
            <b>Lectura.</b> En toda la muestra, {above} de cada 100 evaluados salieron sobre 150 puntos en {lab.toLowerCase()}.
            {textShare !== null ? ` El texto del documento (p. 9) da ${textShare} %; la Figura 5 da ${above} %: se usa la figura y hay que confirmarlo con los autores.` : ""}
          </p>
        </Sheet>
      ),
    },
  ];
}

function methodSheet(test: AporteTest, Sheet: SheetComponent): Unit[] {
  const T = APORTE_TESTS[test];
  const isPro = test === "pro";
  const V = isPro ? VAR_PRO : VAR_TYT;
  const pc = (pair: readonly [number, number]) => `${nf(icc(pair), icc(pair) < 10 ? 1 : 0)} %`;
  const title = `${T.label} · Aporte de los programas · Método y límites`;

  const variation = isPro ? (
    <DataTable
      head={["Competencia", "Sin controles", "Con controles", "2023", "2024"]}
      rows={APORTE_MODELED.map((k) => ({ label: aporteCompLabel(k), cells: [pc(VAR_PRO.nulo[k]), <b key="f">{pc(VAR_PRO.final[k])}</b>, pc(VAR_PRO.y23[k]), pc(VAR_PRO.y24[k])] }))}
    />
  ) : (
    <DataTable
      head={["Competencia", "Sin controles", "Con controles", "¿Hay diferencias?"]}
      rows={APORTE_MODELED.map((k) => ({
        label: aporteCompLabel(k),
        cells: [pc(VAR_TYT.nulo[k]), <b key="f">{pc(VAR_TYT.final[k])}</b>, `${VAR_TYT.p[k] === "p = 0,50" ? "No" : "Sí"} · ${VAR_TYT.p[k]}`],
      }))}
    />
  );

  const cell = (comp: AporteComp, label: string) => {
    const r = (isPro ? COEF_PRO : COEF_TYT)[comp].find((x) => x[0] === label);
    if (!r) return "—";
    const ns = isPro && Math.abs(r[2]) < 1.96 * r[3];
    return `${isPro ? sg(r[2]) : nf(r[2], 2)} (${nf(r[3], 2)})${ns ? " *" : ""}`;
  };
  const coefRows = (isPro ? COEF_PRO_LABELS : COEF_TYT_LABELS).map((l) => ({ label: l, cells: APORTE_MODELED.map((k) => cell(k, l)) }));

  const read = isPro
    ? `De cada 100 puntos de variación en lectura crítica, ${nf(icc(VAR_PRO.final.lc), 0)} están entre programas y ${nf(100 - icc(VAR_PRO.final.lc), 0)} entre estudiantes del mismo programa. En inglés la diferencia pasa de 2 % (2023) a 9 % (2024): no es estable. El documento espera un valor mayor de 5 % (p. 21): razonamiento cuantitativo (2 %) e inglés (3 %) no lo alcanzan.`
    : "En ninguna competencia el programa explica más de 7 % de la varianza; la mayor parte está entre estudiantes del mismo programa. En competencias ciudadanas es prácticamente nula. La prueba de lectura crítica (p = 0,023) es el resultado más frágil de la tabla (p. 9).";

  return [
    {
      title,
      node: (
        <Sheet
          title={title}
          description={
            isPro
              ? "Una hoja para toda la prueba: cuánto cambian los resultados de un programa a otro, quién llega más arriba, cómo se calcula y qué no dice."
              : "Una hoja para toda la prueba: cuánto cambian los resultados de un programa a otro, qué pesa Saber 11, cómo se calcula y qué no dice."
          }
          source={T.office}
          notes={[
            ["Corte", `${T.cut}; ${T.pop}.`],
            ["Procedencia", `${T.office}. ${isPro ? "Documento N.º 30, versión 2" : "Documento de trabajo N.º 21, versión 1"}, DOI ${T.doi}.`],
            ["Dos documentos", APORTE_CONTRADICCIONES[test]],
          ]}
          wide
        >
          <div className="bol-aporte-two">
            <Block title="Parte de la variación que está entre programas">
              {variation}
              <p className="bol-aporte-read">
                <b>Lectura.</b> {read}
              </p>
            </Block>
            <Block title="Cómo se calcula">
              <Steps test={test} />
            </Block>
          </div>
          <Block title={isPro ? "Qué acompaña al puntaje (puntos de Saber PRO, con su error estándar)" : "Lo que pesa Saber 11 (puntos de Saber TyT por punto de Saber 11, con su error estándar)"}>
            <DataTable head={["Característica", ...APORTE_MODELED.map((k) => ({ lc: "LC", rc: "RC", cc: "CC", ing: "IN" })[k])]} rows={coefRows} />
            <p className="bol-aporte-read bol-aporte-read--small">
              {isPro
                ? "Ya descontado Saber 11. * no se distingue de cero. «—»: no entró al modelo de esa competencia. Son asociaciones, no causas: el documento advierte que el signo negativo del apoyo PAIPE probablemente refleja condiciones iniciales más desfavorables (p. 32). Fuente: Tabla 5, p. 20."
                : "Todos significativos al 5 % (Tabla 5, p. 8). Ciencias naturales es el predictor más constante (0,49 a 0,73); en inglés pesa sobre todo el inglés de Saber 11 (1,17). Este estudio no incluye variables sociodemográficas."}
            </p>
          </Block>
          {isPro && (
            <Block title="Cuántas de las cuatro competencias mejoraron frente a Saber 11">
              <div className="bol-aporte-fig">
                <PaperPositives />
              </div>
            </Block>
          )}
          <div className="bol-aporte-two">
            <Block title="Lo que no dice">
              <ul className="bol-aporte-list">
                {APORTE_LIMITS[test].map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Block>
            <Cite test={test} />
          </div>
        </Sheet>
      ),
    },
  ];
}

/** Las hojas de una entrada del aporte en el boletín. */
export function aporteUnits(test: AporteTest, part: AportePart, Sheet: SheetComponent, Continuation: ContinuationComponent): Unit[] {
  if (part === "metodo") return methodSheet(test, Sheet);
  return [...forestSheets(test, part, Sheet, Continuation), ...(test === "pro" ? quadrantSheet(part, Sheet) : [])];
}

/** La cifra del aporte para la ficha ejecutiva: cuántos programas se distinguen de cero. */
export function aporteHighlight(test: AporteTest, part: AportePart) {
  if (part === "metodo") return null;
  const rows = aporteRows(test, part);
  if (!rows.length) return null;
  const c = aporteCounts(rows);
  return {
    title: `${APORTE_TESTS[test].label} · Aporte de los programas · ${aporteCompLabel(part)}`,
    value: `${c.dist} de ${c.n}`,
    unit: "programas se distinguen de cero",
    note: `${APORTE_TESTS[test].cut} · ▲ ${c.up} sobre lo esperado · ▼ ${c.down} bajo lo esperado`,
  };
}
