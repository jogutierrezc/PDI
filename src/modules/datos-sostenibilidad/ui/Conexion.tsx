/* =============================================================================
   Datos de Sostenibilidad · lo que se suma a los editores de UDrive.

   - PanelConexion: en el editor de tablas, «Conectar a un indicador» (qué
     columna da el valor, el periodo y el campus) con el valor actual, que
     parpadea en verde cuando una celda lo cambia.
   - PanelPublicar: en el constructor de gráficas, «Publicar en el portal».
   - DondeSeUsa y QuienLaVe: en el panel de detalles del explorador.

   La base decide (RLS y disparadores); aquí solo se avisa antes de que rechace
   y se ofrece lo que la persona puede hacer.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos, useDuenos } from "../../udrive/datos";
import { rangoDe } from "../../udrive/lib/permisos";
import type { ArchivoRow, ColumnaUd, TablaDatos } from "../../udrive/tipos";
import {
  avisosDeVinculo,
  calcularIndicador,
  SECCIONES_SOS,
  useGuardarVinculo,
  useIndicadoresSos,
  usePublicacionesGraficas,
  usePublicarGrafica,
  useQuitarVinculo,
  useVinculos,
} from "../sos";
import type { IndicadorSos, SeccionSos } from "../tipos";
import { parpadear } from "./movimiento";
import { AvisoSos, ErrorSos, FichaOds, Interruptor, textoCifra } from "./piezas";
import { useAccesoSos, useArchivosSos, useTablaDeGraficas } from "./usos";

const BASE = "/admin/datos-sostenibilidad";
const esNumerica = (c: ColumnaUd) => c.tipo === "numero" || c.tipo === "porcentaje";

/** Propone las columnas con solo ver los nombres: la numérica, la del año o periodo y la del campus. */
export function proponer(tabla: TablaDatos): { valor: string; periodo: string; campus: string } {
  const texto = (c: ColumnaUd) => `${c.clave} ${c.etiqueta}`.toLowerCase();
  const valor = tabla.columnas.find((c) => esNumerica(c) && !/(a[nñ]o|periodo|semestre)/.test(texto(c))) ?? tabla.columnas.find(esNumerica);
  const periodo = tabla.columnas.find((c) => c !== valor && /(a[nñ]o|periodo|semestre|corte|fecha)/.test(texto(c)));
  const campus = tabla.columnas.find((c) => c !== valor && c !== periodo && /(campus|sede)/.test(texto(c)));
  return { valor: valor?.clave ?? "", periodo: periodo?.clave ?? "", campus: campus?.clave ?? "" };
}

