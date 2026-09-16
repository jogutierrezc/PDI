/* =============================================================================
   Tabla dinámica.

   Las cifras de un informe tienen tres dimensiones: indicador, campus y corte.
   El corte es el año o, con el detalle "A y B", cada periodo académico.
   Quien consulta elige cuál va en filas, cuál en columnas y fija la tercera.
   Las columnas se ordenan con un clic en su encabezado, las casillas pueden
   llevar mapa de calor y lo que se ve se descarga tal cual en CSV.

   Indicadores con unidades distintas no se suman ni se comparan en color: si
   el indicador va en filas, el calor se calcula fila por fila.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { cutsOf, downloadText, formatValue, valueOf } from "../data/open-data";
import { ALL_YEARS, cutLabel } from "../data/terms";
import type { Campus, CampusId, Indicator, Report, Term } from "../data/types";
import { ViewSwitch } from "./ChartFrame";

type Dim = "indicador" | "campus" | "anio";

const DIM_LABEL: Record<Dim, string> = { indicador: "Indicador", campus: "Campus", anio: "Corte" };

const PERIOD_KEY = "periodo";

/** Clave de un corte en la tabla: "2024", "2024-A" o "periodo" (todo el periodo). */
const cutKey = (year: number, term: Term | null) => (year === ALL_YEARS ? PERIOD_KEY : cutLabel(year, term));

/** "2024" → año; "2024-A" → periodo A de 2024; "periodo" → todo el periodo. */
const parseCut = (key: string): { year: number; term: Term | null } => {
  if (key === PERIOD_KEY) return { year: ALL_YEARS, term: null };
  const [year, term] = key.split("-");
  return { year: Number(year), term: term === "A" || term === "B" ? term : null };
};

interface PivotTableProps {
  report: Report;
  years: number[];
  campuses: Campus[];
  year: number;
  term?: Term | null;
  campus: CampusId;
}

interface Member {
  key: string;
  label: string;
  sub?: string;
}

