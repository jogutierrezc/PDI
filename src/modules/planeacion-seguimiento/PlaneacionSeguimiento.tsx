/* =============================================================================
   Planeación y Seguimiento · la pantalla de la intranet (carpeta «Planeación y
   Seguimiento», una sola pantalla con sus secciones).

   Una sola ruta: /admin/planeacion-seguimiento/:seccion?/:id?
     resumen · proyectos (:id abre la línea a pantalla completa) · cronograma · calidad
     versiones · roles · cargar (asistente) · crear (asistente) · publicar/:id · comparar

   El acceso lo da el rol de acceso (ps_nivel), nunca la capacidad global; la base lo
   hace cumplir en cada función (migración 0286, docs/planeacion-seguimiento/CONTRATO-BD.md).
   Sin ventanas emergentes: todo detalle, formulario o confirmación importante es una
   página con «Regresar» (marco/PaginaCompleta).
   ========================================================================== */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { EmptyBlock, LoadingBlock } from "../../components/ui/QueryState";
import { Icon } from "../../components/ui/Icon";
import { Asignar } from "./actividades/Asignar";
import { Avisos } from "./actividades/Avisos";
import { CronogramaAct } from "./actividades/CronogramaAct";
import { DetalleActividad } from "./actividades/DetalleActividad";
import { FormularioActividad } from "./actividades/FormularioActividad";
import { useOficinaActual } from "./actividades/hooks";
import { ImportarActividades } from "./actividades/ImportarActividades";
import { Lista } from "./actividades/Lista";
import { MisTareas } from "./actividades/MisTareas";
import { Planificacion } from "./actividades/Planificacion";
import { Tablero } from "./actividades/Tablero";
import { Devolver } from "./actividades/Devolver";
import { Transferir } from "./actividades/Transferir";
import { SelectorPlan } from "./SelectorPlan";
import { TodosLosPlanes } from "./TodosLosPlanes";
import { Cerrar } from "./actividades/Cerrar";
import { EditarPlazos } from "./actividades/EditarPlazos";
import { ReportarAvance } from "./actividades/ReportarAvance";
import { RevisarAvance, RevisarCola } from "./actividades/Revisar";
import { RiesgoForm } from "./actividades/RiesgoForm";
import { PsApiContext, crearApiSupabase, psKeys, usePsApi, type PsApi } from "./api";
import { Calidad } from "./Calidad";
import { Cargar } from "./Cargar";
import { ProveedorPs, usePs, type Seccion } from "./contexto";
import { CrearPlan } from "./CrearPlan";
import { Cronograma } from "./Cronograma";
import { DetalleLinea } from "./DetalleLinea";
import { DESDE_MODULO, TituloComoH2, useScrollPorRuta } from "./marco/PaginaCompleta";
import { Proyectos } from "./Proyectos";
import { Resumen } from "./Resumen";
import { Roles } from "./Roles";
import { Vacio } from "./Vacio";
import { Comparar, PublicarVersion, Versiones } from "./Versiones";
import { puedeAdministrar, type PsNivel } from "./modelo";
import { puedeVerTodosLosPlanes } from "./modeloPlanes";
import "./planeacion-seguimiento.css";
import "./actividades/actividades.css";

export const BASE = "/admin/planeacion-seguimiento";

interface Def {
  id: Seccion;
  nombre: string;
  descripcion: string;
  /** En la barra de secciones. */
  riel?: boolean;
}

