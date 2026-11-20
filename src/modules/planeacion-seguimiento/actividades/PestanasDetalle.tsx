/* =============================================================================
   Planeación y Seguimiento · Fase 3 · paneles del detalle de la actividad:
   Avances · Evidencias · Riesgos y acciones · Comentarios. Todo en línea, sin ventanas emergentes;
   crear o editar un riesgo es una página (`riesgo/<actividad>`).
   ========================================================================== */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { fecha } from "../modelo";
import { useAct, useComentar, useEquipo, useRiesgos } from "./hooks";
import { estadoPlazo, type Actividad, type ActividadDetalle, type Poder } from "./modelo";
import { ROTULO_ACCION, ROTULO_RIESGO, type Accion, type Riesgo } from "./modeloF3";
import { Banner } from "./partes";
import { BarraAvance, ListaEvidencias, TarjetaAvance } from "./partesF3";
import { MAX_ACCIONES, puedeCerrar, puedeReportar, validarAccion } from "./reglasF3";

type Datos = { x: Actividad; det: ActividadDetalle; poder: Poder };

const hora = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fecha(iso) : `${fecha(iso)}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/* ---------- Avances ---------- */

export function PanelAvances({ x, det, poder }: Datos) {
  const { ruta } = usePs();
  const a = useAct();
  const puede = puedeReportar(poder, x, a.yo);
  const gestor = puedeCerrar(poder);
  return (
    <>
      <div className="ps-av-resumen">
        <div><span className="ps-av-resumen__k">Avance validado</span><BarraAvance avance={x.avance} />{x.avance.validadoEn ? <small>Validado el {fecha(x.avance.validadoEn)}</small> : <small>Aún no hay un avance validado: cuenta como 0 %.</small>}</div>
        {x.avance.financiero !== null ? <div><span className="ps-av-resumen__k">Avance financiero validado</span><b className="ps-av-resumen__n">{x.avance.financiero} %</b></div> : null}
      </div>
      <div className="ps-botones">
        {puede.ok ? <Link className="button-primary" to={ruta("reportar", x.id)} state={DESDE_MODULO}><Icon name="plus" size={15} /> Reportar avance</Link> : null}
        {gestor && x.avance.pendientes > 0 ? <Link className="button-secondary" to={`${ruta("revisar")}?actividad=${encodeURIComponent(x.id)}`} state={DESDE_MODULO}>Revisar lo que espera</Link> : null}
        {gestor && x.estado !== "hecho" ? <Link className="button-secondary" to={ruta("cerrar", x.id)} state={DESDE_MODULO}>Cerrar la actividad…</Link> : null}
      </div>
      {!puede.ok && poder !== "lector" && poder !== "ninguno" && x.estado !== "hecho" ? <p className="ps-nota"><Icon name="info" size={13} /> {puede.motivo}</p> : null}
      {det.avances.length === 0 ? <p className="ps-nota">Nadie ha reportado avances de esta actividad todavía.</p> : (
        <div className="ps-avances">
          {det.avances.map((v) => (
            <TarjetaAvance key={v.id} a={v}>
              {v.estado === "pendiente" && gestor ? <div className="ps-botones"><Link className="button-secondary ps-btn-peq" to={ruta("revisar", v.id)} state={DESDE_MODULO}>Revisar este avance</Link></div> : null}
            </TarjetaAvance>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Evidencias ---------- */

export function PanelEvidencias({ det }: Pick<Datos, "det">) {
  const con = det.avances.filter((v) => v.evidencias.length);
  if (!con.length) return <p className="ps-nota">Esta actividad aún no tiene evidencias. Se adjuntan al reportar un avance.</p>;
  return (
    <div className="ps-bloques">
      <p className="ps-sub">Los archivos se descargan con una dirección temporal que pide la intranet al abrirlos; los enlaces se abren en otra pestaña.</p>
      {con.map((v) => (
        <section key={v.id} className="ps-bloque" aria-label={`Evidencias del avance del ${fecha(v.fecha)}`}>
          <h3>Avance del {fecha(v.fecha)} · {v.fisico} % <span className="ps-nota">· {v.reportadoPor.nombre}</span></h3>
          <ListaEvidencias evidencias={v.evidencias} />
        </section>
      ))}
    </div>
  );
}

/* ---------- Riesgos y acciones ---------- */

function ChipNivel({ nivel }: { nivel: string }) {
  const n = ["Crítico", "Alto", "Medio", "Bajo"].indexOf(nivel);
  return <span className="ps-niv" data-n={n}><Icon name={n <= 1 ? "alert" : "info"} size={12} />{nivel}</span>;
}

export function PanelRiesgos({ x, det, poder }: Datos) {
  const { ruta } = usePs();
  const a = useAct();
  const gestor = poder === "gestor";
  const puedeCrear = gestor || (poder === "colaborador" && a.yo !== null && x.asignados.includes(a.yo));
  const abiertos = det.riesgos.filter((r) => r.estado !== "cerrado");
  const cerrados = det.riesgos.filter((r) => r.estado === "cerrado");
  return (
    <>
      <div className="ps-botones">
        {puedeCrear ? <Link className="button-primary" to={ruta("riesgo", x.id)} state={DESDE_MODULO}><Icon name="plus" size={15} /> Registrar un riesgo</Link> : null}
      </div>
      {det.riesgos.length === 0 ? <p className="ps-nota">No hay riesgos registrados para esta actividad.{puedeCrear ? " Si algo puede impedir que se cumpla, regístrelo." : ""}</p> : null}
      {abiertos.length ? <section aria-label="Riesgos abiertos"><h3>Abiertos ({abiertos.length})</h3><ul className="ps-riesgos">{abiertos.map((r) => <TarjetaRiesgo key={r.id} r={r} x={x} poder={poder} />)}</ul></section> : null}
      {cerrados.length ? <details className="ps-plegable"><summary>Cerrados ({cerrados.length})</summary><ul className="ps-riesgos">{cerrados.map((r) => <TarjetaRiesgo key={r.id} r={r} x={x} poder={poder} />)}</ul></details> : null}
    </>
  );
}

function TarjetaRiesgo({ r, x, poder }: { r: Riesgo; x: Actividad; poder: Poder }) {
  const { ruta } = usePs();
  const a = useAct();
  const eq = useEquipo(poder === "gestor" ? x.oficinaId : null);
  const ops = useRiesgos();
  const gestor = poder === "gestor";
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState("");
  const [nueva, setNueva] = useState(false);
  const [ac, setAc] = useState({ texto: "", responsableId: "", vence: "" });
  const [errAc, setErrAc] = useState<string | null>(null);
  const abierto = r.estado !== "cerrado";
  const guardarAccion = () => {
    const datos = { texto: ac.texto, responsableId: ac.responsableId || null, vence: ac.vence || null };
    const e = validarAccion(datos);
    if (e.length) return setErrAc(e[0].mensaje);
    setErrAc(null);
    ops.crearAccion.mutate({ riesgoId: r.id, datos }, { onSuccess: () => { setAc({ texto: "", responsableId: "", vence: "" }); setNueva(false); } });
  };
  const puedeMarcar = (ac: Accion) => gestor || (poder === "colaborador" && ac.responsableId === a.yo);
  return (
    <li className="ps-riesgo" data-estado={r.estado}>
      <header>
        <h4>{r.titulo}</h4>
        <span className="ps-riesgo__chips"><ChipNivel nivel={r.nivel} /><span className="ps-est" data-tono={abierto ? "pend" : "ok"}>{ROTULO_RIESGO[r.estado]}</span></span>
      </header>
      {r.descripcion ? <p>{r.descripcion}</p> : null}
      {r.mitigacion ? <p className="ps-riesgo__mit"><strong>Mitigación:</strong> {r.mitigacion}</p> : null}
      <p className="ps-nota">Lo registró {r.creadoPor.nombre} el {fecha(r.creadoEn)}{r.cerradoEn ? ` · cerrado el ${fecha(r.cerradoEn)}` : ""}</p>
      <h5>Acciones ({r.acciones.length})</h5>
      {r.acciones.length === 0 ? <p className="ps-nota">Aún no hay acciones para este riesgo.</p> : (
        <ul className="ps-acciones">
          {r.acciones.map((c) => {
            const vencida = c.estado !== "hecha" && c.vence !== null && estadoPlazo({ estado: "en_curso", fin: c.vence }, a.hoy) === "vencida";
            return (
              <li key={c.id} data-estado={c.estado}>
                <span className="ps-acciones__t"><strong>{c.texto}</strong><em>{c.responsableId ? a.nombreDe(c.responsableId) : "Sin responsable"}{c.vence ? ` · vence el ${fecha(c.vence)}` : " · sin fecha"}{vencida ? " · vencida" : ""}</em></span>
                <span className="ps-est" data-tono={c.estado === "hecha" ? "ok" : vencida ? "riesgo" : c.estado === "en_curso" ? "activo" : "pend"}>{vencida ? <Icon name="alert" size={12} /> : null}{ROTULO_ACCION[c.estado]}</span>
                {puedeMarcar(c) && abierto ? (
                  <span className="ps-acciones__acc">
                    {c.estado !== "en_curso" && c.estado !== "hecha" ? <button type="button" className="button-secondary ps-btn-peq" onClick={() => ops.marcarAccion.mutate({ id: c.id, estado: "en_curso" })}>Empezar</button> : null}
                    {c.estado !== "hecha" ? <button type="button" className="button-secondary ps-btn-peq" onClick={() => ops.marcarAccion.mutate({ id: c.id, estado: "hecha" })}><Icon name="check" size={12} /> Marcar hecha</button> : <button type="button" className="button-secondary ps-btn-peq" onClick={() => ops.marcarAccion.mutate({ id: c.id, estado: "pendiente" })}>Reabrir</button>}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {ops.marcarAccion.error ? <Banner tipo="error" rol="alert">{(ops.marcarAccion.error as Error).message}</Banner> : null}
      {gestor && abierto ? (
        <div className="ps-riesgo__pie">
          {nueva ? (
            <form className="ps-form-en-linea" onSubmit={(e) => { e.preventDefault(); guardarAccion(); }} aria-label="Agregar una acción">
              <div className="ps-campo"><label htmlFor={`ac-t-${r.id}`}>Acción</label><input id={`ac-t-${r.id}`} type="text" maxLength={300} value={ac.texto} onChange={(e) => setAc((s) => ({ ...s, texto: e.target.value }))} autoComplete="off" /></div>
              <div className="ps-campos__par">
                <div className="ps-campo"><label htmlFor={`ac-r-${r.id}`}>Responsable</label><select id={`ac-r-${r.id}`} value={ac.responsableId} onChange={(e) => setAc((s) => ({ ...s, responsableId: e.target.value }))}><option value="">Sin responsable</option>{(eq.data ?? []).filter((m) => m.asignable).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
                <div className="ps-campo"><label htmlFor={`ac-v-${r.id}`}>Vence</label><input id={`ac-v-${r.id}`} type="date" value={ac.vence} onChange={(e) => setAc((s) => ({ ...s, vence: e.target.value }))} /></div>
              </div>
              {errAc || ops.crearAccion.error ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {errAc ?? (ops.crearAccion.error as Error).message}</p> : null}
              <div className="ps-botones"><button type="submit" className="button-primary ps-btn-peq" disabled={ops.crearAccion.isPending}>Agregar la acción</button><button type="button" className="button-secondary ps-btn-peq" onClick={() => setNueva(false)}>Cancelar</button></div>
            </form>
          ) : (
            <div className="ps-botones">
              <button type="button" className="button-secondary ps-btn-peq" onClick={() => setNueva(true)} disabled={r.acciones.length >= MAX_ACCIONES}><Icon name="plus" size={13} /> Agregar una acción</button>
              <Link className="button-secondary ps-btn-peq" to={`${ruta("riesgo", x.id)}?r=${encodeURIComponent(r.id)}`} state={DESDE_MODULO}><Icon name="pen" size={13} /> Editar el riesgo</Link>
              <button type="button" className="button-secondary ps-btn-peq" onClick={() => setCerrando((c) => !c)} aria-expanded={cerrando}>Cerrar el riesgo…</button>
            </div>
          )}
          {cerrando ? (
            <div className="ps-aviso ps-aviso--info" role="group" aria-label="Cerrar el riesgo">
              <Icon name="info" size={16} />
              <div>
                <label htmlFor={`rc-${r.id}`}><strong>¿Cómo quedó resuelto?</strong></label>
                <input id={`rc-${r.id}`} type="text" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} autoComplete="off" />
                {ops.cerrar.error ? <p className="ps-campo__error" role="alert">{(ops.cerrar.error as Error).message}</p> : null}
                <div className="ps-botones"><button type="button" className="button-primary ps-btn-peq" disabled={nota.trim().length < 3 || ops.cerrar.isPending} onClick={() => ops.cerrar.mutate({ id: r.id, nota }, { onSuccess: () => setCerrando(false) })}>Cerrar el riesgo</button><button type="button" className="button-secondary ps-btn-peq" onClick={() => setCerrando(false)}>Cancelar</button></div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* ---------- Comentarios ---------- */

export function PanelComentarios({ x, det, poder }: Datos) {
  const comentar = useComentar();
  const a = useAct();
  const [t, setT] = useState("");
  const puede = poder === "gestor" || poder === "colaborador" || a.nivelModulo === "aprobador";
  return (
    <>
      {puede ? (
        <form className="ps-agregar" onSubmit={(e) => { e.preventDefault(); if (t.trim()) comentar.mutate({ id: x.id, texto: t }, { onSuccess: () => setT("") }); }}>
          <label htmlFor="comentario-nuevo">Escribir un comentario</label>
          <textarea id="comentario-nuevo" rows={3} maxLength={2000} value={t} onChange={(e) => setT(e.target.value)} />
          <div className="ps-botones"><button type="submit" className="button-primary" disabled={!t.trim() || comentar.isPending} aria-busy={comentar.isPending || undefined}>Comentar</button></div>
          {comentar.error ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {(comentar.error as Error).message}</p> : null}
        </form>
      ) : <p className="ps-nota"><Icon name="lock" size={13} /> Con acceso de lector solo puede leer los comentarios.</p>}
      {det.comentarios.length === 0 ? <p className="ps-nota">Aún no hay comentarios.</p> : (
        <ol className="ps-historial ps-historial--coment">
          {det.comentarios.map((c) => (
            <li key={c.id}>
              <span className="ps-historial__f">{hora(c.creadoEn)}</span>
              <span className="ps-historial__d"><strong>{c.autor}</strong>{c.tipo !== "comentario" ? <em className="ps-etiqueta">{c.tipo === "devolucion" ? "devolución" : c.tipo === "transferencia" ? "transferencia" : c.tipo === "asignacion" ? "asignación" : "cambio de estado"}</em> : null}<br />{c.texto}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
