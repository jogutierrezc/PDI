/* =============================================================================
   Aporte de los programas.

   Sección que cierra los bloques de Saber PRO y de Saber TyT: cuántos puntos de
   la prueba de salida suma cada programa una vez descontado el resultado con
   que llegaron sus estudiantes a Saber 11. Las cifras son las de dos documentos
   de la UDES (data/saber-aporte.ts) y no se mezclan entre pruebas: cada bloque
   lee su propia población.

   Cuatro paneles, cada uno con su CSV y su imagen:
   · El bosque: un punto y un intervalo por programa, con la línea del cero.
     El tono solo lo lleva una fila cuyo intervalo no incluye el cero; las demás
     van en el neutro, y todas llevan glifo y palabra: el color nunca va solo.
   · Cuánta diferencia hay entre programas, que se dice antes de leer nombres.
   · Los cuadrantes de aporte (solo Saber PRO).
   · Lo que acompaña al puntaje, o lo que pesa Saber 11.

   Y debajo el método, lo que no dice y la cita completa.

   Movimiento: una sola entrada al llegar a pantalla (useInView) con clases CSS;
   al cambiar de competencia con el puntero, la misma entrada, más corta. Con
   prefers-reduced-motion no se mueve nada.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  APORTE_ATTEN,
  APORTE_CITA,
  APORTE_COMPS,
  APORTE_CONTRADICCIONES,
  APORTE_FEW,
  APORTE_LIMITS,
  APORTE_MODELED,
  APORTE_NAMES,
  APORTE_NOBS,
  APORTE_NPROG,
  APORTE_STEPS,
  APORTE_TESTS,
  APORTE_VERDICT,
  COEF_PRO,
  COEF_TYT,
  FIG5,
  NCOMP,
  PRO_CUADRANTES,
  QUAD_DEFS,
  QUAD_NAMES,
  VAR_PRO,
  VAR_TYT,
  aporteAt,
  aporteCompLabel,
  aporteCounts,
  aporteHas,
  aporteNum as nf,
  aporteRows,
  aporteSay,
  aporteSigned as sg,
  aporteSorted,
  aporteSummary,
  aporteUrlString,
  icc,
  isAporteComp,
} from "../data/saber-aporte";
import type { AporteComp, AporteRowView, AporteSort, AporteStatus, AporteTest } from "../data/saber-aporte";
import { aporteCoeficientesToTable, aporteCuadrantesToTable, aporteToTable, aporteVarianzaToTable } from "../data/csv-export";
import type { CsvTable } from "../data/csv-export";
import { ChartFrame, ViewSwitch } from "./ChartFrame";
import type { CsvSource } from "./CsvAction";
import { useInView, usePrefersReducedMotion } from "./motion";
import { SplitFlap } from "./SplitFlap";
import "./saber-aporte.css";

const VIEWS: { value: "bosque" | "tabla"; label: string }[] = [
  { value: "bosque", label: "Gráfico" },
  { value: "tabla", label: "Tabla" },
];
const SORTS: { value: AporteSort; label: string }[] = [
  { value: "aporte", label: "Aporte" },
  { value: "n", label: "Evaluados" },
  { value: "nombre", label: "Nombre" },
];

const csvOf = (name: string, filename: string, build: () => CsvTable): CsvSource => ({ name, files: [{ filename, build }] });

/* --- Estado en la URL ---------------------------------------------------------------- */

