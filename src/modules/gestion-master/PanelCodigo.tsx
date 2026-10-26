/* =============================================================================
   Gestión Master · los datos reales de un código, desde el Warehouse.

   Al elegir un código, la persona ve lo que el Master dice de él para decidir con
   información: la ficha del catálogo (ms_actdir), cuántos profesores lo tienen
   asignado en el periodo, las horas asignadas y el promedio (ms_nom), y el
   programa de cada uno.

   Los nombres NO salen del Warehouse (su política los descarta y la cédula queda
   como seudónimo). Se piden aparte, en vivo, al Master (función `warehouse`,
   acción «docentes»): solo a quien tiene acceso al módulo, la consulta queda
   anotada y los nombres no se guardan en ninguna parte: viven en esta pantalla
   hasta que se cierra.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { nombresDeDocentes, useFicha } from "./api";
import { aparecer } from "./movimiento";
import { Cargando, ErrorCaja, Fuente } from "./partes";
import { fechaCorta, horasTexto, nombrePeriodo, nombreSede } from "./modelo";

export function PanelCodigo({ periodo, sede, codigo, titulo }: { periodo: string; sede: string; codigo: string; titulo?: string }) {
  const q = useFicha(periodo, sede, codigo);
  const [nombres, setNombres] = useState<Record<string, string> | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [falla, setFalla] = useState("");
  const raiz = useRef<HTMLElement>(null);

  // Los nombres viven solo mientras se mira este código.
  useEffect(() => {
    setNombres(null);
    setFalla("");
  }, [periodo, sede, codigo]);

  const listo = !q.isPending && !q.error;
  useEffect(() => {
    if (listo) aparecer(raiz.current);
  }, [listo, periodo, sede, codigo]);

  if (q.isPending) return <Cargando filas={3} etiqueta="Leyendo el código en el Warehouse" />;
  if (q.error) return <ErrorCaja error={q.error} onReintentar={() => void q.refetch()} titulo="No se pudo leer el código" />;
  const f = q.data;
  const cat = f.catalogo;
  const lugar = `${nombreSede(sede)} · ${nombrePeriodo(periodo)}`;

  async function verNombres() {
    if (!f.profesores.length) return;
    setLeyendo(true);
    setFalla("");
    try {
      const r = await nombresDeDocentes({ sede, periodo, codigo: f.codigo, seudonimos: f.profesores.map((p) => p.seudonimo).filter((s) => /^x-[0-9a-f]{10}$/.test(s)) });
      setNombres(r.nombres);
    } catch (e) {
      setFalla(e instanceof Error ? e.message : "No se pudieron leer los nombres.");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <section className="gm-codigo" aria-label={titulo ?? `Datos del código ${f.codigo}`} ref={raiz}>
      <header>
        <h3>{titulo ?? `Lo que dice el Master de ${f.codigo}`}</h3>
        <Fuente>
          {lugar}.{" "}
          {f.carga_actdir ? <>Catálogo (ms_actdir): corte del {fechaCorta(f.carga_actdir.corte)}, versión {f.carga_actdir.version}. </> : <strong>Sin captura del catálogo (ms_actdir). </strong>}
          {f.carga_nomina ? <>Profesores (ms_nom): corte del {fechaCorta(f.carga_nomina.corte)}, versión {f.carga_nomina.version}.</> : <strong>Sin captura de la nómina (ms_nom).</strong>}
        </Fuente>
      </header>

      {f.sin_captura_catalogo ? (
        <p className="gm-aviso">No hay captura del catálogo del Master para esta sede y periodo, así que no se puede comprobar el código. Pídale a Planeación que la cargue en el Warehouse.</p>
      ) : cat ? (
        <dl className="gm-kv">
          <dt>Nombre</dt>
          <dd>{cat.nombre ?? "—"}</dd>
          <dt>Tipo</dt>
          <dd>{cat.directa === true ? "Directa" : cat.directa === false ? "De apoyo" : (cat.tipo ?? "—")}</dd>
          <dt>Vinculación</dt>
          <dd>{cat.vinculacion ?? "—"}</dd>
          <dt>Estado</dt>
          <dd>{cat.activa === false ? "Inactiva" : cat.activa === true ? "Activa" : "—"}</dd>
          {cat.instrucciones && (
            <>
              <dt>Instrucciones</dt>
              <dd>{cat.instrucciones}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="gm-aviso">El código {f.codigo} no está en el catálogo del Master para esta sede y periodo.</p>
      )}

      {f.sin_captura_nomina ? (
        <p className="gm-aviso">No hay captura de la nómina docente (ms_nom) para esta sede y periodo: no se puede contar cuántos profesores tienen el código.</p>
      ) : (
        <>
          <div className="gm-cifras" role="group" aria-label="Cifras del código en el periodo">
            <div>
              <b>{f.n_profesores ?? 0}</b>
              <span>Profesores</span>
            </div>
            <div>
              <b>{horasTexto(f.horas ?? 0)}</b>
              <span>Horas asignadas por semana</span>
            </div>
            <div>
              <b>{horasTexto(f.promedio_horas)}</b>
              <span>Promedio por profesor</span>
            </div>
          </div>
          {f.coincidencia === "nombre" && <p className="gm-nota">La nómina no trae este código; se cruzó por el nombre de la actividad. Revise que sea la misma.</p>}
          {f.profesores.length > 0 ? (
            <>
              <div className="gm-tabla-envoltura">
                <table className="gm-tabla">
                  <caption className="sr-only">Profesores con el código {f.codigo}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Profesor</th>
                      <th scope="col">Programa o departamento</th>
                      <th scope="col" className="gm-num">
                        Horas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.profesores.map((p) => (
                      <tr key={p.seudonimo}>
                        <td>
                          {nombres ? (nombres[p.seudonimo] || <em>(nombre no disponible)</em>) : <span className="gm-mono">{p.seudonimo}</span>}
                          {nombres && <small className="gm-mono"> {p.seudonimo}</small>}
                        </td>
                        <td>{p.programa ?? "—"}</td>
                        <td className="gm-num">{horasTexto(p.horas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="gm-nombres">
                {!nombres && (
                  <button type="button" className="button-secondary" onClick={() => void verNombres()} disabled={leyendo}>
                    {leyendo ? "Leyendo del Master…" : "Ver los nombres de los profesores"}
                  </button>
                )}
                <small>
                  El Warehouse guarda a cada profesor como un seudónimo. Los nombres se leen del Master en este momento, no se guardan y la consulta queda anotada con su nombre.
                </small>
                {falla && (
                  <p className="gm-aviso" role="alert">
                    {falla}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="gm-nota">Ningún profesor tiene este código en la nómina del periodo.</p>
          )}
        </>
      )}
    </section>
  );
}
