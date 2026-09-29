/* =============================================================================
   Reportes Institucionales · la pantalla de la intranet.

   Una sola ruta: /admin/reportes-institucionales/:seccion?/:plantilla?
     snies       (por defecto) el tablero del periodo y la plantilla abierta;
                 la hoja, solo con permisos.capturar (datos personales)
     catalogos   nombres ↔ códigos oficiales (solo con permisos.catalogos)
     cna         en borrador (solo con permisos.cna)
   El periodo va en la dirección (?periodo=2026-1) para que un enlace lleve al
   mismo sitio; por defecto, el semestre en curso.
   Adentro se trabaja con nombres; los códigos solo salen en el archivo para
   HECAA.
   ========================================================================== */

import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { PLANTILLAS } from "./snies/plantillas";
import { useCatalogos, useEntregas, usePermisosReportes } from "./store";
import type { PlantillaId, PlantillaSpec } from "./tipos";
import { Tablero } from "./Tablero";
import { Plantilla } from "./Plantilla";
import { Catalogos } from "./Catalogos";
import { Cna } from "./Cna";
import { fechaCorte, formatoFecha, periodoDe, periodosRecientes } from "./util";
import "./reportes.css";

type Seccion = "snies" | "catalogos" | "cna";
const BASE = "/admin/reportes-institucionales";

export function ReportesInstitucionales() {
  const { seccion: seccionParam, plantilla: plantillaParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const permisos = usePermisosReportes();

  const periodos = useMemo(() => periodosRecientes(), []);
  const periodo = periodos.includes(params.get("periodo") ?? "") ? (params.get("periodo") as string) : periodos[0];

  const secciones: Seccion[] = ["snies", ...(permisos.catalogos ? (["catalogos"] as const) : []), ...(permisos.cna ? (["cna"] as const) : [])];
  const seccion: Seccion = secciones.includes(seccionParam as Seccion) ? (seccionParam as Seccion) : "snies";
  const spec: PlantillaSpec =
    PLANTILLAS.find((p) => p.id === plantillaParam) ?? PLANTILLAS.find((p) => p.id === "matriculados") ?? PLANTILLAS[0];

  const entregas = useEntregas(periodo);
  const catalogos = useCatalogos();

  const ir = (s: Seccion, id?: PlantillaId) => {
    const ruta = s === "snies" ? `${BASE}/snies/${id ?? spec.id}` : `${BASE}/${s}`;
    navigate({ pathname: ruta, search: params.toString() });
  };

  const titulo = seccion === "catalogos" ? "Catálogos" : seccion === "cna" ? "CNA" : spec.nombre;
  const descripcion =
    seccion === "catalogos"
      ? "Los nombres que se ven en las hojas y su código oficial para HECAA"
      : seccion === "cna"
        ? "Acreditación · en borrador"
        : `SNIES · ${spec.modulo} · ${spec.seccion}`;

  const rail =
    secciones.length > 1 ? (
      <AdminRail label="Secciones de Reportes Institucionales">
        <AdminRailTab current={seccion === "snies"} onSelect={() => ir("snies")}>
          SNIES
        </AdminRailTab>
        {permisos.catalogos && (
          <AdminRailTab current={seccion === "catalogos"} onSelect={() => ir("catalogos")}>
            Catálogos
          </AdminRailTab>
        )}
        {permisos.cna && (
          <AdminRailTab current={seccion === "cna"} onSelect={() => ir("cna")}>
            CNA <span className="ri-pill">Borrador</span>
          </AdminRailTab>
        )}
      </AdminRail>
    ) : undefined;

  const selector =
    seccion !== "cna" ? (
      <label className="ri-periodo">
        <span className="sr-only">Periodo</span>
        <Icon name="clock" size={15} />
        <select
          value={periodo}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value === periodos[0]) next.delete("periodo");
            else next.set("periodo", e.target.value);
            setParams(next, { replace: true });
          }}
        >
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  let cuerpo;
  if (!permisos.ver) {
    cuerpo = (
      <EmptyBlock
        title="Sin acceso a Reportes Institucionales"
        hint="Pida a la administración que le asigne la captura de reportes en Usuarios y roles."
      />
    );
  } else if (seccion === "catalogos") {
    cuerpo = <Catalogos periodo={periodo} />;
  } else if (seccion === "cna") {
    cuerpo = <Cna />;
  } else {
    cuerpo = (
      <div className="ri ri-layout">
        <aside className="ri-side">
          {entregas.error ? (
            <ErrorBlock error={entregas.error} title="No se pudo cargar el tablero" onRetry={() => void entregas.refetch()} />
          ) : (
            <Tablero periodo={periodo} entregas={entregas.data} actual={spec.id} onElegir={(id) => ir("snies", id)} />
          )}
        </aside>
        <section className="ri-main" aria-label={spec.nombre}>
          {!spec.disponible ? (
            <Proximamente spec={spec} periodo={periodo} onVolver={() => ir("snies", "matriculados")} />
          ) : !permisos.capturar ? (
            // Las filas tienen datos personales (0104): Consulta ve el tablero, no las hojas.
            <EmptyBlock
              title="Los datos de las plantillas solo los ven quienes las capturan."
              hint="El tablero muestra el estado y las fechas de cada plantilla del periodo."
            />
          ) : catalogos.isPending ? (
            <LoadingBlock rows={6} label="Cargando los catálogos" />
          ) : catalogos.error ? (
            <ErrorBlock error={catalogos.error} onRetry={() => void catalogos.refetch()} />
          ) : (
            <Plantilla key={`${spec.id}|${periodo}`} spec={spec} periodo={periodo} permisos={permisos} catalogos={catalogos.data} />
          )}
        </section>
      </div>
    );
  }

  return (
    <AdminShell section="reportes" kicker="Reportes Institucionales" title={titulo} description={descripcion} actions={selector} rail={rail}>
      {seccion === "snies" || !permisos.ver ? cuerpo : <div className="ri">{cuerpo}</div>}
    </AdminShell>
  );
}

function Proximamente({ spec, periodo, onVolver }: { spec: PlantillaSpec; periodo: string; onVolver: () => void }) {
  const p = periodoDe(periodo);
  const f = spec.fechas[p.semestre];
  const fecha = (c: typeof f.primerCorte) => (c ? formatoFecha(fechaCorte(c, p)) : "sin fecha");
  return (
    <section className="ri-draft">
      <span className="ri-pill">Próximamente</span>
      <h3>{spec.nombre}</h3>
      <p>
        Usará la misma hoja, formulario e importador que las demás plantillas, con sus propias columnas y reglas ({spec.seccion}) y
        los mismos catálogos de nombres. Primer corte: {fecha(f.primerCorte)}; definitiva: {fecha(f.definitiva)}.
      </p>
      <div>
        <button type="button" className="button-secondary ri-sm" onClick={onVolver}>
          Volver a Matriculados
        </button>
      </div>
    </section>
  );
}
