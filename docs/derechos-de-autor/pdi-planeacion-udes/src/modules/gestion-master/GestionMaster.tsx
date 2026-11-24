/* =============================================================================
   Gestión Master · la pantalla de la intranet (carpeta «Gestión Master» ›
   «Gestión de Actividades»).

   Una sola ruta: /admin/gestion-master/:seccion?/:id?
     bandeja       solicitudes: revisar, decidir y seguir (:id abre el detalle)
     nueva         el formulario: Nuevo · Mejorar o mantener · Eliminar (:id edita un borrador o una devuelta)
     estructura    el catálogo del Master por periodo y sede
     periodo       profesores, horas y promedio por actividad
     seguimiento   vencimientos, línea de tiempo y cuellos de botella
     flujos        los pasos de aprobación (configurables)
     conexion      Warehouse: lo leído, lo por reflejar y el corte
     rua           el histórico de Rua, solo lectura
   El periodo y la sede van en la dirección (?periodo=2026b&sede=buc).

   El acceso lo da el rol de acceso (gm_nivel), nunca la capacidad global; la base
   lo hace cumplir en cada función (migración 0194).
   ========================================================================== */

import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useLista, useMiNivel } from "./api";
import { Bandeja } from "./Bandeja";
import { Conexion } from "./Conexion";
import type { Contexto, Seccion } from "./contexto";
import { Estructura } from "./Estructura";
import { Flujos } from "./Flujos";
import { Formulario } from "./Formulario";
import { SEDES, nombrePeriodo, periodosLista } from "./modelo";
import { Periodo } from "./Periodo";
import { Rua } from "./Rua";
import { Seguimiento } from "./Seguimiento";
import "./gestion-master.css";

const BASE = "/admin/gestion-master";

const SECCIONES: { id: Seccion; nombre: string; descripcion: string; unaSede?: boolean }[] = [
  { id: "bandeja", nombre: "Bandeja de solicitudes", descripcion: "Revise, apruebe, devuelva con nota o rechace, una por una o por lote" },
  { id: "nueva", nombre: "Nueva solicitud", descripcion: "Nuevo, mejorar o mantener, o eliminar, con los datos reales del código desde el Warehouse", unaSede: true },
  { id: "estructura", nombre: "Estructura de actividades", descripcion: "El catálogo del Master por periodo y sede, y su comparación entre periodos", unaSede: true },
  { id: "periodo", nombre: "Actividades del periodo", descripcion: "Cuántos profesores, horas y promedio tiene cada actividad, por programa y por docente", unaSede: true },
  { id: "seguimiento", nombre: "Seguimiento", descripcion: "Vencimientos, línea de tiempo de cada solicitud y dónde se demora el flujo" },
  { id: "flujos", nombre: "Flujos de aprobación", descripcion: "Quién aprueba y en qué orden: configurable" },
  { id: "conexion", nombre: "Conexión con el Warehouse", descripcion: "Lo capturado del Master, lo que falta aplicar y el cierre del corte", unaSede: true },
  { id: "rua", nombre: "Histórico de Rua", descripcion: "Las solicitudes que se tramitaron en Rua, solo para consultar" },
];

