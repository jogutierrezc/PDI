import { useState } from "react";

export type TopBarSection = "home" | "implementation" | "dashboard";

interface TopBarProps {
  activeSection: TopBarSection;
}

export function TopBar({ activeSection }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <a className="brand-lockup" href="/#inicio" aria-label="Inicio del PDI">
        <img className="brand-logo" src="/logo-udes.svg" alt="Universidad de Santander" />
        <span className="brand-title">PDI <strong>2024-2028</strong></span>
      </a>

      <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen((open) => !open)}>
        <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        <span className="sr-only">Abrir menú</span>
      </button>

      <nav id="site-navigation" className={`site-navigation${menuOpen ? " is-open" : ""}`} aria-label="Navegación principal">
        <a className={activeSection === "home" ? "active" : ""} href="/#inicio" onClick={closeMenu}>Inicio</a>
        <a className={activeSection === "implementation" ? "active" : ""} href="/implementacion" onClick={closeMenu}>Implementación del PDI</a>
        <a className={activeSection === "dashboard" ? "active" : ""} href="/tablero" onClick={closeMenu}>Tablero PDI</a>
        <a href="/#repositorio" onClick={closeMenu}>Repositorio</a>
      </nav>

      <div className="header-actions">
        <button className="search-button" type="button" aria-label="Buscar en el portal"><span aria-hidden="true">⌕</span> Buscar</button>
        <a className="primary-button primary-button--small" href="/acceso-intranet">Acceso intranet</a>
      </div>
    </header>
  );
}
