/* Planeación y Seguimiento · VAF · UMBRALES DE VIGILANCIA de un plan (`vaf-umbrales/<plan>`), a pantalla completa.
   Se guardan en la configuración del plan (`ps_plan_config_guardar`, `vigilancia`). Solo la VAF y el administrador. */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useUmbrales, useVafOps } from "./hooksVaf";
import { UMBRALES_POR_OMISION, esFinanciero, validarUmbrales } from "./modeloVaf";

export function UmbralesPlan({ id }: { id: string }) {
  const { ruta, ir, nivel, planes } = usePs();
  const q = useUmbrales(id);
  const ops = useVafOps();
  const [v, setV] = useState<{ d: string; s: string; m: string } | null>(null);
  const [intento, setIntento] = useState(false);
  const volver = `${ruta("financiacion")}?pestana=alertas`;
  const nombre = planes.find((p) => p.id === id)?.nombre ?? "el plan";
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Financiación y presupuesto", a: volver }, { texto: "Umbrales" }];
  if (!esFinanciero(nivel)) return <PaginaCompleta titulo="Umbrales de vigilancia" migas={migas} regresarA={volver}><p className="ps-aviso"><Icon name="lock" size={16} /> Los umbrales los cambia la VAF o el administrador.</p></PaginaCompleta>;
  if (q.isPending || !q.data) return <PaginaCompleta titulo="Umbrales de vigilancia" migas={migas} regresarA={volver}><LoadingBlock rows={2} label="Cargando" /></PaginaCompleta>;
  const x = v ?? { d: String(q.data.umbralDesviacion), s: String(q.data.umbralSobreejecucion), m: String(q.data.mesesSinEjecucion) };
  const u = { umbralDesviacion: Number(x.d), umbralSobreejecucion: Number(x.s), mesesSinEjecucion: Number(x.m) };
  const errs = new Map(validarUmbrales(u).map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (intento ? (errs.get(c) ?? null) : null);
  const enviar = () => { setIntento(true); const p = [...errs.keys()][0]; if (p) return void document.getElementById(p)?.focus(); ops.umbrales.mutate({ planId: id, umbrales: u }, { onSuccess: () => ir(volver, { reemplazar: true }) }); };
  return (
    <PaginaCompleta
      titulo="Umbrales de vigilancia"
      subtitulo={<>«{nombre}»: cuándo la ejecución del presupuesto dispara una alerta.</>}
      migas={migas}
      regresarA={volver}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><button type="button" className="button-secondary" onClick={() => setV({ d: String(UMBRALES_POR_OMISION.umbralDesviacion), s: String(UMBRALES_POR_OMISION.umbralSobreejecucion), m: String(UMBRALES_POR_OMISION.mesesSinEjecucion) })}>Volver a los de siempre</button></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={ops.umbrales.isPending} aria-busy={ops.umbrales.isPending || undefined}>{ops.umbrales.isPending ? "Un momento…" : "Guardar los umbrales"}</button></div></>}
    >
      <div className="ps-campos">
        {ops.umbrales.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.umbrales.error as Error).message}</p> : null}
        <Campo id="um-desv" etiqueta="Desviación entre ejecución y avance físico (puntos)" ayuda="De 1 a 100. Si el % de ejecución se aparta del avance físico validado más de esto, hay alerta (por 15: ejecuta o avanza 15 puntos más de lo otro)." error={mostrar("um-desv")}>
          {(p) => <input {...p} type="number" min={1} max={100} value={x.d} onChange={(e) => setV({ ...x, d: e.target.value })} />}
        </Campo>
        <Campo id="um-sobre" etiqueta="Sobreejecución (% del presupuesto vigente)" ayuda="De 50 a 300. Alerta urgente si lo ejecutado pasa de este porcentaje del vigente (100 = el presupuesto completo)." error={mostrar("um-sobre")}>
          {(p) => <input {...p} type="number" min={50} max={300} value={x.s} onChange={(e) => setV({ ...x, s: e.target.value })} />}
        </Campo>
        <Campo id="um-meses" etiqueta="Meses sin movimientos" ayuda="De 1 a 24. Alerta si una línea con presupuesto lleva tanto tiempo sin movimientos." error={mostrar("um-meses")}>
          {(p) => <input {...p} type="number" min={1} max={24} value={x.m} onChange={(e) => setV({ ...x, m: e.target.value })} />}
        </Campo>
      </div>
    </PaginaCompleta>
  );
}
