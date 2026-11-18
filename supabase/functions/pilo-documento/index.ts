/* =============================================================================
   Edge Function · pilo-documento

   Word y Excel «con formato institucional» (encabezado y pie con paginación,
   portada, tablas con color, hojas con filtros y paneles fijos) a partir del
   Markdown de una respuesta de Pilo. La app arma en el dispositivo la versión
   sencilla; esta función es solo para lo que pide más. No usa ningún modelo.

   Contrato y errores: ver handler.ts. Lógica pura y pruebas: markdown.ts, nucleo.ts,
   limite.ts, handler.ts (tests/pilo-documento/). Despliegue: supabase/actualizar-pilo-documento.sh.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import * as docx from "npm:docx@9.14.0";
import ExcelJS from "npm:exceljs@4.4.0";
import { crearManejador } from "./handler.ts";

const ENV = (n: string) => Deno.env.get(n) ?? "";
const url = ENV("SUPABASE_URL");
const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = ENV("SUPABASE_ANON_KEY");
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
/** Documentos por persona y hora (se puede cambiar con la variable PILO_DOCUMENTOS_HORA). */
const LIMITE_HORA = Number(ENV("PILO_DOCUMENTOS_HORA")) || 30;

Deno.serve(
  crearManejador({
    configurado: Boolean(admin && anonKey),
    anonKey,
    sal: ENV("PILO_VISITOR_SALT") || serviceKey,
    usuarioDe: async (token) => {
      const w = await admin!.auth.getUser(token);
      return w.error || !w.data.user ? null : w.data.user.id;
    },
    golpe: async (huella, inicio) => {
      const { data, error } = await admin!.rpc("pilo_visitor_hit", { p_visitor: huella, p_window_start: inicio });
      return error ? null : Number(data ?? 0);
    },
    limiteHora: LIMITE_HORA,
    docx,
    excel: ExcelJS,
  }),
);
