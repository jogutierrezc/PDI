/* =============================================================================
   Observatorio · el observatorio por dentro (lectura e interacción).

   Ruta: /admin/observatorio-ver/:enlace[/:tema|guia]. Muestra, para quien tenga
   algún panel del taller en ese observatorio, lo que el taller armó: las
   páginas por línea (vicerrectoría) y tema (dimensión), con los visores sobre
   las tablas, y la guía de datos. Los filtros siguen la estructura —
   vicerrectoría, facultad, sede y programa— y viven en la dirección para poder
   compartirlos.

   Ver lee e interactúa (filtros, tablas, orden de lectura) y NO modifica nada:
   esta pantalla no escribe en la base. Editar encuentra el enlace al taller.
   ========================================================================== */

import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../../components/ui/QueryState";
import { useAuth } from "../../../../lib/auth";
import { AdminShell, ReadOnlyNotice } from "../../components/AdminShell";
import { RawTable } from "../ObsCharts";
import { topicConfig, plural } from "../model";
import type { ObsDataset } from "../model";
import { usePermisosObservatorio } from "../publicar/permisos";
import { useObsState, useSyncObsTopics } from "../store";
import { BoardPreview } from "../stations/BoardsStation";
import { visoresSugeridos } from "./sugeridas";
import { PaginaFinanciero } from "../tablero-iga/PaginaFinanciero";
import { PaginaTemaIga } from "../tablero-iga/PaginaTemaIga";
import { TEMAS_IGA } from "../tablero-iga/temas";
import { origenVisible, useIndicadores } from "../guia/api";
import { useFiltrosTablero, useObservatorioPorEnlace } from "../guia/tablero";
import { SIN_FILTROS, filtrarDataset, hayFiltros, opcionesDe } from "./estructura";
import type { FiltrosEstructura } from "./estructura";
import "../obs-admin.css";
import "../guia/guia.css";
import "./visor.css";

const PANELES_TALLER = ["obs_captura", "obs_diseno", "obs_tableros", "obs_boletin"] as const;

