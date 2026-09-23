/* =============================================================================
   Catálogo · Planeación Institucional.

   Arriba, lo que trajo la matriz y lo que encontró el importador. En medio,
   la lista con sus filtros. Al elegir un indicador, su ficha técnica se abre
   al lado, sin salir de la lista. Abajo, publicar: bloqueado mientras un
   indicador del piloto tenga la ficha incompleta.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import { CALC_LABEL, FUNCTIONS, INDICATORS, LEVELS, MODE_LABEL, functionById } from "../data/catalog";
import { MATRIX_FINDINGS, MATRIX_SOURCE } from "../data/matriz.generated";
import type { FunctionId, Indicator, Level } from "../data/types";
import { MatrixImport } from "./MatrixImport";
import { actions, useImpactStore } from "./store";

type SheetFilter = "todas" | "piloto" | "completa" | "incompleta";

const FINDINGS: { label: string; count: number; hint: string }[] = [
  { label: "Líneas base «Por definir»", count: MATRIX_FINDINGS.linea_base_por_definir, hint: "27 en Investigación, 12 en Enseñanza y 42 en Extensión" },
  { label: "Variantes de unidad de medida", count: MATRIX_FINDINGS.variantes_unidad, hint: "A mapear a número, porcentaje, razón, puntaje, pesos u horas" },
  { label: "Dimensión «Por definir»", count: MATRIX_FINDINGS.dimension_por_definir, hint: "Todos son indicadores sugeridos" },
  { label: "Nivel escrito de otra forma", count: MATRIX_FINDINGS.nivel_variante, hint: "«2. PROCESO» frente a «2. PROCESOS» en Enseñanza" },
  { label: "Número en la columna de unidad", count: MATRIX_FINDINGS.unidad_numerica, hint: "I01 trae 1920: probablemente la línea base desplazada" },
];

export function CatalogView() {
  const state = useImpactStore();
  const [fn, setFn] = useState<FunctionId | "todas">("todas");
  const [level, setLevel] = useState<Level | "todos">("todos");
  const [status, setStatus] = useState<"todos" | "oficial" | "sugerido">("todos");
  const [sheet, setSheet] = useState<SheetFilter>("todas");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>("E04");
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDICATORS.filter(
      (i) =>
        (fn === "todas" || i.funcion === fn) &&
        (level === "todos" || i.nivel === level) &&
        (status === "todos" || i.estado === status) &&
        (sheet === "todas" ||
          (sheet === "piloto" && i.ficha?.enPiloto) ||
          (sheet === "completa" && i.ficha) ||
          (sheet === "incompleta" && !i.ficha)) &&
        (!q || i.nombre.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q)),
    );
  }, [fn, level, status, sheet, query]);

  const pilot = INDICATORS.filter((i) => i.ficha?.enPiloto);
  const pilotIncomplete = pilot.filter((i) => !i.ficha);
  const current = INDICATORS.find((i) => i.codigo === selected) ?? null;
  const published = state.catalog.published;

  return (
    <>
      <MatrixImport />

      <section className="admin-card ia-summary">
        <div className="ia-summary__source">
          <h2>Catálogo del prototipo</h2>
          <p>
            <code>{MATRIX_SOURCE}</code> · hojas de Investigación, Enseñanza y Extensión. La hoja Consolidado no se importa.
          </p>
          <dl className="ia-counts">
            <div>
              <dt>Indicadores</dt>
              <dd>{INDICATORS.length}</dd>
            </div>
            {FUNCTIONS.map((f) => (
              <div key={f.id} style={{ "--tone": f.tone } as CSSProperties}>
                <dt>{f.name}</dt>
                <dd>{INDICATORS.filter((i) => i.funcion === f.id).length}</dd>
              </div>
            ))}
            <div>
              <dt>Oficiales · sugeridos</dt>
              <dd>
                {INDICATORS.filter((i) => i.estado === "oficial").length} · {INDICATORS.filter((i) => i.estado === "sugerido").length}
              </dd>
            </div>
          </dl>
        </div>
        <div className="ia-findings">
          <h3>
            Hallazgos del importador
            <span>no se corrigen en silencio</span>
          </h3>
          <ul>
            {FINDINGS.map((f) => (
              <li key={f.label}>
                <strong>{f.count}</strong>
                <span>
                  {f.label}
                  <small>{f.hint}</small>
                </span>
              </li>
            ))}
          </ul>
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
          <p className="ia-list__count">
            {rows.length} de {INDICATORS.length}
          </p>
          <ul>
            {rows.map((i) => (
              <li key={i.codigo}>
                <button
                  type="button"
                  aria-pressed={selected === i.codigo}
                  style={{ "--tone": functionById[i.funcion].tone } as CSSProperties}
                  onClick={() => setSelected(i.codigo)}
                >
                  <span className="ia-code">{i.codigo}</span>
                  <span className="ia-list__name">{i.nombre}</span>
                  <span className="ia-list__meta">
                    {LEVELS.find((l) => l.id === i.nivel)?.name}
                    {i.estado === "sugerido" && <em className="ia-pill ia-pill--pending">Sugerido</em>}
                    {i.ficha?.enPiloto && <em className="ia-pill ia-pill--done">Piloto</em>}
                    {!i.ficha && i.estado === "oficial" && <em className="ia-pill">Ficha incompleta</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="ia-empty">Ningún indicador cumple esos filtros.</p>}
        </section>

        {current ? <SheetPanel indicator={current} locked={published !== null && state.catalog.draftChanges === 0} /> : null}
      </div>

      <section className="admin-card ia-publish">
        <div>
          <h2>{published ? `Versión ${published} publicada` : "Catálogo en borrador"}</h2>
          <p>
            {published
              ? state.catalog.draftChanges > 0
                ? `Hay ${state.catalog.draftChanges} cambios en borrador: publicarlos crea la versión ${published + 1}. La ${published} no cambia.`
                : "La versión publicada no se edita. Cualquier cambio abre un borrador de la siguiente."
              : "Publicar deja la versión inmutable y habilita abrir periodos con ella."}{" "}
            {pilot.length} indicadores en piloto, {pilot.length - pilotIncomplete.length} con ficha completa.
          </p>
        </div>
        {confirming ? (
          <div className="ia-publish__confirm">
            <span>¿Publicar la versión {(published ?? 0) + 1}?</span>
            <button type="button" className="button-primary" onClick={() => { actions.publish(); setConfirming(false); }}>
              Sí, publicar
            </button>
            <button type="button" className="button-ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button-primary"
            disabled={pilotIncomplete.length > 0 || (published !== null && state.catalog.draftChanges === 0)}
            onClick={() => setConfirming(true)}
          >
            <Icon name="upload" size={15} />
            Publicar versión {(published ?? 0) + 1}
          </button>
        )}
      </section>
    </>
  );
}

function SheetPanel({ indicator, locked }: { indicator: Indicator; locked: boolean }) {
  const sheet = indicator.ficha;
  const fn = functionById[indicator.funcion];

  return (
    <aside className="admin-card ia-sheet" style={{ "--tone": fn.tone } as CSSProperties} aria-label={`Ficha de ${indicator.codigo}`}>
      <header>
        <h2>
          <span className="ia-code">{indicator.codigo}</span> {indicator.nombre}
        </h2>
        <p>
          {fn.name} · {LEVELS.find((l) => l.id === indicator.nivel)?.name} · {indicator.estado}
        </p>
      </header>

      <dl className="ia-matrix">
        <div>
          <dt>Unidad en la matriz</dt>
          <dd>{indicator.unidad || "—"}</dd>
        </div>
        <div>
          <dt>Línea base 2023</dt>
          <dd>{indicator.lineaBase || "—"}</dd>
        </div>
        <div>
          <dt>Meta {indicator.meta.anio}</dt>
          <dd>{indicator.meta.valor || "—"}</dd>
        </div>
        <div>
          <dt>Responsable</dt>
          <dd>{indicator.responsable || "—"}</dd>
        </div>
      </dl>

      {sheet && locked && (
        <button type="button" className="button-secondary ia-sheet__unlock" onClick={() => actions.editSheet()}>
          Editar en un borrador nuevo
        </button>
      )}

      {sheet ? (
        <fieldset className="ia-sheet__form" disabled={locked}>
          <legend>Ficha técnica {locked && <small>· de la versión publicada</small>}</legend>
          <label className="admin-field">
            <span>Tipo de cálculo</span>
            <select defaultValue={sheet.tipo} onChange={actions.editSheet}>
              {Object.entries(CALC_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Modo de captura</span>
            <select defaultValue={sheet.modo} onChange={actions.editSheet}>
              {Object.entries(MODE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field admin-field--wide">
            <span>{sheet.denominador ? "Qué va en el numerador" : "Qué se cuenta"}</span>
            <input defaultValue={sheet.numerador} onChange={actions.editSheet} />
          </label>
          {sheet.denominador && (
            <label className="admin-field admin-field--wide">
              <span>Qué va en el denominador</span>
              <input defaultValue={sheet.denominador} onChange={actions.editSheet} />
            </label>
          )}
          <label className="admin-field">
            <span>Periodicidad</span>
            <select defaultValue={sheet.periodicidad} onChange={actions.editSheet}>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Se reporta por</span>
            <select defaultValue={sheet.nivelReporte} onChange={actions.editSheet}>
              <option value="programa_sede">Programa y sede</option>
              <option value="programa">Programa</option>
              <option value="facultad">Facultad</option>
              <option value="institucional">Institución</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Umbral de variación</span>
            <input type="number" defaultValue={sheet.umbral} min={0} onChange={actions.editSheet} />
          </label>
          <label className="admin-field">
            <span>Vicerrectoría que valida</span>
            <input value={fn.vice} readOnly />
          </label>
          <label className="ia-check admin-field--wide">
            <input type="checkbox" defaultChecked={Boolean(sheet.evidencia?.obligatoria)} onChange={actions.editSheet} />
            Exige evidencia{sheet.evidencia ? `: ${sheet.evidencia.tipo}` : ""}
          </label>
          {sheet.supuesto && (
            <p className="ia-assumption admin-field--wide">
              <Icon name="alert" size={14} />
              Supuesto del prototipo: {sheet.supuesto}
            </p>
          )}
        </fieldset>
      ) : (
        <p className="ia-empty">
          {indicator.estado === "sugerido"
            ? "Indicador sugerido: no se asigna ni se reporta mientras el catálogo no lo adopte."
            : "Sin ficha técnica. Queda fuera de los periodos hasta que se complete."}
        </p>
      )}
    </aside>
  );
}
