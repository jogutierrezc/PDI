import { useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { ImplementationPortal } from "./modules/implementation/ImplementationPortal";
import { PillarViewer } from "./modules/pillar-viewer/PillarViewer";
import { LoginPortal } from "./modules/login/LoginPortal";
import { PillarManagement } from "./modules/admin/gestion-pilares/PillarManagement";
import { PillarConfigurator } from "./modules/admin/gestion-pilares/PillarConfigurator";
import { GlobalParameters } from "./modules/admin/parametros/GlobalParameters";

type Pillar = {
  title: string;
  accent: string;
  total: number;
  done: number;
  active: number;
  pending: number;
  risk: number;
  focus: string;
  owner: string;
};

type ActivityStatus = "cumplida" | "curso" | "pendiente" | "riesgo";

type Activity = {
  title: string;
  pillar: string;
  owner: string;
  due: string;
  progress: number;
  status: ActivityStatus;
};

const pillars: Pillar[] = [
  {
    title: "Personalización",
    accent: "#0b62d6",
    total: 14,
    done: 12,
    active: 1,
    pending: 1,
    risk: 0,
    focus: "Acompañamiento estudiantil y experiencias flexibles.",
    owner: "Vicerrectoría Académica",
  },
  {
    title: "Ambiente tecnológico",
    accent: "#0f8a75",
    total: 16,
    done: 12,
    active: 3,
    pending: 1,
    risk: 0,
    focus: "Infraestructura digital, analítica y servicios.",
    owner: "Dirección TIC",
  },
  {
    title: "Entorno emprendedor",
    accent: "#c46d12",
    total: 13,
    done: 9,
    active: 2,
    pending: 1,
    risk: 1,
    focus: "Innovación, incubación y conexión con empresas.",
    owner: "Cámara de Innovación",
  },
  {
    title: "Gobernanza para el buen gobierno",
    accent: "#5b4cc4",
    total: 15,
    done: 13,
    active: 1,
    pending: 1,
    risk: 0,
    focus: "Decisiones, transparencia y seguimiento.",
    owner: "Secretaría General",
  },
  {
    title: "Sostenibilidad",
    accent: "#2b9d6f",
    total: 14,
    done: 11,
    active: 2,
    pending: 1,
    risk: 0,
    focus: "Gestión ambiental, financiera y social.",
    owner: "Planeación",
  },
  {
    title: "Apropiación social",
    accent: "#e15a5a",
    total: 12,
    done: 10,
    active: 1,
    pending: 1,
    risk: 0,
    focus: "Impacto territorial y transferencia de conocimiento.",
    owner: "Extensión",
  },
];

const activities: Activity[] = [
  {
    title: "Actualización de rutas de acompañamiento",
    pillar: "Personalización",
    owner: "Bienestar Universitario",
    due: "Ago 2026",
    progress: 100,
    status: "cumplida",
  },
  {
    title: "Fortalecimiento del aula híbrida",
    pillar: "Ambiente tecnológico",
    owner: "Dirección TIC",
    due: "Sep 2026",
    progress: 72,
    status: "curso",
  },
  {
    title: "Alianzas con el sector productivo regional",
    pillar: "Entorno emprendedor",
    owner: "Innovación y Emprendimiento",
    due: "Sep 2026",
    progress: 61,
    status: "riesgo",
  },
  {
    title: "Tablero de indicadores de gobernanza",
    pillar: "Gobernanza para el buen gobierno",
    owner: "Secretaría General",
    due: "Ago 2026",
    progress: 95,
    status: "cumplida",
  },
  {
    title: "Plan institucional de sostenibilidad 2026",
    pillar: "Sostenibilidad",
    owner: "Gestión Ambiental",
    due: "Oct 2026",
    progress: 84,
    status: "curso",
  },
];

function App() {
  if (window.location.pathname === "/implementacion") {
    return <ImplementationPortal />;
  }

  if (window.location.pathname === "/tablero") {
    return <TableroPdiPublico />;
  }

  if (window.location.pathname.startsWith("/implementacion/pilar/")) {
    return <PillarViewer />;
  }

  if (window.location.pathname === "/acceso-intranet") {
    return <LoginPortal />;
  }

  if (window.location.pathname === "/admin/pilares") {
    return localStorage.getItem("pdi-admin-session") === "demo" ? <PillarManagement /> : <LoginPortal />;
  }

  if (window.location.pathname === "/admin/parametros") {
    return localStorage.getItem("pdi-admin-session") === "demo" ? <GlobalParameters /> : <LoginPortal />;
  }

  if (window.location.pathname.startsWith("/admin/pilares/") && window.location.pathname.endsWith("/configurar")) {
    return localStorage.getItem("pdi-admin-session") === "demo" ? <PillarConfigurator /> : <LoginPortal />;
  }

  return <PaginaInicio />;
}

function PaginaInicio() {
  const homePillars = [
    { title: "PersonalizaciÃ³n", description: "Enfoque humano y adaptaciÃ³n a las necesidades individuales para potenciar el talento de cada estudiante.", accent: "#0b62d6", icon: "✦", slug: "personalizacion" },
    { title: "Ambiente tecnolÃ³gico", description: "Infraestructura y digitalizaciÃ³n de vanguardia para soportar procesos acadÃ©micos e investigativos.", accent: "#0f8a75", icon: "⌘", slug: "ambiente-tecnologico" },
    { title: "Entorno emprendedor", description: "Fomento de la innovaciÃ³n y creaciÃ³n de empresas, conectando el saber con el desarrollo econÃ³mico local.", accent: "#c46d12", icon: "↗", slug: "entorno-emprendedor" },
    { title: "Gobernanza para el buen gobierno", description: "Estructuras sÃ³lidas, transparentes e inclusivas que garantizan la toma de decisiones participativa.", accent: "#5b4cc4", icon: "◈", slug: "gobernanza" },
    { title: "Sostenibilidad", description: "Compromiso transversal con el cuidado ambiental, el equilibrio social y la viabilidad financiera.", accent: "#2b9d6f", icon: "♧", slug: "sostenibilidad" },
    { title: "ApropiaciÃ³n social", description: "Transferencia efectiva del conocimiento a la comunidad, fortaleciendo el tejido social y cultural.", accent: "#e15a5a", icon: "◉", slug: "apropiacion-social" },
  ];

  return (
    <div className="home-page">
      <TopBar activeSection="home" />
      <main>
        <section className="home-hero" id="inicio">
          <video className="home-hero__media" autoPlay muted loop playsInline poster="/logo-udes.svg" aria-hidden="true"><source src="/Multimedia1.mp4" type="video/mp4" /></video>
          <div className="home-hero__overlay" />
          <div className="home-hero__content">
            <span className="eyebrow">Plan de Desarrollo Institucional</span>
            <h1>PDI 2024-2028:<br />Aquí construimos futuro</h1>
            <p>Nuestra hoja de ruta hacia la excelencia acadÃ©mica y el compromiso social. Un esfuerzo colectivo para transformar nuestra regiÃ³n.</p>
            <a className="button-primary" href="/implementacion">Explorar el plan <span aria-hidden="true">→</span></a>
          </div>
        </section>

        <section className="home-pillars" id="pilares">
          <div className="home-section-heading"><span className="eyebrow">Ejes estratégicos</span><h2>Nuestros pilares estratégicos</h2><p>Ejes fundamentales que estructuran nuestro accionar para los próximos años.</p></div>
          <div className="home-pillar-grid">
            {homePillars.map((pillar) => <a className="home-pillar-card" href={`/implementacion/pilar/${pillar.slug}`} key={pillar.slug}><span className="home-pillar-card__icon" style={{ color: pillar.accent, background: `${pillar.accent}16` }}>{pillar.icon}</span><h3>{pillar.title}</h3><p>{pillar.description}</p><span className="home-pillar-card__link">Conocer el pilar <span aria-hidden="true">→</span></span></a>)}
          </div>
        </section>

        <section className="home-dashboard-cta" id="tablero"><div><span className="eyebrow">Seguimiento público</span><h2>Consulta cómo avanzamos</h2><p>Revisa el cumplimiento global del PDI, el estado de cada actividad y el avance detallado por pilar.</p></div><a className="button-primary" href="/tablero">Ir al tablero PDI <span aria-hidden="true">→</span></a></section>

        <section className="home-plan-cta"><div><span className="eyebrow">Una visión compartida</span><h2>Profundiza en nuestra visión</h2><p>Conoce los detalles, indicadores y metas que guían nuestro trabajo diario hacia una universidad de excelencia.</p></div><a className="button-secondary" href="/implementacion">Ver implementación</a></section>
      </main>
      <footer className="home-footer" id="repositorio"><div><strong>Universidad de Santander</strong><span>PDI 2024-2028</span></div><nav><a href="#inicio">Transparencia</a><a href="#inicio">Políticas de privacidad</a><a href="mailto:planeacion@udes.edu.co">Contacto</a></nav><small>© 2024 Universidad de Santander. Todos los derechos reservados.</small></footer>
    </div>
  );
}

function TableroPdiPublico() {
  const [selectedPillarIndex, setSelectedPillarIndex] = useState(0);
  const activePillar = pillars[selectedPillarIndex] ?? pillars[0];
  const pillarSlugs = ["personalizacion", "ambiente-tecnologico", "entorno-emprendedor", "gobernanza", "sostenibilidad", "apropiacion-social"];
  const totalActivities = pillars.reduce((sum, pillar) => sum + pillar.total, 0);
  const completedActivities = pillars.reduce((sum, pillar) => sum + pillar.done, 0);
  const activeActivities = pillars.reduce((sum, pillar) => sum + pillar.active, 0);
  const pendingActivities = pillars.reduce((sum, pillar) => sum + pillar.pending, 0);
  const riskActivities = pillars.reduce((sum, pillar) => sum + pillar.risk, 0);
  const globalProgress = Math.round((completedActivities / totalActivities) * 100);
  const pillarsOnTrack = pillars.filter((pillar) => Math.round((pillar.done / pillar.total) * 100) >= 80).length;
  const reviewPillars = pillars.filter((pillar) => pillar.risk > 0).length;

  const updateLabel = "28 ago 2026";
  const statusSegments = [
    { label: "Cumplidas", value: completedActivities, className: "status-segment--done" },
    { label: "En curso", value: activeActivities, className: "status-segment--active" },
    { label: "Pendientes", value: pendingActivities, className: "status-segment--pending" },
    { label: "En riesgo", value: riskActivities, className: "status-segment--risk" },
  ];

  return (
    <div className="dashboard-page">
      <TopBar activeSection="dashboard" />

      <main className="dashboard-shell dashboard-shell--with-topbar" id="tablero">
        <section className="public-landing" id="inicio">
          <div className="public-landing__copy">
            <span className="eyebrow">Plan de Desarrollo Institucional 2024-2028</span>
            <h1>Una visión compartida para transformar nuestra institución</h1>
            <p>Explora los ejes estratégicos, conoce sus iniciativas y consulta el avance del PDI en un solo lugar.</p>
            <div className="hero-actions">
              <a className="button-primary" href="#pilares">Explorar pilares</a>
              <a className="button-secondary" href="#actividades">Ver seguimiento</a>
            </div>
          </div>
          <div className="public-landing__seal" aria-hidden="true"><span>UDES</span><strong>PDI</strong><small>2024 — 2028</small></div>
        </section>

        <section className="pillar-selector" aria-labelledby="pillar-selector-title">
          <div className="section-heading section-heading--centered">
            <span className="eyebrow">Ejes estratégicos</span>
            <h2 id="pillar-selector-title">Selecciona un pilar para conocer su avance</h2>
          </div>
          <div className="pillar-selector__grid">
            {pillars.map((pillar, index) => (
              <button className={`pillar-selector__item${selectedPillarIndex === index ? " is-active" : ""}`} type="button" key={pillar.title} onClick={() => setSelectedPillarIndex(index)} aria-pressed={selectedPillarIndex === index}>
                <span className="pillar-selector__icon" style={{ color: pillar.accent }}>{["✦", "⌘", "↗", "◈", "♧", "◉"][index]}</span>
                <span>{pillar.title}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="selected-pillar" aria-live="polite">
          <div className="selected-pillar__icon" style={{ color: activePillar.accent }}>{["✦", "⌘", "↗", "◈", "♧", "◉"][selectedPillarIndex]}</div>
          <div className="selected-pillar__copy"><span className="eyebrow">Pilar activo</span><h2>{activePillar.title}</h2><p>{activePillar.focus}</p></div>
          <div className="selected-pillar__progress"><strong>{Math.round((activePillar.done / activePillar.total) * 100)}%</strong><span>cumplimiento</span></div>
          <a className="button-secondary" href={`/implementacion/pilar/${pillarSlugs[selectedPillarIndex]}`}>Ver detalle <span aria-hidden="true">→</span></a>
        </section>

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Tablero público de seguimiento</span>
            <div>
              <h1 className="hero-title">Cumplimiento global y por pilar del PDI</h1>
              <p className="hero-description">
                Este tablero resume el avance institucional de forma clara y pública. Aquí se observa el estado global,
                la lectura por pilar y las actividades que necesitan mayor atención.
              </p>
            </div>

            <div className="hero-actions">
              <a className="button-primary" href="#pilares">
                Ver pilares
              </a>
              <a className="button-secondary" href="#actividades">
                Revisar actividades
              </a>
            </div>

            <div className="hero-metadata">
              <span className="meta-pill">Actualizado al {updateLabel}</span>
              <span className="meta-pill">Corte agosto 2026</span>
              <span className="meta-pill">{pillarsOnTrack} pilares en verde</span>
            </div>
          </div>

          <aside className="score-card" aria-label="Indicador de cumplimiento global">
            <span className="score-card__label">Cumplimiento global</span>
            <div
              className="score-card__ring"
              style={{
                background: `conic-gradient(#7bb5ff 0 ${globalProgress}%, rgba(255, 255, 255, 0.12) ${globalProgress}% 100%)`,
              }}
            >
              <div className="score-card__ring-inner">
                <span className="score-card__value">{globalProgress}%</span>
                <span className="score-card__caption">avance total</span>
              </div>
            </div>
            <div className="score-card__facts">
              <div>
                <strong>{completedActivities}</strong>
                <span>actividades cumplidas</span>
              </div>
              <div>
                <strong>{reviewPillars}</strong>
                <span>pilares con foco de atención</span>
              </div>
            </div>
          </aside>
        </section>

        <section className="stats-grid" id="resumen" aria-label="Resumen ejecutivo">
          <article className="stat-card">
            <span className="stat-card__label">Actividades totales</span>
            <strong className="stat-card__value">{totalActivities}</strong>
            <span className="stat-card__hint">Seguimiento consolidado de todo el plan.</span>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">En curso</span>
            <strong className="stat-card__value">{activeActivities}</strong>
            <span className="stat-card__hint">Acciones en ejecución durante el corte actual.</span>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">Pendientes</span>
            <strong className="stat-card__value">{pendingActivities}</strong>
            <span className="stat-card__hint">Iniciativas programadas para próximas entregas.</span>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">En riesgo</span>
            <strong className="stat-card__value">{riskActivities}</strong>
            <span className="stat-card__hint">Actividades que requieren seguimiento directo.</span>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel panel--wide">
            <div className="section-heading">
              <span className="eyebrow">Lectura rápida</span>
              <h2>Estado general del plan</h2>
              <p>
                El tablero prioriza la lectura pública del avance institucional para identificar qué tan cerca estamos
                de la meta y dónde conviene concentrar esfuerzos.
              </p>
            </div>

            <div className="stacked-progress" aria-label="Distribución del avance por estado">
              {statusSegments.map((segment) => (
                <div
                  className={`stacked-progress__segment ${segment.className}`}
                  key={segment.label}
                  style={{ width: `${(segment.value / totalActivities) * 100}%` }}
                  title={`${segment.label}: ${segment.value}`}
                />
              ))}
            </div>

            <div className="legend-grid">
              {statusSegments.map((segment) => (
                <div className="legend-item" key={segment.label}>
                  <span className={`legend-swatch ${segment.className}`} />
                  <span>{segment.label}</span>
                  <strong>{segment.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel panel--side">
            <div className="section-heading section-heading--compact">
              <span className="eyebrow">Enfoque del mes</span>
              <h2>Qué mirar primero</h2>
            </div>

            <div className="focus-list">
              <div className="focus-item">
                <span className="focus-item__dot" />
                <p>Revisar el pilar con riesgo para cerrar brechas antes del siguiente corte.</p>
              </div>
              <div className="focus-item">
                <span className="focus-item__dot" />
                <p>Acelerar las actividades en curso para sostener el avance global por encima del 80%.</p>
              </div>
              <div className="focus-item">
                <span className="focus-item__dot" />
                <p>Validar evidencias y responsables para mantener trazabilidad pública y confiable.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="pillar-section" id="pilares" aria-label="Cumplimiento por pilar">
          <div className="section-heading">
            <span className="eyebrow">Seguimiento por pilar</span>
            <h2>Cumplimiento por pilar del PDI</h2>
            <p>Lectura individual de cada pilar con su avance, volumen de actividades y foco principal.</p>
          </div>

          <div className="pillar-grid">
            {pillars.map((pillar) => {
              const progress = Math.round((pillar.done / pillar.total) * 100);

              return (
                <article className="pillar-card" key={pillar.title}>
                  <div className="pillar-card__header">
                    <div>
                      <span className="pillar-card__eyebrow">Pilar</span>
                      <h3>{pillar.title}</h3>
                    </div>
                    <div
                      className="pillar-card__ring"
                      style={{
                        background: `conic-gradient(${pillar.accent} 0 ${progress}%, rgba(13, 34, 65, 0.08) ${progress}% 100%)`,
                      }}
                      aria-label={`${progress}% de avance en ${pillar.title}`}
                    >
                      <span>{progress}%</span>
                    </div>
                  </div>

                  <p className="pillar-card__focus">{pillar.focus}</p>

                  <div className="pillar-card__metrics">
                    <div>
                      <strong>{pillar.done}</strong>
                      <span>cumplidas</span>
                    </div>
                    <div>
                      <strong>{pillar.active}</strong>
                      <span>en curso</span>
                    </div>
                    <div>
                      <strong>{pillar.pending}</strong>
                      <span>pendientes</span>
                    </div>
                    <div>
                      <strong>{pillar.risk}</strong>
                      <span>en riesgo</span>
                    </div>
                  </div>

                  <div className="pillar-card__footer">
                    <div className="pillar-progress">
                      <span className="pillar-progress__bar">
                        <span
                          className="pillar-progress__fill"
                          style={{ width: `${progress}%`, background: pillar.accent }}
                        />
                      </span>
                      <span className="pillar-progress__label">
                        {pillar.done} de {pillar.total} actividades
                      </span>
                    </div>
                    <span className="pillar-owner">{pillar.owner}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="activity-section" id="actividades" aria-label="Actividades destacadas">
          <div className="section-heading">
            <span className="eyebrow">Actividades destacadas</span>
            <h2>Seguimiento de acciones clave</h2>
            <p>Un vistazo público a actividades representativas del tablero y su estado de avance.</p>
          </div>

          <div className="activity-table" role="table" aria-label="Tabla de actividades destacadas">
            <div className="activity-table__head" role="row">
              <span>Actividad</span>
              <span>Pilar</span>
              <span>Responsable</span>
              <span>Estado</span>
              <span>Avance</span>
            </div>

            {activities.map((activity) => (
              <article className="activity-row" key={`${activity.title}-${activity.pillar}`} role="row">
                <div className="activity-row__title">
                  <strong>{activity.title}</strong>
                  <span>Vence {activity.due}</span>
                </div>
                <span>{activity.pillar}</span>
                <span>{activity.owner}</span>
                <span className={`status-badge status-badge--${activity.status}`}>{activity.status}</span>
                <div className="activity-progress">
                  <div className="activity-progress__bar">
                    <div className="activity-progress__fill" style={{ width: `${activity.progress}%` }} />
                  </div>
                  <span>{activity.progress}%</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="dashboard-footer">
        <div className="dashboard-footer__inner">
          <div>
            <strong>Tablero PDI</strong>
            <p>Seguimiento público del avance global y por pilar.</p>
          </div>
          <p>Actualizado al {updateLabel}.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
