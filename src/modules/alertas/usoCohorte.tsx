/* Portal de alertas · la cohorte del alcance elegido y los estados de carga que comparten las pantallas. */

import { useMemo, type ReactNode } from "react";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { trayectorias, type FilaHistorial, type Trayectoria } from "./cohorte";
import type { CtxAlertas } from "./contexto";
import { mensajeAlertas, useHistorial } from "./datos";

export interface Cohorte {
  /** Todas las filas del programa (todos los semestres): para comparar semestres. */
  filas: FilaHistorial[];
  /** Quienes están en el alcance: programa y semestre elegidos. */
  t: Trayectoria[];
  /** Hay estudiantes con notas en el periodo pero ninguno en el semestre elegido. */
  semestreVacio: boolean;
}

export function useCohorte(ctx: CtxAlertas) {
  const q = useHistorial(ctx.sede, ctx.historial, ctx.p);
  const cohorte = useMemo<Cohorte>(() => {
    const filas = q.data ?? [];
    const t = trayectorias(filas, ctx.periodo, ctx.s);
    return { filas, t, semestreVacio: ctx.s !== null && t.length === 0 && trayectorias(filas, ctx.periodo, null).length > 0 };
  }, [q.data, ctx.periodo, ctx.s]);
  return { q, cohorte };
}

/** Cargando, error y vacío de lo que depende del historial; si todo está bien, muestra los hijos. */
export function Estado({ q, cohorte, ctx, children }: { q: { isPending: boolean; error: unknown; refetch: () => unknown }; cohorte: Cohorte; ctx: CtxAlertas; children: ReactNode }) {
  if (q.isPending) return <LoadingBlock rows={5} label="Leyendo las notas del programa" />;
  if (q.error) return <ErrorBlock error={new Error(mensajeAlertas(q.error))} title="No se pudo leer el historial" onRetry={() => void q.refetch()} />;
  if (cohorte.semestreVacio)
    return (
      <EmptyBlock
        title={`Nadie está en el semestre ${ctx.s} de ${ctx.programa.nombre}`}
        hint="El semestre sale del reporte de créditos (dv_cred) del Warehouse. Pruebe con otro semestre, con «Todos los semestres», o pida a Planeación que cargue ese reporte para este periodo."
        action={
          <button type="button" className="al-boton" onClick={() => ctx.fijar({ s: null })}>
            Ver todos los semestres
          </button>
        }
      />
    );
  if (cohorte.t.length === 0) return <EmptyBlock title={`Aún no hay notas de ${ctx.periodo} para este programa`} hint="Las notas salen del «Reporte global de notas» de Davinci, que Planeación carga en el Warehouse. Pruebe con otro periodo." />;
  return <>{children}</>;
}
