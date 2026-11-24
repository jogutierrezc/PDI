/* =============================================================================
   THE Impact · la sección de la intranet con la misma estructura que UI GreenMetric
   (prefijo thi-, estilos ugm- compartidos). Vive en /admin/rankings/impact (Planeación
   o más). Las vistas se eligen con ?v=, un indicador abierto con ?q=4.3.1, el ciclo con
   ?ciclo= y un ODS con ?ods=. Quien solo responde entra por el reporte de su oficina
   (/admin/reporte-rankings), que es la misma base de datos y el mismo flujo.

   Qué vive aquí y qué ya existía:
     · Inicio del ciclo, Publicación, Plantillas, Avisos y bitácora, Fechas y avisos y Nuevo
       ciclo son nuevos (migraciones 0237 a 0241).
     · Indicadores, Asignación, Mis indicadores, Cifras del ranking y Biblioteca reúnen lo
       que ya había en el reporte por oficinas (catálogo, mesa de coordinación, formulario,
       resumen por ODS y biblioteca de evidencias), sin cambiar su comportamiento.
   ========================================================================== */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FaltaMigracion } from "../../noticias";
import { elegirCiclo, useCiclosReporte } from "../../reporte/datos";
import { ImportarCatalogo } from "../../reporte/ui/ImportarCatalogo";
import { ResumenOds } from "../../reporte/ui/ResumenOds";
import { Cargando as CargandoRep } from "../../reporte/ui/comunes";
import { Alerta, Cargando, ErrorConsulta, Vacio, entrar } from "../../uigreen/ui/comunes";
import { useAuth } from "../../../../lib/auth";
import { METODOLOGIA } from "../lib/metodologia";
import { Asignacion } from "./Asignacion";
import { Avisos } from "./Avisos";
import { CabeceraCiclo, NuevoCiclo } from "./Cabecera";
import { ThProvider, useCargaBase, useThi } from "./contexto";
import { Entrega } from "./Entrega";
import { Indicadores } from "./Indicadores";
import { Inicio } from "./Inicio";
import { Mios } from "./Mios";
import { Plantillas } from "./Plantillas";
import "../../uigreen/ui/ugm.css";
import "../../reporte/reporte.css";
import "./thi.css";

// La biblioteca (ZIP, lectores de texto, pdf.js bajo demanda) se carga solo al abrirla.
const Biblioteca = lazy(() => import("../../biblioteca/ui/Biblioteca").then((m) => ({ default: m.Biblioteca })));

const VISTAS = [
  ["inicio", "Inicio del ciclo"],
  ["indicadores", "Indicadores"],
  ["asignar", "Asignación"],
  ["mios", "Mis indicadores"],
  ["publicar", "Publicación"],
  ["plantillas", "Plantillas"],
  ["avisos", "Avisos y bitácora"],
  ["ranking", "Cifras del ranking"],
  ["biblioteca", "Biblioteca"],
] as const;

export function ThImpact({ resumen }: { resumen?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const ciclos = useCiclosReporte();
  const { hasRole } = useAuth();
  const esAdmin = hasRole("planeacion");
  const lista = useMemo(() => ciclos.data ?? [], [ciclos.data]);
  const elegido = useMemo(() => elegirCiclo(lista, params.get("ciclo")), [lista, params]);

  const poner = useCallback(
    (cambios: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(cambios)) (v === null ? p.delete(k) : p.set(k, v));
      setParams(p, { replace: false });
    },
    [params, setParams],
  );

  if (ciclos.isLoading) return <Cargando texto="Cargando los ciclos de THE Impact…" />;
  if (ciclos.error) return <ErrorConsulta error={ciclos.error} reintentar={() => void ciclos.refetch()} />;
  if (!elegido) return <SinCiclos esAdmin={esAdmin} onCreado={(id) => poner({ ciclo: id })} />;

  return (
    <div className="ugm thi">
      <Cuerpo
        key={elegido.id}
        ciclo={elegido}
        ciclos={lista}
        vista={params.get("v") ?? "inicio"}
        q={params.get("q")}
        ods={Number(params.get("ods")) || null}
        resumen={resumen}
        poner={poner}
      />
    </div>
  );
}

