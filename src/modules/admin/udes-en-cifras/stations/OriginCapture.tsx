/* =============================================================================
   Mapa de origen por municipio en la intranet (0044).

   Dos maneras de cargarlo, las dos por el mismo camino:
   · Un registro por estudiante: el Excel o CSV de la caracterización (o de
     matrícula) tal como sale del sistema. Se elige qué columna es la ciudad,
     cuál el periodo y, si la hay, cuál el campus.
   · Una tabla ya contada: se pega desde Excel con una columna de cantidad.

   El archivo se lee en este navegador y se reduce enseguida a conteos por
   año, campus y municipio. Nombres, documentos y cualquier otra columna no
   salen del equipo. Antes de guardar se aplica la reserva estadística: una
   celda con menos de 5 personas se guarda sin su cifra («< 5»). Con cada
   municipio va también el total de su departamento, que es el calor del mapa.

   Guardar reemplaza los años que trae la carga; los demás quedan como estaban.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdMapRow } from "../../../../types/database";
import { locateMunicipio, periodLabel, plano, yearOfPeriod } from "../../../datos-abiertos/data/municipios";
import type { LocateMiss } from "../../../datos-abiertos/data/municipios";
import { MUNICIPIOS } from "../../../datos-abiertos/data/colombia-municipios";
import type { StationProps } from "../OdAdmin";
import { useReplaceMapValues } from "../od-data";
import { parseClipboardGrid, parseCsv, parseNumber } from "../sheet";
import { Panel, SaveState } from "../ui";

const MIN_CELDA = 5;
const MUNI_NAME = new Map(MUNICIPIOS.map(([code, name]) => [code, name]));

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const count = (n: number) => integer.format(n);

type Grid = string[][];

/** Encabezados que delatan cada columna, en orden de preferencia. */
const GUESS = {
  city: ["MUNICIPIO DE PROCEDENCIA", "CIUDAD DE PROCEDENCIA", "MUNICIPIO PROCEDENCIA", "CIUDAD PROCEDENCIA", "MUNICIPIO DE ORIGEN", "CIUDAD DE ORIGEN", "MUNICIPIO DE RESIDENCIA", "CIUDAD DE RESIDENCIA", "CIUDAD RESIDENCIA", "MUNICIPIO", "CIUDAD", "LUGAR DE NACIMIENTO", "CIUDAD DE NACIMIENTO"],
  dept: ["DEPARTAMENTO DE PROCEDENCIA", "DEPARTAMENTO DE ORIGEN", "DEPARTAMENTO DE RESIDENCIA", "DEPARTAMENTO"],
  period: ["PERIODO", "PERIODO ACADEMICO", "AÑO", "ANO", "ANIO", "CORTE"],
  campus: ["CAMPUS", "SEDE"],
  amount: ["CANTIDAD", "ESTUDIANTES", "TOTAL", "CONTEO", "N"],
  country: ["PAIS DE ORIGEN", "PAIS DE PROCEDENCIA", "PAIS DE RESIDENCIA", "PAIS"],
} as const;

type Role = keyof typeof GUESS;
const ROLE_LABEL: Record<Role, string> = {
  city: "Ciudad o municipio",
  dept: "Departamento (opcional)",
  period: "Periodo o año",
  campus: "Campus (opcional)",
  amount: "Cantidad (solo si ya viene contada)",
  country: "País (opcional: lo que no es Colombia queda fuera)",
};

function guessColumn(head: string[], role: Role): number {
  const h = head.map((x) => plano(x));
  for (const want of GUESS[role]) {
    const i = h.findIndex((x) => x === plano(want));
    if (i >= 0) return i;
  }
  for (const want of GUESS[role]) {
    const i = h.findIndex((x) => x.startsWith(plano(want)));
    if (i >= 0) return i;
  }
  return -1;
}

