/* =============================================================================
   Datos de Sostenibilidad · Indicadores.

   El catálogo LIBRE: indicadores con código propio, ODS opcional y etiquetas,
   agrupados por ODS (los que no tienen, al final). De qué tabla y columna sale
   cada uno, su último dato, el avance hacia la meta y el interruptor «En el
   portal». Todas las personas con acceso lo ven; crear, editar, archivar y
   publicar es de la administración y de quien Administra la unidad (la base lo
   hace cumplir). Se archiva en vez de borrar para no romper vínculos ni
   tableros. Un indicador sin tabla se marca como ilustrativo: el portal no
   inventa cifras.
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos } from "../../udrive/datos";
import { INDICATORS } from "../../sostenible/data";
import { calcularIndicador, useArchivarIndicador, useGuardarIndicador, useGuardarVinculo, useIndicadoresSos, usePublicarIndicador, useVinculos } from "../sos";
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

/** Temas que se sugieren al etiquetar; se suman a los que ya usa el catálogo. */
const ETIQUETAS_SUGERIDAS = ["Campus", "Energía", "Agua", "Residuos", "Biodiversidad", "Movilidad", "Comunidad", "Clima", "Gobernanza"];
const TOPE_ETIQUETAS = 12;
const CODIGO_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Estado = "activos" | "conectado" | "sin-datos" | "publicado" | "archivado" | "todos";
const ESTADOS: { id: Estado; etiqueta: string }[] = [
  { id: "activos", etiqueta: "Activos" },
  { id: "conectado", etiqueta: "Conectados a una tabla" },
  { id: "sin-datos", etiqueta: "Sin datos conectados" },
  { id: "publicado", etiqueta: "Publicados" },
  { id: "archivado", etiqueta: "Archivados" },
  { id: "todos", etiqueta: "Todos" },
];

type Borrador = Omit<IndicadorSos, "publicado" | "archivado" | "meta" | "position" | "ods"> & { meta: string; origen: string; ods: string };

const BORRADOR_NUEVO: Borrador = { id: "", ods: "", nombre: "", descripcion: "", unidad: "", mejor: "sube", resumen: "promedio", meta: "", decimales: 0, tarjeta: null, nota: "", etiquetas: [], origen: "" };

/* ---------- La pantalla ---------------------------------------------------------------------------- */

