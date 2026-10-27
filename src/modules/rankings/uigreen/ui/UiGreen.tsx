/* =============================================================================
   UI GreenMetric · la sección de la intranet (prefijo ugm-).

   Vive dentro de Rankings: /admin/rankings/green (Planeación o más) y, para
   quien solo responde o revisa y tiene rol «consulta», /admin/reporte-rankings/green
   (UiGreenMios, protegida como el reporte por oficinas y comprobada con
   ugm_participa en la base). Las vistas se eligen con ?v= y un indicador abierto
   con ?q=1.10; el ciclo, con ?ciclo=.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../../../admin/components/AdminShell";
import { useAuth } from "../../../../lib/auth";
import { useCiclosUgm, useCrearCiclo } from "../datos";
import { Campo, Cargando, Dialogo, ErrorConsulta, Vacio, entrar, mensajeDe } from "./comunes";
import { CabeceraCiclo } from "./Ciclo";
import { UgmProvider, useCargaBase, useUgm } from "./contexto";
import { useParticipa } from "./lectura";
import { Inicio } from "./Inicio";
import { Indicadores } from "./Indicadores";
import { Asignar } from "./Asignar";
import { Captura } from "./Captura";
import { Publicacion } from "./Publicacion";
import { Plantillas } from "./Plantillas";
import { Avisos } from "./Avisos";
import { Mios } from "./Mios";
import "./ugm.css";

const VISTAS_ADMIN = [
  ["inicio", "Inicio del ciclo"],
  ["indicadores", "Indicadores"],
  ["asignar", "Asignación"],
  ["mios", "Mis indicadores"],
  ["publicar", "Publicación"],
  ["plantillas", "Plantillas"],
  ["avisos", "Avisos y bitácora"],
] as const;

export function UiGreen({ resumen, soloMios = false }: { resumen?: ReactNode; soloMios?: boolean }) {
  const [params, setParams] = useSearchParams();
  const ciclos = useCiclosUgm();
  const { hasRole } = useAuth();
  const esAdmin = hasRole("planeacion");

  const elegido = useMemo(() => {
    const lista = ciclos.data ?? [];
    return lista.find((c) => c.id === params.get("ciclo")) ?? lista.find((c) => c.estado === "abierto") ?? lista[0] ?? null;
  }, [ciclos.data, params]);

  const poner = useCallback(
    (cambios: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(cambios)) (v === null ? p.delete(k) : p.set(k, v));
      setParams(p, { replace: false });
    },
    [params, setParams],
  );

  if (ciclos.isLoading) return <Cargando texto="Cargando los ciclos…" />;
  if (ciclos.error) return <ErrorConsulta error={ciclos.error} reintentar={() => void ciclos.refetch()} />;
  if (!elegido) return <SinCiclos esAdmin={esAdmin && !soloMios} />;

  return (
    <div className="ugm">
      <Cuerpo
        key={elegido.id}
        ciclo={elegido}
        ciclos={ciclos.data ?? []}
        soloMios={soloMios || !esAdmin}
        vista={params.get("v") ?? (soloMios || !esAdmin ? "mios" : "inicio")}
        q={params.get("q")}
        resumen={resumen}
        poner={poner}
      />
    </div>
  );
}

function SinCiclos({ esAdmin }: { esAdmin: boolean }) {
  return (
    <div className="ugm">
      <Vacio>{esAdmin ? "Todavía no hay ningún ciclo de UI GreenMetric." : "Todavía no hay un ciclo abierto de UI GreenMetric."}</Vacio>
      {esAdmin && <CrearPrimero />}
    </div>
  );
}

function CrearPrimero() {
  const [params, setParams] = useSearchParams();
  const abierto = params.get("nuevo") === "1";
  return (
    <>
      <button type="button" className="ugm-btn ugm-btn--pri" onClick={() => setParams({ nuevo: "1" })}>
        Crear el primer ciclo
      </button>
      {abierto && <NuevoCicloAislado onCerrar={() => setParams({})} />}
    </>
  );
}

function NuevoCicloAislado({ onCerrar }: { onCerrar: () => void }) {
  const crear = useCrearCiclo();
  const año = new Date().getFullYear();
  const [anio, setAnio] = useState(año + 1);
  const [anioDatos, setAnioDatos] = useState(año);
  const [limite, setLimite] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialogo titulo="Primer ciclo" descripcion="Cada edición reporta los datos del año anterior." onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await crear.mutateAsync({ anio, anioDatos, fechaLimite: limite || null });
            onCerrar();
          } catch (x) {
            setError(mensajeDe(x));
          }
        }}
      >
        <div className="ugm-grid2">
          <Campo id="pc-anio" etiqueta="Edición">
            <input id="pc-anio" className="ugm-input ugm-num" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} autoFocus />
          </Campo>
          <Campo id="pc-datos" etiqueta="Año de los datos">
            <input id="pc-datos" className="ugm-input ugm-num" type="number" value={anioDatos} onChange={(e) => setAnioDatos(Number(e.target.value))} />
          </Campo>
        </div>
        <Campo id="pc-lim" etiqueta="Fecha límite de entrega">
          <input id="pc-lim" className="ugm-input" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} />
        </Campo>
        {error && <p className="ugm-error" role="alert">{error}</p>}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={crear.isPending || anioDatos >= anio}>Crear ciclo</button>
        </footer>
      </form>
    </Dialogo>
  );
}

interface CuerpoProps {
  ciclo: NonNullable<ReturnType<typeof useCiclosUgm>["data"]>[number];
  ciclos: NonNullable<ReturnType<typeof useCiclosUgm>["data"]>;
  soloMios: boolean;
  vista: string;
  q: string | null;
  resumen?: ReactNode;
  poner: (c: Record<string, string | null>) => void;
}

function Cuerpo({ ciclo, ciclos, soloMios, vista, q, resumen, poner }: CuerpoProps) {
  const participa = useParticipa(soloMios ? ciclo.id : undefined);
  const base = useCargaBase(ciclo.id);
  const abrir = useCallback((qq: string | null) => poner({ q: qq }), [poner]);
  // «indicadores&estado=aprobado» abre esa vista ya filtrada.
  const ir = useCallback(
    (v: string) => {
      const [vista, extra] = v.split("&");
      poner({ v: vista, q: null, estado: new URLSearchParams(extra ?? "").get("estado") });
    },
    [poner],
  );

  if (soloMios && participa.isLoading) return <Cargando />;
  if (soloMios && participa.data === false) {
    return <Vacio>No tiene indicadores de UI GreenMetric asignados en este ciclo. Si cree que es un error, escriba a Planeación Institucional.</Vacio>;
  }
  if (base.cargando) return <Cargando texto="Cargando el catálogo y las respuestas…" />;
  if (base.error) return <ErrorConsulta error={base.error} reintentar={base.reintentar} />;

  return (
    <UgmProvider ciclo={ciclo} soloMios={soloMios} abrir={abrir} ir={ir}>
      {!soloMios && <CabeceraCiclo ciclos={ciclos} elegido={ciclo} onElegir={(id) => poner({ ciclo: id, q: null })} />}
      {soloMios && <TituloMios ciclo={ciclo} />}
      {q ? <Captura key={q} q={q} /> : <Vistas vista={soloMios ? "mios" : vista} resumen={resumen} soloMios={soloMios} />}
    </UgmProvider>
  );
}

function TituloMios({ ciclo }: { ciclo: { anio: number; anio_datos: number } }) {
  return (
    <p className="ugm-lead">
      UI GreenMetric, edición {ciclo.anio} (datos {ciclo.anio_datos}). Aquí está lo que le toca responder o revisar.
    </p>
  );
}

function Vistas({ vista, resumen, soloMios }: { vista: string; resumen?: ReactNode; soloMios: boolean }) {
  const u = useUgm();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => entrar(ref.current, ":scope > section, :scope > div"), [vista]);
  const actual = vista === "ranking" && resumen ? "ranking" : VISTAS_ADMIN.some(([k]) => k === vista) ? vista : "mios";
  return (
    <>
      {!soloMios && (
        <nav className="ugm-tabs" aria-label="Vistas de UI GreenMetric">
          {VISTAS_ADMIN.map(([k, et]) => (
            <button key={k} type="button" className="ugm-tab" aria-current={actual === k ? "page" : undefined} onClick={() => u.ir(k)}>
              {et}
            </button>
          ))}
          {resumen && (
            <button type="button" className="ugm-tab" aria-current={actual === "ranking" ? "page" : undefined} onClick={() => u.ir("ranking")}>
              Cifras del ranking
            </button>
          )}
        </nav>
      )}
      <div ref={ref} key={actual} className="ugm-vista">
        {actual === "inicio" && <Inicio />}
        {actual === "indicadores" && <Indicadores />}
        {actual === "asignar" && <Asignar />}
        {actual === "mios" && <Mios />}
        {actual === "publicar" && <Publicacion />}
        {actual === "plantillas" && <Plantillas />}
        {actual === "avisos" && <Avisos />}
        {actual === "ranking" && resumen}
      </div>
    </>
  );
}

/** La entrada de quien responde o revisa con rol «consulta»: /admin/reporte-rankings/green. */
export function UiGreenMios() {
  return (
    <AdminShell section="rankings" kicker="Rankings · UI GreenMetric" title="Mis indicadores de UI GreenMetric" description="Los indicadores que le asignaron para responder o revisar, con su fecha de entrega">
      <div className="rk">
        <UiGreen soloMios />
      </div>
    </AdminShell>
  );
}
