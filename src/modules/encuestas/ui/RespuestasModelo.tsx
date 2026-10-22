/* =============================================================================
   Encuestas con Pilo · respuestas de una encuesta del modelo nuevo.

   Una fila por respuesta, con filtros por estado y búsqueda, detalle pregunta por
   pregunta, cambio de estado (recibido, revisado, para video, rechazado,
   descartado), borrar a la papelera (30 días, con restaurar y deshacer) y CSV.
   Lo borrado no sale en la tabla, ni en el CSV, ni en los resultados.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { aCsv, fechaCorta, diasParaPurga } from "../lib/tabla";
import { preguntasDe } from "../lib/estructura";
import type { Estructura } from "../lib/estructura";
import { enterList, exitRow } from "../motion";
import { resumenDe } from "../publico/Salida";
import { ESTADOS, textoEstado } from "../tipos";
import type { EstadoAporte, RespuestaModelo } from "../tipos";

function descargar(contenido: Blob, nombre: string) {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const textoDe = (e: Estructura, r: RespuestaModelo) => resumenDe(preguntasDe(e), r.valores);

export function RespuestasModelo({
  slug,
  estructura,
  respuestas,
  papelera,
  puedeEditar,
  onEstado,
  onBorrar,
  onRestaurar,
  onAviso,
  onPapelera,
}: {
  slug: string;
  estructura: Estructura;
  respuestas: readonly RespuestaModelo[];
  papelera: readonly RespuestaModelo[] | undefined;
  puedeEditar: boolean;
  onEstado: (id: string, e: EstadoAporte) => void;
  onBorrar: (id: string, motivo: string) => void;
  onRestaurar: (id: string) => void;
  onAviso: (t: string) => void;
  /** Avisa cuando se abre o se cierra la papelera (para ir a leerla). */
  onPapelera: (abierta: boolean) => void;
}) {
  const [estado, setEstado] = useState<EstadoAporte | "">("");
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [verPapelera, setVerPapelera] = useState(false);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  const preguntas = useMemo(() => preguntasDe(estructura), [estructura]);
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return respuestas
      .filter((r) => !r.borrado_en && (!estado || r.estado === estado))
      .map((r, i) => ({ r, n: i + 1, lineas: textoDe(estructura, r) }))
      .filter((x) => !t || [x.r.correo, x.r.nombre, ...x.lineas.map((l) => l.respuesta)].join(" ").toLowerCase().includes(t));
  }, [respuestas, estado, q, estructura]);
  const detalle = abierta ? filas.find((x) => x.r.id === abierta) : undefined;

  useLayoutEffect(() => {
    if (cuerpo.current) enterList(Array.from(cuerpo.current.children).slice(0, 12));
  }, [estado, verPapelera]);

  const csv = () => {
    const encabezados = ["#", "Recibido", "Correo", "Nombre", "Estado", ...preguntas.map((p) => p.enunciado)];
    const m = { encabezados, filas: filas.map((x) => [x.n, fechaCorta(x.r.created_at), x.r.correo ?? "", x.r.nombre ?? "", textoEstado(x.r.estado), ...x.lineas.map((l) => l.respuesta)]) };
    descargar(new Blob([aCsv(m)], { type: "text/csv;charset=utf-8" }), `encuesta-${slug}.csv`);
    onAviso("Descarga lista.");
  };

  return (
    <div role="tabpanel" id="en-panel-resp" aria-labelledby="en-tab-resp">
      <div className="en-tools">
        <div className="en-busca">
          <input type="search" placeholder="Buscar en las respuestas" aria-label="Buscar en las respuestas" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="en-sel" aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoAporte | "")}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.texto}
            </option>
          ))}
        </select>
        <span className="en-grow" />
        <div className="ed-seg" role="group" aria-label="Qué ver">
          <button type="button" aria-pressed={!verPapelera} onClick={() => { setVerPapelera(false); onPapelera(false); }}>
            Respuestas
          </button>
          <button type="button" aria-pressed={verPapelera} onClick={() => { setVerPapelera(true); onPapelera(true); }}>
            Papelera
          </button>
        </div>
        <button type="button" className="en-btn en-btn--pri" onClick={csv} disabled={!filas.length || verPapelera}>
          Descargar CSV
        </button>
      </div>

      {verPapelera ? (
        <div className="en-papelera">
          <p className="en-hint">Las respuestas borradas se conservan 30 días. Después se eliminan para siempre.</p>
          {!papelera?.length ? (
            <p className="en-vacio-simple">La papelera está vacía.</p>
          ) : (
            <ul className="en-pap-lista">
              {papelera.map((r) => {
                const dias = diasParaPurga(r.borrado_en ?? "");
                return (
                  <li key={r.id}>
                    <span className="en-est" data-v={r.estado}>
                      {textoEstado(r.estado)}
                    </span>
                    <div>
                      <b>{r.correo ?? "Anónima"}</b>
                      <span>
                        recibida {fechaCorta(r.created_at)} · borrada {r.borrado_en ? fechaCorta(r.borrado_en) : ""}
                        {r.borrado_motivo ? ` · «${r.borrado_motivo}»` : ""}
                      </span>
                      <span>{dias === 0 ? "Se elimina hoy" : dias === 1 ? "Se elimina mañana" : `Se elimina en ${dias} días`}</span>
                    </div>
                    {puedeEditar && (
                      <button type="button" className="en-btn" onClick={() => onRestaurar(r.id)}>
                        Restaurar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="en-malla" tabIndex={-1}>
            <table className="en-grid" aria-label="Respuestas de la encuesta">
              <thead>
                <tr>
                  <th scope="col" className="en-rn">
                    #
                  </th>
                  <th scope="col">Recibida</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Respuesta</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="ed-sr">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={cuerpo}>
                {filas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="en-vacio">
                      {respuestas.length ? "Ninguna respuesta coincide con los filtros." : "Aún no llega ninguna respuesta. Cuando alguien responda por el enlace público, aparece aquí."}
                    </td>
                  </tr>
                ) : (
                  filas.map((x) => (
                    <tr key={x.r.id} data-id={x.r.id} className={abierta === x.r.id ? "is-abierta" : undefined}>
                      <th scope="row" className="en-rn">
                        {x.n}
                      </th>
                      <td>{fechaCorta(x.r.created_at)}</td>
                      <td>{x.r.correo ?? "Anónima"}</td>
                      <td>
                        <span className="en-corto">{x.lineas.find((l) => l.respuesta)?.respuesta ?? ""}</span>
                      </td>
                      <td>
                        {puedeEditar ? (
                          <select className="en-est" data-v={x.r.estado} value={x.r.estado} aria-label={`Estado de la respuesta ${x.n}`} onChange={(e) => onEstado(x.r.id, e.target.value as EstadoAporte)}>
                            {ESTADOS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.texto}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="en-est en-est--fijo" data-v={x.r.estado}>
                            {textoEstado(x.r.estado)}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="en-btn"
                          aria-expanded={abierta === x.r.id}
                          onClick={() => {
                            setAbierta(abierta === x.r.id ? null : x.r.id);
                            setPidiendo(false);
                          }}
                        >
                          {abierta === x.r.id ? "Cerrar" : "Ver"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {detalle && (
            <section className="en-detalle" aria-label="Detalle de la respuesta">
              <dl className="en-ficha">
                {detalle.lineas.map((l) => (
                  <div key={l.pregunta}>
                    <dt>{l.pregunta}</dt>
                    <dd>{l.respuesta || "(sin respuesta)"}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <dl className="en-ficha">
                  <dt>Recibida</dt>
                  <dd>{fechaCorta(detalle.r.created_at)}</dd>
                  <dt>Quién</dt>
                  <dd>
                    {detalle.r.correo ?? "Anónima"}
                    {detalle.r.nombre ? ` · ${detalle.r.nombre}` : ""}
                    {detalle.r.consentimiento ? " · dio su consentimiento" : ""}
                  </dd>
                </dl>
                {puedeEditar && !pidiendo && (
                  <button type="button" className="en-btn en-btn--peligro en-btn--cierre" onClick={() => setPidiendo(true)}>
                    Borrar respuesta
                  </button>
                )}
                {puedeEditar && pidiendo && (
                  <div className="en-borrar" role="group" aria-label="Borrar la respuesta">
                    <label htmlFor="rm-motivo">Motivo (opcional)</label>
                    <input id="rm-motivo" className="en-in" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo, duplicada" />
                    <span className="en-hint">Va a la papelera 30 días. Desde allí se puede restaurar.</span>
                    <div className="en-fila">
                      <button
                        type="button"
                        className="en-btn en-btn--peligro-pri"
                        onClick={() => {
                          const fila = cuerpo.current?.querySelector(`tr[data-id="${detalle.r.id}"]`) ?? null;
                          const id = detalle.r.id;
                          setAbierta(null);
                          setPidiendo(false);
                          exitRow(fila, () => onBorrar(id, motivo));
                          setMotivo("");
                        }}
                      >
                        Mandar a la papelera
                      </button>
                      <button type="button" className="en-btn" onClick={() => setPidiendo(false)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          <div className="en-pie">
            <span aria-live="polite">
              {filas.length} {filas.length === 1 ? "respuesta" : "respuestas"} en pantalla
            </span>
          </div>
        </>
      )}
    </div>
  );
}
