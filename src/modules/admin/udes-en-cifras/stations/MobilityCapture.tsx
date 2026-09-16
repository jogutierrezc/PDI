/* =============================================================================
   Captura · mapas de movilidad internacional (entrante y saliente).

   Lo mismo que un mapa por departamento, pero la fila es el país: país de
   origen en entrante, país de destino en saliente. Cada casilla es el número
   de participantes de ese país en un campus y un año.

   Hay 235 países posibles, así que la rejilla solo muestra los que ya tienen
   cifras en este mapa (en cualquier año) y los que se añaden con el buscador.
   Para cargar de una vez, "Pegar lista" acepta filas copiadas de Excel con
   País · Campus · Participantes: el país se reconoce por nombre o código ISO,
   y las filas repetidas se suman (sirve una lista de una persona por fila).
   ========================================================================== */

import { useMemo, useState } from "react";
import type { OdImportKind, OdMapRow } from "../../../../types/database";
import { COUNTRIES } from "../../../datos-abiertos/data/world-map";
import type { StationProps } from "../OdAdmin";
import { DataGrid, cellKey } from "../DataGrid";
import type { CellKey } from "../DataGrid";
import { useSaveMap, useSaveMapValues } from "../od-data";
import { Panel, SaveState, YearPicker } from "../ui";
import { detectSeparator, parseNumber } from "../sheet";

const NAME = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));
const PICKABLE = COUNTRIES.filter((c) => c.code !== "COL");

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Formas habituales de escribir un país que no coinciden con el nombre del mapa. */
const ALIASES: Record<string, string> = {
  "eeuu": "USA", "ee uu": "USA", "usa": "USA", "estados unidos de america": "USA", "united states": "USA",
  "inglaterra": "GBR", "gran bretana": "GBR", "escocia": "GBR", "gales": "GBR",
  "holanda": "NLD", "corea": "KOR", "republica de corea": "KOR", "rusia": "RUS", "federacion de rusia": "RUS",
  "republica checa": "CZE", "brasil": "BRA", "espana": "ESP", "mexico": "MEX", "peru": "PER", "panama": "PAN",
  "mejico": "MEX", "trinidad": "TTO", "emiratos arabes": "ARE", "taiwan": "TWN", "swazilandia": "SWZ",
};

const BY_NAME = new Map<string, string>([
  ...PICKABLE.map((c) => [normalize(c.name), c.code] as [string, string]),
  ...PICKABLE.map((c) => [c.code.toLowerCase(), c.code] as [string, string]),
  ...Object.entries(ALIASES),
]);

export function findCountry(text: string): string | null {
  return BY_NAME.get(normalize(text)) ?? null;
}