export function VisorObservatorio() {
  const { enlace, tema } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { hasRole } = useAuth();
  const permisos = usePermisosObservatorio();
  useSyncObsTopics();
  const base = useObservatorioPorEnlace(enlace);
  const obsId = base.data?.obs.id ?? null;
  const estado = useObsState();
  const indicadores = useIndicadores(obsId);
  const ajustes = useFiltrosTablero(obsId);

  const ver = obsId ? PANELES_TALLER.some((p) => permisos.tiene(p, obsId)) : false;
  const editar = hasRole("planeacion") && !!obsId && permisos.puede("obs_tableros", obsId, "editar");
  const ofrece = ajustes.data ?? { vicerrectoria: true, facultad: true, programa: true, sede: true };

  const f: FiltrosEstructura = {
    vr: ofrece.vicerrectoria && sp.get("vr") === "pos" ? "pos" : "",
    fac: ofrece.facultad ? (sp.get("fac") ?? "") : "",
    sede: ofrece.sede ? (sp.get("sede") ?? "") : "",
    prog: ofrece.programa ? (sp.get("prog") ?? "") : "",
  };
  const poner = (cambio: Partial<FiltrosEstructura>) => {
    const next = new URLSearchParams(sp);
    const nuevo = { ...f, ...cambio };
    if (cambio.fac !== undefined || cambio.sede !== undefined || cambio.vr !== undefined) nuevo.prog = cambio.prog ?? "";
    (Object.keys(nuevo) as (keyof FiltrosEstructura)[]).forEach((k) => (nuevo[k] ? next.set(k, nuevo[k]) : next.delete(k)));
    setSp(next, { replace: true });
  };

  const temas = base.data?.temas ?? [];
  const lineas = base.data?.lineas ?? [];
  const actual = tema === "guia" ? "guia" : (temas.find((t) => t.slug === tema)?.slug ?? temas[0]?.slug);
  const datasets = useMemo(() => estado.data?.datasets ?? [], [estado.data]);
  const delObs = useMemo(() => datasets.filter((d) => temas.some((t) => t.slug === d.topic)), [datasets, temas]);
  const opciones = useMemo(() => opcionesDe(delObs, f), [delObs, f.vr, f.fac, f.sede]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargando = base.isPending || estado.isPending;
  const error = base.error ?? estado.error;

  return (
    <AdminShell section="observatorio" kicker="Observatorio" title={base.data?.obs.nombre ?? "Observatorio"} description={base.data?.obs.descripcion || undefined}>
      {cargando ? (
        <LoadingBlock rows={5} label="Cargando el observatorio" />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void base.refetch()} />
      ) : !base.data ? (
        <ReadOnlyNotice>Este observatorio no existe o falta aplicar la migración 0277.</ReadOnlyNotice>
      ) : !ver ? (
        <ReadOnlyNotice>Tu rol no tiene acceso a este observatorio.</ReadOnlyNotice>
      ) : (
        <div className="obs-visor">
          <nav className="obs-visor__rail" aria-label="Páginas del observatorio">
            {lineas.map((l) => (
              <div key={l.id} className="obs-visor__linea">
                <h2>{l.nombre}</h2>
                {temas.filter((t) => t.linea_id === l.id).map((t) => (
                  <button key={t.slug} type="button" aria-current={actual === t.slug ? "page" : undefined} onClick={() => navigate(`/admin/observatorio-ver/${enlace}/${t.slug}?${sp.toString()}`)}>
                    {t.nombre ?? t.slug}
                  </button>
                ))}
              </div>
            ))}
            <div className="obs-visor__linea">
              <h2>Datos</h2>
              <button type="button" aria-current={actual === "guia" ? "page" : undefined} onClick={() => navigate(`/admin/observatorio-ver/${enlace}/guia?${sp.toString()}`)}>
                Guía de datos
              </button>
            </div>
            {editar && (
              <Link className="obs-visor__taller" to="/admin/observatorio/tableros">
                <Icon name="table" size={14} /> Abrir en el taller
              </Link>
            )}
          </nav>

          <div className="obs-visor__main">
            {!editar && <ReadOnlyNotice>Puedes leer y explorar este observatorio con los filtros y las tablas. Modificar los datos pide el permiso de editar.</ReadOnlyNotice>}
            {actual !== "guia" && (
              <Filtros f={f} poner={poner} opciones={opciones} ofrece={ofrece} activo={hayFiltros(f)} limpiar={() => poner({ vr: "", fac: "", sede: "", prog: "" })} />
            )}
            {actual === "guia" ? (
              <GuiaLectura filas={indicadores.data?.filas ?? []} temas={temas} falta={Boolean(indicadores.data?.falta)} ir={(slug) => navigate(`/admin/observatorio-ver/${enlace}/${slug}`)} />
            ) : actual ? (
              estado.data && (
                (actual === "iga-financiero" || TEMAS_IGA[actual]) && sp.get("vista") !== "taller" ? (
                  <>
                    <VistaTema sp={sp} setSp={setSp} />
                    {actual === "iga-financiero" ? (
                      <PaginaFinanciero enlace={enlace ?? ""} indicadores={indicadores.data?.filas ?? []} datasets={datasets} filtros={f} poner={poner} />
                    ) : (
                      <PaginaTemaIga cfg={TEMAS_IGA[actual]} indicadores={indicadores.data?.filas ?? []} datasets={datasets} filtros={f} poner={poner} />
                    )}
                  </>
                ) : (
                  <>
                    {(actual === "iga-financiero" || TEMAS_IGA[actual]) && <VistaTema sp={sp} setSp={setSp} />}
                    <PaginaTema slug={actual} estado={estado.data} filtros={f} />
                  </>
                )
              )
            ) : (
              <p className="obs-empty">Este observatorio aún no tiene páginas.</p>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

/** Alterna entre el tablero a medida y las gráficas que arma el taller. */
function VistaTema({ sp, setSp }: { sp: URLSearchParams; setSp: (p: URLSearchParams, o?: { replace?: boolean }) => void }) {
  const taller = sp.get("vista") === "taller";
  const poner = (v: "" | "taller") => { const n = new URLSearchParams(sp); if (v) n.set("vista", v); else n.delete("vista"); setSp(n, { replace: true }); };
  return (
    <div className="obs-visor__vista" role="group" aria-label="Forma de ver el tema">
      <button type="button" aria-pressed={!taller} onClick={() => poner("")}>Tablero</button>
      <button type="button" aria-pressed={taller} onClick={() => poner("taller")}>Gráficas del taller</button>
    </div>
  );
}

/* --- Filtros ------------------------------------------------------------------------------ */

function Filtros({ f, poner, opciones, ofrece, activo, limpiar }: { f: FiltrosEstructura; poner: (c: Partial<FiltrosEstructura>) => void; opciones: { facultades: string[]; sedes: string[]; programas: string[] }; ofrece: { vicerrectoria: boolean; facultad: boolean; programa: boolean; sede: boolean }; activo: boolean; limpiar: () => void }) {
  const campo = (id: string, etiqueta: string, valor: string, lista: string[], todas: string, cambio: (v: string) => void) => (
    <label className="obs-visor__campo">
      <span>{etiqueta}</span>
      <select id={id} value={valor} onChange={(e) => cambio(e.target.value)}>
        <option value="">{todas}</option>
        {lista.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </label>
  );
  if (!ofrece.vicerrectoria && !ofrece.facultad && !ofrece.programa && !ofrece.sede) return null;
  return (
    <div className="obs-visor__filtros" role="group" aria-label="Filtros por la estructura institucional">
      {ofrece.vicerrectoria && (
        <label className="obs-visor__campo">
          <span>Vicerrectoría</span>
          <select value={f.vr} onChange={(e) => poner({ vr: e.target.value === "pos" ? "pos" : "" })}>
            <option value="">Todas</option>
            <option value="pos">Posgrados</option>
          </select>
        </label>
      )}
      {ofrece.facultad && campo("f-fac", "Facultad", f.fac, opciones.facultades, "Toda la UDES", (v) => poner({ fac: v }))}
      {ofrece.sede && campo("f-sede", "Sede", f.sede, opciones.sedes, "Todas", (v) => poner({ sede: v }))}
      {ofrece.programa && campo("f-prog", "Programa", f.prog, opciones.programas, "Todos", (v) => poner({ prog: v }))}
      {activo && <button type="button" className="oda-link-button" onClick={limpiar}>Quitar filtros</button>}
    </div>
  );
}

/* --- Una página (tema) ------------------------------------------------------------------ */

function PaginaTema({ slug, estado, filtros }: { slug: string; estado: NonNullable<ReturnType<typeof useObsState>["data"]>; filtros: FiltrosEstructura }) {
  const config = topicConfig(estado, slug);
  const guardados = useMemo(() => estado.views.filter((v) => v.topic === slug && v.visible).sort((a, b) => a.position - b.position), [estado.views, slug]);
  // Sin visores guardados, la vista previa dibuja los que el taller recomienda para las tablas del tema.
  const views = useMemo(() => (guardados.length ? guardados : visoresSugeridos(estado.datasets.filter((d) => d.topic === slug && !d.sample), slug)), [guardados, estado.datasets, slug]);
  const sugeridas = guardados.length === 0 && views.length > 0;
  const usados = useMemo(() => [...new Set(views.map((v) => v.datasetId))].map((id) => estado.datasets.find((d) => d.id === id)).filter((d): d is ObsDataset => Boolean(d)), [views, estado.datasets]);
  const filtrados = useMemo(() => usados.map((d) => ({ d, r: filtrarDataset(d, filtros) })), [usados, filtros]);
  const mapa = useMemo(() => new Map(filtrados.map(({ d, r }) => [d.id, r.dataset])), [filtrados]);
  const ignorados = [...new Set(filtrados.flatMap(({ r }) => r.ignorados))];

  return (
    <>
      {sugeridas && (
        <p className="obs-guia-aviso" role="note">
          <Icon name="alert" size={15} /> Vista previa con gráficas sugeridas: este tema aún no tiene visores guardados. Se arman y guardan en Diseño visual; el portal solo muestra los guardados y publicados.
        </p>
      )}
      {hayFiltros(filtros) && ignorados.length > 0 && (
        <p className="obs-guia-aviso" role="note">
          <Icon name="alert" size={15} /> Algunas gráficas vienen agregadas sin la columna de {ignorados.join(", ")}: ese filtro no las cambia.
        </p>
      )}
      <BoardPreview config={config} views={views} datasets={mapa} />
      {filtrados.length > 0 && (
        <section className="obs-visor__datos" aria-label="Tablas de datos">
          <h3>Tablas de datos</h3>
          {filtrados.map(({ d, r }) => (
            <details key={d.id}>
              <summary>{d.title} <small>{plural(r.dataset.rows.length, "fila", "filas")}{hayFiltros(filtros) ? " con los filtros" : ""}</small></summary>
              <RawTable dataset={r.dataset} compact limit={200} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}

/* --- Guía de datos, solo lectura ------------------------------------------------------------ */

function GuiaLectura({ filas, temas, falta, ir }: { filas: ReturnType<typeof useIndicadores>["data"] extends infer T ? (T extends { filas: infer F } ? F : never) : never; temas: { slug: string; nombre: string | null }[]; falta: boolean; ir: (slug: string) => void }) {
  if (falta) return <ReadOnlyNotice>Falta aplicar la migración 0277 para ver la guía de datos.</ReadOnlyNotice>;
  return (
    <section aria-label="Guía de datos">
      <p className="obs-guia-cuenta">
        <span><b>{filas.length}</b> indicadores</span>
        <span data-tone="ok"><b>{filas.filter((i) => i.origen_tipo !== "foto").length}</b> con origen conectado</span>
        <span data-tone="risk"><b>{filas.filter((i) => i.estado === "falta").length}</b> sin archivo</span>
      </p>
      {temas.map((t) => {
        const own = filas.filter((i) => i.tema_slug === t.slug);
        if (!own.length) return null;
        return (
          <div key={t.slug} className="obs-visor__guia">
            <h3>{t.nombre ?? t.slug}</h3>
            <ul className="obs-guia" role="list">
              {own.map((i) => {
                const o = origenVisible(i);
                return (
                  <li key={i.id} className="obs-guia__fila">
                    <button type="button" className="obs-guia__cab" onClick={() => ir(i.tema_slug)}>
                      <span className="obs-guia__nombre">
                        {i.nombre}
                        <small>{i.fuente || "Sin archivo ubicado"}{i.cobertura ? ` · ${i.cobertura}` : ""} · por {i.nivel}</small>
                      </span>
                      <span className="obs-guia__donde">{i.vista ? "Se ve en este observatorio" : "Aún no se muestra"}</span>
                      <span className="oda-badge" data-tone={o.clave === "act" ? "ok" : o.clave === "foto" ? undefined : "warn"}>{o.texto}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
