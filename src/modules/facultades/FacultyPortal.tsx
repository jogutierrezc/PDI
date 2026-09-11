/* =============================================================================
   PDI por facultad · índice

   Una página pública que responde a tres preguntas:

     1. ¿Cuánto de lo que las facultades planean apunta al plan?
     2. ¿Qué facultad empuja qué pilar —y qué pilar no empuja nadie?
     3. ¿Dónde está el plan de cada una?

   La pieza central es la matriz de facultad × pilar. Se dibuja entera, con sus
   casillas en cero incluidas, por la misma razón por la que el módulo de ODS
   pinta los diecisiete objetivos aunque nadie toque algunos: un pilar que
   ninguna facultad empuja es exactamente el dato que esta página existe para
   poner sobre la mesa. Filtrarlo la dejaría más limpia y menos honesta.

   El plan lo formula cada facultad en su propia aplicación; el portal lo trae
   sincronizado y lo único que añade es el enganche con el PDI. Por eso la
   página no ofrece editar nada: aquí solo se lee.

   Sobre el color de la matriz: la intensidad de la casilla es una rampa de un
   solo tono sobre el conteo, no el color del pilar. Seis matices compitiendo
   en una rejilla no dejan comparar nada; el color del pilar vive en la cabecera
   de su columna, que es donde identifica. Y la cifra está siempre escrita, así
   que quien no distinga los tonos lee lo mismo.
   ========================================================================== */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { Icon } from "../../components/ui/Icon";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../components/ui/QueryState";
import { useFaculties, useFacultyMatrix } from "../../data/queries";
import { accentFor, matrixBand, tallyFaculties } from "../../data/pdi";
import type { FacultyPillarCell, FacultySummary } from "../../types/database";
import "./facultades.css";

export function FacultyPortal() {
  const faculties = useFaculties();
  const matrix = useFacultyMatrix();

  const rows = useMemo(() => faculties.data ?? [], [faculties.data]);
  const cells = useMemo(() => matrix.data ?? [], [matrix.data]);

  const overview = useMemo(() => tallyFaculties(cells, rows), [cells, rows]);

  // Las columnas salen de la propia matriz y no de una consulta aparte: si un
  // pilar deja de publicarse, desaparece de las dos a la vez.
  const pillars = useMemo(() => {
    const seen = new Map<string, { id: string; numeral: string; name: string; accent: number }>();
    for (const cell of cells) {
      if (!seen.has(cell.pillar_id)) {
        seen.set(cell.pillar_id, {
          id: cell.pillar_id,
          numeral: cell.pillar_numeral,
          name: cell.pillar_name,
          accent: cell.pillar_accent,
        });
      }
    }
    return [...seen.values()];
  }, [cells]);

  const loading = faculties.isPending || matrix.isPending;
  const error = faculties.error ?? matrix.error;

  return (
    <PublicLayout className="faculty-page">
      <div className="u-container faculty-shell">
        <header className="faculty-intro">
          <div className="faculty-intro__copy">
            <span className="eyebrow">Aporte de las facultades · PDI 2024-2028</span>
            <h1>El PDI, facultad por facultad</h1>
            <p className="lede">
              Cada facultad formula su plan de acción y declara a qué pilar del PDI aporta cada
              acción. Esta página reúne esos planes: quién empuja qué, con cuántas acciones y qué
              parte del plan institucional queda cubierta.
            </p>
          </div>

          <ul className="faculty-intro__figures" aria-label="Resumen del aporte">
            <li>
              <strong>{overview.actions}</strong>
              <small>
                {overview.actions === 1 ? "Acción publicada" : "Acciones publicadas"}
              </small>
            </li>
            <li>
              <strong>
                {overview.facultiesWithPlan}
                <span>/{overview.faculties}</span>
              </strong>
              <small>Facultades con plan publicado</small>
            </li>
            <li>
              <strong>{overview.untouchedPillars.length}</strong>
              <small>
                {overview.untouchedPillars.length === 1
                  ? "Pilar sin ninguna acción detrás"
                  : "Pilares sin ninguna acción detrás"}
              </small>
            </li>
          </ul>
        </header>

        {error && (
          <ErrorBlock
            error={error}
            onRetry={() => {
              void faculties.refetch();
              void matrix.refetch();
            }}
          />
        )}

        {loading && !error && <CardSkeleton count={3} />}

        {!loading && !error && rows.length === 0 && (
          <EmptyBlock
            title="Todavía no hay facultades publicadas"
            hint="Los planes se traen del origen y se publican desde la intranet, una vez revisados."
          />
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <MatrixSection cells={cells} faculties={rows} pillars={pillars} />

            <section className="faculty-section" aria-labelledby="facultades-title">
              <div className="section-heading">
                <span className="eyebrow">Las facultades</span>
                <h2 id="facultades-title">Quién propone</h2>
                <p>
                  Entra a una facultad para ver su plan completo: las acciones agrupadas por
                  dimensión, con el pilar al que aporta cada una.
                </p>
              </div>

              <ul className="faculty-grid">
                {rows.map((faculty) => (
                  <li key={faculty.faculty_id}>
                    <FacultyCard faculty={faculty} pillarTotal={pillars.length} />
                  </li>
                ))}
              </ul>
            </section>

            <OriginSection />
          </>
        )}
      </div>
    </PublicLayout>
  );
}

