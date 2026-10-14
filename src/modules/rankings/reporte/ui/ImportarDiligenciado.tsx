/* Importar lo que Planeación ya diligenció en el Excel de THE (Value, Yes/No, Evidence, Public, Comentarios). Vista previa y confirmación. */

import { useEffect, useMemo, useRef, useState } from "react";
import type { RankingCycleRow, RankingResponseRow } from "../../../../types/database";
import { evidenciasDe, useImportarDiligenciado } from "../datos";
import type { UnidadRef } from "../datos";
import { leerDiligenciado, planificarImportacion } from "../diligenciado-excel";
import type { DiligenciadoExcel, EvidenciaExistente, Modo } from "../diligenciado-excel";
import { unidadPlaneacion } from "../resumen";
import type { Indicador } from "../tipos";
import { useEntrada } from "../../movimiento";
import { fmtNumero } from "./comunes";

interface Props {
  ciclo: RankingCycleRow | null;
  indicadores: Indicador[];
  respuestas: RankingResponseRow[];
  unidades: UnidadRef[];
}

const LIMITE_PROBLEMAS = 12;

export function ImportarDiligenciado({ ciclo, indicadores, respuestas, unidades }: Props) {
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [leido, setLeido] = useState<{ nombre: string; datos: DiligenciadoExcel } | null>(null);
  const [unidadElegida, setUnidad] = useState("");
  const [modo, setModo] = useState<Modo>("borrador");
  const [pisar, setPisar] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [evidencias, setEvidencias] = useState<EvidenciaExistente[] | null>(null);
  const importar = useImportarDiligenciado();
  const previa = useRef<HTMLDivElement>(null);
  useEntrada(previa, ".rk-rep-vista > *", leido?.nombre ?? null);

  const unidad = unidadElegida || unidadPlaneacion(unidades)?.id || "";
  const existentes = useMemo(() => respuestas.filter((r) => r.unidad === unidad), [respuestas, unidad]);

  // Las evidencias que ya tiene la oficina destino, para no repetirlas.
  useEffect(() => {
    if (!leido || !unidad) return;
    let vivo = true;
    setEvidencias(null);
    evidenciasDe(existentes.map((r) => r.id))
      .then((e) => vivo && setEvidencias(e))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer las evidencias existentes."));
    return () => {
      vivo = false;
    };
  }, [leido, unidad, existentes]);

  const plan = useMemo(() => {
    if (!leido || !evidencias) return null;
    return planificarImportacion({
      leido: leido.datos,
      catalogo: indicadores,
      existentes: existentes.map((r) => ({ id: r.id, indicador: r.indicador, estado: r.estado, valores: r.valores, si_no: r.si_no, comentario_es: r.comentario_es })),
      evidencias,
      modo,
      pisarAprobadas: pisar,
    });
  }, [leido, evidencias, indicadores, existentes, modo, pisar]);

  async function alElegir(archivo: File) {
    setError(null);
    setListo(null);
    setLeyendo(true);
    setConfirmado(false);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(await archivo.arrayBuffer());
      const datos = leerDiligenciado(libro, archivo.name);
      setLeido({ nombre: archivo.name, datos });
    } catch (e) {
      setLeido(null);
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : "formato no reconocido"}.`);
    } finally {
      setLeyendo(false);
    }
  }

  async function confirmar() {
    if (!plan || !ciclo || !unidad) return;
    setError(null);
    try {
      const r = await importar.mutateAsync({ ciclo: ciclo.id, unidad, plan });
      const nombre = unidades.find((u) => u.id === unidad)?.name ?? "la oficina";
      setListo(
        `Importado para ${nombre}: ${fmtNumero(r.creadas, 0)} respuestas nuevas, ${fmtNumero(r.actualizadas, 0)} actualizadas y ${fmtNumero(r.evidencias, 0)} evidencias.` +
          (r.errores.length ? ` ${r.errores.length} con error: ${r.errores.slice(0, 3).join(" · ")}` : ""),
      );
      setLeido(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    }
  }

  const d = leido?.datos;
  const vacio = d && d.datos.length === 0;
  const anioDistinto = d?.anioArchivo && ciclo && d.anioArchivo !== ciclo.anio;
  const faltaConfirmar = Boolean(plan && plan.conteo.aprobadasPisadas > 0 && !confirmado);
  const acciones = plan?.acciones.length ?? 0;

  return (
    <section className="rk-rep-card" aria-labelledby="rk-rep-dil-h">
      <div className="rk-rep-split">
        <div>
          <h3 id="rk-rep-dil-h" className="rk-rep-h3">
            Cifras y datos ya diligenciados
          </h3>
          <p className="rk-rep-muted rk-rep-small">
            Lee lo escrito en «Value», «Yes/No», «Evidence», «Public» y «Comentarios» de las hojas SDG (y lo que falte, de la hoja CONTROL) y lo carga como la respuesta
            de una oficina. Las opciones como «4.2.1/2» se suman a su indicador.
          </p>
        </div>
        <label className="rk-rep-btn rk-rep-file-btn">
          {leyendo ? "Leyendo el archivo…" : "Elegir Excel diligenciado"}
          <input
            type="file"
            accept=".xlsx"
            className="rk-rep-sr"
            disabled={leyendo || importar.isPending || !ciclo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void alElegir(f);
            }}
          />
        </label>
      </div>

      {!ciclo && <p className="rk-rep-small rk-rep-muted">Primero importe el catálogo de THE: así queda el ciclo al que se cargan las respuestas.</p>}
      {error && (
        <p className="rk-rep-aviso-linea is-risk" role="alert">
          {error}
        </p>
      )}
      {listo && (
        <p className="rk-rep-aviso-linea is-ok" role="status">
          {listo}
        </p>
      )}

      <div ref={previa}>
        {d && leido && (
          <div className="rk-rep-vista" aria-live="polite">
            <p className="rk-rep-vista-t">
              <b>Vista previa de «{leido.nombre}»</b>
              {d.anioArchivo && (
                <span className="rk-rep-small rk-rep-muted">
                  {" "}
                  · el archivo dice edición {d.anioArchivo}
                  {d.anioDatos ? `, datos del año ${d.anioDatos}` : ""}
                </span>
              )}
            </p>
            {anioDistinto && (
              <p className="rk-rep-aviso-linea is-warn">
                El archivo es de la edición {d.anioArchivo} y el ciclo abierto es {ciclo?.anio}. Se carga en el ciclo {ciclo?.anio}; si no es lo que quiere, importe el
                catálogo con el año correcto primero.
              </p>
            )}

            {vacio ? (
              <p className="rk-rep-vacio rk-rep-small">
                El archivo no trae nada diligenciado en esas columnas ({fmtNumero(d.celdas, 0)} celdas con algo). No hay nada que importar.
              </p>
            ) : (
              <>
                <div className="rk-rep-grid-2">
                  <label className="rk-rep-field">
                    <span className="rk-rep-lbl">Cargar como la respuesta de</span>
                    <select className="rk-rep-select" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                      <option value="">Elija la oficina…</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rk-rep-field">
                    <span className="rk-rep-lbl" id="rk-rep-dil-modo">
                      Estado en que quedan
                    </span>
                    <div className="rk-rep-yn" role="group" aria-labelledby="rk-rep-dil-modo">
                      <button type="button" aria-pressed={modo === "borrador"} onClick={() => setModo("borrador")}>
                        Borrador
                      </button>
                      <button type="button" aria-pressed={modo === "aprobado"} onClick={() => setModo("aprobado")}>
                        Aprobado
                      </button>
                    </div>
                  </div>
                </div>

                {!plan && unidad && <p className="rk-rep-small rk-rep-muted">Comparando con lo que ya tiene la oficina…</p>}
                {plan && (
                  <>
                    <dl className="rk-rep-vista-cifras">
                      <div>
                        <dt>Respuestas nuevas</dt>
                        <dd className="rk-rep-num">{fmtNumero(plan.conteo.crear, 0)}</dd>
                      </div>
                      <div>
                        <dt>Se actualizan</dt>
                        <dd className="rk-rep-num">{fmtNumero(plan.conteo.actualizar, 0)}</dd>
                      </div>
                      <div>
                        <dt>Evidencias nuevas</dt>
                        <dd className="rk-rep-num">{fmtNumero(plan.conteo.evidencias, 0)}</dd>
                      </div>
                      <div>
                        <dt>Ya estaban</dt>
                        <dd className="rk-rep-num">{fmtNumero(plan.conteo.repetidas, 0)}</dd>
                      </div>
                    </dl>
                    {(plan.aprobadasProtegidas.length > 0 || plan.conteo.aprobadasPisadas > 0) && (
                      <label className="rk-rep-small">
                        <input
                          type="checkbox"
                          checked={pisar}
                          onChange={(e) => {
                            setPisar(e.target.checked);
                            setConfirmado(false);
                          }}
                        />{" "}
                        También actualizar las {fmtNumero(plan.aprobadasProtegidas.length + plan.conteo.aprobadasPisadas, 0)} respuestas ya aprobadas (por defecto no se tocan)
                      </label>
                    )}
                    {plan.conteo.aprobadasPisadas > 0 && (
                      <label className="rk-rep-aviso-linea is-warn">
                        <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} /> Confirmo que se cambien{" "}
                        {fmtNumero(plan.conteo.aprobadasPisadas, 0)} respuestas aprobadas{modo === "borrador" ? ": vuelven a borrador" : ""}.
                      </label>
                    )}
                    {plan.problemas.length > 0 && (
                      <details className="rk-rep-small" open={plan.problemas.length <= 4 || undefined}>
                        <summary>{plan.problemas.length} avisos del archivo</summary>
                        <ul className="rk-rep-lista">
                          {plan.problemas.slice(0, LIMITE_PROBLEMAS).map((p, i) => (
                            <li key={i}>{p.texto}</li>
                          ))}
                          {plan.problemas.length > LIMITE_PROBLEMAS && <li>y {plan.problemas.length - LIMITE_PROBLEMAS} más.</li>}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </>
            )}

            <div className="rk-rep-row">
              {!vacio && (
                <button type="button" className="rk-rep-btn is-primary" onClick={() => void confirmar()} disabled={!plan || acciones === 0 || faltaConfirmar || importar.isPending}>
                  {importar.isPending
                    ? "Importando…"
                    : `Cargar ${fmtNumero(acciones, 0)} ${acciones === 1 ? "indicador" : "indicadores"} como ${modo === "aprobado" ? "aprobados" : "borrador"}`}
                </button>
              )}
              <button type="button" className="rk-rep-btn" onClick={() => setLeido(null)} disabled={importar.isPending}>
                Cancelar
              </button>
              <span className="rk-rep-small rk-rep-muted">Nada se guarda hasta confirmar. Repetir la importación no duplica evidencias.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
