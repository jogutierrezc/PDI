/* Planeación y Seguimiento · Fase 2 · TRANSFERIR una actividad a otra persona, a pantalla completa.
   Pide un motivo de al menos 20 caracteres (queda en el historial y viaja en el correo) y muestra, antes de
   confirmar, a quién se le avisará. Solo el gestor de la oficina y el administrador. */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useAct, useActividad, useEquipo, useTransferir } from "./hooks";
import { MIN_MOTIVO, avisoTransferencia, puedeTransferir, validarTransferencia } from "./reglas";
import { Banner, ChipEstado, ChipPlazo, ConfirmarCampus, VistaPreviaAvisos } from "./partes";
import type { ConflictoCampus } from "./contratoApi";

export function Transferir({ id }: { id: string }) {
  const { ruta, ir } = usePs();
  const a = useAct();
  const det = useActividad(id);
  const act = det.data?.actividad ?? null;
  const equipoQ = useEquipo(act?.oficinaId ?? null);
  const transferir = useTransferir();
  const [params] = useSearchParams();
  const [de, setDe] = useState(params.get("de") ?? "");
  const [para, setPara] = useState(params.get("a") ?? "");
  const [motivo, setMotivo] = useState("");
  const [intento, setIntento] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [conflictos, setConflictos] = useState<ConflictoCampus[]>([]);
  const regresar = ruta("actividad", id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: regresar }, { texto: "Transferir" }];
  if (a.cargando || det.isPending || (act && equipoQ.isPending)) return <PaginaCompleta titulo="Transferir actividad" migas={migas} regresarA={regresar}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  if (!act) return <PaginaCompleta titulo="Transferir actividad" migas={migas} regresarA={ruta("tablero")}><Banner tipo="error" rol="alert">{(det.error as Error | null)?.message ?? "Esa actividad no existe o no puede verla."}</Banner></PaginaCompleta>;
  const poder = a.poderDe(act.oficinaId);
  if (!puedeTransferir(poder)) return <PaginaCompleta titulo="Transferir actividad" migas={migas} regresarA={regresar}><Banner><Icon name="lock" size={14} /> Solo el gestor de la oficina transfiere actividades.</Banner></PaginaCompleta>;
  const equipo = equipoQ.data ?? [];
  const errs = validarTransferencia({ de: de || null, a: para || null, motivo }, act, equipo);
  const err = (c: string) => (intento ? (errs.find((e) => e.campo === c)?.mensaje ?? null) : null);
  const avisos = avisoTransferencia(de || null, para || null, equipo, a.yo);
  const posibles = equipo.filter((m) => m.asignable && m.id !== de && !act.asignados.includes(m.id));

  if (hecho) {
    return (
      <PaginaCompleta titulo="Se transfirió la actividad" migas={migas} regresarA={regresar} regresarTexto="Regresar a la actividad" claveFoco="hecho">
        <Banner tipo="ok" rol="status">{hecho}</Banner>
        <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(regresar)}>Ver la actividad</button><button type="button" className="button-secondary" onClick={() => ir(ruta("asignar"))}>Volver a Asignar</button></div>
      </PaginaCompleta>
    );
  }
  const enviar = (confirmar = false) => {
    setIntento(true);
    if (errs.length) {
      document.getElementById(errs[0].campo)?.focus();
      return;
    }
    transferir.mutate({ id, de, a: para, motivo: motivo.trim(), confirmar }, {
      onSuccess: (r) => r.conflictos.length ? setConflictos(r.conflictos) : setHecho(`«${act.titulo}» pasó de ${a.nombreDe(de)} a ${a.nombreDe(para)}. Quedó en el historial con el motivo.${r.avisara.length ? ` Se avisará a ${r.avisara.length} ${r.avisara.length === 1 ? "persona" : "personas"} por correo.` : ""}`),
    });
  };
  return (
    <PaginaCompleta
      titulo="Transferir actividad"
      subtitulo={<>«{act.titulo}» · {a.porId.get(act.oficinaId)?.nombre}</>}
      migas={migas}
      regresarA={regresar}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada se envía hasta que confirme.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={() => enviar()} disabled={transferir.isPending} aria-busy={transferir.isPending || undefined}>{transferir.isPending ? "Un momento…" : "Transferir la actividad"}</button></div></>}
    >
      <div className="ps-bloques">
        <p className="ps-fila-act ps-fila-act--ficha"><ChipEstado estado={act.estado} /> <ChipPlazo a={act} hoy={a.hoy} /></p>
        {transferir.error ? <Banner tipo="error" rol="alert">{(transferir.error as Error).message}</Banner> : null}
        {intento && errs.length ? (
          <div className="ps-resumen-errores" role="alert">
            <strong>{errs.length === 1 ? "Hay 1 cosa por corregir" : `Hay ${errs.length} cosas por corregir`}</strong>
            <ul>{errs.map((e) => <li key={e.campo}><a href={`#${e.campo}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(e.campo)?.focus(); }}>{e.mensaje}</a></li>)}</ul>
          </div>
        ) : null}
        <div className="ps-campos">
          <Campo id="tr-de" etiqueta="¿A quién se le quita?" error={err("tr-de")} obligatorio>
            {(p) => (
              <select {...p} value={de} onChange={(e) => setDe(e.target.value)}>
                <option value="">Elija a una persona…</option>
                {act.asignados.map((x) => <option key={x} value={x}>{a.nombreDe(x)}</option>)}
              </select>
            )}
          </Campo>
          <Campo id="tr-a" etiqueta="¿A quién se le pasa?" ayuda="Solo miembros de la oficina que reciben actividades; se ve su carga actual." error={err("tr-a")} obligatorio>
            {(p) => (
              <select {...p} value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">Elija a una persona…</option>
                {posibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.esYo ? " (usted)" : ""} · {m.carga.activas} activas{m.carga.vencidas ? `, ${m.carga.vencidas} vencidas` : ""}</option>)}
              </select>
            )}
          </Campo>
          <Campo id="tr-motivo" etiqueta="Motivo de la transferencia" ayuda={`Al menos ${MIN_MOTIVO} caracteres. Lo leerán las dos personas y queda en el historial. Lleva ${motivo.trim().length}.`} error={err("tr-motivo")} obligatorio>
            {(p) => <textarea {...p} rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
          </Campo>
        </div>
        <VistaPreviaAvisos avisos={avisos} que="elija primero a las dos personas." />
        <ConfirmarCampus conflictos={conflictos} ocupado={transferir.isPending} onConfirmar={() => enviar(true)} />
      </div>
    </PaginaCompleta>
  );
}
