/* =============================================================================
   UDrive · «Nuevo informe»: elegir plantilla, ponerle nombre y carpeta.

   Crea un archivo de tipo documento con el contenido de la plantilla y lo abre
   en el editor. El nombre es el del archivo en UDrive; también es el título de
   la portada (se cambia después en «Documento»).
   ========================================================================== */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ventana } from "../../../../components/espacio/Ventana";
import { useArchivos, useCarpetas, useCrearItem } from "../../datos";
import { rutaDeCarpeta } from "../../lib/arbol";
import type { PlantillaId } from "../../lib/documento";
import { limpiarNombre, nombreEnUso } from "../../lib/nombres";
import { PLANTILLAS } from "../../plantillas";

export function NuevoInforme({ carpetaInicial, onCerrar, decir }: { carpetaInicial: string | null; onCerrar(): void; decir(m: string): void }) {
  const navigate = useNavigate();
  const crear = useCrearItem();
  const carpetas = useCarpetas();
  const archivos = useArchivos();
  const [plantilla, setPlantilla] = useState<PlantillaId>("lineamientos");
  const [nombre, setNombre] = useState("");
  const [carpeta, setCarpeta] = useState<string | null>(carpetaInicial);

  const opciones = useMemo(() => {
    const vivas = (carpetas.data ?? []).filter((c) => !c.borrado_en);
    return vivas
      .map((c) => ({ id: c.id, texto: rutaDeCarpeta(vivas, c.id).map((n) => n.nombre).join(" / ") }))
      .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  }, [carpetas.data]);

  const limpio = limpiarNombre(nombre, 160);
  const repetido = Boolean(limpio) && nombreEnUso(limpio, (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpeta).map((a) => a.nombre));
  const ficha = PLANTILLAS.find((p) => p.id === plantilla) ?? PLANTILLAS[0];

  return (
    <Ventana
      titulo="Nuevo informe"
      onCerrar={onCerrar}
      pie={
        <>
          <span className="es-note">Puede cambiar la portada y los capítulos cuando quiera.</span>
          <button type="submit" form="ud-f-informe" className="es-btn es-btn--pri" disabled={!limpio || repetido || crear.isPending}>
            Crear informe
          </button>
        </>
      }
    >
      <form
        id="ud-f-informe"
        className="es-dbody"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate(
            { tipo: "documento", nombre: limpio, carpeta, contenido: ficha.crear(limpio) },
            { onSuccess: (id) => navigate(`/admin/udrive/documento/${id}`), onError: (er) => decir(er.message) },
          );
        }}
      >
        <div role="group" aria-label="Plantilla" className="ud-tarjetas-plantilla">
          {PLANTILLAS.map((p) => (
            <button key={p.id} type="button" className="ud-plantilla" aria-pressed={plantilla === p.id} onClick={() => setPlantilla(p.id)}>
              <b>{p.nombre}</b>
              <span>{p.descripcion}</span>
            </button>
          ))}
        </div>
        <label className="es-fl">
          Nombre del informe
          <input type="text" className="es-inp" data-foco value={nombre} maxLength={160} aria-invalid={repetido} onChange={(e) => setNombre(e.target.value)} placeholder="Lineamientos de infraestructura 2026" />
        </label>
        {repetido ? <p className="ud-aviso" data-t="error" role="alert">Ya hay algo con ese nombre en esa carpeta.</p> : null}
        <label className="es-fl">
          Carpeta
          <select className="es-inp" value={carpeta ?? ""} onChange={(e) => setCarpeta(e.target.value || null)}>
            <option value="">Mi espacio</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
          </select>
        </label>
      </form>
    </Ventana>
  );
}
