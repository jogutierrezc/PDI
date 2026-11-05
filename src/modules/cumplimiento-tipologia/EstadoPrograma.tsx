/* =============================================================================
   Cumplimiento de Tipología · el estado del programa: cuántos cumplen, por qué
   no y qué perfiles conviene cambiar. Todo sale de las filas de ct_resumen ya
   calculadas en el corte; aquí solo se cuenta.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../components/ui/Icon";
import { CAUSAS } from "./motor/tipologia";
import { CANASTAS_UI, LECTURA, entero, horas, type Resumen } from "./modelo";
import { PerfilTag } from "./partes";

export function EstadoPrograma({ filas, programa, sede }: { filas: Resumen[]; programa: string; sede: string }) {
  const r = useMemo(() => {
    const cumplen = filas.filter((f) => f.veredicto === "Cumple").length;
    const no = filas.filter((f) => f.veredicto === "No cumple").length;
    const sinRegla = filas.length - cumplen - no;
    const evaluables = cumplen + no;

    const master: Record<string, number> = {};
    for (const f of filas) master[f.estado_master] = (master[f.estado_master] ?? 0) + 1;

    const porCanasta = CANASTAS_UI.map((c) => ({ ...c, total: filas.reduce((suma, f) => suma + Number(f[c.campo] ?? 0), 0) }));
    const totalHoras = porCanasta.reduce((suma, c) => suma + c.total, 0);

    const causas = new Map<string, number>();
    for (const f of filas) for (const c of f.causas ?? []) causas.set(c, (causas.get(c) ?? 0) + 1);
    const topCausas = [...causas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const cambios = new Map<string, { de: string; a: string; n: number }>();
    for (const f of filas) {
      if (f.sugerencia !== "cambiar" || !f.perfil_sugerido) continue;
      const k = `${f.perfil}>${f.perfil_sugerido}`;
      const previo = cambios.get(k) ?? { de: f.perfil, a: f.perfil_sugerido, n: 0 };
      previo.n += 1;
      cambios.set(k, previo);
    }
    const ajustar = filas.filter((f) => f.sugerencia === "ajustar").length;

    return { cumplen, no, sinRegla, evaluables, master, porCanasta, totalHoras, topCausas, maxCausa: topCausas[0]?.[1] ?? 1, cambios: [...cambios.values()].sort((a, b) => b.n - a.n), ajustar };
  }, [filas]);

  const pct = r.evaluables > 0 ? Math.round((r.cumplen / r.evaluables) * 100) : 0;
  const ancho = (n: number) => `${filas.length > 0 ? (n / filas.length) * 100 : 0}%`;

  return (
    <>
      <section className="ct-estado" aria-label="Estado del programa">
        <div>
          {r.evaluables > 0 ? (
            <p className="ct-lectura">
              <b className="ct-num" data-t={pct >= LECTURA.titularBueno ? "ok" : "risk"}>
                {r.cumplen} de {r.evaluables}
              </b>{" "}
              profesores de {programa} en {sede} cumplen la tipología de su contrato.
            </p>
          ) : (
            <p className="ct-lectura">
              Ningún profesor de {programa} en {sede} tiene una regla automática que evaluar.
            </p>
          )}
          <div className="ct-stack" role="img" aria-label={`${r.cumplen} cumplen, ${r.no} no cumplen${r.sinRegla ? `, ${r.sinRegla} sin regla automática` : ""}`}>
            <i data-t="ok" style={{ width: ancho(r.cumplen) }} />
            <i data-t="risk" style={{ width: ancho(r.no) }} />
            {r.sinRegla > 0 && <i data-t="neutral" style={{ width: ancho(r.sinRegla) }} />}
          </div>
          <ul className="ct-legend">
            <li>
              <span className="ct-dot" data-t="ok" />
              Cumple <b className="ct-num">{r.cumplen}</b>
            </li>
            <li>
              <span className="ct-dot" data-t="risk" />
              No cumple <b className="ct-num">{r.no}</b>
            </li>
            {r.sinRegla > 0 && (
              <li>
                <span className="ct-dot" data-t="neutral" />
                Sin regla automática <b className="ct-num">{r.sinRegla}</b>
              </li>
            )}
          </ul>
          <div className="ct-masters">
            <span>Estado en Master:</span>
            <span>
              <b className="ct-num">{r.master.APROBADA ?? 0}</b> aprobadas
            </span>
            <span>
              <b className="ct-num">{r.master.PREAPROBADA ?? 0}</b> preaprobadas
            </span>
            {(r.master.NO_DETERMINADO ?? 0) > 0 && (
              <span>
                <b className="ct-num">{r.master.NO_DETERMINADO}</b> por confirmar
              </span>
            )}
            {(r.master.SIN_DATO_MASTER ?? 0) > 0 && (
              <span>
                <b className="ct-num">{r.master.SIN_DATO_MASTER}</b> sin dato
              </span>
            )}
          </div>
        </div>

        <div>
          <h2 className="ct-h2">Horas semanales del programa por canasta</h2>
          <p className="ct-sub">
            Suma de las {horas(r.totalHoras)} h asignadas a los {filas.length} profesores
          </p>
          <div className="ct-stack ct-stack--hours" role="img" aria-label="Horas por canasta de Master">
            {r.porCanasta.map((c) => (
              <i key={c.campo} style={{ width: `${r.totalHoras > 0 ? (c.total / r.totalHoras) * 100 : 0}%`, background: c.color }} />
            ))}
          </div>
          <ul className="ct-hrs">
            {r.porCanasta.map((c) => (
              <li key={c.campo}>
                <span className="ct-dot" style={{ background: c.color }} />
                <span>{c.nombre}</span>
                <b className="ct-num">{horas(c.total)} h</b>
                <span className="ct-pct ct-num">{r.totalHoras > 0 ? Math.round((c.total / r.totalHoras) * 100) : 0} %</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="ct-row2">
        <div className="ct-panel">
          <h2 className="ct-h2">Qué está generando las preventivas</h2>
          <p className="ct-sub">Número de profesores afectados por cada causa</p>
          {r.topCausas.length > 0 ? (
            r.topCausas.map(([causa, n]) => (
              <div className="ct-cause" key={causa}>
                <span>{CAUSAS[causa]?.detalle ?? causa}</span>
                <b className="ct-num">{n}</b>
                <span className="ct-bar" aria-hidden="true">
                  <i style={{ width: `${(n / r.maxCausa) * 100}%` }} />
                </span>
              </div>
            ))
          ) : (
            <p className="ct-vacio">Ninguna preventiva en este programa y sede.</p>
          )}
        </div>

        <div className="ct-panel">
          <h2 className="ct-h2">Tipologías que el sistema recomienda cambiar</h2>
          <p className="ct-sub">Perfil actual y el perfil que sí cumple con la carga que ya tienen</p>
          {r.cambios.length > 0 ? (
            r.cambios.map((c) => (
              <div className="ct-cambio" key={`${c.de}>${c.a}`}>
                <PerfilTag perfil={c.de} />
                <span className="ct-arrow">
                  <Icon name="arrow-right" size={14} />
                </span>
                <PerfilTag perfil={c.a} sugerido />
                <span className="ct-cambio__n">
                  <b className="ct-num">{c.n}</b> profesor{c.n > 1 ? "es" : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="ct-vacio">Con la carga actual no hay cambios de perfil que corrijan un incumplimiento.</p>
          )}
          {r.ajustar > 0 && (
            <div className="ct-cambio">
              <span className="ct-chip" data-t="wait">
                <Icon name="arrow-right" size={13} />
                Ajustar carga
              </span>
              <span className="ct-cambio__txt">
                <b className="ct-num">{r.ajustar}</b> profesores no encajan en ningún perfil sin mover horas.
              </span>
            </div>
          )}
          <p className="ct-nota">{entero(filas.length)} profesores en el corte de este programa y sede.</p>
        </div>
      </section>
    </>
  );
}
