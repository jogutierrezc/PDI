/* =============================================================================
   THE Impact · mis indicadores: lo que le toca responder a una oficina de la persona
   (Planeación puede mirar cualquiera), con el estado de cada respuesta, lo que exige
   la metodología y las evidencias en UDrive. El dato, el sí/no y el comentario se
   diligencian en el formulario de la oficina (/admin/reporte-rankings), al que se
   llega con un botón; la evidencia y la carpeta se manejan aquí o allá, es lo mismo.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../lib/auth";
import { useMembresiasPropias } from "../../reporte/datos";
import { actorDe } from "../../reporte/envio";
import { indicadoresDeUnidad, unidadPlaneacion } from "../../reporte/resumen";
import { odsVars } from "../../ods";
import { Alerta, Cargando, Vacio, entrar, fechaCorta, textoVence } from "../../uigreen/ui/comunes";
import { requisitoDe } from "../datos";
import { useThi } from "./contexto";
import { EvidenciasThi } from "./Evidencias";
import { ChipEvidencia } from "./Indicadores";
import { EstadoThi } from "./piezas";

export function Mios() {
  const t = useThi();
  const { profile } = useAuth();
  const membresias = useMembresiasPropias(profile?.id);
  const [elegida, setElegida] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => entrar(raiz.current, ":scope > section"), [elegida]);

  const opciones = useMemo(
    () => (t.esAdmin ? t.unidades.map((u) => ({ id: u.id, nombre: u.name })) : (membresias.data ?? []).map((m) => ({ id: m.unidad, nombre: m.nombre }))),
    [t.esAdmin, t.unidades, membresias.data],
  );
  const porDefecto = t.esAdmin ? unidadPlaneacion(t.unidades)?.id : undefined;
  const oficina = opciones.find((o) => o.id === elegida) ?? opciones.find((o) => o.id === porDefecto) ?? opciones[0] ?? null;

  const items = useMemo(() => (oficina ? indicadoresDeUnidad(oficina.id, t.indicadores, t.asignaciones) : []), [oficina, t.indicadores, t.asignaciones]);

  if (!t.esAdmin && membresias.isLoading) return <Cargando texto="Cargando sus oficinas…" />;
  if (!oficina) return <Vacio>Su usuario no pertenece a ninguna oficina. Pida a Planeación que lo agregue con la función de Gestor, Contribuyente o Consulta.</Vacio>;

  const rol = actorDe(t.esAdmin, membresias.data ?? [], oficina.id);
  const pendientes = items.filter((f) => {
    const r = t.respuestas.find((x) => x.indicador === f.indicador.id && x.unidad === oficina.id);
    return !r || r.estado === "none" || r.estado === "draft" || r.estado === "back";
  }).length;

  return (
    <div ref={raiz} className="ugm-pila">
      <section className="ugm-sec">
        <div className="ugm-fila-simple">
          <span>
            <h2>{oficina.nombre}</h2>
            <p className="ugm-muted">
              {items.length === 0 ? "Sin indicadores asignados en este ciclo." : `${items.length} indicadores asignados · ${pendientes} por entregar`}
              {t.ciclo.fecha_limite ? ` · entrega ${fechaCorta(t.ciclo.fecha_limite)} (${textoVence(t.ciclo.fecha_limite).toLowerCase()})` : ""}
            </p>
          </span>
          <span className="ugm-acciones">
            {opciones.length > 1 && (
              <>
                <label className="ugm-sr" htmlFor="thi-mios-oficina">
                  Oficina
                </label>
                <select id="thi-mios-oficina" className="ugm-input ugm-input--sel ugm-input--sm" value={oficina.id} onChange={(e) => setElegida(e.target.value)}>
                  {opciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Link className="ugm-btn ugm-btn--pri ugm-btn--sm" to={`/admin/reporte-rankings?oficina=${oficina.id}&ciclo=${t.ciclo.id}`}>
              Abrir el formulario de la oficina
            </Link>
          </span>
        </div>
        {t.ciclo.estado !== "abierto" && <Alerta tipo="aviso">{t.ciclo.estado === "preparacion" ? "El ciclo está en preparación: Planeación todavía no lo abre." : "El ciclo está cerrado."}</Alerta>}
        {rol === "visor" && <Alerta>Su función en esta oficina es de consulta: puede ver, no cambiar.</Alerta>}
      </section>

      <section className="ugm-sec">
        {items.length === 0 ? (
          <Vacio>Esta oficina no tiene indicadores sugeridos en el ciclo. Igual puede aportar a cualquiera desde el formulario.</Vacio>
        ) : (
          <ul className="ugm-lista">
            {items.map(({ indicador: i, rol: papel }) => {
              const r = t.respuestas.find((x) => x.indicador === i.id && x.unidad === oficina.id);
              const rq = requisitoDe(t.requisitos, i.id);
              const c = r ? t.conteo.get(r.id) : undefined;
              const n = (c?.en_udrive ?? 0) + (c?.en_bucket ?? 0);
              const abierta = abierto === i.id;
              const falta = rq?.evidencia === "obligatoria" && r?.si_no === true && n === 0;
              return (
                <li key={i.id}>
                  <button type="button" className="ugm-fila-btn" aria-expanded={abierta} onClick={() => setAbierto(abierta ? null : i.id)}>
                    <span>
                      <b className="rk-odsmark thi-ods" style={odsVars(i.ods)}>
                        {i.ods}
                      </b>{" "}
                      <span className="ugm-cod ugm-num">{i.id}</span>
                    </span>
                    <span>
                      {rq?.titulo ?? i.texto_es}
                      <small>
                        {papel === "apoyo" ? "Apoyo" : "Responsable sugerida"} · {n === 0 ? "sin evidencias" : n === 1 ? "1 evidencia" : `${n} evidencias`}
                        {falta ? " · falta la evidencia que exige THE" : ""}
                      </small>
                    </span>
                    <span className="ugm-acciones">
                      <ChipEvidencia rq={rq} />
                      <EstadoThi estado={r?.estado ?? "none"} />
                    </span>
                  </button>
                  {abierta && (
                    <div className="thi-detalle">
                      {rq?.pregunta && <p className="ugm-muted">{rq.pregunta}</p>}
                      {r?.nota_revision && r.estado === "back" && <Alerta tipo="aviso">Observaciones de Planeación: «{r.nota_revision}»</Alerta>}
                      {r ? (
                        <EvidenciasThi
                          respuesta={r.id}
                          ciclo={{ id: t.ciclo.id, anio: t.ciclo.anio }}
                          indicador={i.id}
                          requisito={rq}
                          editable={rol !== "visor" && (t.esAdmin || r.estado === "none" || r.estado === "draft" || r.estado === "back")}
                          esAdmin={t.esAdmin}
                          avisar={t.avisar}
                        />
                      ) : (
                        <Alerta>
                          Esta oficina todavía no empezó el indicador. Ábralo en el formulario y guarde el primer borrador: ahí se crea la respuesta y se habilita la carpeta de evidencias.
                        </Alerta>
                      )}
                      <Link className="ugm-btn ugm-btn--sm" to={`/admin/reporte-rankings?oficina=${oficina.id}&indicador=${encodeURIComponent(i.id)}&ciclo=${t.ciclo.id}`}>
                        Diligenciar en el formulario
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
