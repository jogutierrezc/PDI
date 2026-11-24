/* =============================================================================
   THE Impact · el bloque de evidencias en UDrive que se suma a la ficha de un
   indicador del formulario de la oficina (reporte/ui/FormularioOficina.tsx). Se carga
   aparte (lazy) para no pesar en el formulario ni exigir el contexto de la sección.
   Las evidencias de siempre (bucket del reporte, con sus chequeos) siguen arriba y
   cuentan igual; esto agrega la carpeta del indicador en «Datos de Sostenibilidad».
   ========================================================================== */

import { requisitoDe, useRequisitosThi } from "../datos";
import { EvidenciasThi } from "./Evidencias";
import "../../uigreen/ui/ugm.css";
import "./thi.css";

interface Props {
  ciclo: { id: string; anio: number };
  indicador: string;
  respuesta: string;
  editable: boolean;
  esAdmin: boolean;
}

export function EvidenciasEnFicha({ ciclo, indicador, respuesta, editable, esAdmin }: Props) {
  const requisitos = useRequisitosThi();
  return (
    <details className="thi-reglas thi-enficha">
      <summary>Carpeta de evidencias en UDrive (Datos de Sostenibilidad)</summary>
      <EvidenciasThi respuesta={respuesta} ciclo={ciclo} indicador={indicador} requisito={requisitoDe(requisitos.data, indicador)} editable={editable} esAdmin={esAdmin} />
    </details>
  );
}
