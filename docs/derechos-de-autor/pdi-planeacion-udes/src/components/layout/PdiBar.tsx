/* =============================================================================
   Barra de contexto del Plan de Desarrollo.

   Bajo la barra unificada, en Implementación, Tablero, PDI por facultad y PDI
   por campus (y en las fichas de pilar y de facultad):
   · Regresar: al índice de la vista en la que se está (todos los pilares,
     todas las facultades) o, desde un índice, al Portal PDI.
   · Ver el plan en: Implementación, Tablero, Por facultad, Por campus. Si se
     está mirando un pilar, Implementación y Tablero conservan ese pilar.
   · Pilares: los seis, con su color, su código y su avance; llevan a la
     ficha del pilar en la vista actual (Tablero o Implementación).
   ========================================================================== */

import { useLocation } from "react-router-dom";
import { usePillars } from "../../data/queries";
import { formatValue } from "../../modules/datos-abiertos/data/open-data";
import { ContextBar } from "./ContextBar";

type View = "implementacion" | "tablero" | "facultades" | "campus";

const VIEWS: { id: View; label: string; to: string }[] = [
  { id: "implementacion", label: "Implementación", to: "/implementacion" },
  { id: "tablero", label: "Tablero", to: "/tablero" },
  { id: "facultades", label: "Por facultad", to: "/facultades" },
  { id: "campus", label: "Por campus", to: "/campus" },
];

/** En qué vista y en qué pilar (o facultad) se está, leído de la ruta. */
function readContext(pathname: string): { view: View; pillar: string | null; detail: boolean } | null {
  const pillar = pathname.match(/^\/(implementacion|tablero)\/pilar\/([^/]+)/);
  if (pillar) return { view: pillar[1] as View, pillar: pillar[2], detail: true };
  if (/^\/implementacion\/?$/.test(pathname)) return { view: "implementacion", pillar: null, detail: false };
  if (/^\/tablero\/?$/.test(pathname)) return { view: "tablero", pillar: null, detail: false };
  if (/^\/facultades\/[^/]+/.test(pathname)) return { view: "facultades", pillar: null, detail: true };
  if (/^\/facultades\/?$/.test(pathname)) return { view: "facultades", pillar: null, detail: false };
  if (/^\/campus\/?$/.test(pathname)) return { view: "campus", pillar: null, detail: false };
  return null;
}

export function PdiBar() {
  const { pathname } = useLocation();
  const context = readContext(pathname);
  const pillars = usePillars();
  if (!context) return null;

  const back =
    context.detail && context.view === "facultades"
      ? { to: "/facultades", label: "Todas las facultades" }
      : context.detail
        ? { to: context.view === "tablero" ? "/tablero#pilares" : "/implementacion", label: "Todos los pilares" }
        : { to: "/pdi", label: "Portal PDI" };

  // Implementación y Tablero conservan el pilar; las otras vistas no son por pilar.
  const views = VIEWS.map((v) => ({
    label: v.label,
    to: context.pillar && (v.id === "implementacion" || v.id === "tablero") ? `/${v.id}/pilar/${context.pillar}` : v.to,
    current: context.view === v.id,
  }));
  const base = context.view === "tablero" ? "/tablero/pilar" : "/implementacion/pilar";

  return (
    <ContextBar
      label="Navegación del Plan de Desarrollo"
      back={back}
      viewsLabel="Ver el plan en"
      views={views}
      itemsLabel="Pilares"
      items={(pillars.data ?? []).map((p) => {
        const current = p.slug === context.pillar;
        return {
          key: p.id,
          to: `${base}/${p.slug}`,
          code: `P${p.position || p.numeral}`,
          name: p.name,
          tone: `var(--pillar-${p.accent_slot})`,
          current,
          fill: p.progress.progress,
          label: `${current ? "Estás en" : "Abrir"} · ${p.name} · ${formatValue(p.progress.progress, "decimal")} % de avance`,
        };
      })}
    />
  );
}