export function GestionMaster() {
  const { seccion: seccionParam, id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const nivel = useMiNivel();

  const periodos = useMemo(() => periodosLista(), []);
  const periodo = periodos.includes(params.get("periodo") ?? "") ? (params.get("periodo") as string) : periodos[0];
  const sedeParam = params.get("sede") ?? "";
  const sede = sedeParam === "todas" || SEDES.some((s) => s.id === sedeParam) ? sedeParam : "buc";
  const seccion = SECCIONES.find((s) => s.id === seccionParam)?.id ?? "bandeja";
  const actual = SECCIONES.find((s) => s.id === seccion)!;
  const lista = useLista(periodo, sede, nivel.data?.nivel !== undefined && nivel.data.nivel !== "none");
  const mias = (lista.data ?? []).filter((s) => s.puedo_decidir).length;

  const cambiar = (clave: string, valor: string, porDefecto: string) => {
    const siguiente = new URLSearchParams(params);
    if (valor === porDefecto) siguiente.delete(clave);
    else siguiente.set(clave, valor);
    setParams(siguiente, { replace: true });
  };

  const ctx: Contexto = {
    periodo,
    sede,
    nivel: nivel.data?.nivel ?? "none",
    funcion: nivel.data?.funcion ?? null,
    periodos,
    ir: (destino, destinoId, extra = {}) => {
      const siguiente = new URLSearchParams();
      if (periodo !== periodos[0]) siguiente.set("periodo", periodo);
      if (sede !== "buc") siguiente.set("sede", sede);
      for (const [k, v] of Object.entries(extra)) siguiente.set(k, v);
      navigate({ pathname: `${BASE}/${destino}${destinoId ? `/${destinoId}` : ""}`, search: siguiente.toString() });
    },
  };

  const selectores = (
    <div className="gm-selectores">
      <label className="gm-campo">
        <span className="sr-only">Periodo</span>
        <Icon name="clock" size={15} />
        <select value={periodo} onChange={(e) => cambiar("periodo", e.target.value, periodos[0])}>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {nombrePeriodo(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="gm-campo">
        <span className="sr-only">Sede</span>
        <Icon name="pin" size={15} />
        <select value={sede} onChange={(e) => cambiar("sede", e.target.value, "buc")}>
          <option value="todas">Todas las sedes</option>
          {SEDES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
      {ctx.nivel !== "none" && seccion !== "nueva" && (
        <button type="button" className="button-primary" onClick={() => ctx.ir("nueva")}>
          Nueva solicitud
        </button>
      )}
    </div>
  );

  const rail = (
    <AdminRail label="Secciones de Gestión Master">
      {SECCIONES.map((s) => (
        <AdminRailTab key={s.id} current={seccion === s.id} count={s.id === "bandeja" ? mias : undefined} onSelect={() => ctx.ir(s.id)}>
          {s.nombre}
        </AdminRailTab>
      ))}
    </AdminRail>
  );

  let cuerpo;
  if (nivel.isPending) {
    cuerpo = <LoadingBlock rows={4} label="Comprobando su acceso a Gestión Master" />;
  } else if (nivel.error) {
    cuerpo = <EmptyBlock title="Gestión Master no está lista" hint="Falta aplicar la migración 0194 en la base de datos, o no se pudo comprobar su acceso." />;
  } else if (ctx.nivel === "none") {
    cuerpo = <EmptyBlock title="Sin acceso a Gestión Master" hint="El acceso lo da el rol de acceso (Usuarios y roles › Gestión Master). Pídaselo a la administración." />;
  } else {
    cuerpo = (
      <div className="gm">
        {actual.unaSede && sede === "todas" && <p className="gm-nota">Esta sección trabaja con una sola sede: se muestra Bucaramanga. Elija otra arriba.</p>}
        {seccion === "bandeja" && <Bandeja ctx={ctx} id={id} />}
        {seccion === "nueva" && <Formulario key={id ?? "nueva"} ctx={ctx} id={id} />}
        {seccion === "estructura" && <Estructura ctx={ctx} />}
        {seccion === "periodo" && <Periodo ctx={ctx} />}
        {seccion === "seguimiento" && <Seguimiento ctx={ctx} />}
        {seccion === "flujos" && <Flujos ctx={ctx} />}
        {seccion === "conexion" && <Conexion ctx={ctx} />}
        {seccion === "rua" && <Rua ctx={ctx} />}
      </div>
    );
  }

  return (
    <AdminShell section="gestion_master" kicker="Gestión Master · Gestión de Actividades" title={actual.nombre} description={actual.descripcion} actions={ctx.nivel !== "none" ? selectores : undefined} rail={ctx.nivel !== "none" ? rail : undefined}>
      {cuerpo}
    </AdminShell>
  );
}
