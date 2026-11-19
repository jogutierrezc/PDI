/* Planeación y Seguimiento · Fase 2 · DEVOLVER una actividad de «En revisión» a otro cubo, a pantalla completa.
   Pide una nota de al menos 20 caracteres (contrato: ps_actividad_mover; queda como comentario «devolución») y muestra a quién se le avisa.
   Solo el gestor de la oficina y el administrador. FASE 3: aquí también se devolverá un avance reportado. */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useAct, useActividad, useEquipo, useMoverActividad } from "./hooks";
import { DEF_ESTADOS, type EstadoAct } from "./modelo";
import { Banner, ChipEstado, VistaPreviaAvisos } from "./partes";
import { MIN_MOTIVO, avisoDevolucion, puedeMover, requiereNotaDevolucion } from "./reglas";

export function Devolver({ id }: { id: string }) {
  const { ruta, ir } = usePs();
  const a = useAct();
  const det = useActividad(id);
  const act = det.data?.actividad ?? null;
  const equipoQ = useEquipo(act?.oficinaId ?? null);
  const mover = useMoverActividad();
  const [params] = useSearchParams();
  const destino = (params.get("a") ?? "en_curso") as EstadoAct;
  const [nota, setNota] = useState("");
  const [intento, setIntento] = useState(false);
  const regresar = ruta("actividad", id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: regresar }, { texto: "Devolver" }];
  if (a.cargando || det.isPending || (act && equipoQ.isPending)) return <PaginaCompleta titulo="Devolver actividad" migas={migas} regresarA={regresar}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  if (!act) return <PaginaCompleta titulo="Devolver actividad" migas={migas} regresarA={ruta("tablero")}><Banner tipo="error" rol="alert">{(det.error as Error | null)?.message ?? "Esa actividad no existe o no puede verla."}</Banner></PaginaCompleta>;
  const dec = puedeMover(a.poderDe(act.oficinaId), act, destino, a.yo);
  if (!dec.ok || !requiereNotaDevolucion(act.estado, destino)) return <PaginaCompleta titulo="Devolver actividad" migas={migas} regresarA={regresar}><Banner><Icon name="lock" size={14} /> {dec.ok ? "Esta actividad no se devuelve: solo se devuelve lo que está «En revisión»." : dec.motivo}</Banner></PaginaCompleta>;
  const n = nota.trim().length;
  const error = intento && n < MIN_MOTIVO ? `Cuente por qué la devuelve con al menos ${MIN_MOTIVO} caracteres (lleva ${n}).` : null;
  const avisos = avisoDevolucion(act.asignados, equipoQ.data ?? [], a.yo);
  const enviar = () => {
    setIntento(true);
    if (n < MIN_MOTIVO) return void document.getElementById("dev-nota")?.focus();
    mover.mutate({ id, estado: destino, nota: nota.trim() }, { onSuccess: () => ir(regresar, { reemplazar: true }) });
  };
  return (
    <PaginaCompleta
      titulo="Devolver actividad"
      subtitulo={<>«{act.titulo}» pasa de «En revisión» a «{DEF_ESTADOS[destino].nombre}»</>}
      migas={migas}
      regresarA={regresar}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada se envía hasta que confirme.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={mover.isPending} aria-busy={mover.isPending || undefined}>{mover.isPending ? "Un momento…" : "Devolver la actividad"}</button></div></>}
    >
      <div className="ps-bloques">
        <p className="ps-fila-act ps-fila-act--ficha"><ChipEstado estado={act.estado} /> <Icon name="arrow-right" size={14} /> <ChipEstado estado={destino} /></p>
        {mover.error ? <Banner tipo="error" rol="alert">{(mover.error as Error).message}</Banner> : null}
        <div className="ps-campos">
          <Campo id="dev-nota" etiqueta="Nota para quien la tiene" ayuda={`Qué falta o qué debe corregir. Al menos ${MIN_MOTIVO} caracteres; queda en el historial. Lleva ${n}.`} error={error} obligatorio>
            {(p) => <textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} />}
          </Campo>
        </div>
        <VistaPreviaAvisos avisos={avisos} que="nadie más tiene la actividad." />
      </div>
    </PaginaCompleta>
  );
}
