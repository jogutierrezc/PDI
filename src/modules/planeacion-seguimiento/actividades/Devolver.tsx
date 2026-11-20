/* Planeación y Seguimiento · DEVOLVER, a pantalla completa. Dos casos:
     · una actividad de «En revisión» a otro cubo (fase 2; ps_actividad_mover, nota ≥ 20, comentario «devolución»);
     · un AVANCE reportado (fase 3; ps_avance_devolver, nota ≥ 20): el avance queda «devuelto», la actividad vuelve a «En curso»
       y se le avisa a quien lo reportó. Si la actividad tiene un avance esperando revisión, devolver es devolver el avance.
   Solo el gestor de la oficina y el administrador; nadie devuelve su propio avance. */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useAct, useActividad, useAvancesPorValidar, useDevolverAvance, useEquipo, useMoverActividad } from "./hooks";
import { DEF_ESTADOS, type EstadoAct } from "./modelo";
import { Banner, ChipEstado, VistaPreviaAvisos } from "./partes";
import { MIN_MOTIVO, avisoDevolucion, puedeMover, requiereNotaDevolucion } from "./reglas";
import { TarjetaAvance } from "./partesF3";
import { avisoRevision, validarNotaRevision } from "./reglasF3";

/** Con un avance esperando revisión (o `?avance=`), devolver es devolver el avance; si no, es devolver la actividad a otro cubo. */
export function Devolver({ id }: { id: string }) {
  const det = useActividad(id);
  const [params] = useSearchParams();
  const pedido = params.get("avance");
  const pendiente = det.data?.avances.find((v) => v.estado === "pendiente");
  if (det.isPending) return <DevolverActividad id={id} />;
  if (pedido || pendiente) return <DevolverAvance id={id} avanceId={pedido ?? pendiente!.id} />;
  return <DevolverActividad id={id} />;
}

function DevolverAvance({ id, avanceId }: { id: string; avanceId: string }) {
  const { ruta, ir } = usePs();
  const a = useAct();
  const det = useActividad(id);
  const cola = useAvancesPorValidar(null, a.oficinas.some((o) => o.poder === "gestor"));
  const devolver = useDevolverAvance();
  const [nota, setNota] = useState("");
  const [intento, setIntento] = useState(false);
  const av = det.data?.avances.find((v) => v.id === avanceId) ?? null;
  const act = det.data?.actividad ?? null;
  const equipoQ = useEquipo(act?.oficinaId ?? null);
  const regresar = ruta("actividad", id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: regresar }, { texto: "Devolver avance" }];
  if (a.cargando || det.isPending || cola.isPending || (act && equipoQ.isPending)) return <PaginaCompleta titulo="Devolver avance" migas={migas} regresarA={regresar}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  if (!act || !av) return <PaginaCompleta titulo="Devolver avance" migas={migas} regresarA={ruta("tablero")}><Banner tipo="error" rol="alert">Ese avance no existe o no puede verlo.</Banner></PaginaCompleta>;
  const fila = (cola.data ?? []).find((x) => x.avance.id === av.id);
  if (av.estado !== "pendiente") return <PaginaCompleta titulo="Devolver avance" migas={migas} regresarA={regresar}><Banner><Icon name="lock" size={14} /> Ese avance ya fue revisado.</Banner></PaginaCompleta>;
  if (!fila?.puedeValidar) return <PaginaCompleta titulo="Devolver avance" migas={migas} regresarA={regresar}><Banner><Icon name="lock" size={14} /> {a.poderDe(act.oficinaId) !== "gestor" ? "Devolver avances es del gestor de la oficina." : "No puede devolver este avance: nadie revisa el propio, y el de un gestor lo revisa un administrador del módulo."}</Banner></PaginaCompleta>;
  const error = intento ? validarNotaRevision(nota) : null;
  const autor = a.personas.get(av.reportadoPor.id);
  const avisos = avisoRevision(av.reportadoPor, autor?.correo ?? "", "devolucion", a.yo);
  const enviar = () => {
    setIntento(true);
    if (validarNotaRevision(nota)) return void document.getElementById("dev-nota")?.focus();
    devolver.mutate({ id: av.id, nota: nota.trim() }, { onSuccess: () => ir(ruta("revisar"), { reemplazar: true }) });
  };
  return (
    <PaginaCompleta
      titulo="Devolver avance"
      subtitulo={<>«{act.titulo}»: el avance de {av.reportadoPor.nombre} queda «devuelto» y la actividad vuelve a «En curso»</>}
      migas={migas}
      regresarA={regresar}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada se envía hasta que confirme.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={devolver.isPending} aria-busy={devolver.isPending || undefined}>{devolver.isPending ? "Un momento…" : "Devolver el avance"}</button></div></>}
    >
      <div className="ps-bloques">
        <TarjetaAvance a={av} />
        {devolver.error ? <Banner tipo="error" rol="alert">{(devolver.error as Error).message}</Banner> : null}
        <div className="ps-campos">
          <Campo id="dev-nota" etiqueta="Nota para quien lo reportó" ayuda={`Qué falta o qué debe corregir antes de volver a reportar. Al menos ${MIN_MOTIVO} caracteres; la verá quien lo reportó. Lleva ${nota.trim().length}.`} error={error} obligatorio>
            {(p) => <textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} />}
          </Campo>
        </div>
        <VistaPreviaAvisos avisos={avisos} que="quien lo reportó eres tú." />
      </div>
    </PaginaCompleta>
  );
}

function DevolverActividad({ id }: { id: string }) {
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
