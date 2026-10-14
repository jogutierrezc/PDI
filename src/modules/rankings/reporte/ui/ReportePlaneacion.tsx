/* Espacio de trabajo de Planeación en THE Impact: una franja de resumen y tres vistas. */

import { Suspense, lazy, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaltaMigracion } from "../../noticias";
import { useAsignacionesReporte, useCatalogoReporte, useCicloReporte, useRespuestasReporte, useUnidadesReporte } from "../datos";
import type { RankingResponseRow } from "../../../../types/database";
import { avanceDeUnidad, resumenPorOds, unidadPlaneacion } from "../resumen";
import type { Indicador } from "../tipos";
import { ImportarCatalogo } from "./ImportarCatalogo";
import { ImportarDiligenciado } from "./ImportarDiligenciado";
import { MesaCoordinacion } from "./MesaCoordinacion";
import { ResumenOds } from "./ResumenOds";
import { AvisoMigracion, Barra, Cargando, Vacio, fmtNumero } from "./comunes";
import { useContador, useCrecer, useEntrada, useIndicador } from "../../movimiento";
import "../reporte.css";

// La biblioteca (ZIP, lectores de texto, pdf.js bajo demanda) se carga solo al abrirla.
const Biblioteca = lazy(() => import("../../biblioteca/ui/Biblioteca").then((m) => ({ default: m.Biblioteca })));

type Vista = "resumen" | "mesa" | "biblioteca" | "importar";
type Densidad = "normal" | "compacta";

const VISTAS: readonly Vista[] = ["resumen", "mesa", "biblioteca", "importar"];
const DENSIDADES: readonly Densidad[] = ["normal", "compacta"];
const CLAVE_VISTA = "rk-rep-vista";
const CLAVE_DENSIDAD = "rk-rep-densidad";

/** Lee una preferencia de la sesión del navegador; si no hay almacenamiento, usa el valor por defecto. */
function leerPreferencia<T extends string>(clave: string, validos: readonly T[], defecto: T): T {
  try {
    const guardado = window.localStorage.getItem(clave) as T | null;
    return guardado && validos.includes(guardado) ? guardado : defecto;
  } catch {
    return defecto;
  }
}

function guardarPreferencia(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* Sin almacenamiento (privado o bloqueado): la preferencia dura lo que la pestaña. */
  }
}