export const SECCIONES: Def[] = [
  { id: "planificacion", nombre: "Mi planificación", descripcion: "Las actividades de su oficina y las líneas del plan a su cargo; crear una actividad o importarlas desde Excel", riel: true },
  { id: "tablero", nombre: "Tablero", descripcion: "Las actividades en cubos (por iniciar, en curso, en riesgo, en revisión, hecho); arrastre o use «Mover a…»", riel: true },
  { id: "lista", nombre: "Lista", descripcion: "Las actividades en una lista que se ordena por cualquier columna", riel: true },
  { id: "mis-tareas", nombre: "Mis tareas", descripcion: "Lo que usted tiene asignado: vencidas, próximas, más adelante y hechas", riel: true },
  { id: "asignar", nombre: "Asignar", descripcion: "El equipo con su carga, las actividades sin responsable y la asignación masiva", riel: true },
  { id: "cronograma-act", nombre: "Cronograma de actividades", descripcion: "Las actividades en el tiempo, por persona o por oficina", riel: true },
  { id: "resumen", nombre: "Resumen", descripcion: "Inversión, prioridad, pilar, campus y fuente de las líneas del plan, con filtros que se conservan", riel: true },
  { id: "proyectos", nombre: "Proyectos", descripcion: "Las líneas del plan con búsqueda, filtros y orden; cada una se abre a pantalla completa", riel: true },
  { id: "cronograma", nombre: "Cronograma", descripcion: "Las líneas del plan entre sus años de inicio y fin", riel: true },
  { id: "calidad", nombre: "Calidad de datos", descripcion: "Qué falta diligenciar, qué aún no aplica y qué es inconsistente", riel: true },
  { id: "versiones", nombre: "Versiones", descripcion: "La línea base: borrador y publicada", riel: true },
  { id: "roles", nombre: "Roles y permisos", descripcion: "Qué puede hacer cada nivel en el módulo", riel: true },
  { id: "cargar", nombre: "Cargar la planificación", descripcion: "Plantilla de Excel, revisión de lo leído y creación de la versión borrador" },
  { id: "crear", nombre: "Crear plan", descripcion: "Nombre y años del plan" },
  { id: "publicar", nombre: "Publicar versión", descripcion: "Confirmar la publicación" },
  { id: "comparar", nombre: "Comparar versiones", descripcion: "Qué cambió entre dos versiones" },
  { id: "actividad", nombre: "Actividad", descripcion: "El detalle de una actividad" },
  { id: "actividad-nueva", nombre: "Crear actividad", descripcion: "Qué se va a hacer, cuándo, quién y revisar" },
  { id: "actividad-editar", nombre: "Editar actividad", descripcion: "Cambiar los datos de una actividad" },
  { id: "importar-actividades", nombre: "Importar la planificación", descripcion: "Plantilla de Excel y creación de las actividades de la oficina" },
  { id: "transferir", nombre: "Transferir actividad", descripcion: "Pasar una actividad a otra persona, con motivo" },
  { id: "devolver", nombre: "Devolver actividad", descripcion: "Devolver una actividad de «En revisión» con una nota" },
  { id: "planes", nombre: "Todos los planes", descripcion: "El seguimiento de todos los planes: avance, alertas, oficinas y ritmo", riel: true },
  { id: "plan-editar", nombre: "Editar plan", descripcion: "Datos, oficina dueña, plantilla y pilares del plan" },
  { id: "reportar", nombre: "Reportar avance", descripcion: "Qué avanzó, evidencias, riesgos y revisar" },
  { id: "revisar", nombre: "Por validar", descripcion: "Avances que esperan la revisión del gestor" },
  { id: "cerrar", nombre: "Cerrar la actividad", descripcion: "Cierre administrativo del gestor (queda auditado)" },
  { id: "riesgo", nombre: "Riesgo", descripcion: "Registrar o editar un riesgo de la actividad" },
  { id: "plazos-aviso", nombre: "Plazos de aviso de la oficina", descripcion: "Los plazos de aviso propios de una oficina" },
  { id: "avisos", nombre: "Cómo te avisamos", descripcion: "Qué correos llegan y con qué plazo", riel: true },
];

/** Secciones que muestran el plan: sin plan o sin versión se reemplazan por el estado vacío guiado. */
const NECESITAN_PLAN: Seccion[] = ["planificacion", "tablero", "lista", "mis-tareas", "asignar", "cronograma-act", "actividad", "actividad-nueva", "actividad-editar", "importar-actividades", "transferir", "devolver", "reportar", "revisar", "cerrar", "riesgo", "plazos-aviso", "plan-editar", "resumen", "proyectos", "cronograma", "calidad", "versiones", "publicar", "comparar"];

