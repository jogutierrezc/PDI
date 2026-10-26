/* =============================================================================
   Gestión Master · Nueva solicitud.

   Es el formulario de Rua llevado al portal con su misma lógica:
     · una solicitud puede tocar varias actividades, que se deciden juntas;
     · el expediente guarda CÓMO DEBE QUEDAR cada actividad, precargada con lo
       que hay hoy (el revisor lee el resultado, no una orden);
     · justificación de 150 a 2000 caracteres, con contador;
     · los errores solo se muestran en lo que la persona ya tocó, y todos de
       golpe al intentar enviar;
     · se guarda como borrador o se envía; una enviada ya no se edita, una
       devuelta sí.
   Lo que cambia, y es la mejora: al elegir un código que ya existe, el
   formulario muestra los datos reales de ese código desde el Warehouse
   (catálogo, cuántos profesores lo tienen, horas, promedio, programa) para que
   quien solicita decida con información.

   Tipos: Nuevo · Mejorar o mantener (parte de un código, de este periodo o de
   uno anterior, y se puede ampliar) · Eliminar.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { fichaDe, useBuscarCodigos, useDetalle, useFlujos, useGuardarSolicitud, useUnidades, type LineaEntrada } from "./api";
import type { Contexto } from "./contexto";
import { sedeUnica } from "./contexto";
import {
  AYUDA_CODIGO, MAX_JUSTIFICACION, MIN_JUSTIFICACION, PLAZO_INDICADOR, PRIORIDADES, SEDES, TIPOS, mensajeDe, nombrePeriodo, nombreSede, validarCodigo,
  type Prioridad, type Tipo,
} from "./modelo";
import { PanelCodigo } from "./PanelCodigo";
import { aparecer, entrada } from "./movimiento";
import { Cargando, ErrorCaja } from "./partes";

interface LineaForm {
  clave: string;
  codigo: string;
  origenCodigo: string;
  origenPeriodo: string;
  origenSede: string;
  nombre: string;
  tipoActividad: "" | "directa" | "apoyo";
  instrucciones: string;
  vinculacion: string;
  activa: boolean;
  /** En Mejorar y Eliminar: ya se eligió un código del catálogo. */
  elegido: boolean;
}

let contador = 0;
const nuevaLinea = (periodo: string, sede: string): LineaForm => ({
  clave: `linea-${++contador}`,
  codigo: "",
  origenCodigo: "",
  origenPeriodo: periodo,
  origenSede: sede,
  nombre: "",
  tipoActividad: "",
  instrucciones: "",
  vinculacion: "",
  activa: true,
  elegido: false,
});