export function MobilityCapture({ data, report, periodId, canEdit, maps, map, onPickMap }: StationProps & {
  maps: OdMapRow[];
  map: OdMapRow;
  onPickMap: (id: string) => void;
}) {
  const years = map.years && map.years.length ? data.catalog.years.filter((y) => map.years!.includes(y)) : data.catalog.years;
  const [pickedYear, setYear] = useState<number | null>(null);
  const year = pickedYear !== null && years.includes(pickedYear) ? pickedYear : years[years.length - 1];
  const save = useSaveMapValues();
  const saveMap = useSaveMap();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  const [added, setAdded] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const incoming = map.mode === "entrante";

  const campuses = data.rows.campuses;
  const allValues = data.rows.mapValues.filter((v) => v.map_id === map.id);
  const values = allValues.filter((v) => v.year === year);
  const stored = (country: string, campus: string) => {
    const v = values.find((x) => x.department_code === country && x.campus_id === campus);
    return v ? Number(v.value) : null;
  };
  const changes = Object.keys(draft).length;

  const rows = useMemo(() => {
    const codes = new Set([
      ...allValues.map((v) => v.department_code),
      ...added,
      ...Object.keys(draft).map((key) => key.split("|")[0]),
    ]);
    return [...codes]
      .filter((code) => NAME[code])
      .sort((a, b) => NAME[a].localeCompare(NAME[b], "es"))
      .map((code) => ({ key: code, label: NAME[code], sub: code }));
  }, [allValues, added, draft]);

  const reset = () => {
    setDraft({});
    setAdded([]);
    setProblems([]);
  };

  const addCountry = (text: string) => {
    const code = findCountry(text);
    if (!code) return false;
    setAdded((list) => (list.includes(code) ? list : [...list, code]));
    setSearch("");
    return true;
  };

  /** País · Campus · Participantes. Con un solo campus, basta País · Participantes. */
  const applyList = () => {
    const lines = pasted.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    if (!lines.length) return;
    const separator = detectSeparator(lines[0]);
    const sums: Record<CellKey, number> = {};
    const issues: string[] = [];
    lines.forEach((line, index) => {
      const cells = line.split(separator).map((c) => c.trim());
      const [countryText, second, third] = cells;
      const campusText = cells.length >= 3 ? second : campuses.length === 1 ? campuses[0].label : "";
      const amountText = cells.length >= 3 ? third : second;
      const amount = parseNumber(amountText ?? "");
      const country = findCountry(countryText ?? "");
      // Una cabecera ("País; Campus; Participantes") se salta sin avisar.
      if (index === 0 && !country && !amount.ok) return;
      const campus = campuses.find((c) => normalize(c.label) === normalize(campusText) || normalize(c.slug) === normalize(campusText));
      if (!country) return issues.push(`Fila ${index + 1}: no se reconoce el país "${countryText}".`);
      if (country === "COL") return issues.push(`Fila ${index + 1}: Colombia no es movilidad internacional.`);
      if (!campus) return issues.push(`Fila ${index + 1}: no se reconoce el campus "${campusText}".`);
      if (!amount.ok || amount.value === null) return issues.push(`Fila ${index + 1}: "${amountText ?? ""}" no es un número de participantes.`);
      const key = cellKey(country, campus.campus_id);
      sums[key] = (sums[key] ?? 0) + amount.value;
    });
    setProblems(issues);
    if (Object.keys(sums).length) {
      setDraft((current) => ({ ...current, ...sums }));
      setVia("pegado");
      setPasted("");
      setPasting(false);
    }
  };

  return (
    <Panel
      id="oda-mapas"
      title={incoming ? "Movilidad entrante por país" : "Movilidad saliente por país"}
      description={
        incoming
          ? "Participantes que llegan de otro país a cada campus: una fila por país de origen, una columna por campus. Una casilla vacía quita el país del mapa."
          : "Participantes que salen de cada campus a otro país: una fila por país de destino, una columna por campus. Una casilla vacía quita el país del mapa."
      }
      actions={
        <>
          {maps.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Mapa</span>
              <select value={map.id} onChange={(e) => onPickMap(e.target.value)}>
                {maps.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </label>
          )}
          <label className="oda-add-select">
            <span className="sr-only">Año</span>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); reset(); }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button
            type="button"
            className="button-primary"
            disabled={!canEdit || changes === 0 || save.isPending}
            onClick={async () => {
              // Una escritura por campus: la base borra y actualiza por (mapa, año, campus).
              for (const campus of campuses) {
                const entries = Object.entries(draft).filter(([key]) => key.endsWith(`|${campus.campus_id}`));
                if (!entries.length) continue;
                await save.mutateAsync({
                  periodId, reportId: report!.uuid!, mapId: map.id, year, campusId: campus.campus_id, kind: via,
                  values: entries.filter(([, v]) => v !== null).map(([key, value]) => ({
                    map_id: map.id, year, campus_id: campus.campus_id, department_code: key.split("|")[0], value: value as number,
                  })),
                  remove: entries.filter(([, v]) => v === null).map(([key]) => key.split("|")[0]),
                });
              }
              setDraft({});
              setVia("rejilla");
            }}
          >
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <p className="oda-panel__lede">
        <strong>{map.title}</strong> · corte {year} · {map.unit || "participantes"} · {incoming ? "país de origen → campus" : "campus → país de destino"}
      </p>
      <YearPicker
        years={data.catalog.years}
        value={map.years}
        disabled={!canEdit || saveMap.isPending}
        onChange={(next) => saveMap.mutate({ id: map.id, report_id: map.report_id, years: next })}
      />

      {canEdit && (
        <div className="oda-mobility-tools">
          <form
            className="oda-mobility-add"
            onSubmit={(e) => {
              e.preventDefault();
              addCountry(search);
            }}
          >
            <label className="admin-field">
              <span>{incoming ? "Añadir país de origen" : "Añadir país de destino"}</span>
              <input
                list={`oda-countries-${map.id}`}
                value={search}
                placeholder="Escribe el país o su código ISO (MEX)"
                onChange={(e) => {
                  setSearch(e.target.value);
                  // Elegir de la lista añade el país sin pulsar el botón.
                  if (PICKABLE.some((c) => c.name === e.target.value)) addCountry(e.target.value);
                }}
              />
            </label>
            <datalist id={`oda-countries-${map.id}`}>
              {PICKABLE.map((c) => <option key={c.code} value={c.name}>{c.code}</option>)}
            </datalist>
            <button type="submit" className="button-secondary" disabled={!findCountry(search)}>Añadir</button>
          </form>
          <button type="button" className="button-secondary" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>
            Pegar lista
          </button>
        </div>
      )}

      {pasting && (
        <div className="oda-inline-form">
          <label className="admin-field admin-field--wide">
            <span>
              Filas copiadas de Excel <small>{incoming ? "País de origen" : "País de destino"} · Campus · No. de participantes. Las filas repetidas se suman.</small>
            </span>
            <textarea
              rows={6}
              value={pasted}
              placeholder={`México\t${campuses[0]?.label ?? "Bucaramanga"}\t12\nEspaña\t${campuses[1]?.label ?? campuses[0]?.label ?? "Cúcuta"}\t4`}
              onChange={(e) => setPasted(e.target.value)}
            />
          </label>
          <div className="oda-inline-form__actions">
            <button type="button" className="button-secondary" onClick={() => setPasting(false)}>Cancelar</button>
            <button type="button" className="button-primary" disabled={!pasted.trim()} onClick={applyList}>Llevar a la rejilla</button>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="oda-mobility-problems" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="oda-muted">Todavía no hay países en este mapa. Añade uno con el buscador o pega la lista desde Excel.</p>
      ) : (
        <DataGrid
          label={`${map.title}, ${year}`}
          rowHeader={incoming ? "País de origen" : "País de destino"}
          rows={rows}
          columns={campuses.map((c) => ({ key: c.campus_id, label: c.label }))}
          stored={stored}
          draft={draft}
          onDraft={setDraft}
          onPasted={() => setVia("pegado")}
          readOnly={!canEdit}
        />
      )}
    </Panel>
  );
}
