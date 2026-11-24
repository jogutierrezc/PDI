/* =============================================================================
   Captura · importar un informe completo.

   Para los informes que llegan como documento (un Word con sus puntos y una
   carpeta de CSV), no casilla por casilla. Se sube la carpeta tal cual la
   entrega la oficina, el importador arma el plan y la intranet lo muestra
   entero antes de tocar nada: qué puntos trae y en qué estado, cuántas cifras,
   qué tablas, qué archivos no reconoció y los avisos de calidad de los datos.

   Aplicar reemplaza todo el contenido del informe en el periodo elegido, en
   una sola transacción (od_import_report). Se repite en cada corte.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { IMPORT_PROFILES } from "../import/investigacion";
import type { ImportFile, ImportPlan, ImportProfile } from "../import/types";
import type { StationProps } from "../OdAdmin";
import { useImportReport } from "../od-data";
import { Panel, SaveState } from "../ui";

export const profileFor = (slug: string | undefined): ImportProfile | undefined => IMPORT_PROFILES.find((p) => p.report === slug);

const STATUS_LABEL: Record<ImportPlan["sections"][number]["status"], string> = {
  completo: "Completo",
  parcial: "Parcial",
  no_recibido: "No recibido",
  no_oficial: "No oficial",
  abierto: "Abierto",
};

async function readFiles(list: FileList): Promise<ImportFile[]> {
  const files = Array.from(list).filter((f) => /\.(csv|docx)$/i.test(f.name) && !f.name.startsWith("~$"));
  return Promise.all(
    files.map(async (file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return /\.docx$/i.test(file.name)
        ? { name: file.name, path, bytes: new Uint8Array(await file.arrayBuffer()) }
        : { name: file.name, path, text: await file.text() };
    }),
  );
}

export function ImportReport({ data, report, canEdit }: StationProps) {
  const profile = profileFor(report?.slug)!;
  const apply = useImportReport();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const context = useMemo(
    () => ({ years: data.catalog.years, campuses: data.rows.campuses.map((c) => ({ slug: c.slug, label: c.label })) }),
    [data],
  );

  const current = useMemo(() => {
    const id = report!.uuid;
    return {
      sections: data.rows.sections.filter((s) => s.report_id === id).length,
      indicators: data.rows.indicators.filter((i) => i.report_id === id).length,
      breakdowns: data.rows.breakdowns.filter((b) => b.report_id === id).length,
      heatmaps: data.rows.heatmaps.filter((h) => h.report_id === id).length,
      tables: data.rows.tables.filter((t) => t.report_id === id).length,
      other:
        data.rows.maps.filter((m) => m.report_id === id).length +
        data.rows.pipelines.filter((p) => p.report_id === id).length +
        data.rows.histories.filter((h) => h.report_id === id).length,
    };
  }, [data, report]);

  const load = async (list: FileList | null, merge: boolean) => {
    if (!list || list.length === 0) return;
    setReadError(null);
    setResult(null);
    setConfirming(false);
    apply.reset();
    try {
      const incoming = await readFiles(list);
      const byPath = new Map((merge ? files : []).map((f) => [f.path, f]));
      incoming.forEach((f) => byPath.set(f.path, f));
      const next = [...byPath.values()];
      setFiles(next);
      setPlan(profile.build(next, context));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "No se pudieron leer los archivos.");
    }
  };

  const clear = () => {
    setFiles([]);
    setPlan(null);
    setConfirming(false);
    setResult(null);
    apply.reset();
  };

  const cells = plan
    ? {
        values: plan.indicators.reduce((n, i) => n + i.values.filter((v) => v.value !== null).length, 0),
        breakdownValues: plan.breakdowns.reduce((n, b) => n + b.values.length, 0),
        rows: plan.tables.reduce((n, t) => n + t.rows.length, 0),
      }
    : null;
  const errors = plan?.warnings.filter((w) => w.level === "error") ?? [];
  const avisos = plan?.warnings.filter((w) => w.level === "aviso") ?? [];
  const unknown = plan?.files.filter((f) => !f.used) ?? [];
  const found = new Set(plan?.files.filter((f) => f.used).map((f) => f.name.replace(/\\/g, "/").toLowerCase()) ?? []);
  // Con carpeta se compara la ruta; con archivos sueltos, el nombre.
  const expectedFound = (pattern: string) => {
    const toRe = (p: string) => new RegExp(`(^|/)${p.toLowerCase().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    const full = toRe(pattern);
    const base = toRe(pattern.split("/").pop()!);
    return [...found].some((name) => full.test(name) || base.test(name.split("/").pop()!));
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const sectionTitle = (key: string | null) => {
    const s = plan?.sections.find((x) => x.key === key);
    return s ? `Punto ${s.number}` : "General";
  };

  return (
    <div className="oda-stack oda-import">
      <Panel
        id="oda-importar"
        title={`Importar informe · ${profile.name}`}
        description={profile.description}
        actions={
          <>
            {files.length > 0 && (
              <button type="button" className="button-ghost" onClick={clear}>
                Quitar archivos
              </button>
            )}
            <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => filesInput.current?.click()}>
              <Icon name="plus" size={15} /> Archivos
            </button>
            <button type="button" className="button-primary" disabled={!canEdit} onClick={() => folderInput.current?.click()}>
              <Icon name="document" size={15} /> Subir carpeta
            </button>
          </>
        }
      >
        <input
          ref={folderInput}
          type="file"
          hidden
          multiple
          // Carpeta completa, con sus subcarpetas (punto01/, punto02/…).
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => { void load(e.target.files, false); e.target.value = ""; }}
        />
        <input
          ref={filesInput}
          type="file"
          hidden
          multiple
          accept=".csv,.docx"
          onChange={(e) => { void load(e.target.files, true); e.target.value = ""; }}
        />

        {!plan ? (
          <div className="oda-import__intro">
            <p>
              Sube la carpeta del informe tal como la entrega la oficina: el Word y la carpeta <code>datos_procesados</code> con
              un CSV por tabla. También puedes añadir archivos sueltos. Nada se guarda hasta que revises el plan y lo apliques.
            </p>
            <h3>Archivos que reconoce</h3>
            <ul className="oda-import__expected">
              {profile.expected.map((file) => (
                <li key={file.name}>
                  <code>{file.name}</code>
                  <span>{file.section.startsWith("punto-") ? `Punto ${Number(file.section.slice(6))}` : file.section}</span>
                </li>
              ))}
            </ul>
            {readError && <p className="oda-import__error" role="alert"><Icon name="alert" size={14} /> {readError}</p>}
          </div>
        ) : (
          <div className="oda-import__plan">
            <dl className="oda-import__facts">
              <div><dt>Corte</dt><dd>{plan.corte}</dd></div>
              <div><dt>Puntos</dt><dd>{plan.sections.length}</dd></div>
              <div><dt>Indicadores</dt><dd>{plan.indicators.length} <small>{cells!.values} cifras</small></dd></div>
              <div><dt>Desgloses</dt><dd>{plan.breakdowns.length} <small>{cells!.breakdownValues} cifras</small></dd></div>
              <div><dt>Mapas de calor</dt><dd>{plan.heatmaps.length}</dd></div>
              <div><dt>Evolución histórica</dt><dd>{plan.histories.length}</dd></div>
              <div><dt>Tablas</dt><dd>{plan.tables.length} <small>{cells!.rows} filas</small></dd></div>
              <div><dt>Archivos</dt><dd>{plan.files.length - unknown.length} de {plan.files.length}</dd></div>
            </dl>
            {plan.scope && <p className="oda-import__scope">Alcance: {plan.scope}</p>}

            <div className="oda-import__cols">
              <section aria-labelledby="oda-import-puntos">
                <h3 id="oda-import-puntos">Puntos del informe</h3>
                <ol className="oda-import__points">
                  {plan.sections.map((section) => {
                    const count =
                      plan.indicators.filter((i) => i.section === section.key).length +
                      plan.breakdowns.filter((b) => b.section === section.key).length +
                      plan.heatmaps.filter((h) => h.section === section.key).length +
                      plan.histories.filter((h) => h.section === section.key).length +
                      plan.tables.filter((t) => t.section === section.key).length;
                    return (
                      <li key={section.key} data-status={section.status}>
                        <b>{section.number}</b>
                        <span>{section.title}</span>
                        <em data-status={section.status}>{STATUS_LABEL[section.status]}</em>
                        <small>{count ? plural(count, "conjunto", "conjuntos") : section.requested.length ? `${plural(section.requested.length, "dato", "datos")} por pedir` : "solo texto"}</small>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section aria-labelledby="oda-import-avisos">
                <h3 id="oda-import-avisos">
                  Avisos de calidad <span className="oda-tab__count">{plan.warnings.length}</span>
                </h3>
                {plan.warnings.length === 0 ? (
                  <p className="oda-import__ok"><Icon name="check" size={14} /> Sin avisos.</p>
                ) : (
                  <ul className="oda-import__warnings">
                    {[...errors, ...avisos].map((w, i) => (
                      <li key={i} data-level={w.level}>
                        <span>{w.level === "error" ? "Revisar" : "Aviso"} · {sectionTitle(w.section)}</span>
                        {w.message}
                      </li>
                    ))}
                  </ul>
                )}

                <h3>Archivos esperados</h3>
                <ul className="oda-import__expected" data-compact>
                  {profile.expected.map((file) => {
                    const ok = expectedFound(file.name);
                    return (
                      <li key={file.name} data-found={ok || undefined}>
                        <Icon name={ok ? "check" : "close"} size={13} />
                        <code>{file.name}</code>
                      </li>
                    );
                  })}
                </ul>
                {unknown.length > 0 && (
                  <p className="oda-import__scope">No reconocidos (no se cargan): {unknown.map((f) => f.name).join(", ")}</p>
                )}
              </section>
            </div>

            <footer className="oda-import__apply">
              <p>
                <Icon name="alert" size={15} />
                <span>
                  Aplicar <strong>reemplaza todo el contenido</strong> de {report!.name} en el periodo {data.rows.period.label}:
                  hoy tiene {current.sections} puntos, {current.indicators} indicadores, {current.breakdowns} desgloses,{" "}
                  {current.heatmaps} mapas de calor, {current.tables} tablas
                  {current.other ? ` y ${plural(current.other, "conjunto más", "conjuntos más")} (mapas, tuberías, históricos)` : ""}, con sus bloques de diseño.
                  {report!.status === "publicado" ? " El informe está publicado: el cambio se ve en el portal de inmediato." : ""}
                </span>
              </p>
              <div className="oda-import__actions">
                <SaveState pending={apply.isPending} error={apply.error} success={apply.isSuccess} />
                {!confirming ? (
                  <button type="button" className="button-primary" disabled={!canEdit || apply.isPending} onClick={() => setConfirming(true)}>
                    Aplicar al informe
                  </button>
                ) : (
                  <span className="oda-confirm" role="group" aria-label="Confirmar la importación">
                    <span>¿Reemplazar el contenido del informe?</span>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => {
                        setConfirming(false);
                        apply.mutate({ reportId: report!.uuid!, plan }, { onSuccess: (counts) => setResult((counts ?? {}) as Record<string, number>) });
                      }}
                    >
                      Sí, reemplazar
                    </button>
                    <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>
                      Cancelar
                    </button>
                  </span>
                )}
              </div>
              {result && (
                <p className="oda-import__ok" role="status">
                  <Icon name="check" size={14} /> Informe importado:{" "}
                  {Object.entries(result).map(([k, v]) => `${v} ${k.replace("_", " de ")}`).join(" · ")}. Revisa el diseño en Diseño visual y publica en Publicación.
                </p>
              )}
            </footer>
          </div>
        )}
      </Panel>
    </div>
  );
}
