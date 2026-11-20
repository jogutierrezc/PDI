/* =============================================================================
   Planeación y Seguimiento · VAF · piezas compartidas: pesos legibles (MM = miles de millones), estado financiero con
   glifo y texto, cifras de presupuesto, ejecución junto al avance físico y la alerta de vigilancia.
   ========================================================================== */

import { Icon } from "../../../components/ui/Icon";
import {
  ORDEN_SEVERIDAD, ROTULO_ALERTA, ROTULO_FINANCIACION, ROTULO_FINANCIERO, ROTULO_SEVERIDAD, pesosCompletos, pesosCortos, porcentajeVaf, puntos,
  type AlertaVigilancia, type CifrasPresupuesto, type EstadoFinanciacion, type EstadoFinanciero,
} from "./modeloVaf";

/** Un monto: corto a la vista («$ 12,5 MM») y completo para lector de pantalla y para el título. */
export function Pesos({ n, fuerte = false }: { n: number | null | undefined; fuerte?: boolean }) {
  const t = pesosCompletos(n);
  return (
    <span className="ps-pesos" data-fuerte={fuerte || undefined} title={t}>
      <span aria-hidden="true">{pesosCortos(n)}</span>
      <span className="sr-only">{t}</span>
    </span>
  );
}

const TONO_FIN: Record<EstadoFinanciero, string> = { sin_evaluar: "neutro", pendiente: "pend", en_revision: "activo", aprobada: "ok", aprobada_con_ajustes: "pend", no_viable: "riesgo" };
function Glifo({ e }: { e: EstadoFinanciero }) {
  const n = e === "aprobada" ? "check" : e === "no_viable" ? "alert" : e === "aprobada_con_ajustes" ? "info" : e === "sin_evaluar" ? "info" : "clock";
  return <Icon name={n} size={13} />;
}
/** El estado financiero (evaluación de la VAF) como chip con glifo y texto. */
export function ChipEstadoFinanciero({ estado, corto = false }: { estado: EstadoFinanciero; corto?: boolean }) {
  return (
    <span className="ps-est ps-est--fin" data-tono={TONO_FIN[estado]} title={`Estado financiero: ${ROTULO_FINANCIERO[estado]}`}>
      <Glifo e={estado} />{corto ? "" : "Financiero: "}{ROTULO_FINANCIERO[estado]}
    </span>
  );
}

const TONO_FIN_LINEA: Record<EstadoFinanciacion | "parcial", string> = { sin_evaluar: "neutro", aprobada: "ok", ajustada: "pend", rechazada: "riesgo", parcial: "pend" };
export function ChipFinanciacionLinea({ estado }: { estado: EstadoFinanciacion | "parcial" }) {
  const texto = estado === "parcial" ? "Evaluada en parte" : ROTULO_FINANCIACION[estado];
  return <span className="ps-est ps-est--fin" data-tono={TONO_FIN_LINEA[estado]}><Icon name={estado === "aprobada" ? "check" : estado === "rechazada" ? "alert" : estado === "sin_evaluar" ? "info" : "clock"} size={13} />Financiación: {texto}</span>;
}

/** Las siete cifras del presupuesto. */
export function CifrasPpto({ c, solicitado }: { c: CifrasPresupuesto; solicitado?: number }) {
  const filas: [string, number, string?][] = [
    ...(solicitado !== undefined ? ([["Solicitado", solicitado, "lo que pidió la oficina"]] as [string, number, string?][]) : []),
    ["Aprobado", c.aprobado, "presupuesto del año"], ["Modificado", c.modificado, "adiciones y reducciones"], ["Vigente", c.vigente, "aprobado + modificado"],
    ["Comprometido", c.comprometido], ["Ejecutado", c.ejecutado], ["Pagado", c.pagado], ["Disponible", c.disponible, "vigente − lo mayor entre comprometido y ejecutado"],
  ];
  return (
    <dl className="ps-cifras-ppto">
      {filas.map(([k, v, a]) => <div key={k} data-k={k.toLowerCase()}><dt>{k}</dt><dd><Pesos n={v} fuerte />{a ? <small>{a}</small> : null}</dd></div>)}
      <div data-k="pct"><dt>% de ejecución</dt><dd><b>{porcentajeVaf(c.pctEjecucion)}</b><small>ejecutado ÷ vigente</small></dd></div>
    </dl>
  );
}

/** % de ejecución y avance físico validado, juntos, con la desviación escrita. */
export function EjecucionVsAvance({ pct, fisico, desviacion, umbral = 15 }: { pct: number | null; fisico: number | null; desviacion: number | null; umbral?: number }) {
  const alta = desviacion !== null && Math.abs(desviacion) > umbral;
  return (
    <div className="ps-evsa">
      <div className="ps-evsa__fila"><span>Ejecución</span><span className="ps-evsa__pista" role="img" aria-label={`Ejecución: ${porcentajeVaf(pct)}`}><i data-barra="x" style={{ width: `${Math.min(100, pct ?? 0)}%` }} data-tono="fin" /></span><b>{porcentajeVaf(pct)}</b></div>
      <div className="ps-evsa__fila"><span>Avance físico</span><span className="ps-evsa__pista" role="img" aria-label={`Avance físico validado: ${porcentajeVaf(fisico)}`}><i data-barra="x" style={{ width: `${Math.min(100, fisico ?? 0)}%` }} /></span><b>{porcentajeVaf(fisico)}</b></div>
      <p className="ps-evsa__des" data-alta={alta || undefined}>{desviacion === null ? "Sin desviación: falta el presupuesto o el avance." : <><Icon name={alta ? "alert" : "check"} size={13} /> Desviación: {puntos(desviacion)} {desviacion > 0 ? "(ejecuta más de lo que avanza)" : desviacion < 0 ? "(avanza más de lo que ejecuta)" : ""}</>}</p>
    </div>
  );
}

export const ordenarAlertas = (a: readonly AlertaVigilancia[]): AlertaVigilancia[] => [...a].sort((x, y) => ORDEN_SEVERIDAD[x.severidad] - ORDEN_SEVERIDAD[y.severidad] || x.lineaClave.localeCompare(y.lineaClave, "es", { numeric: true }));

export function ItemAlerta({ a, children }: { a: AlertaVigilancia; children?: React.ReactNode }) {
  return (
    <li className="ps-alerta-v" data-sev={a.severidad}>
      <Icon name={a.severidad === "alta" ? "alert" : a.severidad === "media" ? "clock" : "info"} size={15} />
      <span><strong>{ROTULO_SEVERIDAD[a.severidad]} · {ROTULO_ALERTA[a.tipo]}.</strong> {a.texto}</span>
      {children}
    </li>
  );
}
