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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  impacto: "/admin/impacto",
  structure: "/admin/estructura",
  parameters: "/admin/parametros",
  development: "/admin/desarrollo",
  users: "/admin/usuarios",
  transfer: "/admin/traslado",
  institution: "/admin/estructura-institucional",
  pilo: "/admin/mr-pilo",
};

export interface AuthContextValue {
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
  /** Su lugar en Impacto, por sus unidades. */
  impactoSide: ImpactoSide;
  /** ¿Pertenece a alguna unidad? */
  inAnyUnit: boolean;
}

/**
 * Dónde trabaja la persona en Impacto, según sus unidades: en un programa o
 * facultad, en una vicerrectoría u oficina con función sustantiva, en ambos
 * o en ninguno. Decide si Impacto aparece y qué recorrido le toca.
 */
export type ImpactoSide = "programa" | "funcion" | "ambos" | null;

/**
 * ¿Ve esta pantalla de la intranet? Espejo de has_screen(), en una función
 * pura para que el menú, el lanzador y las pruebas usen la misma regla.
 */
export function screenVisible(
  screen: AdminScreen,
  who: { profile: Profile | null; access: AccessScope | null; inAnyUnit: boolean; impactoSide: ImpactoSide },
): boolean {
  const { profile, access, inAnyUnit, impactoSide } = who;
  if (!profile?.is_active) return false;
  // Usuarios, traslado de datos y estructura institucional piden administración siempre.
  if ((screen === "users" || screen === "transfer" || screen === "institution" || screen === "pilo") && RANK[profile.role] < RANK.admin) {
    return false;
  }
  // Mis Tableros se gana perteneciendo a una unidad, no marcándolo aparte.
  if (screen === "tableros" && inAnyUnit) return true;
  // Impacto, solo a quien tiene algo que hacer en él: un programa o una
  // unidad con función sustantiva, Planeación sin unidades (lo lee todo)
  // y la administración. Pertenecer a una oficina sin función no basta.
  if (screen === "impacto") {
    if (RANK[profile.role] >= RANK.admin || impactoSide) return true;
    if (RANK[profile.role] >= RANK.planeacion && !inAnyUnit) return true;
    return false;
  }
  if (!access) return true;
  return access.role.all_screens || access.role.screens.includes(screen);
}

/** El panel de la intranet: el lanzador. Sin sesión activa, la portada. */
export const INTRANET_HOME = "/admin";

export function intranetHome(profile: Profile | null): string {
  return profile?.is_active ? INTRANET_HOME : "/";
}

/**
 * A dónde llevar a alguien que acaba de iniciar sesión. Si una guarda lo mandó
 * al login desde una pantalla interna, vuelve a ella; si no —o si «de dónde
 * venía» es el propio login, «Sin permiso» o una dirección externa—, al panel.
 */
export function afterLoginPath(from: unknown, profile: Profile | null): string {
  const home = intranetHome(profile);
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return home;
  const path = from.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/acceso-intranet" || path === "/sin-permiso") return home;
  return from;
}