export function Indicadores({ acceso }: { acceso: ReturnType<typeof useAccesoSos> }) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const archivos = useArchivos();
  const publicar = usePublicarIndicador();
  const archivar = useArchivarIndicador();
  const raiz = useRef<HTMLDivElement>(null);
  const [formulario, setFormulario] = useState<{ abierto: boolean; editando: string | null }>({ abierto: false, editando: null });
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<{ q: string; ods: string; etiqueta: string; estado: Estado }>({ q: "", ods: "", etiqueta: "", estado: "activos" });

  const idsTablas = useMemo(() => [...new Set((vins.data ?? []).map((v) => v.archivo_id))], [vins.data]);
  const { tablas } = useTablasDe(idsTablas);
  const vinculoDe = (id: string): VinculoSos | undefined => vins.data?.find((v) => v.indicador_id === id);
  const nombreArchivo = (id: string) => archivos.data?.find((a) => a.id === id)?.nombre ?? "una tabla";

  // La lista entra al abrir la sección y los medidores crecen; no se repite al editar ni al filtrar.
  const listo = inds.isSuccess && vins.isSuccess;
  useEffect(() => {
    if (!listo) return;
    entrar(raiz.current, ".dsx-ind");
    crecerMedidores(raiz.current, 0.15);
  }, [listo]);

  const todas = inds.data ?? [];
  const etiquetasUsadas = useMemo(() => [...new Set(todas.flatMap((i) => i.etiquetas))].sort((a, b) => a.localeCompare(b, "es")), [todas]);

  const visibles = useMemo(() => {
    const q = sinTildes(filtro.q);
    return todas.filter((i) => {
      if (filtro.estado === "archivado" ? !i.archivado : i.archivado && filtro.estado !== "todos") return false;
      const conectado = vins.data?.some((v) => v.indicador_id === i.id) ?? false;
      if (filtro.estado === "conectado" && !conectado) return false;
      if (filtro.estado === "sin-datos" && conectado) return false;
      if (filtro.estado === "publicado" && !i.publicado) return false;
      if (filtro.ods === "sin" ? i.ods !== null : filtro.ods && String(i.ods) !== filtro.ods) return false;
      if (filtro.etiqueta && !i.etiquetas.includes(filtro.etiqueta)) return false;
      return !q || sinTildes(`${i.id} ${i.nombre} ${i.descripcion} ${i.etiquetas.join(" ")}`).includes(q);
    });
  }, [todas, vins.data, filtro]);

  const grupos = useMemo(() => {
    const m = new Map<number | null, IndicadorSos[]>();
    for (const i of visibles) m.set(i.ods, [...(m.get(i.ods) ?? []), i]);
    // Por ODS, y los que no tienen, al final.
    return [...m.entries()].sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99));
  }, [visibles]);

  const editado = formulario.editando ? todas.find((i) => i.id === formulario.editando) : undefined;
  const hayFiltro = Boolean(filtro.q || filtro.ods || filtro.etiqueta || filtro.estado !== "activos");

  return (
    <div ref={raiz} className="dsx-pagina">
      <div className="dsx-cab">
        <div>
          <h2>Catálogo de indicadores</h2>
          <p className="dsx-sub">Cada indicador sale de una columna de una tabla. Cree los propios, con el código y las etiquetas que quiera; el ODS es opcional.</p>
        </div>
        {acceso.administra ? (
          <button type="button" className="es-btn es-btn--pri" aria-expanded={formulario.abierto} onClick={() => setFormulario(formulario.abierto ? { abierto: false, editando: null } : { abierto: true, editando: null })}>
            <Icon name="plus" size={16} />
            Nuevo indicador
          </button>
        ) : null}
      </div>
      {!acceso.administra ? <AvisoSos>Ve el catálogo en solo lectura: crear, editar, archivar y publicar indicadores es de la administración y de quien Administra la unidad.</AvisoSos> : null}

      {formulario.abierto && acceso.administra ? (
        <FormularioIndicador key={formulario.editando ?? "nuevo"} editado={editado} existentes={todas} etiquetas={etiquetasUsadas} raiz={acceso.unidad?.carpeta_raiz} onCerrar={() => setFormulario({ abierto: false, editando: null })} />
      ) : null}

      {todas.length ? (
        <div className="dsx-filtros" role="search" aria-label="Filtrar el catálogo">
          <label className="dsx-filtros__q">
            <span className="dsx-sr">Buscar indicadores</span>
            <input className="es-inp" type="search" value={filtro.q} placeholder="Buscar por nombre, código o etiqueta" onChange={(e) => setFiltro((f) => ({ ...f, q: e.target.value }))} />
          </label>
          <label>
            <span className="dsx-sr">ODS</span>
            <select className="es-inp" value={filtro.ods} onChange={(e) => setFiltro((f) => ({ ...f, ods: e.target.value }))}>
              <option value="">Todos los ODS</option>
              <option value="sin">Sin ODS</option>
              {Array.from({ length: 17 }, (_, k) => k + 1).map((n) => (
                <option key={n} value={n}>
                  ODS {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="dsx-sr">Etiqueta</span>
            <select className="es-inp" value={filtro.etiqueta} onChange={(e) => setFiltro((f) => ({ ...f, etiqueta: e.target.value }))}>
              <option value="">Todas las etiquetas</option>
              {etiquetasUsadas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="dsx-sr">Estado</span>
            <select className="es-inp" value={filtro.estado} onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value as Estado }))}>
              {ESTADOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {hayFiltro ? (
            <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setFiltro({ q: "", ods: "", etiqueta: "", estado: "activos" })}>
              Quitar filtros
            </button>
          ) : null}
          <span className="dsx-tenue" role="status">
            {visibles.length} de {todas.length}
          </span>
        </div>
      ) : null}

      {inds.error ? <ErrorSos error={inds.error} /> : null}
      {vins.error && !inds.error ? <ErrorSos error={vins.error} /> : null}
      {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}
      {inds.isPending ? <p className="admin-loading">Cargando el catálogo…</p> : null}
      {inds.isSuccess && !todas.length ? (
        <div className="es-empty">
          <b>El catálogo está vacío</b>
          <span>{acceso.administra ? "Cree el primer indicador con «Nuevo indicador»." : "La administración aún no ha creado indicadores."}</span>
        </div>
      ) : null}
      {inds.isSuccess && todas.length > 0 && !visibles.length ? (
        <div className="es-empty">
          <b>Ningún indicador coincide</b>
          <span>Pruebe con otra búsqueda o quite los filtros.</span>
        </div>
      ) : null}

      {grupos.map(([ods, lista]) => (
        <section key={ods ?? "sin"} className="dsx-grupo" aria-label={ods === null ? "Sin ODS" : `ODS ${ods}`}>
          <h3 className="dsx-grupo__t">
            <FichaOds n={ods} /> {ods === null ? "Sin ODS" : `Objetivo ${ods}`}
          </h3>
          {lista.map((i) => {
            const v = vinculoDe(i.id);
            const tabla = v ? tablas.get(v.archivo_id) : undefined;
            const calc = v && tabla ? calcularIndicador(i, v, tabla) : null;
            return (
              <div key={i.id} className="dsx-ind" data-archivado={i.archivado ? "" : undefined}>
                <FichaOds n={i.ods} />
                <div className="dsx-ind__nombre">
                  <b>
                    <span className="dsx-mono">{i.id}</span> · {i.nombre}
                  </b>
                  <small>
                    {i.unidad} · mejor si {i.mejor === "sube" ? "sube" : "baja"} · se resume como {resumenTexto(i.resumen)}
                  </small>
                  {i.descripcion ? <small>{i.descripcion}</small> : null}
                  {i.tarjeta ? <small>Alimenta la tarjeta «{INDICATORS[i.tarjeta]?.name ?? i.tarjeta}» del portal</small> : null}
                  {i.etiquetas.length || i.archivado ? (
                    <span className="dsx-etqs">
                      {i.archivado ? (
                        <span className="dsx-chip" data-t="aviso">
                          Archivado
                        </span>
                      ) : null}
                      {i.etiquetas.map((t) => (
                        <button key={t} type="button" className="dsx-chip dsx-chip--etq" aria-label={`Filtrar por la etiqueta ${t}`} onClick={() => setFiltro((f) => ({ ...f, etiqueta: t }))}>
                          {t}
                        </button>
                      ))}
                    </span>
                  ) : null}
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
                        disabled={publicar.isPending || i.archivado || (!v && !i.publicado)}
                        titulo={i.archivado ? "Restáurelo para publicarlo" : !v && !i.publicado ? "Para publicarlo, conecte primero una tabla" : undefined}
                        onChange={(p) => {
                          setError(null);
                          publicar.mutate({ id: i.id, publicado: p }, { onError: (e) => setError(e.message) });
                        }}
                      >
                        En el portal
                      </Interruptor>
                      <span className="dsx-ind__botones">
                        <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setFormulario({ abierto: true, editando: i.id })}>
                          <Icon name="pen" size={14} />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="es-btn es-btn--sm es-btn--ghost"
                          disabled={archivar.isPending}
                          title={i.archivado ? "Vuelve al catálogo activo" : "Sale del catálogo activo y del portal; se conservan sus vínculos y tableros"}
                          onClick={() => {
                            setError(null);
                            archivar.mutate({ id: i.id, archivado: !i.archivado }, { onError: (e) => setError(e.message) });
                          }}
                        >
                          {i.archivado ? "Restaurar" : "Archivar"}
                        </button>
                      </span>
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

/* ---------- Etiquetas libres, con sugerencias ----------------------------------------------------- */

function CampoEtiquetas({ valor, sugeridas, onCambio }: { valor: string[]; sugeridas: string[]; onCambio: (v: string[]) => void }) {
  const [texto, setTexto] = useState("");
  const lista = useId();
  const agregar = (crudo: string) => {
    const t = crudo.replace(/\s+/g, " ").trim().slice(0, 30);
    if (!t || valor.length >= TOPE_ETIQUETAS || valor.some((x) => sinTildes(x) === sinTildes(t))) return setTexto("");
    // Si coincide con una conocida (sin importar mayúsculas), se usa su escritura.
    onCambio([...valor, sugeridas.find((s) => sinTildes(s) === sinTildes(t)) ?? t]);
    setTexto("");
  };
  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      agregar(texto);
    } else if (e.key === "Backspace" && !texto && valor.length) onCambio(valor.slice(0, -1));
  };
  return (
    <div className="es-fl dsx-form__ancha">
      <label htmlFor={`${lista}-i`}>Etiquetas (opcional)</label>
      <div className="dsx-etiquetas">
        {valor.map((t) => (
          <span key={t} className="dsx-chip dsx-chip--etq">
            {t}
            <button type="button" aria-label={`Quitar la etiqueta ${t}`} onClick={() => onCambio(valor.filter((x) => x !== t))}>
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
        <input
          id={`${lista}-i`}
          className="es-inp"
          list={lista}
          value={texto}
          maxLength={30}
          disabled={valor.length >= TOPE_ETIQUETAS}
          placeholder={valor.length >= TOPE_ETIQUETAS ? "Llegó al máximo de etiquetas" : "Escriba y pulse Enter"}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
          onBlur={() => agregar(texto)}
        />
        <datalist id={lista}>
          {sugeridas
            .filter((s) => !valor.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
      <span className="dsx-tenue">Temas libres como «Campus» o «Energía» para agrupar y filtrar. Hasta {TOPE_ETIQUETAS}.</span>
    </div>
  );
}

/* ---------- Crear y editar ---------------------------------------------------------------------------- */

function FormularioIndicador({ editado, existentes, etiquetas, raiz, onCerrar }: { editado: IndicadorSos | undefined; existentes: IndicadorSos[]; etiquetas: string[]; raiz: string | undefined; onCerrar: () => void }) {
  const guardar = useGuardarIndicador();
  const vincular = useGuardarVinculo();
  const tablasUnidad = useArchivosSos(raiz).tablas;
  const [b, setB] = useState<Borrador>(editado ? { ...editado, ods: editado.ods === null ? "" : String(editado.ods), meta: editado.meta === null ? "" : String(editado.meta), origen: "" } : BORRADOR_NUEVO);
  const [mensaje, setMensaje] = useState<{ t: "error" | "aviso"; texto: string } | null>(null);
  const caja = useRef<HTMLFormElement>(null);
  const tablaElegida = useTablasDe(b.origen ? [b.origen] : []).tablas.get(b.origen) ?? null;
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const sugeridas = useMemo(() => [...new Set([...ETIQUETAS_SUGERIDAS, ...etiquetas])], [etiquetas]);

  useEffect(() => {
    if (caja.current) cambiar(caja.current);
    caja.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const tarjetaUsada = (t: TarjetaPortal) => existentes.some((i) => i.tarjeta === t && i.id !== editado?.id);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const id = b.id.trim();
    if (!id || !b.nombre.trim() || !b.unidad.trim()) return setMensaje({ t: "error", texto: "Escriba el código, el nombre y la unidad del indicador." });
    if (!CODIGO_OK.test(id)) return setMensaje({ t: "error", texto: "El código lleva letras, números, punto, guion o guion bajo, sin espacios (por ejemplo CAMP-01 o 7.2)." });
    if (!editado && existentes.some((i) => i.id.toLowerCase() === id.toLowerCase())) return setMensaje({ t: "error", texto: `Ya existe un indicador con el código ${id}.` });
    const meta = b.meta.trim() === "" ? null : Number(b.meta.replace(",", "."));
    if (meta !== null && !Number.isFinite(meta)) return setMensaje({ t: "error", texto: "La meta debe ser un número." });
    const ods = b.ods === "" ? null : Number(b.ods);
    setMensaje(null);
    try {
      const mismos = existentes.filter((i) => i.ods === ods);
      await guardar.mutateAsync({
        id,
        ods,
        nombre: b.nombre,
        descripcion: b.descripcion,
        unidad: b.unidad,
        position: editado && editado.ods === ods ? editado.position : mismos.reduce((m, i) => Math.max(m, i.position), 0) + 1,
        mejor: b.mejor,
        resumen: b.resumen,
        meta,
        decimales: b.decimales,
        tarjeta: b.tarjeta,
        nota: b.nota,
        etiquetas: b.etiquetas,
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
          <input className="es-inp" value={b.id} disabled={Boolean(editado)} maxLength={40} placeholder="Por ejemplo, CAMP-01" onChange={(e) => poner("id", e.target.value)} />
        </label>
        <label className="es-fl">
          Nombre
          <input className="es-inp" value={b.nombre} maxLength={120} placeholder="Por ejemplo, árboles sembrados" onChange={(e) => poner("nombre", e.target.value)} />
        </label>
        <label className="es-fl">
          Objetivo de Desarrollo Sostenible (opcional)
          <select className="es-inp" value={b.ods} onChange={(e) => poner("ods", e.target.value)}>
            <option value="">Sin ODS</option>
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
          <span className="dsx-tenue">No hace falta una tabla para crearlo: se conecta después. Si elige una, se proponen las columnas.</span>
        </label>
        <label className="es-fl dsx-form__ancha">
          Descripción (opcional)
          <input className="es-inp" value={b.descripcion} maxLength={300} placeholder="Qué mide y cómo se calcula" onChange={(e) => poner("descripcion", e.target.value)} />
        </label>
        <CampoEtiquetas valor={b.etiquetas} sugeridas={sugeridas} onCambio={(v) => poner("etiquetas", v)} />
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
