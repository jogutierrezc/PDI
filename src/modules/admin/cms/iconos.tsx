/* =============================================================================
   CMS Portales · íconos que el set del portal (components/ui/Icon.tsx) no trae.

   Misma rejilla de 24, trazo de 1.75 y remates redondos que el set compartido,
   para que se lean como una sola familia. Solo viven aquí los que el editor
   necesita y el portal no usa en otro lado.
   ========================================================================== */

import type { SVGProps } from "react";

export type NombreIconoCms = "undo" | "redo" | "escritorio" | "tableta" | "telefono" | "copiar" | "movimiento" | "ajustes" | "bloques" | "pagina";

const trazos: Record<NombreIconoCms, JSX.Element> = {
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  escritorio: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  tableta: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  telefono: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 19h2" />
    </>
  ),
  copiar: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  movimiento: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  ajustes: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  bloques: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  pagina: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
};

export function IconoCms({ name, size = 16, ...rest }: { name: NombreIconoCms; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {trazos[name]}
    </svg>
  );
}
