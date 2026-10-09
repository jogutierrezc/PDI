/* =============================================================================
   Rutas UDES · carga de datos.

   Lee de Supabase la ruta elegida con sus paradas y su trazado, y los
   estudiantes agregados por celda del periodo más reciente (migración 0139).
   Las calles de OpenStreetMap viajan aparte (vias.json) y se piden al abrir el
   módulo. Todo se autoriza con RLS (Planeación o más), no aquí.

   Una ruta nueva se carga con sus paradas: el trazado por carretera lo calcula
   OSRM (por defecto su servidor público de demostración, que es para pocas
   consultas; VITE_OSRM_URL apunta a uno propio) y se guarda en la base.
   ========================================================================== */

import { supabase } from "../../lib/supabase";
import { paradasDelRecorrido } from "./paradas";
import type { DatosRutas, FlotaGuardar, ParadaRuta, PropuestaGuardar, ResumenRuta, RutaNueva } from "./tipos";

export { leerParadas, paradasDelRecorrido } from "./paradas";

export class FaltaMigracion extends Error {}

interface FilaRuta {
  id: string;
  code: string;
  name: string;
  vehicles: number;
  capacity: number;
  headway_min: number | null;
  terminal_dwell_min: number | null;
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
interface FilaCelda {
  term: string;
  lon: number;
  lat: number;
  students: number;
}

const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|schema cache/i.test(e.message ?? "")));

const faltaMigracion = () => new FaltaMigracion("Falta aplicar la migración 0139 (rutas del bus).");

export async function listarRutas(): Promise<ResumenRuta[]> {
  const r = await supabase.from("bus_routes" as never).select("id, code, name").eq("active", true).order("code");
  if (r.error) throw noExiste(r.error) ? faltaMigracion() : new Error(r.error.message);
  return (r.data as unknown as ResumenRuta[] | null) ?? [];
}

export async function cargarRutas(rutaId?: string | null): Promise<DatosRutas> {
  let consulta = supabase.from("bus_routes" as never).select("id, code, name, vehicles, capacity, headway_min, terminal_dwell_min").eq("active", true);
  consulta = rutaId ? consulta.eq("id", rutaId) : consulta.order("code").limit(1);
  const rutas = await consulta;
  if (rutas.error) throw noExiste(rutas.error) ? faltaMigracion() : new Error(rutas.error.message);
  const ruta = (rutas.data as unknown as FilaRuta[] | null)?.[0];
  if (!ruta) throw new Error("No hay una ruta activa en bus_routes.");

  const [paradas, geometria, celdas, vias] = await Promise.all([
    supabase.from("bus_stops" as never).select("seq, name, lon, lat").eq("route_id", ruta.id).order("seq"),
    supabase.from("bus_route_geometry" as never).select("coords, leg_distances_m, duration_s").eq("route_id", ruta.id).maybeSingle(),
    supabase.from("bus_origin_cells" as never).select("term, lon, lat, students").order("term", { ascending: false }).limit(5000),
    import("./vias.json"),
  ]);
  for (const r of [paradas, geometria, celdas]) if (r.error) throw new Error(r.error.message);
  const stops = (paradas.data as unknown as FilaParada[] | null) ?? [];
  const geo = geometria.data as unknown as FilaGeometria | null;
  if (stops.length < 2 || !geo) throw new Error("La ruta no tiene paradas o trazado cargados.");

  // Solo el periodo más reciente: las filas llegan de la más nueva a la más vieja.
  const filas = (celdas.data as unknown as FilaCelda[] | null) ?? [];
  const reciente = filas[0]?.term;
  const delPeriodo = filas.filter((c) => c.term === reciente);

  return {
    ruta: {
      id: ruta.id,
      coords: geo.coords,
      legs: geo.leg_distances_m,
      duracionS: geo.duration_s,
      stops: stops.map((s) => ({ name: s.name, lon: s.lon, lat: s.lat })),
      vehiculos: ruta.vehicles,
      capacidad: ruta.capacity,
      intervaloMin: ruta.headway_min ?? 15,
      paradaCampusMin: ruta.terminal_dwell_min ?? 5,
    },
    celdas: delPeriodo.length ? delPeriodo.map((c) => ({ lon: c.lon, lat: c.lat, n: c.students })) : null,
    vias: (vias.default as unknown as [number, number[]][]) ?? [],
  };
}

