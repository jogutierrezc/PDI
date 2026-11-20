/* Planeación y Seguimiento · VAF · UNIDAD DE LA VAF (`vaf-config`), a pantalla completa. Solo el administrador del módulo.
   Los avisos a la VAF (evaluación pendiente, resultado, alertas de ejecución) van a los miembros de esa unidad con nivel
   financiero o administrador; sin unidad, a todas las personas con nivel financiero. */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { useOficinas } from "../api";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useVafConfig, useVafOps } from "./hooksVaf";

export function ConfigVaf() {
  const { ruta, ir, nivel } = usePs();
  const q = useVafConfig();
  const unidades = useOficinas();
  const ops = useVafOps();
  const [v, setV] = useState<string | null>(null);
  const volver = `${ruta("financiacion")}?pestana=config`;
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Financiación y presupuesto", a: volver }, { texto: "Unidad de la VAF" }];
  if (nivel !== "admin") return <PaginaCompleta titulo="Unidad de la VAF" migas={migas} regresarA={volver}><p className="ps-aviso"><Icon name="lock" size={16} /> La unidad de la VAF la fija el administrador del módulo.</p></PaginaCompleta>;
  if (q.isPending || unidades.isPending) return <PaginaCompleta titulo="Unidad de la VAF" migas={migas} regresarA={volver}><LoadingBlock rows={2} label="Cargando" /></PaginaCompleta>;
  const actual = v ?? q.data?.unidad?.id ?? "";
  return (
    <PaginaCompleta
      titulo="Unidad de la VAF"
      subtitulo="La Vicerrectoría Administrativa y Financiera: quien evalúa lo financiero y recibe los avisos."
      migas={migas}
      regresarA={volver}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada cambia hasta que guarde.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" disabled={ops.config.isPending} aria-busy={ops.config.isPending || undefined} onClick={() => ops.config.mutate(actual || null, { onSuccess: () => ir(volver, { reemplazar: true }) })}>{ops.config.isPending ? "Un momento…" : "Guardar la unidad"}</button></div></>}
    >
      <div className="ps-campos">
        {ops.config.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.config.error as Error).message}</p> : null}
        <Campo id="vaf-unidad" etiqueta="Unidad" ayuda="Las personas de esa unidad con nivel «financiero» (o administrador) reciben los avisos de la VAF.">
          {(p) => (
            <select {...p} value={actual} onChange={(e) => setV(e.target.value)}>
              <option value="">Sin unidad (los avisos van a todos los financieros)</option>
              {[...(unidades.data ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
        </Campo>
        <p className="ps-nota"><Icon name="info" size={13} /> Hoy reciben los avisos {q.data?.destinatarios ?? 0} {(q.data?.destinatarios ?? 0) === 1 ? "persona" : "personas"}. El nivel «financiero» se asigna por rol de acceso en Usuarios y roles (por ejemplo, al rol «Director VAF»).</p>
      </div>
    </PaginaCompleta>
  );
}
