/* =============================================================================
   UDrive · «Nuevo estilo de informe»: partir de un estilo, ponerle nombre y
   carpeta (0190).

   Crea un archivo de tipo «estilo» con una copia del estilo elegido (de
   fábrica o uno propio) y lo abre en el editor de estilos. Sin la migración
   0190, crear falla con el aviso de que falta aplicarla; los estilos de fábrica
   no la necesitan.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ventana } from "../../../../components/espacio/Ventana";
import { useArchivos, useCarpetas, useCrearItem } from "../../datos";
import { leerEstilo, useEstilosGuardados } from "../../datosEstilo";
import { rutaDeCarpeta } from "../../lib/arbol";
import { ESTILO_INFORME_NUEVO, FABRICAS, estiloParaGuardar } from "../../lib/estilo";
import { limpiarNombre, nombreEnUso } from "../../lib/nombres";

export function NuevoEstilo({ carpetaInicial, onCerrar, decir }: { carpetaInicial: string | null; onCerrar(): void; decir(m: string): void }) {
  const navigate = useNavigate();
  const crear = useCrearItem();
  const carpetas = useCarpetas();
  const archivos = useArchivos();
  const { estilos } = useEstilosGuardados();
  const [base, setBase] = useState(ESTILO_INFORME_NUEVO);
  const [nombre, setNombre] = useState("");
  const [carpeta, setCarpeta] = useState<string | null>(carpetaInicial);
  const [ocupado, setOcupado] = useState(false);

  const opciones = useMemo(() => {
    const vivas = (carpetas.data ?? []).filter((c) => !c.borrado_en);
    return vivas.map((c) => ({ id: c.id, texto: rutaDeCarpeta(vivas, c.id).map((n) => n.nombre).join(" / ") })).sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  }, [carpetas.data]);

  const limpio = limpiarNombre(nombre, 160);
  const repetido = Boolean(limpio) && nombreEnUso(limpio, (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpeta).map((a) => a.nombre));

  return (
    <Ventana
      titulo="Nuevo estilo de informe"
      onCerrar={onCerrar}
      pie={
        <>
          <span className="es-note">Los cuatro de fábrica no se cambian: aquí se crea una copia propia.</span>
          <button type="submit" form="ud-f-estilo" className="es-btn es-btn--pri" disabled={!limpio || repetido || crear.isPending || ocupado}>
            Crear estilo
          </button>
        </>
      }
    >
      <form
        id="ud-f-estilo"
        className="es-dbody"
        onSubmit={(e) => {
          e.preventDefault();
          setOcupado(true);
          void leerEstilo(base)
            .then((r) => {
              if (!r) throw new Error("No se pudo leer el estilo elegido.");
              crear.mutate(
                { tipo: "estilo", nombre: limpio, carpeta, contenido: estiloParaGuardar({ ...r.estilo, nombre: limpio.slice(0, 60) }) },
                { onSuccess: (id) => navigate(`/admin/udrive/estilo/${id}`), onError: (er) => decir(er.message), onSettled: () => setOcupado(false) },
              );
            })
            .catch((er: Error) => {
              setOcupado(false);
              decir(er.message);
            });
        }}
      >
        <label className="es-fl">
          Partir de
          <select className="es-inp" value={base} onChange={(e) => setBase(e.target.value)}>
            <optgroup label="De fábrica">
              {FABRICAS.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </optgroup>
            {estilos.length ? (
              <optgroup label="Mis estilos">
                {estilos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="es-fl">
          Nombre del estilo
          <input type="text" className="es-inp" data-foco value={nombre} maxLength={60} aria-invalid={repetido} onChange={(e) => setNombre(e.target.value)} placeholder="Informes de mi facultad" />
        </label>
        {repetido ? <p className="ud-aviso" data-t="error" role="alert">Ya hay algo con ese nombre en esa carpeta.</p> : null}
        <label className="es-fl">
          Carpeta
          <select className="es-inp" value={carpeta ?? ""} onChange={(e) => setCarpeta(e.target.value || null)}>
            <option value="">Mi espacio</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
          </select>
        </label>
        <p className="es-note">Un estilo en una carpeta compartida lo pueden aplicar quienes tengan acceso a esa carpeta. Quien lo aplica guarda su propia copia.</p>
      </form>
    </Ventana>
  );
}
