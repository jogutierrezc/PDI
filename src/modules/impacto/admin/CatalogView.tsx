/* =============================================================================
   Catálogo · Planeación Institucional (sobre la base).

   De arriba abajo, el trabajo en su orden:
     1. Importar la matriz → borrador.
     2. Elegir la versión: la publicada se consulta; el borrador se edita.
     3. Filtrar la lista y completar la ficha al lado, sin salir de ella.
     4. Resolver o aceptar los hallazgos.
     5. Publicar: se bloquea mientras un indicador en piloto tenga la ficha
        incompleta, y dice cuál.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS, LEVELS, functionById } from "../data/catalog";
import {
  useCatalogFindings,
  useCatalogIndicators,
  useCatalogVersions,
  useDiscardDraft,
  useNewDraft,
  usePublishCatalog,
  useRenumberCodes,
  useSaveSheets,
} from "../data/catalog-db";
import type { CatalogVersion, DbIndicator } from "../data/catalog-db";
import type { FunctionId, Level } from "../data/types";
import { PILOT_SHEETS } from "../data/pilot-sheets";
import { FindingsPanel } from "./FindingsPanel";
import { MatrixImport } from "./MatrixImport";
import { SheetEditor } from "./SheetEditor";

type SheetFilter = "todas" | "piloto" | "completa" | "incompleta";

export function CatalogView() {
  const versions = useCatalogVersions();
  const [versionId, setVersionId] = useState<string | null>(null);
  const current: CatalogVersion | null =
    versions.data?.find((v) => v.id === versionId) ?? versions.data?.find((v) => v.state === "borrador") ?? versions.data?.[0] ?? null;
  const indicators = useCatalogIndicators(current?.id ?? null);
  const findings = useCatalogFindings(current?.id ?? null);
  const editable = current?.state === "borrador";

  const [fn, setFn] = useState<FunctionId | "todas">("todas");
  const [level, setLevel] = useState<Level | "todos">("todos");
  const [status, setStatus] = useState<"todos" | "oficial" | "sugerido">("todos");
  const [sheet, setSheet] = useState<SheetFilter>("todas");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const list = useMemo(() => indicators.data ?? [], [indicators.data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (i) =>
        (fn === "todas" || i.function_id === fn) &&
        (level === "todos" || i.level === level) &&
        (status === "todos" || i.catalog_state === status) &&
        (sheet === "todas" ||
          (sheet === "piloto" && i.in_pilot) ||
          (sheet === "completa" && i.sheet_complete) ||
          (sheet === "incompleta" && !i.sheet_complete)) &&
        (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)),
    );
  }, [list, fn, level, status, sheet, query]);

  const chosen = list.find((i) => i.id === selected) ?? rows[0] ?? null;
  const openFindings = (findings.data ?? []).filter((f) => f.state === "abierto").length;
  const pilot = list.filter((i) => i.in_pilot);
  const blockers = pilot.filter((i) => !i.sheet_complete);

  return (
    <>
      <MatrixImport />

      {versions.error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={15} />
          {versions.error.message}
        </p>
      )}

      {versions.data && versions.data.length === 0 && (
        <section className="admin-card ia-empty-state">
          <h2>Todavía no hay catálogo</h2>
          <p>Importe la matriz arriba: se creará la versión 1 en borrador para completar sus fichas.</p>
        </section>
      )}

      {current && (
        <>
          <VersionBar versions={versions.data ?? []} current={current} onSelect={setVersionId} list={list} />

          <section className="admin-card ia-summary">
            <div className="ia-summary__source">
              <h2>
                Versión {current.number} · {current.state === "borrador" ? "borrador" : "publicada"}
              </h2>
              <p>
                {current.source_file ? <code>{current.source_file}</code> : "Sin archivo de origen"}
                {current.published_at && ` · publicada el ${new Date(current.published_at).toLocaleDateString("es-CO")}`}
                {current.notes && ` · ${current.notes}`}
              </p>
              <dl className="ia-counts">
                <div>
                  <dt>Indicadores</dt>
                  <dd>{list.length}</dd>
                </div>
                {FUNCTIONS.map((f) => (
                  <div key={f.id} style={{ "--tone": f.tone } as CSSProperties}>
                    <dt>{f.name}</dt>
                    <dd>{list.filter((i) => i.function_id === f.id).length}</dd>
                  </div>
                ))}
                <div>
                  <dt>Oficiales · sugeridos</dt>
                  <dd>
                    {list.filter((i) => i.catalog_state === "oficial").length} · {list.filter((i) => i.catalog_state === "sugerido").length}
                  </dd>
                </div>
                <div>
                  <dt>Piloto · fichas completas</dt>
                  <dd>
                    {pilot.length} · {pilot.length - blockers.length}
                  </dd>
                </div>
                <div data-alert={openFindings > 0 || undefined}>
                  <dt>Hallazgos abiertos</dt>
                  <dd>{openFindings}</dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="ia-filters" role="search">
            <label className="admin-field">
              <span>Buscar</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código o nombre" />
            </label>
            <label className="admin-field">
              <span>Función</span>
              <select value={fn} onChange={(e) => setFn(e.target.value as FunctionId | "todas")}>
                <option value="todas">Todas</option>
                {FUNCTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Nivel</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as Level | "todos")}>
                <option value="todos">Todos</option>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="todos">Todos</option>
                <option value="oficial">Oficial</option>
                <option value="sugerido">Sugerido</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Ficha</span>
              <select value={sheet} onChange={(e) => setSheet(e.target.value as SheetFilter)}>
                <option value="todas">Todas</option>
                <option value="piloto">En piloto</option>
                <option value="completa">Completa</option>
                <option value="incompleta">Incompleta</option>
              </select>
            </label>
          </div>

          <div className="ia-split">
            <section className="admin-card ia-list" aria-label="Indicadores">
              <p className="ia-list__count">{indicators.isPending ? "Cargando…" : `${rows.length} de ${list.length}`}</p>
              <ul>
                {rows.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      aria-pressed={chosen?.id === i.id}
                      style={{ "--tone": functionById[i.function_id].tone } as CSSProperties}
                      onClick={() => setSelected(i.id)}
                    >
                      <span className="ia-code">{i.code}</span>
                      <span className="ia-list__name">{i.name}</span>
                      <span className="ia-list__meta">
                        {LEVELS.find((l) => l.id === i.level)?.name}
                        {i.catalog_state === "sugerido" && <em className="ia-pill ia-pill--pending">Sugerido</em>}
                        {i.in_pilot && <em className="ia-pill ia-pill--active">Piloto</em>}
                        <em className={`ia-pill ${i.sheet_complete ? "ia-pill--done" : ""}`}>
                          {i.sheet_complete ? "Ficha completa" : "Ficha incompleta"}
                        </em>
                        {Number(i.open_findings) > 0 && (
                          <em className="ia-pill ia-pill--risk">
                            {i.open_findings} {Number(i.open_findings) === 1 ? "hallazgo" : "hallazgos"}
                          </em>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!indicators.isPending && rows.length === 0 && <p className="ia-empty">Ningún indicador cumple esos filtros.</p>}
            </section>

            {chosen && (
              <SheetEditor key={`${chosen.id}-${chosen.version_state}`} indicator={chosen} editable={editable} findings={findings.data ?? []} />
            )}
          </div>

          <FindingsPanel findings={findings.data ?? []} />

          <PublishBar version={current} pilot={pilot} blockers={blockers} onPick={setSelected} />
        </>
      )}
    </>
  );
}

/* --- La versión y lo que se hace con ella ------------------------------------------ */