/** Exportado para montar la intranet con una sesión simulada (pruebas y bancos de pruebas). */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<AccessScope | null>(null);
  /** ¿Está en alguna unidad de Mis Tableros? Pertenecer ES el permiso. */
  const [inAnyUnit, setInAnyUnit] = useState(false);
  const [impactoSide, setImpactoSide] = useState<ImpactoSide>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Turno de la última lectura del perfil: una lectura vieja que termina tarde
   *  (p. ej. la de antes de cerrar sesión) no pisa a la más reciente. */
  const ticket = useRef(0);

  // Carga el perfil de la sesión activa. Un usuario autenticado sin perfil
  // activo se trata como no autorizado.
  //
  // Todo (perfil, unidades, lado de Impacto, rol de acceso) se lee primero y se
  // publica al final, de una vez. Antes el perfil se publicaba antes que el rol
  // de acceso: en ese instante el login ya veía un perfil y redirigía con
  // permisos a medio cargar —canSee() sin rol de acceso dice «sí» a todo—, así
  // que la persona acababa en una pantalla ajena y rebotaba a «Sin permiso».
  const loadProfile = useCallback(async (userId: string | undefined) => {
    const mine = ++ticket.current;
    const publish = (
      person: Profile | null,
      scope: AccessScope | null,
      anyUnit: boolean,
      side: ImpactoSide,
    ) => {
      if (mine !== ticket.current) return;
      // Releer el perfil sin cambios no debe repintar toda la intranet.
      setProfile((previous) => (JSON.stringify(previous) === JSON.stringify(person) ? previous : person));
      setAccess((previous) => (JSON.stringify(previous) === JSON.stringify(scope) ? previous : scope));
      setInAnyUnit(anyUnit);
      setImpactoSide(side);
    };

    if (!userId) {
      publish(null, null, false, null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      if (mine === ticket.current) setError(profileError.message);
      publish(null, null, false, null);
      return;
    }

    const person = data && data.is_active ? (data as Profile) : null;
    if (!person) {
      publish(null, null, false, null);
      return;
    }

    // Pertenecer a una unidad abre «Mis Tableros» sin que haga falta marcarlo
    // además en el rol de acceso. Son dos puertas para lo mismo, y quien mete a
    // alguien en una facultad da por hecho —con razón— que ya puede entrar.
    // Sin la migración 0057 esto falla y se queda en falso, que es lo de antes.
    const belongs = await supabase.from("unit_members").select("unit_id, units(kind)").eq("profile_id", person.id);
    const rows = (belongs.data ?? []) as { unit_id: string; units: { kind: string } | { kind: string }[] | null }[];

    // En Impacto: ¿programa (o facultad), vicerrectoría u oficina con función, o ambos?
    const kindOf = (r: (typeof rows)[number]) => (Array.isArray(r.units) ? r.units[0]?.kind : r.units?.kind) ?? "";
    const programSide = rows.some((r) => kindOf(r) === "programa" || kindOf(r) === "facultad");
    let functionSide = false;
    if (rows.length) {
      const fns = await supabase.from("imp_unit_functions").select("unit_id").in("unit_id", rows.map((r) => r.unit_id));
      functionSide = (fns.data ?? []).length > 0;
    }
    const side: ImpactoSide = functionSide ? (programSide ? "ambos" : "funcion") : programSide ? "programa" : null;

    // El rol de acceso decide qué pantallas e informes se enseñan. Si no se
    // puede leer (base sin la migración 0024), la sesión sigue como antes.
    let scope: AccessScope | null = null;
    if (person.access_role_id) {
      const [role, reports] = await Promise.all([
        supabase.from("access_roles").select("*").eq("id", person.access_role_id).maybeSingle(),
        supabase.from("access_role_reports").select("report_slug").eq("access_role_id", person.access_role_id),
      ]);
      scope = role.data
        ? {
            role: role.data as AccessRole,
            reports: (reports.data ?? []).map((row) => (row as { report_slug: string }).report_slug),
          }
        : null;
    }

    publish(person, scope, rows.length > 0, side);
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
    ticket.current += 1;
    setProfile(null);
    setAccess(null);
    setInAnyUnit(false);
    setImpactoSide(null);
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
    (screen: AdminScreen) => screenVisible(screen, { profile, access, inAnyUnit, impactoSide }),
    [profile, access, inAnyUnit, impactoSide],
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

  // El panel de la intranet es el lanzador (/admin): enseña justo las pantallas
  // que esta persona puede abrir, así que sirve para cualquier rol. Antes era
  // «la primera pantalla visible», que para casi todos resultaba ser la página
  // de la oficina, no el panel.
  const home = intranetHome(profile);

  const value = useMemo(
    () => ({
      session, profile, loading, error, signIn, signOut, requestPasswordReset, hasRole,
      access, canSee, canSeeReport: reachesReport, canEditReport, canEditPeriod, home, impactoSide, inAnyUnit,
    }),
    [
      session, profile, loading, error, signIn, signOut, requestPasswordReset, hasRole,
      access, canSee, reachesReport, canEditReport, canEditPeriod, home, impactoSide, inAnyUnit,
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