/** Busca un código del catálogo del Master (periodo y sede de origen) y lo entrega al elegirlo. */
function BuscadorCodigo({
  periodo, sede, etiqueta, ayuda, onElegir, id,
}: {
  periodo: string;
  sede: string;
  etiqueta: string;
  ayuda?: string;
  id: string;
  onElegir: (c: { codigo: string; nombre: string | null; tipo_actividad: string; vinculacion: string | null }) => void;
}) {
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setConsulta(texto.trim()), 250);
    return () => window.clearTimeout(t);
  }, [texto]);
  const q = useBuscarCodigos(periodo, sede, consulta, consulta.length >= 1);
  return (
    <div className="gm-buscador">
      <label className="admin-field" htmlFor={id}>
        <span>{etiqueta}</span>
        <input id={id} type="search" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código o nombre de la actividad" aria-describedby={`${id}-ayuda`} />
      </label>
      <small id={`${id}-ayuda`}>{ayuda ?? `Se busca en el catálogo del Master de ${nombreSede(sede)}, ${nombrePeriodo(periodo)}.`}</small>
      {consulta.length >= 1 && (
        <div className="gm-resultados" role="region" aria-label="Resultados de la búsqueda" aria-live="polite">
          {q.isPending ? (
            <p className="gm-nota">Buscando…</p>
          ) : q.error ? (
            <p className="gm-aviso">{mensajeDe(q.error)}</p>
          ) : q.data.length === 0 ? (
            <p className="gm-nota">No hay códigos que coincidan en el catálogo del Master para esta sede y periodo. Si no hay captura de ese periodo, pídale a Planeación que la cargue en el Warehouse.</p>
          ) : (
            <ul>
              {q.data.map((c) => (
                <li key={c.codigo}>
                  <button type="button" onClick={() => { onElegir(c); setTexto(""); setConsulta(""); }}>
                    <b className="gm-mono">{c.codigo}</b> {c.nombre ?? ""}
                    <small>
                      {c.tipo_actividad === "directa" ? "Directa" : c.tipo_actividad === "apoyo" ? "De apoyo" : c.tipo_actividad}
                      {c.activa === false ? " · inactiva" : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Formulario({ ctx, id }: { ctx: Contexto; id?: string }) {
  const sedeInicial = sedeUnica(ctx.sede);
  const unidades = useUnidades();
  const flujos = useFlujos();
  const guardar = useGuardarSolicitud();
  const borrador = useDetalle(id ?? null);

  const [tipo, setTipo] = useState<Tipo>("nuevo");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [periodo, setPeriodo] = useState(ctx.periodo);
  const [sede, setSede] = useState(sedeInicial);
  const [unidad, setUnidad] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>(() => [nuevaLinea(ctx.periodo, sedeInicial)]);
  const [justificacion, setJustificacion] = useState("");
  const [tocado, setTocado] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [cargado, setCargado] = useState(false);
  const raiz = useRef<HTMLFormElement>(null);
  const [params] = useSearchParams();

  // Desde Estructura: «Proponer cambio» llega con el tipo y el código ya elegidos.
  useEffect(() => {
    const t = params.get("tipo");
    const codigo = (params.get("codigo") ?? "").toUpperCase();
    if (id || !codigo || (t !== "mejorar" && t !== "eliminar")) return;
    let vivo = true;
    void (async () => {
      try {
        const f = await fichaDe(ctx.periodo, sedeInicial, codigo);
        if (!vivo || !f.catalogo) return;
        setTipo(t);
        setLineas([{
          ...nuevaLinea(ctx.periodo, sedeInicial),
          elegido: true,
          codigo,
          origenCodigo: codigo,
          nombre: f.catalogo.nombre ?? "",
          tipoActividad: f.catalogo.directa === true ? "directa" : f.catalogo.directa === false ? "apoyo" : "",
          vinculacion: f.catalogo.vinculacion ?? "",
          instrucciones: f.catalogo.instrucciones ?? "",
        }]);
      } catch {
        /* sin ficha, el formulario queda vacío y se elige a mano */
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editar un borrador o una devuelta: se parte de lo guardado.
  useEffect(() => {
    if (!id || !borrador.data || cargado) return;
    const d = borrador.data;
    setTipo(d.tipo);
    setPrioridad(d.prioridad);
    setPeriodo(d.periodo);
    setSede(d.sede);
    setUnidad(d.unidad_id ?? "");
    setJustificacion(d.justificacion);
    setLineas(
      d.lineas.map((l) => ({
        clave: `linea-${++contador}`,
        codigo: l.codigo ?? "",
        origenCodigo: l.origen_codigo ?? "",
        origenPeriodo: l.origen_periodo ?? d.periodo,
        origenSede: l.origen_sede ?? d.sede,
        nombre: l.nombre ?? "",
        tipoActividad: (l.tipo_actividad ?? "") as LineaForm["tipoActividad"],
        instrucciones: l.instrucciones ?? "",
        vinculacion: l.vinculacion ?? "",
        activa: l.activa,
        elegido: d.tipo !== "nuevo",
      })),
    );
    setCargado(true);
  }, [id, borrador.data, cargado]);

  useEffect(() => {
    if (raiz.current) entrada(raiz.current.querySelectorAll(".gm-seccion"), 6);
  }, []);

  const flujoDefecto = flujos.data?.find((f) => f.por_defecto && f.activo) ?? flujos.data?.[0];

  const cambiarTipo = (t: Tipo) => {
    // Las líneas de un «mejorar» no significan lo mismo en un «nuevo»: se vacían en vez de arrastrar una selección sin sentido.
    setTipo(t);
    setLineas([nuevaLinea(periodo, sede)]);
    setTocado(new Set());
  };

  const editar = (clave: string, cambio: Partial<LineaForm>) => setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  const quitar = (clave: string) => setLineas((prev) => (prev.length > 1 ? prev.filter((l) => l.clave !== clave) : [nuevaLinea(periodo, sede)]));

  /** Al elegir un código se precarga con lo que dice el catálogo: se edita lo que cambia. */
  async function elegirCodigo(clave: string, c: { codigo: string; nombre: string | null; tipo_actividad: string; vinculacion: string | null }, origenPeriodo: string, origenSede: string) {
    editar(clave, { elegido: true, codigo: c.codigo, origenCodigo: c.codigo, origenPeriodo, origenSede, nombre: c.nombre ?? "", tipoActividad: c.tipo_actividad === "directa" || c.tipo_actividad === "apoyo" ? c.tipo_actividad : "", vinculacion: c.vinculacion ?? "" });
    try {
      const f = await fichaDe(origenPeriodo, origenSede, c.codigo);
      if (f.catalogo?.instrucciones) editar(clave, { instrucciones: f.catalogo.instrucciones });
    } catch {
      /* la ficha se muestra aparte; sin ella el formulario sigue */
    }
  }

  // --- Validación: se calcula siempre, se muestra solo en lo tocado ---------------------------------
  const errores: Record<string, string> = {};
  if (lineas.length === 0) errores.lineas = "Añada al menos una actividad.";
  const vistos = new Set<string>();
  for (const l of lineas) {
    const cod = l.codigo.trim().toUpperCase();
    if (tipo === "nuevo") {
      if (!l.nombre.trim()) errores[`nombre-${l.clave}`] = "Escriba el nombre de la actividad que quiere crear.";
      if (!l.tipoActividad) errores[`tipo-${l.clave}`] = "Elija si es directa o de apoyo.";
      const e = validarCodigo(l.codigo, false);
      if (e) errores[`codigo-${l.clave}`] = e;
    } else {
      if (!l.elegido || !cod) errores[`codigo-${l.clave}`] = "Elija un código del catálogo del Master.";
      if (tipo === "mejorar" && !l.nombre.trim()) errores[`nombre-${l.clave}`] = "Escriba cómo debe quedar el nombre.";
    }
    if (cod) {
      if (vistos.has(cod)) errores[`codigo-${l.clave}`] = "Este código ya está en la solicitud.";
      vistos.add(cod);
    }
  }
  const largo = justificacion.trim().length;
  if (largo < MIN_JUSTIFICACION) errores.justificacion = `Faltan ${MIN_JUSTIFICACION - largo} caracteres para el mínimo de ${MIN_JUSTIFICACION}.`;
  const valido = Object.keys(errores).length === 0;
  const ver = (campo: string) => (tocado.has(campo) ? (errores[campo] ?? null) : null);
  const marcar = (campo: string) => setTocado((t) => (t.has(campo) ? t : new Set(t).add(campo)));

  const unidadesLista = unidades.data ?? [];

  async function enviar(comoBorrador: boolean, e?: FormEvent) {
    e?.preventDefault();
    setError("");
    if (!comoBorrador) {
      setTocado(new Set(Object.keys(errores)));
      if (!valido) {
        setError("Hay campos por completar. Están marcados abajo.");
        return;
      }
    }
    try {
      const r = await guardar.mutateAsync({
        id: id ?? null,
        tipo,
        prioridad,
        unidad: unidad || null,
        periodo,
        sede,
        justificacion: justificacion.trim(),
        lineas: lineas.map<LineaEntrada>((l) => ({
          codigo: l.codigo,
          origen_codigo: l.origenCodigo || undefined,
          origen_periodo: l.origenCodigo ? l.origenPeriodo : undefined,
          origen_sede: l.origenCodigo ? l.origenSede : undefined,
          nombre: l.nombre,
          tipo_actividad: l.tipoActividad,
          instrucciones: l.instrucciones,
          vinculacion: l.vinculacion,
          activa: l.activa,
        })),
        enviar: !comoBorrador,
      });
      ctx.ir("bandeja", r.id);
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  const etiquetaLineas = tipo === "nuevo" ? "Actividades a crear" : tipo === "eliminar" ? "Actividades a dar de baja" : "Actividades a mejorar o mantener";
  const periodosOrigen = useMemo(() => ctx.periodos, [ctx.periodos]);

  if (id && borrador.isPending) return <Cargando filas={4} etiqueta="Abriendo la solicitud" />;
  if (id && borrador.error) return <ErrorCaja error={borrador.error} onReintentar={() => void borrador.refetch()} />;
  if (id && borrador.data && !borrador.data.puedo_editar) return <ErrorCaja error={new Error("Esta solicitud ya no se puede editar: solo un borrador o una devuelta.")} titulo="No se puede editar" />;

  return (
    <form className="gm-formulario" ref={raiz} onSubmit={(e) => void enviar(false, e)} noValidate>
      <div className="gm-formulario__cuerpo">
        <fieldset className="gm-seccion">
          <legend>Qué quiere hacer</legend>
          <div className="gm-tipos" role="radiogroup" aria-label="Tipo de solicitud">
            {(Object.keys(TIPOS) as Tipo[]).map((t) => (
              <label key={t} className="gm-tipo" data-activo={tipo === t}>
                <input type="radio" name="tipo" checked={tipo === t} onChange={() => cambiarTipo(t)} disabled={Boolean(id)} />
                <b>{TIPOS[t].nombre}</b>
                <span>{TIPOS[t].ayuda}</span>
              </label>
            ))}
          </div>
          {id && <small>El tipo no se cambia al corregir una solicitud: para otro tipo, cree una nueva.</small>}
        </fieldset>

        <fieldset className="gm-seccion">
          <legend>Dónde aplica</legend>
          <div className="gm-rejilla">
            <label className="admin-field">
              <span>Periodo</span>
              <select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setLineas(lineas.map((l) => ({ ...l, origenPeriodo: l.elegido ? l.origenPeriodo : e.target.value }))); }}>
                {ctx.periodos.map((p) => (
                  <option key={p} value={p}>
                    {nombrePeriodo(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Sede</span>
              <select value={sede} onChange={(e) => { setSede(e.target.value); setLineas(lineas.map((l) => ({ ...l, origenSede: l.elegido ? l.origenSede : e.target.value }))); }}>
                {SEDES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Unidad que solicita</span>
              <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                <option value="">{unidadesLista.length ? "Sin unidad" : "No pertenece a una unidad"}</option>
                {unidadesLista.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Prioridad</span>
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}>
                {(Object.keys(PRIORIDADES) as Prioridad[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORIDADES[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="gm-seccion">
          <legend>{etiquetaLineas}</legend>
          <p className="gm-ayuda">
            {tipo === "nuevo"
              ? "Una fila por cada actividad nueva. Antes de crearla, busque si ya existe algo parecido: el Master le muestra su ficha."
              : tipo === "mejorar"
                ? "Elija el código del que parte (de este periodo o de uno anterior). Se precarga con lo que dice el Master y usted ajusta lo que cambia."
                : "Elija el código que se da de baja. Abajo verá a cuántos profesores afecta."}
          </p>
          {ver("lineas") && <p className="gm-error">{ver("lineas")}</p>}

          {lineas.map((l, i) => {
            const codigoErr = ver(`codigo-${l.clave}`);
            const nombreErr = ver(`nombre-${l.clave}`);
            const tipoErr = ver(`tipo-${l.clave}`);
            return (
              <div className="gm-linea" key={l.clave}>
                <div className="gm-linea__cabeza">
                  <h4>
                    Actividad {i + 1}
                    {l.codigo ? <span className="gm-mono"> · {l.codigo.toUpperCase()}</span> : null}
                  </h4>
                  {(lineas.length > 1 || l.elegido) && (
                    <button type="button" className="button-ghost" onClick={() => quitar(l.clave)}>
                      Quitar
                    </button>
                  )}
                </div>

                {tipo !== "nuevo" && !l.elegido && (
                  <>
                    {tipo === "mejorar" && (
                      <div className="gm-rejilla gm-rejilla--origen">
                        <label className="admin-field">
                          <span>Periodo del que parte</span>
                          <select value={l.origenPeriodo} onChange={(e) => editar(l.clave, { origenPeriodo: e.target.value })}>
                            {periodosOrigen.map((p) => (
                              <option key={p} value={p}>
                                {nombrePeriodo(p)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-field">
                          <span>Sede de origen</span>
                          <select value={l.origenSede} onChange={(e) => editar(l.clave, { origenSede: e.target.value })}>
                            {SEDES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    <BuscadorCodigo
                      id={`buscar-${l.clave}`}
                      periodo={tipo === "mejorar" ? l.origenPeriodo : periodo}
                      sede={tipo === "mejorar" ? l.origenSede : sede}
                      etiqueta={tipo === "mejorar" ? "Código del que parte" : "Código a eliminar"}
                      onElegir={(c) => void elegirCodigo(l.clave, c, tipo === "mejorar" ? l.origenPeriodo : periodo, tipo === "mejorar" ? l.origenSede : sede)}
                    />
                    {codigoErr && <p className="gm-error">{codigoErr}</p>}
                  </>
                )}

                {tipo === "nuevo" && (
                  <>
                    <div className="gm-rejilla">
                      <label className="admin-field">
                        <span>Código sugerido (opcional)</span>
                        <input
                          value={l.codigo}
                          onChange={(e) => editar(l.clave, { codigo: e.target.value.toUpperCase() })}
                          onBlur={() => marcar(`codigo-${l.clave}`)}
                          placeholder="ACT-45"
                          aria-invalid={Boolean(codigoErr)}
                          aria-describedby={`ayuda-cod-${l.clave}`}
                        />
                        <small id={`ayuda-cod-${l.clave}`}>{codigoErr ?? `${AYUDA_CODIGO} Si lo deja vacío, Planeación asigna el código al crearla.`}</small>
                      </label>
                      <label className="admin-field">
                        <span>Tipo *</span>
                        <select value={l.tipoActividad} onChange={(e) => editar(l.clave, { tipoActividad: e.target.value as LineaForm["tipoActividad"] })} onBlur={() => marcar(`tipo-${l.clave}`)} aria-invalid={Boolean(tipoErr)}>
                          <option value="">Elija…</option>
                          <option value="directa">Directa</option>
                          <option value="apoyo">De apoyo</option>
                        </select>
                        {tipoErr && <small className="gm-error">{tipoErr}</small>}
                      </label>
                    </div>
                  </>
                )}

                {(tipo === "nuevo" || (tipo === "mejorar" && l.elegido)) && (
                  <div className="gm-rejilla">
                    <label className="admin-field gm-ancho">
                      <span>Nombre {tipo === "mejorar" ? "(cómo debe quedar) " : ""}*</span>
                      <input value={l.nombre} onChange={(e) => editar(l.clave, { nombre: e.target.value })} onBlur={() => marcar(`nombre-${l.clave}`)} placeholder="Ej. Preparación y diseño de clases" aria-invalid={Boolean(nombreErr)} />
                      {nombreErr && <small className="gm-error">{nombreErr}</small>}
                    </label>
                    {tipo === "mejorar" && (
                      <label className="admin-field">
                        <span>Tipo</span>
                        <select value={l.tipoActividad} onChange={(e) => editar(l.clave, { tipoActividad: e.target.value as LineaForm["tipoActividad"] })}>
                          <option value="">Sin cambio</option>
                          <option value="directa">Directa</option>
                          <option value="apoyo">De apoyo</option>
                        </select>
                      </label>
                    )}
                    <label className="admin-field">
                      <span>Vinculación (contratos)</span>
                      <input value={l.vinculacion} onChange={(e) => editar(l.clave, { vinculacion: e.target.value })} placeholder="Ej. TC, MT, Cátedra" />
                    </label>
                    <label className="admin-field gm-ancho">
                      <span>Instrucciones</span>
                      <textarea rows={2} value={l.instrucciones} onChange={(e) => editar(l.clave, { instrucciones: e.target.value })} />
                    </label>
                  </div>
                )}

                {tipo === "eliminar" && l.elegido && <p className="gm-nota">Se dará de baja {l.nombre ? `«${l.nombre}»` : l.codigo}. Lo que sigue es lo que el Master dice de este código hoy.</p>}

                {/* Los datos reales del código, desde el Warehouse: para decidir con información. */}
                {tipo === "nuevo" && l.nombre.trim().length >= 3 && <SimilarNuevo periodo={periodo} sede={sede} texto={l.nombre.trim()} />}
                {tipo !== "nuevo" && l.elegido && l.codigo && <PanelCodigo periodo={tipo === "mejorar" ? l.origenPeriodo : periodo} sede={tipo === "mejorar" ? l.origenSede : sede} codigo={l.codigo.trim().toUpperCase()} titulo={tipo === "eliminar" ? `A quién afecta eliminar ${l.codigo}` : undefined} />}
              </div>
            );
          })}

          {lineas.length < 30 && (
            <button type="button" className="button-secondary" onClick={() => setLineas((p) => [...p, nuevaLinea(periodo, sede)])}>
              Añadir otra actividad
            </button>
          )}
        </fieldset>

        <fieldset className="gm-seccion">
          <legend>Justificación</legend>
          <label className="admin-field">
            <span>Exposición de motivos *</span>
            <textarea
              rows={7}
              value={justificacion}
              maxLength={MAX_JUSTIFICACION}
              onChange={(e) => setJustificacion(e.target.value)}
              onBlur={() => marcar("justificacion")}
              aria-invalid={Boolean(ver("justificacion"))}
              aria-describedby="gm-just-ayuda"
              placeholder="Explique el impacto esperado, los recursos que necesita y cómo se alinea con los objetivos institucionales. Si requiere presupuesto adicional, dígalo de forma explícita: la Vicerrectoría Administrativa y Financiera lo lee primero."
            />
          </label>
          <div className="gm-contador-texto" id="gm-just-ayuda" data-error={Boolean(ver("justificacion"))}>
            <span>{ver("justificacion") ?? "Es lo que leen quienes aprueban. Determina si la solicitud avanza."}</span>
            <span aria-live="polite">
              {largo} / {MAX_JUSTIFICACION}
            </span>
          </div>
        </fieldset>

        {error && (
          <p className="gm-error gm-error--bloque" role="alert">
            {error}
          </p>
        )}
        <div className="gm-acciones">
          <button type="button" className="button-secondary" disabled={guardar.isPending} onClick={() => void enviar(true)}>
            Guardar borrador
          </button>
          <button type="submit" className="button-primary" disabled={guardar.isPending}>
            {guardar.isPending ? "Enviando…" : "Enviar a revisión"}
          </button>
          <button type="button" className="button-ghost" onClick={() => ctx.ir("bandeja")}>
            Cancelar
          </button>
        </div>
      </div>

      <aside className="gm-formulario__lado" aria-label="Ayuda">
        <section className="gm-guia">
          <h3>Guía de llenado</h3>
          <ul>
            <li>Agrupe en una misma solicitud las actividades que se deciden juntas; separe las que no.</li>
            <li>Evite descripciones genéricas: quien aprueba devuelve lo que no puede evaluar.</li>
            <li>Si el cambio requiere presupuesto adicional, dígalo de forma explícita en el texto.</li>
            <li>Un borrador y una solicitud devuelta se pueden editar; una enviada, no.</li>
            <li>Al final, Planeación aplica el cambio en el Master. El portal no escribe en el Master.</li>
          </ul>
        </section>
        <section className="gm-guia">
          <h3>Quién la aprueba</h3>
          {flujos.isPending ? (
            <p className="gm-nota">Leyendo el flujo…</p>
          ) : flujoDefecto ? (
            <>
              <ol className="gm-pasos-lista">
                {flujoDefecto.pasos.map((p) => (
                  <li key={p.orden}>{p.nombre}</li>
                ))}
              </ol>
              <p className="gm-nota">Cada decisión lleva una nota. Plazo indicativo: {flujoDefecto.plazo_dias || PLAZO_INDICADOR} días hábiles en total.</p>
            </>
          ) : (
            <p className="gm-aviso">Todavía no hay un flujo configurado.</p>
          )}
        </section>
      </aside>
    </form>
  );
}

/** «¿Ya existe algo parecido?»: busca por el nombre que se está escribiendo y muestra la ficha de lo que encuentra. */
function SimilarNuevo({ periodo, sede, texto }: { periodo: string; sede: string; texto: string }) {
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setConsulta(texto.split(/\s+/).slice(0, 3).join(" ")), 400);
    return () => window.clearTimeout(t);
  }, [texto]);
  const q = useBuscarCodigos(periodo, sede, consulta, consulta.length >= 3);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.data?.length) aparecer(ref.current);
  }, [q.data?.length]);
  if (!q.data?.length) return null;
  return (
    <div className="gm-parecidos" ref={ref}>
      <h4>¿Ya existe algo parecido?</h4>
      <p className="gm-nota">El catálogo del Master de {nombreSede(sede)} tiene {q.data.length === 40 ? "al menos " : ""}{q.data.length} {q.data.length === 1 ? "actividad que coincide" : "actividades que coinciden"} con «{consulta}».</p>
      <ul>
        {q.data.slice(0, 5).map((c) => (
          <li key={c.codigo}>
            <button type="button" aria-expanded={abierto === c.codigo} onClick={() => setAbierto(abierto === c.codigo ? null : c.codigo)}>
              <b className="gm-mono">{c.codigo}</b> {c.nombre ?? ""}
            </button>
            {abierto === c.codigo && <PanelCodigo periodo={periodo} sede={sede} codigo={c.codigo} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