/** El valor de un indicador conectado; parpadea en verde cuando cambia (no la primera vez). */
function ValorVivo({ texto }: { texto: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const antes = useRef(texto);
  useEffect(() => {
    if (antes.current !== texto) parpadear(ref.current);
    antes.current = texto;
  }, [texto]);
  return (
    <span ref={ref} className="dsx-valor">
      {texto}
    </span>
  );
}

/* ---------- Tabla: conectar a un indicador ------------------------------------------------------ */

export function PanelConexion({ id, tabla, editable }: { id: string; tabla: TablaDatos; editable: boolean }) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const archivos = useArchivos();
  const duenos = useDuenos([id]);
  const guardar = useGuardarVinculo();
  const quitar = useQuitarVinculo();
  const { administra } = useAccesoSos();
  const [indicador, setIndicador] = useState("");
  const [valor, setValor] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [campus, setCampus] = useState("");
  const [mensaje, setMensaje] = useState<{ t: "ok" | "error"; texto: string } | null>(null);

  const puede = editable && rangoDe(duenos.data?.get(id)?.mi_rol) >= 3;
  const lista = inds.data ?? [];
  const delArchivo = (vins.data ?? []).filter((v) => v.archivo_id === id);
  const elegido = lista.find((i) => i.id === indicador);
  const actual = (vins.data ?? []).find((v) => v.indicador_id === indicador);

  // Al elegir indicador se completan las columnas: las que ya tenía en esta tabla o una propuesta.
  const elegir = (nuevo: string) => {
    setIndicador(nuevo);
    setMensaje(null);
    const v = (vins.data ?? []).find((x) => x.indicador_id === nuevo && x.archivo_id === id);
    const p = proponer(tabla);
    setValor(v?.col_valor ?? p.valor);
    setPeriodo(v?.col_periodo ?? p.periodo);
    setCampus(v ? (v.col_campus ?? "") : p.campus);
  };

  const candidato = { col_valor: valor, col_periodo: periodo, col_campus: campus || null, filtro_col: actual?.archivo_id === id ? actual.filtro_col : null };
  const avisos = useMemo(() => (indicador && valor && periodo ? avisosDeVinculo(candidato, tabla) : []), [indicador, valor, periodo, campus, tabla]); // eslint-disable-line react-hooks/exhaustive-deps -- candidato se arma de estos mismos valores
  const bloqueado = Boolean(elegido?.publicado) && !administra;
  const nombreDe = (archivoId: string) => (archivos.data ?? []).find((a) => a.id === archivoId)?.nombre ?? "otra tabla";

  const conectar = () => {
    if (!elegido) return;
    setMensaje(null);
    guardar.mutate(
      {
        indicador_id: elegido.id,
        archivo_id: id,
        col_valor: valor,
        col_periodo: periodo,
        col_campus: campus || null,
        filtro_col: actual?.archivo_id === id ? actual.filtro_col : null,
        filtro_valor: actual?.archivo_id === id ? actual.filtro_valor : null,
      },
      { onSuccess: () => setMensaje({ t: "ok", texto: `«${elegido.nombre}» ahora sale de esta tabla.` }), onError: (e) => setMensaje({ t: "error", texto: e.message }) },
    );
  };

  return (
    <section className="dsx-panel" aria-label="Conectar a un indicador">
      <div>
        <h3>Conectar a un indicador</h3>
        <p className="dsx-sub">Elija qué columna da el valor. La gráfica y el portal se actualizan solos.</p>
      </div>

      {inds.error ? <ErrorSos error={inds.error} /> : null}

      {delArchivo.map((v) => {
        const ind = lista.find((i) => i.id === v.indicador_id);
        if (!ind) return null;
        const calc = calcularIndicador(ind, v, tabla);
        return (
          <div key={v.id} className="dsx-tarjeta">
            <div className="dsx-camino" aria-label="Tabla, indicador, portal">
              <span>Tabla</span>
              <Icon name="arrow-right" size={13} />
              <span>ODS {ind.ods}</span>
              <Icon name="arrow-right" size={13} />
              <span>{ind.publicado ? "Portal" : "Sin publicar"}</span>
            </div>
            <b>{ind.nombre}</b>
            <span className="dsx-mono">valor «{v.col_valor}» · periodo «{v.col_periodo}»{v.col_campus ? ` · campus «${v.col_campus}»` : ""}</span>
            <p className="dsx-actual">
              Valor actual <ValorVivo texto={textoCifra(calc.actual?.valor, ind.decimales)} />{" "}
              <span className="dsx-tenue">
                {ind.unidad}
                {calc.actual ? ` · ${calc.actual.anio}` : ""}
              </span>
            </p>
            {calc.avisos.map((a) => (
              <AvisoSos key={a}>{a}</AvisoSos>
            ))}
            {puede && !(ind.publicado && !administra) ? (
              <button type="button" className="es-btn es-btn--sm es-btn--ghost" disabled={quitar.isPending} onClick={() => quitar.mutate(ind.id, { onError: (e) => setMensaje({ t: "error", texto: e.message }) })}>
                Quitar la conexión
              </button>
            ) : null}
          </div>
        );
      })}
      {!delArchivo.length && vins.isSuccess ? <p className="dsx-tenue">Esta tabla aún no alimenta ningún indicador.</p> : null}

      {puede ? (
        <>
          <label className="es-fl">
            Conectar columna a
            <select className="es-inp" value={indicador} onChange={(e) => elegir(e.target.value)} disabled={inds.isPending}>
              <option value="">Elegir indicador</option>
              {lista.map((i: IndicadorSos) => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.nombre}
                </option>
              ))}
            </select>
          </label>
          {elegido ? (
            <>
              <label className="es-fl">
                Columna del valor
                <select className="es-inp" value={valor} onChange={(e) => setValor(e.target.value)}>
                  <option value="">Elegir columna</option>
                  {tabla.columnas.filter(esNumerica).map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="es-fl">
                Columna del periodo
                <select className="es-inp" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                  <option value="">Elegir columna</option>
                  {tabla.columnas.filter((c) => c.clave !== valor).map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="es-fl">
                Columna del campus (si el dato es por campus)
                <select className="es-inp" value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="">Ninguna: cifra institucional</option>
                  {tabla.columnas.filter((c) => c.clave !== valor && c.clave !== periodo).map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              {actual && actual.archivo_id !== id ? <AvisoSos>Hoy sale de «{nombreDe(actual.archivo_id)}»; conectarlo aquí lo cambia.</AvisoSos> : null}
              {bloqueado ? <AvisoSos>Este indicador ya está en el portal: cambiar su tabla lo decide quien administra la unidad.</AvisoSos> : null}
              {avisos.map((a) => (
                <AvisoSos key={a}>{a}</AvisoSos>
              ))}
              <button type="button" className="es-btn es-btn--pri" disabled={!valor || !periodo || avisos.length > 0 || bloqueado || guardar.isPending} onClick={conectar}>
                <Icon name="link" size={16} />
                {guardar.isPending ? "Conectando…" : "Conectar"}
              </button>
            </>
          ) : null}
          {mensaje ? <AvisoSos tipo={mensaje.t}>{mensaje.texto}</AvisoSos> : null}
        </>
      ) : (
        <p className="dsx-tenue">Conectar una tabla a un indicador pide el papel Puede crear sobre ella.</p>
      )}
    </section>
  );
}

/* ---------- Gráfica: publicar en el portal ---------------------------------------------------- */

export function PanelPublicar({ id, editable }: { id: string; editable: boolean }) {
  const pubs = usePublicacionesGraficas();
  const duenos = useDuenos([id]);
  const publicar = usePublicarGrafica();
  const [error, setError] = useState<string | null>(null);
  const fila = pubs.data?.find((p) => p.archivo_id === id);
  const puede = editable && rangoDe(duenos.data?.get(id)?.mi_rol) >= 3;
  const seccion: SeccionSos = fila?.seccion ?? "panorama";

  const poner = (cambio: { publicado?: boolean; seccion?: SeccionSos }) => {
    setError(null);
    publicar.mutate({ archivo_id: id, publicado: cambio.publicado ?? fila?.publicado ?? false, seccion: cambio.seccion ?? seccion, orden: fila?.orden }, { onError: (e) => setError(e.message) });
  };

  return (
    <section className="dsx-panel" aria-label="Publicar en el portal">
      <div>
        <h3>Publicar en el portal</h3>
        <p className="dsx-sub">Solo datos agregados por campus y año, sin datos personales.</p>
      </div>
      {pubs.error ? <ErrorSos error={pubs.error} /> : null}
      <Interruptor marcado={Boolean(fila?.publicado)} disabled={!puede || pubs.isPending || publicar.isPending} onChange={(v) => poner({ publicado: v })} titulo={puede ? undefined : "Publicar pide el papel Puede crear sobre la gráfica"}>
        Mostrar en /sostenible
      </Interruptor>
      <label className="es-fl">
        Sección de la página
        <select className="es-inp" value={seccion} disabled={!puede || pubs.isPending} onChange={(e) => poner({ seccion: e.target.value as SeccionSos })}>
          {SECCIONES_SOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.etiqueta}
            </option>
          ))}
        </select>
        <span className="dsx-tenue">Las mismas secciones del Observatorio.</span>
      </label>
      {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}
      {!puede ? <p className="dsx-tenue">Publicar pide el papel Puede crear sobre la gráfica.</p> : null}
      <p className="dsx-tenue">
        <Icon name="eye" size={13} /> En la intranet la ve toda persona con acceso a Datos de Sostenibilidad. Las gráficas de dispersión y de burbujas no se publican.
      </p>
    </section>
  );
}

