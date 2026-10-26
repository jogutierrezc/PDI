/* =============================================================================
   Gestión Master · una actividad dentro de la solicitud (tarjeta plegable).

   Cerrada es un renglón: código, nombre, qué cambia y si está completa. Abierta
   muestra solo los campos que corresponden al tipo elegido:
     Nuevo      nombre y tipo; el resto (código sugerido, vinculación, instrucciones) va plegado
     Editar     el código que cambia y, por cada dato, «hoy → propuesto» con un interruptor
     Mejorar    los datos del código del que parte, precargados
     Eliminar   a cuántos profesores afecta
   Los datos reales del código (profesores, horas, programa) NO van aquí: van en el
   panel «Qué hay hoy con este código», aparte de los campos de entrada.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { fichaDe, useBuscarCodigos } from "./api";
import { idCampo, valorActual, valorPropuesto, type ErrorForm, type LineaForm } from "./lineaForm";
import {
  AYUDA_CODIGO, CAMPOS_EDITAR, MAX_INSTRUCCIONES, MAX_MOTIVO, MAX_NOMBRE, MAX_VINCULACION, NOMBRE_CAMPO, SEDES, mensajeDe, nombrePeriodo, nombreSede,
  type CampoEditar, type Tipo,
} from "./modelo";
import { aparecer, entrada } from "./movimiento";

/** Un campo con su etiqueta visible, su ayuda corta debajo y su error en línea. */
export function Campo({ id, etiqueta, ayuda, error, contador, children, ancho }: { id: string; etiqueta: string; ayuda?: string; error?: string | null; contador?: { valor: number; max: number }; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={`gm-campo-form${ancho ? " gm-ancho" : ""}`} data-error={Boolean(error)}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      <div className="gm-campo-form__pie">
        <span id={`${id}-ayuda`} className={error ? "gm-error" : "gm-campo-form__ayuda"}>
          {error ?? ayuda ?? ""}
        </span>
        {contador && (
          <span className="gm-campo-form__cuenta" data-cerca={contador.valor >= contador.max * 0.9} aria-live="off">
            {contador.valor} / {contador.max}
          </span>
        )}
      </div>
    </div>
  );
}

