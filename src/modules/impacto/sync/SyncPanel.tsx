/* =============================================================================
   Impacto · Sincronización con la hoja anterior (solo administración).

   Tres tiempos: probar la conexión con el Apps Script, revisar qué trae (qué
   entra, qué cambia, qué es igual y qué hay que decidir) y aplicar todo
   junto. De la hoja a la intranet, en un solo sentido: lo que se edita aquí
   no vuelve a la hoja.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { StageEmpty } from "../../admin/udes-en-cifras/ui";
import {
  loadSyncSnapshot,
  useApplySync,
  useSaveSyncUrl,
  useSyncState,
  type Catalog,
  type ImpactBase,
  type SyncRun,
} from "../store";
import {
  buildPlan,
  changeCount,
  emptyResolutions,
  readPayload,
  TAKE,
  toBatch,
  type LegacyPayload,
  type Resolutions,
  type SyncContext,
} from "./legacy";
import { errorText } from "../model";
import "./sync.css";

type Connection =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; rows: Record<string, number> }
  | { state: "error"; message: string };

const DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

async function fetchSheet(url: string): Promise<LegacyPayload> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch {
    throw new Error("La hoja no respondió. Revise su conexión, o que la implementación de Apps Script siga activa.");
  }
  const raw = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(
      raw.includes("<html") || raw.includes("<!DOCTYPE")
        ? "Google devolvió una página en vez de datos. En Apps Script, abra Implementar → Gestionar implementaciones y confirme que el acceso es «Cualquier persona» y que la URL es la de la implementación activa."
        : "La hoja respondió algo que no es JSON.",
    );
  }
  return readPayload(body);
}

export function SyncPanel({ base, catalog }: { base: ImpactBase; catalog: Catalog }) {
  const state = useSyncState(true);
  const saveUrl = useSaveSyncUrl();
  const apply = useApplySync();

  const [url, setUrl] = useState("");
  const [connection, setConnection] = useState<Connection>({ state: "idle" });
  const [review, setReview] = useState<{ payload: LegacyPayload; ctx: SyncContext } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Resolutions>(emptyResolutions());
  const [applied, setApplied] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (state.data) setUrl(state.data.sourceUrl);
  }, [state.data]);

  const plan = useMemo(() => (review ? buildPlan(review.payload, review.ctx, resolutions) : null), [review, resolutions]);
  const lastRun = state.data?.runs[0] ?? null;
  const dirtyUrl = state.data ? url.trim() !== state.data.sourceUrl : false;

  if (state.isPending) return <p className="admin-loading">Cargando la sincronización…</p>;
  if (state.data?.missing) {
    return (
      <StageEmpty title="Falta la migración de la sincronización">
        Aplica en Supabase la migración 0083_impacto_sincronizacion_y_pilo.sql. Crea la dirección de la hoja, el mapa de
        programas y el historial.
      </StageEmpty>
    );
  }

  const test = async () => {
    setConnection({ state: "testing" });
    try {
      const payload = await fetchSheet(url.trim());
      setConnection({
        state: "ok",
        rows: {
          Datos: payload.data.length,
          Indicadores_Programa: payload.data_programa.length,
          Resultados_Programa: payload.data_resultados.length,
          Programas: payload.programas.length,
        },
      });
    } catch (error) {
      setConnection({ state: "error", message: (error as Error).message });
    }
  };

  const startReview = async () => {
    setReviewing(true);
    setReviewError(null);
    setApplied(null);
    try {
      const [payload, snapshot] = await Promise.all([fetchSheet(url.trim()), loadSyncSnapshot()]);
      setConnection({
        state: "ok",
        rows: {
          Datos: payload.data.length,
          Indicadores_Programa: payload.data_programa.length,
          Resultados_Programa: payload.data_resultados.length,
          Programas: payload.programas.length,
        },
      });
      const ctx: SyncContext = {
        indicators: catalog.indicators.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          status: i.status,
          baselineText: i.baselineText,
          target2026: i.target2026,
          target2028: i.target2028,
          updatedAt: i.updatedAt,
        })),
        programIndicators: catalog.programIndicators
          .filter((i) => i.legacyId)
          .map((i) => ({
            id: i.id,
            legacyId: i.legacyId!,
            name: i.name,
            baselineText: i.baselineText,
            target2026: i.target2026,
            target2028: i.target2028,
            updatedAt: i.updatedAt,
          })),
        programs: base.units.filter((u) => u.kind === "programa").map((u) => ({ id: u.id, name: u.name })),
        campuses: base.campuses,
        offer: base.offer,
        adoptions: snapshot.adoptions,
        values: snapshot.values,
        legacyMap: state.data?.legacyMap ?? [],
        lastRunAt: lastRun?.createdAt ?? null,
      };
      setResolutions(emptyResolutions());
      setReview({ payload, ctx });
    } catch (error) {
      setReviewError((error as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const decide = (group: keyof Resolutions, key: string, value: string) =>
    setResolutions((r) => ({ ...r, [group]: { ...r[group], [key]: value } }));

  const takeAll = () => {
    if (!plan) return;
    const next = { ...resolutions, conflicts: { ...resolutions.conflicts } };
    for (const issue of plan.issues) if (issue.kind === "conflicto") next.conflicts[issue.key] = TAKE;
    setResolutions(next);
  };

  const run = async () => {
    if (!plan) return;
    try {
      const result = await apply.mutateAsync(toBatch(plan, url.trim()));
      setApplied(result);
      setReview(null);
    } catch {
      // El error se muestra en la barra (apply.error).
    }
  };

  const total = plan ? changeCount(plan) : 0;
  const conflicts = plan?.issues.filter((i) => i.kind === "conflicto") ?? [];

  return (
    <div className="imp-sync">
      <section className="imp-sync__source">
        <span className="imp-sync__sheet" aria-hidden="true">
          <Icon name="table" size={24} />
        </span>
        <div className="imp-sync__source-body">
          <div className="imp-sync__source-title">
            <strong>SeguimientoImpacto_UDES</strong>
            <ConnectionChip connection={connection} />
          </div>
          <label className="imp-sync__url">
            <span className="sr-only">Dirección de la implementación de Apps Script</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="https://script.google.com/macros/s/…/exec" />
            {dirtyUrl && (
              <button type="button" className="button-ghost" disabled={saveUrl.isPending} onClick={() => saveUrl.mutate(url)}>
                {saveUrl.isPending ? "Guardando…" : "Guardar dirección"}
              </button>
            )}
          </label>
          {saveUrl.error && <span className="imp-sync__error">{saveUrl.error.message}</span>}
          <span className="imp-sync__meta">
            {lastRun ? `Última sincronización: ${DATE.format(new Date(lastRun.createdAt))}` : "Todavía no se ha sincronizado."}
          </span>
          {connection.state === "error" && (
            <p className="imp-sync__error" role="alert">
              <Icon name="alert" size={15} /> {connection.message}
            </p>
          )}
        </div>
        <div className="imp-sync__source-actions">
          <button type="button" className="button-secondary" disabled={!url.trim() || connection.state === "testing"} onClick={test}>
            {connection.state === "testing" ? "Probando…" : "Probar conexión"}
          </button>
          <button type="button" className="button-primary" disabled={!url.trim() || reviewing} onClick={startReview}>
            {reviewing ? "Leyendo la hoja…" : review ? "Volver a revisar" : "Revisar cambios"}
          </button>
        </div>
      </section>

      {reviewError && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {reviewError}
        </p>
      )}

      {applied && (
        <p className="imp-sync__applied" role="status">
          <Icon name="check" size={16} /> Sincronización aplicada: {applied.fichas ?? 0} fichas, {applied.adopciones ?? 0} adopciones,{" "}
          {applied.propios ?? 0} indicadores propios de programas y {applied.cifras ?? 0} cifras.
        </p>
      )}

      {plan && (
        <section className="imp-sync__block">
          <header className="imp-sync__block-head">
            <h2>Qué trae la hoja</h2>
            <span>Revisión sin aplicar. Nada cambia hasta que pulse «Aplicar».</span>
          </header>
          <div className="imp-table-wrap">
            <table className="imp-table imp-sync__table">
              <thead>
                <tr>
                  <th scope="col">Hoja</th>
                  <th scope="col">Pasa a la intranet como</th>
                  <th scope="col" className="imp-num">Filas</th>
                  <th scope="col" className="imp-num">Nuevas</th>
                  <th scope="col" className="imp-num">Cambian</th>
                  <th scope="col" className="imp-num">Iguales</th>
                  <th scope="col" className="imp-num">Por revisar</th>
                  <th scope="col" className="imp-num">Omitidas</th>
                </tr>
              </thead>
              <tbody>
                {plan.sheets.map((s) => (
                  <tr key={s.sheet}>
                    <th scope="row">
                      <code>{s.sheet}</code>
                    </th>
                    <td>{s.target}</td>
                    <td className="imp-num">{s.rows}</td>
                    <td className="imp-num">{s.nuevas || "—"}</td>
                    <td className="imp-num">{s.cambian || "—"}</td>
                    <td className="imp-num">{s.iguales || "—"}</td>
                    <td className="imp-num" data-tone={s.revisar ? "wait" : undefined}>{s.revisar || "—"}</td>
                    <td className="imp-num">{s.omitidas || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="imp-sync__grid">
        {plan ? (
          <section className="imp-sync__block imp-sync__issues">
            <header className="imp-sync__block-head">
              <h2>Por revisar</h2>
              <span>
                {plan.issues.length
                  ? `${plan.issues.length} ${plan.issues.length === 1 ? "fila que" : "filas que"} la intranet no resuelve sola`
                  : "Nada: la intranet reconoció todo."}
              </span>
              {conflicts.length > 1 && (
                <button type="button" className="button-ghost" onClick={takeAll}>
                  Usar la hoja en los {conflicts.length} conflictos
                </button>
              )}
            </header>
            {plan.issues.length > 0 && (
              <ul>
                {plan.issues.map((issue) => (
                  <li key={`${issue.resolutionGroup}:${issue.key}`}>
                    <span className="imp-sync__issue-mark" aria-hidden="true">?</span>
                    <span className="imp-sync__issue-text">
                      <strong>{issue.title}</strong>
                      <span>{issue.detail}</span>
                    </span>
                    <select
                      aria-label={`Decisión para ${issue.title}`}
                      value={issue.value}
                      onChange={(e) => decide(issue.resolutionGroup, issue.key, e.target.value)}
                    >
                      {issue.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            {plan.omissions.length > 0 && (
              <details className="imp-sync__omitted">
                <summary>{plan.omissions.length} filas se omiten y por qué</summary>
                <ul>
                  {plan.omissions.map((o, index) => (
                    <li key={`${o.sheet}:${o.row}:${index}`}>
                      <code>{o.row}</code> <span className="imp-muted">({o.sheet})</span> {o.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        ) : (
          <section className="imp-sync__block imp-sync__issues">
            <header className="imp-sync__block-head">
              <h2>Cómo empezar</h2>
            </header>
            <p className="imp-sync__lead">
              Pulse «Revisar cambios»: la intranet lee la hoja, la compara con lo que ya tiene y le muestra qué entra antes de
              tocar nada. Los programas que no reconozca por nombre y sede se los pregunta una vez y los recuerda.
            </p>
          </section>
        )}

        <aside className="imp-sync__side">
          <section className="imp-sync__block">
            <header className="imp-sync__block-head">
              <h2>Cómo funciona</h2>
            </header>
            <ul className="imp-sync__rules">
              <li>
                <strong>De la hoja a la intranet, en un solo sentido.</strong> Lo que se edite aquí no vuelve a la hoja.
              </li>
              <li>
                <strong>Nada se aplica sin revisar.</strong> Primero ve qué cambia; luego aplica todo junto, o nada.
              </li>
              <li>
                <strong>Lo editado en la intranet gana.</strong> Si un dato cambió en los dos lados, se lo preguntamos.
              </li>
            </ul>
            <p className="imp-sync__secret">
              <Icon name="lock" size={16} />
              <span>
                Las contraseñas de la hoja «Programas» nunca se copian. Recomendado: quitar esa columna de la respuesta del
                Apps Script, porque hoy la ve cualquiera con el enlace.
              </span>
            </p>
          </section>
          <History runs={state.data?.runs ?? []} />
        </aside>
      </div>

      {plan && (
        <div className="imp-sync__bar">
          <span>
            <strong>{total} cambios listos</strong>
            {plan.issues.length ? ` · ${plan.issues.length} decisiones arriba. Lo que quede en «Omitir» no entra.` : ""}
          </span>
          {apply.error && (
            <span className="imp-sync__error" role="alert">
              <Icon name="alert" size={15} /> {errorText(apply.error)}
            </span>
          )}
          <button type="button" className="button-secondary" onClick={() => setReview(null)} disabled={apply.isPending}>
            Descartar revisión
          </button>
          <button type="button" className="button-primary" onClick={run} disabled={apply.isPending || (total === 0 && plan.programs.length === 0)}>
            {apply.isPending ? "Aplicando…" : `Aplicar ${total} cambios`}
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectionChip({ connection }: { connection: Connection }) {
  if (connection.state === "ok") {
    return (
      <span className="imp-sync__chip" data-tone="ok">
        <Icon name="check" size={13} /> Conectada · {connection.rows.Datos} fichas, {connection.rows.Indicadores_Programa} de programas
      </span>
    );
  }
  if (connection.state === "error") {
    return (
      <span className="imp-sync__chip" data-tone="risk">
        <Icon name="alert" size={13} /> Sin conexión
      </span>
    );
  }
  if (connection.state === "testing") return <span className="imp-sync__chip">Probando…</span>;
  return <span className="imp-sync__chip">Sin probar</span>;
}

function History({ runs }: { runs: SyncRun[] }) {
  return (
    <section className="imp-sync__block">
      <header className="imp-sync__block-head">
        <h2>Historial</h2>
      </header>
      {runs.length === 0 ? (
        <p className="imp-sync__lead">Aún no hay sincronizaciones aplicadas.</p>
      ) : (
        <ul className="imp-sync__history">
          {runs.map((r) => {
            const s = r.summary as Record<string, number>;
            return (
              <li key={r.id}>
                <strong>{DATE.format(new Date(r.createdAt))}</strong>
                <span className="imp-sync__chip" data-tone="ok">
                  <Icon name="check" size={13} /> {(s.fichas ?? 0) + (s.adopciones ?? 0) + (s.propios ?? 0) + (s.cifras ?? 0)} cambios
                </span>
                <span className="imp-muted">
                  {s.fichas ?? 0} fichas · {s.adopciones ?? 0} adopciones · {s.propios ?? 0} propios · {s.cifras ?? 0} cifras
                  {s.omitidas ? ` · ${s.omitidas} omitidas` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

