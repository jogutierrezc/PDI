/* =============================================================================
   Portal de Planeación Institucional · marco.

   La barra unificada (SiteHeader, la misma del PDI, UDES en Cifras y el
   Observatorio) y el pie propio de la oficina. En la portada, la lupa de la
   barra y Ctrl/Cmd + K llevan al buscador sin cambiar de página.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../components/layout/SiteHeader";
import { OFFICE } from "./content";
import "./planeacion.css";

export function PlanLayout({ title, children, onSearch }: { title: string; children: ReactNode; onSearch?: () => void }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="pl-page">
      <a className="skip-link" href="#pl-contenido">
        Saltar al contenido
      </a>
      <SiteHeader onSearch={onSearch} />

      <main id="pl-contenido">{children}</main>

      <footer className="pl-footer">
        <div className="pl-container pl-footer__grid">
          <div className="pl-footer__brand">
            <img src="/logo-udes.svg" alt="Universidad de Santander" width={112} height={40} />
            <strong>{OFFICE.name}</strong>
            {OFFICE.address && <span>{OFFICE.address}</span>}
            <a href={`mailto:${OFFICE.email}`}>{OFFICE.email}</a>
          </div>
          <nav aria-label="Portales">
            <strong>Portales</strong>
            <Link to="/pdi">Portal PDI</Link>
            <Link to="/datos-abiertos">UDES en Cifras</Link>
            <Link to="/datos-abiertos/observatorio">Observatorio</Link>
            <Link to="/datos-abiertos/boletines">Boletines</Link>
          </nav>
          <nav aria-label="La oficina">
            <strong>La oficina</strong>
            <Link to="/equipo">Nuestro equipo</Link>
            <Link to="/implementacion#repositorio">Documentos</Link>
            <Link to="/desarrollo-tecnologico">Desarrollo tecnológico</Link>
            <Link to="/acceso-intranet">Intranet</Link>
          </nav>
          <small className="pl-footer__legal">
            © {new Date().getFullYear()} {OFFICE.university} · {OFFICE.name}
          </small>
        </div>
      </footer>
    </div>
  );
}