export async function guardarPropuesta(rutaId: string, autor: string | null, p: PropuestaGuardar): Promise<void> {
  const nombre = `Propuesta del ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`;
  const { error } = await supabase.from("bus_proposals" as never).insert({
    route_id: rutaId,
    name: nombre,
    params: p.params,
    stops: p.stops,
    coverage_gain: p.coverage_gain,
    trips_gain: p.trips_gain,
    created_by: autor,
  } as never);
  if (error) throw new Error(error.message);
}

export async function guardarFlota(rutaId: string, f: FlotaGuardar): Promise<void> {
  const { error } = await supabase
    .from("bus_routes" as never)
    .update({ vehicles: f.vehiculos, headway_min: f.intervaloMin, terminal_dwell_min: f.paradaCampusMin, updated_at: new Date().toISOString() } as never)
    .eq("id", rutaId);
  if (error) throw new Error(error.message);
}

/* --- Rutas nuevas ---------------------------------------------------------- */

const OSRM = (import.meta.env.VITE_OSRM_URL as string | undefined)?.replace(/\/$/, "") ?? "https://router.project-osrm.org";

interface RespuestaOsrm {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { distance: number }[] }[];
  waypoints?: { location: [number, number] }[];
}

/** El trazado por carretera de unas paradas en orden, con las paradas ajustadas a la calle. */
export async function trazarRuta(paradas: ParadaRuta[]): Promise<{ coords: [number, number][]; legs: number[]; distance: number; duration: number; paradas: ParadaRuta[] }> {
  const coordenadas = paradas.map((p) => `${p.lon},${p.lat}`).join(";");
  const resp = await fetch(`${OSRM}/route/v1/driving/${coordenadas}?overview=full&geometries=geojson&steps=false&continue_straight=false`);
  if (!resp.ok) throw new Error(`El motor de rutas respondió ${resp.status}.`);
  const json = (await resp.json()) as RespuestaOsrm;
  const r = json.routes?.[0];
  if (json.code !== "Ok" || !r) throw new Error("El motor de rutas no encontró un camino entre esas paradas.");
  return {
    coords: r.geometry.coordinates.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number]),
    legs: r.legs.map((l) => Math.round(l.distance)),
    distance: Math.round(r.distance),
    duration: Math.round(r.duration),
    paradas: paradas.map((p, i) => {
      const w = json.waypoints?.[i]?.location;
      return w ? { name: p.name, lon: Math.round(w[0] * 1e5) / 1e5, lat: Math.round(w[1] * 1e5) / 1e5 } : p;
    }),
  };
}

/** Crea la ruta, sus paradas y su trazado. Si algo falla a medias, deshace la ruta. Devuelve su id. */
export async function crearRuta(nueva: RutaNueva): Promise<string> {
  const base = paradasDelRecorrido(nueva.paradas, nueva.regreso);
  const trazo = await trazarRuta(base);
  const ins = await supabase
    .from("bus_routes" as never)
    .insert({
      code: nueva.code,
      name: nueva.name,
      vehicles: nueva.vehiculos,
      capacity: nueva.capacidad,
      headway_min: nueva.intervaloMin,
      terminal_dwell_min: nueva.paradaCampusMin,
    } as never)
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.code === "23505" ? "Ya existe una ruta con ese código." : ins.error.message);
  const id = (ins.data as unknown as { id: string }).id;
  const deshacer = async (motivo: string): Promise<never> => {
    await supabase.from("bus_routes" as never).delete().eq("id", id);
    throw new Error(motivo);
  };
  const paradas = await supabase.from("bus_stops" as never).insert(trazo.paradas.map((p, i) => ({ route_id: id, seq: i, name: p.name, lon: p.lon, lat: p.lat })) as never);
  if (paradas.error) return deshacer(paradas.error.message);
  const geo = await supabase.from("bus_route_geometry" as never).insert({ route_id: id, coords: trazo.coords, distance_m: trazo.distance, duration_s: trazo.duration, leg_distances_m: trazo.legs } as never);
  if (geo.error) return deshacer(geo.error.message);
  return id;
}
