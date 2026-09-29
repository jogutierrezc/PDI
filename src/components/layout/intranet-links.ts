/* =============================================================================
   Los accesos a la intranet de quien tiene sesión.

   El menú de la persona (escritorio) y el cajón móvil enseñan lo mismo: las
   pantallas que esa persona sí puede abrir, en el orden del menú de la
   intranet. Se decide con canSee(), el mismo espejo de has_screen() que usa
   la intranet para su menú; así la barra nunca ofrece una puerta que luego
   se cierra en «Sin permiso».

   Antes el botón «Intranet» llevaba a /admin, una ruta que no existía.
   ========================================================================== */

import { useAuth, SCREEN_PATHS } from "../../lib/auth";
import type { IconName } from "../ui/Icon";
import type { AdminScreen } from "../../types/database";

export interface IntranetLink {
  screen: AdminScreen;
  label: string;
  icon: IconName;
  to: string;
}

/** Las pantallas en el orden del menú de la intranet (AdminShell). */
const SCREENS: { screen: AdminScreen; label: string; icon: IconName }[] = [
  { screen: "office", label: "Página de la oficina", icon: "document" },
  { screen: "documents", label: "Documentos", icon: "layers" },
  { screen: "pillars", label: "Gestión de pilares", icon: "grid" },
  { screen: "projects", label: "Proyectos", icon: "columns" },
  { screen: "faculties", label: "PDI por facultad", icon: "community" },
  { screen: "campus", label: "PDI por campus", icon: "pin" },
  { screen: "budget", label: "Presupuesto", icon: "chart" },
  { screen: "repository", label: "Repositorio", icon: "document" },
  { screen: "cifras", label: "UDES en Cifras", icon: "table" },
  { screen: "observatorio", label: "Observatorio", icon: "spark-chart" },
  { screen: "impacto", label: "Indicadores de Impacto", icon: "spark-chart" },
  { screen: "tableros", label: "Mis Tableros", icon: "layers" },
  { screen: "reportes", label: "Reportes Institucionales", icon: "table" },
  { screen: "structure", label: "Normalizar estructura", icon: "settings" },
  { screen: "parameters", label: "Parámetros globales", icon: "settings" },
  { screen: "development", label: "Desarrollo tecnológico", icon: "code" },
  { screen: "users", label: "Usuarios y roles", icon: "user" },
  { screen: "pilo", label: "Mr. Pilo con IA", icon: "spark" },
  { screen: "transfer", label: "Traslado de datos", icon: "upload" },
];

export function useIntranetLinks(): { home: string | null; links: IntranetLink[] } {
  const { profile, canSee } = useAuth();
  if (!profile?.is_active) return { home: null, links: [] };
  const links = SCREENS.filter((s) => canSee(s.screen)).map((s) => ({ ...s, to: SCREEN_PATHS[s.screen] }));
  // «Ir a la intranet» abre el lanzador, que muestra justo esas pantallas.
  return { home: links.length ? "/admin" : null, links };
}
