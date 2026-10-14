/* =============================================================================
   Biblioteca de evidencias · subir un ZIP ya revisado.

   Por cada archivo admitido (de a tres a la vez, con la cola de cola.ts):
     1. se descomprime solo ese archivo (zip-seguro.ts);
     2. se calcula su SHA-256: si ya está en la biblioteca, se omite y se avisa
        (así reanudar una subida cortada no duplica nada);
     3. se lee su texto sin IA (extraer-texto.ts) y Pilo lo clasifica
        (clasificar.ts);
     4. se guarda en el bucket y en la tabla (datos.ts).
   Los errores de red se reintentan; un ZIP dañado o un archivo repetido, no.

   `guardar` y `leerTexto` se inyectan para probar sin red.
   ========================================================================== */

import { clasificarArchivo } from "./clasificar";
import { ejecutarCola } from "./cola";
import type { ArchivoNuevo } from "./datos";
import { YaGuardado } from "./errores";
import { extraerTexto } from "./extraer-texto";
import type { TextoExtraido } from "./extraer-texto";
import { ZipInvalido, extraerEntrada, sha256 } from "./zip-seguro";
import type { ArchivoZip } from "./zip-seguro";

export type EstadoArchivoSubida = "guardado" | "repetido" | "fallido" | "cancelado";

export interface ResultadoSubida {
  ruta: string;
  estado: EstadoArchivoSubida;
  mensaje: string | null;
}

export interface ProgresoSubida {
  total: number;
  hechos: number;
  guardados: number;
  repetidos: number;
  fallidos: number;
  bytesTotal: number;
  bytesHechos: number;
}

export interface OpcionesSubida {
  ciclo: string | null;
  zipNombre: string;
  /** SHA-256 ya guardados → ruta con la que se guardaron. Se va llenando. */
  conocidos: Map<string, string>;
  signal?: AbortSignal;
  concurrencia?: number;
  alAvanzar?: (p: ProgresoSubida, r: ResultadoSubida) => void;
  guardar: (a: ArchivoNuevo) => Promise<void>;
  leerTexto?: (bytes: Uint8Array, ext: string) => Promise<TextoExtraido>;
  /** Espera entre reintentos (ms); en pruebas, 0. */
  espera?: (intento: number) => number;
}

export function progresoInicial(archivos: ArchivoZip[]): ProgresoSubida {
  return { total: archivos.length, hechos: 0, guardados: 0, repetidos: 0, fallidos: 0, bytesTotal: archivos.reduce((s, a) => s + a.entrada.tamano, 0), bytesHechos: 0 };
}

/** Sube los archivos admitidos del ZIP. Nunca lanza: cada archivo vuelve con su estado. */
export async function subirZip(zip: Blob, archivos: ArchivoZip[], o: OpcionesSubida): Promise<ResultadoSubida[]> {
  const leer = o.leerTexto ?? extraerTexto;
  const progreso = progresoInicial(archivos);

  const trabajo = async (a: ArchivoZip, signal?: AbortSignal): Promise<ResultadoSubida> => {
    const bytes = await extraerEntrada(zip, a.entrada, signal);
    const hash = await sha256(bytes);
    const previo = o.conocidos.get(hash);
    if (previo !== undefined) {
      return { ruta: a.ruta, estado: "repetido", mensaje: previo === a.ruta ? "Ya estaba en la biblioteca." : `Mismo contenido que «${previo}», ya guardado.` };
    }
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    const t = await leer(bytes, a.ext);
    const clasificacion = clasificarArchivo({ ruta: a.ruta, nombre: a.nombre, carpeta: a.carpeta, ext: a.ext, texto: t.texto });
    try {
      await o.guardar({
        ciclo: o.ciclo,
        zipNombre: o.zipNombre,
        ruta: a.ruta,
        nombre: a.nombre,
        carpeta: a.carpeta,
        ext: a.ext,
        sha256: hash,
        bytes,
        texto: t.texto,
        estadoTexto: t.estado,
        notaTexto: t.nota,
        clasificacion,
      });
    } catch (e) {
      if (e instanceof YaGuardado) {
        o.conocidos.set(hash, a.ruta);
        return { ruta: a.ruta, estado: "repetido", mensaje: "Ya estaba en la biblioteca." };
      }
      throw e;
    }
    o.conocidos.set(hash, a.ruta);
    return { ruta: a.ruta, estado: "guardado", mensaje: t.nota };
  };

  const resultados = await ejecutarCola(archivos, trabajo, {
    concurrencia: o.concurrencia ?? 3,
    reintentos: 2,
    espera: o.espera,
    signal: o.signal,
    reintentable: (e) => !(e instanceof ZipInvalido) && !(e instanceof YaGuardado),
    alTerminar: (a, _i, r) => {
      const res: ResultadoSubida = r.ok ? r.valor : { ruta: a.ruta, estado: r.cancelada ? "cancelado" : "fallido", mensaje: r.ok ? null : r.error };
      if (res.estado !== "cancelado") progreso.hechos++;
      if (res.estado === "guardado") progreso.guardados++;
      else if (res.estado === "repetido") progreso.repetidos++;
      else if (res.estado === "fallido") progreso.fallidos++;
      if (res.estado !== "cancelado") progreso.bytesHechos += a.entrada.tamano;
      o.alAvanzar?.({ ...progreso }, res);
    },
  });

  return resultados.map((r, i) => (r.ok ? r.valor : { ruta: archivos[i].ruta, estado: r.cancelada ? "cancelado" : "fallido", mensaje: r.error }));
}
