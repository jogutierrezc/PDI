/* =============================================================================
   Esqueleto de la administración.
   Las pantallas internas repetían su propia barra lateral, su propia cabecera y
   su propio pie de guardado. Aquí viven una sola vez, y además es donde se
   decide qué entradas del menú ve cada rol.

   La intranet atiende dos portales —el Plan de Desarrollo y UDES en Cifras—
   más el mantenimiento del sistema, así que el menú se agrupa por portal. La
   cabecera lleva la ruta (portal › pantalla) en lugar de un rótulo suelto.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { useTheme } from "../../../lib/theme";
import { roleLabels, useAuth } from "../../../lib/auth";
import type { AppRole } from "../../../types/database";
import "../admin.css";

export type AdminSection =
  | "pillars"
  | "projects"
  | "faculties"
  | "campus"
  | "budget"
  | "structure"
  | "parameters"
  | "development"
  | "users"
  | "repository"
  | "cifras";

interface NavItem {
  id: AdminSection;
  label: string;
  icon: IconName;
  to: string;
  /** Rol mínimo para ver la entrada. */
  minimum: AppRole;
}

interface NavGroup {
  id: "pdi" | "cifras" | "sistema";
  label: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    id: "pdi",
    label: "Plan de Desarrollo",
    items: [
      { id: "pillars", label: "Gestión de pilares", icon: "grid", to: "/admin/pilares", minimum: "consulta" },
      // Los proyectos van justo después de los pilares y no dentro: son lo único
      // transversal del plan, uno puede apuntar a varios.
      { id: "projects", label: "Proyectos", icon: "columns", to: "/admin/proyectos", minimum: "consulta" },
      // Las facultades van pegadas a los proyectos porque responden a la otra mitad
      // de la misma pregunta: qué se está haciendo, y quién lo está empujando.
      { id: "faculties", label: "PDI por facultad", icon: "community", to: "/admin/facultades", minimum: "consulta" },
      { id: "campus", label: "PDI por campus", icon: "pin", to: "/admin/campus", minimum: "consulta" },
      // El presupuesto va detrás de los proyectos porque cuelga de ellos, y nunca
      // sale de aquí: no hay pantalla pública que lo muestre.
      { id: "budget", label: "Presupuesto", icon: "chart", to: "/admin/presupuesto", minimum: "consulta" },
      { id: "repository", label: "Repositorio", icon: "document", to: "/implementacion#repositorio", minimum: "consulta" },
    ],
  },
  {
    id: "cifras",
    label: "UDES en Cifras",
    items: [
      { id: "cifras", label: "Estaciones del periodo", icon: "table", to: "/admin/udes-en-cifras", minimum: "consulta" },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      // Mantenimiento del esquema, no gestión del plan: solo se entra cuando algo
      // hay que arreglar.
      { id: "structure", label: "Normalizar estructura", icon: "settings", to: "/admin/estructura", minimum: "consulta" },
      { id: "parameters", label: "Parámetros globales", icon: "settings", to: "/admin/parametros", minimum: "consulta" },
      { id: "development", label: "Desarrollo tecnológico", icon: "code", to: "/admin/desarrollo", minimum: "consulta" },
      { id: "users", label: "Usuarios y roles", icon: "user", to: "/admin/usuarios", minimum: "admin" },
    ],
  },
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
  const { profile, signOut, hasRole, canSee } = useAuth();
  const navigate = useNavigate();
  const group = navigation.find((g) => g.items.some((item) => item.id === section));
  const shellRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLElement>(null);

  // La cabecera es fija y su alto cambia con la descripción y el ancho. Las
  // cabeceras pegajosas de las pantallas (rejillas, listas) se colocan debajo
  // leyendo --admin-topbar-h.
  useEffect(() => {
    const shell = shellRef.current;
    const topbar = topbarRef.current;
    if (!shell || !topbar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      shell.style.setProperty("--admin-topbar-h", `${Math.round(topbar.getBoundingClientRect().height)}px`);
    });
    observer.observe(topbar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.title = `${title} | Intranet UDES`;
    return () => {
      document.title = "PDI 2024-2028 | Universidad de Santander";
    };
  }, [title]);

  async function handleSignOut() {
    await signOut();
    navigate("/acceso-intranet", { replace: true });
  }

  return (
    <div ref={shellRef} className={`admin-shell${navOpen ? " nav-open" : ""}`}>
      <a className="skip-link" href="#admin-contenido">
        Saltar al contenido
      </a>

      <aside className="admin-sidebar" id="admin-nav">
        <Link className="admin-brand" to="/admin/pilares">
          <img src="/logo-udes.svg" alt="" width={95} height={34} />
          <span>
            <strong>Intranet UDES</strong>
            <small>Planeación institucional</small>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="Navegación administrativa">
          {navigation.map((navGroup) => {
            // El rol de acceso decide qué pantallas se enseñan; el rol clásico, con
            // qué permiso se entra a ellas.
            const items = navGroup.items.filter((item) => hasRole(item.minimum) && canSee(item.id));
            if (items.length === 0) return null;
            return (
              <div className="admin-nav__group" key={navGroup.id}>
                <span className="admin-nav__group-label" id={`admin-nav-${navGroup.id}`}>
                  {navGroup.label}
                </span>
                <ul aria-labelledby={`admin-nav-${navGroup.id}`}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <NavLink
                        to={item.to}
                        className={item.id === section ? "is-active" : ""}
                        aria-current={item.id === section ? "page" : undefined}
                        onClick={() => setNavOpen(false)}
                      >
                        <Icon name={item.icon} size={17} />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
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
            Ver Portal PDI
          </Link>
          <Link to="/datos-abiertos">
            <Icon name="external" size={16} />
            Ver UDES en Cifras
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
        <header ref={topbarRef} className="admin-topbar">
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
            {/* Ruta: portal › pantalla. Sustituye al rótulo suelto sobre el título. */}
            <nav className="admin-crumbs" aria-label="Ruta">
              <ol>
                <li>{group?.label ?? kicker}</li>
                {group && group.id !== "cifras" && kicker && kicker !== group.label && <li>{kicker}</li>}
                <li aria-current="page">{title}</li>
              </ol>
            </nav>
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
