/* =============================================================================
   UI GreenMetric · «Mis indicadores»: solo lo que le corresponde a quien mira,
   como responsable, apoyo, revisor o jefe de la oficina de quien responde.
   ========================================================================== */

import { useMemo } from "react";
import { compararQ, codigoConPunto } from "../lib/catalogo";
import type { PreguntaCiclo, RespuestaUgm } from "../lib/tipos";
import { Estado, Vacio, diasHasta, fechaCorta, textoVence } from "./comunes";
import { useUgm } from "./contexto";

type Par = { r: RespuestaUgm; p: PreguntaCiclo };

export function Mios() {
  const u = useUgm();
  const mias = useMemo(() => u.asignaciones.filter((a) => a.usuario_id === u.miId), [u.asignaciones, u.miId]);

  const grupos = useMemo(() => {
    const par = (q: string): Par | null => {
      const r = u.porQ.get(q);
      const p = u.pregQ.get(q);
      return r && p ? { r, p } : null;
    };
    const propias = new Set(mias.filter((a) => a.q && a.rol !== "revisor").map((a) => a.q as string));
    const cats = new Set(mias.filter((a) => a.rol === "revisor" && a.categoria).map((a) => a.categoria));
    const qsRevisor = new Set(mias.filter((a) => a.rol === "revisor" && a.q).map((a) => a.q as string));
    const ordenar = (l: Par[]) => l.sort((a, b) => compararQ(a.p.q, b.p.q));
    const porHacer = ordenar([...propias].map(par).filter((x): x is Par => !!x && ["asignado", "en_captura", "devuelto"].includes(x.r.estado)));
    const enCurso = ordenar([...propias].map(par).filter((x): x is Par => !!x && ["enviado", "en_revision"].includes(x.r.estado)));
    const listos = ordenar([...propias].map(par).filter((x): x is Par => !!x && x.r.estado === "aprobado"));
    const porRevisar = ordenar(
      u.preguntas
        .filter((p) => cats.has(p.categoria) || qsRevisor.has(p.q))
        .map((p) => par(p.q))
        .filter((x): x is Par => !!x && ["enviado", "en_revision"].includes(x.r.estado)),
    );
    const deOficina = u.esAdmin ? [] : ordenar(u.respuestas.filter((r) => !propias.has(r.q) && u.actorEn(r.q) === "jefe").map((r) => par(r.q)).filter((x): x is Par => !!x));
    return { porHacer, enCurso, listos, porRevisar, deOficina };
  }, [mias, u]);

  const total = grupos.porHacer.length + grupos.enCurso.length + grupos.listos.length + grupos.porRevisar.length + grupos.deOficina.length;
  if (total === 0) {
    return <Vacio>No tiene indicadores asignados en este ciclo.{u.esAdmin ? " Asigne desde la vista Asignación." : ""}</Vacio>;
  }

  const lista = (items: Par[], conFecha: boolean) => (
    <ul className="ugm-lista ugm-lista--mios">
      {items.map(({ r, p }) => {
        const d = diasHasta(u.vence(p.q));
        return (
          <li key={p.q}>
            <button type="button" className="ugm-fila-btn" onClick={() => u.abrir(p.q)}>
              <span className="ugm-num ugm-cod">{p.q}</span>
              <span>
                {p.nombre_es}
                <small>
                  {p.categoria}
                  {p.indicador ? ` · ${codigoConPunto(p.indicador)}` : ""}
                  {conFecha && u.vence(p.q) ? ` · entrega ${fechaCorta(u.vence(p.q))} (${textoVence(u.vence(p.q)).toLowerCase()})` : ""}
                </small>
              </span>
              <span className={d !== null && d < 0 && conFecha ? "ugm-fecha--tarde" : undefined}>
                <Estado estado={r.estado} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="ugm-pila">
      {grupos.porHacer.length > 0 && (
        <section className="ugm-sec">
          <h2>Por responder <span className="ugm-num ugm-muted">({grupos.porHacer.length})</span></h2>
          {lista(grupos.porHacer, true)}
        </section>
      )}
      {grupos.porRevisar.length > 0 && (
        <section className="ugm-sec">
          <h2>Por revisar <span className="ugm-num ugm-muted">({grupos.porRevisar.length})</span></h2>
          {lista(grupos.porRevisar, false)}
        </section>
      )}
      {grupos.enCurso.length > 0 && (
        <section className="ugm-sec">
          <h2>Enviados, en revisión <span className="ugm-num ugm-muted">({grupos.enCurso.length})</span></h2>
          {lista(grupos.enCurso, false)}
        </section>
      )}
      {grupos.deOficina.length > 0 && (
        <section className="ugm-sec">
          <h2>De mi oficina <span className="ugm-num ugm-muted">({grupos.deOficina.length})</span></h2>
          <p className="ugm-muted">Solo lectura: usted ve lo que responde su oficina.</p>
          {lista(grupos.deOficina, true)}
        </section>
      )}
      {grupos.listos.length > 0 && (
        <section className="ugm-sec">
          <h2>Aprobados <span className="ugm-num ugm-muted">({grupos.listos.length})</span></h2>
          {lista(grupos.listos, false)}
        </section>
      )}
    </div>
  );
}
