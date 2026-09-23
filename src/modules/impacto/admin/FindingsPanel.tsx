/* =============================================================================
   Hallazgos del importador · Catálogo.

   Todos los de la versión, filtrables por tipo y por estado. Cada uno se
   marca resuelto (se corrigió en la ficha o en la matriz) o aceptado (se
   sabe y se deja así), con una nota que dice cuál de las dos y por qué.
   ========================================================================== */

import { useMemo, useState } from "react";
import { FINDING_LABEL } from "../import/matrix";
import type { FindingKind } from "../import/matrix";
import type { DbFinding } from "../data/catalog-db";
import { FindingRow } from "./SheetEditor";

const PAGE = 40;

export function FindingsPanel({ findings }: { findings: DbFinding[] }) {
  const [kind, setKind] = useState<string>("todos");
  const [state, setState] = useState<DbFinding["state"] | "todos">("abierto");
  const [shown, setShown] = useState(PAGE);

  const kinds = useMemo(() => {
    const out = new Map<string, number>();
    for (const f of findings) out.set(f.kind, (out.get(f.kind) ?? 0) + 1);
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, [findings]);
  const rows = findings.filter((f) => (kind === "todos" || f.kind === kind) && (state === "todos" || f.state === state));

  if (findings.length === 0) return null;

  return (
    <section className="admin-card ia-findings-panel" aria-labelledby="hallazgos-titulo">
      <div className="admin-card__head">
        <div>
          <h2 id="hallazgos-titulo">Hallazgos del importador</h2>
          <p className="ia-muted">
            {findings.filter((f) => f.state === "abierto").length} abiertos de {findings.length}. Resolver es haberlo
            corregido; aceptar es saberlo y dejarlo así. Los dos piden una nota.
          </p>
        </div>
        <div className="ia-filters ia-filters--compact">
          <label className="admin-field">
            <span>Tipo</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setShown(PAGE);
              }}
            >
              <option value="todos">Todos</option>
              {kinds.map(([k, n]) => (
                <option key={k} value={k}>
                  {FINDING_LABEL[k as FindingKind] ?? k} ({n})
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Estado</span>
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value as typeof state);
                setShown(PAGE);
              }}
            >
              <option value="abierto">Abiertos</option>
              <option value="resuelto">Resueltos</option>
              <option value="aceptado">Aceptados</option>
              <option value="todos">Todos</option>
            </select>
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="ia-empty">No hay hallazgos con esos filtros.</p>
      ) : (
        <ul className="ia-finding-list">
          {rows.slice(0, shown).map((f) => (
            <FindingRow key={f.id} finding={f} editable />
          ))}
        </ul>
      )}
      {rows.length > shown && (
        <button type="button" className="button-ghost" onClick={() => setShown(shown + PAGE)}>
          Ver {Math.min(PAGE, rows.length - shown)} más de {rows.length - shown}
        </button>
      )}
    </section>
  );
}
