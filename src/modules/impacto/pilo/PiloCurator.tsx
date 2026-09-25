/* =============================================================================
   Mr. Pilo Bot para las vicerrectorías y oficinas.

   No arma una selección: revisa cómo se usa el catálogo de la función y qué
   proponen los programas, y deja cada hallazgo con su acción a un clic.

     Alertas         lo urgente: fichas de condiciones CESU/CNA que casi nadie
                     reporta, fichas sin uso e ideas que varios programas
                     repiten sin ficha.
     Propuestas      lo que crearon los programas: relacionarlo con la ficha
                     a la que se parece o crear una ficha nueva que lo reúna.
     Uso             cada ficha con quién la sigue, quién reporta y cuántos
                     la adaptan; desde aquí se marca como obligatoria.

   Sin IA (ver curate.ts): se compara por palabras y se cuenta.
   ========================================================================== */

import { useId, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { ImpactAccess } from "../access";
import { FUNCTION_LABEL, STAGE_LABEL, nextCode, type SubstantiveFunction } from "../model";
import {
  useAdoptions,
  useCreateDraftFicha,
  useLinkProgramIndicator,
  useSetMandatory,
  useValues,
  type Catalog,
  type ImpactBase,
} from "../store";
import { USAGE_TEXT, analyzeProposals, analyzeUsage } from "./curate";
import { AVATAR_LG, PiloClose, PiloLauncher, PiloScene, PiloSpeech, type PiloOrigin } from "./PiloLauncher";

type Tab = "alertas" | "propuestas" | "uso";

export function PiloCurator({ fn, base, catalog, access }: { fn: SubstantiveFunction; base: ImpactBase; catalog: Catalog; access: ImpactAccess }) {
  return (
    <PiloLauncher
      sub="Revise su catálogo"
      peekTitle={`Mr. Pilo revisa ${FUNCTION_LABEL[fn]}`}
      peekText="Qué fichas no se usan, cuáles casi nadie reporta y qué están proponiendo los programas, con la acción para cada caso."
    >
      {({ origin, onClose }) => <Curator fn={fn} base={base} catalog={catalog} access={access} origin={origin} onClose={onClose} />}
    </PiloLauncher>
  );
}

interface Alert {
  key: string;
  severity: "critica" | "importante" | "oportunidad";
  title: string;
  detail: string;
  tab: Tab;
}

const SEVERITY_LABEL = { critica: "Crítica", importante: "Importante", oportunidad: "Oportunidad" } as const;

function Curator({
  fn,
  base,
  catalog,
  access,
  origin,
  onClose,
}: {
  fn: SubstantiveFunction;
  base: ImpactBase;
  catalog: Catalog;
  access: ImpactAccess;
  origin: PiloOrigin;
  onClose: () => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<Tab>("alertas");
  const [created, setCreated] = useState<string[]>([]);
  const canCurate = access.canCurate(fn);
  const owner = access.ownersFor(fn)[0];

  const fichas = useMemo(() => catalog.indicators.filter((i) => i.fn === fn && i.status !== "retirado"), [catalog.indicators, fn]);
  const proposals = useMemo(
    () => catalog.programIndicators.filter((i) => i.fn === fn && i.status !== "retirado"),
    [catalog.programIndicators, fn],
  );
  const ids = useMemo(() => fichas.map((i) => i.id), [fichas]);
  const adoptions = useAdoptions();
  const values = useValues(ids);
  const link = useLinkProgramIndicator();
  const createDraft = useCreateDraftFicha();
  const setMandatory = useSetMandatory();

  const reported = useMemo(
    () =>
      new Set(
        (values.data ?? [])
          .filter((v) => v.programId && (v.valueNum !== null || v.valueText || v.notApplicable))
          .map((v) => `${v.indicatorId}|${v.programId}|${v.campusId}`),
      ),
    [values.data],
  );
  const analysis = useMemo(() => analyzeProposals(fichas, proposals), [fichas, proposals]);
  const usage = useMemo(() => analyzeUsage(fichas, adoptions.data ?? [], proposals, reported), [fichas, adoptions.data, proposals, reported]);

  const siteName = (programId: string | null, campusId: string | null) =>
    `${base.units.find((u) => u.id === programId)?.name ?? "Programa"} · ${base.campuses.find((c) => c.id === campusId)?.name ?? "Sede"}`;

  // Las alertas: lo que Mr. Pilo pondría primero en la mesa.
  const alerts: Alert[] = [];
  for (const u of usage) {
    const cna = u.ficha.code && fichas.find((f) => f.id === u.ficha.id)?.cesu.length;
    const coverage = u.adopted ? u.reporting / u.adopted : 0;
    if (cna && u.adopted >= 2 && coverage < 0.3) {
      alerts.push({
        key: `cna-${u.ficha.id}`,
        severity: "critica",
        title: `${u.ficha.code} · ${u.ficha.name}`,
        detail: `Condición CNA: la siguen ${u.adopted} programas y solo ${u.reporting} han reportado (${Math.round(coverage * 100)} %).`,
        tab: "uso",
      });
    } else if (u.flags.includes("sin_cifras")) {
      alerts.push({
        key: `cob-${u.ficha.id}`,
        severity: "importante",
        title: `${u.ficha.code} · ${u.ficha.name}`,
        detail: `La siguen ${u.adopted} programas y reportan ${u.reporting}: acompañe la captura.`,
        tab: "uso",
      });
    }
  }
  for (const idea of analysis.ideas) {
    alerts.push({
      key: `idea-${idea.name}`,
      severity: "oportunidad",
      title: `«${idea.name}»`,
      detail: `${idea.sites} programas crearon indicadores parecidos y no hay ficha que los reúna.`,
      tab: "propuestas",
    });
  }
  const unused = usage.filter((u) => u.flags.includes("sin_uso")).length;
  if (unused) {
    alerts.push({
      key: "sin-uso",
      severity: "oportunidad",
      title: `${unused} fichas sin uso`,
      detail: "Ningún programa las sigue ni las adapta: revise si siguen vigentes o si su nombre se entiende.",
      tab: "uso",
    });
  }

  // Lo crítico primero.
  const RANK = { critica: 0, importante: 1, oportunidad: 2 } as const;
  alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);

  const speech =
    tab === "alertas"
      ? alerts.length
        ? `Revisé ${fichas.length} fichas de ${FUNCTION_LABEL[fn]} y ${proposals.length} indicadores que crearon los programas. Encontré ${alerts.length} ${alerts.length === 1 ? "asunto" : "asuntos"} para atender; el primero es el más urgente.`
        : `Revisé ${fichas.length} fichas de ${FUNCTION_LABEL[fn]} y ${proposals.length} indicadores de los programas. No veo nada urgente: el catálogo se usa y se reporta.`
      : tab === "propuestas"
        ? `Los programas crearon ${proposals.length} indicadores en ${FUNCTION_LABEL[fn]}. ${analysis.links.length} se parecen a una ficha que ya existe y ${analysis.ideas.length} ${analysis.ideas.length === 1 ? "idea se repite" : "ideas se repiten"} entre programas.`
        : `Así se usa cada ficha: cuántos programas la siguen, cuántos ya reportaron y cuántos la adaptaron con indicadores propios.`;

  const loading = adoptions.isPending || values.isPending;

  return (
    <PiloScene origin={origin} onClose={onClose} titleId={titleId} focusKey={tab}>
      <aside className="pilo__side">
        <PiloClose onClose={onClose} />
        <div className="pilo__intro">
          <img className="pilo__avatar" src={AVATAR_LG} alt="" width={132} height={132} />
          <h1 id={titleId}>Hola, soy Mr. Pilo</h1>
          <PiloSpeech text={speech} />
        </div>
        <nav className="pilo__steps pilo__tabs" aria-label="Qué revisar">
          {(
            [
              ["alertas", "Alertas", alerts.length],
              ["propuestas", "Propuestas de los programas", analysis.links.length + analysis.ideas.length],
              ["uso", "Uso de las fichas", fichas.length],
            ] as [Tab, string, number][]
          ).map(([key, label, count]) => (
            <button key={key} type="button" data-state={tab === key ? "current" : "todo"} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>
              <span aria-hidden="true">{count}</span>
              {label}
            </button>
          ))}
        </nav>
        <p className="pilo__site">
          {FUNCTION_LABEL[fn]}
          {!canCurate && (
            <>
              <br />
              Puede ver el análisis; las acciones son del editor o el jefe de la vicerrectoría.
            </>
          )}
        </p>
      </aside>

      <section className="pilo__panel">
        {tab === "alertas" && (
          <>
            <header className="pilo__head" data-anim>
              <h2 tabIndex={-1} data-autofocus>
                Lo que necesita atención
              </h2>
              <p>Primero lo crítico: condiciones de calidad CNA que casi nadie reporta.</p>
            </header>
            <div className="pilo__list" data-anim>
              {loading ? (
                <p className="pilo__empty">Revisando…</p>
              ) : alerts.length === 0 ? (
                <p className="pilo__empty">Nada urgente por ahora.</p>
              ) : (
                <ul className="pilo-alerts">
                  {alerts.map((a) => (
                    <li key={a.key} data-severity={a.severity}>
                      <span className="pilo-alerts__sev">{SEVERITY_LABEL[a.severity]}</span>
                      <span className="pilo-alerts__body">
                        <strong>{a.title}</strong>
                        <span>{a.detail}</span>
                      </span>
                      <button type="button" className="button-ghost" onClick={() => setTab(a.tab)}>
                        Ver <Icon name="arrow-right" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "propuestas" && (
          <>
            <header className="pilo__head" data-anim>
              <h2 tabIndex={-1} data-autofocus>
                Lo que proponen los programas
              </h2>
              <p>
                {proposals.length} indicadores propios · {analysis.linked} ya relacionados con una ficha · {analysis.single.length} de un solo
                programa.
              </p>
            </header>
            <div className="pilo__list" data-anim>
              {(link.error || createDraft.error) && (
                <p className="pilo__error" role="alert">
                  <Icon name="alert" size={14} /> {(link.error ?? createDraft.error)?.message}
                </p>
              )}
              {analysis.ideas.length > 0 && (
                <div className="pilo__goal">
                  <h4>Ideas que se repiten: una ficha nueva las reuniría</h4>
                  {analysis.ideas.map((idea) => {
                    const done = created.includes(idea.name);
                    return (
                      <div key={idea.name} className="pilo-idea">
                        <span className="pilo-pick__body">
                          <strong>{idea.name}</strong>
                          <span>
                            {idea.sites} programas · {idea.items.map((i) => siteName(i.programId, i.campusId)).join(", ")}
                          </span>
                        </span>
                        {canCurate && owner && (
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={done || createDraft.isPending}
                            onClick={() =>
                              createDraft.mutate(
                                {
                                  fn,
                                  ownerUnitId: owner.id,
                                  code: nextCode(fn, catalog.indicators),
                                  name: idea.name,
                                  description: idea.items.find((i) => i.description)?.description ?? "",
                                  stage: idea.items[0].stage,
                                  link: idea.items.map((i) => i.id),
                                },
                                { onSuccess: () => setCreated((list) => [...list, idea.name]) },
                              )
                            }
                          >
                            {done ? (
                              <>
                                <Icon name="check" size={14} /> Borrador creado
                              </>
                            ) : (
                              "Crear ficha en borrador"
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {analysis.links.length > 0 && (
                <div className="pilo__goal">
                  <h4>Se parecen a una ficha que ya existe</h4>
                  {analysis.links.map((l) => (
                    <div key={l.item.id} className="pilo-idea">
                      <span className="pilo-pick__body">
                        <strong>{l.item.name}</strong>
                        <span>
                          {siteName(l.item.programId, l.item.campusId)} · se parece a {l.ficha.code} · {l.ficha.name} (
                          {Math.round(l.score * 100)} % de palabras en común)
                        </span>
                      </span>
                      {canCurate && (
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={link.isPending}
                          onClick={() => link.mutate({ id: l.item.id, parentId: l.ficha.id })}
                        >
                          Relacionar con {l.ficha.code}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {analysis.ideas.length === 0 && analysis.links.length === 0 && (
                <p className="pilo__empty">
                  Nada que reorganizar: lo que crearon los programas ya está relacionado o es propio de un solo programa.
                </p>
              )}
            </div>
          </>
        )}

        {tab === "uso" && (
          <>
            <header className="pilo__head" data-anim>
              <h2 tabIndex={-1} data-autofocus>
                Cómo se usa cada ficha
              </h2>
              <p>Una ficha obligatoria entra siempre en la propuesta de Mr. Pilo a los programas.</p>
            </header>
            <div className="pilo__list" data-anim>
              {setMandatory.error && (
                <p className="pilo__error" role="alert">
                  <Icon name="alert" size={14} /> {setMandatory.error.message}
                </p>
              )}
              {usage.map((u) => {
                const ficha = fichas.find((f) => f.id === u.ficha.id)!;
                return (
                  <div key={u.ficha.id} className="pilo-usage" data-flagged={u.flags.length ? "" : undefined}>
                    <span className="pilo-pick__code">{ficha.code}</span>
                    <span className="pilo-pick__body">
                      <strong>{ficha.name}</strong>
                      <span>
                        {STAGE_LABEL[ficha.stage]} · la siguen {u.adopted} · reportan {u.reporting} · la adaptan {u.adapted}
                        {ficha.cesu.length ? " · CNA" : ""}
                      </span>
                      {u.flags.map((f) => (
                        <span key={f} className="pilo-usage__flag">
                          <Icon name="alert" size={13} /> {USAGE_TEXT[f]}
                        </span>
                      ))}
                    </span>
                    {access.canDefine(ficha.fn, ficha.ownerUnitId) && ficha.status === "publicado" && (
                      <label className="pilo-usage__mandatory">
                        <input
                          type="checkbox"
                          checked={ficha.mandatory}
                          disabled={setMandatory.isPending}
                          onChange={(e) => setMandatory.mutate({ id: ficha.id, mandatory: e.target.checked })}
                        />
                        Obligatoria
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </PiloScene>
  );
}
