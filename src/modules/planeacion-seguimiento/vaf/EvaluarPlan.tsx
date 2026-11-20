/* =============================================================================
   Planeación y Seguimiento · VAF · FICHA DE EVALUACIÓN DEL PLAN, a pantalla completa (`vaf-evaluar/<plan>[?version=]`).
   La VAF (financiero) y el administrador la resuelven en dos pasos (Decisión → Revisar y confirmar); una resuelta no se
   edita: una nueva versión abre otra. Observaciones de al menos 20 caracteres con ajustes o si no es viable. Aprobador y
   lector la ven en lectura. Muestra el historial de evaluaciones del plan.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { useAct } from "../actividades/hooks";
import { Campo, FormularioPasos, useBorradorLocal, type ErrorCampo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { fecha } from "../modelo";
import { useVafEvaluaciones, useVafOps } from "./hooksVaf";
import { MIN_OBSERVACIONES, ROTULO_EVALUACION, antiguedadDias, esFinanciero, esResuelta, textoAntiguedad, validarEvaluacion, type DatosEvaluacion, type EvaluacionVaf } from "./modeloVaf";
import { ChipEstadoFinanciero, Pesos } from "./partesVaf";
import { useSearchParams } from "react-router-dom";

type Resultado = "aprobada" | "aprobada_con_ajustes" | "no_viable";
const OPCIONES: { id: Resultado; titulo: string; detalle: string }[] = [
  { id: "aprobada", titulo: "Aprobada", detalle: "La financiación es viable tal como se pidió o con el monto que indique." },
  { id: "aprobada_con_ajustes", titulo: "Aprobada con ajustes", detalle: "Se aprueba un monto distinto o con condiciones: explíquelas (al menos 20 caracteres)." },
  { id: "no_viable", titulo: "No viable", detalle: "No hay forma de financiarla como está: explíquelo (al menos 20 caracteres). La oficina verá su razón." },
];

export function EvaluarPlan({ id }: { id: string }) {
  const { ruta, nivel, planes } = usePs();
  const [params] = useSearchParams();
  const q = useVafEvaluaciones(id);
  const plan = planes.find((p) => p.id === id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Financiación y presupuesto", a: ruta("financiacion") }, { texto: "Evaluar el plan" }];
  const regresar = ruta("financiacion");
  const abierta = useMemo(() => {
    const lista = q.data ?? [];
    const pedida = params.get("version");
    return lista.find((e) => (!pedida || e.versionId === pedida) && !esResuelta(e.estado)) ?? lista.find((e) => !esResuelta(e.estado)) ?? null;
  }, [q.data, params]);
  if (q.isPending) return <PaginaCompleta titulo="Evaluar el plan" migas={migas} regresarA={regresar}><LoadingBlock rows={3} label="Cargando la evaluación" /></PaginaCompleta>;
  if (q.error) return <PaginaCompleta titulo="Evaluar el plan" migas={migas} regresarA={regresar}><p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error).message}</p></PaginaCompleta>;
  const lista = q.data ?? [];
  const nombre = plan?.nombre ?? lista[0]?.plan ?? "el plan";
  if (!abierta || !esFinanciero(nivel)) {
    return (
      <PaginaCompleta titulo="Evaluación financiera" subtitulo={<>«{nombre}»</>} migas={migas} regresarA={regresar}>
        {abierta && !esFinanciero(nivel) ? <p className="ps-aviso"><Icon name="lock" size={16} /> Esta evaluación espera a la VAF. Usted la ve en solo lectura.</p> : !abierta ? <p className="ps-aviso"><Icon name="info" size={16} /> No hay una evaluación abierta para este plan. Se abre una al publicar una versión con montos nuevos.</p> : null}
        <Historial lista={lista} />
      </PaginaCompleta>
    );
  }
  return <Ficha e={abierta} lista={lista} migas={migas} regresar={regresar} />;
}

function Historial({ lista }: { lista: EvaluacionVaf[] }) {
  if (!lista.length) return <p className="ps-nota">Este plan aún no tiene evaluaciones.</p>;
  return (
    <section aria-labelledby="ev-hist"><h2 id="ev-hist">Historial de evaluaciones</h2>
      <ul className="ps-avances">
        {lista.map((e) => (
          <li key={e.id} className="ps-avance" data-estado={e.estado}>
            <header><span className="ps-avance__n"><b>Versión {e.version}</b> · solicitado <Pesos n={e.montoSolicitado} />{e.montoAprobado !== null ? <> · aprobado <Pesos n={e.montoAprobado} fuerte /></> : null}</span><ChipEstadoFinanciero estado={e.estado} corto /></header>
            {e.fuente ? <p className="ps-avance__meta">Fuente: {e.fuente}</p> : null}
            {e.observaciones ? <blockquote>{e.observaciones}</blockquote> : null}
            <p className="ps-avance__meta">{e.evaluadoEn ? `Evaluó ${e.evaluadoPor?.nombre ?? "la VAF"} el ${fecha(e.evaluadoEn)}` : `Abierta el ${fecha(e.creadoEn)} · ${ROTULO_EVALUACION[e.estado].toLowerCase()}`}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ficha({ e, lista, migas, regresar }: { e: EvaluacionVaf; lista: EvaluacionVaf[]; migas: { texto: string; a?: string }[]; regresar: string }) {
  const { ir, ruta } = usePs();
  const hoy = useAct().hoy;
  const ops = useVafOps();
  const [v, setV] = useState<{ estado: Resultado | ""; monto: string; fuente: string; obs: string }>({ estado: "", monto: String(e.montoSolicitado), fuente: "", obs: "" });
  const [paso, setPaso] = useState("decision");
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const { guardado, descartar } = useBorradorLocal(`vaf-eval-${e.id}`, v, setV);
  const monto = v.monto.trim() === "" ? null : Number(v.monto.replace(/[.\s]/g, "").replace(",", "."));
  const datos: DatosEvaluacion = { estado: v.estado, montoAprobado: v.estado === "no_viable" ? null : monto, fuente: v.fuente, observaciones: v.obs };
  const errs = validarEvaluacion(datos);
  const porCampo = new Map(errs.map((x) => [x.campo, x.mensaje]));
  const mostrar = (c: string) => (tocados[c] ? (porCampo.get(c) ?? null) : null);
  const salir = (c: string) => () => setTocados((t) => ({ ...t, [c]: true }));
  const dias = antiguedadDias(e.creadoEn, `${hoy}T12:00:00Z`);
  const validar = (): ErrorCampo[] => { setTocados({ "ev-estado": true, "ev-monto": true, "ev-obs": true, "ev-fuente": true }); return errs.map((x) => ({ campo: x.campo, mensaje: x.mensaje })); };
  return (
    <FormularioPasos
      titulo="Evaluación financiera"
      subtitulo={<>«{e.plan}» · {e.oficina?.nombre ?? "sin oficina"} · versión {e.version} · <ChipEstadoFinanciero estado={e.estado} corto /></>}
      migas={migas}
      regresarA={regresar}
      paso={paso}
      onPaso={setPaso}
      etiquetaEnviar="Registrar la evaluación"
      enviando={ops.evaluar.isPending}
      errorEnvio={ops.evaluar.error ? (ops.evaluar.error as Error).message : null}
      guardado={guardado}
      accionesPie={e.estado === "pendiente" ? <button type="button" className="button-secondary" onClick={() => ops.enRevision.mutate(e.id)} disabled={ops.enRevision.isPending}>Marcar «en revisión»</button> : undefined}
      onEnviar={async () => {
        await ops.evaluar.mutateAsync({ planId: e.planId, versionId: e.versionId, datos });
        descartar();
        ir(`${ruta("financiacion")}`, { reemplazar: true });
      }}
      pasos={[
        {
          id: "decision",
          titulo: "Su decisión",
          descripcion: `Lo solicitado es ${"$"} ${new Intl.NumberFormat("es-CO").format(e.montoSolicitado)}. La evaluación no bloquea a la oficina; una vez registrada no se edita.`,
          validar,
          contenido: (
            <div className="ps-campos">
              <div className="ps-fila-act ps-fila-act--ficha"><span>Solicitado <Pesos n={e.montoSolicitado} fuerte /></span><span className="ps-cola__espera"><Icon name="clock" size={13} /> Espera {textoAntiguedad(dias).replace("desde ", "desde ")}</span>{e.estado === "en_revision" ? <span className="ps-est" data-tono="activo"><Icon name="clock" size={13} />{ROTULO_EVALUACION.en_revision}</span> : null}</div>
              {e.estado === "pendiente" ? <p className="ps-nota"><Icon name="info" size={13} /> Puede marcarla «en revisión» (abajo) para que se sepa que la VAF ya la tomó.</p> : null}
              <fieldset className="ps-radios" id="ev-estado" aria-describedby={mostrar("ev-estado") ? "ev-estado-error" : undefined}>
                <legend>Resultado <span className="ps-oblig">(obligatorio)</span></legend>
                {OPCIONES.map((o) => (
                  <label key={o.id} className="ps-opcion ps-opcion--grande ps-opcion--tarjeta"><input type="radio" name="ev-estado" checked={v.estado === o.id} onChange={() => setV((x) => ({ ...x, estado: o.id }))} onBlur={salir("ev-estado")} /><span><strong>{o.titulo}</strong><small>{o.detalle}</small></span></label>
                ))}
              </fieldset>
              {mostrar("ev-estado") ? <p className="ps-campo__error" id="ev-estado-error"><Icon name="alert" size={14} /> {mostrar("ev-estado")}</p> : null}
              {v.estado && v.estado !== "no_viable" ? (
                <Campo id="ev-monto" etiqueta="Monto aprobado (pesos)" ayuda={`Solo el número. Equivale a ${monto !== null && Number.isFinite(monto) ? `$ ${new Intl.NumberFormat("es-CO").format(monto)}` : "—"}.`} error={mostrar("ev-monto")} obligatorio>
                  {(p) => <input {...p} type="text" inputMode="numeric" value={v.monto} onChange={(ev) => setV((x) => ({ ...x, monto: ev.target.value }))} onBlur={salir("ev-monto")} autoComplete="off" />}
                </Campo>
              ) : null}
              <Campo id="ev-fuente" etiqueta="Fuente de financiación" ayuda="Opcional. De dónde saldrán los recursos." error={mostrar("ev-fuente")}>
                {(p) => <input {...p} type="text" maxLength={200} value={v.fuente} onChange={(ev) => setV((x) => ({ ...x, fuente: ev.target.value }))} onBlur={salir("ev-fuente")} autoComplete="off" />}
              </Campo>
              <Campo id="ev-obs" etiqueta="Observaciones" ayuda={v.estado === "aprobada_con_ajustes" || v.estado === "no_viable" ? `Obligatorias: al menos ${MIN_OBSERVACIONES} caracteres (lleva ${v.obs.trim().length}). Las verá la oficina dueña.` : `Opcional (${v.obs.length}/2000).`} error={mostrar("ev-obs")} obligatorio={v.estado === "aprobada_con_ajustes" || v.estado === "no_viable"}>
                {(p) => <textarea {...p} rows={4} value={v.obs} onChange={(ev) => setV((x) => ({ ...x, obs: ev.target.value }))} onBlur={salir("ev-obs")} />}
              </Campo>
              <Historial lista={lista.filter((x) => x.id !== e.id)} />
            </div>
          ),
        },
        {
          id: "revisar",
          titulo: "Revisar y confirmar",
          descripcion: "Confirme. Una evaluación resuelta no se edita; se avisa a la oficina dueña del plan.",
          contenido: (
            <>
              <dl className="ps-ficha">
                <div><dt>Plan y versión</dt><dd>{e.plan} · {e.version}</dd></div>
                <div><dt>Solicitado</dt><dd><Pesos n={e.montoSolicitado} /></dd></div>
                <div><dt>Resultado</dt><dd>{v.estado ? ROTULO_EVALUACION[v.estado] : "—"}</dd></div>
                <div><dt>Monto aprobado</dt><dd>{v.estado === "no_viable" ? "No aplica" : <Pesos n={monto} />}{monto !== null && v.estado && v.estado !== "no_viable" && e.montoSolicitado > 0 ? ` (${Math.round((monto / e.montoSolicitado) * 100)} % de lo solicitado)` : ""}</dd></div>
                <div><dt>Fuente</dt><dd>{v.fuente.trim() || "—"}</dd></div>
                <div><dt>Observaciones</dt><dd>{v.obs.trim() || "—"}</dd></div>
              </dl>
              {errs.length ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> <span>Falta corregir: {errs.map((x) => x.mensaje).join(" ")} <button type="button" className="ps-enlace" onClick={() => setPaso("decision")}>Volver a la decisión</button></span></p> : null}
            </>
          ),
        },
      ]}
    />
  );
}
