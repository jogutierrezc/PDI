/* =============================================================================
   Impacto · Mr. Pilo: pesos y fuentes (Planeación).

   Tres cosas que Planeación ajusta sin tocar código:

     Pesos          cuánto suma cada señal al puntuar una ficha (impacto por
                    nombre, CESU/CNA, programas parecidos, cifras…). Se ve
                    el valor de fábrica al lado.
     Fuente P1P2P3  qué fichas alimentan los reportes de notas: si un
                    programa ya tiene datos de P1P2P3, esas fichas suben.
     Cargar P1P2P3  el consolidado AAAA-S_P1P2P3_Estudiante.xlsx se lee en el
                    navegador y solo se guardan agregados por programa, sede
                    y periodo; nunca nombres ni códigos de estudiantes.

   Escribe la administración (RLS de 0085); el resto lo ve para entender por
   qué Mr. Pilo propone lo que propone.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { StageEmpty } from "../../admin/udes-en-cifras/ui";
import { workbookToTables } from "../../admin/institucion/structure-sheet";
import { byChain } from "../model";
import { usePiloSettings, useSavePiloSettings, useSaveSourceFigures, useSourceFigures, type Catalog, type ImpactBase } from "../store";
import { DEFAULT_WEIGHTS, WEIGHT_LABELS, type PiloWeights } from "./recommend";
import { aggregateP1P2P3, foldText, type P1P2P3Parse } from "./p1p2p3";
import "./pilo.css";

export function PiloSettings({ base, catalog, canEdit }: { base: ImpactBase; catalog: Catalog; canEdit: boolean }) {
  const settings = usePiloSettings();
  const save = useSavePiloSettings();
  const [weights, setWeights] = useState<PiloWeights>(DEFAULT_WEIGHTS);
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!settings.data) return;
    setWeights(settings.data.weights);
    setCodes(settings.data.sourceMap.p1p2p3 ?? []);
  }, [settings.data]);

  if (settings.isPending) return <p className="admin-loading">Cargando los ajustes de Mr. Pilo…</p>;
  if (settings.data?.missing) {
    return (
      <StageEmpty title="Falta la migración de Mr. Pilo">
        Aplica en Supabase la migración 0085_impacto_pilo_ajustes_y_fuentes.sql.
      </StageEmpty>
    );
  }

  const keys = Object.keys(DEFAULT_WEIGHTS) as (keyof PiloWeights)[];
  const dirty =
    keys.some((k) => weights[k] !== settings.data!.weights[k]) ||
    JSON.stringify([...codes].sort()) !== JSON.stringify([...(settings.data!.sourceMap.p1p2p3 ?? [])].sort());
  const fichas = catalog.indicators.filter((i) => i.fn === "ensenanza" && i.status !== "retirado").sort(byChain);

  const submit = () =>
    save.mutate({
      // Solo se guarda lo que difiere de fábrica: así un cambio de fábrica futuro llega a quien no tocó ese peso.
      weights: Object.fromEntries(keys.filter((k) => weights[k] !== DEFAULT_WEIGHTS[k]).map((k) => [k, weights[k]])),
      sourceMap: { ...settings.data!.sourceMap, p1p2p3: codes },
    });

  return (
    <div className="pilo-settings">
      <section className="pilo-settings__block">
        <header>
          <h2>Pesos de Mr. Pilo</h2>
          <p>
            Cuánto suma cada señal cuando Mr. Pilo puntúa una ficha para un programa. La cadena completa (un indicador por
            eslabón en cada función) no depende de los pesos: se cumple siempre.
          </p>
        </header>
        <div className="pilo-settings__weights">
          {keys.map((k) => (
            <label key={k} className="pilo-weight">
              <span className="pilo-weight__label">
                <strong>{WEIGHT_LABELS[k].label}</strong>
                <small>{WEIGHT_LABELS[k].hint}</small>
              </span>
              <input
                type="number"
                step={0.5}
                min={-50}
                max={50}
                value={weights[k]}
                disabled={!canEdit}
                onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
              />
              <span className="pilo-weight__default" data-changed={weights[k] !== DEFAULT_WEIGHTS[k] || undefined}>
                fábrica {DEFAULT_WEIGHTS[k]}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="pilo-settings__block">
        <header>
          <h2>Qué fichas alimenta P1P2P3</h2>
          <p>Si los reportes de notas ya traen datos de un programa, estas fichas suben en su propuesta: las puede reportar hoy.</p>
        </header>
        <div className="imp-chips pilo-settings__codes">
          {fichas.map((f) => {
            const on = codes.includes(f.code);
            return (
              <button
                key={f.id}
                type="button"
                className="imp-chip"
                aria-pressed={on}
                disabled={!canEdit}
                title={f.name}
                onClick={() => setCodes((list) => (on ? list.filter((c) => c !== f.code) : [...list, f.code]))}
              >
                {f.code} · {f.name.length > 42 ? `${f.name.slice(0, 40)}…` : f.name}
              </button>
            );
          })}
        </div>
      </section>

      {canEdit && (
        <div className="imp-sync__bar">
          <span>{dirty ? "Hay cambios sin guardar." : "Los ajustes están al día."}</span>
          {save.error && (
            <span className="imp-sync__error" role="alert">
              <Icon name="alert" size={15} /> {save.error.message}
            </span>
          )}
          <button type="button" className="button-ghost" onClick={() => setWeights(DEFAULT_WEIGHTS)}>
            Volver a los de fábrica
          </button>
          <button type="button" className="button-primary" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? "Guardando…" : "Guardar ajustes"}
          </button>
        </div>
      )}

      <SourceLoader base={base} canEdit={canEdit} />
    </div>
  );
}

/* --- Cargar el consolidado P1P2P3 ---------------------------------------------------------- */

