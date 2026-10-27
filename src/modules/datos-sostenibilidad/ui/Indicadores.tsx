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

   Crear y editar viven en una ventana emergente (Modal): arriba lo mínimo
   —nombre y unidad— y lo avanzado plegado en «Más opciones». El código se
   genera solo desde el nombre.
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos } from "../../udrive/datos";
import { INDICATORS } from "../../sostenible/data";
import { odsByNumber } from "../../sostenible/ods-data";
import { calcularIndicador, useArchivarIndicador, useGuardarIndicador, useGuardarVinculo, useIndicadoresSos, usePublicarIndicador, useVinculos } from "../sos";
import type { IndicadorSos, MejorSos, ResumenSos, TarjetaPortal, VinculoSos } from "../tipos";
import { proponer } from "./Conexion";
import { Modal } from "./Modal";
import { crecerMedidores, entrar, parpadear } from "./movimiento";
import { AvisoSos, Campo, Cargando, ErrorSos, FichaOds, Grupo, Interruptor, Medidor, Segmentado, Vacio, textoCifra } from "./piezas";
import { useAccesoSos, useArchivosSos, useTablasDe } from "./usos";

const TARJETAS = Object.keys(INDICATORS) as TarjetaPortal[];
const RESUMENES: { id: ResumenSos; etiqueta: string; ayuda: string }[] = [
  { id: "promedio", etiqueta: "Promedio de los campus", ayuda: "Con los campus de un año saca el promedio. Sirve para porcentajes y tasas." },
  { id: "suma", etiqueta: "Suma de los campus", ayuda: "Suma los campus de un año. Sirve para totales, como árboles sembrados." },
  { id: "ultimo", etiqueta: "Último valor", ayuda: "Toma el dato más reciente sin combinar campus." },
];
const resumenTexto = (r: ResumenSos) => RESUMENES.find((x) => x.id === r)?.etiqueta.toLowerCase() ?? r;

/** Unidades que se sugieren al escribir la unidad. */
const UNIDADES = ["%", "kWh", "m³", "t CO₂", "personas"];
/** Temas que se sugieren al etiquetar; se suman a los que ya usa el catálogo. */
const ETIQUETAS_SUGERIDAS = ["Campus", "Energía", "Agua", "Residuos", "Biodiversidad", "Movilidad", "Comunidad", "Clima", "Gobernanza"];
const TOPE_ETIQUETAS = 12;
const CODIGO_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El código sale del nombre: «Árboles sembrados» → ARBOLES-SEMBRADOS; si ya existe, se le suma -2, -3… */
function codigoDe(nombre: string, existentes: IndicadorSos[]): string {
  const base = sinTildes(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 28)
    .replace(/-+$/, "");
  if (!base) return "";
  const usados = new Set(existentes.map((i) => i.id.toLowerCase()));
  let c = base;
  for (let n = 2; usados.has(c.toLowerCase()); n++) c = `${base}-${n}`;
  return c;
}

type Estado = "activos" | "conectado" | "sin-datos" | "publicado" | "archivado" | "todos";
const ESTADOS: { id: Estado; etiqueta: string }[] = [
  { id: "activos", etiqueta: "Activos" },
  { id: "conectado", etiqueta: "Conectados a una tabla" },
  { id: "sin-datos", etiqueta: "Sin datos conectados" },
  { id: "publicado", etiqueta: "Publicados" },
  { id: "archivado", etiqueta: "Archivados" },
  { id: "todos", etiqueta: "Todos" },
];
const FILTRO_INICIAL = { q: "", ods: "", etiqueta: "", estado: "activos" as Estado };

type Borrador = Omit<IndicadorSos, "publicado" | "archivado" | "meta" | "position" | "ods"> & { meta: string; origen: string; ods: string };

/* Valores por defecto sensatos: mejor si sube, se resume como promedio. */
const BORRADOR_NUEVO: Borrador = { id: "", ods: "", nombre: "", descripcion: "", unidad: "", mejor: "sube", resumen: "promedio", meta: "", decimales: 0, tarjeta: null, nota: "", etiquetas: [], origen: "" };

type Aviso = { tipo: "ok" | "aviso"; texto: string; accion?: { texto: string; onClick: () => void } };

/* ---------- La pantalla ---------------------------------------------------------------------------- */

