/* =============================================================================
   Sesión y rol.

   Sustituye a la comprobación anterior (localStorage === "demo"), que era una
   puerta pintada: cualquiera podía abrirla escribiendo una línea en la consola.
   Ahora la sesión la emite Supabase y el rol vive en public.profiles, donde lo
   protegen las políticas RLS.

   Ojo: lo que se comprueba aquí sirve para *mostrar u ocultar* interfaz. La
   autorización real ocurre en la base de datos; si esta capa fallara, un
   usuario sin permisos vería botones que no funcionan, no datos que no debería.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { AccessRole, AdminScreen, AppRole, Profile } from "../types/database";

const RANK: Record<AppRole, number> = {
  consulta: 1,
  responsable: 2,
  planeacion: 3,
  admin: 4,
};

/** Rol de acceso de la sesión con los informes que alcanza. */
export interface AccessScope {
  role: AccessRole;
  /** Slugs de los informes propios. Vacío con `all_reports`. */
  reports: string[];
}

/** Dónde vive cada pantalla del menú. Sirve para llevar a cada quien a la
 *  primera que sí puede abrir: un rol de área no empieza en Gestión de pilares. */
export const SCREEN_PATHS: Record<AdminScreen, string> = {
  office: "/admin/pagina",
  documents: "/admin/documentos",
  pillars: "/admin/pilares",
  projects: "/admin/proyectos",
  faculties: "/admin/facultades",
  campus: "/admin/campus",
  budget: "/admin/presupuesto",
  repository: "/implementacion#repositorio",
  cifras: "/admin/udes-en-cifras",
  observatorio: "/admin/observatorio",
  tableros: "/admin/tableros",
  structure: "/admin/estructura",
  parameters: "/admin/parametros",
  development: "/admin/desarrollo",
  users: "/admin/usuarios",
  transfer: "/admin/traslado",
  impacto: "/admin/impacto",
  institution: "/admin/estructura-institucional",
};

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** true mientras se resuelve la sesión inicial: evita parpadeos de "no autorizado". */
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  /** ¿Tiene al menos este rol? Espeja has_role_at_least() de la base de datos. */
  hasRole: (minimum: AppRole) => boolean;
  /** Rol de acceso asignado. Sin él, la sesión se comporta como antes de 0024. */
  access: AccessScope | null;
  /** ¿Ve esta pantalla de la intranet? Espeja has_screen(). */
  canSee: (screen: AdminScreen) => boolean;
  /** ¿Ve este informe de UDES en Cifras en la intranet? */
  canSeeReport: (slug: string) => boolean;
  /** ¿Escribe en este informe? Espeja od_can_edit_report(). */
  canEditReport: (slug: string) => boolean;
  /** ¿Toca lo común del periodo (años, campus, informes nuevos)? */
  canEditPeriod: () => boolean;
  /** Primera pantalla que esta persona sí puede abrir. */
  home: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<AccessScope | null>(null);
  /** ¿Está en alguna unidad de Mis Tableros? Pertenecer ES el permiso. */
  const [inAnyUnit, setInAnyUnit] = useState(false);
  /** ¿Lleva un rol de acceso en alguna unidad (0063)? Abre el reporte de Impacto. */
  const [hasUnitRole, setHasUnitRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carga el perfil de la sesión activa. Un usuario autenticado sin perfil
  // activo se trata como no autorizado.
  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setAccess(null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
      setAccess(null);
      return;
    }

    const person = data && data.is_active ? (data as Profile) : null;
    // Releer el perfil sin cambios no debe repintar toda la intranet.
    setProfile((previous) => (JSON.stringify(previous) === JSON.stringify(person) ? previous : person));

    // Pertenecer a una unidad abre «Mis Tableros» sin que haga falta marcarlo
    // además en el rol de acceso. Son dos puertas para lo mismo, y quien mete a
    // alguien en una facultad da por hecho —con razón— que ya puede entrar.
    // Sin la migración 0057 esto falla y se queda en falso, que es lo de antes.
    const belongs = person
      ? await supabase.from("unit_members").select("id,access_role_id").eq("profile_id", person.id)
      : null;
    const memberships = (belongs?.data ?? []) as { id: string; access_role_id?: string | null }[];
    setInAnyUnit(memberships.length > 0);
    setHasUnitRole(memberships.some((row) => Boolean(row.access_role_id)));

    // El rol de acceso decide qué pantallas e informes se enseñan. Si no se
    // puede leer (base sin la migración 0024), la sesión sigue como antes.
    if (!person?.access_role_id) {
      setAccess(null);
      return;
    }
    const [role, reports] = await Promise.all([
      supabase.from("access_roles").select("*").eq("id", person.access_role_id).maybeSingle(),
      supabase.from("access_role_reports").select("report_slug").eq("access_role_id", person.access_role_id),
    ]);
    const next: AccessScope | null = role.data
      ? {
          role: role.data as AccessRole,
          reports: (reports.data ?? []).map((row) => (row as { report_slug: string }).report_slug),
        }
      : null;
    setAccess((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (!cancelled) setLoading(false);
    });

    // Cubre el inicio de sesión, el cierre, la renovación del token y —lo que
    // más importa aquí— la vuelta desde un enlace de invitación o recuperación.
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (cancelled) return;
      setSession(next);
      await loadProfile(next?.user.id);
      setLoading(false);
    });

    // Un administrador puede cambiar el rol de alguien que ya tiene la intranet
    // abierta. Al volver a la pestaña se relee el perfil, para que la nueva
    // capacidad se aplique sin cerrar sesión.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth.getSession().then(({ data }) => {
        if (!cancelled && data.session) void loadProfile(data.session.user.id);
      });
    };
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw new Error(
          signInError.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : signInError.message,
        );
      }

      await loadProfile(data.session?.user.id);
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAccess(null);
    setInAnyUnit(false);
    setHasUnitRole(false);
    setSession(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/acceso-intranet`,
    });
    if (resetError) throw new Error(resetError.message);
  }, []);

  const hasRole = useCallback(
    (minimum: AppRole) => Boolean(profile?.is_active && RANK[profile.role] >= RANK[minimum]),
    [profile],
  );

  // Espejo de has_screen(): la pantalla de usuarios siempre pide administración,
  // y un perfil sin rol de acceso ve lo de siempre.
  const canSee = useCallback(
    (screen: AdminScreen) => {
      if (!profile?.is_active) return false;
      // Usuarios y traslado de datos piden administración siempre.
      if ((screen === "users" || screen === "transfer" || screen === "institution") && RANK[profile.role] < RANK.admin) {
        return false;
      }
      // Mis Tableros se gana perteneciendo a una unidad, no marcándolo aparte.
      if (screen === "tableros" && inAnyUnit) return true;
      // Y el reporte de Impacto, teniendo un rol de unidad (dirección de
      // programa, decanatura…): ese rol se da en la unidad, no en el perfil.
      if (screen === "impacto" && hasUnitRole) return true;
      if (!access) return true;
      return access.role.all_screens || access.role.screens.includes(screen);
    },
    [profile, access, inAnyUnit, hasUnitRole],
  );

  const reachesReport = useCallback(
    (slug: string) => {
      if (!profile?.is_active) return false;
      if (RANK[profile.role] >= RANK.admin) return true;
      if (!access) return true;
      return access.role.all_reports || access.reports.includes(slug);
    },
    [profile, access],
  );

  const canEditReport = useCallback(
    (slug: string) => hasRole("planeacion") && reachesReport(slug),
    [hasRole, reachesReport],
  );

  const canEditPeriod = useCallback(
    () => hasRole("planeacion") && (hasRole("admin") || !access || access.role.all_reports),
    [hasRole, access],
  );

  const home = useMemo(() => {
    const first = (Object.keys(SCREEN_PATHS) as AdminScreen[]).find((screen) => canSee(screen));
    return first ? SCREEN_PATHS[first] : "/";
  }, [canSee]);

  const value = useMemo(
    () => ({
      session, profile, loading, error, signIn, signOut, requestPasswordReset, hasRole,
      access, canSee, canSeeReport: reachesReport, canEditReport, canEditPeriod, home,
    }),
    [
      session, profile, loading, error, signIn, signOut, requestPasswordReset, hasRole,
      access, canSee, reachesReport, canEditReport, canEditPeriod, home,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return context;
}

/** Etiquetas de los roles, en un solo sitio para que no diverjan entre pantallas. */
export const roleLabels: Record<AppRole, string> = {
  consulta: "Consulta",
  responsable: "Responsable de pilar",
  planeacion: "Planeación",
  admin: "Administrador",
};

export const roleDescriptions: Record<AppRole, string> = {
  consulta: "Lee toda la intranet, no edita nada.",
  responsable: "Edita únicamente los pilares que tiene asignados.",
  planeacion: "Edita cualquier pilar y decide qué se publica.",
  admin: "Todo lo anterior, más la gestión de usuarios.",
};
