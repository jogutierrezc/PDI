/* =============================================================================
   UDrive · pegar desde Excel e importar un Excel o CSV dentro de una tabla.

   Las dos ventanas muestran qué entendieron (columnas, filas, valores por
   revisar) antes de tocar la tabla, y la persona decide si agrega al final o
   reemplaza. Nada sale del navegador.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Ventana } from "../../../components/espacio/Ventana";
import { leerArchivoEnNavegador } from "../../programas-en-cifras/ui/leer-excel";
import { matrizDeTexto, pegarEnFilas, tablaDesdeMatriz, MAX_FILAS } from "../lib/tabla";
import type { ColumnaUd, FilaUd } from "../tipos";

export type Aplicar = { modo: "agregar"; filas: FilaUd[] } | { modo: "reemplazar"; filas: FilaUd[]; columnas?: ColumnaUd[] };

const id = () => crypto.randomUUID();

export function PegarExcel({ columnas, onAplicar, onCerrar }: { columnas: ColumnaUd[]; onAplicar: (a: Aplicar) => void; onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const [encabezado, setEncabezado] = useState(true);
  const [modo, setModo] = useState<"agregar" | "reemplazar">("agregar");
  const r = useMemo(() => (texto.trim() ? pegarEnFilas(columnas, matrizDeTexto(texto), { conEncabezado: encabezado }, id) : null), [texto, encabezado, columnas]);
  const reconocidas = r ? r.columnas.filter(Boolean).length : 0;
  const total = r?.filas.length ?? 0;
  const demasiadas = total > MAX_FILAS;
  return (
    <Ventana
      titulo="Pegar desde Excel"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="es-btn es-btn--pri" disabled={!total || !reconocidas || demasiadas} onClick={() => r && onAplicar({ modo, filas: r.filas })}>
            {modo === "agregar" ? `Agregar ${total} ${total === 1 ? "fila" : "filas"}` : `Reemplazar con ${total} ${total === 1 ? "fila" : "filas"}`}
          </button>
        </>
      }
    >
      <div className="es-dbody es-dbody--solo">
        <label className="es-fl">
          Copie las celdas en Excel y péguelas aquí (Ctrl+V)
          <textarea className="es-inp ud-pegar" data-foco value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Bloque\tAmbiente\t% total de uso\nMotilón\tQUÍMICA\t48,3"} spellCheck={false} />
        </label>
        <label className="es-ck">
          <input type="checkbox" checked={encabezado} onChange={(e) => setEncabezado(e.target.checked)} /> La primera fila son los encabezados (se buscan por nombre de columna)
        </label>
        <div className="es-chips" role="group" aria-label="Qué hacer con las filas">
          <button type="button" className="es-chip" aria-pressed={modo === "agregar"} onClick={() => setModo("agregar")}>Agregar al final</button>
          <button type="button" className="es-chip" aria-pressed={modo === "reemplazar"} onClick={() => setModo("reemplazar")}>Reemplazar las filas</button>
        </div>
        {r ? (
          <>
            <p className={`ud-aviso`} data-t={reconocidas ? (r.errores.length ? "aviso" : "ok") : "error"} role="status">
              {reconocidas ? `${total} ${total === 1 ? "fila entendida" : "filas entendidas"} en ${reconocidas} ${reconocidas === 1 ? "columna" : "columnas"}.` : encabezado ? "Ninguna columna del texto pegado se llama como una columna de la tabla. Pruebe sin encabezados." : "No hay columnas donde pegar."}
              {r.errores.length ? ` ${r.errores.length} ${r.errores.length === 1 ? "valor" : "valores"} por revisar: quedarán en rojo.` : ""}
              {demasiadas ? ` Son demasiadas filas (el máximo es ${MAX_FILAS}).` : ""}
            </p>
            {r.errores.length ? <ul className="ud-errores">{r.errores.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
          </>
        ) : null}
      </div>
    </Ventana>
  );
}

export function ImportarTabla({ archivo, columnas, onAplicar, onCerrar }: { archivo: File; columnas: ColumnaUd[]; onAplicar: (a: Aplicar) => void; onCerrar: () => void }) {
  const [matriz, setMatriz] = useState<(string | number | Date | null)[][] | null>(null);
  const [error, setError] = useState("");
  const [modo, setModo] = useState<"agregar" | "reemplazar">(columnas.length ? "reemplazar" : "reemplazar");
  useEffect(() => {
    let vivo = true;
    leerArchivoEnNavegador(archivo)
      .then((l) => vivo && setMatriz(l.matriz))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [archivo]);
  const nueva = useMemo(() => (matriz ? tablaDesdeMatriz(matriz, id) : null), [matriz]);
  const agregada = useMemo(() => (matriz && modo === "agregar" ? pegarEnFilas(columnas, matriz, { conEncabezado: true }, id) : null), [matriz, modo, columnas]);
  const filas = modo === "agregar" ? (agregada?.filas.length ?? 0) : (nueva?.filas.length ?? 0);
  const errores = modo === "agregar" ? (agregada?.errores ?? []) : (nueva?.errores ?? []);
  const sinColumnas = modo === "reemplazar" ? !nueva?.columnas.length : !agregada?.columnas.some(Boolean);
  return (
    <Ventana
      titulo={`Importar «${archivo.name}»`}
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar}>Cancelar</button>
          <button
            type="button"
            className="es-btn es-btn--pri"
            disabled={!matriz || !filas || sinColumnas || filas > MAX_FILAS}
            onClick={() => (modo === "agregar" ? agregada && onAplicar({ modo, filas: agregada.filas }) : nueva && onAplicar({ modo, filas: nueva.filas, columnas: nueva.columnas }))}
          >
            {modo === "agregar" ? "Agregar las filas" : "Reemplazar la tabla"}
          </button>
        </>
      }
    >
      <div className="es-dbody es-dbody--solo">
        {error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : !matriz ? <p className="es-note">Leyendo el archivo…</p> : (
          <>
            <div className="es-chips" role="group" aria-label="Qué hacer con el archivo">
              <button type="button" className="es-chip" aria-pressed={modo === "reemplazar"} onClick={() => setModo("reemplazar")}>Reemplazar la tabla</button>
              {columnas.length ? <button type="button" className="es-chip" aria-pressed={modo === "agregar"} onClick={() => setModo("agregar")}>Agregar filas</button> : null}
            </div>
            <p className="es-note">
              {modo === "reemplazar" ? "Las columnas y las filas de la tabla se cambian por las del archivo (con el tipo de cada columna detectado)." : "Las filas se suman al final; cada columna del archivo se busca por nombre."}
            </p>
            <p className="ud-aviso" data-t={sinColumnas ? "error" : errores.length ? "aviso" : "ok"} role="status">
              {sinColumnas ? "No encontré columnas que coincidan." : `${filas} ${filas === 1 ? "fila" : "filas"}${modo === "reemplazar" && nueva ? ` y ${nueva.columnas.length} columnas (encabezados en la fila ${nueva.encabezado})` : ""}.`}
              {errores.length ? ` ${errores.length} ${errores.length === 1 ? "valor" : "valores"} por revisar.` : ""}
            </p>
            {errores.length ? <ul className="ud-errores">{errores.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
          </>
        )}
      </div>
    </Ventana>
  );
}
