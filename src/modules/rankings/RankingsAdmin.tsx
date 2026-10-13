/* =============================================================================
   Tablero de rankings · la pantalla de la intranet.

   Una sola ruta: /admin/rankings/:seccion?
     (sin sección)         el tablero: los tres rankings y el recolector
     impact|world|green    una página corta de cada ranking, con sus accesos
     noticias              el recolector de noticias por ODS: una sola mesa de
                           trabajo (?buscar=1 abre el panel de búsqueda)
     informes              Informes ODS con Pilo (informes/InformesOds.tsx):
                           ?ods=4&tab=redactar|indicadores|fotos|vista
     posicion              Posicionamiento en THE Impact (posicion/Posicion.tsx):
                           la tabla oficial 2026 (0148) y el escenario 2027
   La búsqueda de noticias vive aquí (CargaProvider), no en el recolector: sigue
   corriendo y se ve en la barra de progreso aunque se cambie de sección.
   Las cifras de los rankings salen de sostenible/data.ts (las de World y
   GreenMetric son ilustrativas); las del recolector, de la base (0143).
   ========================================================================== */

import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { LAST, RANKINGS, YEARS, fmt, rankingById } from "../sostenible/data";
import type { Ranking, RankingId } from "../sostenible/data";
import { FaltaMigracion, useNewsInbox } from "./noticias";
import type { NewsItem } from "./noticias";
import { Recolector } from "./Recolector";
import { InformesOds } from "./informes/InformesOds";
import { BarraCarga, CargaProvider } from "./carga";
import { odsVars } from "./ods";
import { Posicion, ResultadoTHE } from "./posicion/Posicion";
import "./rankings.css";

type Seccion = "tablero" | RankingId | "noticias" | "informes" | "posicion";
const BASE = "/admin/rankings";
const KICKER = "Tablero de rankings";

/** Los datos de estos rankings en data.ts son de ejemplo hasta cargar los oficiales. */
const ILUSTRATIVOS: RankingId[] = ["world", "green"];

const EDITOR: Record<Ranking["publisher"], string> = {
  THE: "Times Higher Education",
  UI: "Universitas Indonesia",
};

const NOMBRE: Record<RankingId, string> = {
  impact: "THE Impact Rankings",
  world: "THE World University Rankings",
  green: "UI GreenMetric",
};

export function RankingsAdmin() {
  const { seccion: param } = useParams();
  const inbox = useNewsInbox();

  const seccion: Seccion | null =
    param === undefined ? "tablero" : param === "noticias" || param === "informes" || param === "posicion" ? param : rankingById(param) ? (param as RankingId) : null;
  if (!seccion) return <Navigate to={BASE} replace />;

  const porRevisar = inbox.data?.filter((n) => n.state === "pending").length;

  const rail = (
    <AdminRail label="Secciones del tablero de rankings">
      <AdminRailTab current={seccion === "tablero"} to={BASE}>
        Tablero
      </AdminRailTab>
      {RANKINGS.map((r) => (
        <AdminRailTab key={r.id} current={seccion === r.id} to={`${BASE}/${r.id}`}>
          {r.id === "green" ? "GreenMetric" : `THE ${r.id === "impact" ? "Impact" : "World"}`}
        </AdminRailTab>
      ))}
      <AdminRailTab current={seccion === "noticias"} to={`${BASE}/noticias`} count={porRevisar}>
        Recolector de noticias
      </AdminRailTab>
      <AdminRailTab current={seccion === "informes"} to={`${BASE}/informes`}>
        Informes ODS con Pilo
      </AdminRailTab>
      <AdminRailTab current={seccion === "posicion"} to={`${BASE}/posicion`}>
        Posicionamiento THE
      </AdminRailTab>
    </AdminRail>
  );

  let titulo = "Tablero de rankings";
  let descripcion = "THE Impact, THE World University, UI GreenMetric y las noticias de la UDES por ODS";
  let cuerpo: ReactNode;
  if (seccion === "tablero") {
    cuerpo = <Tablero inbox={inbox} />;
  } else if (seccion === "noticias") {
    titulo = "Recolector de noticias";
    descripcion = "Las noticias de udes.edu.co clasificadas por ODS; lo aprobado aparece en los informes públicos";
    cuerpo = <Recolector />;
  } else if (seccion === "informes") {
    titulo = "Informes ODS con Pilo";
    descripcion = "Pilo redacta cada ODS con las noticias aprobadas; tú revisas, eliges la evidencia de THE y publicas";
    cuerpo = <InformesOds />;
  } else if (seccion === "posicion") {
    titulo = "Posicionamiento en THE Impact";
    descripcion = "Dónde está la UDES en THE Impact 2026 frente a Colombia y qué tan probable es moverse en 2027, con supuestos a la vista";
    cuerpo = <Posicion />;
  } else {
    const ranking = rankingById(seccion) as Ranking;
    titulo = NOMBRE[ranking.id];
    descripcion = ranking.subtitle;
    cuerpo = <PaginaRanking ranking={ranking} />;
  }

  return (
    <CargaProvider>
      <AdminShell section="rankings" kicker={KICKER} title={titulo} description={descripcion} rail={rail}>
        <div className="rk">
          {/* En el recolector la barra va bajo su franja de flujo. */}
          {seccion !== "noticias" && <BarraCarga />}
          {cuerpo}
        </div>
      </AdminShell>
    </CargaProvider>
  );
}