function Cuerpo({ seccion, id }: { seccion: Seccion; id?: string }) {
  const { plan, cargando, error } = usePs();
  useScrollPorRuta();
  if (cargando) return <LoadingBlock rows={5} label="Cargando el plan" />;
  if (error) return <EmptyBlock title="Planeación y Seguimiento no está lista" hint="Falta aplicar la migración 0286 en la base de datos, o no se pudieron leer los datos del plan." />;
  if (NECESITAN_PLAN.includes(seccion)) {
    if (!plan) return <Vacio />;
    if (!plan.version) return <Vacio sinVersion />;
  }
  switch (seccion) {
    case "planificacion": return <Planificacion />;
    case "tablero": return <Tablero />;
    case "lista": return <Lista />;
    case "mis-tareas": return id ? <DetalleActividad id={id} /> : <MisTareas />; // el enlace de los correos: /mis-tareas/<id de la actividad>
    case "asignar": return <Asignar />;
    case "cronograma-act": return <CronogramaAct />;
    case "actividad": return id ? <DetalleActividad id={id} /> : <Planificacion />;
    case "actividad-nueva": return <FormularioActividad />;
    case "actividad-editar": return id ? <FormularioActividad id={id} /> : <Planificacion />;
    case "importar-actividades": return <ImportarActividades />;
    case "transferir": return id ? <Transferir id={id} /> : <Tablero />;
    case "devolver": return id ? <Devolver id={id} /> : <Tablero />;
    case "reportar": return id ? <ReportarAvance id={id} /> : <Tablero />;
    case "revisar": return id ? <RevisarAvance id={id} /> : <RevisarCola />;
    case "cerrar": return id ? <Cerrar id={id} /> : <Tablero />;
    case "riesgo": return id ? <RiesgoForm id={id} /> : <Tablero />;
    case "plazos-aviso": return id ? <EditarPlazos oficinaId={id} /> : <Avisos />;
    case "avisos": return <Avisos />;
    case "resumen": return <Resumen />;
    case "proyectos": return id ? <DetalleLinea id={id} /> : <Proyectos />;
    case "cronograma": return <Cronograma />;
    case "calidad": return <Calidad />;
    case "versiones": return <Versiones />;
    case "roles": return <Roles />;
    case "cargar": return <Cargar />;
    case "crear": return <CrearPlan />;
    case "plan-editar": return id ? <CrearPlan id={id} /> : <Resumen />;
    case "planes": return <TodosLosPlanes />;
    case "publicar": return id ? <PublicarVersion id={id} /> : <Versiones />;
    case "comparar": return <Comparar />;
  }
}

/** Qué sección es, según la dirección. Sin sección: el resumen (o el estado vacío si aún no hay plan). */
export function seccionDe(param: string | undefined): Seccion {
  return SECCIONES.find((s) => s.id === param)?.id ?? "resumen";
}

