/* =============================================================================
   Warehouse UDES · la pantalla de la intranet.

   Una sola ruta: /admin/warehouse/:seccion?
     (tablero)  qué hay guardado por periodo, sede y corte
     catalogo   los conjuntos de Master, Galileo y Davinci y qué se guarda de cada uno
     cargas     cargar un reporte (Excel o desde Master) y el historial
     explorar   gráficos y tabla de lo guardado
     alertas    alertas tempranas por grupo y por estudiante
     almacen    capas, periodos cerrados y política de privacidad
   El periodo y la sede van en la dirección (?periodo=2026b&sede=buc) para que
   un enlace lleve al mismo sitio.
   ========================================================================== */

import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { periodosDisponibles, SEDES } from "./conjuntos";
import { useCobertura, usePermisosWarehouse } from "./store";
import { Tablero } from "./Tablero";
import { Catalogo } from "./Catalogo";
import { Cargas } from "./Cargas";
import { Explorar } from "./Explorar";
import { Alertas } from "./Alertas";
import { Almacen } from "./Almacen";
import "./warehouse.css";

export type Seccion = "tablero" | "catalogo" | "cargas" | "explorar" | "alertas" | "almacen";
const SECCIONES: { id: Seccion; nombre: string; descripcion: string }[] = [
  { id: "tablero", nombre: "Tablero", descripcion: "Qué hay guardado por periodo, sede y corte" },
  { id: "catalogo", nombre: "Catálogo", descripcion: "Los reportes de Master, Galileo y Davinci y qué se guarda de cada uno" },
  { id: "cargas", nombre: "Cargas", descripcion: "Cargar un reporte, traerlo de Master y revisar el historial" },
  { id: "explorar", nombre: "Explorar", descripcion: "Gráficos y tabla de lo guardado" },
  { id: "alertas", nombre: "Alertas tempranas", descripcion: "Grupos y estudiantes con señales de riesgo académico" },
  { id: "almacen", nombre: "Almacén", descripcion: "Capas, periodos cerrados y política de privacidad" },
];
const BASE = "/admin/warehouse";

/** Lo que cada sección recibe: el periodo y la sede que la persona eligió arriba. */
export interface Contexto {
  periodo: string;
  sede: string;
  /** Cambia de sección conservando periodo y sede, y opcionalmente fija parámetros (conjunto, corte…). */
  ir: (seccion: Seccion, extra?: Record<string, string>) => void;
  params: URLSearchParams;
}

export function Warehouse() {
  const { seccion: seccionParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const permisos = usePermisosWarehouse();
  const cobertura = useCobertura();

  const periodos = useMemo(() => periodosDisponibles(), []);
  const periodo = periodos.includes(params.get("periodo") ?? "") ? (params.get("periodo") as string) : periodos[0];
  const sede = SEDES.some((s) => s.id === params.get("sede")) ? (params.get("sede") as string) : SEDES[0].id;
  const seccion = SECCIONES.find((s) => s.id === seccionParam)?.id ?? "tablero";
  const actual = SECCIONES.find((s) => s.id === seccion)!;

  const cambiar = (clave: string, valor: string, porDefecto: string) => {
    const siguiente = new URLSearchParams(params);
    if (valor === porDefecto) siguiente.delete(clave);
    else siguiente.set(clave, valor);
    setParams(siguiente, { replace: true });
  };

  const contexto: Contexto = {
    periodo,
    sede,
    params,
    ir: (destino, extra = {}) => {
      const siguiente = new URLSearchParams();
      if (periodo !== periodos[0]) siguiente.set("periodo", periodo);
      if (sede !== SEDES[0].id) siguiente.set("sede", sede);
      for (const [k, v] of Object.entries(extra)) siguiente.set(k, v);
      navigate({ pathname: destino === "tablero" ? BASE : `${BASE}/${destino}`, search: siguiente.toString() });
    },
  };

  const selectores = (
    <div className="wh-fila">
      <label className="wh-campo">
        <span className="sr-only">Periodo</span>
        <Icon name="clock" size={15} />
        <select value={periodo} onChange={(e) => cambiar("periodo", e.target.value, periodos[0])}>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="wh-campo">
        <span className="sr-only">Sede</span>
        <Icon name="pin" size={15} />
        <select value={sede} onChange={(e) => cambiar("sede", e.target.value, SEDES[0].id)}>
          {SEDES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const rail = (
    <AdminRail label="Secciones del Warehouse">
      {SECCIONES.map((s) => (
        <AdminRailTab key={s.id} current={seccion === s.id} onSelect={() => contexto.ir(s.id)}>
          {s.nombre}
        </AdminRailTab>
      ))}
    </AdminRail>
  );

  let cuerpo;
  if (!permisos.ver) {
    cuerpo = <EmptyBlock title="Sin acceso al Warehouse" hint="Los datos de las plataformas institucionales son de Planeación. Pida acceso a la administración." />;
  } else if (cobertura.isPending) {
    cuerpo = <LoadingBlock rows={6} label="Cargando el almacén" />;
  } else if (cobertura.error) {
    const falta = /does not exist|v_wh_cobertura|schema cache/i.test(String(cobertura.error));
    cuerpo = (
      <ErrorBlock
        error={falta ? new Error("Falta aplicar la migración 0155 (Warehouse UDES) en la base de datos.") : cobertura.error}
        title="No se pudo abrir el almacén"
        onRetry={() => void cobertura.refetch()}
      />
    );
  } else {
    const datos = cobertura.data;
    cuerpo = (
      <div className="wh">
        {seccion === "tablero" && <Tablero ctx={contexto} cobertura={datos} periodos={periodos} />}
        {seccion === "catalogo" && <Catalogo ctx={contexto} cobertura={datos} />}
        {seccion === "cargas" && <Cargas ctx={contexto} cobertura={datos} />}
        {seccion === "explorar" && <Explorar ctx={contexto} cobertura={datos} />}
        {seccion === "alertas" && <Alertas ctx={contexto} cobertura={datos} />}
        {seccion === "almacen" && <Almacen ctx={contexto} cobertura={datos} permisos={permisos} />}
      </div>
    );
  }

  return (
    <AdminShell section="warehouse" kicker="Warehouse UDES" title={actual.nombre} description={actual.descripcion} actions={permisos.ver ? selectores : undefined} rail={permisos.ver ? rail : undefined}>
      {cuerpo}
    </AdminShell>
  );
}