/* ---------- Lo que se dice de un ranking ---------------------------------- */

function EstadoRanking({ ranking }: { ranking: Ranking }) {
  const mejor = ranking.mid.reduce((b, v, i) => (v < ranking.mid[b] ? i : b), 0);
  const puntaje = ranking.score?.[LAST];
  return (
    <>
      <p className="rk-status">
        Edición {YEARS[LAST]}: <strong className="rk-num">{ranking.world[LAST]}</strong> en el mundo {ranking.unit} ·{" "}
        <strong className="rk-num">{ranking.national[LAST]}.º</strong> en Colombia
        {puntaje !== undefined && (
          <>
            {" "}
            · <strong className="rk-num">{fmt(puntaje)}</strong> puntos de 10.000
          </>
        )}{" "}
        · {ranking.world.length} ediciones
        {mejor !== LAST && (
          <>
            {" "}
            · mejor posición {ranking.world[mejor]} ({YEARS[mejor]})
          </>
        )}
      </p>
      {ILUSTRATIVOS.includes(ranking.id) && <p className="rk-note">Cifras ilustrativas hasta cargar las oficiales.</p>}
    </>
  );
}

function Externo({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="rk-go" href={to} target="_blank" rel="noopener">
      {children}
      <Icon name="external" size={14} aria-hidden="true" />
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

function AccesosRanking({ ranking }: { ranking: Ranking }) {
  return (
    <ul className="rk-links">
      {ranking.id === "impact" && (
        <li>
          <Link className="rk-go" to={`${BASE}/posicion`}>
            Analizar el posicionamiento
          </Link>
        </li>
      )}
      <li>
        <Externo to={`/sostenible/${ranking.id}`}>Ver portal público</Externo>
      </li>
      {ranking.id === "impact" && (
        <>
          <li>
            <Externo to="/sostenible/impact/informes">Los 17 informes</Externo>
          </li>
          <li>
            <Externo to="/sostenible/impact/boletin">Boletín PDF</Externo>
          </li>
        </>
      )}
    </ul>
  );
}

/* ---------- El tablero ----------------------------------------------------- */

function Tablero({ inbox }: { inbox: ReturnType<typeof useNewsInbox> }) {
  return (
    <div className="rk-board">
      <ol className="rk-board__list">
        {RANKINGS.map((r, i) => (
          <li key={r.id} className="rk-entry">
            <span className="rk-entry__index rk-num" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="rk-entry__by">{EDITOR[r.publisher]}</p>
            <h2 className="rk-entry__title">
              <Link to={`${BASE}/${r.id}`}>{NOMBRE[r.id]}</Link>
            </h2>
            <EstadoRanking ranking={r} />
            {r.id === "impact" && <ResultadoTHE />}
            <AccesosRanking ranking={r} />
          </li>
        ))}
        <li className="rk-entry rk-entry--tool">
          <span className="rk-entry__index rk-num" aria-hidden="true">
            04
          </span>
          <p className="rk-entry__by">Evidencias para THE Impact</p>
          <h2 className="rk-entry__title">
            <Link to={`${BASE}/noticias`}>Recolector de noticias</Link>
          </h2>
          <EstadoRecolector inbox={inbox} />
          <ul className="rk-links">
            <li>
              <Link className="rk-go" to={`${BASE}/noticias`}>
                Revisar noticias
              </Link>
            </li>
            <li>
              <Link className="rk-go" to={`${BASE}/noticias?buscar=1`}>
                Buscar noticias
              </Link>
            </li>
            <li>
              <Link className="rk-go" to={`${BASE}/informes`}>
                Redactar informes con Pilo
              </Link>
            </li>
          </ul>
        </li>
      </ol>
    </div>
  );
}

export function contarEstados(notas: NewsItem[]) {
  const c = { total: notas.length, pending: 0, ok: 0, no: 0 };
  for (const n of notas) c[n.state]++;
  return c;
}

function EstadoRecolector({ inbox }: { inbox: ReturnType<typeof useNewsInbox> }) {
  if (inbox.error instanceof FaltaMigracion) {
    return (
      <p className="rk-status rk-status--warn" role="note">
        <Icon name="alert" size={15} aria-hidden="true" /> Falta aplicar la migración 0143: el recolector todavía no tiene dónde guardar las
        notas.
      </p>
    );
  }
  if (inbox.error) return <p className="rk-status">No se pudieron contar las notas: {inbox.error.message}</p>;
  if (!inbox.data) return <p className="rk-status rk-status--muted">Contando las notas…</p>;
  const c = contarEstados(inbox.data);
  if (!c.total) return <p className="rk-status">Aún no se ha cargado ninguna nota. Empieza por «Buscar noticias».</p>;
  return (
    <p className="rk-status">
      <strong className="rk-num">{fmt(c.pending)}</strong> por revisar · <strong className="rk-num">{fmt(c.ok)}</strong> aprobadas ·{" "}
      <strong className="rk-num">{fmt(c.no)}</strong> descartadas
    </p>
  );
}

/* ---------- Página de un ranking ------------------------------------------- */

function PaginaRanking({ ranking }: { ranking: Ranking }) {
  return (
    <div className="rk-page">
      <section className="rk-page__block" aria-labelledby="rk-que-es">
        <p className="rk-entry__by">{EDITOR[ranking.publisher]}</p>
        <h2 id="rk-que-es" className="rk-h2">
          Qué es
        </h2>
        <p className="rk-lead">{ranking.about}</p>
        <EstadoRanking ranking={ranking} />
        {ranking.id === "impact" && <ResultadoTHE />}
      </section>

      <section className="rk-page__block" aria-labelledby="rk-cats">
        <h2 id="rk-cats" className="rk-h2">
          {ranking.categoryLabel} en los que se presenta la UDES
        </h2>
        <ul className="rk-cats">
          {ranking.categories.map((c) => (
            <li key={c.id}>
              {c.sdg ? (
                <span className="rk-odsmark" style={odsVars(c.sdg)}>
                  {c.sdg}
                </span>
              ) : (
                <span className="rk-cats__code">{c.code}</span>
              )}
              {c.name}
              {c.weight !== undefined && <span className="rk-cats__weight rk-num">{c.weight} %</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rk-page__block" aria-labelledby="rk-accesos">
        <h2 id="rk-accesos" className="rk-h2">
          Accesos
        </h2>
        <AccesosRanking ranking={ranking} />
        {ranking.id === "impact" && (
          <p className="rk-hint">
            Las noticias que sirven de evidencia para cada ODS se revisan en el <Link to={`${BASE}/noticias`}>Recolector de noticias</Link>. Con ellas, Pilo
            redacta cada informe: <Link to={`${BASE}/informes`}>Redactar informes con Pilo</Link>.
          </p>
        )}
      </section>

      <section className="rk-soon" aria-labelledby="rk-soon">
        <h2 id="rk-soon" className="rk-h2">
          Próximamente: carga de datos
        </h2>
        <p>
          Hoy las posiciones y puntajes de esta página salen de un archivo del portal, no de la base. Aquí se podrán cargar los resultados
          oficiales de cada edición; mientras tanto no hay importador y el portal público muestra esas mismas cifras.
        </p>
      </section>
    </div>
  );
}
