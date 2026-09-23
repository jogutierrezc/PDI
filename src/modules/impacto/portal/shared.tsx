/* =============================================================================
   Piezas comunes del portal: conteos del río, la piedra de un indicador y el
   aviso de datos ilustrativos.
   ========================================================================== */

import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS, LEVELS, functionById } from "../data/catalog";
import { GAP_LABEL, formatValue, unitLabel } from "../data/lens";
import type { IndicatorStat, Scope } from "../data/lens";
import type { RiverCounts } from "./ValueRiver";

export function riverCounts(stats: IndicatorStat[]): RiverCounts {
  const counts = Object.fromEntries(
    FUNCTIONS.map((f) => [f.id, Object.fromEntries(LEVELS.map((l) => [l.id, { total: 0, data: 0 }]))]),
  ) as RiverCounts;
  for (const s of stats) {
    const cell = counts[s.indicator.funcion][s.indicator.nivel];
    cell.total += 1;
    if (s.current) cell.data += 1;
  }
  return counts;
}

/** Cambio frente al periodo anterior, dicho con palabras y no solo con color. */
export function Change({ stat }: { stat: IndicatorStat }) {
  const now = stat.current?.valor;
  const before = stat.previous?.valor;
  if (now == null || before == null || !stat.previousPeriod) return null;
  const pct = stat.indicator.ficha?.factor === 100;
  const diff = now - before;
  const shown = pct
    ? `${diff > 0 ? "+" : ""}${diff.toLocaleString("es-CO", { maximumFractionDigits: 1 })} pp`
    : `${diff > 0 ? "+" : ""}${before === 0 ? "—" : ((diff / before) * 100).toLocaleString("es-CO", { maximumFractionDigits: 0 })} %`;
  const better = stat.indicator.ficha?.sentido === "menor_mejor" ? diff < 0 : diff > 0;
  const flat = Math.abs(diff) < 1e-9;
  return (
    <span className="imp-change" data-dir={flat ? "flat" : diff > 0 ? "up" : "down"} data-good={flat ? undefined : better}>
      <Icon name="arrow-right" size={12} className="imp-change__arrow" />
      {flat ? "igual" : shown} <small>frente a {stat.previousPeriod}</small>
    </span>
  );
}

const SHAPES = ["2.4rem 1.2rem 2.6rem 1.1rem", "1.3rem 2.6rem 1.2rem 2.4rem", "2.8rem 1.4rem 1.6rem 2.2rem", "1.6rem 2.2rem 2.8rem 1.2rem"];
export const pebbleShape = (seed: string) => SHAPES[[...seed].reduce((t, c) => t + c.charCodeAt(0), 0) % SHAPES.length];

export function IndicatorPebble({ stat, scope }: { stat: IndicatorStat; scope: Scope }) {
  const { indicator } = stat;
  const fn = functionById[indicator.funcion];
  const to = `/impacto/indicador/${indicator.codigo}${scope.kind === "institucion" ? "" : `?en=${scope.kind}:${scope.slug}`}`;
  const style = { "--tone": fn.tone } as CSSProperties;

  if (!stat.current) {
    return (
      <li className="imp-pebble" data-empty style={style}>
        <span className="imp-pebble__code">{indicator.codigo}</span>
        <span className="imp-pebble__name">{indicator.nombre}</span>
        <span className="imp-pebble__gap">{stat.gap ? GAP_LABEL[stat.gap] : "Sin cifra"}</span>
      </li>
    );
  }

  return (
    <li className="imp-pebble" style={style}>
      <Link to={to}>
        <span className="imp-pebble__code">{indicator.codigo}</span>
        <span className="imp-pebble__name">{indicator.nombre}</span>
        <span className="imp-pebble__figure">
          <strong>{formatValue(indicator, stat.current.valor)}</strong>
          <small>{unitLabel(indicator)} · {stat.period}</small>
        </span>
        <Change stat={stat} />
      </Link>
    </li>
  );
}

export function IllustrativeNote() {
  return (
    <p className="imp-note" role="note">
      <Icon name="alert" size={14} />
      <span>
        Prototipo: el catálogo es la matriz vr7 real; las cifras de programas son <strong>datos ilustrativos</strong>.
      </span>
    </p>
  );
}

export const FUNCTION_ORDER = FUNCTIONS.map((f) => f.id);
