/* Planeación y Seguimiento · «Cómo te avisamos»: qué correos llegan y con qué plazo.
   Muestra el plazo EFECTIVO de la oficina elegida (el propio de la oficina o, si no lo tiene, el general). El gestor de esa
   oficina (y la administración) lo cambia en una pantalla completa (`plazos-aviso/<oficina>`). Los correos los envía el servidor;
   esta pantalla no envía nada. */

import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { AVISOS, cuandoAviso, textoAviso } from "./catalogoAvisos";
import { useAct, useConfigAvisos, useOficinaActual } from "./hooks";
import { SelectorOficina } from "./partes";
import { diasDeAviso } from "./reglasF3";

export function Avisos() {
  const { ruta } = usePs();
  const a = useAct();
  const { oficina, oficinas, elegir } = useOficinaActual();
  const cfgQ = useConfigAvisos(oficina?.id ?? null);
  if (a.cargando) return <LoadingBlock rows={3} label="Cargando" />;
  const cfg = cfgQ.data;
  const gestor = oficina?.poder === "gestor";
  return (
    <div className="ps-seccion">
      <p className="ps-sub">Los avisos de las actividades llegan a su correo institucional. Los envía el servidor, no esta pantalla: aquí solo se explica cuáles hay y cuándo salen. Cuando usted asigna o transfiere, la pantalla le muestra antes a quién se le va a avisar.</p>
      {oficina ? (
        <section className="ps-bloque ps-plazos" aria-labelledby="plazos-h">
          <div className="ps-plazos__cab">
            <div>
              <h2 id="plazos-h">Plazos de {oficina.nombre}</h2>
              <p className="ps-sub">{cfg ? (cfg.propia ? "Esta oficina tiene sus propios plazos." : "Esta oficina usa los plazos generales.") : "Leyendo los plazos…"}</p>
            </div>
            {oficinas.length > 1 ? <SelectorOficina oficinas={oficinas} valor={oficina.id} onElegir={elegir} /> : null}
          </div>
          {cfgQ.isPending ? <LoadingBlock rows={2} label="Leyendo los plazos" /> : cfgQ.error ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {(cfgQ.error as Error).message}</p> : cfg ? (
            <>
              <dl className="ps-ficha">
                <div><dt>Origen</dt><dd><span className="ps-estado" data-tono={cfg.propia ? "ok" : "pend"}>{cfg.propia ? "Propio de la oficina" : "General"}</span></dd></div>
                <div><dt>Aviso antes del vencimiento</dt><dd>{cfg.efectiva.activo ? diasDeAviso(cfg.efectiva.diasAntes) : "Desactivados"}</dd></div>
                <div><dt>Avisos de vencida</dt><dd>{cfg.efectiva.vencidaMaxAvisos === 0 ? "Ninguno" : `Hasta ${cfg.efectiva.vencidaMaxAvisos}, uno por día`}</dd></div>
                <div><dt>Copia al gestor de una actividad vencida</dt><dd>Después de {cfg.efectiva.vencidaGestorHoras} horas</dd></div>
                <div><dt>Plazo para validar un avance</dt><dd>{cfg.efectiva.validarHoras} horas; pasado ese plazo el avance se marca «plazo vencido» y se avisa al gestor</dd></div>
                <div><dt>Los avisos por vencimiento</dt><dd>{cfg.efectiva.activo ? "Activos" : "Desactivados"}</dd></div>
              </dl>
              {cfg.propia ? <p className="ps-nota">Los generales son: {diasDeAviso(cfg.porDefecto.diasAntes)}; hasta {cfg.porDefecto.vencidaMaxAvisos} avisos de vencida; {cfg.porDefecto.vencidaGestorHoras} h para el gestor; {cfg.porDefecto.validarHoras} h para validar.</p> : null}
              {gestor ? <div className="ps-botones"><Link className="button-secondary" to={ruta("plazos-aviso", oficina.id)} state={DESDE_MODULO}><Icon name="pen" size={14} /> Cambiar los plazos de esta oficina</Link></div> : <p className="ps-nota"><Icon name="lock" size={13} /> Los plazos los cambia el gestor de la oficina o la administración.</p>}
            </>
          ) : null}
        </section>
      ) : null}
      <ul className="ps-avisos-lista">
        {AVISOS.map((x) => (
          <li key={x.id} className="ps-bloque">
            <h2>{x.titulo}</h2>
            <dl className="ps-ficha">
              <div><dt>A quién le llega</dt><dd>{x.quien}</dd></div>
              <div><dt>Cuándo</dt><dd>{cfg ? cuandoAviso(x, cfg.efectiva) : x.cuando}{x.dias ? <span className="ps-config"> · plazo de la oficina</span> : null}</dd></div>
              <div><dt>Qué dice</dt><dd>{cfg ? textoAviso(x, cfg.efectiva) : x.texto}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="ps-aviso ps-aviso--info"><Icon name="info" size={16} /> <span>Si un aviso no le llega, revise la carpeta de correo no deseado y que su correo en Usuarios sea el institucional.</span></p>
    </div>
  );
}
