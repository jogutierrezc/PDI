/* =============================================================================
   Biblioteca de evidencias de THE Impact (solo Planeación y administración).

   Arriba, la carga del ZIP (CargaZip). Abajo, la biblioteca: filtros por estado,
   ODS, carpeta y texto; cada archivo con la propuesta de Pilo y, al abrirlo,
   sus razones, ver o descargar (URL firmada), aceptar o corregir el indicador
   y descartar. «Aceptar» liga el archivo como evidencia de la respuesta de la
   oficina elegida (Planeación Institucional por defecto).
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { RankingCycleRow } from "../../../../types/database";
import { FaltaMigracion } from "../../noticias";
import { odsNombre } from "../../ods";
import { useEntrada } from "../../movimiento";
import { indicadorPorId } from "../../informes/the-indicadores";
import type { UnidadRef } from "../../reporte/datos";
import { unidadPlaneacion } from "../../reporte/resumen";
import type { Indicador } from "../../reporte/tipos";
import { AvisoMigracion, Cargando, OdsChip, Vacio, fmtNumero } from "../../reporte/ui/comunes";
import { UMBRAL_ALTO, UMBRAL_PROPUESTA } from "../clasificar";
import { AVISO_PRIVADA, BUCKET_BIBLIOTECA, useActualizarArchivos, useAceptarArchivos, useBiblioteca, useBorrarArchivos, useUrlFirmada } from "../datos";
import type { ArchivoBiblioteca } from "../datos";
import { ETIQUETA_BIBLIOTECA, FILTRO_INICIAL, aceptablesEnLote, carpetasDe, contarEstados, esEnlacePublico, filtrar } from "../filtros";
import type { EstadoBiblioteca, Filtro } from "../filtros";
import { mb } from "../zip-seguro";
import { CargaZip } from "./CargaZip";
import "../biblioteca.css";

interface Props {
  ciclo: RankingCycleRow | null;
  indicadores: Indicador[];
  unidades: UnidadRef[];
}

const PAGINA = 60;
const ESTADOS: EstadoBiblioteca[] = ["propuesta", "sin_clasificar", "aceptada", "descartada"];

/** Indicadores que se pueden aceptar: los del ciclo (sin investigación). */
function opcionesIndicador(indicadores: Indicador[]) {
  return indicadores.filter((i) => i.nivel === "indicator" && i.tipo !== "inv").sort((a, b) => a.ods - b.ods || a.id.localeCompare(b.id, "es", { numeric: true }));
}

const tituloDe = (id: string, indicadores: Indicador[]) => {
  const i = indicadores.find((x) => x.id === id);
  return i?.texto_es || indicadorPorId(id)?.titulo || i?.texto_en || "";
};

