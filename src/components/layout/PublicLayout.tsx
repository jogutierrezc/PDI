import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "./TopBar";
import { useCurrentPeriod } from "../../data/queries";
import { formatDate } from "../../data/pdi";

interface PublicLayoutProps {
  children: ReactNode;
  /** Clase de la página, para los fondos propios de cada vista. */
  className?: string;
}

export function PublicLayout({ children, className = "" }: PublicLayoutProps) {
  return (
    <div className={`page ${className}`.trim()}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <TopBar />
      <main id="contenido">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  const period = useCurrentPeriod();

  return (
    <footer className="site-footer" id="pie">
      <div className="u-container site-footer__inner">
        <div className="site-footer__brand">
          <strong>Universidad de Santander</strong>
          <span>Plan de Desarrollo Institucional 2024-2028</span>
          {/* La fecha sale del corte vigente, no de una constante en el código:
              publicar un corte nuevo la actualiza en todo el portal. */}
          {period.data && <span>Datos actualizados al {formatDate(period.data.cutoff_date)}.</span>}
        </div>

        <nav aria-label="Enlaces del pie de página">
          <Link to="/tablero">Tablero PDI</Link>
          <Link to="/implementacion">Implementación</Link>
          <Link to="/ods">PDI y los ODS</Link>
          <Link to="/facultades">PDI por facultad</Link>
          <Link to="/implementacion#repositorio">Repositorio</Link>
          <Link to="/datos-abiertos">UDES en Cifras</Link>
          <a href="mailto:planeacion@udes.edu.co">Contacto</a>
        </nav>

        <small className="site-footer__legal">
          © 2024-2026 Universidad de Santander · Oficina de Planeación Institucional. Todos los derechos
          reservados.
        </small>
      </div>
    </footer>
  );
}
