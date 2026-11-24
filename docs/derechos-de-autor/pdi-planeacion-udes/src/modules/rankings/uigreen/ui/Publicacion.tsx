/* =============================================================================
   UI GreenMetric · publicación en la web (solo administración): qué sale y qué
   no, y por qué. El interruptor es por indicador; «Publicar los N listos» pasa
   por todos los que ya cumplen. Los bloqueos y avisos los calcula la base
   (ugm_publicacion_estado); si algo deja de cumplirse, se retira solo.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { errorDe, useCalculados, useMarcarSensible, usePublicacionEstado, usePublicar } from "../datos";
import { compararQ } from "../lib/catalogo";
import { formatearNumero } from "../lib/calculo";
import type { PreguntaCiclo, PublicacionEstado, RespuestaUgm } from "../lib/tipos";
import { Alerta, Cargando, ErrorConsulta, Estado, Interruptor, Vacio, fechaCorta } from "./comunes";
import { useUgm } from "./contexto";

function Motivos({ e }: { e: PublicacionEstado }) {
  return (
    <>
      {e.bloqueos.length > 0 && (
        <ul className="ugm-motivos ugm-motivos--no">
          {e.bloqueos.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {e.avisos.length > 0 && (
        <ul className="ugm-motivos ugm-motivos--aviso">
          {e.avisos.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** El interruptor de un indicador, también dentro de su ficha. */
export function PublicarIndicador({ r }: { r: RespuestaUgm }) {
  const u = useUgm();
  const est = usePublicacionEstado(r.estado === "aprobado" ? r.id : undefined);
  const publicar = usePublicar();
  const sensible = useMarcarSensible();
  if (r.estado !== "aprobado") return <p className="ugm-muted">Solo sale a la web un indicador aprobado. Hoy está «{r.estado.replace("_", " ")}».</p>;
  if (est.isLoading) return <Cargando />;
  if (est.error) return <ErrorConsulta error={est.error} />;
  const e = est.data ?? { puede: false, bloqueos: [], avisos: [] };
  return (
    <div className="ugm-form">
      <Interruptor
        activo={r.publicar_web}
        etiqueta="Publicar en la web"
        deshabilitado={!u.esAdmin || (!e.puede && !r.publicar_web)}
        detalle={r.publicar_web ? `Visible desde ${fechaCorta(r.publicado_at)}.` : e.puede ? "Apagado por defecto. Solo la administración lo enciende." : "No se puede encender todavía."}
        onChange={(v) => void u.hacer(() => publicar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, publicar: v }), v ? "Publicado en la web." : "Retirado de la web.")}
      />
      {u.esAdmin && (
        <Interruptor
          activo={r.sensible}
          etiqueta="Contiene datos sensibles"
          detalle="Un indicador sensible nunca sale en la web."
          onChange={(v) => void u.hacer(() => sensible.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, valor: v }), v ? "Marcado como sensible." : "Marca de sensible quitada.")}
        />
      )}
      {r.retirado_at && !r.publicar_web && <Alerta tipo="aviso">Se retiró de la web el {fechaCorta(r.retirado_at)}{r.retiro_motivo ? `: ${r.retiro_motivo}` : ""}.</Alerta>}
      <Motivos e={e} />
    </div>
  );
}

