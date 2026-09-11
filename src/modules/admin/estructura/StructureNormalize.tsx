/* =============================================================================
   Normalizar la estructura del plan

   Existe porque la migración 0017 trajo las 21 áreas y las 62 líneas reales del
   plan y las **añadió** junto a las 13 de ejemplo del seed: su upsert solo
   fusiona cuando el nombre coincide carácter por carácter, y casi nunca
   coincidía. Quedaron dos estructuras vivas en el mismo pilar.

   Mirando los nombres de verdad, resulta que casi nada es un duplicado. De las
   13 del seed, solo dos tienen equivalente real —"Sostenibilidad financiera" y
   "Flexibilidad curricular"—; las otras once son ejemplos que nunca estuvieron
   en el plan. Por eso la pantalla hace dos cosas distintas y no una:

     · **Fusionar** las que sí son la misma cosa escrita de dos formas.
     · **Retirar** las que son resto de ejemplo y no sostienen nada.

   Y las dos están construidas sobre la misma idea: **esto no se deshace**, así
   que la base propone y una persona confirma.

     · Las parejas **exactas** —mismo nombre una vez normalizado— son el caso
       seguro, y el botón de arriba las hace todas de una vez.
     · Las **inferidas** por parecido van aparte y solo se fusionan de una en
       una. "Flexibilidad curricular" y "Flexibilidad administrativa" se
       parecen y no son lo mismo; meterlas en el botón sería regalar un
       desastre silencioso.
     · Lo que **no empareja con nada** se lista al final y no se toca. Un área
       del seed sin equivalente real puede estar sosteniendo un proyecto de
       verdad, y adivinar a dónde pertenece es justo lo que no debe hacer una
       máquina.

   Cada fila dice cuántas filas movería antes de tocarla. Es la información que
   convierte "confío" en "entiendo".
   ========================================================================== */

import { useMemo, useState } from "react";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../../components/ui/QueryState";
import { useStructureAudit, usePillars } from "../../../data/queries";
import {
  useDropEmptyStructure,
  useDropStructureOrphan,
  useMergeStructure,
  useNormalizeStructure,
} from "../../../data/mutations";
import { accentFor } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import type { NormalizeResult, StructureDuplicate, StructureOrphan } from "../../../types/database";
import "./structure.css";

const kindLabel = { area: "Área estratégica", line: "Línea de acción" } as const;

