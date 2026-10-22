/* =============================================================================
   UDrive · la pantalla (/admin/udrive).

   Un gestor de archivos y un editor de datos para armar informes complejos.
   Fase 1: archivos y carpetas (explorador), tablas editables, gráficas hechas
   desde tablas y cruce de tablas. La ruta decide qué se abre:

     /admin/udrive                  el explorador
     /admin/udrive/galeria          el explorador, en el catálogo de gráficas
     /admin/udrive/tabla/:id        el editor de tablas
     /admin/udrive/grafica/:id      el constructor de gráficas
     /admin/udrive/cruce/:id        el cruce de tablas

   Quién entra lo decide la pantalla «udrive» del rol de acceso (has_screen) y
   la base (0187); qué ve y qué edita cada quien, las carpetas y sus permisos.
   ========================================================================== */

import { useParams } from "react-router-dom";
import { EditorCruce } from "./EditorCruce";
import { EditorGrafica } from "./EditorGrafica";
import { EditorTabla } from "./EditorTabla";
import { Explorador } from "./Explorador";

export function UDrive() {
  const { vista, id } = useParams();
  if (id && vista === "tabla") return <EditorTabla key={id} id={id} />;
  if (id && vista === "grafica") return <EditorGrafica key={id} id={id} />;
  if (id && vista === "cruce") return <EditorCruce key={id} id={id} />;
  return <Explorador key={vista ?? "explorador"} seccionInicial={vista === "galeria" ? "catalogo" : "archivos"} />;
}