/* --- La matriz ------------------------------------------------------------ */

interface PillarColumn {
  id: string;
  numeral: string;
  name: string;
  accent: number;
}

function MatrixSection({
  cells,
  faculties,
  pillars,
}: {
  cells: FacultyPillarCell[];
  faculties: FacultySummary[];
  pillars: PillarColumn[];
}) {
  // Índice por facultad y pilar: recorrer el arreglo dentro de la tabla sería
  // cuadrático y además dejaría huecos donde la vista sí trae un cero.
  const byCell = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of cells) map.set(`${cell.faculty_id}:${cell.pillar_id}`, cell.actions);
    return map;
  }, [cells]);

  const columnTotals = useMemo(
    () =>
      pillars.map((pillar) =>
        cells.filter((cell) => cell.pillar_id === pillar.id).reduce((sum, c) => sum + c.actions, 0),
      ),
    [cells, pillars],
  );

  const total = columnTotals.reduce((sum, value) => sum + value, 0);

  if (pillars.length === 0) return null;

  return (
    <section className="faculty-section" aria-labelledby="matriz-title">
      <div className="faculty-section__head">
        <div className="section-heading">
          <span className="eyebrow">Facultad × pilar</span>
          <h2 id="matriz-title">Dónde aporta cada facultad</h2>
          <p>
            Cuántas acciones del plan de cada facultad apuntan a cada pilar del PDI. Las casillas
            vacías también informan: dicen dónde el pilar todavía no tiene quien lo empuje desde
            esa facultad.
          </p>
        </div>

        <p className="matrix-legend" aria-hidden="true">
          <span>Menos</span>
          <i data-band="0" />
          <i data-band="1" />
          <i data-band="2" />
          <i data-band="3" />
          <span>Más acciones</span>
        </p>
      </div>

      <div className="matrix-scroll">
        <table className="matrix">
          <caption className="sr-only">
            Acciones publicadas por facultad y pilar. Cada casilla dice cuántas acciones del plan
            de esa facultad apuntan a ese pilar.
          </caption>
          <thead>
            <tr>
              <th scope="col">Facultad</th>
              {pillars.map((pillar) => (
                <th scope="col" key={pillar.id}>
                  <span className="matrix__numeral" style={{ background: accentFor(pillar.accent) }}>
                    {pillar.numeral}
                  </span>
                  <small>{pillar.name}</small>
                </th>
              ))}
              <th scope="col" className="matrix__total-head">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {faculties.map((faculty) => (
              <tr key={faculty.faculty_id}>
                <th scope="row">
                  <Link to={`/facultades/${faculty.slug}`}>{faculty.name}</Link>
                  <span>{faculty.code}</span>
                </th>
                {pillars.map((pillar) => {
                  const count = byCell.get(`${faculty.faculty_id}:${pillar.id}`) ?? 0;
                  return (
                    <td key={pillar.id} data-band={matrixBand(count)}>
                      {count > 0 ? count : <span aria-label="ninguna">—</span>}
                    </td>
                  );
                })}
                <td className="matrix__total">{faculty.action_count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Acciones por pilar</th>
              {columnTotals.map((value, index) => (
                <td key={pillars[index].id}>{value}</td>
              ))}
              <td className="matrix__total">{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/* --- Tarjeta de facultad --------------------------------------------------- */

function FacultyCard({ faculty, pillarTotal }: { faculty: FacultySummary; pillarTotal: number }) {
  return (
    <Link className="faculty-card card--interactive" to={`/facultades/${faculty.slug}`}>
      <div className="faculty-card__title">
        <span className="faculty-card__code">
          {faculty.code}
          {faculty.dean && ` · ${faculty.dean}`}
        </span>
        <h3>{faculty.name}</h3>
      </div>

      <div className="faculty-card__figures">
        <div>
          <strong>{faculty.action_count}</strong>
          <small>{faculty.action_count === 1 ? "Acción" : "Acciones"}</small>
        </div>
        <div>
          <strong>
            {faculty.pillar_count}
            <span>/{pillarTotal}</span>
          </strong>
          <small>{faculty.pillar_count === 1 ? "Pilar" : "Pilares"}</small>
        </div>
        <div>
          <strong>{faculty.activity_count}</strong>
          <small>{faculty.activity_count === 1 ? "Actividad" : "Actividades"}</small>
        </div>
      </div>

      {faculty.pillar_counts.length > 0 && (
        <ul className="pillar-chips">
          {faculty.pillar_counts.map((row) => (
            <li key={row.pillar_id}>
              <i style={{ background: accentFor(row.accent) }} aria-hidden="true" />
              {row.numeral} · {row.count}
            </li>
          ))}
        </ul>
      )}

      <span className="faculty-card__link">
        {faculty.action_count === 0
          ? "Todavía sin plan publicado"
          : `Ver el plan · ${faculty.action_count} ${faculty.action_count === 1 ? "acción" : "acciones"}`}
        <Icon name="arrow-right" size={15} />
      </span>
    </Link>
  );
}

/* --- De dónde sale el dato -------------------------------------------------
   La página dice de dónde viene lo que muestra. No es relleno: el dato lo
   escribe la facultad fuera del portal, y quien lo lee tiene derecho a saber
   que pasó por una revisión antes de publicarse.
   -------------------------------------------------------------------------- */

function OriginSection() {
  return (
    <section className="faculty-section" aria-labelledby="origen-title">
      <div className="section-heading">
        <span className="eyebrow">Procedencia del dato</span>
        <h2 id="origen-title">De dónde sale lo que se lee aquí</h2>
        <p>
          La página no inventa cifras: cada acción la escribió su facultad en la aplicación de
          planes, y la Oficina de Planeación la revisó antes de publicarla aquí.
        </p>
      </div>

      <ol className="origin-steps">
        <li>
          <span>Paso 1</span>
          <strong>
            <Icon name="document" size={16} />
            La facultad formula
          </strong>
          <p>
            Cada facultad construye su plan en su propia aplicación: las acciones, sus actividades y
            el pilar del PDI al que declara que aportan.
          </p>
        </li>
        <li>
          <span>Paso 2</span>
          <strong>
            <Icon name="check" size={16} />
            Planeación revisa
          </strong>
          <p>
            El portal trae el plan sincronizado, resuelve el pilar declarado contra los pilares
            reales del PDI y la oficina revisa lo que no casa.
          </p>
        </li>
        <li>
          <span>Paso 3</span>
          <strong>
            <Icon name="clock" size={16} />
            Se publica con fecha
          </strong>
          <p>
            Solo lo revisado llega a esta página. Lo que sigue en revisión no se muestra, y cada
            facultad dice en qué fase va su plan.
          </p>
        </li>
      </ol>
    </section>
  );
}