function SourceLoader({ base, canEdit }: { base: ImpactBase; canEdit: boolean }) {
  const loaded = useSourceFigures();
  const saveFigures = useSaveSourceFigures();
  const file = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(P1P2P3Parse & { name: string }) | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  const programs = base.units.filter((u) => u.kind === "programa");
  const campusOf = (name: string) => base.campuses.find((c) => foldText(c.name) === foldText(name) || foldText(c.slug) === foldText(name));
  const offered = (programId: string, campusId: string) => base.offer.some((o) => o.programId === programId && o.campusId === campusId);

  // Reconocer cada grupo: por código del programa y, si no, por nombre, en su sede.
  const auto = useMemo(() => {
    const out: Record<string, string> = {};
    for (const g of parsed?.groups ?? []) {
      const campus = campusOf(g.campus);
      if (!campus) continue;
      const byCode = programs.filter((p) => foldText(p.code) === foldText(g.programCode) && offered(p.id, campus.id));
      const byName = programs.filter((p) => foldText(p.name) === foldText(g.programName) && offered(p.id, campus.id));
      const match = byCode.length === 1 ? byCode[0] : byName.length === 1 ? byName[0] : null;
      if (match) out[g.key] = `${match.id}|${campus.id}`;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, base]);

  async function read(input: File) {
    setBusy(true);
    setSaved(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await input.arrayBuffer());
      const tables = workbookToTables(book);
      setParsed({ ...aggregateP1P2P3(Object.values(tables)[0] ?? []), name: input.name });
      setChoice({});
    } catch {
      setParsed({ groups: [], problems: ["No se pudo leer el archivo: tiene que ser un Excel (.xlsx)."], rows: 0, name: input.name });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  const target = (key: string) => choice[key] ?? auto[key] ?? "";
  const ready = (parsed?.groups ?? []).filter((g) => target(g.key));

  const submit = async () => {
    const rows = ready.map((g) => {
      const [programId, campusId] = target(g.key).split("|");
      return {
        source: "p1p2p3" as const,
        period: g.period,
        year: Number(g.period.slice(0, 4)),
        programId,
        campusId,
        students: g.students,
        enrollments: g.enrollments,
        approvedRate: g.approvedRate,
        averageGrade: g.averageGrade,
        atRiskRate: g.atRiskRate,
      };
    });
    setSaved(await saveFigures.mutateAsync(rows));
    setParsed(null);
  };

  const periods = [...new Set((loaded.data ?? []).map((f) => f.period))].sort();
  const siteName = (programId: string, campusId: string) =>
    `${programs.find((p) => p.id === programId)?.name ?? "Programa"} · ${base.campuses.find((c) => c.id === campusId)?.name ?? "Sede"}`;

  return (
    <section className="pilo-settings__block">
      <header>
        <h2>Cargar reportes P1P2P3</h2>
        <p>
          El consolidado AAAA-S_P1P2P3_Estudiante.xlsx se lee aquí, en su equipo. A la intranet solo llegan agregados por
          programa, sede y periodo: estudiantes, aprobación, promedio y porcentaje en riesgo en el primer corte. Nunca nombres
          ni códigos de estudiantes.
        </p>
        <p className="imp-small imp-muted">
          {periods.length
            ? `Ya cargados: ${periods.join(", ")} · ${(loaded.data ?? []).length} programas en sede con datos.`
            : "Todavía no se ha cargado ningún periodo."}
        </p>
      </header>

      {canEdit && (
        <label className="button-secondary imp-import__file">
          <Icon name="upload" size={15} /> {busy ? "Leyendo…" : "Elegir el consolidado"}
          <input
            ref={file}
            type="file"
            accept=".xlsx"
            className="sr-only"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])}
          />
        </label>
      )}

      {saved !== null && (
        <p className="imp-sync__applied" role="status">
          <Icon name="check" size={16} /> Guardados {saved} agregados. Mr. Pilo ya los usa.
        </p>
      )}

      {parsed && (
        <div className="imp-import__review">
          <header>
            <h2>{parsed.name}</h2>
            <span>
              {parsed.rows} filas · {parsed.groups.length} programas en sede y periodo · {ready.length} reconocidos
            </span>
          </header>
          {parsed.problems.length > 0 && (
            <div className="imp-import__problems" role="alert">
              <ul>
                {parsed.problems.map((p, k) => (
                  <li key={k}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {parsed.groups.length > 0 && (
            <div className="imp-table-wrap imp-import__table">
              <table className="imp-table">
                <thead>
                  <tr>
                    <th scope="col">En el archivo</th>
                    <th scope="col">Periodo</th>
                    <th scope="col" className="imp-num">Estudiantes</th>
                    <th scope="col" className="imp-num">Aprobación</th>
                    <th scope="col" className="imp-num">Promedio</th>
                    <th scope="col" className="imp-num">En riesgo (P1)</th>
                    <th scope="col">Programa en la intranet</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.groups.map((g) => {
                    const campus = campusOf(g.campus);
                    return (
                      <tr key={g.key}>
                        <th scope="row">
                          {g.programName} <span className="imp-muted imp-small">· {g.programCode} · {g.campus}</span>
                        </th>
                        <td>{g.period}</td>
                        <td className="imp-num">{g.students}</td>
                        <td className="imp-num">{g.approvedRate ?? "—"} %</td>
                        <td className="imp-num">{g.averageGrade ?? "—"}</td>
                        <td className="imp-num">{g.atRiskRate ?? "—"} %</td>
                        <td>
                          <select
                            className="imp-proposals__link"
                            value={target(g.key)}
                            onChange={(e) => setChoice((c) => ({ ...c, [g.key]: e.target.value }))}
                            aria-label={`Programa para ${g.programName} en ${g.campus}`}
                          >
                            <option value="">Omitir</option>
                            {base.offer
                              .filter((o) => !campus || o.campusId === campus.id)
                              .map((o) => (
                                <option key={`${o.programId}|${o.campusId}`} value={`${o.programId}|${o.campusId}`}>
                                  {siteName(o.programId, o.campusId)}
                                </option>
                              ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {parsed.groups.length > 0 && (
            <div className="imp-sync__bar">
              <span>
                <strong>{ready.length} agregados para guardar.</strong> Reemplazan los del mismo programa, sede y periodo.
              </span>
              {saveFigures.error && (
                <span className="imp-sync__error" role="alert">
                  <Icon name="alert" size={15} /> {saveFigures.error.message}
                </span>
              )}
              <button type="button" className="button-secondary" onClick={() => setParsed(null)}>
                Descartar
              </button>
              <button type="button" className="button-primary" disabled={!ready.length || saveFigures.isPending} onClick={submit}>
                {saveFigures.isPending ? "Guardando…" : `Guardar ${ready.length}`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
