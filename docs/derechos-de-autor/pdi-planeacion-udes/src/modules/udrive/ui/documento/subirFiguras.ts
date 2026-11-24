/* =============================================================================
   UDrive · subir las figuras de una importación a UDrive (fase 3).

   Cada imagen que sacó la lectura (de word/media, o recortada de una página
   del PDF) se sube como archivo de imagen a una carpeta «Imágenes de <informe>»
   con el mismo flujo de Subir archivo: se reduce a 2000 px y va a Storage con
   la sesión de la persona. Mientras el servidor esté lento o inestable (una
   subida puede dar 504) se trabaja con poca concurrencia y se reintenta con
   espera; la figura que no se logra subir queda como imagen pendiente y el
   resto del informe no se pierde.
   ========================================================================== */

import { limpiarNombre, nombreUnico } from "../../lib/nombres";
import { sinMarcas } from "../../lib/importar";
import type { ImagenExtraida } from "../../lib/importar";
import { comprimirImagen } from "../navegador";

export interface FiguraASubir {
  /** Posición del elemento en la selección; sirve para devolver su id. */
  pos: number;
  imagen: ImagenExtraida;
  /** Título de la figura (con marcas), para ponerle nombre al archivo. */
  titulo: string;
}

export interface ResultadoSubida {
  ids: Map<number, string>;
  falladas: number[];
  /** Las primeras subidas fallaron todas: se dejó de intentar para no esperar en vano (Storage caído). */
  rendida: boolean;
}

const ESPERAS_MS = [1500, 4000, 9000];
const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const extension = (mime: string) => (/png/i.test(mime) ? ".png" : /webp/i.test(mime) ? ".webp" : /gif/i.test(mime) ? ".gif" : /bmp/i.test(mime) ? ".bmp" : ".jpg");

/** «Figura 03 · Matrícula por sede.png», único entre los nombres ya usados. */
export function nombreDeFigura(n: number, titulo: string, mime: string, usados: readonly string[]): string {
  const t = sinMarcas(titulo).replace(/\s+/g, " ").trim().slice(0, 70);
  const base = `Figura ${String(n).padStart(2, "0")}${t ? ` · ${t}` : ""}`;
  return nombreUnico(limpiarNombre(`${base}${extension(mime)}`, 160), usados);
}

export async function subirFiguras(o: {
  figuras: readonly FiguraASubir[];
  /** Sube un archivo y devuelve el id que le dio UDrive. */
  subir(archivo: File, nombre: string): Promise<string>;
  alAvanzar(hechas: number, total: number, falladas: number): void;
  concurrencia?: number;
}): Promise<ResultadoSubida> {
  const ids = new Map<number, string>();
  const falladas: number[] = [];
  const usados: string[] = [];
  const total = o.figuras.length;
  let siguiente = 0;
  let hechas = 0;

  // Los nombres se reparten antes de subir para que dos subidas a la vez no repitan.
  const nombres = o.figuras.map((f, k) => {
    const nombre = nombreDeFigura(k + 1, f.titulo, f.imagen.mime, usados);
    usados.push(nombre);
    return nombre;
  });

  const una = async (k: number) => {
    const f = o.figuras[k];
    const archivo = await comprimirImagen(new File([f.imagen.blob], nombres[k], { type: f.imagen.mime }));
    // La comprimida puede cambiar de formato; el nombre sigue la extensión final.
    const nombre = archivo.type && extension(archivo.type) !== extension(f.imagen.mime) ? nombres[k].replace(/\.[^.]+$/, extension(archivo.type)) : nombres[k];
    let error: unknown;
    for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
      try {
        ids.set(f.pos, await o.subir(archivo, nombre));
        return;
      } catch (e) {
        error = e;
        if (intento < ESPERAS_MS.length) await esperar(ESPERAS_MS[intento]);
      }
    }
    throw error instanceof Error ? error : new Error("No se pudo subir la figura.");
  };

  let rendida = false;
  const trabajador = async () => {
    for (;;) {
      const k = siguiente++;
      if (k >= total) return;
      if (rendida) {
        falladas.push(o.figuras[k].pos);
      } else {
        try {
          await una(k);
        } catch {
          falladas.push(o.figuras[k].pos);
          // Tres fallas seguidas sin un solo éxito: el servidor no está respondiendo; no se espera por el resto.
          if (ids.size === 0 && falladas.length >= 3) rendida = true;
        }
      }
      hechas++;
      o.alAvanzar(hechas, total, falladas.length);
    }
  };
  o.alAvanzar(0, total, 0);
  await Promise.all(Array.from({ length: Math.min(o.concurrencia ?? 2, Math.max(1, total)) }, () => trabajador()));
  return { ids, falladas, rendida };
}
