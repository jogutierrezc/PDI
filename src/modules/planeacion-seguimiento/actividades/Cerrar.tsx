/* =============================================================================
   Planeación y Seguimiento · Fase 3 · CIERRE ADMINISTRATIVO del gestor (`ps_actividad_cerrar`), a pantalla completa.
   Es la única excepción a «nadie valida lo propio»: registra un avance de cierre validado al 100 %, deja la actividad «Hecha»
   y queda auditado (si el gestor es el único, el evento se marca «autovalidado»). Si lo que falta es un avance reportado por
   alguien, lo normal es revisarlo, no cerrar a mano.
   ========================================================================== */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { useAct, useActividad, useCerrarActividad } from "./hooks";
import { Banner, ChipEstado } from "./partes";
import { BarraAvance } from "./partesF3";
import { MIN_NOTA_CIERRE, puedeCerrar, validarNotaCierre } from "./reglasF3";

export function Cerrar({ id }: { id: string }) {
  const { ruta, ir } = usePs();
  const a = useAct();
  const det = useActividad(id);
  const cerrar = useCerrarActividad();
  const [nota, setNota] = useState("");
  const [entiendo, setEntiendo] = useState(false);
  const [intento, setIntento] = useState(false);
  const [hecho, setHecho] = useState<{ autovalidado: boolean } | null>(null);
  const regresar = ruta("actividad", id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: regresar }, { texto: "Cerrar la actividad" }];
  if (a.cargando || det.isPending) return <PaginaCompleta titulo="Cerrar la actividad" migas={migas} regresarA={regresar}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  const x = det.data?.actividad;
  if (!x) return <PaginaCompleta titulo="Cerrar la actividad" migas={migas} regresarA={ruta("tablero")}><Banner tipo="error" rol="alert">{(det.error as Error | null)?.message ?? "Esa actividad no existe o no puede verla."}</Banner></PaginaCompleta>;
  if (!puedeCerrar(a.poderDe(x.oficinaId))) return <PaginaCompleta titulo="Cerrar la actividad" migas={migas} regresarA={regresar}><Banner><Icon name="lock" size={14} /> El cierre administrativo es del gestor de la oficina.</Banner></PaginaCompleta>;
  if (x.estado === "hecho" && !hecho) return <PaginaCompleta titulo="Cerrar la actividad" migas={migas} regresarA={regresar}><Banner>La actividad ya está «Hecha».</Banner></PaginaCompleta>;
  if (hecho) {
    return (
      <PaginaCompleta titulo="La actividad quedó cerrada" migas={migas} regresarA={regresar} regresarTexto="Regresar a la actividad" claveFoco="hecho">
        <Banner tipo="ok" rol="status">«{x.titulo}» quedó «Hecha» con un avance de cierre al 100 %.{" El cierre quedó autovalidado y marcado para auditoría: queda registrado quién lo hizo y con qué nota."}</Banner>
        <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(regresar, { reemplazar: true })}>Ver la actividad</button></div>
      </PaginaCompleta>
    );
  }
  const error = intento ? validarNotaCierre(nota) : null;
  const enviar = () => {
    setIntento(true);
    if (validarNotaCierre(nota)) return void document.getElementById("cierre-nota")?.focus();
    if (!entiendo) return void document.getElementById("cierre-entiendo")?.focus();
    cerrar.mutate({ id, nota: nota.trim() }, { onSuccess: (r) => setHecho(r) });
  };
  return (
    <PaginaCompleta
      titulo="Cerrar la actividad"
      subtitulo={<>«{x.titulo}» pasa a «Hecha»</>}
      migas={migas}
      regresarA={regresar}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada se guarda hasta que confirme.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={cerrar.isPending} aria-busy={cerrar.isPending || undefined}>{cerrar.isPending ? "Un momento…" : "Cerrar la actividad"}</button></div></>}
    >
      <div className="ps-bloques">
        <div className="ps-fila-act ps-fila-act--ficha"><ChipEstado estado={x.estado} /><BarraAvance avance={x.avance} compacta /></div>
        <Banner tipo="info"><strong>Esto queda auditado.</strong> El cierre administrativo registra un avance de cierre validado al 100 % con su nombre y su nota, y es la única excepción a la regla de que nadie valida lo propio. El cierre siempre queda marcado como «autovalidado» para que se pueda revisar después.</Banner>
        {x.avance.pendientes > 0 ? <Banner><Icon name="alert" size={14} /> Hay un avance esperando revisión. Lo normal es <Link to={`${ruta("revisar")}?actividad=${encodeURIComponent(id)}`} state={DESDE_MODULO}>revisarlo</Link>: así queda validado por otra persona. Si cierra aquí, lo que reportaron otros se valida y lo suyo queda reemplazado por el cierre.</Banner> : null}
        {cerrar.error ? <Banner tipo="error" rol="alert">{(cerrar.error as Error).message}</Banner> : null}
        <div className="ps-campos">
          <Campo id="cierre-nota" etiqueta="Por qué la cierra" ayuda={`Qué se entregó o por qué se da por cumplida. Al menos ${MIN_NOTA_CIERRE} caracteres (lleva ${nota.trim().length}).`} error={error} obligatorio>
            {(p) => <textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} />}
          </Campo>
          <div className="ps-campo" data-error={intento && !entiendo ? "true" : undefined}>
            <label className="ps-opcion ps-opcion--grande"><input id="cierre-entiendo" type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} aria-describedby={intento && !entiendo ? "cierre-entiendo-error" : undefined} /><span><strong>Entiendo que el cierre queda auditado</strong> con mi nombre, la fecha y esta nota.</span></label>
            {intento && !entiendo ? <p className="ps-campo__error" id="cierre-entiendo-error"><Icon name="alert" size={14} /> Marque la casilla para confirmar.</p> : null}
          </div>
        </div>
        <p className="ps-nota">¿Prefiere que lo valide otra persona? <Link to={`${ruta("reportar", id)}`} state={DESDE_MODULO}>Reporte un avance</Link>: lo revisará otro gestor.</p>
      </div>
    </PaginaCompleta>
  );
}