export function Biblioteca({ ciclo, indicadores, unidades }: Props) {
  const lista = useBiblioteca();
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [visibles, setVisibles] = useState(PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const planeacion = unidadPlaneacion(unidades);
  const [unidadLote, setUnidadLote] = useState<string>("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "risk" | "warn"; texto: string } | null>(null);
  const aceptar = useAceptarArchivos();
  const actualizar = useActualizarArchivos();
  const cuerpo = useRef<HTMLUListElement>(null);
  useEntrada(cuerpo, ".rk-bib-fila", `${filtro.estado}-${filtro.ods}-${filtro.carpeta}`);

  const filas = useMemo(() => lista.data ?? [], [lista.data]);
  const conteo = useMemo(() => contarEstados(filas), [filas]);
  const carpetas = useMemo(() => carpetasDe(filas), [filas]);
  const odsPresentes = useMemo(() => [...new Set(filas.flatMap((f) => f.ods_propuestos))].sort((a, b) => a - b), [filas]);
  const filtradas = useMemo(() => filtrar(filas, filtro), [filas, filtro]);
  const enLote = useMemo(() => aceptablesEnLote(filtradas), [filtradas]);
  const opciones = useMemo(() => opcionesIndicador(indicadores), [indicadores]);
  const unidad = unidadLote || planeacion?.id || "";

  if (lista.error instanceof FaltaMigracion) {
    return (
      <div className="rk-rep-stack">
        <AvisoMigracion error={lista.error} />
      </div>
    );
  }

  const cambiarFiltro = (f: Partial<Filtro>) => {
    setFiltro((x) => ({ ...x, ...f }));
    setVisibles(PAGINA);
    setMarcados(new Set());
  };

  const seleccion = filtradas.filter((f) => marcados.has(f.id));

  async function aceptarLote(archivos: ArchivoBiblioteca[]) {
    setAviso(null);
    if (!ciclo) return setAviso({ tipo: "risk", texto: "Sin ciclo de THE no hay a qué respuesta ligar los archivos. Importe primero el Excel de THE." });
    if (!unidad) return setAviso({ tipo: "risk", texto: "Elija la oficina a nombre de la que se reportan." });
    const conPropuesta = archivos.filter((a) => a.propuestas[0] && opciones.some((o) => o.id === a.propuestas[0].indicador));
    const r = await aceptar.mutateAsync(conPropuesta.map((a) => ({ archivo: a, ciclo: ciclo.id, indicador: a.propuestas[0].indicador, unidad })));
    setMarcados(new Set());
    const omitidos = archivos.length - conPropuesta.length;
    setAviso({
      tipo: r.errores.length ? "warn" : "ok",
      texto: `${fmtNumero(r.aceptados, 0)} aceptados como evidencia privada${omitidos ? `; ${omitidos} sin una propuesta del catálogo del ciclo` : ""}.${r.errores.length ? ` Con error: ${r.errores.slice(0, 3).join(" · ")}` : ""} Para el punto de «pública», pegue el enlace público en cada uno.`,
    });
  }

  async function descartarLote(archivos: ArchivoBiblioteca[]) {
    setAviso(null);
    await actualizar.mutateAsync({ ids: archivos.map((a) => a.id), cambios: { estado: "descartada" } });
    setMarcados(new Set());
    setAviso({ tipo: "ok", texto: `${fmtNumero(archivos.length, 0)} descartados. Siguen guardados; puede devolverlos a propuestas.` });
  }

  const ocupado = aceptar.isPending || actualizar.isPending;

  return (
    <div className="rk-rep-stack rk-bib">
      <CargaZip ciclo={ciclo?.id ?? null} />

      <section className="rk-rep-card" aria-labelledby="rk-bib-h">
        <div className="rk-rep-split">
          <div>
            <h3 id="rk-bib-h" className="rk-rep-h3">
              Biblioteca
            </h3>
            <p className="rk-rep-small rk-rep-muted">
              {fmtNumero(filas.length, 0)} archivos. Pilo propone hasta tres indicadores por archivo y dice por qué; usted acepta, corrige o descarta.
            </p>
          </div>
        </div>

        <div className="rk-rep-filtros" role="group" aria-label="Filtros de la biblioteca">
          <div className="rk-rep-chips" role="group" aria-label="Estado">
            {ESTADOS.map((e) => (
              <button key={e} type="button" className="rk-rep-fchip" aria-pressed={filtro.estado === e} onClick={() => cambiarFiltro({ estado: e })}>
                {ETIQUETA_BIBLIOTECA[e]} <span className="rk-rep-num rk-bib-cuenta">{fmtNumero(conteo[e], 0)}</span>
              </button>
            ))}
            <button type="button" className="rk-rep-fchip" aria-pressed={filtro.estado === "todos"} onClick={() => cambiarFiltro({ estado: "todos" })}>
              Todos <span className="rk-rep-num rk-bib-cuenta">{fmtNumero(filas.length, 0)}</span>
            </button>
          </div>
          <label className="rk-rep-field-inline">
            <span>ODS</span>
            <select className="rk-rep-select" value={filtro.ods ?? ""} onChange={(e) => cambiarFiltro({ ods: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Todos</option>
              {odsPresentes.map((n) => (
                <option key={n} value={n}>
                  ODS {n} · {odsNombre(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="rk-rep-field-inline">
            <span>Carpeta</span>
            <select className="rk-rep-select" value={filtro.carpeta} onChange={(e) => cambiarFiltro({ carpeta: e.target.value })}>
              <option value="">Todas</option>
              {carpetas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="rk-rep-field-inline rk-bib-buscar">
            <span className="rk-rep-sr">Buscar en la biblioteca</span>
            <input className="rk-rep-input" type="search" placeholder="Buscar por nombre, carpeta o indicador" value={filtro.texto} onChange={(e) => cambiarFiltro({ texto: e.target.value })} />
          </label>
        </div>

        <div className="rk-bib-lote" role="group" aria-label="Acciones en lote">
          <label className="rk-rep-field-inline">
            <span>Reportar como</span>
            <select className="rk-rep-select" value={unidad} onChange={(e) => setUnidadLote(e.target.value)}>
              {!planeacion && <option value="">Elija la oficina…</option>}
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          {seleccion.length > 0 ? (
            <>
              <button type="button" className="rk-rep-btn is-sm is-primary" disabled={ocupado} onClick={() => void aceptarLote(seleccion)}>
                Aceptar la propuesta de {fmtNumero(seleccion.length, 0)}
              </button>
              <button type="button" className="rk-rep-btn is-sm" disabled={ocupado} onClick={() => void descartarLote(seleccion)}>
                Descartar {fmtNumero(seleccion.length, 0)}
              </button>
              <button type="button" className="rk-rep-btn is-sm is-ghost" onClick={() => setMarcados(new Set())}>
                Quitar selección
              </button>
            </>
          ) : (
            <button type="button" className="rk-rep-btn is-sm" disabled={enLote.length === 0} onClick={() => setMarcados(new Set(enLote.map((a) => a.id)))}>
              {enLote.length === 1 ? "Seleccionar la propuesta" : `Seleccionar las ${fmtNumero(enLote.length, 0)} propuestas`} de puntaje alto (≥ {UMBRAL_ALTO})
            </button>
          )}
          {ocupado && <span className="rk-rep-spin" aria-hidden="true" />}
        </div>

        {aviso && (
          <p className={`rk-rep-aviso-linea is-${aviso.tipo}`} role={aviso.tipo === "risk" ? "alert" : "status"}>
            {aviso.texto}
          </p>
        )}

        {lista.isPending && <Cargando texto="Leyendo la biblioteca…" />}
        {lista.error && !(lista.error instanceof FaltaMigracion) && (
          <p className="rk-rep-aviso-linea is-risk" role="alert">
            No se pudo leer la biblioteca: {lista.error.message}
          </p>
        )}
        {lista.data && filas.length === 0 && <Vacio>La biblioteca está vacía. Suba arriba un ZIP con las carpetas de evidencias.</Vacio>}
        {lista.data && filas.length > 0 && filtradas.length === 0 && <Vacio>Ningún archivo con esos filtros.</Vacio>}

        {filtradas.length > 0 && (
          <ul className="rk-bib-lista" ref={cuerpo} aria-label="Archivos de la biblioteca">
            {filtradas.slice(0, visibles).map((a) => (
              <Fila
                key={a.id}
                archivo={a}
                titulo={tituloDe(a.indicador_aceptado ?? a.propuestas[0]?.indicador ?? "", indicadores)}
                marcado={marcados.has(a.id)}
                onMarcar={(v) =>
                  setMarcados((m) => {
                    const n = new Set(m);
                    if (v) n.add(a.id);
                    else n.delete(a.id);
                    return n;
                  })
                }
                abierto={abierto === a.id}
                onAbrir={() => setAbierto(abierto === a.id ? null : a.id)}
              >
                {abierto === a.id && (
                  <Detalle archivo={a} ciclo={ciclo} indicadores={indicadores} opciones={opciones} unidades={unidades} unidadInicial={unidad} onCerrar={() => setAbierto(null)} />
                )}
              </Fila>
            ))}
          </ul>
        )}
        {filtradas.length > visibles && (
          <button type="button" className="rk-rep-btn" onClick={() => setVisibles((v) => v + PAGINA)}>
            Mostrar {fmtNumero(Math.min(PAGINA, filtradas.length - visibles), 0)} más de {fmtNumero(filtradas.length - visibles, 0)}
          </button>
        )}
      </section>
    </div>
  );
}

const CLASE_ESTADO: Record<EstadoBiblioteca, string> = { sin_clasificar: "", propuesta: "is-blue", aceptada: "is-ok", descartada: "is-risk" };
const ETIQUETA_UNO: Record<EstadoBiblioteca, string> = { sin_clasificar: "Sin clasificar", propuesta: "Propuesta", aceptada: "Aceptada", descartada: "Descartada" };

function Puntaje({ n }: { n: number }) {
  const clase = n >= UMBRAL_ALTO ? "is-alto" : n >= UMBRAL_PROPUESTA ? "is-medio" : "is-bajo";
  return (
    <span className={`rk-bib-puntaje rk-rep-num ${clase}`} title="Puntaje de afinidad de Pilo, de 0 a 100">
      {n}
    </span>
  );
}

function Fila({
  archivo: a,
  titulo,
  marcado,
  onMarcar,
  abierto,
  onAbrir,
  children,
}: {
  archivo: ArchivoBiblioteca;
  titulo: string;
  marcado: boolean;
  onMarcar: (v: boolean) => void;
  abierto: boolean;
  onAbrir: () => void;
  children: ReactNode;
}) {
  const p = a.propuestas[0];
  const ambiguo = a.propuestas[1] && p && p.puntaje - a.propuestas[1].puntaje < 6 && a.propuestas[1].puntaje >= UMBRAL_PROPUESTA;
  const id = a.indicador_aceptado ?? p?.indicador ?? null;
  return (
    <li className={`rk-bib-fila ${abierto ? "is-abierta" : ""}`}>
      <div className="rk-bib-fila-l">
        <input type="checkbox" className="rk-bib-check" checked={marcado} onChange={(e) => onMarcar(e.target.checked)} aria-label={`Seleccionar ${a.nombre}`} disabled={a.estado === "aceptada"} />
        <div className="rk-bib-archivo">
          <span className="rk-bib-ext" aria-hidden="true">
            {a.ext || "?"}
          </span>
          <div className="rk-bib-nombre">
            <b className="rk-rep-corta" title={a.ruta_zip}>
              {a.nombre}
            </b>
            <small className="rk-rep-corta rk-rep-muted">
              {a.carpeta || "Raíz del ZIP"} · {mb(a.tamano)}
              {a.anio_detectado ? ` · ${a.anio_detectado}` : ""}
            </small>
          </div>
        </div>
        <div className="rk-bib-prop">
          {id ? (
            <>
              <span className="rk-rep-code">{id}</span>
              {a.estado !== "aceptada" && p && <Puntaje n={p.puntaje} />}
              <span className="rk-rep-corta rk-bib-prop-t">{titulo}</span>
              {ambiguo && a.estado === "propuesta" && <span className="rk-rep-pill is-warn">Ambiguo</span>}
            </>
          ) : (
            <span className="rk-rep-muted rk-rep-small">Sin coincidencia</span>
          )}
        </div>
        <div className="rk-bib-ods">
          {(a.indicador_aceptado ? [Number(a.indicador_aceptado.split(".")[0])] : a.ods_propuestos).slice(0, 3).map((n) => (
            <OdsChip key={n} ods={n} />
          ))}
        </div>
        <span className={`rk-rep-pill ${CLASE_ESTADO[a.estado]}`}>{ETIQUETA_UNO[a.estado]}</span>
        <button type="button" className="rk-rep-btn is-sm" aria-expanded={abierto} onClick={onAbrir}>
          {abierto ? "Cerrar" : "Revisar"}
        </button>
      </div>
      {children}
    </li>
  );
}

export function Detalle({
  archivo: a,
  ciclo,
  indicadores,
  opciones,
  unidades,
  unidadInicial,
  onCerrar,
}: {
  archivo: ArchivoBiblioteca;
  ciclo: RankingCycleRow | null;
  indicadores: Indicador[];
  opciones: Indicador[];
  unidades: UnidadRef[];
  unidadInicial: string;
  onCerrar: () => void;
}) {
  const [indicador, setIndicador] = useState<string>(a.indicador_aceptado ?? a.propuestas.find((p) => opciones.some((o) => o.id === p.indicador))?.indicador ?? "");
  const [unidad, setUnidad] = useState(unidadInicial);
  const [enlace, setEnlace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [verUrl, setVerUrl] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const url = useUrlFirmada(verUrl ? a.storage_path : null, BUCKET_BIBLIOTECA);
  const aceptar = useAceptarArchivos();
  const actualizar = useActualizarArchivos();
  const quitar = useBorrarArchivos();
  const ref = useRef<HTMLDivElement>(null);
  useEntrada(ref, ".rk-rep-panel-item", a.id);
  const ocupado = aceptar.isPending || actualizar.isPending || quitar.isPending;
  const enCatalogo = opciones.some((o) => o.id === indicador);

  async function confirmar() {
    setError(null);
    setListo(null);
    if (!ciclo) return setError("Sin ciclo de THE no hay a qué respuesta ligar el archivo. Importe primero el Excel de THE.");
    if (!indicador || !enCatalogo) return setError("Elija un indicador del catálogo del ciclo.");
    if (!unidad) return setError("Elija la oficina a nombre de la que se reporta.");
    if (enlace.trim() && !esEnlacePublico(enlace)) return setError("El enlace público debe empezar por https:// y no ser un enlace firmado o privado.");
    const r = await aceptar.mutateAsync([{ archivo: a, ciclo: ciclo.id, indicador, unidad, enlacePublico: enlace.trim() || undefined }]);
    if (r.errores.length) return setError(r.errores[0]);
    const nombreU = unidades.find((u) => u.id === unidad)?.name ?? "la oficina";
    setListo(`Ligado a ${indicador} como evidencia de ${nombreU}${enlace.trim() ? ", con su enlace público" : ". Es privado: pegue el enlace público cuando lo tenga"}.`);
  }

  async function estado(e: EstadoBiblioteca) {
    setError(null);
    try {
      await actualizar.mutateAsync({ ids: [a.id], cambios: { estado: e } });
      if (e === "descartada") onCerrar();
    } catch (x) {
      setError(x instanceof Error ? x.message : "No se pudo cambiar el estado.");
    }
  }

  async function eliminar() {
    setError(null);
    try {
      await quitar.mutateAsync({ archivos: [a] });
      onCerrar();
    } catch (x) {
      setError(x instanceof Error ? x.message : "No se pudo quitar el archivo.");
    }
  }

  return (
    <div className="rk-rep-panel rk-bib-detalle" ref={ref}>
      <div className="rk-bib-detalle-grid">
        <div className="rk-rep-stack">
          <div className="rk-rep-panel-item">
            <p className="rk-rep-small rk-rep-wrap">
              <b>Ruta en el ZIP:</b> {a.ruta_zip}
              {a.zip_nombre ? <span className="rk-rep-muted"> · de «{a.zip_nombre}»</span> : null}
            </p>
            {a.nota_texto && <p className="rk-rep-small rk-rep-muted">{a.nota_texto}</p>}
            {a.estado_texto === "sin_texto" && <p className="rk-rep-aviso-linea is-warn">Sin texto: revise el archivo a mano (no hay lectura de imágenes ni OCR).</p>}
          </div>

          <div className="rk-rep-panel-item">
            <p className="rk-rep-lbl">Lo que propone Pilo</p>
            {a.propuestas.length === 0 ? (
              <p className="rk-rep-small rk-rep-muted">Sin coincidencias: ninguna señal del nombre, la carpeta o el texto apunta a un indicador. Elíjalo abajo.</p>
            ) : (
              <ol className="rk-bib-propuestas">
                {a.propuestas.map((p) => {
                  const valida = opciones.some((o) => o.id === p.indicador);
                  return (
                    <li key={p.indicador}>
                      <label className={`rk-bib-propuesta ${indicador === p.indicador ? "is-elegida" : ""}`}>
                        <input type="radio" name={`ind-${a.id}`} checked={indicador === p.indicador} disabled={!valida} onChange={() => setIndicador(p.indicador)} />
                        <span className="rk-bib-propuesta-c">
                          <span className="rk-rep-row">
                            <span className="rk-rep-code">{p.indicador}</span>
                            <Puntaje n={p.puntaje} />
                            <span className="rk-rep-small">{tituloDe(p.indicador, indicadores)}</span>
                          </span>
                          <span className="rk-rep-small rk-rep-muted">{p.razones.join(" · ") || "sin razones"}</span>
                          {!valida && <span className="rk-rep-small rk-rep-muted">No está en el catálogo del ciclo.</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="rk-rep-small rk-rep-muted">Pilo leyó sin IA: palabras, carpeta, año y tipo de documento. La segunda lectura con IA («refinar con Pilo») está preparada y apagada.</p>
          </div>
        </div>

        <div className="rk-rep-stack">
          <div className="rk-rep-row rk-rep-panel-item">
            <button type="button" className="rk-rep-btn is-sm" onClick={() => setVerUrl(true)} disabled={url.isFetching}>
              {url.isFetching ? "Abriendo…" : "Ver o descargar"}
            </button>
            {url.data && (
              <>
                <a className="rk-rep-link rk-rep-small" href={url.data} target="_blank" rel="noopener noreferrer">
                  Abrir en otra pestaña
                </a>
                <a className="rk-rep-link rk-rep-small" href={url.data} download={a.nombre}>
                  Descargar
                </a>
              </>
            )}
            {url.error && <span className="rk-rep-small rk-rep-muted">{url.error.message}</span>}
          </div>

          <label className="rk-rep-field rk-rep-panel-item">
            <span className="rk-rep-lbl">Indicador</span>
            <select className="rk-rep-select" value={indicador} onChange={(e) => setIndicador(e.target.value)}>
              <option value="">Elija un indicador…</option>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} · {o.texto_es || o.texto_en}
                </option>
              ))}
            </select>
          </label>
          <label className="rk-rep-field rk-rep-panel-item">
            <span className="rk-rep-lbl">A nombre de</span>
            <select className="rk-rep-select" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              <option value="">Elija la oficina…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rk-rep-field rk-rep-panel-item">
            <span className="rk-rep-lbl">Enlace público (opcional)</span>
            <input className="rk-rep-input" type="url" placeholder="https://… donde se publica este documento" value={enlace} onChange={(e) => setEnlace(e.target.value)} />
            <span className="rk-rep-small rk-rep-muted">{AVISO_PRIVADA}</span>
          </label>

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

          <div className="rk-rep-row rk-rep-panel-item">
            <button type="button" className="rk-rep-btn is-primary" onClick={() => void confirmar()} disabled={ocupado || !indicador}>
              {aceptar.isPending ? "Ligando…" : a.estado === "aceptada" ? "Ligar también a este indicador" : "Aceptar como evidencia"}
            </button>
            {a.estado === "descartada" ? (
              <button type="button" className="rk-rep-btn" onClick={() => void estado(a.propuestas.length ? "propuesta" : "sin_clasificar")} disabled={ocupado}>
                Devolver a propuestas
              </button>
            ) : a.estado !== "aceptada" ? (
              <button type="button" className="rk-rep-btn" onClick={() => void estado("descartada")} disabled={ocupado}>
                Descartar
              </button>
            ) : null}
            {a.estado === "aceptada" ? null : borrar ? (
              <button type="button" className="rk-rep-btn is-danger" onClick={() => void eliminar()} disabled={ocupado}>
                Confirmar: quitarlo de la biblioteca
              </button>
            ) : (
              <button type="button" className="rk-rep-btn is-ghost" onClick={() => setBorrar(true)} disabled={ocupado}>
                Quitar de la biblioteca
              </button>
            )}
          </div>
          {a.estado === "aceptada" && a.indicador_aceptado && (
            <p className="rk-rep-small rk-rep-muted rk-rep-panel-item">
              Ya es evidencia de {a.indicador_aceptado}. Se ve y se quita desde la ficha del indicador en el formulario de la oficina.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
