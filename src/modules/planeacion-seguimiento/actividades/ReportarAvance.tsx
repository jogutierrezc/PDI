/* =============================================================================
   Planeación y Seguimiento · Fase 3 · REPORTE DE AVANCE, a pantalla completa y por pasos:
     1 Qué avanzó (físico 0–100, financiero opcional, fecha, nota ≥ 10)
     2 Evidencias (archivo al bucket `ps-evidencias` con sha256 calculado aquí, o enlace http/https)
     3 Riesgos (¿hay un riesgo nuevo? se crea en el mismo acto)
     4 Revisar y enviar
   El avance queda «por validar», la actividad pasa a «En revisión» y se avisa al gestor.
   Borrador local por actividad (sin archivos). Sin ventanas emergentes.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePsApi } from "../api";
import { usePs } from "../contexto";
import { Campo, FormularioPasos, useBorradorLocal, type ErrorCampo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { fecha } from "../modelo";
import { useAct, useActividad, useEquipo, useReportarAvance } from "./hooks";
import { NIVELES_RIESGO, type NivelRiesgo, type NuevaEvidencia } from "./modeloF3";
import { Banner, ChipEstado, VistaPreviaAvisos } from "./partes";
import { ControlPorcentaje } from "./partesF3";
import { ACEPTAR_EVIDENCIA, MAX_EVIDENCIAS, MAX_NOTA_AVANCE, MIN_NOTA_AVANCE, ROTULO_TIPOS_EVIDENCIA, avisoAvance, bytesLegibles, esUrlWeb, puedeReportar, sha256Hex, validarArchivo, validarAvance } from "./reglasF3";

interface Valores {
  fecha: string;
  fisico: number;
  usaFinanciero: boolean;
  financiero: number;
  nota: string;
  enlaces: { nombre: string; url: string }[];
  hayRiesgo: boolean;
  rTitulo: string;
  rNivel: NivelRiesgo;
  rDescripcion: string;
  rMitigacion: string;
}

const PASOS = ["que", "evidencias", "riesgos", "revisar"] as const;

export function ReportarAvance({ id }: { id: string }) {
  const { ruta } = usePs();
  const act = useAct();
  const det = useActividad(id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: ruta("actividad", id) }, { texto: "Reportar avance" }];
  if (act.cargando || det.isPending) return <PaginaCompleta titulo="Reportar avance" migas={migas} regresarA={ruta("actividad", id)}><LoadingBlock rows={4} label="Preparando el reporte" /></PaginaCompleta>;
  if (det.error || !det.data) return <PaginaCompleta titulo="Reportar avance" migas={migas} regresarA={ruta("tablero")}><Banner tipo="error" rol="alert">{(det.error as Error | null)?.message ?? "Esa actividad no existe o no puede verla."}</Banner></PaginaCompleta>;
  const x = det.data.actividad;
  const dec = puedeReportar(act.poderDe(x.oficinaId), x, act.yo);
  if (!dec.ok) return <PaginaCompleta titulo="Reportar avance" subtitulo={`«${x.titulo}»`} migas={migas} regresarA={ruta("actividad", id)}><Banner><Icon name="lock" size={14} /> {dec.motivo}</Banner></PaginaCompleta>;
  return <Interior id={id} />;
}

function Interior({ id }: { id: string }) {
  const { ruta, ir } = usePs();
  const api = usePsApi();
  const act = useAct();
  const det = useActividad(id);
  const x = det.data!.actividad;
  const ultimo = x.avance.fisico;
  const equipoQ = useEquipo(x.oficinaId);
  const reportar = useReportarAvance();
  const [v, setV] = useState<Valores>(() => ({ fecha: act.hoy, fisico: ultimo, usaFinanciero: false, financiero: 0, nota: "", enlaces: [], hayRiesgo: false, rTitulo: "", rNivel: "Medio", rDescripcion: "", rMitigacion: "" }));
  const [archivos, setArchivos] = useState<NuevaEvidencia[]>([]);
  const [subiendo, setSubiendo] = useState<string[]>([]);
  const [fallos, setFallos] = useState<string[]>([]);
  const [nuevoEnlace, setNuevoEnlace] = useState({ nombre: "", url: "" });
  const [errEnlace, setErrEnlace] = useState<string | null>(null);
  const [paso, setPaso] = useState<string>("que");
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [hecho, setHecho] = useState<{ n: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const { guardado, descartar } = useBorradorLocal<Valores>(`avance-${id}`, v, (b) => setV({ ...b, fisico: Math.max(ultimo, Number(b.fisico) || 0) }));
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: ruta("actividad", id) }, { texto: "Reportar avance" }];
  const volver = ruta("actividad", id);
  const poner = <K extends keyof Valores>(k: K, val: Valores[K]) => setV((a) => ({ ...a, [k]: val }));

  const evidencias: NuevaEvidencia[] = useMemo(() => [...archivos, ...v.enlaces.map((e): NuevaEvidencia => ({ tipo: "enlace", nombre: e.nombre.trim(), url: e.url.trim() }))], [archivos, v.enlaces]);
  const datos = { fecha: v.fecha, fisico: v.fisico, financiero: v.usaFinanciero ? v.financiero : null, nota: v.nota, evidencias, riesgo: v.hayRiesgo ? { titulo: v.rTitulo, descripcion: v.rDescripcion, nivel: v.rNivel, mitigacion: v.rMitigacion } : null };
  const errores = validarAvance(datos, { hoy: act.hoy, ultimoValidado: ultimo });
  const porCampo = new Map(errores.map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (tocados[c] ? (porCampo.get(c) ?? null) : null);
  const salir = (c: string) => () => setTocados((t) => ({ ...t, [c]: true }));
  const validarPaso = (p: "que" | "evidencias" | "riesgos") => (): ErrorCampo[] => {
    const e = errores.filter((q) => q.paso === p);
    setTocados((t) => ({ ...t, ...Object.fromEntries(e.map((q) => [q.campo, true])) }));
    // Un archivo o enlace con problema se explica una sola vez por campo.
    return [...new Map(e.map((q) => [q.campo, { campo: q.campo, mensaje: q.mensaje }])).values()];
  };
  const quedan = MAX_EVIDENCIAS - evidencias.length;
  const avisos = avisoAvance(equipoQ.data ?? [], act.yo);

  const elegirArchivos = async (lista: FileList | null) => {
    if (!lista) return;
    const nuevos: string[] = [];
    let cupo = quedan;
    for (const f of Array.from(lista)) {
      if (cupo <= 0) { nuevos.push(`«${f.name}»: ya hay ${MAX_EVIDENCIAS} evidencias; quite alguna para agregar más.`); continue; }
      const m = validarArchivo(f);
      if (m) { nuevos.push(m); continue; }
      cupo -= 1;
      setSubiendo((s) => [...s, f.name]);
      try {
        const huella = await sha256Hex(await f.arrayBuffer());
        const ev = await api.subirEvidencia(x.oficinaId, id, f, huella);
        setArchivos((a) => [...a, ev]);
      } catch (er) {
        nuevos.push(`«${f.name}» no se pudo subir: ${(er as Error).message}`);
      } finally {
        setSubiendo((s) => s.filter((n) => n !== f.name));
      }
    }
    setFallos(nuevos);
    if (entrada.current) entrada.current.value = "";
  };
  const agregarEnlace = () => {
    const nombre = nuevoEnlace.nombre.trim();
    if (!nombre) return setErrEnlace("Póngale un nombre al enlace (por ejemplo, «Acta de la reunión»).");
    if (!esUrlWeb(nuevoEnlace.url)) return setErrEnlace("El enlace debe empezar por http:// o https://.");
    if (quedan <= 0) return setErrEnlace(`Un avance admite hasta ${MAX_EVIDENCIAS} evidencias.`);
    setErrEnlace(null);
    poner("enlaces", [...v.enlaces, { nombre, url: nuevoEnlace.url.trim() }]);
    setNuevoEnlace({ nombre: "", url: "" });
  };

  if (hecho) {
    return (
      <PaginaCompleta titulo="Se envió el avance" migas={migas} regresarA={volver} regresarTexto="Regresar a la actividad" claveFoco="hecho">
        <Banner tipo="ok" rol="status">El avance de {v.fisico} % quedó <strong>por validar</strong> y la actividad pasó a «En revisión».{hecho.n ? ` Se avisará a ${hecho.n} ${hecho.n === 1 ? "gestor" : "gestores"} por correo.` : ""} Cuando el gestor lo valide o lo devuelva, se lo diremos.</Banner>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(volver)}>Ver la actividad</button>
          <button type="button" className="button-secondary" onClick={() => ir(ruta("mis-tareas"))}>Ir a mis tareas</button>
        </div>
      </PaginaCompleta>
    );
  }

  return (
    <FormularioPasos
      titulo="Reportar avance"
      subtitulo={<>«{x.titulo}» · <ChipEstado estado={x.estado} /> · avance validado hasta ahora: <strong>{ultimo} %</strong></>}
      migas={migas}
      regresarA={volver}
      paso={paso}
      onPaso={setPaso}
      etiquetaEnviar="Enviar el avance al gestor"
      enviando={reportar.isPending}
      errorEnvio={reportar.error ? (reportar.error as Error).message : null}
      guardado={guardado}
      onEnviar={async () => {
        if (errores.length) {
          const primero = errores[0];
          setTocados((t) => ({ ...t, ...Object.fromEntries(errores.map((q) => [q.campo, true])) }));
          return setPaso(primero.paso);
        }
        await reportar.mutateAsync({ actividadId: id, datos: { ...datos, nota: v.nota.trim() } });
        descartar();
        setHecho({ n: avisos.length });
      }}
      pasos={[
        {
          id: PASOS[0],
          titulo: "Qué avanzó",
          descripcion: "El avance de la actividad hasta hoy, con una nota que le sirva al gestor para validarlo.",
          validar: validarPaso("que"),
          contenido: (
            <div className="ps-campos">
              <ControlPorcentaje id="av-fisico" etiqueta="Avance físico" obligatorio ayuda={ultimo ? `Cuánto del trabajo está hecho, de 0 a 100 %. El último avance validado fue ${ultimo} %: no puede bajar.` : "Cuánto del trabajo está hecho, de 0 a 100 %."} valor={v.fisico} minimo={ultimo} onCambio={(n) => poner("fisico", n)} error={mostrar("av-fisico")} onSalir={salir("av-fisico")} />
              <div className="ps-campo">
                <label className="ps-opcion ps-opcion--grande">
                  <input type="checkbox" checked={v.usaFinanciero} onChange={(e) => poner("usaFinanciero", e.target.checked)} />
                  <span><strong>Esta actividad tiene ejecución financiera</strong> (opcional; si no aplica, déjelo sin marcar)</span>
                </label>
              </div>
              {v.usaFinanciero ? <ControlPorcentaje id="av-financiero" etiqueta="Avance financiero" ayuda="Qué parte del presupuesto de la actividad se ha ejecutado, de 0 a 100 %." valor={v.financiero} onCambio={(n) => poner("financiero", n)} error={mostrar("av-financiero")} onSalir={salir("av-financiero")} /> : null}
              <Campo id="av-fecha" etiqueta="Fecha del avance" ayuda="El día al que corresponde. No puede ser futura." error={mostrar("av-fecha")} obligatorio>
                {(p) => <input {...p} type="date" max={act.hoy} value={v.fecha} onChange={(e) => poner("fecha", e.target.value)} onBlur={salir("av-fecha")} />}
              </Campo>
              <Campo id="av-nota" etiqueta="Qué se hizo" ayuda={`Cuente lo que se avanzó desde el último reporte. Al menos ${MIN_NOTA_AVANCE} caracteres (lleva ${v.nota.trim().length}; máximo ${MAX_NOTA_AVANCE}).`} error={mostrar("av-nota")} obligatorio>
                {(p) => <textarea {...p} rows={5} value={v.nota} onChange={(e) => poner("nota", e.target.value)} onBlur={salir("av-nota")} />}
              </Campo>
            </div>
          ),
        },
        {
          id: PASOS[1],
          titulo: "Evidencias",
          descripcion: `Lo que respalda el avance: un archivo (${ROTULO_TIPOS_EVIDENCIA}; hasta 20 MB) o un enlace. Es opcional, pero el gestor valida con más confianza si lo ve. Hasta ${MAX_EVIDENCIAS}.`,
          validar: validarPaso("evidencias"),
          contenido: (
            <div className="ps-campos" id="av-evidencias" tabIndex={-1}>
              <div className="ps-evid-caja">
                <label htmlFor="av-archivo" className="button-secondary ps-evid-subir"><Icon name="upload" size={16} /> Elegir archivos</label>
                <input ref={entrada} id="av-archivo" className="ps-evid-input" type="file" multiple accept={ACEPTAR_EVIDENCIA} onChange={(e) => void elegirArchivos(e.target.files)} />
                <p className="ps-campo__ayuda">Se sube al elegirlo y se calcula su huella SHA-256 en su navegador. Los archivos no quedan en el borrador local: si cierra la página, vuelva a elegirlos.</p>
              </div>
              {subiendo.length ? <p className="ps-nota" role="status"><Icon name="clock" size={13} /> Subiendo: {subiendo.join(", ")}…</p> : null}
              {fallos.length ? <div className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /><div><strong>No se agregó:</strong><ul className="ps-lista-errores">{fallos.map((f) => <li key={f}>{f}</li>)}</ul></div></div> : null}
              <fieldset className="ps-enlace-nuevo">
                <legend>O agregue un enlace</legend>
                <div className="ps-campos__par">
                  <div className="ps-campo"><label htmlFor="ev-nombre">Nombre</label><input id="ev-nombre" type="text" value={nuevoEnlace.nombre} maxLength={200} onChange={(e) => setNuevoEnlace((s) => ({ ...s, nombre: e.target.value }))} autoComplete="off" /></div>
                  <div className="ps-campo"><label htmlFor="ev-url">Dirección (http:// o https://)</label><input id="ev-url" type="url" inputMode="url" value={nuevoEnlace.url} onChange={(e) => setNuevoEnlace((s) => ({ ...s, url: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarEnlace(); } }} autoComplete="off" aria-describedby={errEnlace ? "ev-enlace-error" : undefined} aria-invalid={Boolean(errEnlace)} /></div>
                </div>
                <div className="ps-botones"><button type="button" className="button-secondary" onClick={agregarEnlace} disabled={quedan <= 0}><Icon name="plus" size={14} /> Agregar el enlace</button></div>
                {errEnlace ? <p className="ps-campo__error" id="ev-enlace-error" role="alert"><Icon name="alert" size={14} /> {errEnlace}</p> : null}
              </fieldset>
              <section aria-labelledby="ev-lista-h">
                <h3 id="ev-lista-h">Evidencias de este avance ({evidencias.length} de {MAX_EVIDENCIAS})</h3>
                {evidencias.length === 0 ? <p className="ps-nota">Aún no agregó ninguna. Puede seguir sin ellas.</p> : (
                  <ul className="ps-evids">
                    {archivos.map((e, i) => (
                      <li key={e.storagePath ?? i}><Icon name="document" size={16} /><span className="ps-evids__n"><strong>{e.nombre}</strong><em>{e.mime ?? "archivo"}{e.bytes ? ` · ${bytesLegibles(e.bytes)}` : ""}{e.huella ? ` · SHA-256 ${e.huella.slice(0, 12)}…` : ""}</em></span><button type="button" className="button-secondary ps-btn-peq" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} aria-label={`Quitar ${e.nombre}`}><Icon name="trash" size={13} /> Quitar</button></li>
                    ))}
                    {v.enlaces.map((e, i) => (
                      <li key={`${e.url}-${i}`}><Icon name="link" size={16} /><span className="ps-evids__n"><strong>{e.nombre}</strong><em>{e.url}</em></span><button type="button" className="button-secondary ps-btn-peq" onClick={() => poner("enlaces", v.enlaces.filter((_, j) => j !== i))} aria-label={`Quitar ${e.nombre}`}><Icon name="trash" size={13} /> Quitar</button></li>
                    ))}
                  </ul>
                )}
                {mostrar("av-evidencias") ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {mostrar("av-evidencias")}</p> : null}
              </section>
            </div>
          ),
        },
        {
          id: PASOS[2],
          titulo: "Riesgos",
          descripcion: "¿Algo puede impedir que la actividad se cumpla? Si hay un riesgo, se registra ahora, en el mismo envío.",
          validar: validarPaso("riesgos"),
          contenido: (
            <div className="ps-campos">
              <fieldset className="ps-radios" id="av-riesgo">
                <legend>¿Hay un riesgo para esta actividad?</legend>
                <label className="ps-opcion ps-opcion--grande"><input type="radio" name="av-hay-riesgo" checked={!v.hayRiesgo} onChange={() => poner("hayRiesgo", false)} /><span><strong>No hay un riesgo nuevo</strong></span></label>
                <label className="ps-opcion ps-opcion--grande"><input type="radio" name="av-hay-riesgo" checked={v.hayRiesgo} onChange={() => poner("hayRiesgo", true)} /><span><strong>Sí, hay un riesgo</strong> (queda registrado en «Riesgos y acciones» de la actividad)</span></label>
              </fieldset>
              {v.hayRiesgo ? (
                <>
                  <Campo id="rg-titulo" etiqueta="El riesgo, en pocas palabras" ayuda="Por ejemplo: «El proveedor puede entregar tarde»." error={mostrar("rg-titulo")} obligatorio>
                    {(p) => <input {...p} type="text" maxLength={200} value={v.rTitulo} onChange={(e) => poner("rTitulo", e.target.value)} onBlur={salir("rg-titulo")} autoComplete="off" />}
                  </Campo>
                  <Campo id="rg-nivel" etiqueta="Nivel" ayuda="Un riesgo Crítico o Alto mantiene la actividad «En riesgo» cuando se valide un avance parcial." error={mostrar("rg-nivel")} obligatorio>
                    {(p) => <select {...p} value={v.rNivel} onChange={(e) => poner("rNivel", e.target.value as NivelRiesgo)}>{NIVELES_RIESGO.map((n) => <option key={n}>{n}</option>)}</select>}
                  </Campo>
                  <Campo id="rg-descripcion" etiqueta="Qué puede pasar y por qué" ayuda="Opcional." error={mostrar("rg-descripcion")}>
                    {(p) => <textarea {...p} rows={3} value={v.rDescripcion} onChange={(e) => poner("rDescripcion", e.target.value)} />}
                  </Campo>
                  <Campo id="rg-mitigacion" etiqueta="Qué se hará para evitarlo" ayuda="Opcional. Las acciones con responsable y fecha se agregan después, en la actividad." error={mostrar("rg-mitigacion")}>
                    {(p) => <textarea {...p} rows={3} value={v.rMitigacion} onChange={(e) => poner("rMitigacion", e.target.value)} />}
                  </Campo>
                </>
              ) : null}
            </div>
          ),
        },
        {
          id: PASOS[3],
          titulo: "Revisar y enviar",
          descripcion: "Confirme lo que va a ver el gestor. Aún no se ha enviado nada.",
          contenido: (
            <>
              {errores.length ? <Banner tipo="error" rol="alert">Hay {errores.length} {errores.length === 1 ? "cosa" : "cosas"} por corregir: {errores.map((e) => <span key={e.campo + e.mensaje}><a href={`#${e.campo}`} onClick={(ev) => { ev.preventDefault(); setPaso(e.paso); setTocados((t) => ({ ...t, [e.campo]: true })); }}>{e.mensaje}</a>{" "}</span>)}</Banner> : null}
              <dl className="ps-ficha">
                <div><dt>Actividad</dt><dd>{x.titulo}</dd></div>
                <div><dt>Avance físico</dt><dd><strong>{v.fisico} %</strong>{v.fisico === ultimo ? " (igual al último validado)" : ` (el último validado fue ${ultimo} %)`}{v.fisico >= 100 ? " · al validarlo, la actividad quedará «Hecha»" : ""}</dd></div>
                <div><dt>Avance financiero</dt><dd>{v.usaFinanciero ? `${v.financiero} %` : "No aplica"}</dd></div>
                <div><dt>Fecha del avance</dt><dd>{fecha(v.fecha)}</dd></div>
                <div><dt>Qué se hizo</dt><dd>{v.nota.trim() || "—"}</dd></div>
                <div><dt>Evidencias</dt><dd>{evidencias.length ? evidencias.map((e) => e.nombre).join(", ") : "Ninguna"}</dd></div>
                <div><dt>Riesgo</dt><dd>{v.hayRiesgo ? `${v.rNivel}: ${v.rTitulo.trim() || "—"}` : "No hay un riesgo nuevo"}</dd></div>
              </dl>
              <Banner>Al enviar, el avance queda <strong>por validar</strong> y la actividad pasa a «En revisión». Ningún avance se valida a sí mismo: lo revisa el gestor de la oficina.</Banner>
              <VistaPreviaAvisos avisos={avisos} que="no hay otro gestor en la oficina." />
            </>
          ),
        },
      ]}
    />
  );
}