function SinCiclos({ esAdmin, onCreado }: { esAdmin: boolean; onCreado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="ugm thi">
      <Vacio>
        {esAdmin
          ? `Todavía no hay ningún ciclo de THE Impact. Cree el de la edición ${METODOLOGIA.edicion} (datos del año académico ${METODOLOGIA.anioDatos}) o importe el Excel de THE, que también lo crea.`
          : "Todavía no hay un ciclo de THE Impact abierto."}
      </Vacio>
      {esAdmin && (
        <>
          <div className="ugm-acciones">
            <button type="button" className="ugm-btn ugm-btn--pri" onClick={() => setAbierto(true)}>
              Crear el ciclo {METODOLOGIA.edicion}
            </button>
          </div>
          <div className="rk-rep">
            <ImportarCatalogo ciclo={null} />
          </div>
          {abierto && <NuevoCiclo ciclos={[]} onCerrar={() => setAbierto(false)} onCreado={onCreado} />}
        </>
      )}
    </div>
  );
}

interface CuerpoProps {
  ciclo: NonNullable<ReturnType<typeof elegirCiclo>>;
  ciclos: NonNullable<ReturnType<typeof elegirCiclo>>[];
  vista: string;
  q: string | null;
  ods: number | null;
  resumen?: ReactNode;
  poner: (c: Record<string, string | null>) => void;
}

function Cuerpo({ ciclo, ciclos, vista, q, ods, resumen, poner }: CuerpoProps) {
  const base = useCargaBase(ciclo.id);
  const abrir = useCallback((qq: string | null) => poner({ v: qq ? "indicadores" : null, q: qq }), [poner]);
  // «indicadores&ods=4» abre esa vista ya filtrada.
  const ir = useCallback(
    (v: string) => {
      const [vv, extra] = v.split("&");
      poner({ v: vv === "inicio" ? null : vv, q: null, ods: new URLSearchParams(extra ?? "").get("ods") });
    },
    [poner],
  );
  const elegirOtro = useCallback((id: string) => poner({ ciclo: id, q: null }), [poner]);

  if (base.cargando) return <Cargando texto="Cargando el catálogo, las asignaciones y las respuestas…" />;
  if (base.error) {
    return base.error instanceof FaltaMigracion ? (
      <Alerta tipo="aviso">{base.error.message} Los requisitos de la metodología y la configuración del ciclo vienen en 0237 y 0238; el resto del reporte es de 0149.</Alerta>
    ) : (
      <ErrorConsulta error={base.error} reintentar={base.reintentar} />
    );
  }

  return (
    <ThProvider ciclo={ciclo} ciclos={ciclos} abrir={abrir} ir={ir} elegirCiclo={elegirOtro}>
      <CabeceraCiclo />
      <Vistas vista={vista} q={q} ods={ods} resumen={resumen} />
    </ThProvider>
  );
}

function Vistas({ vista, q, ods, resumen }: { vista: string; q: string | null; ods: number | null; resumen?: ReactNode }) {
  const t = useThi();
  const ref = useRef<HTMLDivElement>(null);
  const actual = VISTAS.some(([k]) => k === vista) ? vista : "inicio";
  useEffect(() => entrar(ref.current, ":scope > section, :scope > div"), [actual, q]);
  return (
    <>
      <nav className="ugm-tabs" aria-label="Vistas de THE Impact">
        {VISTAS.map(([k, et]) => (
          <button key={k} type="button" className="ugm-tab" aria-current={actual === k ? "page" : undefined} onClick={() => t.ir(k)}>
            {et}
          </button>
        ))}
      </nav>
      <div ref={ref} key={`${actual}-${q ?? ""}`} className="ugm-vista">
        {actual === "inicio" && <Inicio />}
        {actual === "indicadores" && <Indicadores q={q} odsInicial={ods} />}
        {actual === "asignar" && <Asignacion odsInicial={ods} />}
        {actual === "mios" && <Mios />}
        {actual === "publicar" && <Entrega />}
        {actual === "plantillas" && <Plantillas />}
        {actual === "avisos" && <Avisos />}
        {actual === "ranking" && <Cifras resumen={resumen} />}
        {actual === "biblioteca" && (
          <div className="rk-rep">
            <Suspense fallback={<CargandoRep texto="Abriendo la biblioteca…" />}>
              <Biblioteca ciclo={t.ciclo} indicadores={t.indicadores} unidades={t.unidades} />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}

/** Cifras del ranking: el avance por ODS del reporte y, debajo, lo que ya existía (cifras de THE, categorías y accesos). */
function Cifras({ resumen }: { resumen?: ReactNode }) {
  const t = useThi();
  return (
    <div className="ugm-pila">
      <section className="ugm-sec">
        <h2>Avance por ODS</h2>
        <div className="rk-rep">
          <ResumenOds
            prioridades={t.ciclo.ods_priorizados}
            indicadores={t.indicadores}
            respuestas={t.respuestas}
            onVerOds={(n) => t.ir(`indicadores&ods=${n}`)}
          />
        </div>
      </section>
      {resumen && <section className="ugm-sec">{resumen}</section>}
    </div>
  );
}
