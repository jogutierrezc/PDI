/* =============================================================================
   Edge Function · ugm-evidencia

   Entrega los archivos de evidencia «En la web» de UI GreenMetric a quien visita
   la página pública (/sostenible/green), sin sesión.

     GET /functions/v1/ugm-evidencia?id=<uuid de la evidencia>   → el archivo

   Reglas de seguridad:
     · Solo sirve lo que la base declara publicado AHORA: ugm_ruta_evidencia_web
       (migración 0214) exige evidencia marcada pública, respuesta aprobada, publicada,
       no sensible, con traducción revisada, ciclo visible y archivo fuera de la papelera.
       Si el indicador se retira, el archivo deja de salir de inmediato.
     · La ruta de Storage lleva el nombre interno del archivo: nunca se le entrega al
       navegador. La función firma una URL de 60 s, descarga el archivo y lo reenvía con
       un nombre genérico («evidence-xxxxxxxx.pdf»).
     · Solo PDF e imágenes se muestran en el navegador; cualquier otro tipo se descarga
       (application/octet-stream + attachment + CSP sandbox) y todo sale con nosniff y sin
       caché, para que un archivo subido no pueda ejecutar nada en el dominio del servidor
       y un indicador retirado deje de servirse en el acto.
     · Tope de 40 peticiones por minuto y por IP (en memoria, por instancia: un freno,
       no un muro) y de 25 MB por archivo.
     · Mismo mensaje 404 si no existe, no está publicado o no se encuentra el archivo.

   Despliegue:
     supabase functions deploy ugm-evidencia --no-verify-jwt
   (usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, que ya existen en la función.)
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const ENV = (n: string) => Deno.env.get(n) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};
const SEGURIDAD = { "X-Content-Type-Options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 25 * 1024 * 1024;
const VIDA_FIRMA_S = 60;
const TIPOS: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

const respuesta = (status: number, texto: string) =>
  new Response(texto, { status, headers: { ...CORS, ...SEGURIDAD, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const PETICIONES = new Map<string, number[]>();
function demasiadas(ip: string): boolean {
  const ahora = Date.now();
  const recientes = (PETICIONES.get(ip) ?? []).filter((t) => ahora - t < 60_000);
  recientes.push(ahora);
  PETICIONES.set(ip, recientes);
  if (PETICIONES.size > 5000) for (const [k, v] of PETICIONES) if (!v.some((t) => ahora - t < 60_000)) PETICIONES.delete(k);
  return recientes.length > 40;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") return respuesta(405, "Método no permitido.");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
  if (demasiadas(ip)) return respuesta(429, "Demasiadas peticiones. Intente de nuevo en un minuto.");

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return respuesta(404, "No encontrado.");

  const url = ENV("SUPABASE_URL");
  const clave = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !clave) return respuesta(500, "Servicio sin configurar.");
  const admin = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await admin.rpc("ugm_ruta_evidencia_web", { p_evidencia: id });
  if (error) return respuesta(error.code === "PGRST202" || error.code === "42883" ? 503 : 500, "No se pudo consultar la evidencia.");
  const ruta = typeof data?.ruta === "string" ? data.ruta : "";
  if (!ruta) return respuesta(404, "No encontrado.");

  const firmada = await admin.storage.from("udrive").createSignedUrl(ruta, VIDA_FIRMA_S);
  if (firmada.error || !firmada.data?.signedUrl) return respuesta(404, "No encontrado.");
  const archivo = await fetch(firmada.data.signedUrl);
  if (!archivo.ok || !archivo.body) return respuesta(404, "No encontrado.");
  const largo = Number(archivo.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) return respuesta(413, "El archivo es demasiado grande para mostrarlo aquí.");

  const ext = String(data?.ext ?? "").toLowerCase();
  const tipo = TIPOS[ext];
  const nombre = `evidence-${id.slice(0, 8)}${/^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""}`;
  const cabeceras: Record<string, string> = {
    ...CORS,
    ...SEGURIDAD,
    // El visor de PDF de Chrome no funciona con CSP sandbox: solo lo que se descarga lleva el aislamiento.
    ...(tipo ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'" }),
    "Content-Type": tipo ?? "application/octet-stream",
    "Content-Disposition": `${tipo ? "inline" : "attachment"}; filename="${nombre}"`,
    "Cache-Control": "no-store",
  };
  if (largo) cabeceras["Content-Length"] = String(largo);
  return new Response(req.method === "HEAD" ? null : archivo.body, { status: 200, headers: cabeceras });
});
