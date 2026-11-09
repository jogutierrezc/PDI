/* =============================================================================
   Portales públicos · el vínculo del menú con sus sobreescrituras.

   <EnlaceMenu clave="menu.nav.boletines" etiqueta="Boletines" to="/datos-abiertos/boletines">
   devuelve `null` si la administración lo ocultó (o si lleva a un portal
   deshabilitado) y, si no, el vínculo con la etiqueta y el destino vigentes.
   Un destino https:// externo abre en la misma pestaña con rel="noopener
   noreferrer"; una ruta interna que el router no conoce navega igual (cae en
   «No encontrada»), nunca rompe la página.
   ========================================================================== */

import type { ComponentProps, ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { esExterno, useMenuPublico } from "./estado";

type PropsLink = Omit<ComponentProps<typeof Link>, "to" | "children">;

interface Props extends PropsLink {
  clave: string;
  /** La etiqueta que trae el código. */
  etiqueta: string;
  /** El destino que trae el código. */
  to: string;
  /** Usa NavLink (marca la ruta actual). */
  nav?: boolean;
  end?: boolean;
  /** Pinta el contenido con la etiqueta vigente; sin esto, solo la etiqueta. */
  children?: (etiqueta: string) => ReactNode;
}

/** Un destino ya resuelto: interno con Link, externo con <a rel="noopener noreferrer">. */
export function Destino({ to, nav, end, children, className, ...rest }: PropsLink & { to: string; nav?: boolean; end?: boolean; children: ReactNode }) {
  if (esExterno(to)) {
    // De las propiedades de Link, un <a> externo solo conserva las que le sirven.
    const { onClick, style, title } = rest as PropsLink;
    return (
      <a
        href={to}
        className={typeof className === "string" ? className : undefined}
        rel="noopener noreferrer"
        onClick={onClick as never}
        style={style}
        title={title}
        aria-label={(rest as { "aria-label"?: string })["aria-label"]}
      >
        {children}
      </a>
    );
  }
  if (nav) {
    return (
      <NavLink to={to} end={end} className={className as string | undefined} {...(rest as object)}>
        {children}
      </NavLink>
    );
  }
  return (
    <Link to={to} className={className} {...rest}>
      {children}
    </Link>
  );
}

export function EnlaceMenu({ clave, etiqueta, to, nav, end, children, ...rest }: Props) {
  const { aplicar } = useMenuPublico();
  const v = aplicar(clave, { etiqueta, destino: to });
  if (!v || !v.destino) return null;
  return (
    <Destino to={v.destino} nav={nav} end={end} {...rest}>
      {children ? children(v.etiqueta) : v.etiqueta}
    </Destino>
  );
}