/** La fila de encabezados: la primera de las diez de arriba que nombra una ciudad o un periodo. */
function headerRow(grid: Grid): number {
  for (let r = 0; r < Math.min(10, grid.length); r += 1) {
    const h = grid[r].map((x) => plano(x));
    if (h.some((x) => GUESS.city.some((c) => x.startsWith(plano(c)))) || h.some((x) => GUESS.period.includes(x as never))) return r;
  }
  return 0;
}

interface Source {
  name: string;
  head: string[];
  rows: Grid;
}

export function OriginCapture({ data, report, periodId, canEdit, maps, map, onPickMap }: StationProps & {
  maps: OdMapRow[];
  map: OdMapRow;
  onPickMap: (id: string) => void;
}) {
  const replace = useReplaceMapValues();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [cols, setCols] = useState<Record<Role, number>>({ city: -1, dept: -1, period: -1, campus: -1, amount: -1, country: -1 });
  const [fixedCampus, setFixedCampus] = useState("");
  const [periods, setPeriods] = useState<Set<string> | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [pasting, setPasting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState("");

  const campuses = data.rows.campuses;
  const published = report?.status === "publicado";
  const storedYears = useMemo(
    () => [...new Set(data.rows.mapValues.filter((v) => v.map_id === map.id).map((v) => v.year))].sort(),
    [data.rows.mapValues, map.id],
  );

  /** Campus del periodo por nombre o slug; Bogotá se cuenta en Bucaramanga. */
  const campusOf = (value: string): string | undefined => {
    const key = plano(value);
    if (!key) return undefined;
    const alias = key.startsWith("BOGOTA") ? "BUCARAMANGA" : key;
    return campuses.find((c) => plano(c.label) === alias || plano(c.slug) === alias)?.campus_id;
  };

  const adopt = (name: string, grid: Grid) => {
    const clean = grid.filter((row) => row.some((c) => String(c ?? "").trim() !== ""));
    if (clean.length < 2) {
      setReadError(`«${name}» no trae filas con datos.`);
      return;
    }
    const at = headerRow(clean);
    const head = clean[at].map((c) => String(c ?? "").trim());
    const rows = clean.slice(at + 1).map((row) => head.map((_, i) => String(row[i] ?? "").trim()));
    setSource({ name, head, rows });
    setCols({ city: guessColumn(head, "city"), dept: guessColumn(head, "dept"), period: guessColumn(head, "period"), campus: guessColumn(head, "campus"), amount: guessColumn(head, "amount"), country: guessColumn(head, "country") });
    setPeriods(null);
    setConfirming(false);
    setDone("");
    setReadError("");
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError("");
    try {
      if (/\.csv$/i.test(file.name)) {
        adopt(file.name, parseCsv(await file.text()));
      } else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const book = (await readXlsxFile(file)) as unknown as { sheet: string; data: unknown[][] }[];
        const first = book.find((s) => s.data.length > 1) ?? book[0];
        adopt(file.name, (first?.data ?? []).map((row) => row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? "")))));
      }
    } catch (error) {
      setReadError(`No se pudo leer «${file.name}»: ${error instanceof Error ? error.message : "no parece un .xlsx o .csv válido"}.`);
    } finally {
      setReading(false);
    }
  };

  const paste = (text: string) => {
    if (!text.trim()) return;
    adopt("tabla pegada", text.includes("\t") ? parseClipboardGrid(text) : parseCsv(text));
    setPasting(false);
  };

  // --- Conteo en el navegador -----------------------------------------------------
  const plan = useMemo(() => {
    if (!source || cols.city < 0 || cols.period < 0) return null;
    const foundPeriods = new Map<string, number>();
    for (const row of source.rows) {
      const p = periodLabel(row[cols.period]);
      if (yearOfPeriod(p)) foundPeriods.set(p, (foundPeriods.get(p) ?? 0) + 1);
    }
    const chosen = periods ?? new Set(foundPeriods.keys());
    const counts = new Map<string, number>();
    const misses = new Map<string, { reason: LocateMiss | "sin campus" | "cantidad" | "exterior"; n: number }>();
    let abroad = 0;
    let deptOnly = 0;
    let records = 0;
    let located = 0;
    for (const row of source.rows) {
      const p = periodLabel(row[cols.period]);
      const year = yearOfPeriod(p);
      if (!year || !chosen.has(p)) continue;
      const amount = cols.amount >= 0 ? parseNumber(row[cols.amount]) : { ok: true as const, value: 1 };
      const n = amount.ok && amount.value !== null ? amount.value : null;
      if (n === null || n <= 0) {
        if (cols.amount >= 0) misses.set(`${row[cols.amount] || "(vacío)"}`, { reason: "cantidad", n: (misses.get(`${row[cols.amount]}`)?.n ?? 0) + 1 });
        continue;
      }
      records += n;
      const campusId = cols.campus >= 0 ? campusOf(row[cols.campus]) : fixedCampus || undefined;
      if (!campusId) {
        const k = `${cols.campus >= 0 ? row[cols.campus] || "(vacío)" : "(sin campus)"}`;
        misses.set(k, { reason: "sin campus", n: (misses.get(k)?.n ?? 0) + n });
        continue;
      }
      // Quien viene de otro país no se ubica en el mapa de Colombia.
      if (cols.country >= 0 && !["", "COLOMBIA", "NO REGISTRA"].includes(plano(row[cols.country]))) {
        abroad += n;
        const k = row[cols.country];
        misses.set(k, { reason: "exterior", n: (misses.get(k)?.n ?? 0) + n });
        continue;
      }
      const where = locateMunicipio(row[cols.city], cols.dept >= 0 ? row[cols.dept] : undefined);
      if ("miss" in where) {
        const k = row[cols.city] || "(vacío)";
        misses.set(k, { reason: where.miss, n: (misses.get(k)?.n ?? 0) + n });
        continue;
      }
      located += n;
      // Solo el departamento: suma a su calor, sin punto de ciudad.
      if (where.code.length === 2) deptOnly += n;
      for (const code of where.code.length === 2 ? [where.code] : [where.code, where.code.slice(0, 2)]) {
        const key = `${year}|${campusId}|${code}`;
        counts.set(key, (counts.get(key) ?? 0) + n);
      }
    }
    const rows = [...counts.entries()].map(([key, n]) => {
      const [year, campus_id, department_code] = key.split("|");
      const reserved = n < MIN_CELDA;
      return { year: Number(year), campus_id, department_code, value: reserved ? null : n, reserved };
    });
    const years = [...new Set(rows.map((r) => r.year))].sort();
    const municipios = new Set(rows.filter((r) => r.department_code.length === 5).map((r) => r.department_code));
    const top = [...counts.entries()]
      .filter(([k]) => k.split("|")[2].length === 5)
      .reduce((acc, [k, n]) => acc.set(k.split("|")[2], (acc.get(k.split("|")[2]) ?? 0) + n), new Map<string, number>());
    return {
      foundPeriods: [...foundPeriods.entries()].sort(),
      chosen,
      records,
      located,
      rows,
      years,
      municipios: municipios.size,
      reservedCells: rows.filter((r) => r.reserved && r.department_code.length === 5).length,
      misses: [...misses.entries()].sort((a, b) => b[1].n - a[1].n),
      abroad,
      deptOnly,
      top: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [source, cols, periods, fixedCampus, campuses]);

  const apply = () => {
    if (!plan || !report?.uuid) return;
    replace.mutate(
      { periodId, reportId: report.uuid, mapId: map.id, years: plan.years, rows: plan.rows, fileName: source?.name ?? "", kind: source?.name === "tabla pegada" ? "pegado" : "plantilla" },
      {
        onSuccess: () => {
          setDone(`${count(plan.located)} registros de ${plan.years.join(", ")} guardados como conteos en ${count(plan.municipios)} municipios.`);
          setSource(null);
          setConfirming(false);
        },
      },
    );
  };

  const pick = (role: Role, value: number) => {
    setCols({ ...cols, [role]: value });
    setConfirming(false);
  };

  return (
    <Panel
      title={map.title}
      description="Origen por municipio: calor por departamento y, al acercarse, un punto por ciudad. Se carga desde el archivo de registros o desde una tabla ya contada."
      actions={
        <>
          <SaveState pending={replace.isPending} error={replace.error} success={replace.isSuccess} />
          {maps.length > 1 && (
            <label className="oda-inline-field">
              <span>Mapa</span>
              <select value={map.id} onChange={(e) => onPickMap(e.target.value)}>
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="button-secondary" disabled={!canEdit || reading} onClick={() => setPasting(!pasting)}>
            <Icon name="table" size={15} /> Pegar tabla
          </button>
          <button type="button" className="button-secondary" disabled={!canEdit || reading} onClick={() => fileInput.current?.click()}>
            <Icon name="document" size={15} /> {reading ? "Leyendo…" : source ? "Otro archivo" : "Elegir archivo .xlsx o .csv"}
          </button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="oda-import oda-origin">
        <p className="oda-saber__privacy">
          <Icon name="lock" size={15} />
          <span>
            El archivo se lee en este navegador y se reduce a conteos por año, campus y municipio. Nombres, documentos y las
            demás columnas no se envían a ninguna parte. Un municipio con menos de {MIN_CELDA} personas en un campus se guarda
            sin su cifra y el portal lo escribe «&lt; {MIN_CELDA}».
          </span>
        </p>

        {storedYears.length > 0 && !source && (
          <p className="oda-muted">
            En el portal: {storedYears.join(", ")}. Una carga nueva reemplaza solo los años que trae.
          </p>
        )}

        {pasting && (
          <label className="admin-field admin-field--wide oda-origin__paste">
            <span>Pega la tabla con encabezados: Municipio · Departamento · Periodo · Campus · Cantidad</span>
            <textarea
              rows={6}
              autoFocus
              placeholder={"Municipio\tDepartamento\tPeriodo\tCampus\tCantidad\nBucaramanga\tSantander\t2025-2\tBucaramanga\t812"}
              onPaste={(e) => {
                e.preventDefault();
                paste(e.clipboardData.getData("text"));
              }}
            />
          </label>
        )}

        {readError && (
          <p className="oda-import__error" role="alert">
            <Icon name="alert" size={14} /> {readError}
          </p>
        )}
        {done && !source && (
          <p className="oda-import__ok" role="status">
            <Icon name="check" size={14} /> {done}
          </p>
        )}

        {source && (
          <>
            <div className="oda-grid-toolbar">
              <span className="oda-muted">
                <strong>{source.name}</strong> · {count(source.rows.length)} filas
              </span>
              <button type="button" className="oda-link-button" onClick={() => setSource(null)}>
                Descartar
              </button>
            </div>

            <div className="oda-form-grid oda-origin__columns">
              {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                <label key={role} className="admin-field">
                  <span>{ROLE_LABEL[role]}</span>
                  <select value={cols[role]} onChange={(e) => pick(role, Number(e.target.value))}>
                    <option value={-1}>{role === "city" || role === "period" ? "Elige la columna" : "No viene"}</option>
                    {source.head.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Columna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {cols.campus < 0 && (
                <label className="admin-field">
                  <span>Todos los registros son del campus</span>
                  <select value={fixedCampus} onChange={(e) => setFixedCampus(e.target.value)}>
                    <option value="">Elige el campus</option>
                    {campuses.map((c) => (
                      <option key={c.campus_id} value={c.campus_id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {plan && plan.foundPeriods.length > 0 && (
              <fieldset className="oda-origin__periods">
                <legend>Periodos que entran</legend>
                {plan.foundPeriods.map(([p, n]) => (
                  <label key={p} className="oda-check">
                    <input
                      type="checkbox"
                      checked={plan.chosen.has(p)}
                      onChange={(e) => {
                        const next = new Set(plan.chosen);
                        if (e.target.checked) next.add(p);
                        else next.delete(p);
                        setPeriods(next);
                        setConfirming(false);
                      }}
                    />
                    {p} <span className="oda-muted">· {count(n)} filas</span>
                  </label>
                ))}
                <p className="oda-field-hint">
                  Los periodos de un mismo año se suman en ese año: quien aparece en los dos periodos cuenta dos veces.
                </p>
              </fieldset>
            )}

            {plan && (
              <div className="oda-import__plan">
                <table className="oda-table">
                  <caption className="sr-only">Lo que se va a guardar</caption>
                  <tbody>
                    <tr>
                      <th scope="row">Registros de los periodos elegidos</th>
                      <td>{count(plan.records)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Ubicados en un municipio de Colombia</th>
                      <td>
                        {count(plan.located)} · {plan.records ? Math.round((plan.located / plan.records) * 100) : 0} %
                      </td>
                    </tr>
                    {plan.deptOnly > 0 && (
                      <tr>
                        <th scope="row">Solo con departamento (suman al calor, sin punto de ciudad)</th>
                        <td>{count(plan.deptOnly)}</td>
                      </tr>
                    )}
                    {plan.abroad > 0 && (
                      <tr>
                        <th scope="row">De otro país (fuera del mapa)</th>
                        <td>{count(plan.abroad)}</td>
                      </tr>
                    )}
                    <tr>
                      <th scope="row">Municipios distintos</th>
                      <td>{count(plan.municipios)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Celdas con menos de {MIN_CELDA} (se guardan sin cifra)</th>
                      <td>{count(plan.reservedCells)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Años</th>
                      <td>
                        {plan.years.map((y) => `${y}${storedYears.includes(y) ? " (se reemplaza)" : ""}`).join(", ") || "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {plan.top.length > 0 && (
                  <p className="oda-muted">
                    Más aportan: {plan.top.map(([code, n]) => `${MUNI_NAME.get(code) ?? code} ${count(n)}`).join(" · ")}
                  </p>
                )}

                {plan.misses.length > 0 && (
                  <ul className="oda-import__warnings">
                    <li>
                      <span>Aviso · sin ubicar</span>
                      {count(plan.misses.reduce((s, [, m]) => s + m.n, 0))} registros no entran al mapa:{" "}
                      {plan.misses
                        .slice(0, 10)
                        .map(([value, m]) => `${value} ×${count(m.n)} (${m.reason})`)
                        .join(" · ")}
                      {plan.misses.length > 10 ? " …" : ""}. Un nombre ambiguo se resuelve con la columna de departamento.
                    </li>
                  </ul>
                )}

                <footer className="oda-import__apply">
                  <p>
                    <Icon name="alert" size={15} />
                    <span>
                      Guardar <strong>reemplaza las cifras de {plan.years.join(", ")}</strong> de este mapa. Los demás años no cambian.
                      {published ? " El informe está publicado: el cambio se ve en el portal de inmediato." : ""}
                    </span>
                  </p>
                  <div className="oda-import__actions">
                    {!confirming ? (
                      <button
                        type="button"
                        className="button-primary"
                        disabled={!canEdit || replace.isPending || plan.rows.length === 0}
                        onClick={() => setConfirming(true)}
                      >
                        Guardar conteos de {count(plan.municipios)} municipios
                      </button>
                    ) : (
                      <span className="oda-confirm" role="group" aria-label="Confirmar la carga">
                        <span>
                          {published ? `Las cifras ${plan.years.join(", ")} se reemplazan en el portal.` : `Las cifras ${plan.years.join(", ")} se reemplazan.`}
                        </span>
                        <button type="button" className="button-primary" onClick={apply}>
                          Sí, reemplazar
                        </button>
                        <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>
                          Cancelar
                        </button>
                      </span>
                    )}
                  </div>
                </footer>
              </div>
            )}
            {!plan && <p className="oda-field-hint">Elige al menos la columna de ciudad y la de periodo.</p>}
          </>
        )}
      </div>
    </Panel>
  );
}