function useAporteState(test: AporteTest) {
  const [params, setParams] = useSearchParams();
  const T = APORTE_TESTS[test];
  const rawComp = params.get("sp");
  // En Saber PRO el carril de arriba también escribe `sp`: global y comunicación escrita no tienen modelo.
  const comp: AporteComp = isAporteComp(rawComp) ? rawComp : "lc";
  const vista: "bosque" | "tabla" = params.get("va-vista") === "tabla" ? "tabla" : "bosque";
  const rawSort = params.get("va-orden");
  const orden: AporteSort = rawSort === "aporte" || rawSort === "n" || rawSort === "nombre" ? rawSort : T.defSort;
  const solo = params.get("va-solo") === "1";
  const rawProgram = params.get("va-programa") ?? "";
  const programa = aporteHas(test, comp, rawProgram) ? rawProgram : "";

  const set = (patch: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  return { comp, vista, orden, solo, programa, set };
}

/* --- Sección ---------------------------------------------------------------------------- */

export function SaberAporte({ test, anchor, level = 3 }: { test: AporteTest; anchor: string; level?: 2 | 3 }) {
  const T = APORTE_TESTS[test];
  const { comp, vista, orden, solo, programa, set } = useAporteState(test);
  const root = useRef<HTMLElement>(null);
  const seen = useInView(root);
  const reduced = usePrefersReducedMotion();
  const armed = seen || reduced;
  const keyboard = useRef(false);
  const [notice, setNotice] = useState("");
  const [hover, setHover] = useState("");
  const Heading = level === 2 ? "h2" : "h3";

  const all = useMemo(() => aporteRows(test, comp), [test, comp]);
  const counts = aporteCounts(all);
  const list = useMemo(() => aporteSorted(all, orden, solo), [all, orden, solo]);
  const selected = all.find((r) => r.name === programa);
  const shown = all.find((r) => r.name === hover) ?? selected;

  // La entrada se repite al cambiar de competencia (corta) y no al ordenar ni filtrar.
  const [enter, setEnter] = useState<"first" | "quick" | null>("first");
  const lastComp = useRef(comp);
  useEffect(() => {
    if (!armed || reduced) return;
    const quick = lastComp.current !== comp;
    lastComp.current = comp;
    if (quick && keyboard.current) {
      keyboard.current = false;
      setEnter(null);
      return;
    }
    setEnter(quick ? "quick" : "first");
    const timer = window.setTimeout(() => setEnter(null), quick ? 480 : 1100);
    return () => window.clearTimeout(timer);
  }, [armed, comp, reduced]);

  const pickComp = (key: string, byKeyboard: boolean) => {
    const info = APORTE_COMPS.find((c) => c.key === key);
    if (!info) return;
    if (!info.modeled) {
      setNotice(`El estudio no calcula aporte para ${info.label.toLowerCase()}: se dice «sin modelo», no un cero.`);
      return;
    }
    setNotice("");
    keyboard.current = byKeyboard;
    set({ sp: key === "lc" && test === "tyt" ? "" : key, "va-programa": "" });
  };

  const onRailKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
    event.preventDefault();
    const at = APORTE_MODELED.indexOf(comp);
    const step = /Right|Down/.test(event.key) ? 1 : -1;
    const next = APORTE_MODELED[(at + step + APORTE_MODELED.length) % APORTE_MODELED.length];
    pickComp(next, true);
    window.requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-comp="${next}"]`)?.focus());
  };

  const nobs = APORTE_NOBS[test][comp];
  const nprog = APORTE_NPROG[test][comp];
  const between = icc((test === "pro" ? VAR_PRO : VAR_TYT).final[comp]);
  const urlText = aporteUrlString(test, { comp, vista, orden, solo, programa });
  const ingTyt = test === "tyt" && comp === "ing";

  return (
    <section ref={root} className="od-ap" data-armed={armed || undefined} data-enter={(armed && enter) || undefined} aria-labelledby={anchor}>
      <header className="od-ap__head">
        <Heading id={anchor}>Aporte de los programas</Heading>
        <p>
          Cuánto suma cada programa al puntaje de sus estudiantes, una vez descontado el nivel con que llegaron. Es una medida relativa entre programas de la UDES, no una
          comparación con el país.
        </p>
        <p className="od-ap__facts">
          <span>
            <b>Población</b> {T.pop}
          </span>
          <span>
            <b>Prueba</b> {T.label} · {T.scale}
          </span>
          <span>
            <b>Autores</b> {T.authors} · DOI{" "}
            <a href={`https://doi.org/${T.doi}`} target="_blank" rel="noopener noreferrer">
              {T.doi}
            </a>
          </span>
        </p>
      </header>

      <div className="od-ap__board">
        <div className="od-ap__rail" role="radiogroup" aria-label="Competencia del aporte" onKeyDown={onRailKey}>
          {APORTE_COMPS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              data-comp={c.key}
              aria-checked={c.modeled && c.key === comp}
              aria-disabled={c.modeled ? undefined : true}
              tabIndex={c.modeled ? (c.key === comp ? 0 : -1) : undefined}
              className="od-ap__comp"
              onClick={(e) => pickComp(c.key, e.detail === 0)}
            >
              <span className="od-ap__code" aria-hidden="true">
                {c.code}
              </span>
              <span className="od-ap__name">
                {c.label}
                {!c.modeled && <small>sin modelo</small>}
              </span>
            </button>
          ))}
        </div>
        <p className="od-ap__notice" role="status">
          {notice}
        </p>

        <dl className="od-ap__arrivals">
          <div className="od-ap__arrival">
            <dt>Se distinguen de cero</dt>
            <dd>
              <SplitFlap key={`d-${comp}`} value={String(counts.dist)} size="lg" numeric label={`${counts.dist} de ${counts.n}`} />
              <span className="od-ap__of">de {counts.n} programas</span>
              <span className="od-ap__sub">
                <b>▲ {counts.up}</b> sobre lo esperado · <b>▼ {counts.down}</b> bajo lo esperado{counts.edge ? ` · ◐ ${counts.edge} tocan el cero` : ""}
              </span>
            </dd>
          </div>
          <div className="od-ap__arrival">
            <dt>Diferencia entre programas</dt>
            <dd>
              <SplitFlap key={`v-${comp}`} value={`${nf(between, between < 10 ? 1 : 0)} %`} size="lg" numeric delay={90} label={`${nf(between, 1)} por ciento`} />
              <span className="od-ap__sub">de la variación de los puntajes está entre programas (modelo con controles).</span>
            </dd>
          </div>
          <div className="od-ap__arrival">
            <dt>Evaluados en el modelo</dt>
            <dd>
              <SplitFlap key={`n-${comp}`} value={nf(nobs, 0)} size="lg" numeric delay={180} label={`${nobs} evaluados`} />
              <span className="od-ap__sub">
                {nprog} programas.
                {ingTyt ? " La Tabla 5 (p. 8) dice 410; la Figura 1 (p. 10), 1.081 en 13 programas." : test === "pro" ? " Con cifra completa en Saber PRO y Saber 11." : " Presentaron Saber 11 entre 2014 y 2021."}
              </span>
            </dd>
          </div>
        </dl>
        <p className="od-ap__cut">
          Corte: {T.cut} · {T.office}
        </p>
      </div>

      <Forest
        test={test}
        comp={comp}
        all={all}
        list={list}
        vista={vista}
        orden={orden}
        solo={solo}
        selected={selected}
        shown={shown}
        distinct={counts.dist}
        onSet={set}
        onHover={setHover}
      />
      <Variation test={test} comp={comp} />
      {test === "pro" && <Quadrants comp={comp} />}
      <Coefficients test={test} comp={comp} />
      <Method test={test} />

      <p className="od-ap__url">
        <span>Dirección de esta vista:</span> <code>{urlText}</code>
      </p>
    </section>
  );
}

