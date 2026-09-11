import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { SearchDialog } from "../ui/SearchDialog";
import { useTheme } from "../../lib/theme";
import { prefetchProps } from "../../lib/prefetch";

const links = [
  { to: "/", label: "Inicio" },
  { to: "/implementacion", label: "Implementación del PDI" },
  { to: "/tablero", label: "Tablero PDI" },
  { to: "/ods", label: "PDI y los ODS" },
  { to: "/facultades", label: "PDI por facultad" },
  { to: "/campus", label: "PDI por campus" },
  { to: "/desarrollo-tecnologico", label: "Desarrollo tecnológico" },
];

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { resolved, toggle } = useTheme();

  // Cambiar de ruta cierra el menú: nadie espera encontrarlo abierto al llegar.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Escape y clic fuera cierran el menú móvil.
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!navRef.current?.contains(target) && !toggleRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  // Atajo global de búsqueda.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const isActiveLink = (to: string) => {
    const [path] = to.split("#");
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <header className="site-header">
        <NavLink className="brand-lockup" to="/" aria-label="Portal PDI, ir al inicio">
          <img
            className="brand-logo"
            src="/logo-udes.svg"
            alt=""
            width={95}
            height={34}
            decoding="async"
          />
          <span className="brand-title">
            PDI <strong>2024-2028</strong>
          </span>
        </NavLink>

        <nav
          ref={navRef}
          id="site-navigation"
          className={`site-navigation${menuOpen ? " is-open" : ""}`}
          aria-label="Navegación principal"
        >
          <div className="site-navigation__inner">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={isActiveLink(link.to) ? "active" : ""}
                aria-current={isActiveLink(link.to) ? "page" : undefined}
                {...prefetchProps(link.to)}
              >
                {link.label}
              </NavLink>
            ))}

            {/* En móvil el botón de la cabecera se oculta por espacio; sin este
                enlace no quedaría forma de llegar a la intranet. */}
            <NavLink to="/acceso-intranet" className="site-navigation__intranet">
              Acceso intranet
            </NavLink>
          </div>
        </nav>

        <div className="header-actions">
          <button
            className="search-trigger"
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar en el portal"
          >
            <Icon name="search" size={16} />
            <span className="search-trigger__label">Buscar</span>
            <kbd className="search-trigger__kbd">Ctrl K</kbd>
          </button>

          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={toggle}
            aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            title={resolved === "dark" ? "Tema claro" : "Tema oscuro"}
          >
            <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
          </button>

          <NavLink className="button-primary" to="/acceso-intranet" {...prefetchProps("/acceso-intranet")}>
            Acceso intranet
          </NavLink>

          <button
            ref={toggleRef}
            className="icon-button menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={18} />
          </button>
        </div>
      </header>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
