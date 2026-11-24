/* =============================================================================
   Logotipo de la Universidad de Santander, sin placa.

   El logo oficial está dibujado para fondo claro (azul #014898). En oscuro se
   cambia por su versión clara en vez de encerrarlo en una caja blanca: las dos
   imágenes existen siempre y el tema decide cuál se ve (udes-logo.css).
   ========================================================================== */

import "./udes-logo.css";

interface UdesLogoProps {
  /** Alto en píxeles; el ancho sigue la proporción del logo (398,6 × 142,9). */
  height?: number;
  className?: string;
  decorative?: boolean;
}

export function UdesLogo({ height = 36, className = "", decorative = false }: UdesLogoProps) {
  const width = Math.round((height * 398.6) / 142.9);
  const style = { "--logo-h": `${height}px` } as React.CSSProperties;
  return (
    <span className={`udes-logo ${className}`.trim()} style={style}>
      <img className="udes-logo__light" src="/logo-udes.svg" alt={decorative ? "" : "Universidad de Santander"} width={width} height={height} decoding="async" />
      <img className="udes-logo__dark" src="/logo-udes-oscuro.svg" alt="" aria-hidden="true" width={width} height={height} decoding="async" />
    </span>
  );
}
