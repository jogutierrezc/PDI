/* =============================================================================
   Libro de la Rendición de Cuentas · gráficos de las hojas (SVG y CSS puros).
   Todo se mide en la unidad de la página (--u = 1 % de su ancho), así que cada
   gráfico escala con la hoja y se imprime igual en Carta y en A4.
   ========================================================================== */

import type { CSSProperties } from "react";

/** Anillo de logros (azul) y retos (naranja) con un hueco entre arcos. */
export function Anillo({ logros, retos }: { logros: number; retos: number }) {
  const r = 38;
  const w = 13;
  const C = 2 * Math.PI * r;
  const t = logros + retos || 1;
  const la = (C * logros) / t;
  const lb = (C * retos) / t;
  const hueco = logros && retos ? 2.2 : 0;
  return (
    <svg viewBox="0 0 100 100" className="lb-anillo" role="img" aria-label={`${logros} logros y ${retos} retos`}>
      <circle className="lb-pista" cx="50" cy="50" r={r} fill="none" strokeWidth={w} />
      {logros > 0 && <circle className="lb-arco l" cx="50" cy="50" r={r} fill="none" strokeWidth={w} strokeDasharray={`${Math.max(la - hueco, 0)} ${C}`} transform="rotate(-90 50 50)" />}
      {retos > 0 && <circle className="lb-arco r" cx="50" cy="50" r={r} fill="none" strokeWidth={w} strokeDasharray={`${Math.max(lb - hueco, 0)} ${C}`} strokeDashoffset={-la} transform="rotate(-90 50 50)" />}
    </svg>
  );
}

/** Una fila de puntos (por defecto 50): los primeros `p` % rellenos, qué parte del total se logró. */
export function Puntos({ p, reto, n = 50 }: { p: number; reto?: boolean; n?: number }) {
  const llenos = Math.max(0, Math.min(n, Math.round((p / 100) * n)));
  return (
    <div className={`lb-puntos${reto ? " r" : ""}`} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {Array.from({ length: n }, (_, i) => (
        <b key={i} className={i < llenos ? "f" : undefined} />
      ))}
    </div>
  );
}

export function Barra({ p, reto }: { p: number; reto?: boolean }) {
  return (
    <div className={`lb-hbar${reto ? " r" : ""}`} aria-hidden="true">
      <b style={{ width: `${Math.max(2, Math.min(100, p))}%` }} />
    </div>
  );
}

export const Logro = () => <i className="lb-dotL" aria-hidden="true" />;
export const Reto = () => <i className="lb-dotR" aria-hidden="true" />;

export function Leyenda() {
  return (
    <div className="lb-lg">
      <span>
        <Logro />
        Logro
      </span>
      <span>
        <Reto />
        Reto
      </span>
    </div>
  );
}

export const estilo = (v: Record<string, string | number>): CSSProperties => v as CSSProperties;
