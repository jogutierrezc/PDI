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
import type { AppRole, Profile } from "../types/database";

const RANK: Record<AppRole, number> = {
  consulta: 1,
  responsable: 2,
  planeacion: 3,
  admin: 4,
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carga el perfil de la sesión activa. Un usuario autenticado sin perfil
  // activo se trata como no autorizado.
  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
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
      return;
    }

    setProfile(data && data.is_active ? (data as Profile) : null);
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

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
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

  const value = useMemo(
    () => ({ session, profile, loading, error, signIn, signOut, requestPasswordReset, hasRole }),
    [session, profile, loading, error, signIn, signOut, requestPasswordReset, hasRole],
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
