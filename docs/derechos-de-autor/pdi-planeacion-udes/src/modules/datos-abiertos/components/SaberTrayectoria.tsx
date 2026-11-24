/* =============================================================================
   Del Saber 11 al Saber PRO.

   Una fila por programa y sede: el punto hueco es el percentil medio con que
   llegaron (Saber 11) y el lleno el de salida (Saber PRO), ambos dentro de la
   cohorte UDES del mismo periodo. La línea es el cambio. No hay estudiantes
   individuales: solo promedios de grupos con 10 evaluados o más.
   ========================================================================== */

import { TRAYECTORIA_COMPETENCIAS, TRAYECTORIA_PERIODOS, trayectoriaFilas } from "../data/saber-trayectoria";
import { competencyInfo } from "../data/saber-pro";
import type { SaberCompetency } from "../data/saber-pro";
import "./saber-trayectoria.css";

const signed = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};

export function SaberTrayectoria({ competency, sede }: { competency: SaberCompetency; sede: string }) {
  if (!TRAYECTORIA_COMPETENCIAS.includes(competency)) {
    return (
      <p className="od-tray__empty">
        Comunicación escrita no tiene un área equivalente en Saber 11, así que no se puede comparar la entrada con la salida. Elija otra competencia.
      </p>
    );
  }
  const filas = trayectoriaFilas(competency, sede);
  if (!filas.length) return <p className="od-tray__empty">Ningún programa de esta sede llega a 10 evaluados con ambos resultados.</p>;
  const label = competencyInfo(competency).label;

  return (
    <div className="od-tray">
      <p className="od-tray__lead">
        {label}: percentil medio al ingresar (Saber 11) y al salir (Saber PRO {TRAYECTORIA_PERIODOS.join(", ")}) dentro de la cohorte UDES. Una línea hacia la derecha
        es un grupo que subió en el orden de su cohorte.
      </p>
      <ol className="od-tray__list" aria-label={`Del Saber 11 al Saber PRO · ${label}`}>
        {filas.map((f) => {
          const a = f.cifra.pEntrada;
          const b = f.cifra.pSalida;
          return (
            <li key={f.key} className="od-tray__row">
              <span className="od-tray__name">
                {f.programa}
                <small>
                  {f.sede} · {f.cifra.n} evaluados
                </small>
              </span>
              <span className="od-tray__track" aria-hidden="true">
                <span className="od-tray__mid" />
                <span
                  className={`od-tray__link ${f.cambio >= 0 ? "is-up" : "is-down"}`}
                  style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }}
                />
                <span className="od-tray__dot od-tray__dot--in" style={{ left: `${a}%` }} />
                <span className="od-tray__dot od-tray__dot--out" style={{ left: `${b}%` }} />
              </span>
              <span className={`od-tray__delta ${f.cambio >= 0 ? "is-up" : "is-down"}`}>
                {signed(f.cambio)}
                <small>
                  {Math.round(a)} → {Math.round(b)}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="od-tray__note">
        Saber 11 y Saber PRO no comparten escala, por eso se mide el lugar dentro de la cohorte (50 es la mitad). Los estudiantes entraron entre 2000 y 2022; no hay
        comparación con el país y un grupo pequeño cambia mucho de un periodo a otro.
      </p>
    </div>
  );
}
