/* Sección libre (0276): los bloques que arma Planeación y llena la unidad, en orden.
   Hay tres clases: texto, tablas o gráficas de UDrive (referencia viva) y tabla de Excel
   (copia fija: se pega o se sube y queda guardada en el bloque). Para sumar otra clase se
   agrega a BloqueLibre y un caso aquí, en armado.tsx y en Revision.tsx. */

import { useState } from "react";
import type { CifraVista } from "../cifras-vivas";
import { MAX_COLUMNAS, MAX_FILAS, armarTabla, leerDelimitado, leerPegado, leerRango, recortar, tablaConDatos } from "../tabla-libre";
import type { BloqueTabla } from "../tabla-libre";
import type { Resolver } from "../tokens";
import type { BloqueLibre } from "../types";
import { ElementosDrive } from "./ElementosDrive";
import { leerHojaPosicional, nombresDeHojas } from "./excel";
import { CampoTexto } from "./Texto";
import { fmtFecha, mensajeDe } from "./comunes";

const nuevoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);

const tablaVacia = (): BloqueTabla => ({ id: nuevoId(), tipo: "tabla", titulo: "", nota: "", origen: "", cargada: "", encabezados: [], filas: [] });

/** La tabla como se lee (solo lectura): revisión y editor sin permiso. */
export function TablaLibreVista({ b }: { b: BloqueTabla }) {
  return (
    <figure className="inf-fig">
      {b.titulo.trim() && <figcaption>{b.titulo}</figcaption>}
      <div className="inf-dimtab-wrap">
        <table className="inf-dimtab">
          <thead>
            <tr>
              {b.encabezados.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i}>
                {b.encabezados.map((_, k) => (
                  <td key={k}>{f[k] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.nota.trim() && (
        <p className="inf-hint">
          <b>Nota.</b> {b.nota}
        </p>
      )}
    </figure>
  );
}

/** Pegar desde Excel o subir un archivo; entrega filas crudas y el origen. */
function ImportarTabla({ alImportar, cancelar }: { alImportar: (crudas: string[][], conEncabezado: boolean, origen: string) => void; cancelar?: () => void }) {
  const [texto, setTexto] = useState("");
  const [conEncabezado, setConEncabezado] = useState(true);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);
  const [hoja, setHoja] = useState("");
  const [rango, setRango] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const esCsv = archivo ? /\.csv$/i.test(archivo.name) : false;

  const pegar = () => {
    const crudas = leerPegado(texto);
    if (!crudas.some((f) => f.some((c) => c.trim()))) return setError("No hay nada que convertir. Copie las celdas en Excel y péguelas aquí.");
    setError("");
    alImportar(crudas, conEncabezado, "Pegado desde Excel");
  };

  const elegir = async (f: File | undefined) => {
    setArchivo(f ?? null);
    setHojas([]);
    setHoja("");
    setError("");
    if (!f) return;
    if (/\.xls$/i.test(f.name)) return setError("Los .xls antiguos no se pueden leer aquí. Ábralo en Excel y guárdelo como .xlsx o .csv.");
    if (/\.csv$/i.test(f.name)) return;
    try {
      const n = await nombresDeHojas(f);
      setHojas(n);
      setHoja(n[0] ?? "");
    } catch (e) {
      setError(`No se pudo leer el archivo: ${mensajeDe(e)}`);
    }
  };

  const subir = async () => {
    if (!archivo) return;
    setError("");
    const r = rango.trim() ? leerRango(rango) : null;
    if (rango.trim() && !r) return setError("El rango no se entiende. Escriba algo como B2:F30, o déjelo vacío para toda la hoja.");
    setOcupado(true);
    try {
      const csv = esCsv ? await archivo.text() : "";
      let crudas = esCsv ? leerDelimitado(csv, (csv.split("\n")[0] ?? "").includes(";") ? ";" : ",") : await leerHojaPosicional(archivo, hoja);
      if (r) crudas = recortar(crudas, r);
      if (!crudas.some((f) => f.some((c) => c.trim()))) return setError("El archivo o el rango no tienen datos.");
      alImportar(crudas, conEncabezado, `${archivo.name}${esCsv ? "" : ` · hoja ${hoja}`}${r ? ` · ${rango.trim().toUpperCase()}` : ""}`);
    } catch (e) {
      setError(`No se pudo leer el archivo: ${mensajeDe(e)}`);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="inf-stack" style={{ gap: "var(--space-3)" }}>
      <label className="inf-lab">
        Pegue aquí las celdas copiadas de Excel
        <textarea className="inf-in" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Seleccione las celdas en Excel, cópielas (Ctrl+C) y péguelas aquí (Ctrl+V)" />
      </label>
      <label className="inf-chk">
        <input type="checkbox" checked={conEncabezado} onChange={(e) => setConEncabezado(e.target.checked)} /> La primera fila es el encabezado
      </label>
      <div className="inf-row">
        <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={pegar} disabled={!texto.trim()}>
          Convertir en tabla
        </button>
        {cancelar && (
          <button type="button" className="inf-btn inf-btn--sm" onClick={cancelar}>
            Cancelar
          </button>
        )}
      </div>
      <div className="inf-row" style={{ flexWrap: "wrap" }}>
        <label className="inf-lab">
          O suba un archivo (.xlsx o .csv)
          <input className="inf-in" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void elegir(e.target.files?.[0])} />
        </label>
        {hojas.length > 1 && (
          <label className="inf-lab">
            Hoja
            <select className="inf-in" value={hoja} onChange={(e) => setHoja(e.target.value)}>
              {hojas.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
        )}
        {archivo && (
          <label className="inf-lab">
            Rango (opcional)
            <input className="inf-in" style={{ width: "9rem" }} value={rango} onChange={(e) => setRango(e.target.value)} placeholder="Toda la hoja" />
          </label>
        )}
        {archivo && (hojas.length > 0 || esCsv) && (
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => void subir()} disabled={ocupado}>
            {ocupado ? "Leyendo…" : "Usar el archivo"}
          </button>
        )}
      </div>
      <small className="inf-hint">
        Es una copia: no sigue al archivo de origen. Máximo {MAX_FILAS} filas y {MAX_COLUMNAS} columnas; para tablas mayores use una tabla de UDrive.
      </small>
      {error && (
        <p className="inf-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EditorTabla({ b, poner }: { b: BloqueTabla; poner: (b: BloqueTabla) => void }) {
  const [reemplazando, setReemplazando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const hay = tablaConDatos(b);

  const importar = (crudas: string[][], conEncabezado: boolean, origen: string) => {
    const t = armarTabla(crudas, conEncabezado);
    setAvisos(t.avisos);
    setReemplazando(false);
    poner({ ...b, encabezados: t.encabezados, filas: t.filas, origen, cargada: new Date().toISOString() });
  };
  const celda = (i: number, k: number, v: string) => poner({ ...b, filas: b.filas.map((f, x) => (x === i ? f.map((c, y) => (y === k ? v : c)) : f)) });
  const quitarFila = (i: number) => poner({ ...b, filas: b.filas.filter((_, x) => x !== i) });
  const quitarColumna = (k: number) => poner({ ...b, encabezados: b.encabezados.filter((_, y) => y !== k), filas: b.filas.map((f) => f.filter((_, y) => y !== k)) });

  if (!hay || reemplazando) {
    return (
      <div className="inf-blk">
        <div className="inf-blk__lab">
          <span className="inf-src">Tabla de Excel · copia fija</span>
        </div>
        <ImportarTabla alImportar={importar} cancelar={hay ? () => setReemplazando(false) : undefined} />
      </div>
    );
  }
  return (
    <div className="inf-blk">
      <div className="inf-blk__lab">
        <span className="inf-src">
          Tabla de Excel · copia fija de «{b.origen || "origen desconocido"}»{b.cargada ? `, cargada el ${fmtFecha(b.cargada)}` : ""}. No se actualiza sola.
        </span>
      </div>
      {avisos.map((a) => (
        <p key={a} className="inf-error" role="alert">
          {a}
        </p>
      ))}
      <div className="inf-form">
        <input className="inf-in" value={b.titulo} onChange={(e) => poner({ ...b, titulo: e.target.value })} placeholder="Título de la tabla" aria-label="Título de la tabla" maxLength={200} />
        <input className="inf-in" value={b.nota} onChange={(e) => poner({ ...b, nota: e.target.value })} placeholder="Nota o fuente" aria-label="Nota o fuente de la tabla" maxLength={500} />
      </div>
      <div className="inf-dimtab-wrap">
        <table className="inf-dimtab">
          <thead>
            <tr>
              {b.encabezados.map((c, k) => (
                <th key={k} scope="col">
                  <input className="inf-in" value={c} onChange={(e) => poner({ ...b, encabezados: b.encabezados.map((x, y) => (y === k ? e.target.value : x)) })} aria-label={`Encabezado de la columna ${k + 1}`} />
                  <button type="button" className="inf-link" onClick={() => quitarColumna(k)} disabled={b.encabezados.length <= 1}>
                    Quitar columna
                  </button>
                </th>
              ))}
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i}>
                {b.encabezados.map((_, k) => (
                  <td key={k}>
                    <input className="inf-in" value={f[k] ?? ""} onChange={(e) => celda(i, k, e.target.value)} aria-label={`Fila ${i + 1}, columna ${k + 1}`} />
                  </td>
                ))}
                <td>
                  <button type="button" className="inf-link" onClick={() => quitarFila(i)}>
                    Quitar fila
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inf-row">
        <button type="button" className="inf-btn inf-btn--sm" onClick={() => setReemplazando(true)}>
          Reemplazar pegando o subiendo otra
        </button>
      </div>
    </div>
  );
}

export function BloquesLibres({ bloques, editable, cambiar, cifras, resolver }: { bloques: BloqueLibre[]; editable: boolean; cambiar: (b: BloqueLibre[]) => void; cifras: CifraVista[]; resolver: Resolver }) {
  const mover = (i: number, j: number) => {
    if (j < 0 || j >= bloques.length) return;
    const n = [...bloques];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar(n);
  };
  const quitar = (i: number) => {
    const b = bloques[i];
    const lleno = b.tipo === "texto" ? b.texto.trim() !== "" : b.tipo === "drive" ? b.drive.length > 0 : tablaConDatos(b);
    if (lleno && !window.confirm("Este bloque tiene contenido y se borrará. ¿Continuar?")) return;
    cambiar(bloques.filter((_, k) => k !== i));
  };
  const poner = (i: number, b: BloqueLibre) => cambiar(bloques.map((x, k) => (k === i ? b : x)));

  return (
    <>
      {bloques.length === 0 && <p className="inf-muted">{editable ? "Esta sección aún no tiene bloques. Agregue texto, una tabla de Excel o tablas y gráficas de UDrive." : "Sin contenido."}</p>}
      {bloques.map((b, i) => (
        <div key={b.id}>
          {b.tipo === "texto" ? (
            <div className="inf-blk">
              <CampoTexto etiqueta={`Texto ${i + 1}`} valor={b.texto} onChange={(t) => poner(i, { ...b, texto: t })} cifras={cifras} resolver={resolver} editable={editable} />
            </div>
          ) : b.tipo === "drive" ? (
            <ElementosDrive elementos={b.drive} editable={editable} onChange={(drive) => poner(i, { ...b, drive })} />
          ) : editable ? (
            <EditorTabla b={b} poner={(t) => poner(i, t)} />
          ) : tablaConDatos(b) ? (
            <div className="inf-blk">
              <TablaLibreVista b={b} />
            </div>
          ) : null}
          {editable && (
            <div className="inf-row">
              <button type="button" className="inf-link" onClick={() => mover(i, i - 1)} disabled={i === 0}>
                Subir bloque
              </button>
              <button type="button" className="inf-link" onClick={() => mover(i, i + 1)} disabled={i === bloques.length - 1}>
                Bajar bloque
              </button>
              <button type="button" className="inf-link" onClick={() => quitar(i)}>
                Quitar bloque
              </button>
            </div>
          )}
        </div>
      ))}
      {editable && (
        <div className="inf-row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => cambiar([...bloques, { id: nuevoId(), tipo: "texto", texto: "" }])}>
            + Agregar texto
          </button>
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => cambiar([...bloques, tablaVacia()])}>
            + Agregar una tabla de Excel
          </button>
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => cambiar([...bloques, { id: nuevoId(), tipo: "drive", drive: [] }])}>
            + Agregar tablas o gráficas de UDrive
          </button>
        </div>
      )}
    </>
  );
}
