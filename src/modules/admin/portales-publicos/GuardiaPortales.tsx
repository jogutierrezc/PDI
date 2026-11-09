/* =============================================================================
   Portales públicos · la guardia de las rutas del sitio.

   Envuelve todas las rutas de App.tsx. Si la ruta cae en un portal que la
   administración deshabilitó:
     · el público ve la página de mantenimiento (y no se indexa);
     · la administración sigue viendo el portal, con una franja que lo avisa.
   Nunca toca /admin, el ingreso a la intranet ni «Sin permiso»: así nadie se
   queda fuera de la herramienta que lo vuelve a abrir.

   Falla abierta y sin esperas: mientras no hay respuesta del servidor, el
   estado es «todo abierto» y la página se pinta igual. Solo si el portal ya se
   sabe cerrado (respuesta o recuerdo del navegador) y todavía se está
   resolviendo la sesión, se espera un instante para no mostrar mantenimiento a
   un administrador.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { Icon } from "../../../components/ui/Icon";
import { UdesLogo } from "../../../components/layout/UdesLogo";
import { esMarcoInsertado, portalDeRuta, useEstadoPublico } from "./estado";
import type { PortalEstado } from "./estado";
import "./publico.css";

/** Rutas que ningún portal puede cerrar. */
const SIEMPRE_ABIERTAS = /^\/(admin|acceso-intranet|sin-permiso)(\/|$)/;

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "short", timeZone: "America/Bogota" });

export const MENSAJE_PREDETERMINADO = "Estamos haciendo ajustes y este portal no está disponible por ahora. Gracias por su paciencia.";

export function GuardiaPortales({ children }: { children: ReactNode }) {
  const estado = useEstadoPublico();
  const { pathname } = useLocation();
  const { loading, profile, hasRole } = useAuth();

  if (SIEMPRE_ABIERTAS.test(pathname)) return <>{children}</>;
  const portal = portalDeRuta(estado, pathname);
  if (!portal || portal.habilitado) return <>{children}</>;

  if (loading) {
    return (
      <div className="route-fallback" role="status" aria-live="polite">
        <span className="route-fallback__spinner" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }

  if (profile && hasRole("admin")) {
    return (
      <>
        {children}
        <FranjaDeshabilitado portal={portal} />
      </>
    );
  }

  const planeacionAbierta = estado.portales.find((p) => p.slug === "planeacion")?.habilitado !== false;
  return <Mantenimiento portal={portal} compacto={esMarcoInsertado(pathname)} enlazarPortada={portal.slug !== "planeacion" && planeacionAbierta} />;
}

/** Lo que ve la administración sobre un portal cerrado al público. */
function FranjaDeshabilitado({ portal }: { portal: PortalEstado }) {
  return (
    <div className="ppu-franja" role="status">
      <Icon name="eye-off" size={18} />
      <span>
        <strong>Deshabilitado para el público.</strong> Usted lo ve porque es administrador; las demás personas ven la página de mantenimiento.
      </span>
      <Link to="/admin/portales-publicos" state={{ portal: portal.slug }}>
        Administrar portales
      </Link>
    </div>
  );
}

/** La página de mantenimiento. Con `compacto`, la versión corta para los marcos que otros portales incrustan. */
export function Mantenimiento({
  portal,
  nombre,
  mensaje,
  regreso,
  compacto = false,
  enlazarPortada = true,
  vistaPrevia = false,
}: {
  portal?: PortalEstado;
  nombre?: string;
  mensaje?: string;
  regreso?: string | null;
  compacto?: boolean;
  enlazarPortada?: boolean;
  /** En la pantalla de administración: sin `noindex` ni título propio, porque no es la página real. */
  vistaPrevia?: boolean;
}) {
  const texto = (mensaje ?? portal?.mensaje ?? "").trim() || MENSAJE_PREDETERMINADO;
  const cuando = regreso ?? portal?.regreso ?? null;
  const fecha = cuando && new Date(cuando).getTime() > Date.now() ? FECHA.format(new Date(cuando)) : null;
  const titulo = nombre ?? "Este portal";

  // Mientras se muestra la página de mantenimiento, no se indexa.
  useEffect(() => {
    if (vistaPrevia) return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    const anterior = document.title;
    document.title = `Portal en mantenimiento · Universidad de Santander`;
    return () => {
      meta.remove();
      document.title = anterior;
    };
  }, [vistaPrevia]);

  const Raiz = vistaPrevia ? "div" : "main";
  return (
    <Raiz className="ppu-mant" data-compacto={compacto || undefined} {...(vistaPrevia ? {} : { id: "contenido" })}>
      <div className="ppu-mant__caja">
        {!compacto && <UdesLogo height={40} />}
        <span className="ppu-mant__icono" aria-hidden="true">
          <Icon name="settings" size={compacto ? 22 : 30} />
        </span>
        <h1>{compacto ? "No disponible por ahora" : `${titulo} está en mantenimiento`}</h1>
        <p className="ppu-mant__texto">{texto}</p>
        {fecha && (
          <p className="ppu-mant__regreso">
            <Icon name="clock" size={16} /> Volvemos el <strong>{fecha}</strong>
          </p>
        )}
        {!compacto && (
          <nav className="ppu-mant__enlaces" aria-label="Otras páginas">
            {enlazarPortada && (
              <Link className="button-primary" to="/">
                Ir a la portada de Planeación
              </Link>
            )}
            <Link className="button-secondary" to="/acceso-intranet">
              Acceso de la intranet
            </Link>
          </nav>
        )}
      </div>
    </Raiz>
  );
}
