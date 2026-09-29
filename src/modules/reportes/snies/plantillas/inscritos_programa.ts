/* =============================================================================
   SNIES · Inscritos Programa (§3.4.2).

   Los programas a los que aspira cada inscrito: de ninguno a «n». La persona
   tiene que estar antes en la Relación de inscritos del periodo (§3.4.1), y
   el programa, activo. Aquí tampoco se cruza con Participante (§3.4.15).
   ========================================================================== */

import type { ErrorFila, PlantillaSpec, ReglaPlantilla } from "../../tipos";
import {
  FECHAS_INGRESO,
  MUNICIPIO,
  PROGRAMA,
  campoSede,
  camposPeriodoYDocumento,
  clavePrograma,
  periodoActual,
  reglaOferta,
  reglaPeriodo,
  reglaProgramaActivo,
  reglaRepetido,
} from "./comunes";

const SECCION = "§3.4.2 Inscritos Programa";

/** Debe estar en la Relación de inscritos del mismo periodo («documento||periodo»). */
const enRelacion: ReglaPlantilla = (filas, ctx, h) => {
  const errores: ErrorFila[] = [];
  const periodo = periodoActual(ctx);
  filas.forEach((fila, i) => {
    if (h.vacio(fila.NUM_DOCUMENTO)) return;
    const doc = h.documento(fila.NUM_DOCUMENTO);
    if (ctx.cruces.inscritos.has(`${doc}||${periodo}`)) return;
    errores.push({
      fila: i,
      campo: "NUM_DOCUMENTO",
      mensaje: `El documento ${doc} no está en la Relación de inscritos de ${periodo}. Agréguelo primero allí, o revise el número.`,
      seccion: SECCION,
    });
  });
  return errores;
};

export const INSCRITOS_PROGRAMA: PlantillaSpec = {
  id: "inscritos_programa",
  nombre: "Inscritos Programa",
  modulo: "Población estudiantil",
  seccion: "§3.4.2",
  orden: 3,
  depende: ["inscritos"],
  fechas: FECHAS_INGRESO, // §2.6.1: las de Inscritos
  disponible: true,
  campos: [
    ...camposPeriodoYDocumento("§3.4.2", "Sin puntos, comas ni apóstrofes. Debe estar en la Relación de inscritos."),
    { codigo: "PRO_CONSECUTIVO", etiqueta: "Programa", grupo: "Programa", obligatorio: true, fuente: PROGRAMA, alias: ["PRO-CONSECUTIVO"], seccion: "§3.4.2", ancho: true },
    campoSede("ID_MUNICIPIO", "§3.4.2"),
  ],
  reglas: [reglaPeriodo(SECCION), reglaProgramaActivo(SECCION), reglaOferta(SECCION)],
  reglasPlantilla: [
    enRelacion,
    // Mismo programa y misma sede dos veces (por confirmar: HECAA podría no admitir dos sedes del mismo programa).
    reglaRepetido(
      SECCION,
      (n) => `Este inscrito ya aparece en la fila ${n} con el mismo programa y sede. Deje una sola fila.`,
      (fila, ctx, h) => {
        const clave = clavePrograma(fila, ctx, h);
        return clave ? `${clave}|${h.resolver(MUNICIPIO, fila.ID_MUNICIPIO ?? "", ctx)?.codigo ?? ""}` : null;
      },
    ),
  ],
};
