/* =============================================================================
   Observatorio · 1 Captura · «Desde el Warehouse».

   Se elige una carga vigente del UDES Warehouse (conjunto, sede, periodo),
   se ven las columnas que la política de privacidad permite, se define una
   agregación y se guarda como una tabla del Observatorio. La agregación y la
   reserva «< 5» ocurren en la base (migración 0249): aquí nunca llega una
   fila individual del almacén.

   También aquí vive el aviso de origen de una tabla que viene del almacén:
   de qué carga sale y si el Warehouse ya tiene una versión más nueva.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { conjuntoPorId, SEDES } from "../../../warehouse/conjuntos";
import { Barras } from "../../../warehouse/graficos";
import "../../../warehouse/warehouse.css";
import { Panel } from "../../udes-en-cifras/ui";
import { RawTable } from "../ObsCharts";
import type { ObsDataset } from "../model";
import { RESERVED_TEXT, plural } from "../model";
import { mensajeWh, useCatalogoWh, useColumnasWh, useMaterializarWh, useOrigenesWh, usePrevisualizarWh, useRefrescarWh } from "../fuenteWarehouse";
import type { CargaVigente, MedidaWh, OperacionWh, ResultadoWh } from "../fuenteWarehouse";

const OPERACION: Record<OperacionWh, string> = { contar: "Contar registros", sumar: "Sumar", promediar: "Promediar" };
const nombreSede = (id: string) => SEDES.find((s) => s.id === id)?.nombre ?? id.toUpperCase();
const nombreConjunto = (id: string) => conjuntoPorId(id)?.nombre ?? id;
const etiqueta = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "");
const rotuloCarga = (c: CargaVigente) => `${nombreSede(c.sede)} · ${c.periodo}${c.corte ? ` · corte ${c.corte === "f" ? "final" : c.corte}` : ""} · versión ${c.version} · ${c.filas.toLocaleString("es-CO")} filas`;

export function FuenteWarehouse({ topic, obsId, onCancel, onSaved }: { topic: string; obsId: string; onCancel: () => void; onSaved: (datasetId: string) => void }) {
  const catalogo = useCatalogoWh(obsId, true);
  const [conjunto, setConjunto] = useState("");
  const [cargaId, setCargaId] = useState("");
  const [dims, setDims] = useState<string[]>([]);
  const [medidas, setMedidas] = useState<MedidaWh[]>([{ op: "contar" }]);
  const [titulo, setTitulo] = useState("");
  const [vivo, setVivo] = useState(false);
  const [vista, setVista] = useState<ResultadoWh | null>(null);
  const [error, setError] = useState("");

  const conjuntos = useMemo(() => [...new Set((catalogo.data ?? []).map((c) => c.conjunto))].sort((a, b) => nombreConjunto(a).localeCompare(nombreConjunto(b), "es")), [catalogo.data]);
  const cargas = useMemo(() => (catalogo.data ?? []).filter((c) => c.conjunto === conjunto), [catalogo.data, conjunto]);
  const carga = cargas.find((c) => c.carga === cargaId) ?? null;
  const columnas = useColumnasWh(obsId, carga?.carga ?? null);
  const preview = usePrevisualizarWh();
  const guardar = useMaterializarWh();

  const numericas = (columnas.data?.columnas ?? []).filter((c) => c.tipo === "numero");
  const todas = columnas.data?.columnas ?? [];
  const medidasValidas = medidas.every((m) => m.op === "contar" || m.col);

  const cambiar = () => {
    setVista(null);
    setError("");
  };
  const elegirConjunto = (id: string) => {
    setConjunto(id);
    const primera = (catalogo.data ?? []).find((c) => c.conjunto === id);
    setCargaId(primera?.carga ?? "");
    setDims([]);
    setMedidas([{ op: "contar" }]);
    setTitulo("");
    cambiar();
  };
  const elegirCarga = (id: string) => {
    setCargaId(id);
    setDims([]);
    setMedidas([{ op: "contar" }]);
    cambiar();
  };
  const ponerDim = (i: number, key: string) => {
    const next = [...dims];
    if (key) next[i] = key;
    else next.splice(i, 1);
    setDims(next.filter(Boolean));
    cambiar();
  };
  const ponerMedida = (i: number, m: MedidaWh) => {
    setMedidas((list) => list.map((x, j) => (j === i ? m : x)));
    cambiar();
  };

  const ver = () => {
    if (!carga) return;
    setError("");
    preview.mutate({ obs: obsId, carga: carga.carga, dims, medidas }, { onSuccess: setVista, onError: (e) => { setVista(null); setError(mensajeWh(e)); } });
  };
  const guardarTabla = () => {
    if (!carga) return;
    setError("");
    guardar.mutate(
      { obs: obsId, tema: topic, carga: carga.carga, dims, medidas, titulo: titulo.trim(), vivo, fuente: `Planeación Institucional · ${nombreConjunto(carga.conjunto)}` },
      { onSuccess: (r) => onSaved(r.dataset_id), onError: (e) => setError(mensajeWh(e)) },
    );
  };

  const tablaVista: ObsDataset | null = vista
    ? { id: "vista", topic, title: titulo || "Vista previa", description: "", source: "", dataType: "conteo", temporality: "sin_tiempo", periodLabel: carga?.periodo ?? "", columns: vista.columns, rows: vista.rows, anonymization: null, sample: false, status: "borrador", position: 0, updatedAt: "" }
    : null;
  const primeraCifra = vista?.columns.find((c) => c.kind === "cifra");
  const primeraDim = vista?.columns.find((c) => c.kind === "texto");
  const barras =
    vista && primeraCifra && primeraDim && dims.length === 1 && vista.rows.length <= 25
      ? vista.rows.map((r) => ({ etiqueta: String(r.cells[primeraDim.key] ?? ""), valor: Number(r.cells[primeraCifra.key] ?? 0) }))
      : null;

  return (
    <Panel
      id="obs-warehouse"
      title="Tabla desde el Warehouse"
      description="Elija una carga vigente, defina cómo agregarla y guárdela como tabla del tema. Solo se guardan cifras agregadas: los grupos de menos de 5 registros se descartan."
      actions={
        <button type="button" className="oda-link-button" onClick={onCancel}>
          Cancelar
        </button>
      }
    >
      {catalogo.isPending ? (
        <p role="status">Leyendo las cargas del Warehouse…</p>
      ) : catalogo.isError ? (
        <div className="obs-empty" role="alert">
          <strong>No se pudo leer el Warehouse</strong>
          <p>{mensajeWh(catalogo.error)}</p>
        </div>
      ) : conjuntos.length === 0 ? (
        <div className="obs-empty">
          <strong>No hay cargas disponibles</strong>
          <p>El Warehouse no tiene cargas vigentes de conjuntos abiertos al Observatorio.</p>
        </div>
      ) : (
        <div className="obs-wh">
          <fieldset className="obs-wh__paso">
            <legend>1 · Fuente</legend>
            <div className="obs-wh__fila">
              <label className="obs-field">
                <span>Conjunto</span>
                <select value={conjunto} onChange={(e) => elegirConjunto(e.target.value)}>
                  <option value="">Elija un reporte…</option>
                  {conjuntos.map((c) => (
                    <option key={c} value={c}>
                      {nombreConjunto(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="obs-field">
                <span>Sede, periodo y versión vigente</span>
                <select value={cargaId} disabled={!conjunto} onChange={(e) => elegirCarga(e.target.value)}>
                  {cargas.map((c) => (
                    <option key={c.carga} value={c.carga}>
                      {rotuloCarga(c)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          {carga && (
            <fieldset className="obs-wh__paso">
              <legend>2 · Columnas permitidas</legend>
              {columnas.isPending ? (
                <p role="status">Revisando la política de privacidad…</p>
              ) : columnas.isError ? (
                <p className="obsx-error" role="alert">{mensajeWh(columnas.error)}</p>
              ) : (
                <>
                  <ul className="obs-wh__chips" role="list">
                    {todas.map((c) => (
                      <li key={c.key} title={`${c.distintos.toLocaleString("es-CO")} valores distintos`}>
                        {etiqueta(c.key)} <small>{c.tipo === "numero" ? "número" : "texto"}</small>
                      </li>
                    ))}
                  </ul>
                  {columnas.data.excluidas.length > 0 && (
                    <p className="obs-wh__nota">
                      <Icon name="shield" size={13} /> {plural(columnas.data.excluidas.length, "columna queda", "columnas quedan")} fuera por la política de privacidad (datos personales o seudónimos); no se puede agrupar ni calcular con ellas.
                    </p>
                  )}
                </>
              )}
            </fieldset>
          )}

          {carga && columnas.data && (
            <fieldset className="obs-wh__paso">
              <legend>3 · Agregación</legend>
              <div className="obs-wh__fila">
                {[0, 1].map((i) =>
                  i === 0 || dims[0] ? (
                    <label className="obs-field" key={i}>
                      <span>{i === 0 ? "Agrupar por" : "Y luego por"}</span>
                      <select value={dims[i] ?? ""} onChange={(e) => ponerDim(i, e.target.value)}>
                        <option value="">{i === 0 ? "Sin agrupar (un total)" : "Ninguna más"}</option>
                        {todas.filter((c) => c.key === dims[i] || !dims.includes(c.key)).map((c) => (
                          <option key={c.key} value={c.key}>
                            {etiqueta(c.key)} ({c.distintos.toLocaleString("es-CO")} valores)
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null,
                )}
              </div>
              <div className="obs-wh__medidas">
                {medidas.map((m, i) => (
                  <div className="obs-wh__fila" key={i}>
                    <label className="obs-field">
                      <span>Medida {i + 1}</span>
                      <select value={m.op} onChange={(e) => ponerMedida(i, { op: e.target.value as OperacionWh, col: e.target.value === "contar" ? undefined : (m.col ?? numericas[0]?.key) })}>
                        {(Object.keys(OPERACION) as OperacionWh[]).filter((op) => op === "contar" || numericas.length > 0).map((op) => (
                          <option key={op} value={op}>
                            {OPERACION[op]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {m.op !== "contar" && (
                      <label className="obs-field">
                        <span>De la columna</span>
                        <select value={m.col ?? ""} onChange={(e) => ponerMedida(i, { ...m, col: e.target.value })}>
                          {numericas.map((c) => (
                            <option key={c.key} value={c.key}>
                              {etiqueta(c.key)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {medidas.length > 1 && (
                      <button type="button" className="oda-link-button" onClick={() => { setMedidas(medidas.filter((_, j) => j !== i)); cambiar(); }}>
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
                {medidas.length < 3 && (
                  <button type="button" className="button-ghost" onClick={() => { setMedidas([...medidas, { op: "contar" }]); cambiar(); }}>
                    Añadir otra medida
                  </button>
                )}
              </div>
              <div>
                <button type="button" className="button-secondary" disabled={!medidasValidas || preview.isPending} onClick={ver}>
                  {preview.isPending ? "Calculando…" : "Ver resultado"}
                </button>
              </div>
            </fieldset>
          )}

          {error && (
            <p className="obsx-error" role="alert">
              {error}
            </p>
          )}

          {vista && tablaVista && (
            <fieldset className="obs-wh__paso">
              <legend>4 · Resultado y guardado</legend>
              <p className="obs-wh__nota">
                <Icon name="shield" size={13} /> {plural(vista.grupos, "grupo", "grupos")} de {vista.registros.toLocaleString("es-CO")} registros.
                {vista.grupos_descartados > 0 && <> Se dejan fuera {plural(vista.grupos_descartados, "grupo", "grupos")} con menos de 5 registros ({vista.registros_descartados.toLocaleString("es-CO")} registros): nunca se publican como «{RESERVED_TEXT}» en tablas del Warehouse.</>}
              </p>
              {barras && <Barras datos={barras} titulo={tablaVista.columns.find((c) => c.kind === "cifra")?.label ?? "Resultado"} decimales={primeraCifra?.format === "entero" ? 0 : 2} />}
              <RawTable dataset={tablaVista} compact limit={30} />
              <div className="obs-wh__fila">
                <label className="obs-field">
                  <span>Título de la tabla</span>
                  <input type="text" value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder={`Por ejemplo: ${nombreConjunto(carga?.conjunto ?? "")} por ${dims.length ? etiqueta(dims[0]).toLowerCase() : "total"}`} />
                </label>
              </div>
              <label className="obs-wh__vivo">
                <input type="checkbox" checked={vivo} onChange={(e) => setVivo(e.target.checked)} /> Tabla «viva»: marcarla para refrescarla cuando el Warehouse tenga una versión más nueva.
              </label>
              <div>
                <button type="button" className="button-primary" disabled={titulo.trim().length < 3 || guardar.isPending} onClick={guardarTabla}>
                  Guardar como tabla del tema
                </button>
                <p className="obs-wh__nota">Nace como borrador. Se publica desde la ficha de la tabla.</p>
              </div>
            </fieldset>
          )}
        </div>
      )}
    </Panel>
  );
}

/* --- Origen de una tabla que viene del Warehouse -------------------------------------------- */