export function Publicacion() {
  const u = useUgm();
  const publicar = usePublicar();
  const calc = useCalculados(u.ciclo.id);
  const [progreso, setProgreso] = useState<string | null>(null);
  const aprobadas = useMemo(() => u.respuestas.filter((r) => r.estado === "aprobado").sort((a, b) => compararQ(a.q, b.q)), [u.respuestas]);
  const resto = u.respuestas.filter((r) => r.estado !== "aprobado");

  const estados = useQueries({
    queries: aprobadas.map((r) => ({
      queryKey: ["ugm", "publicacion", r.id],
      queryFn: async () => {
        const x = await supabase.rpc("ugm_publicacion_estado", { p_respuesta: r.id });
        if (x.error) throw errorDe(x.error);
        return x.data as PublicacionEstado;
      },
    })),
  });
  const porId = new Map(aprobadas.map((r, i) => [r.id, estados[i]]));
  const listos = aprobadas.filter((r) => !r.publicar_web && porId.get(r.id)?.data?.puede);
  const publicados = u.respuestas.filter((r) => r.publicar_web).length;
  const cargando = estados.some((e) => e.isLoading);

  const publicarListos = async () => {
    let hechos = 0;
    for (const r of listos) {
      setProgreso(`Publicando ${hechos + 1} de ${listos.length}…`);
      const ok = await u.hacer(() => publicar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, publicar: true }));
      if (!ok) break;
      hechos += 1;
    }
    setProgreso(null);
    if (hechos) u.avisar(`${hechos} ${hechos === 1 ? "indicador publicado" : "indicadores publicados"}.`);
  };

  if (!u.esAdmin) return <Vacio>La publicación en la web la gestiona la administración del ranking.</Vacio>;

  return (
    <div className="ugm-pila">
      <section className="ugm-sec ugm-resumen-pub">
        <p>
          <b className="ugm-num">{publicados}</b> publicados · <b className="ugm-num">{listos.length}</b> listos para publicar · <b className="ugm-num">{aprobadas.length - listos.length - aprobadas.filter((r) => r.publicar_web).length}</b> con bloqueos ·{" "}
          <b className="ugm-num">{resto.length}</b> sin aprobar
        </p>
        <button type="button" className="ugm-btn ugm-btn--pri" disabled={listos.length === 0 || !!progreso} onClick={() => void publicarListos()}>
          {progreso ?? `Publicar los ${listos.length} listos`}
        </button>
      </section>

      <section className="ugm-sec">
        <h2>Indicadores aprobados</h2>
        {cargando && <Cargando />}
        {aprobadas.length === 0 ? (
          <Vacio>Todavía no hay indicadores aprobados.</Vacio>
        ) : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">En la web</th>
                  <th scope="col">Por qué sí o por qué no</th>
                </tr>
              </thead>
              <tbody>
                {aprobadas.map((r) => (
                  <Fila key={r.id} r={r} p={u.pregQ.get(r.q)} est={porId.get(r.id)?.data} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ugm-sec">
        <h2>Indicadores calculados</h2>
        <p className="ugm-muted">Salen de las fórmulas de la guía con datos de otras preguntas. Solo se publican cuando todas sus entradas están y publicadas.</p>
        {calc.isLoading ? (
          <Cargando />
        ) : calc.error ? (
          <ErrorConsulta error={calc.error} />
        ) : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col" className="ugm-der">Valor</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(calc.data ?? []).map((c) => (
                  <tr key={c.q}>
                    <th scope="row" data-et="Indicador">
                      {c.q} · {c.indicador}
                    </th>
                    <td data-et="Valor" className="ugm-der ugm-num">
                      {formatearNumero(c.valor, 4)} {c.unidad ?? ""}
                    </td>
                    <td data-et="Estado">
                      {c.publicable ? (
                        <span className="ugm-etq ugm-etq--ok">Publicable</span>
                      ) : (
                        <span className="ugm-etq ugm-etq--aviso">
                          {c.faltan.length ? `Faltan datos: ${c.faltan.join(", ")}` : c.sin_publicar.length ? `Sin publicar: ${c.sin_publicar.join(", ")}` : "No publicable"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {resto.length > 0 && (
        <section className="ugm-sec">
          <h2>Sin aprobar: no salen</h2>
          <details className="ugm-detalles">
            <summary>
              {resto.length} indicadores todavía no están aprobados
            </summary>
            <ul className="ugm-lista">
              {resto.sort((a, b) => compararQ(a.q, b.q)).map((r) => (
                <li key={r.id} className="ugm-fila-simple">
                  <button type="button" className="ugm-link" onClick={() => u.abrir(r.q)}>
                    {r.q} · {u.pregQ.get(r.q)?.nombre_es}
                  </button>
                  <Estado estado={r.estado} />
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function Fila({ r, p, est }: { r: RespuestaUgm; p?: PreguntaCiclo; est?: PublicacionEstado }) {
  const u = useUgm();
  const publicar = usePublicar();
  return (
    <tr>
      <th scope="row" data-et="Indicador">
        <button type="button" className="ugm-link ugm-link--bloque" onClick={() => u.abrir(r.q)}>
          {r.q} · {p?.nombre_es}
        </button>
      </th>
      <td data-et="En la web">
        <Interruptor
          activo={r.publicar_web}
          etiqueta={r.publicar_web ? "Publicado" : "No publicado"}
          deshabilitado={!est || (!est.puede && !r.publicar_web)}
          onChange={(v) => void u.hacer(() => publicar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, publicar: v }), v ? `${r.q} publicado.` : `${r.q} retirado.`)}
        />
      </td>
      <td data-et="Motivos">{est ? est.bloqueos.length + est.avisos.length > 0 ? <Motivos e={est} /> : <span className="ugm-muted">Cumple todo.</span> : <span className="ugm-muted">Revisando…</span>}</td>
    </tr>
  );
}
