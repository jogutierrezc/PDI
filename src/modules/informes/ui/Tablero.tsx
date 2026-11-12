/* =============================================================================
   Tablero del ciclo (Planeación): el ciclo del año (fechas, estado, datos
   libres), qué cifras se justifican por plantilla, y la entrega por unidad
   con su estado y avance. Desde aquí se abren los informes.
   ========================================================================== */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { useCrecer, useEntrada } from "../../rankings/movimiento";
import { condicionDe, useAbrirInforme, useGuardarCiclo, useGuardarRequisito, useInstancias, useListas, useOfertaSedes, useUnidades } from "../datos";
import { DIMS, LETRAS, PLANTILLAS, cifraDef, dimsDe, escribeInforme, plantillasAbribles } from "../plantillas";
import { buscarInstancia, nombreConSede, SIN_OFERTA, sedesPorUnidad } from "../sedes";
import { useEstructuras, usePlantillaUnidades, useResponsables } from "../mejoras-datos";
import { quienEscribe } from "../mejoras-logica";
import { ETIQUETA_FILTRO, ORDEN_ESTADOS, SIN_FILTROS, etiquetaTipo, filtrarEntrega, hayFiltros, iniciales, permitidasDe, plantillaInicial, resumirEntrega, tiposDe } from "../tablero-logica";
import type { EstadoFila, FilaEntrega, FiltroEstado, Filtros } from "../tablero-logica";
import type { CicloRow, Condicion, ConfigCiclo, EstadoCiclo, InstanciaRow, Plantilla, PlantillaUnidadRow, RequisitoRow, SedeInforme, UnidadRef } from "../types";
import { enlaceInforme } from "./objetivo";
import { AyudaPilo } from "../guia/AyudaPilo";
import { Aviso, Barra, Cargando, EstadoPill, Vacio, fmtFecha, mensajeDe } from "./comunes";
import { configDe } from "./modelo";
import { CriteriosAdmin } from "./CriteriosAdmin";
import { RequisitosConfig } from "./RequisitosConfig";
import { EstructuraConfig } from "./EstructuraConfig";
import { Responsables } from "./Responsables";
import { copiarDeCiclo } from "../requeridos";
import { clavesInactivas, resolverSecciones } from "../secciones-config";
import { copiarConfigDeCiclo, useConfigSecciones } from "../secciones-datos";

const BASE = "/admin/informes-gestion";
const CONDICIONES: { id: Condicion; texto: string }[] = [
  { id: "justificar", texto: "Justificar" },
  { id: "sugerido", texto: "Sugerido" },
  { id: "no", texto: "No pedir" },
];
const ESTADOS_CICLO: { id: EstadoCiclo; texto: string }[] = [
  { id: "preparacion", texto: "En preparación" },
  { id: "abierto", texto: "Abierto" },
  { id: "cerrado", texto: "Cerrado" },
];

type PropsTablero = { ciclo: CicloRow | null; ciclos: CicloRow[]; requisitos: RequisitoRow[]; elegirAnio: (a: number) => void };

/** Defensa en profundidad (0192): quien no gestiona los informes no ve el tablero ni consulta nada; la base también lo niega. */
export function Tablero(props: PropsTablero) {
  const { puedeGestionarInformes } = useAuth();
  if (!puedeGestionarInformes) return <Vacio>El tablero del ciclo es de quien gestiona los informes.</Vacio>;
  return <TableroGestion {...props} />;
}

