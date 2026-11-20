/* Planeación y Seguimiento · VAF · el presupuesto de UNA línea, dentro del detalle de la línea y de la actividad.
   Lectura para todos los niveles: cada persona ve solo lo que la base le deja ver (gestor y colaborador, las líneas de sus
   oficinas). Si la línea no trae presupuesto visible, el panel no aparece. */

import { Link } from "react-router-dom";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { usePresupuestoLinea, usePresupuestoPlan } from "./hooksVaf";
import { estadoFinancieroLinea, esFinanciero } from "./modeloVaf";
import { CifrasPpto, ChipFinanciacionLinea, EjecucionVsAvance } from "./partesVaf";

export function useLineaFinanciera(no: string | null) {
  const { planId } = usePs();
  const plan = usePresupuestoPlan(planId, Boolean(no));
  const fila = no ? (plan.data?.porLinea.find((l) => l.clave === no) ?? null) : null;
  const linea = usePresupuestoLinea(fila?.lineaId ?? null);
  return { fila, linea, cargando: plan.isPending || (Boolean(fila) && linea.isPending) };
}

export function PanelPresupuestoLinea({ no }: { no: string }) {
  const { ruta, nivel } = usePs();
  const { fila, linea, cargando } = useLineaFinanciera(no);
  if (cargando || !fila || !linea.data) return null;
  const l = linea.data;
  return (
    <section className="ps-bloque ps-ppto-panel" aria-labelledby={`ppto-${no}`}>
      <h3 id={`ppto-${no}`}>Presupuesto y ejecución de la línea</h3>
      <div className="ps-fila-act ps-fila-act--ficha"><ChipFinanciacionLinea estado={estadoFinancieroLinea(l.financiacion)} /></div>
      <CifrasPpto c={l} solicitado={l.solicitado} />
      <EjecucionVsAvance pct={l.pctEjecucion} fisico={l.avanceFisico} desviacion={l.desviacion} />
      <div className="ps-botones"><Link className="button-secondary ps-btn-peq" to={ruta("vaf-linea", encodeURIComponent(l.lineaId))} state={DESDE_MODULO}>{esFinanciero(nivel) ? "Ver el libro y registrar" : "Ver el libro de movimientos"}</Link></div>
    </section>
  );
}
