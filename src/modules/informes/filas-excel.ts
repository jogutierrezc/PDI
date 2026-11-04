/* Lectura de Excel para las secciones de tipo «filas» (puntos críticos, retos y oportunidades).
   Lógica pura, sin React: asocia las columnas del archivo con las de la sección y avisa de lo que falte. */

export const MAX_FILAS = 500;

export interface LecturaFilas {
  filas: string[][];
  avisos: string[];
}

/** Sin tildes, sin mayúsculas y sin espacios, para comparar encabezados. */
export const clave = (t: string): string =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");

/** Fecha ISO (aaaa-mm-dd) a dd/mm/aaaa; el resto, el texto recortado. */
function limpiar(v: unknown): string {
  const t = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

export function leerFilasSeccion(columnas: string[], hoja: string[][], dimensiones?: string[]): LecturaFilas {
  const avisos: string[] = [];
  try {
    if (!columnas.length) return { filas: [], avisos: ["Esta sección no tiene columnas definidas."] };
    if (!hoja || hoja.length < 2) return { filas: [], avisos: ["El archivo no tiene filas debajo del encabezado."] };

    const cab = (hoja[0] ?? []).map((x) => clave(String(x ?? "")));
    const destinos = columnas.map((c) => cab.indexOf(clave(c)));
    const porNombre = destinos.every((i) => i >= 0);
    // Por nombre si coinciden todos; si no, por posición.
    const origen = porNombre ? destinos : columnas.map((_, i) => i);
    if (!porNombre) avisos.push("Los encabezados no coinciden con los de la plantilla; se leyó por posición de columna.");

    const filas: string[][] = [];
    const claveDims = (dimensiones ?? []).map(clave);
    let sinDim = 0;
    for (let n = 1; n < hoja.length; n++) {
      const f = origen.map((i) => limpiar(hoja[n]?.[i]));
      if (f.every((x) => x === "")) continue;
      if (filas.length >= MAX_FILAS) {
        avisos.push(`Solo se importan las primeras ${MAX_FILAS} filas; el resto se omitió.`);
        break;
      }
      columnas.forEach((c, i) => {
        if (f[i] === "") avisos.push(`Fila ${n + 1}: falta ${c}`);
      });
      if (claveDims.length && f[0] && !claveDims.includes(clave(f[0]))) sinDim++;
      filas.push(f);
    }
    if (sinDim) avisos.push(`${sinDim} ${sinDim === 1 ? "fila tiene" : "filas tienen"} una dimensión que no es ninguna de las conocidas; se importó como texto libre.`);
    if (!filas.length) avisos.push("No se encontró ninguna fila con contenido.");
    return { filas, avisos };
  } catch {
    return { filas: [], avisos: ["No se pudo interpretar el contenido del archivo."] };
  }
}
