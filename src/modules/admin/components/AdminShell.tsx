/* =============================================================================
   Esqueleto de la administración.
   Las pantallas internas repetían su propia barra lateral, su propia cabecera y
   su propio pie de guardado. Aquí viven una sola vez, y además es donde se
   decide qué entradas del menú ve cada rol.
   ========================================================================== */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { useTheme } from "../../../lib/theme";
import { roleLabels, useAuth } from "../../../lib/auth";
import type { AppRole } from "../../../types/database";
import "../admin.css";

export type AdminSection = "pillars" | "parameters" | "development" | "users" | "repository";

const navigation: {
  id: AdminSection;
  label: string;
  icon: IconName;
  to: string;
  /** Rol mínimo para ver la entrada. */
  minimum: AppRole;
}[] = [
  { id: "pillars", label: "Gestión de pilares", icon: "grid", to: "/admin/pilares", minimum: "consulta" },
  { id: "parameters", label: "Parámetros globales", icon: "settings", to: "/admin/parametros", minimum: "consulta" },
  { id: "development", label: "Desarrollo tecnológico", icon: "code", to: "/admin/desarrollo", minimum: "consulta" },
  { id: "users", label: "Usuarios y roles", icon: "user", to: "/admin/usuarios", minimum: "admin" },
  { id: "repository", label: "Repositorio", icon: "document", to: "/implementacion#repositorio", minimum: "consulta" },
];

interface AdminShellProps {
  section: AdminSection;
  kicker: string;
  title: string;
  description?: string;
  /** Botonera de la cabecera. */
  actions?: ReactNode;
  /** Barra fija inferior de guardado. */
  footer?: ReactNode;
  children: ReactNode;
}

export function AdminShell({
  section,
  kicker,
  title,
  description,
  actions,
  footer,
  children,
}: AdminShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const { resolved, toggle } = useTheme();
  const { profile, signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `${title} | Intranet PDI`;
    return () => {
      document.title = "PDI 2024-2028 | Universidad de Santander";
    };
  }, [title]);

  async function handleSignOut() {
    await signOut();
    navigate("/acceso-intranet", { replace: true });
  }

  return (
    <div className={`admin-shell${navOpen ? " nav-open" : ""}`}>
      <a className="skip-link" href="#admin-contenido">
        Saltar al contenido
      </a>

      <aside className="admin-sidebar" id="admin-nav">
        <Link className="admin-brand" to="/admin/pilares">
          <img src="/logo-udes.svg" alt="" width={95} height={34} />
          <span>
            <strong>Intranet PDI</strong>
            <small>Planeación institucional</small>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="Navegación administrativa">
          {navigation
            .filter((item) => hasRole(item.minimum))
            .map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                className={item.id === section ? "is-active" : ""}
                aria-current={item.id === section ? "page" : undefined}
                onClick={() => setNavOpen(false)}
              >
                <Icon name={item.icon} size={17} />
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="admin-sidebar__foot">
          {profile && (
            <div className="admin-identity">
              <span className="admin-identity__name">{profile.full_name || profile.email}</span>
              <span className="admin-identity__role">{roleLabels[profile.role]}</span>
            </div>
          )}

          <Link to="/">
            <Icon name="external" size={16} />
            Ver portal público
          </Link>
          <a href="mailto:planeacion@udes.edu.co">
            <Icon name="document" size={16} />
            Ayuda
          </a>
          <button type="button" onClick={handleSignOut}>
            <Icon name="arrow-left" size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Capa que cierra el menú en móvil sin robar el foco al contenido. */}
      {navOpen && (
        <button
          className="admin-scrim"
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="admin-body">
        <header className="admin-topbar">
          <button
            className="icon-button admin-nav-toggle"
            type="button"
            aria-expanded={navOpen}
            aria-controls="admin-nav"
            aria-label={navOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setNavOpen((open) => !open)}
          >
            <Icon name={navOpen ? "close" : "menu"} size={18} />
          </button>

          <div className="admin-topbar__copy">
            <span className="admin-kicker">{kicker}</span>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>

          <div className="admin-topbar__actions">
            {actions}
            <button
              className="icon-button theme-toggle"
              type="button"
              onClick={toggle}
              aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
            </button>
          </div>
        </header>

        <main className="admin-main" id="admin-contenido">
          {children}
        </main>

        {footer && <footer className="admin-savebar">{footer}</footer>}
      </div>
    </div>
  );
}

/** Aviso reutilizable para quien solo puede leer. */
export function ReadOnlyNotice() {
  return (
    <p className="admin-readonly" role="note">
      <Icon name="lock" size={15} />
      Tu rol permite consultar esta información, no modificarla.
    </p>
  );
}