function VersionBar({
  versions,
  current,
  onSelect,
  list,
}: {
  versions: CatalogVersion[];
  current: CatalogVersion;
  onSelect: (id: string) => void;
  list: DbIndicator[];
}) {
  const newDraft = useNewDraft();
  const discard = useDiscardDraft();
  const renumber = useRenumberCodes();
  const saveSheets = useSaveSheets();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const hasDraft = versions.some((v) => v.state === "borrador");

  const run = async (work: () => Promise<string>) => {
    setMessage(null);
    try {
      setMessage({ ok: true, text: await work() });
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "No se pudo completar." });
    }
  };

  /** Las 13 fichas propuestas, sobre los indicadores del borrador con ese nombre. */
  const preload = () =>
    run(async () => {
      const byName = new Map(list.map((i) => [i.name, i]));
      const items = PILOT_SHEETS.flatMap(({ name, columns }) => {
        const indicator = byName.get(name);
        return indicator ? [{ id: indicator.id, patch: columns }] : [];
      });
      const missing = PILOT_SHEETS.filter(({ name }) => !byName.has(name)).map((p) => p.name);
      const n = await saveSheets.mutateAsync(items);
      return `Se precargaron ${n} fichas del piloto para revisar.${missing.length ? ` No se encontraron: ${missing.join("; ")}.` : ""}`;
    });

  return (
    <section className="admin-card ia-versions" aria-label="Versiones del catálogo">
      <div className="ia-versions__list" role="group" aria-label="Versión">
        {versions.map((v) => (
          <button key={v.id} type="button" aria-pressed={v.id === current.id} onClick={() => onSelect(v.id)}>
            Versión {v.number}
            <em className={`ia-pill ${v.state === "publicada" ? "ia-pill--done" : "ia-pill--pending"}`}>
              {v.state === "publicada" ? "Publicada" : "Borrador"}
            </em>
          </button>
        ))}
      </div>

      <div className="ia-actions">
        {!hasDraft && (
          <button
            type="button"
            className="button-secondary"
            disabled={newDraft.isPending}
            onClick={() =>
              void run(async () => {
                const id = await newDraft.mutateAsync();
                onSelect(id);
                return "Se abrió la versión siguiente como copia de la publicada. Los cambios van ahí.";
              })
            }
          >
            Abrir la versión siguiente para editar
          </button>
        )}
        {current.state === "borrador" && (
          <>
            <button type="button" className="button-ghost" disabled={saveSheets.isPending} onClick={() => void preload()}>
              Precargar las fichas propuestas del piloto
            </button>
            <button
              type="button"
              className="button-ghost"
              disabled={renumber.isPending}
              onClick={() => void run(async () => `Se renumeraron ${await renumber.mutateAsync(current.id)} indicadores en el orden de la matriz.`)}
            >
              Renumerar códigos
            </button>
            {confirmDiscard ? (
              <span className="ia-publish__confirm">
                ¿Descartar el borrador con todas sus fichas?
                <button
                  type="button"
                  className="button-primary"
                  onClick={() =>
                    void run(async () => {
                      await discard.mutateAsync();
                      setConfirmDiscard(false);
                      return "Borrador descartado.";
                    })
                  }
                >
                  Sí, descartar
                </button>
                <button type="button" className="button-ghost" onClick={() => setConfirmDiscard(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className="button-ghost" onClick={() => setConfirmDiscard(true)}>
                Descartar borrador
              </button>
            )}
          </>
        )}
      </div>

      {message && (
        <p className={message.ok ? "admin-notice" : "ia-error"} role={message.ok ? "status" : "alert"}>
          <Icon name={message.ok ? "check" : "alert"} size={15} />
          {message.text}
        </p>
      )}
    </section>
  );
}

/* --- Publicar ------------------------------------------------------------------------ */

function PublishBar({
  version,
  pilot,
  blockers,
  onPick,
}: {
  version: CatalogVersion;
  pilot: DbIndicator[];
  blockers: DbIndicator[];
  onPick: (id: string) => void;
}) {
  const publish = usePublishCatalog();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (version.state === "publicada") {
    return (
      <section className="admin-card ia-publish">
        <div>
          <h2>Versión {version.number} publicada</h2>
          <p>No se edita. Cualquier cambio abre la versión siguiente, y esta sigue siendo la que usan los periodos abiertos con ella.</p>
          {done && (
            <p className="admin-notice" role="status">
              <Icon name="check" size={15} /> {done}
            </p>
          )}
        </div>
      </section>
    );
  }

  async function go() {
    setError("");
    try {
      const r = await publish.mutateAsync(version.id);
      setDone(`Versión ${r.number} publicada con ${r.indicators} indicadores, ${r.pilot} en piloto.`);
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo publicar.");
    }
  }

  return (
    <section className="admin-card ia-publish">
      <div>
        <h2>Publicar la versión {version.number}</h2>
        <p>
          {pilot.length} indicadores en piloto, {pilot.length - blockers.length} con la ficha completa. Publicada, la versión no
          se edita y con ella se abren los periodos.
        </p>
        {pilot.length === 0 && <p className="ia-warning">Marque en piloto los indicadores que se reportarán.</p>}
        {blockers.length > 0 && (
          <p className="ia-warning">
            <Icon name="lock" size={14} />
            <span>
              Falta completar la ficha de{" "}
              {blockers.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ", "}
                  <button type="button" className="ia-link" onClick={() => onPick(b.id)}>
                    {b.code}
                  </button>
                </span>
              ))}
              .
            </span>
          </p>
        )}
        {error && <p className="ia-error">{error}</p>}
      </div>
      {confirming ? (
        <div className="ia-publish__confirm">
          <span>¿Publicar la versión {version.number}? Ya no podrá editarse.</span>
          <button type="button" className="button-primary" disabled={publish.isPending} onClick={() => void go()}>
            {publish.isPending ? "Publicando…" : "Sí, publicar"}
          </button>
          <button type="button" className="button-ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="button-primary" disabled={blockers.length > 0 || pilot.length === 0} onClick={() => setConfirming(true)}>
          <Icon name="upload" size={15} />
          Publicar versión {version.number}
        </button>
      )}
    </section>
  );
}
