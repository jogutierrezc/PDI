/* =============================================================================
   THE Impact · asignación: la mesa de coordinación del reporte por oficinas (quién
   responde cada indicador, quién apoya, qué oficinas ya aportaron). Es la misma
   pantalla de siempre dentro de la estructura del ciclo; las asignaciones nuevas
   avisan a la oficina por correo cuando el ciclo está abierto (migración 0241).
   ========================================================================== */

import { Alerta, Vacio } from "../../uigreen/ui/comunes";
import { MesaCoordinacion } from "../../reporte/ui/MesaCoordinacion";
import { useThi } from "./contexto";

export function Asignacion({ odsInicial }: { odsInicial: number | null }) {
  const t = useThi();
  if (!t.esAdmin) return <Vacio>La asignación la gestiona la administración del ranking (Planeación o más).</Vacio>;
  if (t.indicadores.length === 0) return <Vacio>El ciclo no tiene catálogo todavía: impórtelo en «Indicadores».</Vacio>;
  return (
    <div className="ugm-pila">
      {t.ciclo.estado === "preparacion" && (
        <Alerta>El ciclo está en preparación: puede asignar sin que nadie reciba avisos. Al abrirlo, las oficinas empiezan a recibir los suyos.</Alerta>
      )}
      <div className="thi-mesa rk-rep">
        <MesaCoordinacion
          key={`${t.ciclo.id}-${odsInicial ?? "todos"}`}
          ciclo={t.ciclo}
          indicadores={t.indicadores}
          asignaciones={t.asignaciones}
          respuestas={t.respuestas}
          unidades={t.unidades}
          odsInicial={odsInicial}
        />
      </div>
    </div>
  );
}
