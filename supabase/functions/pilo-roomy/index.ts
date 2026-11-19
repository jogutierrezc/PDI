/* =============================================================================
   Edge Function · pilo-roomy

   El puente entre la app de Pilo y Aluna (Roomy): cursos, listas de estudiantes y
   asistencia de UN profesor, solo en lectura. No usa ningún modelo.

   Variables (secretos del contenedor de funciones):
     ALUNA_PUENTE_URL     https://planeacion.udes.edu.co/2/functions/v1/pilo-puente  (confirmar la ruta)
     PILO_PUENTE_SECRET   el mismo secreto (≥ 32 caracteres) que tiene `pilo-puente` en Aluna
   Contrato con Aluna: PILO_PUENTE.md. Contrato con la app: handler.ts.
   Despliegue: supabase/actualizar-pilo-roomy.sh.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { crearManejador } from "./handler.ts";

const ENV = (n: string) => Deno.env.get(n) ?? "";
const url = ENV("SUPABASE_URL");
const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = ENV("SUPABASE_ANON_KEY");
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
/** Consultas por persona y hora (se puede cambiar con PILO_ROOMY_HORA). */
const LIMITE_HORA = Number(ENV("PILO_ROOMY_HORA")) || 120;

Deno.serve(
  crearManejador({
    configurado: Boolean(admin && anonKey),
    anonKey,
    sal: ENV("PILO_VISITOR_SALT") || serviceKey,
    urlPuente: ENV("ALUNA_PUENTE_URL"),
    secreto: ENV("PILO_PUENTE_SECRET"),
    usuarioDe: async (token) => {
      const w = await admin!.auth.getUser(token);
      const u = w.data.user;
      return w.error || !u || !u.email ? null : { id: u.id, correo: u.email };
    },
    golpe: async (huella, inicio) => {
      const { data, error } = await admin!.rpc("pilo_visitor_hit", { p_visitor: huella, p_window_start: inicio });
      return error ? null : Number(data ?? 0);
    },
    limiteHora: LIMITE_HORA,
    llamar: (u, init) => fetch(u, init),
  }),
);