export function OrigenWarehouse({ dataset, obsId, canEdit }: { dataset: ObsDataset; obsId: string; canEdit: boolean }) {
  const origenes = useOrigenesWh(obsId);
  const refrescar = useRefrescarWh();
  const [aviso, setAviso] = useState("");
  const origen = origenes.data?.find((o) => o.dataset_id === dataset.id);
  if (!origen) return null;
  const actualizar = () => {
    setAviso("");
    refrescar.mutate(dataset.id, {
      onSuccess: (r) => setAviso(r.cambio ? `Tabla actualizada a la versión ${r.version}.` : "Ya estaba al día."),
      onError: (e) => setAviso(mensajeWh(e)),
    });
  };
  return (
    <p className="obs-wh__origen" data-tone={origen.desactualizado ? "aviso" : undefined} role="note">
      <Icon name={origen.desactualizado ? "alert" : "shield"} size={15} />
      <span>
        Viene del Warehouse: <strong>{nombreConjunto(origen.conjunto)}</strong> · {nombreSede(origen.sede)} · {origen.periodo} · versión {origen.version}, calculada el {fecha(origen.materializado_en)}
        {origen.vivo ? " · tabla viva" : ""}.{" "}
        {origen.sin_vigente
          ? "El Warehouse ya no tiene una versión vigente de esta fuente."
          : origen.desactualizado
            ? `Desactualizada: el Warehouse tiene la versión ${origen.vigente_version}${origen.vigente_en ? ` (${fecha(origen.vigente_en)})` : ""}.`
            : "Está al día con el Warehouse."}
        {aviso && <> {aviso}</>}
      </span>
      {canEdit && origen.desactualizado && (
        <button type="button" className="button-secondary" disabled={refrescar.isPending} onClick={actualizar}>
          {refrescar.isPending ? "Actualizando…" : "Actualizar"}
        </button>
      )}
    </p>
  );
}
