/* =============================================================================
   Planeación y Seguimiento · piezas compartidas: filtros en línea (sin ventanas
   emergentes), pastillas, barras, anillo de prioridad, inversión por año.
   ========================================================================== */

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { FILTROS, opcionesFiltro, sumaMonto, totalFiltros, type Reparto } from "./calculos";
import { usePs } from "./contexto";
import { PRIORIDADES, entero, millones, millones1, porcentaje } from "./modelo";

/* ---------- Filtros ---------- */

export function BarraFiltros({ extra }: { extra?: ReactNode }) {
  const { lineas, filtros, setFiltros, filtradas } = usePs();
  const [abierto, setAbierto] = useState(() => {
    try {
      return sessionStorage.getItem("ps:filtros-abiertos") === "1";
    } catch {
      return false;
    }
  });
  const panelId = useId();
  const n = totalFiltros(filtros);
  const alternar = () => {
    setAbierto((a) => {
      try {
        sessionStorage.setItem("ps:filtros-abiertos", a ? "0" : "1");
      } catch {
        /* nada */
      }
      return !a;
    });
  };
  const marcar = (clave: string, valor: string, activo: boolean) => {
    const actual = filtros[clave] ?? [];
    const sig = activo ? [...actual, valor] : actual.filter((v) => v !== valor);
    const copia = { ...filtros };
    if (sig.length) copia[clave] = sig;
    else delete copia[clave];
    setFiltros(copia);
  };
  const etiquetaDe = (clave: string, v: string) => opcionesFiltro(FILTROS.find((f) => f.clave === clave)!, lineas).find((o) => o.v === v)?.l ?? v;
  return (
    <section className="ps-filtros" aria-label="Filtros del plan (se conservan al volver)">
      <div className="ps-filtros__cab">
        <button type="button" className="ps-filtros__boton" aria-expanded={abierto} aria-controls={panelId} onClick={alternar}>
          <Icon name="filter" size={15} />
          Filtros
          {n > 0 ? <b className="ps-contador" aria-label={`${n} activos`}>{n}</b> : null}
        </button>
        {FILTROS.flatMap((f) => (filtros[f.clave] ?? []).map((v) => (
          <button key={`${f.clave}:${v}`} type="button" className="ps-chip" onClick={() => marcar(f.clave, v, false)} aria-label={`Quitar el filtro ${f.rotulo}: ${etiquetaDe(f.clave, v)}`}>
            {etiquetaDe(f.clave, v)} <Icon name="close" size={12} />
          </button>
        )))}
        {n > 0 ? (
          <button type="button" className="ps-enlace" onClick={() => setFiltros({})}>
            Limpiar los {n} filtros
          </button>
        ) : null}
      </div>
      <p className="ps-filtros__resumen" aria-live="polite">
        Mostrando <strong>{entero(filtradas.length)}</strong> de {entero(lineas.length)} líneas · {millones(sumaMonto(filtradas))}
        {extra}
      </p>
      <div id={panelId} className="ps-filtros__panel" hidden={!abierto}>
        {FILTROS.map((f) => {
          const ops = opcionesFiltro(f, lineas);
          if (ops.length < 2 && !(filtros[f.clave]?.length)) return null;
          return (
            <fieldset key={f.clave}>
              <legend>{f.rotulo}</legend>
              {ops.map((o) => (
                <label key={o.v} className="ps-opcion">
                  <input type="checkbox" checked={(filtros[f.clave] ?? []).includes(o.v)} onChange={(e) => marcar(f.clave, o.v, e.target.checked)} />
                  <span>{o.l}</span>
                  <em>{o.n}</em>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Pastillas ---------- */

export const Prioridad = ({ valor }: { valor: string }) => {
  const i = Math.max(0, PRIORIDADES.findIndex((p) => p === valor));
  return (
    <span className="ps-prio" data-n={i}>
      <i aria-hidden="true" />
      {valor}
    </span>
  );
};

export const EstadoEvaluacion = ({ evaluada }: { evaluada: boolean }) => (
  <span className="ps-estado" data-tono={evaluada ? "ok" : "pend"}>
    <b aria-hidden="true">{evaluada ? "●" : "◆"}</b>
    {evaluada ? "Evaluada" : "Sin evaluar"}
  </span>
);

/* ---------- Gráficas ---------- */

/** Lista de barras: una fila por valor, con su monto y cuántas líneas. */
export function ListaBarras({ filas, color }: { filas: Reparto[]; color?: (r: Reparto, i: number) => string | undefined }) {
  const max = Math.max(1, ...filas.map((r) => r.monto));
  return (
    <ul className="ps-barras">
      {filas.map((r, i) => (
        <li key={r.clave}>
          <span className="ps-barras__l">{r.etiqueta}</span>
          <span className="ps-barras__b" aria-hidden="true">
            <i data-barra="x" style={{ width: `${Math.max(r.monto ? 1.5 : 0, (r.monto / max) * 100)}%`, background: color?.(r, i) }} />
          </span>
          <span className="ps-barras__v">
            {millones1(r.monto)} <em>· {r.n}</em>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Anillo de prioridad con su leyenda (la leyenda lleva el dato: el anillo es apoyo). */
export function AnilloPrioridad({ filas, total }: { filas: Reparto[]; total: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let desplazamiento = 0;
  return (
    <div className="ps-anillo">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={`Líneas por prioridad: ${filas.map((f) => `${f.etiqueta} ${f.n}`).join(", ")}`}>
        {filas.map((r, i) => {
          const largo = total ? (r.n / total) * C : 0;
          const arco = <circle key={r.clave} r={R} cx="70" cy="70" fill="none" stroke={`var(--ps-prio-${Math.max(0, PRIORIDADES.findIndex((p) => p === r.clave))})`} strokeWidth="22" strokeDasharray={`${Math.max(0, largo - 2).toFixed(2)} ${(C - largo + 2).toFixed(2)}`} strokeDashoffset={(-desplazamiento).toFixed(2)} transform="rotate(-90 70 70)" data-i={i} />;
          desplazamiento += largo;
          return arco;
        })}
        <text x="70" y="68" textAnchor="middle" className="ps-anillo__n">{entero(total)}</text>
        <text x="70" y="86" textAnchor="middle" className="ps-anillo__l">líneas</text>
      </svg>
      <ul className="ps-leyenda">
        {filas.map((r) => (
          <li key={r.clave}>
            <Prioridad valor={r.clave} />
            <b>{r.n}</b>
            <span>{millones1(r.monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inversión programada por año, en columnas con su valor y su parte. */
export function InversionPorAnio({ datos }: { datos: { anio: number; monto: number; parte: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.monto));
  return (
    <div className="ps-anios" role="img" aria-label={`Inversión programada por año, en millones de pesos: ${datos.map((d) => `${d.anio}, ${entero(Math.round(d.monto / 1e6))}`).join("; ")}`}>
      {datos.map((d) => (
        <div className="ps-anio" key={d.anio}>
          <span className="ps-anio__v">{entero(Math.round(d.monto / 1e6))}</span>
          <span className="ps-anio__b"><i data-barra="y" style={{ height: `${Math.max(d.monto ? 2 : 0, (d.monto / max) * 100)}%` }} /></span>
          <span className="ps-anio__y">{d.anio}</span>
          <span className="ps-anio__p">{porcentaje(d.parte)}</span>
        </div>
      ))}
    </div>
  );
}

export function Panel({ titulo, sub, children, ancho = 4 }: { titulo: string; sub?: ReactNode; children: ReactNode; ancho?: 4 | 6 | 8 | 12 }) {
  return (
    <section className="ps-panel" data-ancho={ancho}>
      <header>
        <h2>{titulo}</h2>
        {sub ? <p>{sub}</p> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

export const Nota = ({ children }: { children: ReactNode }) => <p className="ps-nota">{children}</p>;