function TableroGestion({ ciclo, ciclos, requisitos, elegirAnio }: PropsTablero) {
  const raiz = useRef<HTMLDivElement>(null);
  useEntrada(raiz, ".inf-card", ciclo?.id ?? "nuevo");
  return (
    <div className="inf-stack" ref={raiz}>
      <FichaCiclo key={ciclo?.id ?? "nuevo"} ciclo={ciclo} ciclos={ciclos} elegirAnio={elegirAnio} />
      {ciclo && <Entrega ciclo={ciclo} />}
      {ciclo && (
        <div className="inf-two">
          <div className="inf-stack">
            <EstructuraConfig ciclo={ciclo} />
            <RequisitosConfig ciclo={ciclo} requisitos={requisitos} />
            <Requisitos ciclo={ciclo} requisitos={requisitos} />
          </div>
          <div className="inf-stack">
            <DatosLibres ciclo={ciclo} />
            <CriteriosAdmin ciclo={ciclo} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- El ciclo ----------------------------------------------------------- */

function FichaCiclo({ ciclo, ciclos, elegirAnio }: { ciclo: CicloRow | null; ciclos: CicloRow[]; elegirAnio: (a: number) => void }) {
  const guardar = useGuardarCiclo();
  const anioBase = ciclo?.anio ?? new Date().getFullYear();
  const [f, setF] = useState({
    anio: anioBase,
    nombre: ciclo?.nombre ?? `Informe de gestión ${anioBase}`,
    fecha_limite: ciclo?.fecha_limite ?? "",
    corte: ciclo?.corte ?? "",
    estado: ciclo?.estado ?? ("preparacion" as EstadoCiclo),
  });
  const enviar = () =>
    guardar.mutate(
      {
        ...(ciclo ? { id: ciclo.id } : {}),
        anio: f.anio,
        nombre: f.nombre.trim() || `Informe de gestión ${f.anio}`,
        fecha_limite: f.fecha_limite || null,
        corte: f.corte || null,
        estado: f.estado,
        config: configDe(ciclo),
      },
      { onSuccess: (c) => elegirAnio(c.anio) },
    );

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-ciclo" data-guia="t-head">
      <div className="inf-row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="inf-eyebrow">{ciclo ? `Ciclo ${ciclo.anio}` : "Sin ciclo"}</span>
          <h3 id="inf-ciclo" className="inf-t">
            {ciclo ? ciclo.nombre : "Abrir el ciclo del informe de gestión"} <AyudaPilo zona="t-head" />
          </h3>
        </div>
        {ciclos.length > 1 && (
          <label className="inf-lab">
            Año
            <select className="inf-in" value={ciclo?.anio ?? ""} onChange={(e) => elegirAnio(Number(e.target.value))}>
              {ciclos.map((c) => (
                <option key={c.id} value={c.anio}>
                  {c.anio}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="inf-sub">
        {ciclo
          ? `Fecha límite ${fmtFecha(ciclo.fecha_limite)} · corte de las cifras ${fmtFecha(ciclo.corte)}. Las unidades escriben mientras el ciclo esté abierto.`
          : "Un ciclo por año. Mientras esté en preparación, Planeación fija plantillas y requisitos; al abrirlo, las unidades empiezan a escribir."}
      </p>
      <div className="inf-form">
        <label className="inf-lab">
          Año
          <input className="inf-in inf-num" type="number" value={f.anio} onChange={(e) => setF({ ...f, anio: Number(e.target.value) })} disabled={Boolean(ciclo)} />
        </label>
        <label className="inf-lab">
          Nombre
          <input className="inf-in" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
        <label className="inf-lab">
          Fecha límite
          <input className="inf-in" type="date" value={f.fecha_limite} onChange={(e) => setF({ ...f, fecha_limite: e.target.value })} />
        </label>
        <label className="inf-lab">
          Corte de las cifras
          <input className="inf-in" type="date" value={f.corte} onChange={(e) => setF({ ...f, corte: e.target.value })} />
        </label>
        <label className="inf-lab">
          Estado
          <select className="inf-in" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoCiclo })}>
            {ESTADOS_CICLO.map((x) => (
              <option key={x.id} value={x.id}>
                {x.texto}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
        <button type="button" className="inf-btn inf-btn--pri" onClick={enviar} disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : ciclo ? "Guardar el ciclo" : "Crear el ciclo"}
        </button>
        {ciclo && (
          <button
            type="button"
            className="inf-btn inf-btn--ghost"
            onClick={() => {
              const anio = (ciclos[0]?.anio ?? anioBase) + 1;
              setF({ anio, nombre: `Informe de gestión ${anio}`, fecha_limite: "", corte: "", estado: "preparacion" });
              guardar.mutate(
                { anio, nombre: `Informe de gestión ${anio}`, fecha_limite: null, corte: null, estado: "preparacion", config: configDe(ciclo) },
                { onSuccess: (c) => void Promise.all([copiarDeCiclo(ciclo.id, c.id), copiarConfigDeCiclo(ciclo.id, c.id)]).finally(() => elegirAnio(c.anio)) },
              );
            }}
            disabled={guardar.isPending}
          >
            Preparar el ciclo siguiente
          </button>
        )}
        {guardar.error && (
          <span className="inf-error" role="alert">
            {mensajeDe(guardar.error)}
          </span>
        )}
      </div>
    </section>
  );
}

/* ---------- Qué cifras se justifican ------------------------------------------- */

function Requisitos({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("A");
  const guardar = useGuardarRequisito();
  const dims = dimsDe(plantilla);
  const claves = dims.flatMap((d) => DIMS[d].cifras);
  const cuenta = (c: Condicion) => claves.filter((k) => condicionDe(requisitos, plantilla, k) === c).length;

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-req" data-guia="t-req">
      <h3 id="inf-req" className="inf-t">
        Qué datos debe justificar cada unidad <AyudaPilo zona="t-req" />
      </h3>
      <p className="inf-sub">
        Para la {PLANTILLAS[plantilla].nombre.toLowerCase()} ({PLANTILLAS[plantilla].quien.toLowerCase()}). Lo que marque como «Justificar» aparece bloqueado en el
        informe de cada unidad, con una línea de explicación obligatoria.
      </p>
      <div className="rk-seg" role="group" aria-label="Plantilla" style={{ marginBottom: "var(--space-4)" }}>
        {LETRAS.map((l) => (
          <button key={l} type="button" aria-pressed={l === plantilla} onClick={() => setPlantilla(l)} title={PLANTILLAS[l].quien}>
            {l} · {PLANTILLAS[l].quien}
          </button>
        ))}
      </div>
      <div className="inf-cnt">
        <div>
          <b className="inf-num">{cuenta("justificar")}</b>
          <span>deben justificarse</span>
        </div>
        <div>
          <b className="inf-num">{cuenta("sugerido")}</b>
          <span>sugeridos</span>
        </div>
        <div>
          <b className="inf-num">{cuenta("no")}</b>
          <span>no se piden</span>
        </div>
      </div>
      <div className="inf-tw">
        <table className="inf-ask">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Fuente</th>
              <th>Condición</th>
            </tr>
          </thead>
          <tbody>
            {dims.map((d) => [
              <tr key={d} className="grp">
                <td colSpan={3}>{DIMS[d].titulo}</td>
              </tr>,
              ...DIMS[d].cifras.map((k) => {
                const actual = condicionDe(requisitos, plantilla, k);
                const def = cifraDef(k);
                return (
                  <tr key={`${d}-${k}`}>
                    <td>{def?.etiqueta ?? k}</td>
                    <td className="inf-src">{def?.fuente}</td>
                    <td>
                      <div className="rk-seg" role="group" aria-label={`Condición de ${def?.etiqueta ?? k}`}>
                        {CONDICIONES.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            aria-pressed={actual === x.id}
                            onClick={() => actual !== x.id && guardar.mutate({ ciclo_id: ciclo.id, plantilla, clave: k, condicion: x.id })}
                          >
                            {x.texto}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {guardar.error && (
        <p className="inf-error" role="alert">
          {mensajeDe(guardar.error)}
        </p>
      )}
    </section>
  );
}

/* ---------- Datos libres --------------------------------------------------------- */

function DatosLibres({ ciclo }: { ciclo: CicloRow }) {
  const guardar = useGuardarCiclo();
  const cfg = configDe(ciclo);
  const fijar = (x: Partial<ConfigCiclo>) => guardar.mutate({ ...ciclo, config: { ...cfg, ...x } });
  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-libres">
      <h3 id="inf-libres" className="inf-t">
        Los datos libres
      </h3>
      <p className="inf-sub">Cada unidad puede sumar sus propios datos sin salirse del plan de diseño.</p>
      <div className="inf-stack" style={{ gap: "var(--space-3)" }}>
        <div className="inf-row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>Datos propios por sección</span>
          <span className="inf-step">
            <button type="button" aria-label="Menos" onClick={() => fijar({ limite_propios: Math.max(0, cfg.limite_propios - 1) })}>
              −
            </button>
            <b className="inf-num" aria-live="polite">
              {cfg.limite_propios}
            </b>
            <button type="button" aria-label="Más" onClick={() => fijar({ limite_propios: Math.min(10, cfg.limite_propios + 1) })}>
              +
            </button>
          </span>
        </div>
        <label className="inf-chk">
          <input type="checkbox" checked={cfg.exigir_fuente} onChange={(e) => fijar({ exigir_fuente: e.target.checked })} /> Exigir fuente en cada dato propio
        </label>
        <label className="inf-chk">
          <input type="checkbox" checked={cfg.exigir_pilar} onChange={(e) => fijar({ exigir_pilar: e.target.checked })} /> Exigir un pilar del PDI vinculado
        </label>
        {guardar.error && (
          <span className="inf-error" role="alert">
            {mensajeDe(guardar.error)}
          </span>
        )}
      </div>
    </section>
  );
}

/* ---------- Entrega por unidad ----------------------------------------------------- */

const POR_PAGINA = 60;

/** Qué informes llevan al menos un archivo de evidencia (informe_anexos). Una consulta por tandas; si falla, el dato no se muestra. */
function useConEvidencias(ids: string[]) {
  return useQuery({
    queryKey: ["informes", "tablero-evidencias", ids.length],
    enabled: ids.length > 0,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const con = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const r = await supabase.from("informe_anexos").select("instancia_id").in("instancia_id", ids.slice(i, i + 200));
        if (r.error) throw new Error(r.error.message);
        for (const f of (r.data as { instancia_id: string }[] | null) ?? []) con.add(f.instancia_id);
      }
      return con;
    },
  });
}

/** Una fila de la entrega con lo que hace falta para pintarla y decidir qué se abre. */
interface FilaCompleta extends FilaEntrega {
  u: UnidadRef;
  sede: SedeInforme | null;
  inst: InstanciaRow | null;
  /** La plantilla con la que se abriría (o con la que ya se abrió). */
  plantillaElegida: Plantilla;
}

function Entrega({ ciclo }: { ciclo: CicloRow }) {
  const unidades = useUnidades();
  const instancias = useInstancias(ciclo.id);
  const oferta = useOfertaSedes();
  const filasPU = usePlantillaUnidades();
  const estructuras = useEstructuras();
  const ids = useMemo(() => (instancias.data ?? []).map((i) => i.id), [instancias.data]);
  const estructura = useConfigSecciones(ciclo.id).data?.filas;
  const inactivas = useMemo(() => new Map((instancias.data ?? []).map((i) => [i.id, clavesInactivas(i.plantilla, estructura ?? [])] as const)), [instancias.data, estructura]);
  const listas = useListas(ciclo.id, ids, inactivas);
  const evidencias = useConEvidencias(ids);
  const abrir = useAbrirInforme();
  const [elegidas, setElegidas] = useState<Record<string, Plantilla>>({});
  const [error, setError] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [responsables, setResponsables] = useState<{ id: string; nombre: string } | null>(null);
  const barras = useRef<HTMLDivElement>(null);
  useCrecer(barras, ".inf-bar > i", { clave: listas.data ? "listo" : "cargando" });

  // La búsqueda se aplica un instante después de escribir: con cientos de unidades no se filtra en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.texto === textoBusqueda ? f : { ...f, texto: textoBusqueda })), 160);
    return () => clearTimeout(t);
  }, [textoBusqueda]);
  useEffect(() => setLimite(POR_PAGINA), [filtros]);

  const puPlano = filasPU.data?.filas ?? SIN_FILAS_PU;
  const ofrecidas = plantillasAbribles();
  const permitidasPorUnidad = useMemo(() => {
    const m = new Map<string, Plantilla[]>();
    for (const u of unidades.data ?? []) m.set(u.id, permitidasDe(puPlano, u.id, ofrecidas));
    return m;
    // `ofrecidas` cambia solo cuando cambian las estructuras (filasPU y las estructuras se cargan antes de pintar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidades.data, puPlano, estructuras.data]);

  // Una fila por unidad y por sede donde se ofrece; las que no se ofrecen en sedes, una sola fila sin sede.
  const filas: FilaCompleta[] = useMemo(() => {
    if (!unidades.data || !instancias.data || !oferta.data) return [];
    const totales = new Map<string, number>();
    const totalDe = (p: Plantilla) => {
      let t = totales.get(p);
      if (t === undefined) {
        t = Math.max(1, resolverSecciones(p, estructura ?? []).length);
        totales.set(p, t);
      }
      return t;
    };
    const sedesDe = sedesPorUnidad(unidades.data, oferta.data ?? SIN_OFERTA);
    return unidades.data
      .filter((u) => escribeInforme(u.kind))
      .flatMap((u) => {
        const sedes = sedesDe.get(u.id) ?? [];
        return (sedes.length ? sedes : [null]).map((sede: SedeInforme | null): FilaCompleta => {
          const inst = buscarInstancia(instancias.data, u.id, sede?.id ?? null, sedes);
          const clave = `${u.id}|${sede?.id ?? ""}`;
          const plantilla = inst?.plantilla ?? plantillaInicial(u.id, u.kind, u.name, permitidasPorUnidad.get(u.id) ?? [], puPlano, elegidas[clave]);
          return {
            clave,
            unitId: u.id,
            nombre: nombreConSede(u.name, sede),
            tipo: u.kind,
            estado: inst?.estado ?? "none",
            hechas: inst ? (listas.data?.get(inst.id) ?? 0) : 0,
            total: totalDe(plantilla),
            conEvidencias: inst ? Boolean(evidencias.data?.has(inst.id)) : false,
            u,
            sede,
            inst,
            plantillaElegida: plantilla,
          };
        });
      });
  }, [unidades.data, instancias.data, oferta.data, listas.data, evidencias.data, puPlano, permitidasPorUnidad, elegidas, estructura]);

  const resumen = useMemo(() => resumirEntrega(filas), [filas]);
  const visibles = useMemo(() => filtrarEntrega(filas, filtros) as FilaCompleta[], [filas, filtros]);
  const tipos = useMemo(() => tiposDe(filas), [filas]);
  const sinAbrir = useMemo(() => filas.filter((f) => !f.inst), [filas]);

  const elegir = useCallback((clave: string, p: Plantilla) => setElegidas((e) => ({ ...e, [clave]: p })), []);
  const abrirMutar = abrir.mutate;
  const abrirUna = useCallback(
    (f: FilaCompleta, plantilla: Plantilla) => abrirMutar({ ciclo: ciclo.id, unidad: f.u.id, sede: f.sede?.id ?? null, plantilla }),
    [ciclo.id, abrirMutar],
  );
  const verResponsables = useCallback((f: FilaCompleta) => setResponsables({ id: f.u.id, nombre: f.u.name }), []);

  const fallo = [unidades.error, instancias.error].find((e): e is Error => e instanceof Error);
  if (fallo) return <Aviso error={fallo} />;
  if (unidades.isPending || instancias.isPending || oferta.isPending) return <Cargando texto="Cargando las unidades…" />;

  const abrirTodas = async () => {
    setError("");
    for (const f of sinAbrir) {
      try {
        await abrir.mutateAsync({ ciclo: ciclo.id, unidad: f.u.id, sede: f.sede?.id ?? null, plantilla: f.plantillaElegida });
      } catch (e) {
        setError(`${f.nombre}: ${mensajeDe(e)}`);
        return;
      }
    }
  };
  const faltaPU = Boolean(filasPU.data?.falta);
  const avance = Math.round(resumen.avance * 100);
  const mostradas = visibles.slice(0, limite);

  return (
    <section className="inf-card inf-pad inf-tab" aria-labelledby="inf-entrega" data-guia="t-tabla">
      <h3 id="inf-entrega" className="inf-t">
        Entrega por unidad y sede <AyudaPilo zona="t-tabla" />
      </h3>
      <p className="inf-sub">
        Fecha límite {fmtFecha(ciclo.fecha_limite)}. {resumen.abiertos} de {resumen.total} informes abiertos.
      </p>

      {resumen.total === 0 ? (
        <Vacio>Todavía no hay unidades que escriban informe. Cuando existan, aparecerán aquí.</Vacio>
      ) : (
        <>
          <div className="inf-tab-resumen" role="group" aria-label="Resumen por estado: pulse uno para filtrar">
            <div className="inf-tab-avance">
              <b className="inf-num">{avance} %</b>
              <span>avance general</span>
              <Barra valor={resumen.avance} etiqueta="Avance general del ciclo" />
              <small>
                {resumen.conEvidencias} {resumen.conEvidencias === 1 ? "informe lleva" : "informes llevan"} evidencias
                {evidencias.isError ? " (dato no disponible)" : ""}
              </small>
            </div>
            {ORDEN_ESTADOS.map((e) => (
              <button key={e} type="button" className="inf-tab-cuenta" aria-pressed={filtros.estado === e} onClick={() => setFiltros((f) => ({ ...f, estado: f.estado === e ? "todos" : e }))}>
                <b className="inf-num">{resumen.porEstado[e]}</b>
                <span>
                  <span aria-hidden="true">{GLIFO_ESTADO[e]} </span>
                  {ETIQUETA_FILTRO[e]}
                </span>
              </button>
            ))}
          </div>

          <div className="inf-tab-filtros">
            <label className="inf-lab inf-tab-filtros__q">
              Buscar unidad
              <input className="inf-in" type="search" value={textoBusqueda} onChange={(e) => setTextoBusqueda(e.target.value)} placeholder="Nombre de la unidad" autoComplete="off" />
            </label>
            <label className="inf-lab">
              Estado
              <select className="inf-in" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value as FiltroEstado })}>
                <option value="todos">Todos</option>
                {ORDEN_ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_FILTRO[e]}
                  </option>
                ))}
              </select>
            </label>
            <label className="inf-lab">
              Tipo de unidad
              <select className="inf-in" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
                <option value="todos">Todos</option>
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {etiquetaTipo(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="inf-row inf-tab-barra">
            <span className="inf-hint" role="status" aria-live="polite">
              {hayFiltros(filtros) ? `${visibles.length} de ${resumen.total} unidades` : `${resumen.total} unidades`}
            </span>
            {hayFiltros(filtros) && (
              <button
                type="button"
                className="inf-link inf-tab-enlace"
                onClick={() => {
                  setFiltros(SIN_FILTROS);
                  setTextoBusqueda("");
                }}
              >
                Quitar los filtros
              </button>
            )}
            {sinAbrir.length > 0 && (
              <span className="inf-tab-barra__der">
                <span className="inf-hint">Con la plantilla que muestra cada fila.</span>
                <button type="button" className="inf-btn inf-btn--sm" onClick={() => void abrirTodas()} disabled={abrir.isPending}>
                  {abrir.isPending ? "Abriendo…" : `Abrir los ${sinAbrir.length} que faltan`}
                </button>
              </span>
            )}
          </div>
          {faltaPU && <p className="inf-hint">Falta aplicar la migración 0279: por ahora todas las oficinas pueden usar todas las plantillas.</p>}
          {(error || abrir.error) && (
            <p className="inf-error" role="alert">
              {error || mensajeDe(abrir.error)}
            </p>
          )}

          {visibles.length === 0 ? (
            <Vacio>Ninguna unidad coincide con los filtros.</Vacio>
          ) : (
            <>
              <div className="inf-units inf-tab-lista" ref={barras} role="list">
                {mostradas.map((f) => (
                  <FilaUnidad
                    key={f.clave}
                    f={f}
                    opciones={permitidasPorUnidad.get(f.u.id) ?? SIN_OPCIONES}
                    pendiente={abrir.isPending}
                    onElegir={elegir}
                    onAbrir={abrirUna}
                    onResponsables={verResponsables}
                  />
                ))}
              </div>
              {visibles.length > mostradas.length && (
                <div className="inf-row" style={{ marginTop: "var(--space-3)" }}>
                  <button type="button" className="inf-btn" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                    Mostrar {Math.min(POR_PAGINA, visibles.length - mostradas.length)} más
                  </button>
                  <span className="inf-hint">
                    {mostradas.length} de {visibles.length}
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}
      {responsables && <Responsables unidad={responsables} onCerrar={() => setResponsables(null)} />}
    </section>
  );
}

const SIN_FILAS_PU: PlantillaUnidadRow[] = [];
const SIN_OPCIONES: Plantilla[] = [];
const GLIFO_ESTADO: Record<EstadoFila, string> = { none: "○", draft: "◐", sent: "◉", back: "↺", ok: "●" };

/** Nombre legible de una plantilla: la estructura propia por su nombre; las A–D como «Plantilla A · Facultades». */
const nombrePlantilla = (id: Plantilla): string => (PLANTILLAS[id]?.propia ? PLANTILLAS[id].nombre : `${PLANTILLAS[id]?.nombre ?? id} · ${PLANTILLAS[id]?.quien ?? ""}`);

const FilaUnidad = memo(function FilaUnidad({
  f,
  opciones,
  pendiente,
  onElegir,
  onAbrir,
  onResponsables,
}: {
  f: FilaCompleta;
  opciones: Plantilla[];
  pendiente: boolean;
  onElegir: (clave: string, p: Plantilla) => void;
  onAbrir: (f: FilaCompleta, p: Plantilla) => void;
  onResponsables: (f: FilaCompleta) => void;
}) {
  const { u, sede, inst, plantillaElegida: elegida } = f;
  const lista = opciones.includes(elegida) ? opciones : [elegida, ...opciones];
  return (
    <div className="inf-u inf-tab-fila" role="listitem">
      <div className="inf-tab-fila__quien">
        <b>{f.nombre}</b>
        <small>
          {etiquetaTipo(f.tipo)}
          {inst ? ` · ${nombrePlantilla(inst.plantilla)}` : ""}
        </small>
        {!inst && (
          <select className="inf-in inf-tab-fila__plantilla" value={elegida} onChange={(e) => onElegir(f.clave, e.target.value)} aria-label={`Plantilla de ${f.nombre}`}>
            {lista.map((l) => (
              <option key={l} value={l}>
                {nombrePlantilla(l)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="inf-tab-fila__estado">
        <EstadoPill estado={inst?.estado ?? null} />
        {inst ? (
          <>
            <Barra valor={f.total ? f.hechas / f.total : 0} etiqueta={`Avance de ${f.nombre}`} />
            <small className="inf-num">
              {f.hechas} de {f.total} secciones
              {f.conEvidencias ? " · con evidencias" : ""}
            </small>
          </>
        ) : (
          <small>Sin abrir</small>
        )}
      </div>
      <QuienEscribe unitId={u.id} onAbrir={() => onResponsables(f)} nombre={f.nombre} />
      <div className="inf-u__acts">
        {inst ? (
          <>
            <Link className="inf-link inf-tab-enlace" to={inst.estado === "sent" ? `${BASE}/revision?informe=${inst.id}` : enlaceInforme(`${BASE}/mi-informe`, u.id, sede)}>
              {inst.estado === "sent" ? "Revisar" : "Ver"}
            </Link>
            <Link className="inf-link inf-tab-enlace" to={enlaceInforme(`${BASE}/vista`, u.id, sede)}>
              Vista del informe
            </Link>
          </>
        ) : (
          <button type="button" className="inf-btn inf-btn--sm" disabled={pendiente} onClick={() => onAbrir(f, elegida)}>
            Abrir
          </button>
        )}
      </div>
    </div>
  );
});

/** Quién escribe el informe de la unidad. Se consulta solo cuando la fila entra en pantalla: con cientos de unidades no se piden todas a la vez. */
function QuienEscribe({ unitId, nombre, onAbrir }: { unitId: string; nombre: string; onAbrir: () => void }) {
  const nodo = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = nodo.current;
    if (!el || visto) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisto(true);
      return;
    }
    const o = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisto(true);
          o.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [visto]);
  const r = useResponsables(visto ? unitId : undefined);
  const escriben = quienEscribe(r.data?.filas ?? []);
  let contenido: ReactNode;
  if (!visto || r.isPending) contenido = <span className="inf-hint">{visto ? "Cargando…" : "Responsables"}</span>;
  else if (r.isError || r.data?.falta) contenido = <span className="inf-hint">No disponible</span>;
  else if (escriben.length === 0) contenido = <span className="inf-tab-sin">Nadie escribe aún</span>;
  else
    contenido = (
      <span className="inf-tab-quien" title={escriben.map((x) => x.nombre || x.correo).join(", ")}>
        <span className="inf-tab-avatares" aria-hidden="true">
          {escriben.slice(0, 3).map((x) => (
            <i key={x.profile_id}>{iniciales(x.nombre, x.correo)}</i>
          ))}
        </span>
        <span>
          {escriben[0].nombre || escriben[0].correo}
          {escriben.length > 1 ? ` y ${escriben.length - 1} más` : ""}
        </span>
      </span>
    );
  return (
    <div className="inf-tab-fila__resp" ref={nodo}>
      {contenido}
      <button type="button" className="inf-link inf-tab-enlace" onClick={onAbrir} aria-label={`Responsables de ${nombre}`}>
        Responsables
      </button>
    </div>
  );
}
