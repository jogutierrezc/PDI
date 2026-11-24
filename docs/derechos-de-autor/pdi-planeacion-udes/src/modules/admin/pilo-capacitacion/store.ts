/* =============================================================================
   Capacitación de Pilo · los datos de la pantalla.

   Lo que ya existe se lee tal cual: la bandeja (inbox.ts, paginada aquí), el
   catálogo y la memoria de cada Pilo. Lo nuevo (0180) son dos tablas: la capa
   y el público de cada pieza, y los permisos por oficina. Sin 0180, esas
   lecturas fallan con «no existe la tabla»: la pantalla lo dice arriba y pinta
   los valores de partida (OFICINAS_PARTIDA).

   Capas: «institucional» es el Pilo de Planeación («planeacion») y «academica»
   es «Mr. Pilo en Enseñanza» («ensenanza»). El público de cada pieza es un
   conjunto de: consejo, admin, colab, prof, est.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { fetchInboxPage } from "../pilo/inbox";
import type { PiloSpace } from "../pilo/space";
import { PAGE_SIZE } from "./paginacion";

export type Capa = "institucional" | "academica";
export type Publico = "consejo" | "admin" | "colab" | "prof" | "est";
export type CapaFiltro = "todas" | PiloSpace;

/** La capa de la pantalla y el espacio del Pilo al que pertenece. */
export const ESPACIO_DE_CAPA: Record<Capa, PiloSpace> = { institucional: "planeacion", academica: "ensenanza" };
export const CAPA_DE_ESPACIO: Record<PiloSpace, Capa> = { planeacion: "institucional", ensenanza: "academica" };

export const PUBLICOS: { id: Publico; label: string }[] = [
  { id: "consejo", label: "Consejo Directivo" },
  { id: "admin", label: "Personal administrativo" },
  { id: "colab", label: "Colaboradores" },
  { id: "prof", label: "Profesores" },
  { id: "est", label: "Estudiantes" },
];

/** Público de partida de cada capa: lo que la capa suele tener que decir. */
export const PUBLICO_DE_PARTIDA: Record<Capa, Publico[]> = {
  institucional: ["admin", "colab"],
  academica: ["prof", "est"],
};

/** Las capas que puede enseñar una oficina, y si lo que propone exige aprobación. */
export interface OficinaPermiso {
  oficina: string;
  ensena_institucional: boolean;
  ensena_academica: boolean;
  exige_aprobacion: boolean;
}

/** Oficinas y sus valores de partida (los de la maqueta aprobada). Sin 0180 son estos. */
export const OFICINAS_PARTIDA: { oficina: string; topics: string; permiso: Omit<OficinaPermiso, "oficina"> }[] = [
  { oficina: "Planeación", topics: "Cifras institucionales, rankings, reportes y la propia memoria de Pilo.", permiso: { ensena_institucional: true, ensena_academica: true, exige_aprobacion: false } },
  { oficina: "Talento Humano", topics: "Licencias, vinculación, nómina y bienestar laboral.", permiso: { ensena_institucional: true, ensena_academica: false, exige_aprobacion: true } },
  { oficina: "Registro Académico", topics: "Calendario, matrículas, cancelaciones, notas y certificados.", permiso: { ensena_institucional: true, ensena_academica: true, exige_aprobacion: true } },
  { oficina: "Bienestar Universitario", topics: "Apoyos, salud, deporte, cultura y permanencia estudiantil.", permiso: { ensena_institucional: false, ensena_academica: true, exige_aprobacion: true } },
  { oficina: "Internacionalización", topics: "Movilidad, convenios y contactos con aliados.", permiso: { ensena_institucional: true, ensena_academica: true, exige_aprobacion: true } },
  { oficina: "Secretaría General", topics: "Acuerdos, actas y decisiones del Consejo Directivo.", permiso: { ensena_institucional: true, ensena_academica: false, exige_aprobacion: true } },
];

/** ¿La tabla 0180 todavía no existe en esta base? */
export const sinMigracion = (error: { code?: string; message?: string } | null | undefined) =>
  Boolean(error) && (error!.code === "PGRST205" || error!.code === "42P01" || /could not find the table|does not exist/i.test(error!.message ?? ""));

/* --- La bandeja, paginada --------------------------------------------------------------- */

/** Una página de «Lo que Pilo no supo», de un espacio o de los dos. */
export function useInboxPage(page: number, capa: CapaFiltro) {
  return useQuery({
    queryKey: ["pilo-ia", "bandeja", "capacitacion", capa, page, PAGE_SIZE],
    queryFn: () => fetchInboxPage(page, PAGE_SIZE, capa),
    placeholderData: (prev) => prev,
  });
}

/* --- Los conteos de «Qué sabe Pilo» y del panel --------------------------------------- */

export interface Conteos {
  catalogo: Record<PiloSpace, number>;
  memoria: number;
}

/** Cuántas respuestas hay en el catálogo de cada Pilo y cuántos pasajes en la memoria. Sin datos, null. */
export function useConteos() {
  return useQuery({
    queryKey: ["pilo-capacitacion", "conteos"],
    queryFn: async (): Promise<Conteos | null> => {
      const catalogo = {} as Record<PiloSpace, number>;
      for (const space of ["planeacion", "ensenanza"] as PiloSpace[]) {
        const { count, error } = await supabase.from("pilo_catalog").select("key", { count: "exact", head: true }).eq("space", space);
        if (error) return null;
        catalogo[space] = count ?? 0;
      }
      const memory = await supabase.from("pilo_memory").select("ref", { count: "exact", head: true });
      if (memory.error) return null;
      return { catalogo, memoria: memory.count ?? 0 };
    },
  });
}

/* --- Permisos por oficina (0180) ----------------------------------------------------- */

/** Los permisos de cada oficina: lo guardado, y la partida para las que no tienen fila. `missing`: falta 0180. */
export function useOficinas() {
  return useQuery({
    queryKey: ["pilo-capacitacion", "oficinas"],
    queryFn: async (): Promise<{ rows: OficinaPermiso[]; missing: boolean }> => {
      const { data, error } = await supabase.from("pilo_capacitacion_oficinas").select("oficina, ensena_institucional, ensena_academica, exige_aprobacion");
      if (error) {
        if (sinMigracion(error)) return { rows: OFICINAS_PARTIDA.map((o) => ({ oficina: o.oficina, ...o.permiso })), missing: true };
        throw error;
      }
      const saved = new Map((data ?? []).map((r) => [r.oficina as string, r as unknown as OficinaPermiso]));
      return { rows: OFICINAS_PARTIDA.map((o) => saved.get(o.oficina) ?? { oficina: o.oficina, ...o.permiso }), missing: false };
    },
  });
}

export function useSaveOficina() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (row: OficinaPermiso) => {
      const { error } = await supabase.from("pilo_capacitacion_oficinas").upsert(row, { onConflict: "oficina" });
      if (error) throw error;
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ["pilo-capacitacion", "oficinas"] }),
  });
}

/* --- La capa y el público de una pieza (0180) ---------------------------------------- */

/** Guarda la capa y el público de la respuesta que acaba de entrar al catálogo. */
export async function savePieza(space: PiloSpace, catalogKey: string, capa: Capa, publico: Publico[]): Promise<void> {
  const { error } = await supabase.from("pilo_capacitacion_piezas").upsert({ space, catalog_key: catalogKey, capa, publico }, { onConflict: "space,catalog_key" });
  if (error) throw error;
}
