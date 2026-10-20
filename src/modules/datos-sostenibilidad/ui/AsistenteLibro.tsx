/* =============================================================================
   Datos de Sostenibilidad · el asistente de un libro nuevo.

   Dos caminos, como «Subir plantilla» en Programas en Cifras: en blanco (se
   arman las columnas a mano) o desde un Excel (la matriz se lee en el
   navegador y lib/inferencia propone las columnas con su tipo y las filas ya
   leídas). Nada sale del navegador hasta Crear.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Panel, SaveState } from "../../admin/udes-en-cifras/ui";
import { columnasDesdeMatriz } from "../../programas-en-cifras/lib/inferencia";
import { leerArchivoEnNavegador } from "../../programas-en-cifras/ui/leer-excel";
import type { Matriz } from "../../programas-en-cifras/ui/leer-excel";
import { ETIQUETA_TIPO } from "../../programas-en-cifras/lib/validacion";
import type { PcTipo } from "../../programas-en-cifras/tipos";
import { useCrearLibro } from "../datos";
import type { DsCarpeta } from "../tipos";

const TIPOS: PcTipo[] = ["texto", "numero", "fecha", "lista", "porcentaje"];

interface ColumnaNueva {
  clave: string;
  etiqueta: string;
  tipo: PcTipo;
  obligatorio: boolean;
  opciones: string[];
  orden: number;
}

export function AsistenteLibro({
  oficina,
  carpetas,
  onCerrar,
  onCreado,
}: {
  oficina: string;
  carpetas: DsCarpeta[];
  onCerrar: () => void;
  onCreado: (libro: string) => void;
}) {
  const crear = useCrearLibro(oficina);
  const file = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"tabla" | "lista">("tabla");
  const carpetaFija = carpetas.find((c) => c.clave === "indicadores") ?? carpetas[0];
  const [carpeta, setCarpeta] = useState(carpetaFija?.id ?? "");
  const [columnas, setColumnas] = useState<ColumnaNueva[]>([]);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [problema, setProblema] = useState("");

  const limite = useMemo(() => Math.min(filas.length, 6), [filas]);

  /** Del Excel a las columnas y filas propuestas. */
  const leer = async (archivo: File | null) => {
    if (!archivo) return;
    setProblema("");
    try {
      const { matriz } = await leerArchivoEnNavegador(archivo);
      const armado = columnasDesdeMatriz(matriz as Matriz);
      if (!armado.columnas.length || !armado.filas.length) {
        setProblema("No se encontró una fila de encabezados con datos debajo.");
        return;
      }
      setColumnas(armado.columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: c.opciones ?? [], orden: c.orden })));
      setFilas(armado.filas.map((d) => ({ ...d })));
      if (!nombre.trim()) setNombre(archivo.name.replace(/\.(xlsx|csv)$/i, ""));
    } catch (e) {
      setProblema(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
    if (file.current) file.current.value = "";
  };

  const claveDe = (etiqueta: string) =>
    etiqueta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "columna";

  const addColumna = () =>
    setColumnas((cs) => {
      const etiqueta = `Columna ${cs.length + 1}`;
      let clave = claveDe(etiqueta);
      let n = 2;
      while (cs.some((c) => c.clave === clave)) clave = `${claveDe(etiqueta)}_${n++}`;
      return [...cs, { clave, etiqueta, tipo: "texto", obligatorio: false, opciones: [], orden: cs.length + 1 }];
    });

  const crearLibro = () => {
    if (!nombre.trim() || !columnas.length) return;
    crear.mutate(
      {
        carpeta,
        nombre: nombre.trim(),
        tipo,
        columnas: columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: c.opciones, orden: c.orden })),
        filas: filas.map((datos) => ({ datos })),
      },
      { onSuccess: (l) => onCreado(l.id) },
    );
  };

  const listo = nombre.trim().length > 0 && columnas.length > 0 && carpeta;

  return (
    <Panel
      title="Nuevo libro de datos"
      description="En blanco, con sus columnas a mano, o subiendo un Excel: se lee aquí, en el navegador, y se proponen las columnas con su tipo."
      actions={
        <>
          <SaveState pending={crear.isPending} error={crear.error} success={crear.isSuccess} />
          <button type="button" className="oda-link-button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="button-primary" disabled={!listo || crear.isPending} onClick={crearLibro}>
            <Icon name="plus" size={15} /> Crear el libro
          </button>
        </>
      }
    >
      {problema && (
        <p className="oda-banner" role="alert">
          <Icon name="alert" size={16} /> {problema}
        </p>
      )}

      <div className="oda-form-grid">
        <label className="admin-field">
          <span>Cómo se llama</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Consumo de energía por campus" autoFocus />
        </label>
        <label className="admin-field">
          <span>Carpeta</span>
          <select value={carpeta} onChange={(e) => setCarpeta(e.target.value)}>
            {carpetas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "tabla" | "lista")}>
            <option value="tabla">Tabla: filas × columnas</option>
            <option value="lista">Lista: una fila con sus campos</option>
          </select>
        </label>
      </div>

      <div className="ds-asistente__origen">
        <button type="button" className="button-secondary" onClick={() => file.current?.click()}>
          <Icon name="upload" size={15} /> Subir un Excel o CSV
        </button>
        <input ref={file} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => void leer(e.target.files?.[0] ?? null)} />
        <button type="button" className="button-secondary" onClick={addColumna}>
          <Icon name="plus" size={15} /> Columna en blanco
        </button>
      </div>

      {columnas.length === 0 ? (
        <p className="tb-prose tb-prose--aside">Suba el Excel o añada la primera columna a mano.</p>
      ) : (
        <div className="ds-columnas-edit">
          <table>
            <thead>
              <tr>
                <th>Columna</th>
                <th>Tipo</th>
                <th>Obligatoria</th>
                <th>Opciones de la lista</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {columnas.map((c, i) => (
                <tr key={c.clave}>
                  <td>
                    <input
                      value={c.etiqueta}
                      aria-label={`Nombre de la columna ${i + 1}`}
                      onChange={(e) => setColumnas((cs) => cs.map((x, k) => (k === i ? { ...x, etiqueta: e.target.value, clave: claveDe(e.target.value) } : x)))}
                    />
                  </td>
                  <td>
                    <select value={c.tipo} aria-label={`Tipo de la columna ${i + 1}`} onChange={(e) => setColumnas((cs) => cs.map((x, k) => (k === i ? { ...x, tipo: e.target.value as PcTipo } : x)))}>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETA_TIPO[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={c.obligatorio}
                      aria-label={`¿Es obligatoria la columna ${i + 1}?`}
                      onChange={(e) => setColumnas((cs) => cs.map((x, k) => (k === i ? { ...x, obligatorio: e.target.checked } : x)))}
                    />
                  </td>
                  <td>
                    {c.tipo === "lista" ? (
                      <input
                        value={c.opciones.join(", ")}
                        placeholder="Opción A, Opción B"
                        aria-label={`Opciones de la columna ${i + 1}`}
                        onChange={(e) => setColumnas((cs) => cs.map((x, k) => (k === i ? { ...x, opciones: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)))}
                      />
                    ) : (
                      <span className="ds-muted">—</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="oda-link-button" data-tone="danger" onClick={() => setColumnas((cs) => cs.filter((_, k) => k !== i).map((x, k) => ({ ...x, orden: k + 1 })))}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && (
        <p className="tb-prose tb-prose--aside">
          Se subirán {filas.length.toLocaleString("es-CO")} {(filas.length) === 1 ? "fila" : "filas"}. Las primeras {limite}:
        </p>
      )}
    </Panel>
  );
}