export function StructureNormalize() {
  const audit = useStructureAudit();
  const pillars = usePillars();
  const { hasRole } = useAuth();
  const canEdit = hasRole("planeacion");

  const [report, setReport] = useState<NormalizeResult[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);

  const normalize = useNormalizeStructure();
  const merge = useMergeStructure();
  const dropEmpty = useDropEmptyStructure();
  const dropOne = useDropStructureOrphan();

  const pillarById = useMemo(
    () => new Map((pillars.data ?? []).map((p) => [p.id, p])),
    [pillars.data],
  );

  const exact = useMemo(
    () => (audit.data?.duplicates ?? []).filter((d) => d.is_exact),
    [audit.data],
  );
  const inferred = useMemo(
    () => (audit.data?.duplicates ?? []).filter((d) => !d.is_exact),
    [audit.data],
  );
  const orphans = audit.data?.orphans ?? [];

  const totalMoves = exact.reduce((sum, d) => sum + d.moves, 0);

  async function runAll() {
    setError("");
    setReport(null);
    try {
      setReport(await normalize.mutateAsync(true));
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo normalizar la estructura.");
    }
  }

  async function runOne(pair: StructureDuplicate) {
    setError("");
    try {
      await merge.mutateAsync({ kind: pair.kind, keepId: pair.keep_id, dropId: pair.drop_id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo fusionar la pareja.");
    }
  }

  /** Las de ejemplo que no sostienen nada: se pueden retirar sin más. */
  const empty = useMemo(() => orphans.filter((o) => o.dependents === 0), [orphans]);

  async function removeEmpty() {
    setError("");
    try {
      const gone = await dropEmpty.mutateAsync();
      setNotice(
        gone.length === 0
          ? "No había nada vacío que retirar."
          : `Se retiraron ${gone.length} ${gone.length === 1 ? "entrada" : "entradas"} de la estructura de ejemplo.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo retirar la estructura vacía.");
    }
  }

  async function removeOne(orphan: StructureOrphan) {
    setError("");
    try {
      await dropOne.mutateAsync({ kind: orphan.kind, id: orphan.id });
    } catch (cause) {
      // El mensaje de la base dice cuántas filas lo impiden: se muestra tal cual.
      setError(cause instanceof Error ? cause.message : "No se pudo retirar.");
    }
  }

  const busy = normalize.isPending || merge.isPending || dropEmpty.isPending || dropOne.isPending;
  const loading = audit.isPending || pillars.isPending;

  return (
    <AdminShell
      section="structure"
      kicker="Salud del esquema"
      title="Normalizar la estructura"
      description="Las áreas y las líneas duplicadas se fusionan con las que ya existen en vez de convivir con ellas. La base propone; aquí se confirma."
    >
      {!canEdit && <ReadOnlyNotice />}

      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} />
          {notice}
        </p>
      )}

      {audit.error && <ErrorBlock error={audit.error} onRetry={() => void audit.refetch()} />}
      {loading && !audit.error && <CardSkeleton count={2} />}

      {!loading && !audit.error && (
        <>
          {/* --- Estado y el botón ------------------------------------------- */}
          <section className="admin-card">
            <div className="admin-card__head">
              <div className="structure-head">
                <h2>Qué hay que resolver</h2>
                <p>
                  Fusionar mueve lo que cuelga de la duplicada a la que se queda y borra la
                  duplicada. Se conserva siempre la que tiene código de la estructura real
                  (6.1.1, 6.1.1.a), porque es la que referencian las cargas de campus y el
                  anclaje de las facultades.
                </p>
              </div>
            </div>

            <dl className="inbox">
              <div>
                <dt>Parejas exactas</dt>
                <dd className={exact.length > 0 ? "is-pending" : "is-done"}>{exact.length}</dd>
                <small>
                  {exact.length === 0
                    ? "Nada duplicado con el mismo nombre"
                    : `Moverían ${totalMoves} ${totalMoves === 1 ? "fila" : "filas"}`}
                </small>
              </div>
              <div>
                <dt>Parejas por parecido</dt>
                <dd className={inferred.length > 0 ? "is-risk" : undefined}>{inferred.length}</dd>
                <small>Hay que revisarlas una a una</small>
              </div>
              <div>
                <dt>Sin pareja</dt>
                <dd>{orphans.length}</dd>
                <small>Sin código real y sin equivalente</small>
              </div>
            </dl>

            {canEdit && exact.length > 0 && (
              <div className="structure-action">
                {confirming ? (
                  <>
                    {/* Se pregunta una vez y con las cifras delante: es la
                        última pantalla antes de una operación sin vuelta atrás. */}
                    <p>
                      Se van a fusionar <strong>{exact.length}</strong>{" "}
                      {exact.length === 1 ? "pareja" : "parejas"} y a mover{" "}
                      <strong>{totalMoves}</strong> {totalMoves === 1 ? "fila" : "filas"}. Las
                      duplicadas se borran y esto no se puede deshacer.
                    </p>
                    <div className="structure-action__buttons">
                      <button
                        className="button-primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void runAll()}
                      >
                        {normalize.isPending ? "Normalizando…" : "Sí, normalizar"}
                      </button>
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() => setConfirming(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    <Icon name="check" size={15} />
                    Normalizar las {exact.length} parejas exactas
                  </button>
                )}
              </div>
            )}

            {report && (
              <div className="structure-report" role="status">
                <p>
                  <Icon name="check" size={15} />
                  {report.length === 0
                    ? "No había nada que fusionar."
                    : `${report.length} ${report.length === 1 ? "fusión aplicada" : "fusiones aplicadas"}.`}
                </p>
                {report.length > 0 && (
                  <ul>
                    {report.slice(0, 12).map((row, index) => (
                      <li key={`${row.drop_code}-${index}`}>
                        {kindLabel[row.kind]}: <code>{row.drop_code ?? "sin código"}</code> →{" "}
                        <code>{row.keep_code ?? "sin código"}</code>
                        {row.moved > 0 && ` · ${row.moved} ${row.moved === 1 ? "fila" : "filas"}`}
                      </li>
                    ))}
                  </ul>
                )}
                {report.length > 12 && <p>…y {report.length - 12} más.</p>}
              </div>
            )}
          </section>

          {/* --- Las parejas -------------------------------------------------- */}
          {exact.length + inferred.length === 0 ? (
            <EmptyBlock
              title="La estructura no tiene duplicados"
              hint="Cada área y cada línea existe una sola vez dentro de su pilar."
            />
          ) : (
            <>
              {exact.length > 0 && (
                <PairSection
                  title="Mismo nombre"
                  hint="El nombre coincide una vez quitados los acentos, la puntuación y el ordinal. Es el caso seguro."
                  pairs={exact}
                  pillarById={pillarById}
                  canEdit={canEdit}
                  busy={busy}
                  onMerge={runOne}
                />
              )}

              {inferred.length > 0 && (
                <PairSection
                  title="Emparejadas por parecido"
                  hint="Un nombre contiene al otro. Puede ser lo mismo escrito de dos formas o dos cosas distintas: revísalas una a una antes de fusionar."
                  pairs={inferred}
                  pillarById={pillarById}
                  canEdit={canEdit}
                  busy={busy}
                  onMerge={runOne}
                  warn
                />
              )}
            </>
          )}

          {/* --- Lo que queda suelto ------------------------------------------ */}
          {orphans.length > 0 && (
            <section className="admin-card">
              <div className="admin-card__head">
                <div className="structure-head">
                  <h2>Sin equivalente en la estructura real</h2>
                  <p>
                    Casi todas son las áreas y líneas de ejemplo con las que nació el portal, y no
                    tienen equivalente en la estructura real: fusionarlas con algo sería inventarse
                    la correspondencia. Las que no sostienen nada se retiran; las que sostienen
                    algo se quedan hasta que muevas lo que cuelga de ellas desde{" "}
                    <strong>Gestión de pilares</strong>.
                  </p>
                </div>

                {canEdit && empty.length > 0 && (
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void removeEmpty()}
                  >
                    {dropEmpty.isPending
                      ? "Retirando…"
                      : `Retirar las ${empty.length} vacías`}
                  </button>
                )}
              </div>

              <ul className="orphan-list">
                {orphans.map((orphan) => (
                  <OrphanRow
                    key={orphan.id}
                    orphan={orphan}
                    pillarById={pillarById}
                    canEdit={canEdit}
                    busy={busy}
                    onRemove={() => void removeOne(orphan)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}

/* --- Una tanda de parejas ---------------------------------------------------- */

interface PillarLike {
  numeral: string;
  name: string;
  accent_slot: number;
}

function PairSection({
  title,
  hint,
  pairs,
  pillarById,
  canEdit,
  busy,
  onMerge,
  warn = false,
}: {
  title: string;
  hint: string;
  pairs: StructureDuplicate[];
  pillarById: Map<string, PillarLike>;
  canEdit: boolean;
  busy: boolean;
  onMerge: (pair: StructureDuplicate) => void;
  warn?: boolean;
}) {
  return (
    <section className={`admin-card${warn ? " structure-card--warn" : ""}`}>
      <div className="admin-card__head">
        <div className="structure-head">
          <h2>
            {title} <span className="structure-count">{pairs.length}</span>
          </h2>
          <p>{hint}</p>
        </div>
      </div>

      <ul className="pair-list">
        {pairs.map((pair) => {
          const pillar = pillarById.get(pair.pillar_id);
          return (
            <li key={`${pair.keep_id}-${pair.drop_id}`} className="pair">
              <div className="pair__kind">
                {pillar && (
                  <span className="pillar-tag">
                    <i style={{ background: accentFor(pillar.accent_slot) }} aria-hidden="true" />
                    {pillar.numeral}
                  </span>
                )}
                <span>{kindLabel[pair.kind]}</span>
              </div>

              {/* La que se va, la que se queda, y la flecha que lo dice. */}
              <div className="pair__rows">
                <div className="pair__row pair__row--drop">
                  <code>{pair.drop_code ?? "sin código"}</code>
                  <span>{pair.drop_name}</span>
                  <small>se fusiona y desaparece</small>
                </div>
                <Icon name="arrow-right" size={16} />
                <div className="pair__row pair__row--keep">
                  <code>{pair.keep_code ?? "sin código"}</code>
                  <span>{pair.keep_name}</span>
                  <small>se conserva</small>
                </div>
              </div>

              <div className="pair__action">
                <small>
                  {pair.moves === 0
                    ? "no mueve nada"
                    : `mueve ${pair.moves} ${pair.moves === 1 ? "fila" : "filas"}`}
                </small>
                {canEdit && (
                  <button
                    className="tray-act tray-act--primary"
                    type="button"
                    disabled={busy}
                    onClick={() => onMerge(pair)}
                  >
                    Fusionar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OrphanRow({
  orphan,
  pillarById,
  canEdit,
  busy,
  onRemove,
}: {
  orphan: StructureOrphan;
  pillarById: Map<string, PillarLike>;
  canEdit: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const pillar = pillarById.get(orphan.pillar_id);

  return (
    <li className="orphan">
      {pillar && (
        <span className="pillar-tag">
          <i style={{ background: accentFor(pillar.accent_slot) }} aria-hidden="true" />
          {pillar.numeral}
        </span>
      )}
      <code>{orphan.code ?? "sin código"}</code>
      <span className="orphan__name">{orphan.name}</span>
      <small>{kindLabel[orphan.kind]}</small>
      <small className={orphan.dependents > 0 ? "orphan__holds" : undefined}>
        {orphan.dependents === 0
          ? "no sostiene nada"
          : `sostiene ${orphan.dependents} ${orphan.dependents === 1 ? "fila" : "filas"}`}
      </small>
      {canEdit && orphan.dependents === 0 && (
        <button className="tray-act" type="button" disabled={busy} onClick={onRemove}>
          Retirar
        </button>
      )}
    </li>
  );
}
