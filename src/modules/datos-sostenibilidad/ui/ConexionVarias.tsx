/* =============================================================================
   Datos de Sostenibilidad · conectar VARIAS columnas de una tabla a VARIOS
   indicadores a la vez, y el filtro por valor para tablas en formato largo.

   - SelectorCategoria / SelectorValor: «Esta tabla mezcla varios indicadores en
     una columna» (filtro_col + filtro_valor van juntos, y la columna no puede
     ser sensible). Los usa también el modo de un solo indicador (Conexion.tsx).
   - ConectarVariasModal: una fila por columna numérica, un selector de
     indicador por fila (o «crear uno nuevo con el nombre de la columna»), el
     periodo y el campus una sola vez. Las conexiones se hacen en serie con los
     mismos hooks de siempre (sos_guardar_vinculo); la base decide y sus
     mensajes se muestran por fila. Las filas que fallan quedan para reintentar
     sin repetir las que ya se conectaron.

   Es aditivo: no toca ninguna conexión que no se elija aquí.
   ========================================================================== */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui/Icon";
import type { ColumnaUd, TablaDatos } from "../../udrive/tipos";
import { calcularIndicador, codigoDe, columnaSensible, avisosDeVinculo, useGuardarIndicador, useGuardarVinculo, valoresDistintos } from "../sos";
import type { IndicadorSos, ResumenSos, VinculoSos } from "../tipos";
import { Modal } from "./Modal";
import { AvisoSos, Campo, Segmentado, textoCifra } from "./piezas";

const esNumerica = (c: ColumnaUd) => c.tipo === "numero" || c.tipo === "porcentaje";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CODIGO_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/* ---------- Filtro por valor ------------------------------------------------------------------ */

/** La columna de categoría: de texto o de lista y que no traiga datos personales. */
export function columnasDeCategoria(tabla: TablaDatos, excluir: string[]): ColumnaUd[] {
  return tabla.columnas.filter((c) => (c.tipo === "texto" || c.tipo === "lista") && !columnaSensible(c) && !excluir.includes(c.clave));
}

