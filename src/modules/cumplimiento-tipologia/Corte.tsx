/* =============================================================================
   Cumplimiento de Tipología · el corte (solo el administrador del módulo).

   «Calcular el corte» lee los datos vigentes del Warehouse del periodo y la sede,
   corre el motor en este navegador y escribe las tablas ct_*. Aquí se ve qué hay
   cargado, se calcula y se consulta la bitácora. Nada se pide a Master: si falta
   un insumo, se carga primero en el Warehouse.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { FUENTES, useBitacora, useCalcularCorte, useCorteActual, useInsumosEstado, type EtapaCorte } from "./api";
import { entero, mensajeDe, nombrePeriodo, nombreSede, type FilaBitacora } from "./modelo";

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const ESTADO_BITACORA: Record<FilaBitacora["estado"], { texto: string; tono: string }> = {
  completo: { texto: "Vigente", tono: "ok" },
  reemplazado: { texto: "Reemplazado", tono: "neutral" },
  fallido: { texto: "Falló", tono: "risk" },
  en_curso: { texto: "En curso", tono: "wait" },
};

function EtapaFila({ e }: { e: EtapaCorte }) {
  return (
    <li className="ct-etapa" data-e={e.estado}>
      <span className="ct-etapa__ic" aria-hidden="true">
        {e.estado === "completada" && <Icon name="check" size={15} />}
        {e.estado === "fallida" && <Icon name="alert" size={15} />}
        {e.estado === "en_curso" && <span className="ct-spin" />}
        {(e.estado === "pendiente" || e.estado === "omitida") && <Icon name="clock" size={15} />}
      </span>
      <span>
        <b>{e.titulo}</b>
        {e.detalle && <small>{e.detalle}</small>}
      </span>
    </li>
  );
}

export function Corte({ periodo, sede }: { periodo: string; sede: string }) {
  const unaSede = (["buc", "cuc", "val", "bog"] as const).find((s) => s === sede);
  const insumos = useInsumosEstado(periodo, sede, Boolean(unaSede));
  const vigente = useCorteActual(periodo, sede, Boolean(unaSede));
  const bitacora = useBitacora(periodo, true);
  const calcular = useCalcularCorte();
  const [etapas, setEtapas] = useState<EtapaCorte[]>([]);
  const [hecho, setHecho] = useState<{ profesores: number; observaciones: number; programasNuevos: number; sinUnidad: number; avisos: string[] } | null>(null);

  if (!unaSede) {
    return <EmptyBlock title="Elija una sede" hint="El corte se calcula por periodo y sede: elija una sede arriba." />;
  }

  const nomina = insumos.data?.nomina ?? null;
  const corriendo = calcular.isPending;

  const lanzar = () => {
    setHecho(null);
    setEtapas([]);
    calcular.mutate(
      { periodo, sede: unaSede, onEtapas: setEtapas },
      {
        onSuccess: ({ resultado, escritura }) =>
          setHecho({ profesores: escritura.profesores, observaciones: escritura.observaciones, programasNuevos: escritura.programas_nuevos, sinUnidad: escritura.programas_sin_unidad, avisos: resultado.avisos }),
      },
    );
  };

  return (
    <div className="ct-corte">
      <section className="ct-panel">
        <h2 className="ct-h2">Qué hay en el Warehouse</h2>
        <p className="ct-sub">
          {nombrePeriodo(periodo)} en {nombreSede(sede)}. El corte usa la versión vigente de cada conjunto.
        </p>
        {insumos.isPending ? (
          <LoadingBlock rows={4} label="Mirando el Warehouse" />
        ) : insumos.error ? (
          <ErrorBlock error={insumos.error} onRetry={() => void insumos.refetch()} />
        ) : (
          <ul className="ct-insumos">
            {FUENTES.map((f) => {
              const c = insumos.data?.[f.id] ?? null;
              return (
                <li key={f.id}>
                  <span className="ct-chip" data-t={c ? "ok" : f.obligatoria ? "risk" : "neutral"}>
                    {c ? <Icon name="check" size={13} /> : null}
                    {c ? `Versión ${c.version}` : f.obligatoria ? "Falta" : "No cargada"}
                  </span>
                  <span>
                    <b>
                      {f.titulo} <span className="ct-muted">({f.conjunto})</span>
                    </b>
                    <small>{c ? `${entero(c.filas)} filas · cargada el ${fecha(c.terminada_en)}` : f.detalle}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ct-panel">
        <h2 className="ct-h2">Calcular el corte</h2>
        <p className="ct-sub">
          {vigente.data ? `Hoy el corte vigente es del ${fecha(vigente.data.terminado_en)}, con ${entero(vigente.data.profesores)} profesores.` : `Todavía no hay corte de ${nombrePeriodo(periodo)} en ${nombreSede(sede)}.`} El corte nuevo reemplaza al vigente solo cuando termina bien.
        </p>
        <div className="ct-corte__acc">
          <button type="button" className="button-primary" disabled={corriendo || !nomina} onClick={lanzar}>
            {corriendo ? "Calculando…" : vigente.data ? "Calcular de nuevo" : "Calcular el corte"}
          </button>
          {!nomina && !insumos.isPending && !insumos.error && (
            <span className="ct-muted">Falta la nómina docente (ms_nom): cárguela en el Warehouse y vuelva.</span>
          )}
        </div>
        {etapas.length > 0 && (
          <ol className="ct-etapas" aria-live="polite">
            {etapas.map((e) => (
              <EtapaFila key={e.id} e={e} />
            ))}
          </ol>
        )}
        {calcular.error && (
          <p className="ct-error" role="alert">
            {mensajeDe(calcular.error)}
          </p>
        )}
        {hecho && (
          <div className="ct-hecho" role="status">
            <b>
              Corte listo: {entero(hecho.profesores)} profesores y {entero(hecho.observaciones)} observaciones.
            </b>
            {hecho.programasNuevos > 0 && <p>{hecho.programasNuevos} programas nuevos; {hecho.sinUnidad} siguen sin unidad y solo los ve el administrador. Asígnelos en «Programas y unidades».</p>}
            {hecho.avisos.length > 0 && (
              <ul>
                {hecho.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="ct-panel">
        <h2 className="ct-h2">Bitácora de cortes</h2>
        <p className="ct-sub">Los últimos cortes de {nombrePeriodo(periodo)}, de todas las sedes</p>
        {bitacora.isPending ? (
          <LoadingBlock rows={3} label="Leyendo la bitácora" />
        ) : bitacora.error ? (
          <ErrorBlock error={bitacora.error} onRetry={() => void bitacora.refetch()} />
        ) : (bitacora.data ?? []).length === 0 ? (
          <p className="ct-vacio">Todavía no se ha calculado ningún corte de este periodo.</p>
        ) : (
          <div className="ct-tbl-scroll">
            <table className="ct-tbl ct-tbl--chica">
              <thead>
                <tr>
                  <th scope="col">Sede</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Profesores</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Insumos y avisos</th>
                </tr>
              </thead>
              <tbody>
                {(bitacora.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>{nombreSede(c.sede)}</td>
                    <td>
                      <span className="ct-chip" data-t={ESTADO_BITACORA[c.estado].tono}>
                        {ESTADO_BITACORA[c.estado].texto}
                      </span>
                    </td>
                    <td className="ct-num">{entero(c.profesores)}</td>
                    <td>{c.quien}</td>
                    <td>{fecha(c.terminado_en ?? c.creado_en)}</td>
                    <td>
                      <small className="ct-bit__det">
                        {(c.insumos ?? []).filter((i) => i.usado).map((i) => `${i.conjunto} v${i.version}`).join(", ") || "—"}
                        {(c.avisos ?? []).length > 0 && <span className="ct-muted"> · {(c.avisos ?? []).join(" ")}</span>}
                        {c.estado === "fallido" && c.mensaje && <span className="ct-muted"> · {c.mensaje}</span>}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