/** Busca un código del catálogo del Master (periodo y sede de origen) y lo entrega al elegirlo. */
export function BuscadorCodigo({
  id, periodo, sede, etiqueta, ayuda, error, onElegir,
}: {
  id: string;
  periodo: string;
  sede: string;
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  onElegir: (c: { codigo: string; nombre: string | null; tipo_actividad: string; vinculacion: string | null }) => void;
}) {
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setConsulta(texto.trim()), 250);
    return () => window.clearTimeout(t);
  }, [texto]);
  const q = useBuscarCodigos(periodo, sede, consulta, consulta.length >= 1);
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.data?.length) entrada(lista.current?.querySelectorAll("li") ?? null, 6);
  }, [q.data]);
  return (
    <div className="gm-buscador">
      <Campo id={id} etiqueta={etiqueta} ayuda={ayuda ?? `Busque por código o por nombre en el catálogo del Master de ${nombreSede(sede)}, ${nombrePeriodo(periodo)}.`} error={error}>
        <input id={id} type="search" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. DOC-10 o «preparación de clases»" aria-describedby={`${id}-ayuda`} aria-invalid={Boolean(error)} />
      </Campo>
      {consulta.length >= 1 && (
        <div className="gm-resultados" role="region" aria-label="Resultados de la búsqueda" aria-live="polite" ref={lista}>
          {q.isPending ? (
            <p className="gm-nota">Buscando…</p>
          ) : q.error ? (
            <p className="gm-aviso">{mensajeDe(q.error)}</p>
          ) : q.data.length === 0 ? (
            <p className="gm-nota">No hay códigos que coincidan en el catálogo de esta sede y periodo. Si no hay captura de ese periodo, pídale a Planeación que la cargue en el Warehouse.</p>
          ) : (
            <ul>
              {q.data.map((c) => (
                <li key={c.codigo}>
                  <button type="button" onClick={() => { onElegir(c); setTexto(""); setConsulta(""); }}>
                    <b className="gm-mono">{c.codigo}</b> {c.nombre ?? ""}
                    <small>
                      {c.tipo_actividad === "directa" ? "Directa" : c.tipo_actividad === "apoyo" ? "De apoyo" : c.tipo_actividad}
                      {c.vinculacion ? ` · ${c.vinculacion.slice(0, 60)}` : ""}
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

/** «¿Ya existe algo parecido?»: busca por el nombre que se está escribiendo; elegir uno lo muestra en el panel lateral. */
export function ParecidosNuevo({ periodo, sede, texto, onVer }: { periodo: string; sede: string; texto: string; onVer: (codigo: string) => void }) {
  const [consulta, setConsulta] = useState("");
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
    <div className="gm-parecidos" ref={ref} role="status">
      <h4>¿Ya existe algo parecido?</h4>
      <p className="gm-nota">
        {nombreSede(sede)} tiene {q.data.length === 40 ? "al menos " : ""}
        {q.data.length} {q.data.length === 1 ? "actividad que coincide" : "actividades que coinciden"} con «{consulta}». Mírelas antes de crear otra.
      </p>
      <ul>
        {q.data.slice(0, 4).map((c) => (
          <li key={c.codigo}>
            <button type="button" onClick={() => onVer(c.codigo)}>
              <b className="gm-mono">{c.codigo}</b> {c.nombre ?? ""} <small>Ver qué hay hoy</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  linea: LineaForm;
  indice: number;
  total: number;
  tipo: Tipo;
  periodo: string;
  sede: string;
  periodos: string[];
  errores: ErrorForm[];
  mostrar: boolean;
  tocado: Set<string>;
  onMarcar: (id: string) => void;
  onCambio: (cambio: Partial<LineaForm>) => void;
  onElegir: (c: { codigo: string; nombre: string | null; tipo_actividad: string; vinculacion: string | null }, origenPeriodo: string, origenSede: string) => void;
  onQuitar: () => void;
  onDuplicar?: () => void;
  onActivar: (codigo: string) => void;
}

export function TarjetaActividad({ linea: l, indice, total, tipo, periodo, sede, periodos, errores, mostrar, tocado, onMarcar, onCambio, onElegir, onQuitar, onDuplicar, onActivar }: Props) {
  const cuerpo = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (l.abierta) entrada(cuerpo.current?.children ?? null, 6);
  }, [l.abierta]);

  const err = (campo: string): string | null => {
    const id = idCampo(l.clave, campo);
    const e = errores.find((x) => x.id === id);
    if (!e || !(mostrar || tocado.has(id))) return null;
    // El mensaje en línea no repite «Actividad 2:».
    return e.mensaje.replace(/^Actividad \d+: /, "").replace(/^./, (c) => c.toUpperCase());
  };
  const tieneErrores = errores.length > 0;
  const titulo = (() => {
    const cod = l.codigo.trim().toUpperCase();
    if (tipo === "nuevo") return [cod, l.nombre.trim()].filter(Boolean).join(" · ") || "Actividad nueva, sin nombre todavía";
    if (!l.elegido) return "Todavía sin elegir";
    return `${cod}${tipo === "editar" && l.cambia.codigo && l.codigoNuevo.trim() ? ` → ${l.codigoNuevo.trim().toUpperCase()}` : ""}${l.actual?.nombre ? ` · ${l.actual.nombre}` : l.nombre ? ` · ${l.nombre}` : ""}`;
  })();
  const resumenCambios = tipo === "editar" ? CAMPOS_EDITAR.filter((c) => l.cambia[c]).map((c) => NOMBRE_CAMPO[c].toLowerCase()).join(", ") : "";
  const periodoSede = tipo === "mejorar" ? { p: l.origenPeriodo, s: l.origenSede } : { p: periodo, s: sede };

  const cambiarCampo = (campo: CampoEditar, valor: boolean) => {
    const siguiente = { ...l.cambia, [campo]: valor };
    const parche: Partial<LineaForm> = { cambia: siguiente };
    // Al marcar un dato, el campo parte de lo que hay hoy: se edita, no se escribe de cero.
    if (valor && l.actual) {
      if (campo === "nombre" && !l.nombre) parche.nombre = l.actual.nombre.slice(0, MAX_NOMBRE);
      if (campo === "tipo_actividad" && !l.tipoActividad) parche.tipoActividad = l.actual.tipoActividad;
      if (campo === "vinculacion" && !l.vinculacion) parche.vinculacion = l.actual.vinculacion.slice(0, MAX_VINCULACION);
      if (campo === "instrucciones" && !l.instrucciones) parche.instrucciones = l.actual.instrucciones.slice(0, MAX_INSTRUCCIONES);
    }
    onCambio(parche);
  };

  async function comprobarCodigoNuevo() {
    const nuevo = l.codigoNuevo.trim().toUpperCase();
    onMarcar(idCampo(l.clave, "codigo-nuevo"));
    if (!nuevo || nuevo === l.codigo.trim().toUpperCase()) return onCambio({ avisoCodigoNuevo: "" });
    try {
      const f = await fichaDe(periodo, sede, nuevo);
      onCambio({ avisoCodigoNuevo: f.catalogo ? `El código ${nuevo} ya existe en el catálogo de ${nombreSede(sede)} (${f.catalogo.nombre ?? "sin nombre"}). Elija otro.` : "" });
    } catch {
      onCambio({ avisoCodigoNuevo: "" });
    }
  }

  return (
    <article className="gm-tarjeta" data-abierta={l.abierta} data-conerrores={tieneErrores && (mostrar || l.abierta === false)} onFocusCapture={() => l.elegido && onActivar(l.codigo.trim().toUpperCase())}>
      <header className="gm-tarjeta__cabeza">
        <button type="button" className="gm-tarjeta__alternar" aria-expanded={l.abierta} aria-controls={`gm-cuerpo-${l.clave}`} onClick={() => onCambio({ abierta: !l.abierta })}>
          <span className="gm-tarjeta__n">Actividad {indice + 1}</span>
          <span className="gm-tarjeta__titulo">{titulo}</span>
          {!l.abierta && resumenCambios && <span className="gm-tarjeta__sub">Cambia: {resumenCambios}</span>}
        </button>
        <span className="gm-pill" data-tono={tieneErrores ? "aviso" : "ok"}>
          {tieneErrores ? "Falta algo" : "Completa"}
        </span>
        <span className="gm-tarjeta__acciones">
          {onDuplicar && (
            <button type="button" className="button-ghost" onClick={onDuplicar} aria-label={`Duplicar la actividad ${indice + 1}`}>
              Duplicar
            </button>
          )}
          {(total > 1 || l.elegido) && (
            <button type="button" className="button-ghost" onClick={onQuitar} aria-label={`Quitar la actividad ${indice + 1}`}>
              Quitar
            </button>
          )}
        </span>
      </header>

      {l.abierta && (
        <div className="gm-tarjeta__cuerpo" id={`gm-cuerpo-${l.clave}`} ref={cuerpo}>
          {tipo !== "nuevo" && !l.elegido && (
            <>
              {tipo === "mejorar" && (
                <details className="gm-plegable">
                  <summary>Parte de otro periodo o de otra sede ({nombrePeriodo(l.origenPeriodo)} · {nombreSede(l.origenSede)})</summary>
                  <div className="gm-rejilla">
                    <Campo id={idCampo(l.clave, "origen-periodo")} etiqueta="Periodo del que parte">
                      <select id={idCampo(l.clave, "origen-periodo")} value={l.origenPeriodo} onChange={(e) => onCambio({ origenPeriodo: e.target.value })}>
                        {periodos.map((p) => (
                          <option key={p} value={p}>
                            {nombrePeriodo(p)}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo id={idCampo(l.clave, "origen-sede")} etiqueta="Sede de origen">
                      <select id={idCampo(l.clave, "origen-sede")} value={l.origenSede} onChange={(e) => onCambio({ origenSede: e.target.value })}>
                        {SEDES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                </details>
              )}
              <BuscadorCodigo
                id={idCampo(l.clave, "buscar")}
                periodo={periodoSede.p}
                sede={periodoSede.s}
                etiqueta={tipo === "mejorar" ? "¿De qué código parte?" : tipo === "editar" ? "¿Qué código quiere editar?" : "¿Qué código quiere eliminar?"}
                error={err("buscar")}
                onElegir={(c) => onElegir(c, periodoSede.p, periodoSede.s)}
              />
            </>
          )}

          {tipo !== "nuevo" && l.elegido && (
            <p className="gm-elegido">
              <span>
                Código elegido: <b className="gm-mono">{l.codigo.toUpperCase()}</b>
                {l.actual?.nombre ? ` · ${l.actual.nombre}` : ""}
              </span>
              <button type="button" className="button-ghost" onClick={() => onCambio({ elegido: false, codigo: "", origenCodigo: "", actual: null, cambia: { codigo: false, nombre: false, tipo_actividad: false, vinculacion: false, instrucciones: false }, nombre: "", tipoActividad: "", vinculacion: "", instrucciones: "", codigoNuevo: "", avisoCodigoNuevo: "", recortes: [] })}>
                Elegir otro
              </button>
            </p>
          )}
          {l.recortes.length > 0 && (
            <p className="gm-aviso" role="status">
              Se recortó para caber: {l.recortes.join("; ")}. Revise el texto antes de enviar.
            </p>
          )}

          {tipo === "nuevo" && (
            <>
              <div className="gm-rejilla">
                <Campo id={idCampo(l.clave, "nombre")} etiqueta="Nombre de la actividad" ayuda="Cómo se va a llamar en el Master." error={err("nombre")} contador={{ valor: l.nombre.length, max: MAX_NOMBRE }} ancho>
                  <input id={idCampo(l.clave, "nombre")} maxLength={MAX_NOMBRE} value={l.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} onBlur={() => onMarcar(idCampo(l.clave, "nombre"))} placeholder="Ej. Laboratorio de práctica guiada" aria-describedby={`${idCampo(l.clave, "nombre")}-ayuda`} aria-invalid={Boolean(err("nombre"))} />
                </Campo>
                <Campo id={idCampo(l.clave, "tipo")} etiqueta="¿Es directa o de apoyo?" ayuda="Directa: se da con estudiantes. De apoyo: la prepara o la sostiene." error={err("tipo")}>
                  <select id={idCampo(l.clave, "tipo")} value={l.tipoActividad} onChange={(e) => onCambio({ tipoActividad: e.target.value as LineaForm["tipoActividad"] })} onBlur={() => onMarcar(idCampo(l.clave, "tipo"))} aria-describedby={`${idCampo(l.clave, "tipo")}-ayuda`} aria-invalid={Boolean(err("tipo"))}>
                    <option value="">Elija…</option>
                    <option value="directa">Directa</option>
                    <option value="apoyo">De apoyo</option>
                  </select>
                </Campo>
              </div>
              <details className="gm-plegable" open={Boolean(l.codigo || l.vinculacion || l.instrucciones || err("codigo"))}>
                <summary>Código sugerido, vinculación e instrucciones (opcional)</summary>
                <div className="gm-rejilla">
                  <Campo id={idCampo(l.clave, "codigo")} etiqueta="Código sugerido" ayuda={`${AYUDA_CODIGO} Si lo deja vacío, Planeación lo asigna.`} error={err("codigo")}>
                    <input id={idCampo(l.clave, "codigo")} value={l.codigo} onChange={(e) => onCambio({ codigo: e.target.value.toUpperCase() })} onBlur={() => onMarcar(idCampo(l.clave, "codigo"))} placeholder="ACT-45" aria-describedby={`${idCampo(l.clave, "codigo")}-ayuda`} aria-invalid={Boolean(err("codigo"))} />
                  </Campo>
                  <Campo id={idCampo(l.clave, "vinculacion")} etiqueta="Tipo de vinculación" ayuda="Los contratos a los que aplica." error={err("vinculacion")} contador={{ valor: l.vinculacion.length, max: MAX_VINCULACION }}>
                    <input id={idCampo(l.clave, "vinculacion")} maxLength={MAX_VINCULACION} value={l.vinculacion} onChange={(e) => onCambio({ vinculacion: e.target.value })} placeholder="Ej. TC, MT, Cátedra" />
                  </Campo>
                  <Campo id={idCampo(l.clave, "instrucciones")} etiqueta="Instrucciones" ayuda="Qué debe tener en cuenta quien la registre." error={err("instrucciones")} contador={{ valor: l.instrucciones.length, max: MAX_INSTRUCCIONES }} ancho>
                    <textarea id={idCampo(l.clave, "instrucciones")} rows={3} maxLength={MAX_INSTRUCCIONES} value={l.instrucciones} onChange={(e) => onCambio({ instrucciones: e.target.value })} />
                  </Campo>
                </div>
              </details>
            </>
          )}

          {tipo === "mejorar" && l.elegido && (
            <>
              <div className="gm-rejilla">
                <Campo id={idCampo(l.clave, "nombre")} etiqueta="Nombre, como debe quedar" ayuda="Parte del nombre actual: ajústelo si cambia." error={err("nombre")} contador={{ valor: l.nombre.length, max: MAX_NOMBRE }} ancho>
                  <input id={idCampo(l.clave, "nombre")} maxLength={MAX_NOMBRE} value={l.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} onBlur={() => onMarcar(idCampo(l.clave, "nombre"))} aria-describedby={`${idCampo(l.clave, "nombre")}-ayuda`} aria-invalid={Boolean(err("nombre"))} />
                </Campo>
                <Campo id={idCampo(l.clave, "tipo")} etiqueta="Tipo de actividad">
                  <select id={idCampo(l.clave, "tipo")} value={l.tipoActividad} onChange={(e) => onCambio({ tipoActividad: e.target.value as LineaForm["tipoActividad"] })}>
                    <option value="">Sin cambio</option>
                    <option value="directa">Directa</option>
                    <option value="apoyo">De apoyo</option>
                  </select>
                </Campo>
              </div>
              <details className="gm-plegable">
                <summary>Vinculación e instrucciones</summary>
                <div className="gm-rejilla">
                  <Campo id={idCampo(l.clave, "vinculacion")} etiqueta="Tipo de vinculación" error={err("vinculacion")} contador={{ valor: l.vinculacion.length, max: MAX_VINCULACION }}>
                    <input id={idCampo(l.clave, "vinculacion")} maxLength={MAX_VINCULACION} value={l.vinculacion} onChange={(e) => onCambio({ vinculacion: e.target.value })} />
                  </Campo>
                  <Campo id={idCampo(l.clave, "instrucciones")} etiqueta="Instrucciones" error={err("instrucciones")} contador={{ valor: l.instrucciones.length, max: MAX_INSTRUCCIONES }} ancho>
                    <textarea id={idCampo(l.clave, "instrucciones")} rows={3} maxLength={MAX_INSTRUCCIONES} value={l.instrucciones} onChange={(e) => onCambio({ instrucciones: e.target.value })} />
                  </Campo>
                </div>
              </details>
            </>
          )}

          {tipo === "editar" && l.elegido && (
            <>
              <fieldset className="gm-cambios" id={idCampo(l.clave, "cambios")} tabIndex={-1}>
                <legend>¿Qué cambia?</legend>
                <p className="gm-ayuda">Marque solo lo que cambia. Cada dato muestra lo que hay hoy y cómo quedaría.</p>
                {err("cambios") && <p className="gm-error">{err("cambios")}</p>}
                {CAMPOS_EDITAR.map((c) => {
                  const marcado = l.cambia[c];
                  const idc = idCampo(l.clave, c === "codigo" ? "codigo-nuevo" : c === "tipo_actividad" ? "tipo" : c);
                  const hoy = valorActual(l.actual, c);
                  return (
                    <div className="gm-cambio" key={c} data-activo={marcado}>
                      <label className="gm-cambio__interruptor">
                        <input type="checkbox" checked={marcado} onChange={(e) => cambiarCampo(c, e.target.checked)} />
                        <span>{NOMBRE_CAMPO[c]}</span>
                      </label>
                      <p className="gm-cambio__hoy">
                        <span>Hoy</span> {hoy.length > 160 ? `${hoy.slice(0, 160)}…` : hoy}
                      </p>
                      {marcado && (
                        <div className="gm-cambio__nuevo">
                          {c === "codigo" && (
                            <>
                              <Campo id={idc} etiqueta="Código nuevo" ayuda={AYUDA_CODIGO} error={err("codigo-nuevo")}>
                                <input id={idc} value={l.codigoNuevo} onChange={(e) => onCambio({ codigoNuevo: e.target.value.toUpperCase(), avisoCodigoNuevo: "" })} onBlur={() => void comprobarCodigoNuevo()} placeholder="ACT-45" aria-describedby={`${idc}-ayuda`} aria-invalid={Boolean(err("codigo-nuevo"))} />
                              </Campo>
                              <p className="gm-impacto" role="note">
                                {l.actual?.sinCaptura
                                  ? "No hay captura de la nómina: no se sabe cuántos profesores usan este código."
                                  : l.actual?.nProfesores
                                    ? `Hoy ${l.actual.nProfesores === 1 ? "lo tiene asignado 1 profesor" : `lo tienen asignado ${l.actual.nProfesores} profesores`}. Al cambiar el código, esas asignaciones deben pasar al código nuevo.`
                                    : "Ningún profesor lo tiene asignado en este periodo."}
                              </p>
                            </>
                          )}
                          {c === "nombre" && (
                            <Campo id={idc} etiqueta="Nombre nuevo" error={err("nombre")} contador={{ valor: l.nombre.length, max: MAX_NOMBRE }}>
                              <input id={idc} maxLength={MAX_NOMBRE} value={l.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} onBlur={() => onMarcar(idc)} aria-describedby={`${idc}-ayuda`} aria-invalid={Boolean(err("nombre"))} />
                            </Campo>
                          )}
                          {c === "tipo_actividad" && (
                            <Campo id={idc} etiqueta="Tipo nuevo" error={err("tipo")}>
                              <select id={idc} value={l.tipoActividad} onChange={(e) => onCambio({ tipoActividad: e.target.value as LineaForm["tipoActividad"] })} onBlur={() => onMarcar(idc)} aria-describedby={`${idc}-ayuda`} aria-invalid={Boolean(err("tipo"))}>
                                <option value="">Elija…</option>
                                <option value="directa">Directa</option>
                                <option value="apoyo">De apoyo</option>
                              </select>
                            </Campo>
                          )}
                          {c === "vinculacion" && (
                            <Campo id={idc} etiqueta="Vinculación nueva" error={err("vinculacion")} contador={{ valor: l.vinculacion.length, max: MAX_VINCULACION }}>
                              <input id={idc} maxLength={MAX_VINCULACION} value={l.vinculacion} onChange={(e) => onCambio({ vinculacion: e.target.value })} onBlur={() => onMarcar(idc)} aria-describedby={`${idc}-ayuda`} aria-invalid={Boolean(err("vinculacion"))} />
                            </Campo>
                          )}
                          {c === "instrucciones" && (
                            <Campo id={idc} etiqueta="Instrucciones nuevas" error={err("instrucciones")} contador={{ valor: l.instrucciones.length, max: MAX_INSTRUCCIONES }}>
                              <textarea id={idc} rows={3} maxLength={MAX_INSTRUCCIONES} value={l.instrucciones} onChange={(e) => onCambio({ instrucciones: e.target.value })} onBlur={() => onMarcar(idc)} aria-describedby={`${idc}-ayuda`} aria-invalid={Boolean(err("instrucciones"))} />
                            </Campo>
                          )}
                          <p className="gm-cambio__flecha" aria-live="polite">
                            <span>{hoy.length > 60 ? `${hoy.slice(0, 60)}…` : hoy}</span> → <b>{(() => { const v = valorPropuesto(l, c); return v.length > 60 ? `${v.slice(0, 60)}…` : v; })()}</b>
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              <Campo id={idCampo(l.clave, "motivo")} etiqueta="Motivo del cambio" ayuda="En una frase: por qué se pide este cambio en esta actividad." error={err("motivo")} contador={{ valor: l.motivo.length, max: MAX_MOTIVO }}>
                <input id={idCampo(l.clave, "motivo")} maxLength={MAX_MOTIVO} value={l.motivo} onChange={(e) => onCambio({ motivo: e.target.value })} onBlur={() => onMarcar(idCampo(l.clave, "motivo"))} placeholder="Ej. El nombre actual no distingue la práctica del curso" aria-describedby={`${idCampo(l.clave, "motivo")}-ayuda`} aria-invalid={Boolean(err("motivo"))} />
              </Campo>
            </>
          )}

          {tipo === "eliminar" && l.elegido && (
            <p className="gm-impacto" role="note">
              {l.actual?.sinCaptura
                ? "No hay captura de la nómina: no se sabe cuántos profesores usan este código."
                : l.actual?.nProfesores
                  ? `Dar de baja este código afecta a ${l.actual.nProfesores} ${l.actual.nProfesores === 1 ? "profesor" : "profesores"} que hoy lo tienen asignado. Revise el panel «Qué hay hoy con este código».`
                  : "Ningún profesor lo tiene asignado en este periodo: darlo de baja no afecta asignaciones."}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
