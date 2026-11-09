import { Link } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { Icon } from "../components/ui/Icon";
import { usePillars } from "../data/queries";
import { accentFor } from "../data/pdi";
import { roleLabels, useAuth } from "../lib/auth";
import { EscenaError } from "../modules/errores/EscenaError";

export function NotFound() {
  return (
    <PublicLayout className="notfound-page">
      <section className="u-container notfound-escena">
        <EscenaError codigo="404" />
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
      <section className="u-container notfound-escena">
        <EscenaError
          codigo="403"
          titulo="No tienes permiso para esta sección"
          mensaje={
            profile
              ? `Tu rol de acceso no incluye esta pantalla (capacidad: ${roleLabels[profile.role]}). Si necesitas entrar, pide a un administrador que la añada a tu rol.`
              : "Inicia sesión con una cuenta autorizada para continuar."
          }
          acciones={[
            { texto: "Ir a lo que sí puedo ver", a: home, tipo: "pri" },
            { texto: "Volver al portal público", a: "/", tipo: "sec" },
          ]}
        />
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
