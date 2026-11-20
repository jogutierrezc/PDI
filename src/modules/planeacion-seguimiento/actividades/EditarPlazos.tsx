/* Planeación y Seguimiento · Fase 3 · PLAZOS DE AVISO DE UNA OFICINA, a pantalla completa (`plazos-aviso/<oficina>`).
   Los generales (`ps_config`) son el valor por defecto; el gestor de la oficina (o el administrador) fija los suyos
   (`ps_config_oficina_guardar`) o «vuelve al general» (`ps_config_oficina_quitar`). */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useAct, useConfigAvisos, useGuardarConfigAvisos, useQuitarConfigAvisos } from "./hooks";
import type { ConfigAvisos } from "./modeloF3";
import { Banner } from "./partes";
import { COTAS_AVISOS, diasDeAviso, leerDias, validarConfigAvisos } from "./reglasF3";

export function EditarPlazos({ oficinaId }: { oficinaId: string }) {
  const { ruta } = usePs();
  const a = useAct();
  const q = useConfigAvisos(oficinaId);
  const oficina = a.porId.get(oficinaId);
  const regresar = `${ruta("avisos")}?oficina=${encodeURIComponent(oficinaId)}`;
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Cómo te avisamos", a: regresar }, { texto: "Plazos de la oficina" }];
  if (a.cargando || q.isPending) return <PaginaCompleta titulo="Plazos de aviso" migas={migas} regresarA={regresar}><LoadingBlock rows={3} label="Cargando los plazos" /></PaginaCompleta>;
  if (!oficina || q.error || !q.data) return <PaginaCompleta titulo="Plazos de aviso" migas={migas} regresarA={regresar}><Banner tipo="error" rol="alert">{(q.error as Error | null)?.message ?? "Esa oficina no existe o no puede verla."}</Banner></PaginaCompleta>;
  if (oficina.poder !== "gestor") return <PaginaCompleta titulo="Plazos de aviso" subtitulo={oficina.nombre} migas={migas} regresarA={regresar}><Banner><Icon name="lock" size={14} /> Los plazos los cambia el gestor de la oficina o la administración.</Banner></PaginaCompleta>;
  return <Formulario oficinaId={oficinaId} nombre={oficina.nombre} inicial={q.data.efectiva} general={q.data.porDefecto} tienePropia={Boolean(q.data.propia)} regresar={regresar} migas={migas} />;
}

