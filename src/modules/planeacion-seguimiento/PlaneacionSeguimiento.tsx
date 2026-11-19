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
import "./planeacion-seguimiento.css";

export const BASE = "/admin/planeacion-seguimiento";

interface Def {
  id: Seccion;
  nombre: string;
  descripcion: string;
  /** En la barra de secciones. */
  riel?: boolean;
}

export const SECCIONES: Def[] = [
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
];

/** Secciones que muestran el plan: sin plan o sin versión se reemplazan por el estado vacío guiado. */
const NECESITAN_PLAN: Seccion[] = ["resumen", "proyectos", "cronograma", "calidad", "versiones", "publicar", "comparar"];

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
    case "resumen": return <Resumen />;
    case "proyectos": return id ? <DetalleLinea id={id} /> : <Proyectos />;
    case "cronograma": return <Cronograma />;
    case "calidad": return <Calidad />;
    case "versiones": return <Versiones />;
    case "roles": return <Roles />;
    case "cargar": return <Cargar />;
    case "crear": return <CrearPlan />;
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
  const completa = !def.riel || (seccion === "proyectos" && Boolean(id));
  const rotuloPlan = plan ? `${plan.nombre}${plan.version ? ` · ${plan.version.etiqueta}${plan.version.estado === "borrador" ? " (borrador)" : ""}` : ""}` : "Sin plan cargado";
  const cuerpo = <Cuerpo seccion={seccion} id={id} />;

  if (envoltura === "demo") {
    return (
      <div className="ps-demo">
        <header className="ps-demo__cab">
          <strong>Planeación y Seguimiento</strong> <span>{rotuloPlan} · modo demostración (solo desarrollo)</span>
          <nav aria-label="Secciones">{SECCIONES.filter((s) => s.riel).map((s) => <button key={s.id} type="button" aria-current={seccion === s.id && !id ? "page" : undefined} onClick={() => ir(ruta(s.id))}>{s.nombre}</button>)}</nav>
        </header>
        <main className="ps-main"><div className="ps">{cuerpo}</div></main>
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
      title={completa ? "Planeación y Seguimiento" : def.nombre}
      description={completa ? rotuloPlan : `${rotuloPlan} · ${def.descripcion}`}
      actions={acciones}
      rail={!completa ? (
        <AdminRail label="Secciones de Planeación y Seguimiento">
          {SECCIONES.filter((s) => s.riel).map((s) => <AdminRailTab key={s.id} current={seccion === s.id} onSelect={() => ir(ruta(s.id))}>{s.nombre}</AdminRailTab>)}
        </AdminRail>
      ) : undefined}
    >
      <TituloComoH2.Provider value={true}><div className="ps">{cuerpo}</div></TituloComoH2.Provider>
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
