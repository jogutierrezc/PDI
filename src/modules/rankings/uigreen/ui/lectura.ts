/* =============================================================================
   UI GreenMetric · lecturas auxiliares de las pantallas (nombres, archivos,
   conteos, plantilla de correo). Solo lectura; lo que escribe va en ../datos.ts.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { errorDe } from "../datos";

interface Resultado { data: unknown; error: { code?: string; message?: string } | null }
async function leer<T>(p: PromiseLike<Resultado>): Promise<T> {
  const r = await p;
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

/** id → nombre y correo de las personas (la base decide cuáles se ven; las demás salen como «Persona»). */
export function usePerfiles(ids: string[]) {
  const clave = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["ugm", "perfiles", clave.join(",")],
    enabled: clave.length > 0,
    queryFn: async () => {
      try {
        const filas = await leer<{ id: string; full_name: string | null; email: string | null }[]>(supabase.from("profiles").select("id,full_name,email").in("id", clave));
        return new Map(filas.map((f) => [f.id, { nombre: f.full_name || f.email || "Persona", correo: f.email ?? "" }]));
      } catch {
        return new Map<string, { nombre: string; correo: string }>();
      }
    },
  });
}

export function useUnidadesNombres() {
  return useQuery({
    queryKey: ["ugm", "unidades"],
    staleTime: 300_000,
    queryFn: async () => {
      try {
        const filas = await leer<{ id: string; name: string }[]>(supabase.from("units").select("id,name"));
        return new Map(filas.map((u) => [u.id, u.name]));
      } catch {
        return new Map<string, string>();
      }
    },
  });
}

/** Cuántas evidencias tiene cada respuesta (solo las que la persona puede ver). */
export function useConteoEvidencias(ciclo?: string) {
  return useQuery({
    queryKey: ["ugm", ciclo ?? "", "conteo-evidencias"],
    enabled: !!ciclo,
    queryFn: async () => {
      const filas = await leer<{ respuesta_id: string }[]>(supabase.from("ugm_evidencias").select("respuesta_id"));
      const m = new Map<string, number>();
      for (const f of filas) m.set(f.respuesta_id, (m.get(f.respuesta_id) ?? 0) + 1);
      return m;
    },
  });
}

export interface ArchivoDrive { id: string; nombre: string; tipo: string; tamano: number | null; mime: string | null; ruta_storage: string | null }

/** Los archivos de UDrive por id (nombre, tipo, tamaño, ruta en Storage). */
export function useArchivosDrive(ids: string[]) {
  const clave = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["ugm", "archivos-drive", clave.join(",")],
    enabled: clave.length > 0,
    queryFn: async () => {
      const filas = await leer<ArchivoDrive[]>(supabase.from("drive_archivos").select("id,nombre,tipo,tamano,mime,ruta_storage").in("id", clave));
      return new Map(filas.map((f) => [f.id, f]));
    },
  });
}

/** Gráficas de Datos de Sostenibilidad enlazadas a una respuesta. */
export function useGraficasVinculadas(respuesta?: string) {
  return useQuery({
    queryKey: ["ugm", "graficas-vinculadas", respuesta],
    enabled: !!respuesta,
    queryFn: async () => (await leer<{ archivo_id: string }[]>(supabase.from("ugm_datos_graficas").select("archivo_id").eq("respuesta_id", respuesta!))).map((f) => f.archivo_id),
  });
}

/** El texto editable de una plantilla de correo (para la vista previa); sin ella, el de la migración 0213. */
export function usePlantillaCorreo(key: string) {
  return useQuery({
    queryKey: ["ugm", "plantilla-correo", key],
    staleTime: 300_000,
    queryFn: async () => {
      try {
        const f = await leer<{ subject: string; title: string; greeting: string; body: string; button: string }[]>(
          supabase.from("correo_templates").select("subject,title,greeting,body,button").eq("key", key).limit(1),
        );
        return f[0] ?? null;
      } catch {
        return null;
      }
    },
  });
}

/** ¿Participa esta persona en el ciclo? (la misma función que usa la base en sus políticas). */
export function useParticipa(ciclo?: string) {
  return useQuery({
    queryKey: ["ugm", ciclo ?? "", "participa"],
    enabled: !!ciclo,
    queryFn: async () => {
      const r = await supabase.rpc("ugm_participa", { p_ciclo: ciclo });
      if (r.error) throw errorDe(r.error);
      return r.data === true;
    },
  });
}
