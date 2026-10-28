/* =============================================================================
   Pilo at Work · datos en este equipo (lado de la página).

   Guarda el ESQUEMA del archivo abierto y habla con el worker. Las filas nunca llegan
   aquí. A la IA solo viaja: la pregunta, el esquema que la persona dejó permitido y los
   agregados que aprobó uno por uno. `filasEnviadas` cuenta lo que salió y sube solo si
   alguna vez se aprobara enviar filas (hoy no existe esa opción: siempre 0).
   ========================================================================== */

import type { Columna, Entrada } from "./datos.worker";

export interface ArchivoAbierto {
  nombre: string;
  total: number;
  columnas: (Columna & { compartir: boolean })[];
  muestra: (string | number | boolean | null)[][];
}
export interface Agregado {
  total: number;
  grupos: number;
  resultado: { grupo: string; valor: number; n: number }[];
}

let worker: Worker | null = null;
let id = 0;
const espera = new Map<number, { ok: (v: unknown) => void; no: (e: Error) => void }>();

let abierto: ArchivoAbierto | null = null;
const oyentes = new Set<() => void>();
export const datosAbiertos = () => abierto;
export const alCambiar = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};
const avisar = () => oyentes.forEach((f) => f());

type SinId<T> = T extends unknown ? Omit<T, "id"> : never;

function enviar<T>(m: SinId<Entrada>, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./datos.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; datos?: unknown; error?: string }>) => {
      const p = espera.get(e.data.id);
      espera.delete(e.data.id);
      if (p) e.data.ok ? p.ok(e.data.datos) : p.no(new Error(e.data.error));
    };
    worker.onerror = () => {
      for (const p of espera.values()) p.no(new Error("El lector de archivos falló."));
      espera.clear();
    };
  }
  const mine = ++id;
  return new Promise<T>((ok, no) => {
    espera.set(mine, { ok: ok as (v: unknown) => void, no });
    worker!.postMessage({ ...m, id: mine } as Entrada, transfer);
  });
}

export async function abrirArchivo(archivo: File): Promise<ArchivoAbierto> {
  if (archivo.size > 40 * 1024 * 1024) throw new Error("El archivo pesa más de 40 MB. Pruebe con uno más pequeño.");
  const buffer = await archivo.arrayBuffer();
  const r = await enviar<{ columnas: Columna[]; total: number; muestra: ArchivoAbierto["muestra"] }>({ accion: "abrir", nombre: archivo.name, buffer }, [buffer]);
  abierto = { nombre: archivo.name, total: r.total, muestra: r.muestra, columnas: r.columnas.map((c) => ({ ...c, compartir: !c.sensible })) };
  avisar();
  return abierto;
}

export async function cerrarArchivo() {
  abierto = null;
  avisar();
  await enviar({ accion: "cerrar" });
}

export function permitirColumna(nombre: string, v: boolean) {
  if (!abierto) return;
  // Un objeto nuevo en cada cambio: así la página (useSyncExternalStore) se entera.
  abierto = { ...abierto, columnas: abierto.columnas.map((c) => (c.nombre === nombre && !c.sensible ? { ...c, compartir: v } : c)) };
  avisar();
}

export const calcular = (op: string, columna: string, agrupar: string, limite = 15) => enviar<Agregado>({ accion: "agregar", op, columna, agrupar, limite });

/** Lo único del archivo que puede viajar a la IA sin pedir permiso: nombres y tipos de las columnas permitidas. */
export function esquemaPermitido() {
  if (!abierto) return null;
  return { archivo: abierto.nombre, filas: abierto.total, columnas: abierto.columnas.filter((c) => c.compartir).map((c) => ({ nombre: c.nombre, tipo: c.tipo })), cerradas: abierto.columnas.filter((c) => !c.compartir).length };
}