/* ---------- Explorador: dónde se usa y quién la ve ------------------------------------------------ */

export function DondeSeUsa({ archivo, raiz }: { archivo: ArchivoRow; raiz: string }) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const pubs = usePublicacionesGraficas();
  const { tablas, graficas } = useArchivosSos(raiz);
  const origen = useTablaDeGraficas(graficas);
  const duenos = useDuenos([archivo.id]);
  const rol = duenos.data?.get(archivo.id)?.mi_rol;
  const publicadas = new Set((pubs.data ?? []).filter((p) => p.publicado).map((p) => p.archivo_id));

  let usos: { clave: string; icono: "spark-chart" | "chart" | "table"; texto: string }[] = [];
  if (archivo.tipo === "tabla") {
    usos = [
      ...(vins.data ?? []).filter((v) => v.archivo_id === archivo.id).map((v) => ({ clave: `i${v.id}`, icono: "spark-chart" as const, texto: `Indicador «${inds.data?.find((i) => i.id === v.indicador_id)?.nombre ?? v.indicador_id}»` })),
      ...graficas.filter((g) => origen.get(g.id)?.tabla === archivo.id).map((g) => ({ clave: `g${g.id}`, icono: "chart" as const, texto: `Gráfica «${g.nombre}»${publicadas.has(g.id) ? " · en el portal" : ""}` })),
    ];
  } else if (archivo.tipo === "grafica") {
    const t = origen.get(archivo.id)?.tabla;
    usos = [
      ...(t ? [{ clave: "t", icono: "table" as const, texto: `Sobre la tabla «${tablas.find((x) => x.id === t)?.nombre ?? "que no veo"}»` }] : []),
      { clave: "p", icono: "chart" as const, texto: publicadas.has(archivo.id) ? "Publicada en el portal" : "Sin publicar en el portal" },
    ];
  } else return null;

  return (
    <div className="dsx-uso">
      <p className="dsx-sec">Dónde se usa</p>
      {inds.error ? <ErrorSos error={inds.error} /> : null}
      <ul className="dsx-lista">
        {usos.map((u) => (
          <li key={u.clave}>
            <Icon name={u.icono} size={15} />
            {u.texto}
          </li>
        ))}
        {!usos.length ? <li className="dsx-tenue">Todavía en ningún lugar</li> : null}
      </ul>
      <p className="dsx-sec">Quién la ve</p>
      <p className="dsx-tenue">
        Todas las personas con acceso a Datos de Sostenibilidad. Edita quien tenga papel en la unidad{rol ? ` (el suyo: ${rol === "lector" ? "solo ver" : rol === "editor" ? "editar" : "crear o administrar"})` : ""}.
        {archivo.tipo === "grafica" && publicadas.has(archivo.id) ? " El público ve sus datos agregados." : ""}
      </p>
      <Link className="dsx-enlace" to={`${BASE}/portal`}>
        Ver qué se publica
      </Link>
    </div>
  );
}
