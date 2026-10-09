/* Rutas UDES · los tipos que cruzan entre la carga de datos y el motor del mapa. */

export interface ParadaRuta {
  name: string;
  lon: number;
  lat: number;
}

export interface DatosRutas {
  ruta: {
    id: string;
    /** El trazado por carretera, [lon, lat] en orden. */
    coords: [number, number][];
    /** Metros de cada tramo entre paradas consecutivas. */
    legs: number[];
    /** Segundos que el motor de rutas calcula para un carro, sin paradas: calibra la velocidad del bus. */
    duracionS: number | null;
    stops: ParadaRuta[];
    vehiculos: number;
    capacidad: number;
    /** Cada cuántos minutos sale un bus desde la UDES. */
    intervaloMin: number;
    /** Cuántos minutos descansa un bus en la UDES antes de poder volver a salir. */
    paradaCampusMin: number;
  };
  /** Estudiantes agregados por celda. Null o vacío: el motor usa una muestra ilustrativa. */
  celdas: { lon: number; lat: number; n: number }[] | null;
  /** Calles de OpenStreetMap codificadas por deltas (vias.json): demanda ilustrativa y paradas candidatas. */
  vias: [number, number[]][];
}

export interface ResumenRuta {
  id: string;
  code: string;
  name: string;
}

export interface PropuestaGuardar {
  params: Record<string, unknown>;
  stops: unknown[];
  coverage_gain: number;
  trips_gain: number;
}

export interface FlotaGuardar {
  vehiculos: number;
  intervaloMin: number;
  paradaCampusMin: number;
}

export interface OpcionesRutas {
  guardarPropuesta: (p: PropuestaGuardar) => Promise<void>;
  guardarFlota: (f: FlotaGuardar) => Promise<void>;
}

/** Lo que pide el formulario para cargar una ruta nueva. */
export interface RutaNueva {
  code: string;
  name: string;
  vehiculos: number;
  capacidad: number;
  intervaloMin: number;
  paradaCampusMin: number;
  /** Las paradas en orden. La primera es la UDES. */
  paradas: ParadaRuta[];
  /** Agrega la primera parada al final para cerrar el circuito. */
  circuito: boolean;
}
