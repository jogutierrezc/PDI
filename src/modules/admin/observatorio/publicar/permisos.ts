/* =============================================================================
   Observatorio · permisos del módulo (0231), el espejo de la base.

   Acceso efectivo = panel marcado en el rol Y (alcance «todos» O persona
   asignada al observatorio), dentro del nivel del rol. La base lo hace cumplir
   (obs_tiene_panel / obs_nivel / obs_puede); esto solo decide qué mostrar u ocultar.
   `permisosObservatorio` es pura (se usa en el taller y en O2);
   `usePermisosObservatorio` la alimenta con la sesión y las asignaciones.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../../lib/auth";
import type { AccessScope } from "../../../../lib/auth";
import { supabase } from "../../../../lib/supabase";
import type { AdminScreen, ObsNivel, Profile } from "../../../../types/database";

export type ObsPanel = Extract<AdminScreen, "observatorio" | "obs_captura" | "obs_diseno" | "obs_tableros" | "obs_boletin" | "obs_observatorios" | "obs_insertar">;

/** Los paneles, con lo que hace cada uno (la misma pista que ve quien edita roles). */
export const OBS_PANELS: { id: ObsPanel; label: string; hint: string; nuevo?: boolean }[] = [
  { id: "obs_captura", label: "Captura de datos", hint: "Importar, analizar y anonimizar las tablas de cada tema" },
  { id: "obs_diseno", label: "Diseño visual", hint: "Armar los visores (gráficas) sobre las tablas" },
  { id: "obs_tableros", label: "Tableros", hint: "Tipo de informe de cada tema; publicar o despublicar" },
  { id: "obs_boletin", label: "Boletín", hint: "El PDF del Observatorio por temas, años y fuentes" },
  { id: "obs_observatorios", label: "Observatorios", hint: "Crear y organizar observatorios, temas y líneas; asignar personas responsables", nuevo: true },
  { id: "obs_insertar", label: "Insertar y publicar", hint: "Generar el código para otras páginas, administrar dominios y ver el registro", nuevo: true },
];

const RANK: Record<ObsNivel, number> = { none: 0, ver: 1, editar: 2, administrar: 3 };
const NUEVOS: ObsPanel[] = ["obs_observatorios", "obs_insertar"];

export interface PermisosObservatorio {
  /** Nivel efectivo en el módulo (none si no tiene la entrada). */
  nivel: ObsNivel;
  /** Alcance «todos los observatorios» (o sin rol de acceso, o administración). */
  todos: boolean;
  /** Observatorios donde figura como persona responsable. */
  asignados: string[];
  /** ¿Tiene el panel (y alcanza el observatorio, si se indica)? Espeja obs_tiene_panel(). */
  tiene: (panel: ObsPanel, obsId?: string | null) => boolean;
  /** ¿Puede al menos este nivel en el panel y observatorio? Espeja obs_puede(). */
  puede: (panel: ObsPanel, obsId: string | null, minimo: Exclude<ObsNivel, "none">) => boolean;
}

export function permisosObservatorio(profile: Profile | null, access: AccessScope | null, asignados: string[] = []): PermisosObservatorio {
  const activo = Boolean(profile?.is_active);
  const rol = profile?.role;
  const admin = activo && rol === "admin";
  const role = access?.role;
  const entrada = !role || role.all_screens || role.screens.includes("observatorio");
  let nivel: ObsNivel = "none";
  if (activo && entrada) {
    if (admin) nivel = "administrar";
    else if (!role) nivel = rol === "planeacion" ? "editar" : "ver";
    else {
      const guardado: ObsNivel = role.obs_nivel && role.obs_nivel !== "none" ? role.obs_nivel : role.base_role === "admin" ? "administrar" : role.base_role === "planeacion" ? "editar" : "ver";
      // Editar y administrar piden capacidad de Planeación, como la base.
      nivel = (guardado === "editar" || guardado === "administrar") && rol !== "planeacion" && rol !== "admin" ? "ver" : guardado;
    }
  }
  const todos = admin || !role || role.all_obs !== false;
  const tiene = (panel: ObsPanel, obsId: string | null = null) => {
    if (nivel === "none") return false;
    if (admin) return true;
    if (panel === "observatorio") return true;
    if (!role) return !NUEVOS.includes(panel);
    const marcado = NUEVOS.includes(panel) ? role.screens.includes(panel) : role.all_screens || role.screens.includes(panel);
    return marcado && (obsId === null || todos || asignados.includes(obsId));
  };
  return { nivel, todos, asignados, tiene, puede: (panel, obsId, minimo) => tiene(panel, obsId) && RANK[nivel] >= RANK[minimo] };
}

/** Los observatorios donde la persona es responsable (obs_responsables). Sin la migración, ninguno. */
export function useObservatoriosAsignados() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["obs-asignados", profile?.id],
    enabled: Boolean(profile?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("obs_responsables").select("observatorio_id").eq("persona_id", profile!.id);
      return error ? [] : (data ?? []).map((r) => (r as { observatorio_id: string }).observatorio_id);
    },
  });
}

/** Lo que O2 usa para mostrar u ocultar: panel, nivel y alcance reales de la sesión. */
export function usePermisosObservatorio(): PermisosObservatorio {
  const { profile, access } = useAuth();
  const asignados = useObservatoriosAsignados();
  return permisosObservatorio(profile, access, asignados.data ?? []);
}
