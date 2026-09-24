/* =============================================================================
   Mapa de calor en azules.

   Una rejilla HTML (no un dibujo): así las cifras se leen al tamaño del texto
   y la tabla se puede recorrer. Las casillas se encienden en ola diagonal al
   entrar en pantalla. Pasar por una casilla ilumina su fila y su columna y
   cuenta el valor; la escala puede leerse sobre toda la matriz o fila por
   fila, que es la pregunta cuando cada fila vive en su propio orden de magnitud.
   Una casilla vacía lleva trama, no el azul más claro: vacío no es poco.

   La misma matriz tiene una segunda vista, la comparativa: cada fila de la
   primera columna con dato a la última, con su diferencia y su variación
   (ver heatmap-compare). El boletín la imprime debajo de la matriz.
   ========================================================================== */

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { changeText, heatmapCompare, signed } from "../data/heatmap-compare";
import type { HeatmapCompare } from "../data/heatmap-compare";
import { formatValue, formatWithUnit } from "../data/open-data";
import type { HeatmapData } from "../data/types";
import { ViewSwitch } from "./ChartFrame";
import { useInView } from "./motion";

const BINS = 7;

export function Heatmap({ data }: { data: HeatmapData }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [mode, setMode] = useState<"matriz" | "fila">("matriz");
  const [showValues, setShowValues] = useState<"si" | "no">(data.columns.length > 8 ? "no" : "si");
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const compare = heatmapCompare(data);
  const [reading, setReading] = useState<"calor" | "comparativa">("calor");
  const comparing = reading === "comparativa" && compare !== null;

  const all = data.values.flat().filter((v): v is number => v !== null);
  const globalMin = Math.min(...all);
  const globalMax = Math.max(...all);

  const binFor = (value: number | null, r: number) => {
    if (value === null) return null;
    let lo = globalMin;
    let hi = globalMax;
    if (mode === "fila") {
      const row = data.values[r].filter((v): v is number => v !== null);
      lo = Math.min(...row);
      hi = Math.max(...row);
    }
    if (hi === lo) return Math.ceil(BINS / 2);
    return Math.max(1, Math.min(BINS, Math.ceil(((value - lo) / (hi - lo)) * BINS) || 1));
  };

  const focusValue = focus ? data.values[focus.r][focus.c] : null;

  return (
    <div className="od-heat" data-seen={seen || undefined}>
      <div className="od-heat__bar">
        {compare && (
          <ViewSwitch
            label="Vista"
            options={[
              { value: "calor", label: "Mapa de calor" },
              { value: "comparativa", label: `Comparativa ${compare.fromLabel}–${compare.toLabel}` },
            ]}
            value={reading}
            onChange={setReading}
          />
        )}
        {!comparing && (
          <>
            <ViewSwitch
              label="Escala del color"
              options={[
                { value: "matriz", label: "Toda la matriz" },
                { value: "fila", label: `Por ${data.rowLabel.toLowerCase()}` },
              ]}
              value={mode}
              onChange={setMode}
            />
            <ViewSwitch
              label="Cifras en las casillas"
              options={[
                { value: "si", label: "Con cifras" },
                { value: "no", label: "Solo color" },
              ]}
              value={showValues}
              onChange={setShowValues}
            />
            <p className="od-heat__readout" aria-live="polite">
              {focus ? (
                <>
                  <b>{data.rows[focus.r]}</b> · {data.columns[focus.c]}:{" "}
                  <b>{focusValue === null ? data.emptyMeaning : formatWithUnit(focusValue, data.format, data.unit)}</b>
            </>
          ) : (
            <>Pasa por una casilla para leerla.</>
          )}
        </p>
          </>
        )}
      </div>

      {comparing ? (
        <CompareTable data={data} compare={compare} />
      ) : (
        <>
          <div ref={ref} className="od-heat__scroll" tabIndex={0} role="region" aria-label={`${data.title}, desplazable`}>
            <table
              className="od-heat__grid"
              style={{ "--cols": data.columns.length } as CSSProperties}
              onPointerLeave={() => setFocus(null)}
            >
              <caption className="sr-only">
                {data.title}. Filas: {data.rowLabel}. Columnas: {data.columnLabel}. Unidad: {data.unit}.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="od-heat__corner">
                    {data.rowLabel} / {data.columnLabel}
                  </th>
                  {data.columns.map((column, c) => (
                    <th key={column} scope="col" data-active={focus?.c === c || undefined}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, r) => (
                  <tr key={row}>
                    <th scope="row" data-active={focus?.r === r || undefined}>
                      {row}
                    </th>
                    {data.columns.map((column, c) => {
                      const value = data.values[r][c];
                      const bin = binFor(value, r);
                      const active = focus?.r === r || focus?.c === c;
                      return (
                        <td
                          key={column}
                          data-bin={bin ?? undefined}
                          data-empty={value === null || undefined}
                          data-cross={active || undefined}
                          data-focus={(focus?.r === r && focus?.c === c) || undefined}
                          style={
                            {
                              "--cell": bin ? `var(--od-seq-${bin})` : undefined,
                              "--d": r + c,
                            } as CSSProperties
                          }
                          onPointerEnter={() => setFocus({ r, c })}
                          title={`${row} · ${column}: ${value === null ? data.emptyMeaning : formatWithUnit(value, data.format, data.unit)}`}
                        >
                          <span data-hidden={showValues === "no" || undefined}>
                            {value === null ? "" : formatValue(value, data.format)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="od-heat__legend" aria-hidden="true">
            <span>{mode === "fila" ? "Menor de la fila" : formatValue(globalMin, data.format)}</span>
            <span className="od-heat__ramp">
              {Array.from({ length: BINS }, (_, i) => (
                <i key={i} style={{ background: `var(--od-seq-${i + 1})` }} />
              ))}
            </span>
            <span>{mode === "fila" ? "Mayor de la fila" : formatValue(globalMax, data.format)}</span>
            <span className="od-heat__empty-key">
              <i /> {data.emptyMeaning}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function CompareTable({ data, compare }: { data: HeatmapData; compare: HeatmapCompare }) {
  const diffHead = compare.points ? "Dif. (p. p.)" : "Diferencia";
  return (
    <div className="od-heat__scroll od-heat__compare" tabIndex={0} role="region" aria-label={`${data.title}, comparativa, desplazable`}>
      <table className="od-table">
        <caption className="sr-only">
          {data.title}: {compare.fromLabel} frente a {compare.toLabel}, por {data.rowLabel.toLowerCase()}. Unidad: {data.unit}.
        </caption>
        <thead>
          <tr>
            <th scope="col">{data.rowLabel}</th>
            <th scope="col">{compare.fromLabel}</th>
            <th scope="col">{compare.toLabel}</th>
            <th scope="col">{diffHead}</th>
            <th scope="col">Variación</th>
          </tr>
        </thead>
        <tbody>
          {compare.rows.map((row) => (
            <tr key={row.label} data-kind={row.total ? "total" : undefined}>
              <th scope="row">{row.label}</th>
              <td data-empty={row.from === null || undefined}>{formatValue(row.from, data.format)}</td>
              <td data-empty={row.to === null || undefined}>{formatValue(row.to, data.format)}</td>
              <td data-empty={row.diff === null || undefined}>{signed(row.diff, data.format)}</td>
              <td data-empty={row.change === null || undefined} data-trend={row.change === null ? undefined : row.change > 0 ? "sube" : row.change < 0 ? "baja" : "igual"}>
                {changeText(row.change)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="od-heat__note">
        Cada {data.rowLabel.toLowerCase()} de {compare.fromLabel} a {compare.toLabel}, las primeras y últimas {data.columnLabel.toLowerCase()} con dato.
        {compare.points ? " La diferencia está en puntos porcentuales." : ""} «—»: {data.emptyMeaning.toLowerCase()} en alguno de los dos extremos.
      </p>
    </div>
  );
}
