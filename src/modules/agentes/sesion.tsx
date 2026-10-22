/* =============================================================================
   Portal de agentes · la sesión y la guardia.

   El portal es aparte de la intranet: no mira roles ni perfiles de la intranet.
   Quien inicia sesión (con Microsoft o con un código al correo) entra solo si
   su correo está en `support_agents` y la fila está activa. `support_claim`
   enlaza la sesión con esa fila; quien no es agente ve «No tiene acceso al
   portal de agentes».
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { claimAgent } from "./datos";
import type { Agent } from "./datos";

type State = { kind: "loading" } | { kind: "anon" } | { kind: "denied"; email: string } | { kind: "ready"; agent: Agent };

interface Ctx {
  state: State;
  /** Vuelve a leer quién es (después de cambiar su foto o su disponibilidad). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AgentCtx = createContext<Ctx | null>(null);

export const LOGIN_PATH = "/agentes/ingreso";

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const client = useQueryClient();

  const resolve = useCallback(async (session: Session | null) => {
    if (!session) return setState({ kind: "anon" });
    const agent = await claimAgent();
    setState(agent ? { kind: "ready", agent } : { kind: "denied", email: session.user.email ?? "" });
  }, []);

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live) void resolve(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Un cambio de sesión se resuelve fuera del callback: dentro no se puede esperar a la base.
      if (event === "TOKEN_REFRESHED") return;
      setTimeout(() => live && void resolve(session), 0);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [resolve]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolve(data.session);
  }, [resolve]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    client.removeQueries({ queryKey: ["soporte"] });
    setState({ kind: "anon" });
  }, [client]);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <AgentCtx.Provider value={value}>{children}</AgentCtx.Provider>;
}

export function useAgentSession(): Ctx {
  const ctx = useContext(AgentCtx);
  if (!ctx) throw new Error("useAgentSession va dentro de AgentProvider.");
  return ctx;
}

/** El agente de la sesión; solo se llama dentro de RequireAgent. */
export function useMe(): Agent {
  const { state } = useAgentSession();
  if (state.kind !== "ready") throw new Error("useMe va dentro de RequireAgent.");
  return state.agent;
}

function Splash({ text }: { text: string }) {
  return (
    <div className="ag-splash" role="status">
      <img src="/logo-udes.svg" alt="Universidad de Santander, UDES" height={44} />
      <span>{text}</span>
    </div>
  );
}

/** Deja pasar solo a un agente activo (y, si se pide, a un director). */
export function RequireAgent({ director = false, children }: { director?: boolean; children: ReactNode }) {
  const { state, signOut } = useAgentSession();
  const location = useLocation();
  if (state.kind === "loading") return <Splash text="Abriendo el portal…" />;
  if (state.kind === "anon") return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  if (state.kind === "denied") {
    return (
      <main className="ag-deny">
        <img src="/logo-udes.svg" alt="Universidad de Santander, UDES" height={44} />
        <h1>No tiene acceso al portal de agentes</h1>
        <p>
          {state.email ? `${state.email} no está en el equipo de agentes. ` : ""}Si cree que es un error, escriba a su director de agentes para que le cree el acceso.
        </p>
        <button type="button" className="ag-btn ag-press" onClick={() => void signOut()}>
          Salir
        </button>
      </main>
    );
  }
  if (director && state.agent.role !== "director") {
    return (
      <main className="ag-deny">
        <h1>Esta parte es del director</h1>
        <p>Su cuenta es de agente. Puede atender conversaciones desde la bandeja.</p>
        <Link className="ag-btn ag-press" to="/agentes">
          Ir a mi bandeja
        </Link>
      </main>
    );
  }
  return <>{children}</>;
}
