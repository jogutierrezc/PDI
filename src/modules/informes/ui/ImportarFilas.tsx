/* Barra de Excel para las secciones de tipo «filas»: plantilla descargable, importar con vista previa
   y bajar lo escrito. Sigue el patrón de ResultadosManuales; la lectura vive en filas-excel.ts. */

import { useRef, useState } from "react";
import { leerFilasSeccion } from "../filas-excel";
import type { LecturaFilas } from "../filas-excel";
import { mensajeDe } from "./comunes";
import { descargarLibro, leerHoja } from "./excel";

interface Props {
  columnas: string[];
  filas: string[][];
  editable: boolean;
  /** Parte del nombre del archivo, p. ej. «puntos-criticos». */
  archivo: string;
  /** Lista desplegable para la primera columna (solo si es «Dimensión»). */
  dimensiones?: string[];
  cambiar: (filas: string[][]) => void;
  /** Filas de ejemplo de la plantilla; sin ellas, se arman dos con el nombre de cada columna. */
  ejemplo?: string[][];
  /** Líneas de ayuda propias de la sección, antes de las generales. */
  ayuda?: string[];
  /** Máximo de filas que admite la sección (el resto de un archivo se omite, con aviso). */
  tope?: number;
}

export function ImportarFilas({ columnas, filas, editable, archivo, dimensiones, cambiar, ejemplo: ejemploPropio, ayuda = [], tope }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<(LecturaFilas & { archivo: string }) | { error: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  if (!editable) return null;

  const cols = columnas.map((t, n) => ({ titulo: t, ancho: n === 0 && dimensiones ? 34 : 30 }));
  const listas = dimensiones ? { 0: dimensiones.map((d) => d.replace(/,/g, " ")) } : undefined;

  const plantilla = async () => {
    setAviso("");
    try {
      const ejemplo = ejemploPropio ?? [0, 1].map((n) => columnas.map((c, i) => (i === 0 && dimensiones ? (dimensiones[n] ?? "") : `Ejemplo: ${c.toLowerCase()} (borre esta fila)`)));
      await descargarLibro(`plantilla-${archivo}.xlsx`, [
        {
          nombre: "Filas",
          columnas: cols,
          filas: ejemplo,
          listas,
          ayuda: [
            ...(ayuda.length ? ayuda : ["Una fila por punto."]),
            "Borre las filas de ejemplo antes de subir el archivo.",
            `Columnas: ${columnas.join(", ")}. No cambie los encabezados de la primera fila.`,
            ...(dimensiones ? ["Dimensión: elija de la lista; si escribe otra, se importa igual como texto libre."] : []),
            "Una fila con alguna celda vacía se importa, pero la sección no queda lista hasta completarla.",
            "Las fechas se pasan a dd/mm/aaaa. Máximo 500 filas.",
          ].join("\n"),
        },
      ]);
    } catch (e) {
      setAviso(`No se pudo crear la plantilla: ${mensajeDe(e)}`);
    }
  };

  const exportar = async () => {
    setAviso("");
    try {
      await descargarLibro(`${archivo}.xlsx`, [{ nombre: "Filas", columnas: cols, filas, listas }]);
    } catch (e) {
      setAviso(`No se pudo crear el Excel: ${mensajeDe(e)}`);
    }
  };

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setOcupado(true);
    try {
      const hoja = await leerHoja(f, "Filas");
      const r = leerFilasSeccion(columnas, hoja, dimensiones);
      setPrevia(r.filas.length ? { ...r, archivo: f.name } : { error: r.avisos.join(" ") });
    } catch (e) {
      setPrevia({ error: `No se pudo abrir el Excel: ${mensajeDe(e)}` });
    }
    setOcupado(false);
    if (entrada.current) entrada.current.value = "";
  };

  const usar = (reemplazar: boolean) => {
    if (!previa || "error" in previa) return;
    const todas = reemplazar ? previa.filas : [...filas, ...previa.filas];
    cambiar(tope ? todas.slice(0, tope) : todas);
    setAviso(tope && todas.length > tope ? `La sección admite ${tope} filas: se dejaron las primeras ${tope}.` : "");
    setPrevia(null);
  };

  return (
    <div className="inf-fx">
      <div className="inf-row inf-plan__barra">
        <input ref={entrada} type="file" hidden accept=".xlsx" onChange={(e) => void leer(e.target.files?.[0])} />
        <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => void plantilla()}>
          Descargar plantilla
        </button>
        <button type="button" className="inf-btn inf-btn--sm" disabled={ocupado} onClick={() => entrada.current?.click()}>
          Importar Excel
        </button>
        {filas.length > 0 && (
          <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => void exportar()}>
            Bajar lo escrito
          </button>
        )}
      </div>

      {aviso && (
        <p className="inf-hint" role="status">
          {aviso}
        </p>
      )}

      {previa && (
        <div className="inf-nota" role="status">
          {"error" in previa ? (
            <>
              <b>No se pudo leer el archivo</b>
              {previa.error}
              <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setPrevia(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <b>
                Vista previa · {previa.filas.length} {previa.filas.length === 1 ? "fila" : "filas"} de {previa.archivo}
              </b>
              {previa.avisos.length > 0 && (
                <ul>
                  {previa.avisos.slice(0, 8).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  {previa.avisos.length > 8 && <li>y {previa.avisos.length - 8} avisos más.</li>}
                </ul>
              )}
              <span className="inf-row">
                <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={() => usar(false)}>
                  Añadir a lo que ya hay
                </button>
                {filas.length > 0 && (
                  <button type="button" className="inf-btn inf-btn--sm" onClick={() => window.confirm(`Reemplaza las ${filas.length} filas escritas. ¿Continuar?`) && usar(true)}>
                    Reemplazar todo
                  </button>
                )}
                <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setPrevia(null)}>
                  Descartar
                </button>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
