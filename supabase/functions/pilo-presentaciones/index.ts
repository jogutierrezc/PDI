/* =============================================================================
   Edge Function · pilo-presentaciones

   Crea una presentación a partir de un informe de gestión, SIEMPRE con Pilo Astra
   1.0 (nunca cae a otro modelo). El cliente manda el informe ya armado
   (entradaLibro, con las cifras resueltas); el servidor NO se fía de él para
   permisos: exige sesión, comprueba con SU token que la persona ve la instancia
   (informe_instancia_visible, 0153/0169) y aplica el límite por hora de Astra.

     POST { instancia_id, tono: institucional|cercano|ejecutivo|academico,
            duracion_min?, enfoque? (≤300), informe: <JSON plano, ≤300 KB> }

   Respuesta (SSE, text/event-stream):
     step     { id: leyendo|organizando|redactando|validando, texto }
     thinking { text }                 razonamiento de Astra, tal cual (en inglés)
     done     { presentacion, no_verificado[], ajustes[], pensamiento_s, reintento, modelo }
     error    { code, message, detalle? }
   Antes de abrir el flujo, los fallos son JSON con su estado HTTP:
     400 pedido · 401 sin sesión · 403 sin acceso · 413 informe grande ·
     429 astra_limite · 503 astra_apagado.

   Lógica pura y pruebas: esquema.ts, verificar.ts, tonos.ts, prompt.ts, pedido.ts,
   nucleo.ts, astra.ts, limite.ts y handler.ts (tests/presentaciones/); aquí solo se conecta con Supabase. No guarda nada: la
   persistencia es de la web (informe_presentaciones, migración 0284).

   Despliegue: carpeta junto a ../pilo-work/proveedor.ts (destinoAstra, esfuerzoAstra).
   Ver supabase/actualizar-pilo-presentaciones.sh.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { destinoAstra, leerConfig } from "../pilo-work/proveedor.ts";
import { crearManejador } from "./handler.ts";

const ENV = (n: string) => Deno.env.get(n) ?? "";
/** Tope del silencio tolerado de Astra (la espera máxima de Pilo Work, hasta 600 s). */
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
        // Medido con Pilo Astra 1.0: con razonamiento «bajo» y 16 000 tokens se gastó todo pensando (115 s) y no escribió nada;
        // sin razonamiento el JSON de 9 diapositivas sale en ~12 s. Armar el JSON no necesita razonar.
        effort: "none" as const,
        // Sin tope fijo de tokens (igual que pilo-compilador): la presentación se escribe completa, tan larga como pida el informe.
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
