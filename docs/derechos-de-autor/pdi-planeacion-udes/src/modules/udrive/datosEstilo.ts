/* =============================================================================
   UDrive · los estilos guardados (migración 0190).

   Un estilo propio es un archivo de UDrive de tipo «estilo»: vive en una
   carpeta, se comparte, se mueve y se borra como cualquier otro. Esta capa lee
   la lista (la misma consulta que el explorador, filtrada) y el contenido de
   uno, y arma el estilo listo para aplicar. Los cuatro estilos de fábrica no
   pasan por la base: están en lib/estilo.ts.

   Mientras 0190 no se aplique, la lista de estilos guardados sale vacía y
   crear uno falla con el aviso de la migración (datos.ts → errorDe).
   ========================================================================== */

import { useMemo } from "react";
import { pedirContenido, useArchivos } from "./datos";
import { VERSION_FABRICA } from "./lib/aplicarEstilo";
import { ESTILO_SIN_ELEGIR, estiloDeFabrica, normalizarEstilo } from "./lib/estilo";
import type { Estilo } from "./lib/estilo";
import type { ArchivoRow } from "./tipos";

/** Los estilos propios que veo (sin los de la papelera). */
export function useEstilosGuardados(): { estilos: ArchivoRow[]; cargando: boolean } {
  const archivos = useArchivos();
  const estilos = useMemo(() => (archivos.data ?? []).filter((a) => a.tipo === "estilo" && !a.borrado_en).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [archivos.data]);
  return { estilos, cargando: archivos.isPending };
}

/** Lee un estilo por su id: de fábrica (`f:…`) o un archivo de UDrive. Nunca lanza por un contenido malo: lo normaliza. */
export async function leerEstilo(id: string): Promise<{ estilo: Estilo; v: string } | null> {
  if (id.startsWith("f:")) return { estilo: estiloDeFabrica(id), v: VERSION_FABRICA };
  const c = await pedirContenido(id);
  if (!c || c.tipo !== "estilo") return null;
  const estilo = normalizarEstilo(c.contenido, estiloDeFabrica(ESTILO_SIN_ELEGIR));
  return { estilo: { ...estilo, nombre: c.nombre.slice(0, 60) || estilo.nombre }, v: c.updated_at };
}
