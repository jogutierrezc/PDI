/* =============================================================================
   Edge Function · pilo-compilador

   «Compilar informe de colaboradores con Pilo»: redacta UNA sección de texto del informe con lo que entregaron
   los equipos de apoyo, ya organizado en la pantalla (la pantalla manda una sección por llamada). SIEMPRE con
   Pilo Astra 1.0 y razonamiento; sin Astra responde astra_apagado. Sin tope de tokens: si Astra se corta, sigue.
   No guarda nada: devuelve el texto y la pantalla lo deja en borrador hasta que quien gestiona lo apruebe.

     POST { instancia_id, nivel: rapida|compleja|investigacion, instruccion?, datos }
     → SSE:  step {id,label} · thinking {text} · part {n,palabras} · done {seccion,texto,partes,palabras,usados,
             no_verificado,pensamiento_s,reintento,modelo} · error {code,message,detalle?}
     401 sin_sesion · 403 sin_acceso · 413 datos_grandes · 429 astra_limite · 503 astra_apagado.

   Acceso: informe_instancia_visible (0153/0169) con SU sesión. El cupo por hora es el de Astra (pilo_visitor_hit).
   Lógica pura en pedido.ts, prompt.ts, verificar.ts y nucleo.ts (pruebas en tests/compilador/).
   Despliegue: bash supabase/actualizar-pilo-compilador.sh (copia también pilo-presentaciones/astra.ts y limite.ts).
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { destinoAstra, leerConfig } from "../pilo-work/proveedor.ts";
import { crearManejador } from "./handler.ts";

const ENV = (n: string) => Deno.env.get(n) ?? "";
const TOPE_ESPERA_MS = 600_000;

const url = ENV("SUPABASE_URL");
const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = ENV("SUPABASE_ANON_KEY");
const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = url && serviceKey ? createClient(url, serviceKey, opciones) : null;

Deno.serve(
  crearManejador({
    configurado: Boolean(admin && anonKey),
    anonKey,
    sal: ENV("PILO_VISITOR_SALT") || serviceKey,
    usuarioDe: async (token) => {
      const w = await admin!.auth.getUser(token);
      return w.error || !w.data.user ? null : w.data.user.id;
    },
    visible: async (authorization, instanciaId) => {
      const comoUsuario = createClient(url, anonKey, { ...opciones, global: { headers: { Authorization: authorization } } });
      const r = await comoUsuario.rpc("informe_instancia_visible", { inst: instanciaId });
      return !r.error && r.data === true;
    },
    config: async () => {
      const pw = await leerConfig(admin);
      return {
        habilitado: pw.astra_habilitado,
        destino: pw.astra_habilitado ? await destinoAstra(admin, pw) : null,
        // Sin tope fijo de tokens: texto largo por sección. Si el servidor se corta, nucleo.ts pide continuar.
        maxTokens: 0,
        esperaMs: Math.min(TOPE_ESPERA_MS, Math.max(1, pw.astra_espera_s) * 1000),
        limiteHora: pw.astra_limite_hora,
      };
    },
    golpe: async (huella, inicio) => {
      const { data, error } = await admin!.rpc("pilo_visitor_hit", { p_visitor: huella, p_window_start: inicio });
      return error ? null : Number(data ?? 0);
    },
  }),
);