export function ReportePlaneacion() {
  const ciclo = useCicloReporte();
  const cicloId = ciclo.data?.id;
  const catalogo = useCatalogoReporte(cicloId);
  const asignaciones = useAsignacionesReporte(cicloId);
  const respuestas = useRespuestasReporte(cicloId);
  const unidades = useUnidadesReporte();
  const [vista, setVistaState] = useState<Vista>(() => leerPreferencia(CLAVE_VISTA, VISTAS, "resumen"));
  const [densidad, setDensidadState] = useState<Densidad>(() => leerPreferencia(CLAVE_DENSIDAD, DENSIDADES, "normal"));
  const [odsMesa, setOdsMesa] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const segVista = useRef<HTMLDivElement>(null);
  const segDensidad = useRef<HTMLDivElement>(null);
  useEntrada(panel, ":scope > *", vista);
  useIndicador(segVista, "[aria-pressed='true']", vista, true);
  useIndicador(segDensidad, "[aria-pressed='true']", densidad, true);

  function setVista(v: Vista) {
    setVistaState(v);
    guardarPreferencia(CLAVE_VISTA, v);
  }

  function setDensidad(d: Densidad) {
    setDensidadState(d);
    guardarPreferencia(CLAVE_DENSIDAD, d);
  }

  const errores = [ciclo.error, catalogo.error, asignaciones.error, respuestas.error, unidades.error].filter((e): e is Error => e instanceof Error);
  const falta = errores.find((e) => e instanceof FaltaMigracion);
  if (falta) {
    return (
      <div className="rk-rep">
        <AvisoMigracion error={falta} />
      </div>
    );
  }

  const c = ciclo.data ?? null;
  const listo = Boolean(c) && catalogo.data !== undefined && asignaciones.data !== undefined && respuestas.data !== undefined && unidades.data !== undefined;

  return (
    <div className="rk-rep rk-ws" data-densidad={densidad}>
      <Franja
        ciclo={c}
        indicadores={catalogo.data}
        respuestas={respuestas.data}
        planeacion={unidadPlaneacion(unidades.data ?? [])?.id ?? null}
        cargando={Boolean(c) && !listo}
      />

      <div className="rk-ws-barra">
        <div className="rk-seg" role="group" aria-label="Vista del reporte" ref={segVista}>
          <span data-indicador aria-hidden="true" />
          <button type="button" aria-pressed={vista === "resumen"} onClick={() => setVista("resumen")}>
            Resumen de ODS
          </button>
          <button type="button" aria-pressed={vista === "mesa"} onClick={() => setVista("mesa")}>
            Mesa de coordinación
          </button>
          <button type="button" aria-pressed={vista === "biblioteca"} onClick={() => setVista("biblioteca")}>
            Biblioteca
          </button>
          <button type="button" aria-pressed={vista === "importar"} onClick={() => setVista("importar")}>
            Importar Excel
          </button>
        </div>
        <div className="rk-seg" role="group" aria-label="Densidad de las filas" ref={segDensidad}>
          <span data-indicador aria-hidden="true" />
          <button type="button" aria-pressed={densidad === "normal"} onClick={() => setDensidad("normal")}>
            Normal
          </button>
          <button type="button" aria-pressed={densidad === "compacta"} onClick={() => setDensidad("compacta")}>
            Compacta
          </button>
        </div>
      </div>

      {ciclo.isPending && <Cargando texto="Leyendo el ciclo…" />}
      {ciclo.error && !falta && (
        <p className="rk-rep-aviso-linea is-risk" role="alert">
          {ciclo.error.message}
        </p>
      )}

      <div className="rk-ws-panel" ref={panel}>
        {vista === "resumen" && (
          <>
            {!ciclo.isPending && !c && (
              <Vacio>Aún no hay ciclo de THE Impact. En «Importar Excel» cargue el archivo de THE para abrir el reporte de este año.</Vacio>
            )}
            {c && !listo && <Cargando texto="Cargando el catálogo y las asignaciones…" />}
            {c && listo && (
              <ResumenOds
                prioridades={c.ods_priorizados}
                indicadores={catalogo.data ?? []}
                respuestas={respuestas.data ?? []}
                onVerOds={(n) => {
                  setOdsMesa(n);
                  setVista("mesa");
                }}
              />
            )}
          </>
        )}

        {vista === "mesa" && (
          <>
            {!c && !ciclo.isPending && <Vacio>Sin ciclo abierto: importe primero el Excel de THE.</Vacio>}
            {c && !listo && <Cargando texto="Cargando la mesa…" />}
            {c && listo && (
              <MesaCoordinacion
                key={`${c.id}-${odsMesa ?? "todos"}`}
                ciclo={c}
                indicadores={catalogo.data ?? []}
                asignaciones={asignaciones.data ?? []}
                respuestas={respuestas.data ?? []}
                unidades={unidades.data ?? []}
                odsInicial={odsMesa}
              />
            )}
          </>
        )}

        {vista === "biblioteca" && (
          <Suspense fallback={<Cargando texto="Abriendo la biblioteca…" />}>
            <Biblioteca ciclo={c} indicadores={catalogo.data ?? []} unidades={unidades.data ?? []} />
          </Suspense>
        )}

        {vista === "importar" && (
          <div className="rk-rep-stack">
            <ImportarCatalogo ciclo={c} />
            <ImportarDiligenciado ciclo={c} indicadores={catalogo.data ?? []} respuestas={respuestas.data ?? []} unidades={unidades.data ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}

interface FranjaProps {
  ciclo: { anio: number; anio_datos: number; ods_priorizados: number[]; fecha_limite: string | null } | null;
  indicadores: Indicador[] | undefined;
  respuestas: RankingResponseRow[] | undefined;
  /** Oficina «Planeación Institucional», para contar lo que reporta ella misma. */
  planeacion: string | null;
  cargando: boolean;
}

/** Franja de resumen: ciclo, avance general con contador, priorizados y accesos a lo que se trabaja fuera de esta página. */
function Franja({ ciclo, indicadores, respuestas, planeacion, cargando }: FranjaProps) {
  const porOds = indicadores && respuestas ? resumenPorOds(indicadores, respuestas) : [];
  const total = porOds.reduce((s, f) => s + f.total, 0);
  const aprobados = porOds.reduce((s, f) => s + f.ok, 0);
  const enviados = porOds.reduce((s, f) => s + f.sent, 0);
  const priorizados = ciclo?.ods_priorizados ?? [];
  const totalPri = porOds.filter((f) => priorizados.includes(f.ods)).reduce((s, f) => s + f.total, 0);
  const okPri = porOds.filter((f) => priorizados.includes(f.ods)).reduce((s, f) => s + f.ok, 0);
  const avance = total ? aprobados / total : 0;
  const propio = planeacion && indicadores && respuestas ? avanceDeUnidad(planeacion, indicadores, respuestas) : null;
  const cierre = ciclo?.fecha_limite ? new Date(`${ciclo.fecha_limite}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : null;
  const ref = useRef<HTMLElement>(null);
  const pct = useRef<HTMLElement>(null);
  const ok = useRef<HTMLElement>(null);
  useContador(pct, Math.round(avance * 100), (v) => `${Math.round(v)} %`);
  useContador(ok, aprobados, (v) => fmtNumero(Math.round(v), 0));
  useCrecer(ref, ".rk-rep-barra > i", { clave: total });

  return (
    <section className="rk-ws-franja" aria-label="Estado del ciclo" aria-busy={cargando || undefined} ref={ref}>
      <div className="rk-ws-dato">
        <span>Ciclo</span>
        <b className="rk-rep-num">{ciclo?.anio ?? "—"}</b>
        <small>datos {ciclo?.anio_datos ?? "—"}{cierre ? ` · cierre ${cierre}` : ""}</small>
      </div>

      <div className="rk-ws-dato rk-ws-avance">
        <span>Indicadores aprobados</span>
        {ciclo ? (
          <>
            <b className="rk-rep-num">
              <span ref={ok}>{fmtNumero(aprobados, 0)}</span> <small>de {fmtNumero(total, 0)}</small>
            </b>
            <Barra valor={avance} etiqueta="Indicadores aprobados" />
            <small className="rk-rep-num" ref={pct}>
              {Math.round(avance * 100)} %
            </small>
          </>
        ) : (
          <b>Sin ciclo</b>
        )}
      </div>

      <div className="rk-ws-dato">
        <span>Por revisar</span>
        <b className="rk-rep-num">{ciclo ? fmtNumero(enviados, 0) : "—"}</b>
        <small>enviados por las oficinas</small>
      </div>

      <div className="rk-ws-dato">
        <span>Reportado por Planeación</span>
        <b className="rk-rep-num">{propio ? fmtNumero(propio.reportados, 0) : "—"}</b>
        <small>{propio ? `${fmtNumero(propio.aprobados, 0)} aprobados · ${fmtNumero(propio.oficiales, 0)} oficiales` : "sin oficina de Planeación"}</small>
      </div>

      <div className="rk-ws-dato">
        <span>ODS {priorizados.join(" · ") || "—"}</span>
        <b className="rk-rep-num">{ciclo ? `${fmtNumero(okPri, 0)} de ${fmtNumero(totalPri, 0)}` : "—"}</b>
        <small>priorizados aprobados</small>
      </div>

      <nav className="rk-ws-accesos" aria-label="Accesos del ranking">
        <Link className="rk-rep-btn is-sm is-ghost" to="/admin/rankings/noticias">
          Noticias
        </Link>
        <Link className="rk-rep-btn is-sm is-ghost" to="/admin/rankings/informes">
          Redactar informes con Pilo
        </Link>
        <Link className="rk-rep-btn is-sm is-ghost" to="/admin/rankings/posicion">
          Posicionamiento
        </Link>
        <Link className="rk-rep-btn is-sm is-ghost" to="/admin/reporte-rankings">
          Formulario de una oficina
        </Link>
      </nav>
    </section>
  );
}
