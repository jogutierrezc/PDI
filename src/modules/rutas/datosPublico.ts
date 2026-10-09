/* =============================================================================
   Ruta del bus UDES · carga de datos de la página pública.

   Lee de Supabase, sin iniciar sesión, solo lo que la migración 0140 abre a la
   clave anónima: rutas activas y públicas, sus paradas y su trazado. Nunca toca
   estudiantes por celda, abordajes ni propuestas (bus_origin_cells,
   bus_ridership, bus_proposals): esas tablas siguen cerradas y esta página ni
   las consulta. La prueba datosPublico.test.ts lo vigila.
   ========================================================================== */

import { supabase } from "../../lib/supabase";
import { aMinutos, horarioSeguro } from "./horario";
import type { DatosPublicos } from "./tiposPublico";

/** Las únicas tablas que esta página consulta. */
export const TABLAS_PUBLICAS = ["bus_routes", "bus_stops", "bus_route_geometry"] as const;

export class RutaNoDisponible extends Error {}

interface FilaRuta {
  id: string;
  code: string;
  name: string;
  headway_min: number | null;
  terminal_dwell_min: number | null;
  first_departure: string | null;
  last_departure: string | null;
  updated_at: string | null;
}
interface FilaParada {
  seq: number;
  name: string;
  lon: number;
  lat: number;
}
interface FilaGeometria {
  coords: [number, number][];
  leg_distances_m: number[];
  duration_s: number | null;
}

const faltaEsquema = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|schema cache/i.test(e.message ?? "")));

export async function cargarRutaPublica(): Promise<DatosPublicos> {
  const rutas = await supabase
    .from("bus_routes" as never)
    .select("id, code, name, headway_min, terminal_dwell_min, first_departure, last_departure, updated_at")
    .eq("active", true)
    .eq("public", true)
    .order("code")
    .limit(1);
  if (rutas.error) {
    throw new RutaNoDisponible(faltaEsquema(rutas.error) ? "La ruta pública todavía no está habilitada." : `No se pudo cargar la ruta: ${rutas.error.message}`);
  }
  const ruta = (rutas.data as unknown as FilaRuta[] | null)?.[0];
  if (!ruta) throw new RutaNoDisponible("No hay una ruta publicada por ahora.");

  const [paradas, geometria, vias] = await Promise.all([
    supabase.from("bus_stops" as never).select("seq, name, lon, lat").eq("route_id", ruta.id).order("seq"),
    supabase.from("bus_route_geometry" as never).select("coords, leg_distances_m, duration_s").eq("route_id", ruta.id).maybeSingle(),
    import("./vias.json"),
  ]);
  for (const r of [paradas, geometria]) if (r.error) throw new RutaNoDisponible(`No se pudo cargar la ruta: ${r.error.message}`);
  const stops = (paradas.data as unknown as FilaParada[] | null) ?? [];
  const geo = geometria.data as unknown as FilaGeometria | null;
  if (stops.length < 2 || !geo || geo.coords.length < 2) throw new RutaNoDisponible("La ruta todavía no tiene paradas o trazado.");

  return {
    ruta: {
      id: ruta.id,
      codigo: ruta.code,
      nombre: "Ruta del bus UDES",
      coords: geo.coords,
      legs: geo.leg_distances_m,
      duracionS: geo.duration_s,
      stops: stops.map((s) => ({ name: s.name, lon: s.lon, lat: s.lat })),
      horario: horarioSeguro({
        primeraMin: ruta.first_departure ? aMinutos(ruta.first_departure) : 330,
        ultimaMin: ruta.last_departure ? aMinutos(ruta.last_departure) : 21 * 60,
        intervaloMin: ruta.headway_min ?? 15,
        paradaCampusMin: ruta.terminal_dwell_min ?? 5,
      }),
      actualizado: ruta.updated_at,
    },
    vias: (vias.default as unknown as [number, number[]][]) ?? [],
  };
}
