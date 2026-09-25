/* =============================================================================
   Mr. Pilo con IA · ¿aparece aquí?

   pilo_ai_public_config() dice si está encendido, qué funciones tiene y en qué
   portal y para quién. Aquí se traduce la ruta a su portal y se decide si esta
   persona ve a Pilo. La función del servidor vuelve a revisarlo todo: esto
   solo evita pintar un botón que no va a funcionar.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth";
import { canUse } from "./logic";
import type { Action, Fn, Portal, PortalRule, Role, Rules } from "./logic";

export type { Fn, Portal, PortalRule, Rules };

export interface PiloAiConfig extends Rules {
  voiceEngine: "proveedor" | "navegador";
  /** Hay proveedor, modelo y clave de voz: si no, se lee con el navegador. */
  speechReady: boolean;
  voiceRate: number;
  voicePitch: number;
}

export const PORTAL_LABEL: Record<Portal, string> = {
  cifras: "UDES en Cifras",
  pdi: "Plan de Desarrollo",
  observatorio: "Observatorio",
  impacto: "Portal de Impacto",
};

/** El portal de una ruta, o null si Mr. Pilo con IA no tiene nada que hacer ahí. */
export function portalForPath(pathname: string): Portal | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p.startsWith("/datos-abiertos/observatorio") || p.startsWith("/datos-abiertos/boletines")) return "observatorio";
  if (p.startsWith("/datos-abiertos")) return "cifras";
  if (p.startsWith("/impacto")) return "impacto";
  if (/^\/(pdi|implementacion|tablero|facultades|campus|ods|desarrollo-tecnologico)(\/|$)/.test(p)) return "pdi";
  return null;
}

export function usePiloAiConfig() {
  return useQuery({
    queryKey: ["pilo-ia", "config"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<PiloAiConfig | null> => {
      const { data, error } = await supabase.rpc("pilo_ai_public_config");
      // Sin la migración 0089, sencillamente no hay Pilo con IA.
      if (error || !data) return null;
      const raw = data as Record<string, unknown>;
      return {
        enabled: Boolean(raw.enabled),
        functions: (raw.functions ?? {}) as Rules["functions"],
        portals: (raw.portals ?? {}) as Rules["portals"],
        voiceEngine: raw.voice_engine === "navegador" ? "navegador" : "proveedor",
        speechReady: Boolean(raw.speech_ready),
        voiceRate: Number(raw.voice_rate ?? 1),
        voicePitch: Number(raw.voice_pitch ?? 1),
      };
    },
  });
}

/** Lo que Mr. Pilo con IA puede hacer aquí, para esta persona. */
export function usePiloAiHere() {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const config = usePiloAiConfig().data ?? null;
  const portal = portalForPath(pathname);
  const role = (profile?.is_active ? profile.role : null) as Role | null;
  const may = (action: Action) => Boolean(config && portal && canUse(config, portal, action, role).ok);
  const actions = {
    leer: may("voz"),
    resumir: may("resumir"),
    sintetizar: may("sintetizar"),
    explicar: may("explicar"),
  };
  const any = actions.leer || actions.resumir || actions.sintetizar || actions.explicar;
  return { config, portal, actions, active: Boolean(any) };
}
