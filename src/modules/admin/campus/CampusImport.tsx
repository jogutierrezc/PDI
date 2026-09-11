/* =============================================================================
   Carga del libro de indicadores por campus.

   Tres pasos, y el del medio es el importante: **elegir, revisar, guardar**.

   La revisión no es un adorno. El libro traduce a mano informes que no reportan
   contra los pilares, y esa traducción puede fallar de tres formas: una línea
   que no existe en la estructura, una sede que el portal no conoce, o una fila
   sin anclar. Las tres se ven aquí, antes de escribir nada, porque cargar la
   mitad de un informe publicaría una cobertura del plan que no es la del
   documento.

   Se guarda en borrador por defecto. Publicar es una decisión aparte: el lote
   lleva su propio estado y publicarlo enciende sus filas de golpe.
   ========================================================================== */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useCampusBatches } from "../../../data/queries";
import { keys } from "../../../data/queries";
import { formatDate } from "../../../data/pdi";
import type { ImportSummary } from "./import";
import type { ParseResult } from "./parse";
import "./campus-import.css";

type Phase = "vacio" | "leyendo" | "revision" | "guardando" | "hecho";

export function CampusImport() {
  const queryClient = useQueryClient();
  const batches = useCampusBatches();

  const [phase, setPhase] = useState<Phase>("vacio");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  /** Códigos que el libro escribe de otra forma que el plan. No bloquean. */
  const [normalized, setNormalized] = useState<{ from: string; to: string }[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [publish, setPublish] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  function reset() {
    setPhase("vacio");
    setFile(null);
    setParsed(null);
    setBlockers([]);
    setNormalized([]);
    setSummary(null);
    setFailure(null);
  }

  async function onPick(picked: File) {
    reset();
    setFile(picked);
    setPhase("leyendo");
    try {
      // El lector y el importador se cargan aquí y no arriba: son el único
      // sitio del portal que necesita descomprimir un .xlsx, y quien solo pasa
      // por la intranet a mirar no tiene por qué descargarlo.
      const [{ parseWorkbook }, { resolveReferences }] = await Promise.all([
        import("./parse"),
        import("./import"),
      ]);
      const result = await parseWorkbook(picked);
      setParsed(result);

      const { blockers: refBlockers, normalized: refNormalized } = await resolveReferences(result);
      setNormalized(refNormalized);
      const own = result.issues
        .filter((i) => i.level === "error")
        .map((i) => `${i.sheet}${i.row ? ` fila ${i.row}` : ""}: ${i.message}`);
      setBlockers([...refBlockers, ...own]);
      setPhase("revision");
    } catch (error) {
      setFailure(error);
      setPhase("vacio");
    }
  }

  async function onSave() {
    if (!parsed || !file) return;
    setPhase("guardando");
    try {
      const { importWorkbook } = await import("./import");
      const result = await importWorkbook(parsed, { fileName: file.name, publish });
      setSummary(result);
      setPhase(result.blockers.length > 0 ? "revision" : "hecho");
      if (result.blockers.length > 0) setBlockers(result.blockers);
      // Todo lo que cuelga de campus cambió: el portal público y esta pantalla.
      await queryClient.invalidateQueries({ queryKey: keys.campuses() });
    } catch (error) {
      setFailure(error);
      setPhase("revision");
    }
  }

  const avisos = parsed?.issues.filter((i) => i.level === "aviso") ?? [];

  return (
    <AdminShell
      section="campus"
      kicker="Administración · Sedes"
      title="PDI por campus"
      description="Sube el libro de indicadores de la vigencia. Se revisa antes de guardar y nada se escribe si algo no cuadra."
    >
      {failure != null && <ErrorBlock error={failure} onRetry={reset} />}

      {/* --- Paso 1: el archivo -------------------------------------------- */}
      <section className="import-step card">
        <header>
          <span className="import-step__number">1</span>
          <div>
            <h2>Elige el libro</h2>
            <p>
              El archivo <code>Indicadores_Campus_Pilares_UDES_2025.xlsx</code> o su equivalente de
              otra vigencia. Se leen las hojas 04, 06 y 07.
            </p>
          </div>
        </header>

        <label className="import-drop">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void onPick(picked);
            }}
          />
          <Icon name="download" size={22} />
          <span>{file ? file.name : "Seleccionar archivo .xlsx"}</span>
        </label>

        {phase === "leyendo" && <LoadingBlock rows={2} label="Leyendo el libro" />}
      </section>

      {/* --- Paso 2: la revisión -------------------------------------------- */}
      {parsed && phase !== "leyendo" && (
        <section className="import-step card">
          <header>
            <span className="import-step__number">2</span>
            <div>
              <h2>Revisa lo que se va a guardar</h2>
              <p>Nada se ha escrito todavía.</p>
            </div>
          </header>

          <dl className="import-figures">
            <div>
              <dt>Metas y logros</dt>
              <dd>{parsed.facts.length}</dd>
            </div>
            <div>
              <dt>Indicadores con serie</dt>
              <dd>{parsed.indicators.length}</dd>
            </div>
            <div>
              <dt>Vigencias</dt>
              <dd>{parsed.years.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>Anclajes inferidos</dt>
              <dd>{parsed.facts.filter((f) => f.confidence !== "alta").length}</dd>
            </div>
          </dl>

          {normalized.length > 0 && (
            <div className="import-normalized" role="status">
              <p>
                <Icon name="check" size={16} />
                {normalized.length === 1
                  ? "Un código se emparejó con el plan tras normalizarlo"
                  : `${normalized.length} códigos se emparejaron con el plan tras normalizarlos`}
              </p>
              {/* Se enseña la corrección, no solo que la hubo: si el libro está
                  mirando otra versión de la estructura, aquí se nota. */}
              <ul>
                {normalized.slice(0, 8).map((n) => (
                  <li key={n.from}>
                    <code>{n.from}</code> → <code>{n.to}</code>
                  </li>
                ))}
              </ul>
              {normalized.length > 8 && <p>…y {normalized.length - 8} más.</p>}
            </div>
          )}

          {blockers.length > 0 && (
            <div className="import-blockers" role="alert">
              <strong>
                <Icon name="alert" size={16} /> No se puede guardar todavía
              </strong>
              <ul>
                {blockers.slice(0, 12).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {blockers.length > 12 && <p>…y {blockers.length - 12} más.</p>}
            </div>
          )}

          {avisos.length > 0 && (
            <div className="import-warnings">
              <strong>Avisos</strong>
              <ul>
                {avisos.map((a) => (
                  <li key={`${a.sheet}-${a.row}-${a.message}`}>
                    {a.sheet}: {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Un vistazo a las primeras filas: confirma que las columnas se
              leyeron donde se esperaba, que es el fallo más común. */}
          {parsed.facts.length > 0 && (
            <div className="table-scroll">
              <table className="import-preview">
                <thead>
                  <tr>
                    <th scope="col">Sede</th>
                    <th scope="col">Línea</th>
                    <th scope="col">Acción o meta</th>
                    <th scope="col">Programado</th>
                    <th scope="col">Alcanzado</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.facts.slice(0, 6).map((f) => (
                    <tr key={f.source_code || f.action}>
                      <td>{f.campus_name}</td>
                      <td>{f.line_code}</td>
                      <td>{f.action}</td>
                      <td>{f.target_value ?? "—"}</td>
                      <td>{f.actual_value ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.facts.length > 6 && (
                <p className="import-preview__more">
                  y {parsed.facts.length - 6} filas más.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* --- Paso 3: guardar ------------------------------------------------ */}
      {parsed && blockers.length === 0 && phase !== "hecho" && (
        <section className="import-step card">
          <header>
            <span className="import-step__number">3</span>
            <div>
              <h2>Guardar</h2>
              <p>
                Volver a cargar la misma sede y vigencia reemplaza su lote anterior por completo.
              </p>
            </div>
          </header>

          <label className="import-publish">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            <span>
              <strong>Publicar en el portal al guardar</strong>
              <small>
                Sin marcar, el lote queda en borrador y solo se ve desde la intranet. Conviene
                revisar los anclajes inferidos con cada sede antes de publicar.
              </small>
            </span>
          </label>

          <button
            type="button"
            className="button-primary"
            disabled={phase === "guardando"}
            onClick={() => void onSave()}
          >
            {phase === "guardando" ? "Guardando…" : "Guardar el reporte"}
          </button>
        </section>
      )}

      {phase === "hecho" && summary && (
        <section className="import-step card import-done">
          <h2>
            <Icon name="check" size={20} /> Reporte cargado
          </h2>
          <ul>
            {summary.batches.map((b) => (
              <li key={`${b.campus}-${b.year}`}>
                <strong>
                  {b.campus} · {b.year}
                </strong>
                {b.facts} metas y logros, {b.indicators} indicadores
                {publish ? " · publicado" : " · en borrador"}
              </li>
            ))}
          </ul>
          {summary.normalized.length > 0 && (
            <p className="import-done__note">
              {summary.normalized.length === 1
                ? "1 código se normalizó para emparejarlo con la estructura del plan."
                : `${summary.normalized.length} códigos se normalizaron para emparejarlos con la estructura del plan.`}
            </p>
          )}
          <button type="button" className="button-secondary" onClick={reset}>
            Cargar otro libro
          </button>
        </section>
      )}

      {/* --- Lo ya cargado --------------------------------------------------- */}
      <section className="import-step card">
        <h2>Reportes cargados</h2>
        {batches.isPending ? (
          <LoadingBlock rows={3} label="Cargando los lotes" />
        ) : batches.isError ? (
          <ErrorBlock error={batches.error} onRetry={() => void batches.refetch()} />
        ) : (batches.data?.length ?? 0) === 0 ? (
          <p className="import-empty">Todavía no se ha cargado ningún libro.</p>
        ) : (
          <div className="table-scroll">
            <table className="import-preview">
              <thead>
                <tr>
                  <th scope="col">Vigencia</th>
                  <th scope="col">Archivo</th>
                  <th scope="col">Filas</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Cargado</th>
                </tr>
              </thead>
              <tbody>
                {batches.data!.map((b) => (
                  <tr key={b.id}>
                    <td>{b.year}</td>
                    <td>{b.file_name || "—"}</td>
                    <td>
                      {b.fact_count} + {b.indicator_count}
                    </td>
                    <td>{b.status}</td>
                    <td>{formatDate(b.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
