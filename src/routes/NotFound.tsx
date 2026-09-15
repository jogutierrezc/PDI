import { Link } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { Icon } from "../components/ui/Icon";
import { usePillars } from "../data/queries";
import { accentFor } from "../data/pdi";
import { roleLabels, useAuth } from "../lib/auth";

export function NotFound() {
  return (
    <PublicLayout className="notfound-page">
      <section className="u-container notfound">
        <span className="eyebrow">Error 404</span>
        <h1>Esta página no existe</h1>
        <p className="lede">
          El enlace puede estar desactualizado o la sección se movió. Desde aquí puedes volver al plan.
        </p>

        <div className="notfound__actions">
          <Link className="button-primary" to="/">
            Volver al inicio <span data-arrow aria-hidden="true">→</span>
          </Link>
          <Link className="button-secondary" to="/tablero">
            Ir al tablero PDI
          </Link>
        </div>

        <PillarShortcuts />
      </section>
    </PublicLayout>
  );
}

/**
 * Ruta interna sin permiso. Es distinta de un 404: la página existe, pero el
 * rol no alcanza. Decirlo así evita que alguien crea que el enlace está roto y
 * lo reporte como un fallo.
 */
export function Forbidden() {
  const { profile, home } = useAuth();

  return (
    <PublicLayout className="notfound-page">
      <section className="u-container notfound">
        <span className="eyebrow">Acceso restringido</span>
        <h1>No tienes permiso para esta sección</h1>
        <p className="lede">
          {profile
            ? `Tu rol de acceso no incluye esta pantalla (capacidad: ${roleLabels[profile.role]}). Si necesitas entrar, pide a un administrador que la añada a tu rol.`
            : "Inicia sesión con una cuenta autorizada para continuar."}
        </p>

        <div className="notfound__actions">
          <Link className="button-primary" to={home}>
            Ir a lo que sí puedo ver <span data-arrow aria-hidden="true">→</span>
          </Link>
          <Link className="button-secondary" to="/">
            Volver al portal público
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

function PillarShortcuts() {
  const pillars = usePillars();
  if (!pillars.data || pillars.data.length === 0) return null;

  return (
    <nav className="notfound__pillars" aria-label="Pilares estratégicos">
      <h2>O consulta un pilar</h2>
      <ul>
        {pillars.data.map((pillar) => (
          <li key={pillar.id}>
            <Link
              to={`/implementacion/pilar/${pillar.slug}`}
              style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}
            >
              <Icon name={pillar.icon} size={18} />
              {pillar.name}
              <span data-arrow aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