export function PivotTable({ report, years, campuses, year, term = null, campus }: PivotTableProps) {
  const [rows, setRows] = useState<Dim>("indicador");
  const [cols, setCols] = useState<Dim>("anio");
  const [fixedIndicator, setFixedIndicator] = useState(report.keyIndicators[0] ?? report.indicators[0]?.id);
  const [fixedCampus, setFixedCampus] = useState<CampusId>(campus);
  const [detail, setDetail] = useState<"anual" | "periodos">(term ? "periodos" : "anual");
  const [fixedCut, setFixedCut] = useState(cutKey(year, term));
  const [heat, setHeat] = useState<"si" | "no">("si");
  const [sort, setSort] = useState<{ col: string; dir: "desc" | "asc" } | null>(null);

  // Los filtros de la página mandan: al cambiar corte o campus arriba, la tabla los sigue.
  useEffect(() => setFixedCampus(campus), [campus]);
  useEffect(() => {
    setFixedCut(cutKey(year, term));
    if (term) setDetail("periodos");
  }, [year, term]);
  // Por año, la tabla abre con la columna del periodo agrupado (promedio anual) delante de los años.
  const cuts = detail === "periodos" ? cutsOf(years, true) : [{ year: ALL_YEARS, term: null }, ...cutsOf(years, false)];
  const selectedCut = cutKey(year, term);
  const cutName = (y: number, t: Term | null) => (y === ALL_YEARS ? `${cutLabel(y, t)} (promedio)` : cutLabel(y, t));

  const fixedDim: Dim = (["indicador", "campus", "anio"] as Dim[]).find((d) => d !== rows && d !== cols)!;

  const members = (dim: Dim): Member[] => {
    if (dim === "indicador") return report.indicators.map((i) => ({ key: i.id, label: i.label, sub: i.unit }));
    if (dim === "campus") return campuses.map((c) => ({ key: c.id, label: c.name }));
    return cuts.map((c) => ({ key: cutKey(c.year, c.term), label: cutName(c.year, c.term) }));
  };

  const indicatorOf = (r: Member, c: Member): Indicator | undefined => {
    const id = rows === "indicador" ? r.key : cols === "indicador" ? c.key : fixedIndicator;
    return report.indicators.find((i) => i.id === id);
  };

  const cell = (r: Member, c: Member) => {
    const pick = (dim: Dim, fallback: string) => (rows === dim ? r.key : cols === dim ? c.key : fallback);
    const indicator = indicatorOf(r, c);
    if (!indicator) return { value: null, indicator };
    const campusId = pick("campus", fixedCampus) as CampusId;
    const { year: y, term: t } = parseCut(pick("anio", fixedCut));
    return { value: valueOf(indicator, y, campusId, t), indicator };
  };

  const rowMembers = members(rows);
  const colMembers = members(cols);

  const sortColumn = sort ? colMembers.find((c) => c.key === sort.col) : undefined;
  const sortedRows = !sort || !sortColumn
    ? rowMembers
    : [...rowMembers].sort((a, b) => {
        const va = cell(a, sortColumn).value;
        const vb = cell(b, sortColumn).value;
        if (va === null) return 1;
        if (vb === null) return -1;
        return sort.dir === "desc" ? vb - va : va - vb;
      });

  // Calor por fila cuando las filas son indicadores (unidades distintas), por
  // columna cuando lo son las columnas, y sobre toda la tabla cuando todas las
  // casillas son del mismo indicador.
  const heatLevel = (value: number | null, r: Member, c: Member) => {
    if (heat === "no" || value === null) return undefined;
    const range = (
      rows === "indicador"
        ? colMembers.map((col) => cell(r, col).value)
        : cols === "indicador"
          ? rowMembers.map((row) => cell(row, c).value)
          : rowMembers.flatMap((row) => colMembers.map((col) => cell(row, col).value))
    ).filter((v): v is number => v !== null);
    if (range.length < 2) return undefined;
    const lo = Math.min(...range);
    const hi = Math.max(...range);
    if (hi === lo) return 3;
    return Math.max(1, Math.ceil(((value - lo) / (hi - lo)) * 6));
  };

  const setAxis = (which: "rows" | "cols", dim: Dim) => {
    setSort(null);
    if (which === "rows") {
      if (dim === cols) setCols(rows);
      setRows(dim);
    } else {
      if (dim === rows) setRows(cols);
      setCols(dim);
    }
  };

  const toggleSort = (key: string) => {
    setSort((prev) => (prev?.col !== key ? { col: key, dir: "desc" } : prev.dir === "desc" ? { col: key, dir: "asc" } : null));
  };

  const download = () => {
    const escape = (text: string) => (/[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    const lines = [[DIM_LABEL[rows], ...colMembers.map((c) => c.label)].map(escape).join(";")];
    for (const r of sortedRows) {
      lines.push(
        [r.label, ...colMembers.map((c) => {
          const { value } = cell(r, c);
          return value === null ? "" : String(value).replace(".", ",");
        })].map(escape).join(";"),
      );
    }
    downloadText(`udes-en-cifras-${report.slug}-tabla-dinamica.csv`, `﻿${lines.join("\n")}`);
  };

  const dims: { value: Dim; label: string }[] = [
    { value: "indicador", label: "Indicador" },
    { value: "campus", label: "Campus" },
    { value: "anio", label: "Corte" },
  ];

  return (
    <div className="od-pivot">
      <div className="od-pivot__controls">
        <div className="od-pivot__control">
          <span>Filas</span>
          <ViewSwitch label="Dimensión en filas" options={dims} value={rows} onChange={(d) => setAxis("rows", d)} />
        </div>
        <div className="od-pivot__control">
          <span>Columnas</span>
          <ViewSwitch label="Dimensión en columnas" options={dims} value={cols} onChange={(d) => setAxis("cols", d)} />
        </div>
        <label className="od-pivot__control">
          <span>{DIM_LABEL[fixedDim]} fijo</span>
          {fixedDim === "indicador" && (
            <select value={fixedIndicator} onChange={(e) => setFixedIndicator(e.target.value)}>
              {report.indicators.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          )}
          {fixedDim === "campus" && (
            <select value={fixedCampus} onChange={(e) => setFixedCampus(e.target.value as CampusId)}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {fixedDim === "anio" && (
            <select value={fixedCut} onChange={(e) => setFixedCut(e.target.value)}>
              {cuts.map((c) => (
                <option key={cutKey(c.year, c.term)} value={cutKey(c.year, c.term)}>
                  {cutName(c.year, c.term)}
                </option>
              ))}
            </select>
          )}
        </label>
        <div className="od-pivot__control">
          <span>Detalle</span>
          <ViewSwitch
            label="Detalle del corte"
            options={[
              { value: "anual", label: "Año" },
              { value: "periodos", label: "Periodos 1 y 2" },
            ]}
            value={detail}
            onChange={(next) => {
              setSort(null);
              setDetail(next);
              // El corte fijo pasa al detalle elegido: 2024 ↔ 2024-B.
              const { year: y } = parseCut(fixedCut);
              const base = y === ALL_YEARS ? years[years.length - 1] : y;
              setFixedCut(next === "periodos" ? cutLabel(base, term ?? "B") : String(base));
            }}
          />
        </div>
        <div className="od-pivot__control">
          <span>Color</span>
          <ViewSwitch
            label="Mapa de calor en la tabla"
            options={[
              { value: "si", label: "Calor" },
              { value: "no", label: "Plano" },
            ]}
            value={heat}
            onChange={setHeat}
          />
        </div>
        <button type="button" className="od-button od-button--line od-pivot__csv" onClick={download}>
          <Icon name="download" size={16} /> Descargar esta vista
        </button>
      </div>

      <div className="od-table-wrap" tabIndex={0} role="region" aria-label="Tabla dinámica, desplazable">
        <table className="od-table od-pivot__table" key={`${rows}-${cols}-${fixedIndicator}-${fixedCampus}-${fixedCut}-${detail}`}>
          <caption className="sr-only">
            {report.name}: {DIM_LABEL[rows]} en filas y {DIM_LABEL[cols]} en columnas
          </caption>
          <thead>
            <tr>
              <th scope="col">{DIM_LABEL[rows]}</th>
              {colMembers.map((c) => {
                const active = sort?.col === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort?.dir === "desc" ? "descending" : "ascending") : "none"}
                    data-selected={(cols === "anio" && c.key === selectedCut) || undefined}
                  >
                    <button type="button" className="od-pivot__sort" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <svg viewBox="0 0 10 12" aria-hidden="true" data-dir={active ? sort?.dir : undefined}>
                        <path d="M5 1 9 5H1zM5 11 1 7h8z" />
                      </svg>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, index) => (
              <tr key={r.key} style={{ "--row": index } as React.CSSProperties}>
                <th scope="row">
                  {r.label}
                  {r.sub && <small>{r.sub}</small>}
                </th>
                {colMembers.map((c) => {
                  const { value, indicator } = cell(r, c);
                  const level = heatLevel(value, r, c);
                  return (
                    <td
                      key={c.key}
                      data-heat={level}
                      data-empty={value === null || undefined}
                      data-selected={(cols === "anio" && c.key === selectedCut) || undefined}
                    >
                      {value === null ? <span aria-label="Sin reportar">—</span> : formatValue(value, indicator?.format ?? "entero")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="od-pivot__note">
        Las casillas con raya no se reportaron.{" "}
        {rows === "indicador" ? "El color compara cada indicador consigo mismo, fila por fila." : cols === "indicador" ? "El color compara cada indicador consigo mismo, columna por columna." : "El color compara todas las casillas del mismo indicador."}
      </p>
    </div>
  );
}