function Formulario({ oficinaId, nombre, inicial, general, tienePropia, regresar, migas }: { oficinaId: string; nombre: string; inicial: ConfigAvisos; general: ConfigAvisos; tienePropia: boolean; regresar: string; migas: { texto: string; a?: string }[] }) {
  const { ir } = usePs();
  const guardar = useGuardarConfigAvisos();
  const quitar = useQuitarConfigAvisos();
  const [dias, setDias] = useState(inicial.diasAntes.join(", "));
  const [venc, setVenc] = useState(String(inicial.vencidaMaxAvisos));
  const [gest, setGest] = useState(String(inicial.vencidaGestorHoras));
  const [val, setVal] = useState(String(inicial.validarHoras));
  const [activo, setActivo] = useState(inicial.activo);
  const [intento, setIntento] = useState(false);
  const [volviendo, setVolviendo] = useState(false);
  const diasLeidos = leerDias(dias);
  const config: ConfigAvisos = { diasAntes: diasLeidos ?? [], vencidaMaxAvisos: Number(venc), vencidaGestorHoras: Number(gest), validarHoras: Number(val), activo };
  const errs = new Map(validarConfigAvisos(config).map((e) => [e.campo, e.mensaje]));
  if (diasLeidos === null) errs.set("cfg-dias", "Escriba solo números separados por comas, por ejemplo 7, 3, 0.");
  if (venc.trim() === "" || Number.isNaN(Number(venc))) errs.set("cfg-vencida", "Escriba un número.");
  if (gest.trim() === "" || Number.isNaN(Number(gest))) errs.set("cfg-gestor", "Escriba un número.");
  if (val.trim() === "" || Number.isNaN(Number(val))) errs.set("cfg-validar", "Escriba un número.");
  const mostrar = (c: string) => (intento ? (errs.get(c) ?? null) : null);
  const enviar = () => {
    setIntento(true);
    const primero = [...errs.keys()][0];
    if (primero) return void document.getElementById(primero)?.focus();
    guardar.mutate({ oficinaId, config }, { onSuccess: () => ir(regresar, { reemplazar: true }) });
  };
  const error = (guardar.error ?? quitar.error) as Error | null;
  const k = COTAS_AVISOS;
  return (
    <PaginaCompleta
      titulo="Plazos de aviso de la oficina"
      subtitulo={<>{nombre}. {tienePropia ? "Hoy tiene sus propios plazos." : "Hoy usa los plazos generales."} Los generales son {diasDeAviso(general.diasAntes)}.</>}
      migas={migas}
      regresarA={regresar}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada cambia hasta que guarde.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={guardar.isPending || quitar.isPending} aria-busy={guardar.isPending || undefined}>{guardar.isPending ? "Un momento…" : "Guardar los plazos de la oficina"}</button></div></>}
    >
      <div className="ps-campos">
        {error ? <Banner tipo="error" rol="alert">{error.message}</Banner> : null}
        <div className="ps-campo">
          <label className="ps-opcion ps-opcion--grande"><input type="checkbox" role="switch" checked={activo} onChange={(e) => setActivo(e.target.checked)} /><span><strong>Enviar avisos por vencimiento en esta oficina</strong>{activo ? " (activo)" : " (desactivado: no saldrán avisos de por vencer ni de vencida)"}</span></label>
        </div>
        <Campo id="cfg-dias" etiqueta="Días antes de la fecha límite en que se avisa" ayuda={`Hasta ${k.maxDias} días, de ${k.diaMin} a ${k.diaMax}, separados por comas. El 0 es el mismo día. Ejemplo: 7, 3, 0.`} error={mostrar("cfg-dias")}>
          {(p) => <input {...p} type="text" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} autoComplete="off" />}
        </Campo>
        <div className="ps-campos__par">
          <Campo id="cfg-vencida" etiqueta="Avisos de actividad vencida" ayuda={`Cuántos avisos diarios, de 0 a ${k.avisosMax}.`} error={mostrar("cfg-vencida")}>
            {(p) => <input {...p} type="number" min={0} max={k.avisosMax} value={venc} onChange={(e) => setVenc(e.target.value)} />}
          </Campo>
          <Campo id="cfg-gestor" etiqueta="Horas para avisar al gestor" ayuda={`Pasadas estas horas de vencida, el gestor recibe copia (0 a ${k.horasMax}).`} error={mostrar("cfg-gestor")}>
            {(p) => <input {...p} type="number" min={0} max={k.horasMax} value={gest} onChange={(e) => setGest(e.target.value)} />}
          </Campo>
        </div>
        <Campo id="cfg-validar" etiqueta="Horas para validar un avance" ayuda={`Pasado este plazo, el avance se marca «plazo vencido» y se avisa al gestor (${k.validarMin} a ${k.horasMax}).`} error={mostrar("cfg-validar")}>
          {(p) => <input {...p} type="number" min={k.validarMin} max={k.horasMax} value={val} onChange={(e) => setVal(e.target.value)} />}
        </Campo>
        {tienePropia ? (
          <section className="ps-bloque" aria-labelledby="vg-h">
            <h2 id="vg-h">Volver al general</h2>
            <p className="ps-sub">La oficina deja de tener plazos propios y usa los generales ({diasDeAviso(general.diasAntes)}; {general.validarHoras} h para validar).</p>
            {volviendo ? (
              <div className="ps-aviso ps-aviso--info" role="alert"><Icon name="info" size={16} /><div><strong>¿Volver a los plazos generales?</strong> Se pierden los plazos propios de esta oficina.<div className="ps-botones"><button type="button" className="button-primary" disabled={quitar.isPending} onClick={() => quitar.mutate(oficinaId, { onSuccess: () => ir(regresar, { reemplazar: true }) })}>{quitar.isPending ? "Un momento…" : "Sí, volver al general"}</button><button type="button" className="button-secondary" onClick={() => setVolviendo(false)}>Cancelar</button></div></div></div>
            ) : <div className="ps-botones"><button type="button" className="button-secondary" onClick={() => setVolviendo(true)}>Volver al general…</button></div>}
          </section>
        ) : null}
      </div>
    </PaginaCompleta>
  );
}