function Interior({ seccionParam, id, envoltura }: { seccionParam?: string; id?: string; envoltura: "intranet" | "demo" }) {
  const { plan, ruta, ir, nivel } = usePs();
  const seccion = seccionDe(seccionParam);
  const def = SECCIONES.find((s) => s.id === seccion)!;
  const completa = !def.riel || ((seccion === "proyectos" || seccion === "mis-tareas") && Boolean(id));
  const ofi = useOficinaActual().oficina;
  const tituloDef = seccion === "planificacion" && ofi ? (ofi.papel !== null ? "Mi planificación" : `Planificación de ${ofi.nombre}`) : def.nombre;
  const riel = SECCIONES.filter((x) => x.riel && (x.id !== "asignar" || nivel === "gestor" || nivel === "admin") && (x.id !== "planes" || puedeVerTodosLosPlanes(nivel)));
  const rotuloPlan = plan ? `${plan.nombre}${plan.version ? ` · ${plan.version.etiqueta}${plan.version.estado === "borrador" ? " (borrador)" : ""}` : ""}` : "Sin plan cargado";
  const cuerpo = <Cuerpo seccion={seccion} id={id} />;

  if (envoltura === "demo") {
    return (
      <div className="ps-demo">
        <header className="ps-demo__cab">
          <strong>Planeación y Seguimiento</strong> <span>{rotuloPlan} · modo demostración (solo desarrollo)</span>
          <nav aria-label="Secciones">{riel.map((s) => <button key={s.id} type="button" aria-current={seccion === s.id && !id ? "page" : undefined} onClick={() => ir(ruta(s.id))}>{s.nombre}</button>)}</nav>
        </header>
        <main className="ps-main"><div className="ps">{!completa ? <SelectorPlan /> : null}{cuerpo}</div></main>
      </div>
    );
  }
  const acciones: ReactNode = plan && puedeAdministrar(nivel) && !plan.version?.vigente && !completa ? (
    <button type="button" className="button-primary" onClick={() => ir(ruta("cargar"))}><Icon name="upload" size={16} /> Cargar la planificación</button>
  ) : undefined;
  return (
    <AdminShell
      section="planeacion_seguimiento"
      kicker="Planeación y Seguimiento"
      title={completa ? "Planeación y Seguimiento" : tituloDef}
      description={completa ? rotuloPlan : `${rotuloPlan} · ${def.descripcion}`}
      actions={acciones}
      rail={!completa ? (
        <AdminRail label="Secciones de Planeación y Seguimiento">
          {riel.map((s) => <AdminRailTab key={s.id} current={seccion === s.id} onSelect={() => ir(ruta(s.id))}>{s.nombre}</AdminRailTab>)}
        </AdminRail>
      ) : undefined}
    >
      <TituloComoH2.Provider value={true}><div className="ps">{!completa ? <SelectorPlan /> : null}{cuerpo}</div></TituloComoH2.Provider>
    </AdminShell>
  );
}

/** El módulo con una capa de datos dada (la de Supabase en la intranet; la de memoria en la demostración y las pruebas). */
export function PsApp({ api, nivel, base = BASE, seccion, id, envoltura = "intranet" }: { api: PsApi; nivel: PsNivel; base?: string; seccion?: string; id?: string; envoltura?: "intranet" | "demo" }) {
  return (
    <PsApiContext.Provider value={api}>
      <ProveedorPs nivel={nivel} base={base}>
        <Interior seccionParam={seccion} id={id} envoltura={envoltura} />
      </ProveedorPs>
    </PsApiContext.Provider>
  );
}

function ConNivel({ api, seccion, id }: { api: PsApi; seccion?: string; id?: string }) {
  const nav = useNavigate();
  void nav;
  const q = useQuery({ queryKey: psKeys.nivel, queryFn: () => api.nivel(), staleTime: 60_000, retry: false });
  const mensaje = (titulo: string, hint: string) => (
    <AdminShell section="planeacion_seguimiento" kicker="Planeación y Seguimiento" title="Planeación y Seguimiento"><EmptyBlock title={titulo} hint={hint} /></AdminShell>
  );
  if (q.isPending) return <AdminShell section="planeacion_seguimiento" kicker="Planeación y Seguimiento" title="Planeación y Seguimiento"><LoadingBlock rows={4} label="Comprobando su acceso" /></AdminShell>;
  if (q.error) return mensaje("Planeación y Seguimiento no está lista", "Falta aplicar la migración 0286 en la base de datos, o no se pudo comprobar su acceso.");
  if (!q.data || q.data === "none") return mensaje("Sin acceso a Planeación y Seguimiento", "El acceso lo da el rol de acceso (Usuarios y roles › Planeación y Seguimiento). Pídaselo a la administración.");
  return <PsApp api={api} nivel={q.data} seccion={seccion} id={id} />;
}

export function PlaneacionSeguimiento() {
  const { seccion, id } = useParams();
  const api = useMemo(() => crearApiSupabase(), []);
  return <ConNivel api={api} seccion={seccion} id={id} />;
}

export { DESDE_MODULO, usePsApi };
