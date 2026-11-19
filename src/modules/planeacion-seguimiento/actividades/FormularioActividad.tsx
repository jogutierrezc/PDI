/* =============================================================================
   Planeación y Seguimiento · Fase 2 · crear o editar una actividad, a pantalla
   completa y por pasos (FormularioPasos de la fase 1):
     1 Qué se va a hacer  ·  2 Cuándo y cuánto  ·  3 Quién  ·  4 Revisar y crear
   Borrador local, errores en línea y un resumen que enlaza a cada campo.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { useCampus } from "../api";
import { usePs } from "../contexto";
import { Campo, FormularioPasos, useBorradorLocal, type ErrorCampo } from "../marco/FormularioPasos";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { CAMPUS_TODOS, fecha, rotuloCampus } from "../modelo";
import { useAct, useActividad, useEquipo, useGuardarActividad, useLineasOficina } from "./hooks";
import { PRIORIDADES_ACT, type DatosActividad, type PrioridadAct } from "./modelo";
import { Banner, VistaPreviaAvisos } from "./partes";
import { MAX_DESCRIPCION, MAX_TITULO, avisoAsignacion, avisosActividad, puedeCrear, validarActividad } from "./reglas";
import { SinOficinas } from "./vacios";

interface Valores {
  titulo: string;
  descripcion: string;
  /** «» = sin elegir · «propia» = actividad propia de la oficina · si no, la clave de la línea. */
  linea: string;
  inicio: string;
  fin: string;
  esHito: boolean;
  prioridad: PrioridadAct;
  campus: string;
  asignados: string[];
}

const PASOS = ["que", "cuando", "quien", "revisar"] as const;

export function FormularioActividad({ id }: { id?: string }) {
  const [params] = useSearchParams();
  const act = useAct();
  const oficinaId = params.get("oficina");
  const detalle = useActividad(id ?? null);
  const { ruta } = usePs();
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: id ? "Editar actividad" : "Crear actividad" }];
  if (act.cargando || (id && detalle.isPending)) return <PaginaCompleta titulo={id ? "Editar actividad" : "Crear actividad"} migas={migas} regresarA={ruta("planificacion")}><LoadingBlock rows={4} label="Preparando el formulario" /></PaginaCompleta>;
  if (!act.oficinas.length) return <PaginaCompleta titulo="Crear actividad" migas={migas} regresarA={ruta("planificacion")}><SinOficinas /></PaginaCompleta>;
  if (id && (detalle.error || !detalle.data)) return <PaginaCompleta titulo="Editar actividad" migas={migas} regresarA={ruta("planificacion")}><Banner tipo="error" rol="alert">{(detalle.error as Error | null)?.message ?? "Esa actividad no existe."}</Banner></PaginaCompleta>;
  const inicial = detalle.data?.actividad ?? null;
  const oficina = act.porId.get(inicial?.oficinaId ?? oficinaId ?? "") ?? act.oficinas.find((o) => puedeCrear(o.poder)) ?? act.oficinas[0];
  return <Interior key={`${id ?? "nueva"}-${oficina.id}`} id={id} oficinaId={oficina.id} inicial={inicial} lineaInicial={params.get("linea")} />;
}

function valoresDe(a: NonNullable<ReturnType<typeof useActividad>["data"]>["actividad"] | null, lineaInicial: string | null, campusPorDefecto: string): Valores {
  if (a) return { titulo: a.titulo, descripcion: a.descripcion ?? "", linea: a.lineaNo ?? "propia", inicio: a.inicio ?? "", fin: a.fin ?? "", esHito: a.esHito, prioridad: a.prioridad, campus: a.campus, asignados: a.asignados };
  return { titulo: "", descripcion: "", linea: lineaInicial ?? "", inicio: "", fin: "", esHito: false, prioridad: "Media", campus: campusPorDefecto, asignados: [] };
}