export function SelectorCategoria({ tabla, excluir, valor, onChange, disabled, etiqueta = "Columna que dice a qué indicador pertenece cada fila" }: { tabla: TablaDatos; excluir: string[]; valor: string; onChange: (v: string) => void; disabled?: boolean; etiqueta?: string }) {
  const opciones = columnasDeCategoria(tabla, excluir);
  return (
    <Campo etiqueta={etiqueta} ayuda={opciones.length ? undefined : "La tabla no tiene una columna de texto o de lista que sirva de categoría."}>
      {(c) => (
        <select {...c} className="dsx-inp" value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">Elegir columna</option>
          {opciones.map((col) => (
            <option key={col.clave} value={col.clave}>
              {col.etiqueta || col.clave}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}

/** El valor de la categoría que corresponde, con los valores reales de la tabla y su número de filas. */
export function SelectorValor({ tabla, columna, valor, onChange, etiqueta = "Valor que le corresponde", ariaEtiqueta }: { tabla: TablaDatos; columna: string; valor: string; onChange: (v: string) => void; etiqueta?: string; ariaEtiqueta?: string }) {
  const valores = useMemo(() => valoresDistintos(tabla, columna), [tabla, columna]);
  const select = (c: { id?: string }) => (
    <select {...c} className="dsx-inp" aria-label={ariaEtiqueta} value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">Elegir valor</option>
      {valor && !valores.some((v) => v.valor === valor) ? <option value={valor}>{valor} (ya no está en la tabla)</option> : null}
      {valores.map((v) => (
        <option key={v.valor} value={v.valor}>
          {v.valor} ({v.filas} {v.filas === 1 ? "fila" : "filas"})
        </option>
      ))}
    </select>
  );
  if (ariaEtiqueta) return select({});
  return <Campo etiqueta={etiqueta}>{(c) => select(c)}</Campo>;
}

/* ---------- Valores por defecto de un indicador nuevo ------------------------------------------- */

function unidadDe(c: ColumnaUd): string {
  const t = sinTildes(`${c.clave} ${c.etiqueta}`);
  if (c.tipo === "porcentaje" || /%|porcentaje/.test(t)) return "%";
  if (/kwh/.test(t)) return "kWh";
  if (/\bm3\b|m³|metros cubicos|agua|litros/.test(t)) return "m³";
  if (/co2|emision/.test(t)) return "t CO₂";
  if (/residuo|tonelada/.test(t)) return "t";
  if (/arbol/.test(t)) return "árboles";
  if (/persona|estudiante|docente|empleado|visitante|voluntari/.test(t)) return "personas";
  return "unidades";
}

/* ---------- La ventana ----------------------------------------------------------------------------- */

interface Fila {
  id: string;
  /** Columna del valor. */
  col: string;
  /** "" sin conectar · "nuevo" crear uno · o el código de un indicador. */
  destino: string;
  /** Valor de la categoría (solo si se filtra). */
  filtro: string;
  /** Nombre del indicador nuevo; nulo = el automático. */
  nombre: string | null;
  /** La fila nació de «Un indicador por cada valor». */
  porValor: boolean;
  estado: "pendiente" | "ok" | "error";
  mensaje: string;
}

const filaDe = (col: string, extra: Partial<Fila> = {}): Fila => ({ id: col, col, destino: "", filtro: "", nombre: null, porValor: false, estado: "pendiente", mensaje: "", ...extra });

export interface PropsConectarVarias {
  archivoId: string;
  tabla: TablaDatos;
  indicadores: IndicadorSos[];
  vinculos: VinculoSos[];
  nombreArchivo: (id: string) => string;
  /** Administra la unidad: puede crear indicadores y tocar los publicados. */
  administra: boolean;
  /** Lo que propone proponer() para esta tabla. */
  propuesta: { valor: string; periodo: string; campus: string };
  onCerrar: () => void;
  onListo: (texto: string) => void;
}

export function ConectarVariasModal({ archivoId, tabla, indicadores, vinculos, nombreArchivo, administra, propuesta, onCerrar, onListo }: PropsConectarVarias) {
  const guardarInd = useGuardarIndicador();
  const guardarVin = useGuardarVinculo();
  const numericas = useMemo(() => tabla.columnas.filter((c) => esNumerica(c) && !columnaSensible(c)), [tabla]);
  const etiquetaDe = (clave: string) => tabla.columnas.find((c) => c.clave === clave)?.etiqueta || clave;
  const [periodo, setPeriodo] = useState(propuesta.periodo);
  const [campus, setCampus] = useState(propuesta.campus);
  const [catCol, setCatCol] = useState("");
  const [filas, setFilas] = useState<Fila[]>(() => numericas.map((c) => filaDe(c.clave)));
  const [busca, setBusca] = useState("");
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [resumen, setResumen] = useState<{ t: "ok" | "error"; texto: string } | null>(null);

  const poner = (id: string, parche: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...parche } : f)));
  const hayConectadas = filas.some((f) => f.estado === "ok");
  const nombreAuto = (f: Fila) => (f.filtro ? (f.porValor ? f.filtro : `${etiquetaDe(f.col)} · ${f.filtro}`) : etiquetaDe(f.col));
  const nombreDe = (f: Fila) => (f.nombre ?? nombreAuto(f)).trim();
  const colDe = (f: Fila) => tabla.columnas.find((c) => c.clave === f.col);

  // Los avisos de periodo, campus y categoría se dicen una vez; los de cada fila, solo lo propio de su columna.
  const generales = useMemo(() => (periodo && filas[0] ? avisosDeVinculo({ col_valor: filas[0].col, col_periodo: periodo, col_campus: campus || null, filtro_col: catCol || null }, tabla) : []), [periodo, campus, catCol, filas, tabla]);
  const avisosFila = (f: Fila) => avisosDeVinculo({ col_valor: f.col, col_periodo: periodo, col_campus: campus || null, filtro_col: catCol || null }, tabla).filter((a) => !generales.includes(a));

  const listo = (f: Fila) => f.destino !== "" && (f.destino !== "nuevo" || (administra && nombreDe(f) !== "")) && (!catCol || f.filtro !== "") && avisosFila(f).length === 0;
  const porHacer = filas.filter((f) => f.estado !== "ok" && listo(f));
  const puedeEnviar = Boolean(periodo) && generales.length === 0 && porHacer.length > 0;

  // Vista previa: el último valor que daría cada fila antes de guardar.
  const previas = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filas) {
      if (f.destino === "" || !periodo || (catCol && !f.filtro)) continue;
      const ind = f.destino === "nuevo" ? { resumen: (tabla.columnas.find((c) => c.clave === f.col)?.tipo === "porcentaje" ? "promedio" : "suma") as ResumenSos, meta: null, mejor: "sube" as const } : indicadores.find((i) => i.id === f.destino);
      if (!ind) continue;
      const calc = calcularIndicador(ind, { col_valor: f.col, col_periodo: periodo, col_campus: campus || null, filtro_col: catCol || null, filtro_valor: catCol ? f.filtro : null }, tabla);
      m.set(f.id, calc.actual ? `${textoCifra(calc.actual.valor, 2)} · ${calc.actual.anio}` : "Sin filas con valor y año");
    }
    return m;
  }, [filas, periodo, campus, catCol, indicadores, tabla]);

  /* --- Cambios de modo --- */
  const cambiarCat = (v: string) => {
    setCatCol(v);
    setResumen(null);
    setFilas(numericas.map((c) => filaDe(c.clave)));
  };
  const porColumna = () => setFilas(numericas.map((c) => filaDe(c.clave)));
  /** Una fila por cada valor distinto de la categoría: asigna el indicador que ya se llame así o propone crear uno. */
  const unoPorValor = () => {
    const valorCol = numericas.find((c) => c.clave === propuesta.valor)?.clave ?? numericas[0]?.clave;
    if (!catCol || !valorCol) return;
    const tomados = new Set<string>();
    setFilas(
      valoresDistintos(tabla, catCol).map(({ valor }) => {
        const igual = indicadores.find((i) => sinTildes(i.nombre) === sinTildes(valor) && !tomados.has(i.id) && !(i.publicado && !administra));
        if (igual) tomados.add(igual.id);
        return filaDe(valorCol, { id: `${valorCol}|${valor}`, filtro: valor, porValor: true, destino: igual ? igual.id : administra ? "nuevo" : "" });
      }),
    );
  };

  /* --- Ejecución en serie: primero los indicadores nuevos, luego las conexiones --- */
  const enviar = async (): Promise<boolean> => {
    if (!puedeEnviar) {
      setResumen({ t: "error", texto: !periodo ? "Elija la columna del periodo." : generales[0] ?? "Elija un indicador en al menos una fila." });
      return false;
    }
    setResumen(null);
    setCorriendo(true);
    const lista = porHacer;
    const total = lista.length;
    let hechos = 0;
    let fallos = 0;
    let exitos = 0;
    const destinos = new Map<string, string>(lista.filter((f) => f.destino !== "nuevo").map((f) => [f.id, f.destino]));
    const creados: { id: string }[] = [];
    let posicion = indicadores.filter((i) => i.ods === null).reduce((m, i) => Math.max(m, i.position), 0);
    try {
      const nuevos = lista.filter((x) => x.destino === "nuevo");
      for (const f of nuevos) {
        setProgreso(`Creando indicadores… ${++hechos} de ${nuevos.length}`);
        const col = colDe(f);
        const nombre = nombreDe(f);
        const codigo = codigoDe(nombre, [...indicadores, ...creados]);
        if (!col || !codigo || !CODIGO_OK.test(codigo)) {
          poner(f.id, { estado: "error", mensaje: "No pude armar un código con ese nombre: escriba otro nombre." });
          fallos++;
          continue;
        }
        try {
          await guardarInd.mutateAsync({ id: codigo, ods: null, nombre, descripcion: "", unidad: unidadDe(col), position: ++posicion, mejor: "sube", resumen: col.tipo === "porcentaje" ? "promedio" : "suma", meta: null, decimales: col.tipo === "porcentaje" ? 1 : 0, tarjeta: null, nota: "", etiquetas: [] });
          creados.push({ id: codigo });
          destinos.set(f.id, codigo);
          // Si la conexión falla, el reintento usa el indicador ya creado y no lo repite.
          poner(f.id, { destino: codigo, nombre: null });
        } catch (e) {
          poner(f.id, { estado: "error", mensaje: `No se pudo crear el indicador: ${e instanceof Error ? e.message : "error"}` });
          fallos++;
        }
      }
      hechos = 0;
      const aConectar = lista.filter((f) => destinos.has(f.id));
      for (const f of aConectar) {
        setProgreso(`Conectando… ${++hechos} de ${aConectar.length}`);
        try {
          await guardarVin.mutateAsync({ indicador_id: destinos.get(f.id)!, archivo_id: archivoId, col_valor: f.col, col_periodo: periodo, col_campus: campus || null, filtro_col: catCol || null, filtro_valor: catCol ? f.filtro : null });
          poner(f.id, { estado: "ok", mensaje: "" });
          exitos++;
        } catch (e) {
          poner(f.id, { estado: "error", mensaje: e instanceof Error ? e.message : "No se pudo conectar." });
          fallos++;
        }
      }
    } finally {
      setCorriendo(false);
      setProgreso("");
    }
    if (fallos === 0) {
      onListo(`${exitos} ${exitos === 1 ? "columna conectada" : "columnas conectadas"} a sus indicadores.`);
      return true;
    }
    setResumen({ t: "error", texto: `${exitos} ${exitos === 1 ? "conectada" : "conectadas"} y ${fallos} con error de ${total}. Corrija las filas marcadas y vuelva a conectar: las que ya quedaron no se repiten.` });
    return false;
  };

  /* --- Opciones del selector de indicador --- */
  const q = sinTildes(busca);
  const opcionesDe = (f: Fila) => {
    return indicadores.filter((i) => i.id === f.destino || (!i.archivado && (!q || sinTildes(`${i.id} ${i.nombre}`).includes(q))));
  };
  const usadoEnOtra = (f: Fila, id: string) => filas.some((x) => x.id !== f.id && x.destino === id);
  const textoOpcion = (i: IndicadorSos, f: Fila) => {
    const v = vinculos.find((x) => x.indicador_id === i.id);
    const nota = usadoEnOtra(f, i.id) ? " · ya elegido en otra fila" : i.publicado && !administra ? " · publicado: lo cambia quien administra" : v && v.archivo_id !== archivoId ? ` · hoy sale de «${nombreArchivo(v.archivo_id)}», se reemplazará` : v ? " · ya sale de esta tabla" : "";
    return `${i.id} · ${i.nombre}${nota}`;
  };
  const avisoDestino = (f: Fila): string | null => {
    const v = vinculos.find((x) => x.indicador_id === f.destino);
    if (!v) return null;
    return v.archivo_id !== archivoId ? `Hoy sale de «${nombreArchivo(v.archivo_id)}»; conectarlo aquí lo cambia.` : `Ya sale de esta tabla (columna «${etiquetaDe(v.col_valor)}»); se cambiará a esta columna.`;
  };

  const n = porHacer.length;
  const modal = (
    <Modal
      titulo="Conectar varias columnas"
      descripcion={`Una fila por cada columna numérica de esta tabla. Elija el indicador de cada una; el periodo y el campus valen para todas.`}
      onCerrar={onCerrar}
      onEnviar={enviar}
      principal={`Conectar ${n} ${n === 1 ? "columna" : "columnas"}`}
      pendiente={corriendo}
      textoPendiente={progreso || "Conectando…"}
      secundario={hayConectadas ? "Cerrar" : "Cancelar"}
      sucio={filas.some((f) => f.destino !== "" && f.estado !== "ok")}
      grande
    >
      <div className="dsx-cv">
        {!numericas.length ? (
          <AvisoSos>Esta tabla no tiene columnas numéricas (número o porcentaje) que se puedan conectar.</AvisoSos>
        ) : (
          <>
            <div className="dsx-cv__global">
              <Campo etiqueta="Columna del periodo (para todas)">
                {(c) => (
                  <select {...c} className="dsx-inp" value={periodo} data-foco="" disabled={corriendo} onChange={(e) => setPeriodo(e.target.value)}>
                    <option value="">Elegir columna</option>
                    {tabla.columnas.filter((col) => col.clave !== catCol).map((col) => (
                      <option key={col.clave} value={col.clave}>
                        {col.etiqueta || col.clave}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Columna del campus (si es por campus)">
                {(c) => (
                  <select {...c} className="dsx-inp" value={campus} disabled={corriendo} onChange={(e) => setCampus(e.target.value)}>
                    <option value="">Ninguna: cifra institucional</option>
                    {tabla.columnas.filter((col) => col.clave !== periodo && col.clave !== catCol).map((col) => (
                      <option key={col.clave} value={col.clave}>
                        {col.etiqueta || col.clave}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Buscar indicador" ayuda="Filtra la lista de cada fila.">
                {(c) => <input {...c} className="dsx-inp" type="search" value={busca} placeholder="Código o nombre" autoComplete="off" onChange={(e) => setBusca(e.target.value)} />}
              </Campo>
            </div>
            {generales.map((a) => (
              <AvisoSos key={a}>{a}</AvisoSos>
            ))}

            <Segmentado
              etiqueta="Cómo está armada la tabla"
              valor={catCol ? "larga" : "ancha"}
              opciones={[
                { id: "ancha", etiqueta: "Cada indicador tiene su columna" },
                { id: "larga", etiqueta: "Una columna mezcla varios indicadores" },
              ]}
              onChange={(v) => {
                if (hayConectadas || corriendo) return;
                if (v === "ancha") cambiarCat("");
                else if (!catCol) cambiarCat(columnasDeCategoria(tabla, [periodo])[0]?.clave ?? "");
              }}
            />
            {catCol || hayConectadas ? null : <p className="dsx-tenue">Si la tabla trae una columna de categoría (por ejemplo «Indicador» con filas de energía, agua…), elija la segunda opción.</p>}
            {catCol ? (
              <>
                <SelectorCategoria tabla={tabla} excluir={[periodo, campus]} valor={catCol} disabled={hayConectadas || corriendo} onChange={cambiarCat} />
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <button type="button" className="dsx-btn dsx-btn--sm" disabled={hayConectadas || corriendo} onClick={unoPorValor}>
                    Un indicador por cada valor
                  </button>
                  {filas.some((f) => f.porValor) ? (
                    <button type="button" className="dsx-btn dsx-btn--sm dsx-btn--ghost" disabled={hayConectadas || corriendo} onClick={porColumna}>
                      Volver a una fila por columna
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
            {!administra ? <AvisoSos>Crear indicadores nuevos y cambiar los ya publicados es de quien Administra la unidad; el resto de las filas sí se puede conectar.</AvisoSos> : null}

            <div role="list" className="dsx-cv">
              {filas.map((f) => {
                const col = colDe(f);
                const av = avisosFila(f);
                const ya = f.estado === "ok";
                const bloqueaPublicado = (i: IndicadorSos) => i.publicado && !administra;
                const dAviso = f.destino && f.destino !== "nuevo" ? avisoDestino(f) : null;
                const enLista = f.destino === "" || f.destino === "nuevo" || indicadores.some((i) => i.id === f.destino);
                return (
                  <div key={f.id} role="listitem" className="dsx-cv__fila" data-estado={f.estado === "pendiente" ? undefined : f.estado}>
                    <div>
                      <b>{col?.etiqueta || f.col}</b>
                      <span className="dsx-tenue">{col?.tipo === "porcentaje" ? "Porcentaje" : "Número"}</span>
                    </div>
                    <div>
                      <select className="dsx-inp" aria-label={`Indicador para la columna ${col?.etiqueta || f.col}`} value={f.destino} disabled={ya || corriendo} onChange={(e) => poner(f.id, { destino: e.target.value, estado: "pendiente", mensaje: "" })}>
                        <option value="">Sin conectar</option>
                        <option value="nuevo" disabled={!administra}>
                          + Crear indicador nuevo con el nombre de la columna{administra ? "" : " (lo hace quien Administra)"}
                        </option>
                        {!enLista ? <option value={f.destino}>{f.destino}</option> : null}
                        {opcionesDe(f).map((i) => (
                          <option key={i.id} value={i.id} disabled={usadoEnOtra(f, i.id) || bloqueaPublicado(i)}>
                            {textoOpcion(i, f)}
                          </option>
                        ))}
                      </select>
                      {f.destino === "nuevo" ? (
                        <input className="dsx-inp" aria-label={`Nombre del indicador nuevo para ${col?.etiqueta || f.col}`} value={f.nombre ?? nombreAuto(f)} maxLength={120} disabled={ya || corriendo} autoComplete="off" onChange={(e) => poner(f.id, { nombre: e.target.value })} />
                      ) : null}
                      {dAviso ? <span className="dsx-tenue">{dAviso}</span> : null}
                    </div>
                    <div>
                      {catCol ? <SelectorValor tabla={tabla} columna={catCol} valor={f.filtro} ariaEtiqueta={`Valor de «${etiquetaDe(catCol)}» para ${col?.etiqueta || f.col}`} onChange={(v) => poner(f.id, { filtro: v, estado: "pendiente", mensaje: "" })} /> : <span className="dsx-tenue">Toda la tabla</span>}
                    </div>
                    <div aria-live="polite">
                      {ya ? (
                        <span className="dsx-chip" data-t="ok">
                          <Icon name="check" size={13} /> Conectada
                        </span>
                      ) : f.estado === "error" ? (
                        <span className="dsx-fl__error">
                          <Icon name="alert" size={13} /> {f.mensaje}
                        </span>
                      ) : previas.has(f.id) ? (
                        <span className="dsx-tenue">Hoy daría {previas.get(f.id)}</span>
                      ) : null}
                    </div>
                    {av.length ? (
                      <div className="dsx-cv__nota">
                        {av.map((a) => (
                          <AvisoSos key={a}>{a}</AvisoSos>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!filas.length ? <p className="dsx-tenue">La columna de categoría no tiene valores todavía.</p> : null}
            </div>
            {resumen ? <AvisoSos tipo={resumen.t}>{resumen.texto}</AvisoSos> : null}
          </>
        )}
      </div>
    </Modal>
  );
  // Fuera del panel: así el formulario de la ventana no queda dentro de otro elemento del editor.
  return createPortal(modal, document.body);
}
