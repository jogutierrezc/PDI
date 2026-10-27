/* =============================================================================
   Datos de Sostenibilidad · la pantalla (/admin/datos-sostenibilidad).

   Los datos de sostenibilidad viven en UDrive, en la unidad de trabajo «Datos
   de Sostenibilidad», abierta a todas las personas con acceso a la pantalla:
   todas ven, edita quien tiene papel en la unidad. Tres secciones dentro del
   marco de la intranet (AdminShell) más los tableros (0204):

     /admin/datos-sostenibilidad                 Archivos: el explorador de UDrive acotado a la unidad
     /admin/datos-sostenibilidad/indicadores     el catálogo de indicadores y de dónde sale cada uno
     /admin/datos-sostenibilidad/portal          qué se publica y la vista previa de /sostenible
     /admin/datos-sostenibilidad/tableros        tableros personalizados (lista) y /tableros/:id (el constructor)

   Abrir una tabla, una gráfica o un cruce usa los editores de UDrive, pero por
   rutas propias, para no sacar a nadie de aquí ni pedirle la pantalla UDrive:

     /admin/datos-sostenibilidad/tabla/:id       /grafica/:id       /cruce/:id

   Allí los editores traen un panel más: «Conectar a un indicador» (tabla) y
   «Publicar en el portal» (gráfica). Se vuelve con «← Archivos».
   ========================================================================== */

import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../../admin/components/AdminShell";
import { EditorCruce } from "../../udrive/ui/EditorCruce";
import { EditorGrafica } from "../../udrive/ui/EditorGrafica";
import { EditorTabla } from "../../udrive/ui/EditorTabla";
import { Explorador } from "../../udrive/ui/Explorador";
import { ProveedorDrive } from "../../udrive/ui/contexto";
import type { ContextoDrive } from "../../udrive/ui/contexto";
import { DondeSeUsa, PanelConexion, PanelPublicar } from "./Conexion";
import { Indicadores } from "./Indicadores";
import { Portal } from "./Portal";
import { Tableros } from "./Tableros";
import { AvisoSos, Cargando, ErrorSos } from "./piezas";
import { useAccesoSos } from "./usos";
import "../../admin/udes-en-cifras/od-admin.css";
import "./datos-sostenibilidad.css";

const BASE = "/admin/datos-sostenibilidad";
type Seccion = "archivos" | "indicadores" | "portal" | "tableros";

export function DatosSostenibilidad() {
  const { vista, id } = useParams();
  const navigate = useNavigate();
  const acceso = useAccesoSos();
  const raiz = acceso.unidad?.carpeta_raiz;

  // Lo que se suma a UDrive dentro de esta pantalla: rutas propias y los paneles de Sostenibilidad.
  const contexto = useMemo<ContextoDrive>(
    () => ({
      base: BASE,
      volver: "Archivos",
      incrustado: true,
      extraTabla: (a) => <PanelConexion id={a.id} tabla={a.tabla} editable={a.editable} />,
      extraGrafica: (a) => <PanelPublicar id={a.id} editable={a.editable} />,
      detalleExtra: (a) => (raiz ? <DondeSeUsa archivo={a.archivo} raiz={raiz} /> : null),
    }),
    [raiz],
  );

  // Los editores van a pantalla completa, como en UDrive, pero por nuestras rutas.
  if (id && (vista === "tabla" || vista === "grafica" || vista === "cruce")) {
    return (
      <ProveedorDrive value={contexto}>
        {vista === "tabla" ? <EditorTabla key={id} id={id} /> : vista === "grafica" ? <EditorGrafica key={id} id={id} /> : <EditorCruce key={id} id={id} />}
      </ProveedorDrive>
    );
  }

  const seccion: Seccion = vista === "indicadores" || vista === "portal" || vista === "tableros" ? vista : "archivos";
  const ir = (s: Seccion) => navigate(s === "archivos" ? BASE : `${BASE}/${s}`);

  return (
    <AdminShell
      section="datos-sostenibilidad"
      kicker="Datos de Sostenibilidad"
      title={seccion === "indicadores" ? "Indicadores" : seccion === "portal" ? "Portal de sostenibilidad" : seccion === "tableros" ? "Tableros" : "Archivos"}
      description="Tablas y gráficas abiertas a toda la comunidad de la intranet, conectadas a los indicadores de UDES Sostenible."
      rail={
        <AdminRail label="Secciones">
          <AdminRailTab current={seccion === "archivos"} onSelect={() => ir("archivos")}>
            Archivos
          </AdminRailTab>
          <AdminRailTab current={seccion === "indicadores"} onSelect={() => ir("indicadores")}>
            Indicadores
          </AdminRailTab>
          <AdminRailTab current={seccion === "portal"} onSelect={() => ir("portal")}>
            Portal de sostenibilidad
          </AdminRailTab>
          <AdminRailTab current={seccion === "tableros"} onSelect={() => ir("tableros")}>
            Tableros
          </AdminRailTab>
        </AdminRail>
      }
    >
      {acceso.unidades.isPending ? (
        <Cargando texto="Buscando la unidad de Datos de Sostenibilidad…" />
      ) : acceso.unidades.error ? (
        <ErrorSos error={acceso.unidades.error} />
      ) : !acceso.unidad ? (
        <AvisoSos>
          No encuentro la unidad «Datos de Sostenibilidad» de UDrive. Falta aplicar la migración 0202 o su cuenta no tiene acceso a ella.
        </AvisoSos>
      ) : seccion === "indicadores" ? (
        <Indicadores acceso={acceso} />
      ) : seccion === "portal" ? (
        <Portal acceso={acceso} />
      ) : seccion === "tableros" ? (
        <Tableros acceso={acceso} id={id} />
      ) : (
        <ProveedorDrive value={contexto}>
          <div className="dsx-archivos">
            <Explorador
              key={acceso.unidad.id}
              unidad={{
                id: acceso.unidad.id,
                nombre: acceso.unidad.nombre,
                raiz: acceso.unidad.carpeta_raiz,
                rango: ({ lector: 1, editor: 2, creador: 3, admin: 4 } as const)[acceso.unidad.mi_rol],
                uso: acceso.unidad.uso_bytes,
                cuota: acceso.unidad.cuota_bytes,
                archivada: Boolean(acceso.unidad.archivada_en),
              }}
            />
          </div>
        </ProveedorDrive>
      )}
    </AdminShell>
  );
}