function Interior({ id, oficinaId, inicial, lineaInicial }: { id?: string; oficinaId: string; inicial: Parameters<typeof valoresDe>[0]; lineaInicial: string | null }) {
  const { ruta, ir } = usePs();
  const act = useAct();
  const oficina = act.porId.get(oficinaId)!;
  const campusQ = useCampus();
  const lineasQ = useLineasOficina(oficinaId);
  const equipoQ = useEquipo(oficinaId);
  const guardar = useGuardarActividad();
  const listaCampus = useMemo(() => [...(campusQ.data ?? ["Bucaramanga", "Valledupar", "Cúcuta"]), CAMPUS_TODOS], [campusQ.data]);
  const [v, setV] = useState<Valores>(() => valoresDe(inicial, lineaInicial, ""));
  const [paso, setPaso] = useState<string>("que");
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [hecho, setHecho] = useState<{ id: string; n: number } | null>(null);
  const { guardado, descartar } = useBorradorLocal<Valores>(id ? `actividad-${id}` : `actividad-nueva-${oficinaId}`, v, setV);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: id ? "Editar actividad" : "Crear actividad" }];
  const titulo = id ? "Editar actividad" : "Crear actividad";
  const volver = `${ruta("planificacion")}?oficina=${encodeURIComponent(oficinaId)}`;

  const lineas = useMemo(() => [...(lineasQ.data ?? [])].sort((a, b) => Number(a.no) - Number(b.no)), [lineasQ.data]);
  const equipo = useMemo(() => equipoQ.data ?? [], [equipoQ.data]);
  const campusSel = v.campus || (listaCampus[0] ?? "");
  const datos: DatosActividad = { id, oficinaId, lineaNo: v.linea === "propia" ? null : v.linea || "__sin_elegir__", titulo: v.titulo, descripcion: v.descripcion, inicio: v.inicio || null, fin: v.fin || null, esHito: v.esHito, prioridad: v.prioridad, campus: campusSel, asignados: v.asignados };
  const errores = validarActividad(datos, { lineas: lineas.map((l) => l.no), campus: listaCampus, equipo });
  const porCampo = new Map(errores.map((e) => [e.campo, e.mensaje]));
  const mostrar = (campo: string) => (tocados[campo] ? (porCampo.get(campo) ?? null) : null);
  const salir = (campo: string) => () => setTocados((t) => ({ ...t, [campo]: true }));
  const lineaElegida = lineas.find((l) => l.no === v.linea) ?? null;
  const previa = inicial?.asignados ?? [];
  const nuevos = v.asignados.filter((x) => !previa.includes(x));
  const avisos = avisoAsignacion(nuevos, equipo, act.yo);
  const adv = avisosActividad(datos, lineaElegida, act.hoy);

  const validarPaso = (p: "que" | "cuando" | "quien") => (): ErrorCampo[] => {
    const e = errores.filter((x) => x.paso === p);
    setTocados((t) => ({ ...t, ...Object.fromEntries(e.map((x) => [x.campo, true])) }));
    return e.map((x) => ({ campo: x.campo, mensaje: x.mensaje }));
  };
  const poner = <K extends keyof Valores>(k: K, val: Valores[K]) => setV((x) => ({ ...x, [k]: val }));

  if (!puedeCrear(oficina.poder)) {
    return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver}><Banner tipo="info"><Icon name="lock" size={14} /> Solo el gestor de la oficina crea y edita actividades. En {oficina.nombre} usted tiene acceso de {oficina.poder === "ninguno" ? "ninguno" : oficina.poder}.</Banner></PaginaCompleta>;
  }
  if (hecho) {
    return (
      <PaginaCompleta titulo={id ? "Se guardaron los cambios" : "Se creó la actividad"} migas={migas} regresarA={volver} regresarTexto="Regresar a la planificación" claveFoco="hecho">
        <Banner tipo="ok" rol="status">{id ? "La actividad quedó actualizada." : "La actividad quedó creada en el estado «Por iniciar»."}{hecho.n ? ` Se avisará a ${hecho.n} ${hecho.n === 1 ? "persona" : "personas"} por correo.` : ""}</Banner>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(ruta("actividad", hecho.id))}>Ver la actividad</button>
          {!id ? <button type="button" className="button-secondary" onClick={() => { setV(valoresDe(null, null, "")); setTocados({}); setHecho(null); setPaso("que"); }}>Crear otra</button> : null}
          <button type="button" className="button-secondary" onClick={() => ir(volver)}>Volver a la planificación</button>
        </div>
      </PaginaCompleta>
    );
  }

  return (
    <FormularioPasos
      titulo={titulo}
      subtitulo={`Oficina: ${oficina.nombre}. Cuatro pasos; el borrador se guarda solo en este equipo.`}
      migas={migas}
      regresarA={volver}
      paso={paso}
      onPaso={setPaso}
      etiquetaEnviar={id ? "Guardar los cambios" : "Crear la actividad"}
      enviando={guardar.isPending}
      errorEnvio={guardar.error ? (guardar.error as Error).message : null}
      guardado={guardado}
      onEnviar={async () => {
        const r = await guardar.mutateAsync({ ...datos, titulo: v.titulo.trim() });
        descartar();
        setHecho({ id: r.id, n: r.avisara.length });
      }}
      pasos={[
        {
          id: PASOS[0],
          titulo: "Qué se va a hacer",
          descripcion: "A qué línea del plan contribuye (o si es propia de la oficina), cómo se llama y qué incluye.",
          validar: validarPaso("que"),
          contenido: (
            <div className="ps-campos">
              <Campo id="act-linea" etiqueta="Línea del plan a la que contribuye" ayuda={lineas.length ? `Las líneas que ${oficina.nombre} tiene a su cargo.` : `${oficina.nombre} no tiene líneas del plan asignadas: puede crear una actividad propia.`} error={mostrar("act-linea") ?? (tocados["act-linea"] && !v.linea ? "Elija una línea o «Actividad propia de la oficina»." : null)} obligatorio>
                {(p) => (
                  <select {...p} value={v.linea} onChange={(e) => { poner("linea", e.target.value); const l = lineas.find((x) => x.no === e.target.value); if (l && !v.campus) poner("campus", l.campus); }} onBlur={salir("act-linea")}>
                    <option value="">Elija una opción…</option>
                    <option value="propia">Actividad propia de la oficina (no contribuye a una línea)</option>
                    {lineas.map((l) => <option key={l.no} value={l.no}>#{l.no} · {l.nombre.replace(/\.$/, "").slice(0, 90)}</option>)}
                  </select>
                )}
              </Campo>
              <Campo id="act-titulo" etiqueta="Título de la actividad" ayuda="Empiece con un verbo: «Levantar el inventario de aulas»." error={mostrar("act-titulo")} obligatorio>
                {(p) => <input {...p} type="text" value={v.titulo} onChange={(e) => poner("titulo", e.target.value)} onBlur={salir("act-titulo")} maxLength={MAX_TITULO + 20} autoComplete="off" />}
              </Campo>
              <Campo id="act-descripcion" etiqueta="Descripción" ayuda={`Opcional. Qué incluye y qué se entrega. ${v.descripcion.length}/${MAX_DESCRIPCION}`} error={mostrar("act-descripcion")}>
                {(p) => <textarea {...p} rows={4} value={v.descripcion} onChange={(e) => poner("descripcion", e.target.value)} onBlur={salir("act-descripcion")} />}
              </Campo>
            </div>
          ),
        },
        {
          id: PASOS[1],
          titulo: "Cuándo y cuánto",
          descripcion: "Las fechas, si es un hito, la prioridad y el campus donde se hace.",
          validar: validarPaso("cuando"),
          contenido: (
            <div className="ps-campos">
              <div className="ps-campo">
                <label className="ps-opcion ps-opcion--grande">
                  <input id="act-hito" type="checkbox" checked={v.esHito} onChange={(e) => poner("esHito", e.target.checked)} />
                  <span><strong>Es un hito</strong> (un momento, como una entrega o una firma; sin fecha de inicio)</span>
                </label>
              </div>
              <div className="ps-campos__par">
                {!v.esHito ? (
                  <Campo id="act-inicio" etiqueta="Fecha de inicio" error={mostrar("act-inicio")} obligatorio>
                    {(p) => <input {...p} type="date" value={v.inicio} onChange={(e) => poner("inicio", e.target.value)} onBlur={salir("act-inicio")} />}
                  </Campo>
                ) : null}
                <Campo id="act-fin" etiqueta={v.esHito ? "Fecha del hito" : "Fecha de fin"} ayuda={lineaElegida?.fin ? `La línea del plan termina el ${fecha(lineaElegida.fin)}.` : undefined} error={mostrar("act-fin")} obligatorio>
                  {(p) => <input {...p} type="date" value={v.fin} onChange={(e) => poner("fin", e.target.value)} onBlur={salir("act-fin")} />}
                </Campo>
              </div>
              <div className="ps-campos__par">
                <Campo id="act-prioridad" etiqueta="Prioridad" error={mostrar("act-prioridad")} obligatorio>
                  {(p) => <select {...p} value={v.prioridad} onChange={(e) => poner("prioridad", e.target.value as PrioridadAct)} onBlur={salir("act-prioridad")}>{PRIORIDADES_ACT.map((x) => <option key={x}>{x}</option>)}</select>}
                </Campo>
                <Campo id="act-campus" etiqueta="Campus" ayuda="Dónde se hace. «Todos los campus» si aplica a todos." error={mostrar("act-campus")} obligatorio>
                  {(p) => <select {...p} value={campusSel} onChange={(e) => poner("campus", e.target.value)} onBlur={salir("act-campus")}>{listaCampus.map((c) => <option key={c} value={c}>{rotuloCampus(c)}</option>)}</select>}
                </Campo>
              </div>
            </div>
          ),
        },
        {
          id: PASOS[2],
          titulo: "Quién la hace",
          descripcion: `Asigne a una o varias personas de ${oficina.nombre}. Verá su carga actual para repartir con criterio. También puede dejarla sin responsable y asignarla después.`,
          validar: validarPaso("quien"),
          contenido: (
            <div className="ps-campos">
              <fieldset className="ps-equipo-elegir" id="act-asignados" tabIndex={-1} aria-describedby={porCampo.get("act-asignados") && tocados["act-asignados"] ? "act-asignados-error" : undefined}>
                <legend>Equipo de la oficina</legend>
                {equipoQ.isPending ? <p className="ps-nota">Cargando el equipo…</p> : null}
                <ul>
                  {equipo.filter((m) => m.asignable).map((m) => {
                    const marcado = v.asignados.includes(m.id);
                    const pesada = m.carga.activas >= 6 || m.carga.vencidas >= 2;
                    return (
                      <li key={m.id}>
                        <label className="ps-opcion ps-persona">
                          <input type="checkbox" checked={marcado} onChange={(e) => poner("asignados", e.target.checked ? [...v.asignados, m.id] : v.asignados.filter((x) => x !== m.id))} />
                          <span className="ps-persona__n"><strong>{m.nombre}{m.esYo ? " (usted)" : ""}</strong><em>{m.correo}</em></span>
                          <span className="ps-persona__carga" data-alta={pesada || undefined}>{m.carga.activas} {m.carga.activas === 1 ? "activa" : "activas"}{m.carga.vencidas ? ` · ${m.carga.vencidas} vencida${m.carga.vencidas === 1 ? "" : "s"}` : ""}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {equipo.some((m) => !m.asignable) ? <p className="ps-nota">{equipo.filter((m) => !m.asignable).map((m) => m.nombre).join(", ")}: lector{equipo.filter((m) => !m.asignable).length === 1 ? "" : "es"} de la oficina; no recibe{equipo.filter((m) => !m.asignable).length === 1 ? "" : "n"} actividades.</p> : null}
                {equipo.filter((m) => m.asignable).length === 0 && !equipoQ.isPending ? <p className="ps-nota">La oficina no tiene colaboradores todavía. Pida al administrador que los agregue en Usuarios; mientras, la actividad queda sin responsable.</p> : null}
              </fieldset>
              {porCampo.get("act-asignados") && tocados["act-asignados"] ? <p className="ps-campo__error" id="act-asignados-error"><Icon name="alert" size={14} /> {porCampo.get("act-asignados")}</p> : null}
              <VistaPreviaAvisos avisos={avisos} que={v.asignados.length ? "las personas elegidas ya la tenían." : "no hay responsables."} />
            </div>
          ),
        },
        {
          id: PASOS[3],
          titulo: id ? "Revisar y guardar" : "Revisar y crear",
          descripcion: "Confirme los datos. Aún no se ha guardado nada.",
          contenido: (
            <>
              {errores.length ? <Banner tipo="error" rol="alert">Hay {errores.length} {errores.length === 1 ? "cosa" : "cosas"} por corregir: {errores.map((e) => <span key={e.campo + e.mensaje}><a href={`#${e.campo}`} onClick={(ev) => { ev.preventDefault(); setPaso(e.paso); setTocados((t) => ({ ...t, [e.campo]: true })); }}>{e.mensaje}</a>{" "}</span>)}</Banner> : null}
              <dl className="ps-ficha">
                <div><dt>Oficina</dt><dd>{oficina.nombre}</dd></div>
                <div><dt>Línea del plan</dt><dd>{v.linea === "propia" ? "Actividad propia de la oficina" : lineaElegida ? `#${lineaElegida.no} · ${lineaElegida.nombre}` : "—"}</dd></div>
                <div><dt>Actividad</dt><dd>{v.titulo.trim() || "—"}</dd></div>
                {v.descripcion.trim() ? <div><dt>Descripción</dt><dd>{v.descripcion.trim()}</dd></div> : null}
                <div><dt>{v.esHito ? "Hito" : "Fechas"}</dt><dd>{v.esHito ? fecha(v.fin) : `${fecha(v.inicio)} a ${fecha(v.fin)}`}</dd></div>
                <div><dt>Prioridad y campus</dt><dd>{v.prioridad} · {rotuloCampus(campusSel)}</dd></div>
                <div><dt>Responsables</dt><dd>{v.asignados.length ? v.asignados.map((x) => act.nombreDe(x)).join(", ") : "Sin responsable por ahora"}</dd></div>
              </dl>
              {adv.map((t) => <Banner key={t}>{t}</Banner>)}
              <VistaPreviaAvisos avisos={avisos} que="no hay personas nuevas asignadas." />
              <p className="ps-nota">¿Prefiere cargar muchas a la vez? <Link to={`${ruta("importar-actividades")}?oficina=${encodeURIComponent(oficinaId)}`} state={DESDE_MODULO}>Importar desde Excel</Link>.</p>
            </>
          ),
        },
      ]}
    />
  );
}
