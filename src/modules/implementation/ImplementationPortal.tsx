import { TopBar } from "../../components/layout/TopBar";
import "./implementation.css";

interface Pillar {
  slug: string;
  title: string;
  description: string;
  status: string;
  statusClass: string;
  progress: number;
  projects: string;
  icon: string;
}

const pillars: Pillar[] = [
  { slug: "personalizacion", title: "Personalización", description: "Enfoque humano y adaptación a las necesidades de la comunidad.", status: "En progreso", statusClass: "progress", progress: 75, projects: "12 de 15 proyectos finalizados", icon: "✦" },
  { slug: "ambiente-tecnologico", title: "Ambiente tecnológico", description: "Infraestructura y digitalización de procesos institucionales.", status: "Atención requerida", statusClass: "warning", progress: 45, projects: "9 de 20 proyectos finalizados", icon: "⌘" },
  { slug: "entorno-emprendedor", title: "Entorno emprendedor", description: "Fomento a la innovación y el espíritu emprendedor.", status: "En progreso", statusClass: "progress", progress: 60, projects: "6 de 10 proyectos finalizados", icon: "↗" },
  { slug: "gobernanza", title: "Gobernanza", description: "Estructura para el buen gobierno y orden institucional.", status: "Completado", statusClass: "complete", progress: 100, projects: "8 de 8 proyectos finalizados", icon: "◈" },
  { slug: "sostenibilidad", title: "Sostenibilidad", description: "Cuidado ambiental, equilibrio económico y responsabilidad social.", status: "En progreso", statusClass: "progress", progress: 82, projects: "14 de 17 proyectos finalizados", icon: "♧" },
  { slug: "apropiacion-social", title: "Apropiación social", description: "Comunidad, conocimiento compartido y vinculación con el medio.", status: "Inicio reciente", statusClass: "recent", progress: 25, projects: "3 de 12 proyectos finalizados", icon: "◎" },
];

export function ImplementationPortal() {
  return (
    <div className="implementation-portal">
      <TopBar activeSection="implementation" />

      <main className="implementation-main" id="estrategia">
        <section className="implementation-intro">
          <h1>Implementación del PDI</h1>
          <div className="implementation-intro__bottom"><p>Visión global del estado de avance de los pilares estratégicos institucionales. Supervisión de proyectos e indicadores clave de desempeño.</p><div className="global-progress"><div className="progress-ring" style={{ "--progress": "68%" } as React.CSSProperties}><strong>68%</strong></div><div><span>Avance global</span><b>En curso</b></div></div></div>
        </section>

        <section className="implementation-grid" id="indicadores" aria-label="Pilares estratégicos y avance">
          {pillars.map((pillar) => <article className="implementation-card" key={pillar.title}><div className="implementation-card__top"><div className="implementation-card__icon">{pillar.icon}</div><span className={`implementation-status ${pillar.statusClass}`}>{pillar.status}</span></div><h2>{pillar.title}</h2><p className="implementation-card__description">{pillar.description}</p><div className="implementation-card__progress"><div className="progress-label"><span>Progreso</span><b>{pillar.progress}%</b></div><div className="progress-bar"><span style={{ width: `${pillar.progress}%` }} /></div></div><p className="implementation-card__projects">{pillar.projects}</p><a className="implementation-detail" href={`/implementacion/pilar/${pillar.slug}`}>Ver detalle <span>→</span></a></article>)}
        </section>
      </main>

      <footer className="implementation-footer" id="reportes"><div><a href="/"><span className="implementation-brand__mark">UDES</span> Digital Curator</a><p>© 2024 Portal de Implementación PDI. Todos los derechos reservados.</p></div><nav><a href="#estrategia">Transparencia</a><a href="#estrategia">Protección de datos</a><a href="#estrategia">Mapa del sitio</a><a href="#estrategia">Contacto institucional</a></nav></footer>
    </div>
  );
}
