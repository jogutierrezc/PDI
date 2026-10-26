/* Tablas y gráficas de UDrive dentro de una sección del informe.

   La unidad arma su tabla o su gráfica en UDrive (con todo lo que allí se puede:
   pegar de Excel, cruzar tablas, mapa de calor, trece tipos de gráfica) y aquí
   solo la elige. Se guarda una referencia (`contenido.drive`), no una copia: lo
   que cambie en la tabla se ve en el informe mientras éste siga en borrador.
   Quien no tenga permiso sobre el archivo en UDrive verá un aviso en su lugar. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useArchivos, useContenido } from "../../udrive/datos";
import { normalizarConfig } from "../../udrive/lib/graficas";
import { normalizarContenido } from "../../udrive/lib/tabla";
import { textoNumero } from "../../udrive/lib/valores";
import type { ContenidoGrafica, TablaDatos } from "../../udrive/tipos";
import { GraficaVista } from "../../udrive/ui/GraficaVista";
import type { ElementoDrive } from "../types";

const MAX_ELEMENTOS = 12;

function TablaDrive({ id, titulo, nota }: { id: string; titulo: string; nota: string }) {
  const q = useContenido(id);
  const t = useMemo(() => (q.data?.tipo === "tabla" ? normalizarContenido(q.data.contenido) : null), [q.data]);
  if (q.isPending) return <p className="inf-muted">Cargando la tabla…</p>;
  if (!t) return <p className="inf-muted">No se pudo leer la tabla de UDrive: ya no existe, está en la papelera o no tiene permiso para verla.</p>;
  const encabezado = titulo.trim() || t.presentacion.titulo;
  const pie = nota.trim() || t.presentacion.nota;
  return (
    <figure className="inf-fig">
      {encabezado && <figcaption>{encabezado}</figcaption>}
      <div className="inf-dimtab-wrap">
        <table className="inf-dimtab">
          <thead>
            <tr>
              {t.columnas.map((c) => (
                <th key={c.clave} scope="col">
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.filas.map((f) => (
              <tr key={f.id}>
                {t.columnas.map((c) => {
                  const v = f.datos[c.clave] ?? null;
                  const numero = c.tipo === "numero" || c.tipo === "porcentaje";
                  return (
                    <td key={c.clave} className={numero ? "inf-num" : undefined}>
                      {v === null || v === "" ? "" : typeof v === "number" ? textoNumero(v) : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pie && (
        <p className="inf-hint">
          <b>Nota.</b> {pie}
        </p>
      )}
    </figure>
  );
}

function GraficaDrive({ id, titulo, nota }: { id: string; titulo: string; nota: string }) {
  const q = useContenido(id);
  const contenido = q.data?.tipo === "grafica" ? (q.data.contenido as Partial<ContenidoGrafica>) : null;
  const tabla = useContenido(contenido?.tabla_id ?? undefined);
  const datos = useMemo<TablaDatos | null>(() => (tabla.data?.tipo === "tabla" ? normalizarContenido(tabla.data.contenido) : null), [tabla.data]);
  const config = useMemo(() => (contenido ? normalizarConfig(contenido.config, datos) : null), [contenido, datos]);
  if (q.isPending || (contenido?.tabla_id && tabla.isPending)) return <p className="inf-muted">Cargando la gráfica…</p>;
  if (!contenido || !datos || !config) return <p className="inf-muted">No se pudo leer la gráfica de UDrive: ya no existe, está en la papelera, no tiene permiso para verla o no tiene tabla de datos.</p>;
  const encabezado = titulo.trim() || config.titulo;
  const pie = nota.trim() || config.nota;
  return (
    <figure className="inf-fig">
      {encabezado && <figcaption>{encabezado}</figcaption>}
      <GraficaVista tabla={datos} config={config} altura={300} />
      {pie && (
        <p className="inf-hint">
          <b>Nota.</b> {pie}
        </p>
      )}
    </figure>
  );
}

function Selector({ usados, elegir, cerrar }: { usados: Set<string>; elegir: (tipo: "tabla" | "grafica", id: string) => void; cerrar: () => void }) {
  const archivos = useArchivos();
  const [texto, setTexto] = useState("");
  const lista = (archivos.data ?? [])
    .filter((a) => (a.tipo === "tabla" || a.tipo === "grafica") && !a.borrado_en && !usados.has(a.id))
    .filter((a) => a.nombre.toLowerCase().includes(texto.trim().toLowerCase()));
  return (
    <div className="inf-pick">
      <div className="inf-pick__top" style={{ gridTemplateColumns: "1fr auto" }}>
        <input className="inf-in" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busque en su UDrive una tabla o una gráfica" aria-label="Buscar en UDrive" />
        <button type="button" className="inf-btn inf-btn--sm" onClick={cerrar}>
          Cerrar
        </button>
      </div>
      {archivos.isPending && <p className="inf-muted">Leyendo su UDrive…</p>}
      {archivos.error instanceof Error && (
        <p className="inf-error" role="alert">
          No se pudo leer UDrive: {archivos.error.message}
        </p>
      )}
      {!archivos.isPending && lista.length === 0 && <p className="inf-muted">No hay tablas ni gráficas que mostrar. Créelas en UDrive y vuelva.</p>}
      <ul className="inf-pick__lista">
        {lista.slice(0, 40).map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => elegir(a.tipo as "tabla" | "grafica", a.id)}>
              <b>{a.nombre}</b>
              <span>{a.tipo === "tabla" ? `Tabla${a.resumen.filas ? ` · ${a.resumen.filas} filas` : ""}` : "Gráfica"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El bloque «Tablas y gráficas de UDrive» de una sección. Sin elementos y sin permiso de editar, no ocupa lugar. */
