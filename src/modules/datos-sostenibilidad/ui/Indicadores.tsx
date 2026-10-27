/* =============================================================================
   Datos de Sostenibilidad · Indicadores.

   El catálogo agrupado por ODS: de qué tabla y columna sale cada indicador, su
   último dato, el avance hacia la meta y el interruptor «En el portal». Todas
   las personas con acceso lo ven; crear, editar y publicar es de la
   administración y de quien Administra la unidad (la base lo hace cumplir).
   Un indicador sin tabla se marca como ilustrativo: el portal no inventa cifras.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos } from "../../udrive/datos";
import { INDICATORS } from "../../sostenible/data";
import { calcularIndicador, useGuardarIndicador, useGuardarVinculo, useIndicadoresSos, usePublicarIndicador, useVinculos } from "../sos";
import type { IndicadorSos, MejorSos, ResumenSos, TarjetaPortal, VinculoSos } from "../tipos";
import { proponer } from "./Conexion";
import { cambiar, crecerMedidores, entrar } from "./movimiento";
import { AvisoSos, ErrorSos, FichaOds, Interruptor, Medidor, textoCifra } from "./piezas";
import { useAccesoSos, useArchivosSos, useTablasDe } from "./usos";

const TARJETAS = Object.keys(INDICATORS) as TarjetaPortal[];
const RESUMENES: { id: ResumenSos; etiqueta: string }[] = [
  { id: "promedio", etiqueta: "Promedio de los campus" },
  { id: "suma", etiqueta: "Suma de los campus" },
  { id: "ultimo", etiqueta: "Último valor" },
];
const resumenTexto = (r: ResumenSos) => RESUMENES.find((x) => x.id === r)?.etiqueta.toLowerCase() ?? r;

type Borrador = Omit<IndicadorSos, "publicado" | "meta" | "descripcion" | "position"> & { meta: string; origen: string };

const BORRADOR_NUEVO: Borrador = { id: "", ods: 13, nombre: "", unidad: "", mejor: "sube", resumen: "promedio", meta: "", decimales: 0, tarjeta: null, nota: "", origen: "" };

/* ---------- La pantalla ---------------------------------------------------------------------------- */

