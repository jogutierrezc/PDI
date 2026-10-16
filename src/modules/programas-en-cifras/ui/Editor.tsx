/* =============================================================================
   Programas en Cifras · el editor de un archivo.

   La hoja, la tabla, el guardado automático y los atajos son del editor
   compartido (components/espacio/Editor); aquí se le dice qué columnas y reglas
   tiene el archivo, cómo se guarda, y se le ponen los paneles «Campos» y
   «Responde a» y el botón «Marcar como listo».

   Planeación lo ve en SOLO LECTURA: los campos están deshabilitados, no hay
   botones de edición y la insignia lo dice. Director y Coordinador editan.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Editor as EditorBase } from "../../../components/espacio/Editor";
import type { Caja, FilaGuardada } from "../../../components/espacio/tipos";
import { useActualizarArchivo, useFilas, useGuardarFilas, useMarcarListo } from "../datos";
import { puedeCambiarEstructura, puedeEditar, puedeVolverABorrador } from "../lib/permisos";
import { FichaEstado } from "./comunes";
import { useEspacio } from "./contexto";
import { PanelCampos } from "./PanelCampos";
import { PanelRespuesta } from "./PanelRespuesta";
import { reglasPc } from "./reglas";

export function Editor({ archivoId, origen, onCerrar }: { archivoId: string; origen: Caja | null; onCerrar: () => void }) {
  const espacio = useEspacio();
  const { pareja, rol, decir, empezarRecorrido, respuestas } = espacio;
  const archivo = espacio.archivos.find((a) => a.id === archivoId);
  const editable = puedeEditar(rol);
  const estructura = archivo ? puedeCambiarEstructura(rol, archivo) : false;
  const base = { programa: pareja.programa_id, campus: pareja.campus_id };

  const filasQ = useFilas(archivoId);
  const guardarFilas = useGuardarFilas();
  const marcarListo = useMarcarListo();
  const renombrar = useActualizarArchivo();
  const guardadas = useMemo<FilaGuardada[] | undefined>(() => filasQ.data?.map((f) => ({ id: f.id, datos: f.datos })), [filasQ.data]);

  const marcar = async (listo: boolean, c: { guardar: () => Promise<boolean>; errores: number; irAlError: () => void }) => {
    if (!archivo) return;
    if (listo && c.errores > 0) {
      decir(`Corrija ${c.errores} ${c.errores === 1 ? "celda" : "celdas"} antes de marcarlo como listo.`);
      c.irAlError();
      return;
    }
    if (!(await c.guardar())) return;
    marcarListo.mutate({ archivo: archivo.id, listo, ...base }, { onSuccess: () => decir(listo ? "Listo. Planeación ya puede verlo." : "Volvió a borrador."), onError: (e) => decir(e.message) });
  };

  return (
    <EditorBase
      clave={archivoId}
      existe={Boolean(archivo)}
      titulo={archivo?.nombre ?? ""}
      tipo={archivo?.tipo ?? "tabla"}
      origen={origen}
      onCerrar={onCerrar}
      nombre={archivo ? { valor: archivo.nombre, editable: editable && !archivo.bloqueado, renombrar: (nombre) => renombrar.mutate({ id: archivo.id, ...base, nombre }, { onError: (e) => decir(e.message) }) } : undefined}
      chip={({ sucia, errores }) => {
        const listo = archivo?.estado === "listo" && !sucia;
        return <FichaEstado estado={listo ? "listo" : "borrador"} errores={listo ? 0 : errores} />;
      }}
      recorrido={() => empezarRecorrido("programas-editor")}
      acciones={(c) =>
        editable && archivo ? (
          puedeVolverABorrador(rol, archivo.estado) ? (
            <button type="button" className="es-btn" id="pc-listo" data-tour="pc-listo" disabled={marcarListo.isPending} onClick={() => void marcar(false, c)}>
              Volver a borrador
            </button>
          ) : (
            <button type="button" className="es-btn es-btn--pri" id="pc-listo" data-tour="pc-listo" disabled={marcarListo.isPending} onClick={() => void marcar(true, c)}>
              <Icon name="check" size={16} />
              Marcar como listo
            </button>
          )
        ) : null
      }
      columnas={archivo?.columnas ?? []}
      reglas={reglasPc}
      guardadas={guardadas}
      refrescar={async () => (await filasQ.refetch()).data?.map((f) => ({ id: f.id, datos: f.datos })) ?? []}
      guardar={async (g) => {
        await guardarFilas.mutateAsync({ archivo: archivoId, ...base, filas: g.filas.map(({ id, datos }) => ({ id, datos })), borrar: g.borrar });
      }}
      editable={editable}
      insigniaSoloLectura="Solo lectura · Planeación"
      decir={decir}
      panelIzq={archivo ? { etiqueta: "Campos", tour: "pc-campos", contenido: ({ guardarAntes }) => <PanelCampos archivo={archivo} editable={estructura} guardarAntes={guardarAntes} /> } : undefined}
      panelDer={archivo ? { etiqueta: "Responde a", icono: "link", tour: "pc-responde", abierto: respuestas.some((r) => r.archivo_id === archivoId), contenido: ({ filas }) => <PanelRespuesta archivo={archivo} filas={filas} editable={editable} /> } : undefined}
    />
  );
}