export function ElementosDrive({ elementos, editable, onChange }: { elementos: ElementoDrive[]; editable: boolean; onChange: (e: ElementoDrive[]) => void }) {
  const [eligiendo, setEligiendo] = useState(false);
  if (!editable && elementos.length === 0) return null;
  const mover = (i: number, j: number) => {
    if (j < 0 || j >= elementos.length) return;
    const n = [...elementos];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  const cambiar = (i: number, d: Partial<ElementoDrive>) => onChange(elementos.map((e, k) => (k === i ? { ...e, ...d } : e)));
  return (
    <div className="inf-blk">
      <div className="inf-blk__lab">
        <span className="inf-src">Tablas y gráficas de UDrive · se actualizan mientras el informe está en borrador</span>
      </div>
      {elementos.map((e, i) => (
        <div className="inf-drv" key={e.archivoId}>
          {e.tipo === "tabla" ? <TablaDrive id={e.archivoId} titulo={e.titulo} nota={e.nota} /> : <GraficaDrive id={e.archivoId} titulo={e.titulo} nota={e.nota} />}
          {editable && (
            <div className="inf-drv__acc">
              <input className="inf-in" value={e.titulo} onChange={(ev) => cambiar(i, { titulo: ev.target.value })} placeholder="Título en el informe (vacío: el de UDrive)" aria-label="Título en el informe" />
              <input className="inf-in" value={e.nota} onChange={(ev) => cambiar(i, { nota: ev.target.value })} placeholder="Nota o fuente (vacío: la de UDrive)" aria-label="Nota o fuente" />
              <Link className="inf-link" to={`/admin/udrive/${e.tipo === "tabla" ? "tabla" : "grafica"}/${e.archivoId}`} target="_blank">
                Editar en UDrive
              </Link>
              <button type="button" className="inf-link" onClick={() => mover(i, i - 1)} disabled={i === 0}>
                Subir
              </button>
              <button type="button" className="inf-link" onClick={() => mover(i, i + 1)} disabled={i === elementos.length - 1}>
                Bajar
              </button>
              <button type="button" className="inf-link" onClick={() => onChange(elementos.filter((_, k) => k !== i))}>
                Quitar
              </button>
            </div>
          )}
        </div>
      ))}
      {editable && (
        <div className="inf-row">
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => setEligiendo(true)} disabled={eligiendo || elementos.length >= MAX_ELEMENTOS}>
            + Agregar una tabla o gráfica de UDrive
          </button>
          <Link className="inf-link" to="/admin/udrive" target="_blank">
            Abrir UDrive para crear una
          </Link>
        </div>
      )}
      {editable && eligiendo && (
        <Selector
          usados={new Set(elementos.map((e) => e.archivoId))}
          cerrar={() => setEligiendo(false)}
          elegir={(tipo, id) => {
            onChange([...elementos, { archivoId: id, tipo, titulo: "", nota: "" }]);
            setEligiendo(false);
          }}
        />
      )}
    </div>
  );
}

/** Solo lectura, para la revisión y la vista del informe. */
export function ElementosDriveLectura({ elementos }: { elementos: ElementoDrive[] }) {
  if (elementos.length === 0) return null;
  return (
    <>
      {elementos.map((e) => (e.tipo === "tabla" ? <TablaDrive key={e.archivoId} id={e.archivoId} titulo={e.titulo} nota={e.nota} /> : <GraficaDrive key={e.archivoId} id={e.archivoId} titulo={e.titulo} nota={e.nota} />))}
    </>
  );
}