export function Indicadores({ acceso }: { acceso: ReturnType<typeof useAccesoSos> }) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const archivos = useArchivos();
  const publicar = usePublicarIndicador();
  const raiz = useRef<HTMLDivElement>(null);
  const [formulario, setFormulario] = useState<{ abierto: boolean; editando: string | null }>({ abierto: false, editando: null });
  const [error, setError] = useState<string | null>(null);

  const idsTablas = useMemo(() => [...new Set((vins.data ?? []).map((v) => v.archivo_id))], [vins.data]);
  const { tablas } = useTablasDe(idsTablas);
  const vinculoDe = (id: string): VinculoSos | undefined => vins.data?.find((v) => v.indicador_id === id);
  const nombreArchivo = (id: string) => archivos.data?.find((a) => a.id === id)?.nombre ?? "una tabla";

  // La lista entra al abrir la sección y los medidores crecen; no se repite al editar.
  const listo = inds.isSuccess && vins.isSuccess;
  useEffect(() => {
    if (!listo) return;
    entrar(raiz.current, ".dsx-ind");
    crecerMedidores(raiz.current, 0.15);
  }, [listo]);

  const grupos = useMemo(() => {
    const m = new Map<number, IndicadorSos[]>();
    for (const i of inds.data ?? []) m.set(i.ods, [...(m.get(i.ods) ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [inds.data]);

  const editado = formulario.editando ? inds.data?.find((i) => i.id === formulario.editando) : undefined;

  return (
    <div ref={raiz} className="dsx-pagina">
      <div className="dsx-cab">
        <div>
          <h2>Catálogo de indicadores</h2>
          <p className="dsx-sub">Cada indicador sale de una columna de una tabla. Conecte los del marco THE o cree los propios, de cualquier ODS.</p>
        </div>
        {acceso.administra ? (
          <button type="button" className="es-btn es-btn--pri" aria-expanded={formulario.abierto} onClick={() => setFormulario(formulario.abierto ? { abierto: false, editando: null } : { abierto: true, editando: null })}>
            <Icon name="plus" size={16} />
            Nuevo indicador
          </button>
        ) : null}
      </div>
      {!acceso.administra ? <AvisoSos>Ve el catálogo en solo lectura: crear, editar y publicar indicadores es de la administración y de quien Administra la unidad.</AvisoSos> : null}

      {formulario.abierto && acceso.administra ? (
        <FormularioIndicador key={formulario.editando ?? "nuevo"} editado={editado} existentes={inds.data ?? []} raiz={acceso.unidad?.carpeta_raiz} onCerrar={() => setFormulario({ abierto: false, editando: null })} />
      ) : null}

      {inds.error ? <ErrorSos error={inds.error} /> : null}
      {vins.error && !inds.error ? <ErrorSos error={vins.error} /> : null}
      {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}
      {inds.isPending ? <p className="admin-loading">Cargando el catálogo…</p> : null}
      {inds.isSuccess && !inds.data.length ? (
        <div className="es-empty">
          <b>El catálogo está vacío</b>
          <span>{acceso.administra ? "Cree el primer indicador con «Nuevo indicador»." : "La administración aún no ha creado indicadores."}</span>
        </div>
      ) : null}

      {grupos.map(([ods, lista]) => (
        <section key={ods} className="dsx-grupo" aria-label={`ODS ${ods}`}>
          <h3 className="dsx-grupo__t">
            <FichaOds n={ods} /> Objetivo {ods}
          </h3>
          {lista.map((i) => {
            const v = vinculoDe(i.id);
            const tabla = v ? tablas.get(v.archivo_id) : undefined;
            const calc = v && tabla ? calcularIndicador(i, v, tabla) : null;
            return (
              <div key={i.id} className="dsx-ind">
                <FichaOds n={i.ods} />
                <div className="dsx-ind__nombre">
                  <b>
                    <span className="dsx-mono">{i.id}</span> · {i.nombre}
                  </b>
                  <small>
                    {i.unidad} · mejor si {i.mejor === "sube" ? "sube" : "baja"} · se resume como {resumenTexto(i.resumen)}
                  </small>
                  {i.tarjeta ? <small>Alimenta la tarjeta «{INDICATORS[i.tarjeta]?.name ?? i.tarjeta}» del portal</small> : null}
                </div>
                <div className="dsx-ind__dato">
                  {v ? (
                    <>
                      <small>
                        Sale de <b>{nombreArchivo(v.archivo_id)}</b>, columna <span className="dsx-mono">{v.col_valor}</span>
                      </small>
                      {calc?.actual ? (
                        <>
                          {i.meta !== null && calc.avanceMeta !== null ? <Medidor fraccion={calc.avanceMeta} /> : null}
                          <small className="dsx-num">
                            {textoCifra(calc.actual.valor, i.decimales)}
                            {i.meta !== null ? ` de ${textoCifra(i.meta, i.decimales)}` : ""} ({calc.actual.anio})
                          </small>
                        </>
                      ) : (
                        <small className="dsx-tenue">{tabla === undefined ? "Leyendo la tabla…" : "La tabla aún no tiene cifras para este indicador."}</small>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="dsx-chip" data-t="aviso">
                        <Icon name="alert" size={13} />
                        Sin datos conectados
                      </span>
                      <small>Se muestra como ilustrativo</small>
                    </>
                  )}
                </div>
                <div className="dsx-ind__acciones">
                  {acceso.administra ? (
                    <>
                      <Interruptor
                        marcado={i.publicado}
                        disabled={publicar.isPending || (!v && !i.publicado)}
                        titulo={!v && !i.publicado ? "Para publicarlo, conecte primero una tabla" : undefined}
                        onChange={(p) => {
                          setError(null);
                          publicar.mutate({ id: i.id, publicado: p }, { onError: (e) => setError(e.message) });
                        }}
                      >
                        En el portal
                      </Interruptor>
                      <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setFormulario({ abierto: true, editando: i.id })}>
                        <Icon name="pen" size={14} />
                        Editar
                      </button>
                    </>
                  ) : (
                    <span className="dsx-chip" data-t={i.publicado ? "ok" : undefined}>
                      {i.publicado ? "En el portal" : "Sin publicar"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/* ---------- Crear y editar ---------------------------------------------------------------------------- */

function FormularioIndicador({ editado, existentes, raiz, onCerrar }: { editado: IndicadorSos | undefined; existentes: IndicadorSos[]; raiz: string | undefined; onCerrar: () => void }) {
  const guardar = useGuardarIndicador();
  const vincular = useGuardarVinculo();
  const tablasUnidad = useArchivosSos(raiz).tablas;
  const [b, setB] = useState<Borrador>(editado ? { ...editado, meta: editado.meta === null ? "" : String(editado.meta), origen: "" } : BORRADOR_NUEVO);
  const [mensaje, setMensaje] = useState<{ t: "error" | "aviso"; texto: string } | null>(null);
  const caja = useRef<HTMLFormElement>(null);
  const tablaElegida = useTablasDe(b.origen ? [b.origen] : []).tablas.get(b.origen) ?? null;
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (caja.current) cambiar(caja.current);
    caja.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const tarjetaUsada = (t: TarjetaPortal) => existentes.some((i) => i.tarjeta === t && i.id !== editado?.id);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const id = b.id.trim();
    if (!id || !b.nombre.trim() || !b.unidad.trim()) return setMensaje({ t: "error", texto: "Escriba el código, el nombre y la unidad del indicador." });
    if (!editado && existentes.some((i) => i.id === id)) return setMensaje({ t: "error", texto: `Ya existe un indicador con el código ${id}.` });
    const meta = b.meta.trim() === "" ? null : Number(b.meta.replace(",", "."));
    if (meta !== null && !Number.isFinite(meta)) return setMensaje({ t: "error", texto: "La meta debe ser un número." });
    setMensaje(null);
    try {
      const mismos = existentes.filter((i) => i.ods === b.ods);
      await guardar.mutateAsync({
        id,
        ods: b.ods,
        nombre: b.nombre,
        descripcion: editado?.descripcion ?? "",
        unidad: b.unidad,
        position: editado && editado.ods === b.ods ? editado.position : mismos.reduce((m, i) => Math.max(m, i.position), 0) + 1,
        mejor: b.mejor,
        resumen: b.resumen,
        meta,
        decimales: b.decimales,
        tarjeta: b.tarjeta,
        nota: b.nota,
      });
    } catch (err) {
      return setMensaje({ t: "error", texto: err instanceof Error ? err.message : "No se pudo guardar el indicador." });
    }
    // La tabla de origen es opcional: con ella se proponen las columnas; si no encajan, se termina en el editor de la tabla.
    if (b.origen && tablaElegida) {
      const p = proponer(tablaElegida);
      if (p.valor && p.periodo) {
        try {
          await vincular.mutateAsync({ indicador_id: id, archivo_id: b.origen, col_valor: p.valor, col_periodo: p.periodo, col_campus: p.campus || null, filtro_col: null, filtro_valor: null });
        } catch (err) {
          setMensaje({ t: "aviso", texto: `El indicador quedó guardado, pero no se pudo conectar: ${err instanceof Error ? err.message : "error"} Termine la conexión desde la tabla.` });
          return;
        }
      } else {
        setMensaje({ t: "aviso", texto: "El indicador quedó guardado. No encontré columnas de valor y periodo en esa tabla: conéctelo desde su editor." });
        return;
      }
    }
    onCerrar();
  };

  return (
    <form ref={caja} className="dsx-form" onSubmit={(e) => void enviar(e)} aria-label={editado ? `Editar ${editado.nombre}` : "Nuevo indicador"}>
      <h3>{editado ? `Editar «${editado.nombre}»` : "Nuevo indicador"}</h3>
      <div className="dsx-form__rejilla">
        <label className="es-fl">
          Código
          <input className="es-inp" value={b.id} disabled={Boolean(editado)} maxLength={20} placeholder="Por ejemplo, 7.2" onChange={(e) => poner("id", e.target.value)} />
        </label>
        <label className="es-fl">
          Nombre
          <input className="es-inp" value={b.nombre} maxLength={120} placeholder="Por ejemplo, árboles sembrados" onChange={(e) => poner("nombre", e.target.value)} />
        </label>
        <label className="es-fl">
          Objetivo de Desarrollo Sostenible
          <select className="es-inp" value={b.ods} onChange={(e) => poner("ods", Number(e.target.value))}>
            {Array.from({ length: 17 }, (_, k) => k + 1).map((n) => (
              <option key={n} value={n}>
                ODS {n}
              </option>
            ))}
          </select>
        </label>
        <label className="es-fl">
          Unidad
          <input className="es-inp" value={b.unidad} maxLength={60} placeholder="Por ejemplo, % del consumo" onChange={(e) => poner("unidad", e.target.value)} />
        </label>
        <label className="es-fl">
          Mejor si…
          <select className="es-inp" value={b.mejor} onChange={(e) => poner("mejor", e.target.value as MejorSos)}>
            <option value="sube">El valor sube</option>
            <option value="baja">El valor baja</option>
          </select>
        </label>
        <label className="es-fl">
          Cómo se resume
          <select className="es-inp" value={b.resumen} onChange={(e) => poner("resumen", e.target.value as ResumenSos)}>
            {RESUMENES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="es-fl">
          Meta (opcional)
          <input className="es-inp" inputMode="decimal" value={b.meta} placeholder="Sin meta" onChange={(e) => poner("meta", e.target.value)} />
        </label>
        <label className="es-fl">
          Decimales
          <select className="es-inp" value={b.decimales} onChange={(e) => poner("decimales", Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="es-fl">
          Tarjeta del portal que alimenta (opcional)
          <select className="es-inp" value={b.tarjeta ?? ""} onChange={(e) => poner("tarjeta", (e.target.value || null) as TarjetaPortal | null)}>
            <option value="">Ninguna: el portal le abre una tarjeta propia</option>
            {TARJETAS.map((t) => (
              <option key={t} value={t} disabled={tarjetaUsada(t)}>
                {INDICATORS[t].name}
                {tarjetaUsada(t) ? " (ya la alimenta otro)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="es-fl">
          Tabla de origen (opcional)
          <select className="es-inp" value={b.origen} onChange={(e) => poner("origen", e.target.value)}>
            <option value="">Conectar después</option>
            {tablasUnidad.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <span className="dsx-tenue">Se proponen las columnas; puede ajustarlas en el editor de la tabla.</span>
        </label>
        <label className="es-fl dsx-form__ancha">
          Nota para el portal (opcional)
          <input className="es-inp" value={b.nota} maxLength={400} onChange={(e) => poner("nota", e.target.value)} />
        </label>
      </div>
      {mensaje ? <AvisoSos tipo={mensaje.t === "error" ? "error" : "aviso"}>{mensaje.texto}</AvisoSos> : null}
      <div className="dsx-form__pie">
        <button type="submit" className="es-btn es-btn--pri" disabled={guardar.isPending || vincular.isPending}>
          {guardar.isPending || vincular.isPending ? "Guardando…" : editado ? "Guardar cambios" : "Crear indicador"}
        </button>
        <button type="button" className="es-btn" onClick={onCerrar}>
          {mensaje?.t === "aviso" ? "Cerrar" : "Cancelar"}
        </button>
      </div>
    </form>
  );
}