/* --- Bosque ------------------------------------------------------------------------------ */

const GLYPH: Record<AporteStatus, string> = { up: "▲", down: "▼", "edge-up": "◐", "edge-down": "◐", none: "○", few: "◇" };

function ForestRow({
  row,
  test,
  comp,
  dom,
  step,
  index,
  selectable,
  selected,
  label,
  sub,
  tone,
  verdict = true,
  onPick,
  onHover,
}: {
  row: AporteRowView;
  test: AporteTest;
  comp: AporteComp;
  dom: readonly [number, number];
  step: number;
  index: number;
  selectable?: boolean;
  selected?: boolean;
  label?: string;
  sub?: string;
  tone?: string;
  verdict?: boolean;
  onPick?: () => void;
  onHover?: (name: string) => void;
}) {
  const z = aporteAt(0, dom);
  const lo = aporteAt(row.lo, dom);
  const hi = aporteAt(row.hi, dom);
  const e = aporteAt(row.e, dom);
  const few = row.s === "few";
  const atten = row.n < APORTE_ATTEN && row.n >= APORTE_FEW;
  const value = few ? `(${sg(row.e)})` : sg(row.e);
  const style = {
    "--z": `${z}%`,
    "--e": `${e}%`,
    "--step": `${(step / (dom[1] - dom[0])) * 100}%`,
    "--org": `${((z - lo) / (hi - lo)) * 100}%`,
    "--i": Math.min(index, 28),
  } as CSSProperties;
  const subText = sub !== undefined ? sub : `n = ${nf(row.n, 0)}`;
  const body = (
    <>
      <span className="od-ap__fname">
        {row.name}
        {subText && <small>{subText}</small>}
      </span>
      <span className="od-ap__track" aria-hidden="true">
        <i className="od-ap__int" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <i className="od-ap__dot" />
      </span>
      <span className="od-ap__fval">
        <b>{value}</b>
        {verdict && (
          <span className="od-ap__verdict">
            <span aria-hidden="true">{GLYPH[row.s]} </span>
            {APORTE_VERDICT[row.s].slice(2)}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="od-ap__fr" data-s={tone ?? row.s} data-atten={atten || undefined} data-sel={selected || undefined} style={style}>
      {selectable ? (
        <button
          type="button"
          className="od-ap__frbtn"
          aria-pressed={selected}
          aria-label={label ?? aporteSay(row, test, comp)}
          onClick={onPick}
          onMouseEnter={() => onHover?.(row.name)}
          onMouseLeave={() => onHover?.("")}
          onFocus={() => onHover?.(row.name)}
          onBlur={() => onHover?.("")}
        >
          {body}
        </button>
      ) : (
        <div className="od-ap__frbtn" role="group" aria-label={label ?? aporteSay(row, test, comp)}>
          {body}
        </div>
      )}
    </li>
  );
}

function Axis({ dom, step, left, right }: { dom: readonly [number, number]; step: number; left?: string; right?: string }) {
  const ticks: number[] = [];
  for (let v = dom[0]; v <= dom[1] + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const z = aporteAt(0, dom);
  return (
    <div className="od-ap__axis" aria-hidden="true">
      <span />
      <div className="od-ap__axistrack">
        {ticks.map((v) => (
          <span key={v} className="od-ap__tick" style={{ left: `${aporteAt(v, dom)}%` }}>
            {v === 0 ? "0" : sg(v, step < 1 ? 1 : 0)}
          </span>
        ))}
        {left && (
          <span className="od-ap__dir" style={{ right: `${100 - z + 1}%` }}>
            {left}
          </span>
        )}
        {right && (
          <span className="od-ap__dir" style={{ left: `${z + 1}%` }}>
            {right}
          </span>
        )}
      </div>
      <span />
    </div>
  );
}

function Forest({
  test,
  comp,
  all,
  list,
  vista,
  orden,
  solo,
  selected,
  shown,
  distinct,
  onSet,
  onHover,
}: {
  test: AporteTest;
  comp: AporteComp;
  all: AporteRowView[];
  list: AporteRowView[];
  vista: "bosque" | "tabla";
  orden: AporteSort;
  solo: boolean;
  selected?: AporteRowView;
  shown?: AporteRowView;
  distinct: number;
  onSet: (patch: Record<string, string>) => void;
  onHover: (name: string) => void;
}) {
  const T = APORTE_TESTS[test];
  const lab = aporteCompLabel(comp);
  const same =
    test === "pro"
      ? comp === "rc" || comp === "ing"
        ? `Todas las competencias comparten la escala: por eso ${lab.toLowerCase()} se ve apretada. Sus diferencias entre programas son pequeñas (${nf(icc(VAR_PRO.final[comp]), 0)} % de la variación, p. 20), y la figura no las infla.`
        : "Todas las competencias comparten la escala (−20 a +15 puntos), como en el documento."
      : comp === "cc"
        ? "Todos los programas quedan en el cero: el documento calcula que no hay diferencias entre programas en competencias ciudadanas (p. 16)."
        : "Misma escala en las cuatro competencias (−15 a +15 puntos). Las barras del documento original equivalen a ±1 error estándar; aquí se dibuja el intervalo de 95 %.";

  return (
    <ChartFrame
      title={`Aporte de cada programa · ${lab}`}
      subtitle={`Puntos de ${T.label} sobre o bajo lo esperado · ${T.cut}`}
      source={`${T.office}. ${T.src}`}
      exportName={`aporte-${test}-${comp}`}
      csv={csvOf(`el aporte de los programas en ${T.label}`, `udes-en-cifras-aporte-${test === "pro" ? "saber-pro" : "saber-tyt"}.csv`, () => aporteToTable(test))}
      className="od-ap__frame"
    >
      <p className="od-ap__lede">
        Puntos de {T.label} por encima o por debajo de lo esperado para estudiantes que llegaron con el mismo resultado en Saber 11. Cero es el programa promedio.
      </p>
      <div className="od-ap__bar" data-export-ignore>
        <ViewSwitch label="Forma de la lectura" value={vista} options={VIEWS} onChange={(v) => onSet({ "va-vista": v === "bosque" ? "" : v })} />
        <span className="od-ap__bar-group">
          <span>Ordenar por</span>
          <ViewSwitch label="Orden" value={orden} options={SORTS} onChange={(v) => onSet({ "va-orden": v === T.defSort ? "" : v })} />
        </span>
        <label className="od-ap__check">
          <input type="checkbox" checked={solo} onChange={(e) => onSet({ "va-solo": e.target.checked ? "1" : "" })} />
          Solo los que se distinguen de cero ({distinct})
        </label>
      </div>

      {vista === "tabla" ? (
        <div className="od-ap__tablewrap">
          <table className="od-ap__table">
            <caption>
              {lab} · aporte de cada programa, en puntos de {T.label} · {T.cut}
            </caption>
            <thead>
              <tr>
                <th scope="col">Programa</th>
                <th scope="col" className="n">
                  Evaluados
                </th>
                <th scope="col" className="n">
                  Aporte
                </th>
                <th scope="col" className="n">
                  {T.ciShort[0].toUpperCase() + T.ciShort.slice(1)}
                </th>
                <th scope="col">Lectura</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td className="n">{nf(r.n, 0)}</td>
                  <td className="n">{r.s === "few" ? `(${sg(r.e)})` : sg(r.e)}</td>
                  <td className="n">
                    {sg(r.lo)} a {sg(r.hi)}
                  </td>
                  <td>{APORTE_VERDICT[r.s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Axis dom={T.dom} step={T.step} left="← bajo lo esperado" right="sobre lo esperado →" />
          <ul className="od-ap__forest" key={comp} aria-label={`Aporte de cada programa en ${lab}`}>
            {list.map((r, i) => (
              <ForestRow
                key={r.name}
                row={r}
                test={test}
                comp={comp}
                dom={T.dom}
                step={T.step}
                index={i}
                selectable
                selected={selected?.name === r.name}
                onPick={() => onSet({ "va-programa": selected?.name === r.name ? "" : r.name })}
                onHover={onHover}
              />
            ))}
          </ul>
          {list.length === 0 && (
            <div className="od-ap__empty">
              <b>Ningún programa se distingue de cero con este filtro</b>
              <span>Quite «Solo los que se distinguen de cero» para ver los demás.</span>
            </div>
          )}
        </>
      )}

      <p className="od-ap__read">{shown ? aporteSay(shown, test, comp) : aporteSummary(all, comp)}</p>

      <ul className="od-ap__legend" aria-label="Cómo se lee cada marca">
        <li data-s="up">
          <i /> ▲ sobre lo esperado: el intervalo no incluye el cero
        </li>
        <li data-s="down">
          <i /> ▼ bajo lo esperado: el intervalo no incluye el cero
        </li>
        <li data-s="none">
          <i /> ○ no se distingue de cero
        </li>
        <li data-s="edge-up">
          <i /> ◐ toca el cero
        </li>
        <li data-s="few">
          <i /> ◇ (entre paréntesis) menos de 10 evaluados
        </li>
      </ul>
      <p className="od-ap__note">
        {same} {T.ci} {T.ciNote} {APORTE_CONTRADICCIONES[test]}
      </p>

      {selected && <Profile test={test} sel={selected} onClear={() => onSet({ "va-programa": "" })} />}
    </ChartFrame>
  );
}

function Profile({ test, sel, onClear }: { test: AporteTest; sel: AporteRowView; onClear: () => void }) {
  const T = APORTE_TESTS[test];
  const rows = APORTE_MODELED.filter((k) => aporteHas(test, k, sel.name)).map((k) => ({ comp: k, row: aporteRows(test, k).find((r) => r.name === sel.name)! }));
  return (
    <div className="od-ap__profile" aria-live="polite">
      <h4>Perfil de {sel.name} en las competencias del estudio</h4>
      <Axis dom={T.dom} step={T.step} />
      <ul className="od-ap__forest" aria-label={`Perfil de ${sel.name}`}>
        {rows.map(({ comp, row }, i) => (
          <ForestRow
            key={comp}
            row={{ ...row, name: aporteCompLabel(comp) }}
            test={test}
            comp={comp}
            dom={T.dom}
            step={T.step}
            index={i}
            label={aporteSay(row, test, comp)}
          />
        ))}
      </ul>
      <p className="od-ap__note">
        {test === "tyt"
          ? "Un mismo programa puede ser «alto» en una competencia y «bajo» en otra: el documento pide no resumirlo en un solo indicador (p. 11). "
          : "Cada competencia tiene su propio modelo y su propia muestra: no se suman ni se promedian. "}
        <button type="button" className="od-ap__link" onClick={onClear}>
          Quitar selección
        </button>
      </p>
    </div>
  );
}

/* --- Cuánta diferencia hay entre programas -------------------------------------------- */

function Variation({ test, comp }: { test: AporteTest; comp: AporteComp }) {
  const T = APORTE_TESTS[test];
  const V = test === "pro" ? VAR_PRO : VAR_TYT;
  const fin = (k: AporteComp) => icc(V.final[k]);
  const f = fin(comp);
  const pc = (pair: readonly [number, number]) => `${nf(icc(pair), icc(pair) < 10 ? 1 : 0)} %`;
  return (
    <ChartFrame
      title="Cuánta diferencia hay entre programas"
      subtitle="Es pequeña, y la sección lo dice antes de que alguien lea los nombres de la lista"
      source={`${T.office}. ${test === "pro" ? "Documento N.º 30, Tablas 4 a 7 (pp. 20, 25, 31)" : "Documento N.º 21, Tabla 6 (p. 9)"}`}
      exportName={`aporte-${test}-variacion`}
      csv={csvOf(`la diferencia entre programas en ${T.label}`, `udes-en-cifras-aporte-${test === "pro" ? "saber-pro" : "saber-tyt"}-variacion.csv`, () => aporteVarianzaToTable(test))}
      className="od-ap__frame"
    >
      <p className="od-ap__read">
        De cada 100 puntos de variación en <b>{aporteCompLabel(comp).toLowerCase()}</b>, <b>{nf(f, f < 10 ? 1 : 0)}</b> vienen de diferencias entre programas y{" "}
        <b>{nf(100 - f, f < 10 ? 1 : 0)}</b> de diferencias entre estudiantes de un mismo programa.
      </p>
      <div className="od-ap__vars" role="group" aria-label="Parte de la variación entre programas, por competencia">
        {APORTE_MODELED.map((k) => (
          <div className="od-ap__vrow" key={k} data-sel={k === comp || undefined}>
            <span className="od-ap__vlabel">{aporteCompLabel(k)}</span>
            <span
              className="od-ap__vbar"
              role="img"
              aria-label={`${nf(fin(k), fin(k) < 10 ? 1 : 0)} % entre programas y ${nf(100 - fin(k), 1)} % entre estudiantes del mismo programa`}
            >
              <i style={{ width: `${fin(k)}%` }} />
            </span>
            <span className="od-ap__vnum">
              {nf(fin(k), fin(k) < 10 ? 1 : 0)} %<small>entre programas</small>
            </span>
          </div>
        ))}
      </div>
      <div className="od-ap__vscale" aria-hidden="true">
        <span />
        <span>
          <span>0 %</span>
          <span>50 %</span>
          <span>100 % de la variación</span>
        </span>
        <span />
      </div>
      <div className="od-ap__tablewrap">
        {test === "pro" ? (
          <table className="od-ap__table">
            <caption>Parte de la variación que está entre programas (correlación intraclase), Saber PRO</caption>
            <thead>
              <tr>
                <th scope="col">Competencia</th>
                <th scope="col" className="n">Sin controles</th>
                <th scope="col" className="n">Con controles</th>
                <th scope="col" className="n">Solo 2023</th>
                <th scope="col" className="n">Solo 2024</th>
              </tr>
            </thead>
            <tbody>
              {APORTE_MODELED.map((k) => (
                <tr key={k}>
                  <th scope="row">{aporteCompLabel(k)}</th>
                  <td className="n">{pc(VAR_PRO.nulo[k])}</td>
                  <td className="n"><b>{pc(VAR_PRO.final[k])}</b></td>
                  <td className="n">{pc(VAR_PRO.y23[k])}</td>
                  <td className="n">{pc(VAR_PRO.y24[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="od-ap__table">
            <caption>Parte de la variación que está entre programas (correlación intraclase), Saber TyT</caption>
            <thead>
              <tr>
                <th scope="col">Competencia</th>
                <th scope="col" className="n">Sin controles</th>
                <th scope="col" className="n">Con controles</th>
                <th scope="col">¿Hay diferencias?</th>
              </tr>
            </thead>
            <tbody>
              {APORTE_MODELED.map((k) => (
                <tr key={k}>
                  <th scope="row">{aporteCompLabel(k)}</th>
                  <td className="n">{pc(VAR_TYT.nulo[k])}</td>
                  <td className="n"><b>{pc(VAR_TYT.final[k])}</b></td>
                  <td>
                    {VAR_TYT.p[k] === "p = 0,50" ? "No" : "Sí"} · {VAR_TYT.p[k]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="od-ap__note">
        {test === "pro" ? (
          <>
            Sin controles: p. 20 (Tabla 4). Con controles: Tabla 5. Años por separado: Tablas 6 y 7 (pp. 25 y 31). Inglés pasa de 2 % en 2023 a 9 % en 2024:{" "}
            <b>la diferencia entre programas no es estable de un año a otro</b>. El propio documento espera un valor mayor de 5 % (p. 21, nota 2); razonamiento cuantitativo (2 %) e inglés
            (3 %) quedan por debajo.
          </>
        ) : (
          <>
            Tabla 6, p. 9. En ninguna competencia el programa explica más de 7 % de la varianza; la mayor parte está entre estudiantes del mismo programa (p. 11). La prueba de lectura
            crítica (p = 0,023) es «el resultado más frágil de la tabla». Al descontar el inglés de entrada, la diferencia entre programas en inglés baja de 6,7 % a 2,0 % (p. 9).
          </>
        )}
      </p>
    </ChartFrame>
  );
}

/* --- Cuadrantes (solo Saber PRO) ---------------------------------------------------------- */

const QUAD_TONES = ["neg-2", "neg-1", "pos-1", "pos-2"] as const;

function Quadrants({ comp }: { comp: AporteComp }) {
  const T = APORTE_TESTS.pro;
  const lab = aporteCompLabel(comp);
  const f5 = FIG5[comp];
  const above = f5[2] + f5[3];
  const rows = aporteRows("pro", comp)
    .map((r) => ({ ...r, q: PRO_CUADRANTES[comp][r.name] }))
    .filter((r) => r.q)
    .sort((a, b) => b.q[2] + b.q[3] - (a.q[2] + a.q[3]));
  const textShare = comp === "lc" ? 48 : comp === "rc" ? 55 : null;
  return (
    <ChartFrame
      title={`Cuadrantes de aporte · ${lab}`}
      subtitle="Un grupo por estudiante, según su punto de partida y su llegada"
      source={`${T.office}. Documento N.º 30, Figura 5 (p. 10), Tabla 2 (p. 11), Tabla 3 (p. 12)`}
      exportName={`aporte-pro-cuadrantes-${comp}`}
      csv={csvOf("los cuadrantes de aporte de Saber PRO", "udes-en-cifras-aporte-saber-pro-cuadrantes.csv", () => aporteCuadrantesToTable())}
      className="od-ap__frame"
    >
      <p className="od-ap__lede">Describe el trayecto; no es el aporte del modelo de arriba, porque los cortes (50 y 150) son fijos.</p>
      <div className="od-ap__qtiles">
        {f5.map((v, i) => (
          <div key={QUAD_NAMES[i]} className="od-ap__qtile" style={{ "--c": `var(--od-div-${QUAD_TONES[i]})` } as CSSProperties}>
            <b>{v} %</b>
            {QUAD_NAMES[i]} · {QUAD_DEFS[i]}
          </div>
        ))}
      </div>
      <p className="od-ap__read">
        En toda la muestra, <b>{above} de cada 100</b> evaluados salieron sobre 150 puntos en {lab.toLowerCase()}, y solo <b>{f5[3]}</b> de cada 100 lo hicieron habiendo entrado
        bajo 50 (el grupo AA++). El 150 es la mitad de la escala de Saber PRO (0 a 300).
      </p>
      {textShare !== null && (
        <p className="od-ap__note">
          <b>Una diferencia dentro del documento.</b> El texto (p. 9) dice que {textShare} % de los evaluados en {lab.toLowerCase()} mantuvo o mejoró por encima de lo esperado, pero la
          Figura 5 (p. 10) da {above} %. Se muestra la figura; hay que confirmarlo con los autores.
        </p>
      )}
      <div className="od-ap__qlist" role="list" aria-label="Reparto de cada programa en los cuatro grupos, ordenado por quienes salen sobre 150">
        {rows.map((r) => {
          const few = r.n < APORTE_FEW;
          const fmt = (v: number) => (few ? `(${nf(v, 0)})` : nf(v, 1));
          return (
            <div
              key={r.name}
              className="od-ap__qrow"
              role="listitem"
              data-atten={(r.n < APORTE_ATTEN && !few) || undefined}
              data-few={few || undefined}
              aria-label={`${r.name}: ${QUAD_NAMES.map((n, i) => `${n} ${nf(r.q[i], 1)} %`).join(", ")}. ${r.n} evaluados.`}
            >
              <span className="od-ap__qname">
                {r.name}
                <small>n = {nf(r.n, 0)}</small>
              </span>
              <span className="od-ap__qbar">
                {r.q.map((v, i) => (
                  <span key={QUAD_NAMES[i]} data-q={i} style={{ flex: `${v} 1 0` }} title={`${QUAD_NAMES[i]} ${nf(v, 1)} %`}>
                    {v >= 9 ? nf(v, 0) : ""}
                  </span>
                ))}
              </span>
              <span className="od-ap__qval">
                {few ? "(" : ""}
                {nf(r.q[2] + r.q[3], 0)} %{few ? ")" : ""}
                <small>sobre 150</small>
              </span>
              <span className="od-ap__sr">{QUAD_NAMES.map((n, i) => `${n} ${fmt(r.q[i])}`).join(" ")}</span>
            </div>
          );
        })}
      </div>
      <ul className="od-ap__legend">
        {QUAD_NAMES.map((n, i) => (
          <li key={n} data-q={i}>
            <i className="od-ap__sw" /> {n} · {QUAD_DEFS[i]}
          </li>
        ))}
      </ul>
      <div className="od-ap__divider">Cuántas de las cuatro competencias mejoraron frente a Saber 11</div>
      <div className="od-ap__posbar" role="img" aria-label={`Porcentaje de estudiantes con variación positiva en 0, 1, 2, 3 y 4 competencias: ${NCOMP.join(", ")}`}>
        {NCOMP.map((v, i) => (
          <span key={i} data-k={i} style={{ flex: `${v} 1 0` }}>
            {v} %
          </span>
        ))}
      </div>
      <ul className="od-ap__legend od-ap__legend--steps">
        <li>0 competencias</li>
        <li>1</li>
        <li>2</li>
        <li>3</li>
        <li>4 competencias</li>
      </ul>
      <p className="od-ap__note">
        {100 - NCOMP[0]} % mejoró en al menos una competencia, sin importar que supere o no el promedio (Tabla 3, p. 12). Es otra medida, sobre puntajes estandarizados que el documento no
        detalla.
      </p>
    </ChartFrame>
  );
}

/* --- Coeficientes ------------------------------------------------------------------------ */

function Coefficients({ test, comp }: { test: AporteTest; comp: AporteComp }) {
  const T = APORTE_TESTS[test];
  const lab = aporteCompLabel(comp);
  const isPro = test === "pro";
  const dom = (isPro ? [-25, 10] : [0, 1.5]) as readonly [number, number];
  const step = isPro ? 5 : 0.5;
  const rows = (isPro ? COEF_PRO : COEF_TYT)[comp].map(([name, ref, e, se]) => {
    const lo = e - 1.96 * se;
    const hi = e + 1.96 * se;
    const s: AporteStatus = !isPro ? "none" : lo > 0 ? "up" : hi < 0 ? "down" : "none";
    return { name, ref, row: { name, n: 99, e, lo, hi, s } satisfies AporteRowView };
  });
  return (
    <ChartFrame
      title={isPro ? `Qué acompaña al puntaje · ${lab}` : `Lo que traían al ingresar · ${lab}`}
      subtitle={
        isPro
          ? "Diferencia en puntos de Saber PRO entre grupos, ya descontado lo que traían de Saber 11"
          : "Cuántos puntos de Saber TyT suma cada punto de Saber 11"
      }
      source={`${T.office}. ${isPro ? "Documento N.º 30, Tabla 5 (p. 20)" : "Documento N.º 21, Tabla 5 (p. 8), intervalos calculados como ±1,96 errores estándar"}`}
      exportName={`aporte-${test}-coeficientes-${comp}`}
      csv={csvOf(`los coeficientes del modelo de ${T.label}`, `udes-en-cifras-aporte-${isPro ? "saber-pro" : "saber-tyt"}-coeficientes.csv`, () => aporteCoeficientesToTable(test))}
      className="od-ap__frame"
    >
      <p className="od-ap__lede">
        {isPro
          ? "Describe quiénes llegan más arriba o más abajo; no dice por qué."
          : "Es lo que el modelo descuenta antes de calcular el aporte del programa."}
      </p>
      <Axis dom={dom} step={step} left={isPro ? "← menos puntos" : undefined} right={isPro ? "más puntos →" : undefined} />
      <ul className="od-ap__forest" key={comp} aria-label={isPro ? "Diferencias en puntos por característica del estudiante" : "Efecto de Saber 11 sobre Saber TyT"}>
        {rows.map(({ name, ref, row }, i) => (
          <ForestRow
            key={name}
            row={row}
            test={test}
            comp={comp}
            dom={dom}
            step={step}
            index={i}
            tone={isPro ? undefined : "seq"}
            verdict={isPro}
            sub={isPro ? ref : ""}
            label={
              isPro
                ? `${name} ${ref}: ${sg(row.e)} puntos, intervalo de ${sg(row.lo)} a ${sg(row.hi)}. ${row.s === "none" ? "No se distingue de cero." : "Se distingue de cero."}`
                : `${name}: ${nf(row.e, 2)} puntos de Saber TyT por punto de Saber 11, entre ${nf(row.lo, 2)} y ${nf(row.hi, 2)}.`
            }
          />
        ))}
      </ul>
      <p className="od-ap__note">
        {isPro
          ? "Intervalo calculado como el estimador ±1,96 errores estándar (Tabla 5, p. 20). Son asociaciones: el documento advierte que el signo negativo del apoyo PAIPE individual probablemente refleja condiciones iniciales más desfavorables de quienes lo reciben (p. 32). El análisis de correspondencias múltiples (pp. 16 a 19) es exploratorio y sus dos ejes explican solo 4,6 % y 3,9 % de la variabilidad: no se dibuja."
          : "Todos son significativos al 5 % (p. 8). Ciencias naturales es el predictor más constante (0,49 a 0,73) y en inglés pesa sobre todo el inglés de Saber 11 (1,17). Este estudio no incluye variables sociodemográficas: no hay perfiles de estudiantes por programa."}
      </p>
    </ChartFrame>
  );
}

/* --- Método, límites y cita ------------------------------------------------------------- */

function StepArt({ index }: { index: number }) {
  const ink = "var(--od-board-ink)";
  const muted = "var(--od-board-muted)";
  const pos = "var(--od-div-pos-2)";
  const none = "var(--od-board-muted)";
  const surface = "var(--od-board)";
  const art = [
    <>
      <line x1="12" y1="74" x2="148" y2="74" stroke={muted} />
      <line x1="12" y1="74" x2="12" y2="10" stroke={muted} />
      <line x1="12" y1="68" x2="148" y2="22" stroke={ink} strokeWidth="2" />
      <circle cx="60" cy="49" r="4.5" fill={surface} stroke={ink} strokeWidth="2" />
      <text x="64" y="66" fontSize="9" fill={muted}>esperado</text>
      <text x="14" y="87" fontSize="8.5" fill={muted}>Saber 11 →</text>
    </>,
    <>
      <line x1="12" y1="74" x2="148" y2="74" stroke={muted} />
      <line x1="12" y1="68" x2="148" y2="22" stroke={ink} strokeWidth="2" />
      <circle cx="84" cy="34" r="5" fill={pos} />
      <line x1="84" y1="29" x2="84" y2="45" stroke={pos} strokeWidth="2" />
      <text x="92" y="35" fontSize="9" fill={ink}>real</text>
      <text x="92" y="53" fontSize="9" fill={muted}>aporte</text>
    </>,
    <>
      <line x1="12" y1="74" x2="148" y2="74" stroke={muted} />
      <line x1="12" y1="62" x2="148" y2="24" stroke={ink} strokeWidth="2" />
      <line x1="12" y1="74" x2="148" y2="40" stroke={muted} strokeWidth="2" strokeDasharray="4 3" />
      <text x="100" y="19" fontSize="9" fill={ink}>Programa A</text>
      <text x="96" y="62" fontSize="9" fill={muted}>Programa B</text>
    </>,
    <>
      <line x1="80" y1="8" x2="80" y2="82" stroke={ink} strokeWidth="2" />
      <line x1="30" y1="30" x2="118" y2="30" stroke={none} strokeWidth="3" />
      <circle cx="68" cy="30" r="5" fill={surface} stroke={none} strokeWidth="2" />
      <line x1="94" y1="58" x2="140" y2="58" stroke={pos} strokeWidth="3" />
      <circle cx="117" cy="58" r="5" fill={pos} />
      <text x="12" y="46" fontSize="8.5" fill={muted}>toca el cero: no se afirma</text>
      <text x="84" y="76" fontSize="8.5" fill={muted}>no incluye el cero</text>
    </>,
  ];
  const labels = [
    "Esquema: de un punto de partida se estima un puntaje esperado",
    "Esquema: el aporte es la distancia entre lo real y lo esperado",
    "Esquema: dos programas con la misma pendiente y distinto punto de partida",
    "Esquema: un intervalo que cruza el cero y otro que no",
  ];
  return (
    <svg viewBox="0 0 160 90" role="img" aria-label={labels[index]}>
      {art[index]}
    </svg>
  );
}

function Method({ test }: { test: AporteTest }) {
  const T = APORTE_TESTS[test];
  const cite = APORTE_CITA[test];
  return (
    <div className="od-ap__method">
      <div className="od-ap__divider">Método, límites y cita</div>
      <h4>Cómo se calcula, en palabras sencillas</h4>
      <div className="od-ap__steps">
        {APORTE_STEPS.map(([title, text], i) => (
          <div key={title}>
            <StepArt index={i} />
            <b>
              {i + 1}. {title}
            </b>
            <p>{text(T.label)}</p>
          </div>
        ))}
      </div>
      <p className="od-ap__note">Las ilustraciones son esquemas, no datos.</p>

      <h4>Lo que no dice</h4>
      <ul className="od-ap__limits">
        {APORTE_LIMITS[test].map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      {test === "pro" && (
        <>
          <h4>Cómo se llama cada cifra</h4>
          <div className="od-ap__tablewrap">
            <table className="od-ap__table od-ap__table--text">
              <caption>Para que nadie confunda este aporte con otra cifra de la misma sección</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre en pantalla</th>
                  <th scope="col">Qué es</th>
                  <th scope="col">Dónde está</th>
                </tr>
              </thead>
              <tbody>
                {APORTE_NAMES.map(([a, b, c]) => (
                  <tr key={a}>
                    <th scope="row">{a}</th>
                    <td>{b}</td>
                    <td>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4>Quién lo hizo</h4>
      <div className="od-ap__cite">
        <p>
          {cite.authors} ({cite.year}). <i>{cite.title}</i> {cite.rest}{" "}
          <a href={`https://doi.org/${cite.doi}`} target="_blank" rel="noopener noreferrer">
            doi.org/{cite.doi}
          </a>
        </p>
        <p className="od-ap__note">{cite.note}</p>
      </div>
    </div>
  );
}

/* --- Bloque de Saber TyT --------------------------------------------------------------- */

/**
 * El bloque de Saber TyT de UDES en Cifras: el aporte de los programas de
 * UDESTEC. Reemplaza a los visores de los motores Alpha y Beta, que se retiraron.
 */
export function SaberTytBlock({ anchor, title }: { anchor: string; title?: string }) {
  return (
    <section className="od-section od-ap-block" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head">
          <h2 id={anchor}>{title || "Saber TyT · aporte de los programas"}</h2>
          <p>Cuánto suma cada programa tecnológico de UDESTEC al resultado de Saber TyT de sus estudiantes, frente a lo que se esperaba por su Saber 11.</p>
        </header>
        <SaberAporte test="tyt" anchor={`${anchor}-aporte`} level={3} />
      </div>
    </section>
  );
}