export function Indicadores({ acceso }: { acceso: ReturnType<typeof useAccesoSos> }) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const archivos = useArchivos();
  const publicar = usePublicarIndicador();
  const archivar = useArchivarIndicador();
  const raiz = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<{ editando: string | null; foco?: "origen" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [resaltar, setResaltar] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<{ q: string; ods: string; etiqueta: string; estado: Estado }>(FILTRO_INICIAL);

  const idsTablas = useMemo(() => [...new Set((vins.data ?? []).map((v) => v.archivo_id))], [vins.data]);
  const { tablas } = useTablasDe(idsTablas);
  const vinculoDe = (id: string): VinculoSos | undefined => vins.data?.find((v) => v.indicador_id === id);
  const nombreArchivo = (id: string) => archivos.data?.find((a) => a.id === id)?.nombre ?? "una tabla";

  // La lista entra al abrir la sección y los medidores crecen; no se repite al editar ni al filtrar.
  const listo = inds.isSuccess && vins.isSuccess;
  useEffect(() => {
    if (!listo) return;
    const a = entrar(raiz.current, ".dsx-ind");
    const b = crecerMedidores(raiz.current, 0.15);
    return () => {
      a();
      b();
    };
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

  // El indicador recién creado parpadea suave cuando la ventana ya se cerró y la fila existe.
  useEffect(() => {
    if (!resaltar || modal) return;
    const capa = raiz.current?.querySelector(`[data-flash="${CSS.escape(resaltar)}"]`);
    if (!capa) return;
    capa.closest(".dsx-ind")?.scrollIntoView({ block: "nearest" });
    const fin = parpadear(capa);
    const t = window.setTimeout(() => setResaltar(null), 1400);
    return () => {
      fin();
      window.clearTimeout(t);
    };
  }, [resaltar, modal, visibles]);

  const editado = modal?.editando ? todas.find((i) => i.id === modal.editando) : undefined;
  const hayFiltro = Boolean(filtro.q || filtro.ods || filtro.etiqueta || filtro.estado !== "activos");

  const alGuardar = (r: { id: string; nuevo: boolean; conectado: boolean; aviso?: string }) => {
    setError(null);
    if (r.nuevo) {
      setFiltro(FILTRO_INICIAL);
      setResaltar(r.id);
    }
    if (r.aviso) setAviso({ tipo: "aviso", texto: r.aviso });
    else if (r.nuevo && !r.conectado) setAviso({ tipo: "ok", texto: "Indicador creado. Aún no tiene datos: el portal lo mostrará como ilustrativo hasta que lo conecte.", accion: { texto: "Conectar a una tabla", onClick: () => setModal({ editando: r.id, foco: "origen" }) } });
    else setAviso({ tipo: "ok", texto: r.nuevo ? "Indicador creado y conectado a su tabla." : "Cambios guardados." });
  };

  return (
    <div ref={raiz} className="dsx-pagina">
      <div className="dsx-cab">
        <p className="dsx-lead">Cada indicador sale de una columna de una tabla. Cree los propios; el ODS y las etiquetas son opcionales.</p>
        {acceso.administra ? (
          <button type="button" className="dsx-btn dsx-btn--pri" onClick={() => setModal({ editando: null })}>
            <Icon name="plus" size={16} />
            Nuevo indicador
          </button>
        ) : null}
      </div>
      {!acceso.administra ? <AvisoSos>Ve el catálogo en solo lectura: crear, editar, archivar y publicar indicadores es de la administración y de quien Administra la unidad.</AvisoSos> : null}
      {aviso ? (
        <AvisoSos tipo={aviso.tipo} accion={aviso.accion} onCerrar={() => setAviso(null)}>
          {aviso.texto}
        </AvisoSos>
      ) : null}

      {modal && acceso.administra ? (
        <IndicadorModal
          key={modal.editando ?? "nuevo"}
          editado={editado}
          vinculo={editado ? vinculoDe(editado.id) : undefined}
          nombreArchivo={nombreArchivo}
          existentes={todas}
          etiquetas={etiquetasUsadas}
          raiz={acceso.unidad?.carpeta_raiz}
          foco={modal.foco}
          onGuardado={alGuardar}
          onCerrar={() => setModal(null)}
        />
      ) : null}

      {todas.length ? (
        <div className="dsx-filtros" role="search" aria-label="Filtrar el catálogo">
          <label className="dsx-filtros__q">
            <span className="dsx-sr">Buscar indicadores</span>
            <input className="dsx-inp" type="search" value={filtro.q} placeholder="Buscar por nombre, código o etiqueta" onChange={(e) => setFiltro((f) => ({ ...f, q: e.target.value }))} />
          </label>
          <label>
            <span className="dsx-sr">ODS</span>
            <select className="dsx-inp" value={filtro.ods} onChange={(e) => setFiltro((f) => ({ ...f, ods: e.target.value }))}>
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
            <select className="dsx-inp" value={filtro.etiqueta} onChange={(e) => setFiltro((f) => ({ ...f, etiqueta: e.target.value }))}>
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
            <select className="dsx-inp" value={filtro.estado} onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value as Estado }))}>
              {ESTADOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {hayFiltro ? (
            <button type="button" className="dsx-btn dsx-btn--sm dsx-btn--ghost" onClick={() => setFiltro(FILTRO_INICIAL)}>
              Quitar filtros
            </button>
          ) : null}
          <span className="dsx-tenue dsx-num" role="status">
            {visibles.length} de {todas.length}
          </span>
        </div>
      ) : null}

      {inds.error ? <ErrorSos error={inds.error} /> : null}
      {vins.error && !inds.error ? <ErrorSos error={vins.error} /> : null}
      {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}
      {inds.isPending ? <Cargando texto="Cargando el catálogo…" /> : null}
      {inds.isSuccess && !todas.length ? (
        <Vacio
          icono="spark-chart"
          titulo="El catálogo está vacío"
          accion={
            acceso.administra ? (
              <button type="button" className="dsx-btn dsx-btn--pri" onClick={() => setModal({ editando: null })}>
                <Icon name="plus" size={16} />
                Nuevo indicador
              </button>
            ) : undefined
          }
        >
          {acceso.administra ? "Cree el primero: solo necesita un nombre y una unidad." : "La administración aún no ha creado indicadores."}
        </Vacio>
      ) : null}
      {inds.isSuccess && todas.length > 0 && !visibles.length ? (
        <Vacio
          icono="search"
          titulo="Ningún indicador coincide"
          accion={
            hayFiltro ? (
              <button type="button" className="dsx-btn dsx-btn--sm" onClick={() => setFiltro(FILTRO_INICIAL)}>
                Quitar filtros
              </button>
            ) : undefined
          }
        >
          Pruebe con otra búsqueda o quite los filtros.
        </Vacio>
      ) : null}

      {grupos.map(([ods, lista]) => (
        <section key={ods ?? "sin"} className="dsx-grupo" aria-labelledby={`dsx-g-${ods ?? "sin"}`}>
          <h2 className="dsx-grupo__t" id={`dsx-g-${ods ?? "sin"}`}>
            <FichaOds n={ods} oculta />
            {ods === null ? "Sin ODS" : `Objetivo ${ods} · ${odsByNumber(ods)?.name ?? ""}`}
          </h2>
          <ul className="dsx-ind-lista">
            {lista.map((i) => {
              const v = vinculoDe(i.id);
              const tabla = v ? tablas.get(v.archivo_id) : undefined;
              const calc = v && tabla ? calcularIndicador(i, v, tabla) : null;
              return (
                <li key={i.id} className="dsx-ind" data-archivado={i.archivado ? "" : undefined}>
                  <span className="dsx-flash" data-flash={i.id} aria-hidden="true" />
                  <FichaOds n={i.ods} />
                  <div className="dsx-ind__nombre">
                    <b className="dsx-ind__t">{i.nombre}</b>
                    <span className="dsx-ind__sub">
                      <span className="dsx-mono">{i.id}</span> · {i.unidad} · mejor si {i.mejor === "sube" ? "sube" : "baja"} · se resume como {resumenTexto(i.resumen)}
                    </span>
                    {i.descripcion ? <span className="dsx-ind__sub">{i.descripcion}</span> : null}
                    {i.tarjeta ? <span className="dsx-ind__sub">Alimenta la tarjeta «{INDICATORS[i.tarjeta]?.name ?? i.tarjeta}» del portal</span> : null}
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
                        <span className="dsx-ind__sub">
                          Sale de <b>{nombreArchivo(v.archivo_id)}</b>, columna <span className="dsx-mono">{v.col_valor}</span>
                        </span>
                        {calc?.actual ? (
                          <>
                            {i.meta !== null && calc.avanceMeta !== null ? <Medidor fraccion={calc.avanceMeta} /> : null}
                            <span className="dsx-ind__cifra dsx-num">
                              {textoCifra(calc.actual.valor, i.decimales)}
                              {i.meta !== null ? ` de ${textoCifra(i.meta, i.decimales)}` : ""} <span className="dsx-tenue">({calc.actual.anio})</span>
                            </span>
                          </>
                        ) : (
                          <span className="dsx-tenue">{tabla === undefined ? "Leyendo la tabla…" : "La tabla aún no tiene cifras para este indicador."}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="dsx-chip" data-t="aviso">
                          <Icon name="alert" size={13} />
                          Sin datos conectados
                        </span>
                        <span className="dsx-ind__sub">Se muestra como ilustrativo</span>
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
                          <button type="button" className="dsx-btn dsx-btn--sm dsx-btn--ghost" onClick={() => setModal({ editando: i.id })}>
                            <Icon name="pen" size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            className="dsx-btn dsx-btn--sm dsx-btn--ghost"
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- Etiquetas libres, con sugerencias ----------------------------------------------------- */

function CampoEtiquetas({ valor, sugeridas, onCambio }: { valor: string[]; sugeridas: string[]; onCambio: (v: string[]) => void }) {
  const [texto, setTexto] = useState("");
  const lleno = valor.length >= TOPE_ETIQUETAS;
  const agregar = (crudo: string) => {
    const t = crudo.replace(/\s+/g, " ").trim().slice(0, 30);
    if (!t || lleno || valor.some((x) => sinTildes(x) === sinTildes(t))) return setTexto("");
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
  const libres = sugeridas.filter((s) => !valor.includes(s)).slice(0, 7);
  return (
    <Campo etiqueta="Etiquetas" opcional ayuda={`Temas libres para agrupar y filtrar. Hasta ${TOPE_ETIQUETAS}.`} ancho>
      {(p) => (
        <>
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
              {...p}
              className="dsx-inp"
              value={texto}
              maxLength={30}
              disabled={lleno}
              placeholder={lleno ? "Llegó al máximo de etiquetas" : "Escriba y pulse Enter"}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
              onBlur={() => agregar(texto)}
            />
          </div>
          {libres.length && !lleno ? (
            <div className="dsx-sugs" role="group" aria-label="Etiquetas sugeridas">
              {libres.map((s) => (
                <button key={s} type="button" className="dsx-sug" onClick={() => agregar(s)}>
                  <Icon name="plus" size={11} />
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Campo>
  );
}

/* ---------- El ODS: una fila de fichas de color ---------------------------------------------------- */

function SelectorOds({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const ods = valor ? odsByNumber(valor) : undefined;
  return (
    <Grupo etiqueta="Objetivo de Desarrollo Sostenible" opcional ayuda={ods ? `ODS ${ods.n} · ${ods.name}` : "Sin ODS: queda en el grupo «Sin ODS» del catálogo."} ancho>
      <div className="dsx-ods-sel">
        <button type="button" className="dsx-ods-op dsx-ods-op--sin" aria-pressed={valor === ""} onClick={() => onChange("")}>
          Sin ODS
        </button>
        {Array.from({ length: 17 }, (_, k) => k + 1).map((n) => (
          <button key={n} type="button" className="dsx-ods-op" aria-pressed={valor === String(n)} aria-label={`ODS ${n}: ${odsByNumber(n)?.name ?? ""}`} title={odsByNumber(n)?.name} onClick={() => onChange(String(n))}>
            <FichaOds n={n} oculta />
          </button>
        ))}
      </div>
    </Grupo>
  );
}

/* ---------- Crear y editar, en una ventana emergente ---------------------------------------------- */

interface PropsModal {
  editado: IndicadorSos | undefined;
  vinculo: VinculoSos | undefined;
  nombreArchivo: (id: string) => string;
  existentes: IndicadorSos[];
  etiquetas: string[];
  raiz: string | undefined;
  foco?: "origen";
  onGuardado: (r: { id: string; nuevo: boolean; conectado: boolean; aviso?: string }) => void;
  onCerrar: () => void;
}

function IndicadorModal({ editado, vinculo, nombreArchivo, existentes, etiquetas, raiz, foco, onGuardado, onCerrar }: PropsModal) {
  const guardar = useGuardarIndicador();
  const vincular = useGuardarVinculo();
  const tablasUnidad = useArchivosSos(raiz).tablas;
  // Lo que se abrió, fijo: una relectura de la lista mientras se escribe no cuenta como cambio.
  const [inicial] = useState<Borrador>(() => (editado ? { ...editado, ods: editado.ods === null ? "" : String(editado.ods), meta: editado.meta === null ? "" : String(editado.meta), origen: "" } : BORRADOR_NUEVO));
  const [b, setB] = useState<Borrador>(inicial);
  const [codigoManual, setCodigoManual] = useState<string | null>(null);
  // «Más opciones» se abre solo si lo que se edita ya usa algo de ahí (o si se viene a conectar una tabla).
  const usaAvanzado = Boolean(editado && (editado.ods !== null || editado.etiquetas.length || editado.meta !== null || editado.descripcion || editado.tarjeta || editado.nota || editado.mejor !== "sube" || editado.resumen !== "promedio" || editado.decimales !== 0));
  const [mas, setMas] = useState(usaAvanzado || foco === "origen");
  const [tocado, setTocado] = useState({ nombre: false, unidad: false });
  const [intento, setIntento] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const idMas = useId();
  const tablaElegida = useTablasDe(b.origen ? [b.origen] : []).tablas.get(b.origen) ?? null;
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const sugeridas = useMemo(() => [...new Set([...ETIQUETAS_SUGERIDAS, ...etiquetas])], [etiquetas]);

  const generado = useMemo(() => codigoDe(b.nombre, existentes), [b.nombre, existentes]);
  const codigo = editado ? editado.id : (codigoManual ?? generado);
  const sucio = JSON.stringify([b, codigoManual]) !== JSON.stringify([inicial, null]);
  const tarjetaUsada = (t: TarjetaPortal) => existentes.some((i) => i.tarjeta === t && i.id !== editado?.id);

  /* --- Validación en línea: el mensaje queda bajo su campo --- */
  const errNombre = b.nombre.trim() ? null : "Escriba el nombre del indicador.";
  const errUnidad = b.unidad.trim() ? null : "Escriba la unidad, por ejemplo «%» o «kWh».";
  const errCodigo = !codigo
    ? b.nombre.trim()
      ? "No pude armar un código con ese nombre: escríbalo usted, por ejemplo CAMP-01."
      : null
    : !CODIGO_OK.test(codigo)
      ? "Use letras, números, punto, guion o guion bajo, sin espacios (por ejemplo CAMP-01 o 7.2)."
      : !editado && existentes.some((i) => i.id.toLowerCase() === codigo.toLowerCase())
        ? `Ya existe un indicador con el código ${codigo}.`
        : null;
  const metaNum = b.meta.trim() === "" ? null : Number(b.meta.replace(",", "."));
  const errMeta = metaNum !== null && !Number.isFinite(metaNum) ? "La meta debe ser un número, por ejemplo 80 o 12,5." : null;
  // El del nombre y la unidad se muestran al salir del campo o al intentar crear; el código y la meta, apenas fallan.
  const verNombre = tocado.nombre || intento ? errNombre : null;
  const verUnidad = tocado.unidad || intento ? errUnidad : null;
  const verCodigo = codigoManual !== null || intento ? errCodigo : null;

  const enviar = async (): Promise<boolean> => {
    setIntento(true);
    setFalla(null);
    if (errNombre || errUnidad || errCodigo || errMeta) {
      if ((errCodigo || errMeta) && !mas) setMas(true);
      window.setTimeout(() => document.querySelector<HTMLElement>("dialog [aria-invalid='true']")?.focus(), 0);
      return false;
    }
    const ods = b.ods === "" ? null : Number(b.ods);
    const mismos = existentes.filter((i) => i.ods === ods);
    try {
      await guardar.mutateAsync({
        id: codigo,
        ods,
        nombre: b.nombre,
        descripcion: b.descripcion,
        unidad: b.unidad,
        position: editado && editado.ods === ods ? editado.position : mismos.reduce((m, i) => Math.max(m, i.position), 0) + 1,
        mejor: b.mejor,
        resumen: b.resumen,
        meta: metaNum,
        decimales: b.decimales,
        tarjeta: b.tarjeta,
        nota: b.nota,
        etiquetas: b.etiquetas,
      });
    } catch (err) {
      setFalla(err instanceof Error ? err.message : "No se pudo guardar el indicador.");
      return false;
    }
    // La tabla de origen es opcional: con ella se proponen las columnas; si no encajan, se termina en el editor de la tabla.
    let aviso: string | undefined;
    let conectado = Boolean(vinculo);
    if (b.origen && tablaElegida) {
      const p = proponer(tablaElegida);
      if (p.valor && p.periodo) {
        try {
          await vincular.mutateAsync({ indicador_id: codigo, archivo_id: b.origen, col_valor: p.valor, col_periodo: p.periodo, col_campus: p.campus || null, filtro_col: null, filtro_valor: null });
          conectado = true;
        } catch (err) {
          aviso = `El indicador quedó guardado, pero no se pudo conectar: ${err instanceof Error ? err.message : "error"} Termine la conexión desde la tabla.`;
        }
      } else aviso = "El indicador quedó guardado. No encontré columnas de valor y periodo en esa tabla: conéctelo desde su editor.";
    }
    onGuardado({ id: codigo, nuevo: !editado, conectado, aviso });
    return true;
  };

  const resumenActual = RESUMENES.find((r) => r.id === b.resumen);

  return (
    <Modal
      titulo={editado ? "Editar indicador" : "Nuevo indicador"}
      descripcion={editado ? `«${editado.nombre}» · ${editado.id}` : "Solo necesita un nombre y una unidad. Lo demás puede completarlo después."}
      sucio={sucio}
      onCerrar={onCerrar}
      onEnviar={enviar}
      principal={editado ? "Guardar cambios" : "Crear indicador"}
      pendiente={guardar.isPending || vincular.isPending}
      textoPendiente={editado ? "Guardando…" : "Creando…"}
      ancho
    >
      <div className="dsx-form__basico">
        <Campo etiqueta="Nombre" error={verNombre}>
          {(p) => <input {...p} data-foco={foco === "origen" ? undefined : ""} className="dsx-inp" value={b.nombre} maxLength={120} placeholder="Por ejemplo, árboles sembrados" autoComplete="off" onChange={(e) => poner("nombre", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, nombre: true }))} />}
        </Campo>
        <Campo etiqueta="Unidad" error={verUnidad}>
          {(p) => (
            <>
              <input {...p} className="dsx-inp" value={b.unidad} maxLength={60} placeholder="Por ejemplo, % del consumo" autoComplete="off" onChange={(e) => poner("unidad", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, unidad: true }))} />
              <div className="dsx-sugs" role="group" aria-label="Unidades sugeridas">
                {UNIDADES.map((u) => (
                  <button key={u} type="button" className="dsx-sug" aria-pressed={b.unidad === u} onClick={() => poner("unidad", u)}>
                    {u}
                  </button>
                ))}
              </div>
            </>
          )}
        </Campo>
      </div>

      <div className="dsx-mas">
        <button type="button" className="dsx-mas__btn" aria-expanded={mas} aria-controls={idMas} onClick={() => setMas((m) => !m)}>
          <Icon name="chevron-down" size={16} />
          Más opciones
          <span className="dsx-tenue">{mas ? "" : "ODS, etiquetas, meta, tabla de origen…"}</span>
        </button>
        {mas ? (
          <div id={idMas} className="dsx-mas__cuerpo">
            <div className="dsx-form__grupo">
              <SelectorOds valor={b.ods} onChange={(v) => poner("ods", v)} />
              <CampoEtiquetas valor={b.etiquetas} sugeridas={sugeridas} onCambio={(v) => poner("etiquetas", v)} />
            </div>

            <div className="dsx-form__grupo">
              <Grupo etiqueta="Mejor si el valor…" ayuda="Decide si una subida se ve como mejora o como retroceso en el portal.">
                <Segmentado<MejorSos>
                  etiqueta="Mejor si el valor"
                  valor={b.mejor}
                  onChange={(v) => poner("mejor", v)}
                  opciones={[
                    { id: "sube", etiqueta: "Sube" },
                    { id: "baja", etiqueta: "Baja" },
                  ]}
                />
              </Grupo>
              <Grupo etiqueta="Cómo se resume" ayuda={resumenActual?.ayuda} ancho>
                <Segmentado<ResumenSos> etiqueta="Cómo se resume" valor={b.resumen} onChange={(v) => poner("resumen", v)} opciones={RESUMENES.map((r) => ({ id: r.id, etiqueta: r.etiqueta }))} ancho />
              </Grupo>
              <Campo etiqueta="Meta" opcional error={errMeta}>
                {(p) => <input {...p} className="dsx-inp dsx-num" inputMode="decimal" value={b.meta} placeholder="Sin meta" autoComplete="off" onChange={(e) => poner("meta", e.target.value)} />}
              </Campo>
              <Grupo etiqueta="Decimales">
                <Segmentado<"0" | "1" | "2" | "3">
                  etiqueta="Decimales"
                  valor={String(b.decimales) as "0" | "1" | "2" | "3"}
                  onChange={(v) => poner("decimales", Number(v))}
                  opciones={(["0", "1", "2", "3"] as const).map((n) => ({ id: n, etiqueta: n }))}
                />
              </Grupo>
            </div>

            <div className="dsx-form__grupo">
              <Campo etiqueta="Descripción" opcional ancho>
                {(p) => <input {...p} className="dsx-inp" value={b.descripcion} maxLength={300} placeholder="Qué mide y cómo se calcula" autoComplete="off" onChange={(e) => poner("descripcion", e.target.value)} />}
              </Campo>
              {vinculo ? (
                <div className="dsx-fl" data-ancho="">
                  <span className="dsx-fl__rotulo">Tabla de origen</span>
                  <p className="dsx-fl__valor">
                    <Icon name="link" size={14} />
                    <span>
                      <b>{nombreArchivo(vinculo.archivo_id)}</b>, columna <span className="dsx-mono">{vinculo.col_valor}</span>
                    </span>
                  </p>
                  <p className="dsx-tenue">Para cambiar la conexión, ábrala desde la tabla en Archivos.</p>
                </div>
              ) : (
                <Campo etiqueta="Tabla de origen" opcional ayuda="No hace falta para crearlo: se conecta después. Si elige una, se proponen las columnas." ancho>
                  {(p) => (
                    <select {...p} data-foco={foco === "origen" ? "" : undefined} className="dsx-inp" value={b.origen} onChange={(e) => poner("origen", e.target.value)}>
                      <option value="">Conectar después</option>
                      {tablasUnidad.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
              )}
              <Campo etiqueta="Tarjeta del portal que alimenta" opcional ancho>
                {(p) => (
                  <select {...p} className="dsx-inp" value={b.tarjeta ?? ""} onChange={(e) => poner("tarjeta", (e.target.value || null) as TarjetaPortal | null)}>
                    <option value="">Ninguna: el portal le abre una tarjeta propia</option>
                    {TARJETAS.map((t) => (
                      <option key={t} value={t} disabled={tarjetaUsada(t)}>
                        {INDICATORS[t].name}
                        {tarjetaUsada(t) ? " (ya la alimenta otro)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Nota para el portal" opcional ancho>
                {(p) => <input {...p} className="dsx-inp" value={b.nota} maxLength={400} autoComplete="off" onChange={(e) => poner("nota", e.target.value)} />}
              </Campo>
              <Campo etiqueta="Código" error={verCodigo} ayuda={editado ? "El código no cambia una vez creado." : codigoManual === null ? "Se genera solo a partir del nombre; puede escribir otro." : undefined} ancho>
                {(p) => (
                  <div className="dsx-codigo">
                    <input {...p} className="dsx-inp dsx-mono" value={codigo} disabled={Boolean(editado)} maxLength={40} placeholder="Se genera con el nombre" autoComplete="off" spellCheck={false} onChange={(e) => setCodigoManual(e.target.value)} />
                    {codigoManual !== null && !editado ? (
                      <button type="button" className="dsx-btn dsx-btn--sm dsx-btn--ghost" onClick={() => setCodigoManual(null)}>
                        Volver al automático
                      </button>
                    ) : null}
                  </div>
                )}
              </Campo>
            </div>
          </div>
        ) : null}
      </div>
      {falla ? <AvisoSos tipo="error">{falla}</AvisoSos> : null}
    </Modal>
  );
}
