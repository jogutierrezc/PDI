/* =============================================================================
   Gestión Master · Nueva solicitud.

   Un camino en cuatro pasos, uno a la vez:
     1  Qué quiere hacer     Nuevo · Editar · Mejorar o mantener · Eliminar (y dónde aplica)
     2  Actividades          una tarjeta plegable por actividad, solo con los campos del tipo
     3  Justificación        con contador, una guía y un ejemplo
     4  Revisar y enviar     resumen legible y qué pasa después

   Sale de Rua con su lógica: varias actividades que se deciden juntas, cada una
   precargada con lo que hay hoy, justificación de 150 a 2000 caracteres, errores
   en línea solo en lo ya tocado (y un resumen que enlaza a cada campo al intentar
   enviar), borrador, folio y la regla de que una enviada ya no se edita.

   Lo propio de aquí: al elegir un código existente, el panel «Qué hay hoy con este
   código» muestra, desde el Warehouse, el catálogo, cuántos profesores lo tienen,
   horas, promedio, programa y (si se pide) nombres. Va aparte de los campos.

   El borrador se guarda solo en este equipo mientras se escribe; «Guardar borrador»
   lo guarda además en el portal, con folio.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fichaDe, useDetalle, useFlujos, useGuardarSolicitud, useUnidades } from "./api";
import type { Contexto } from "./contexto";
import { sedeUnica } from "./contexto";
import {
  aEntrada, camposQueCambian, idCampo, nuevaLinea, recortar, sinCambios, tituloLinea, validar, valorActual, valorPropuesto,
  type Actual, type ErrorForm, type LineaForm,
} from "./lineaForm";
import {
  MAX_INSTRUCCIONES, MAX_JUSTIFICACION, MAX_NOMBRE, MAX_VINCULACION, MIN_JUSTIFICACION, NOMBRE_CAMPO, PLAZO_INDICADOR, PRIORIDADES, SEDES, TIPOS,
  mensajeDe, nombrePeriodo, nombreSede, nombreTipoActividad, type CampoEditar, type Prioridad, type Tipo,
} from "./modelo";
import { PanelCodigo } from "./PanelCodigo";
import { aparecer, cambiarPaso, entrada } from "./movimiento";
import { Cargando, ErrorCaja } from "./partes";
import { Campo, ParecidosNuevo, TarjetaActividad } from "./TarjetaActividad";

const PASOS = [
  { n: 1, titulo: "Qué quiere hacer" },
  { n: 2, titulo: "Actividades" },
  { n: 3, titulo: "Justificación" },
  { n: 4, titulo: "Revisar y enviar" },
] as const;

const CLAVE_LOCAL = "gm-formulario-borrador";

interface Guardado {
  v: 1;
  tipo: Tipo | null;
  prioridad: Prioridad;
  periodo: string;
  sede: string;
  unidad: string;
  justificacion: string;
  lineas: LineaForm[];
  paso: number;
  ts: number;
}

const leerLocal = (): Guardado | null => {
  try {
    const t = window.localStorage.getItem(CLAVE_LOCAL);
    const g = t ? (JSON.parse(t) as Guardado) : null;
    return g && g.v === 1 ? g : null;
  } catch {
    return null;
  }
};
const escribirLocal = (g: Guardado | null) => {
  try {
    if (g) window.localStorage.setItem(CLAVE_LOCAL, JSON.stringify(g));
    else window.localStorage.removeItem(CLAVE_LOCAL);
  } catch {
    /* sin almacenamiento: el formulario sigue, solo que sin copia local */
  }
};
const hace = (ts: number, ahora: number) => {
  const s = Math.max(0, Math.round((ahora - ts) / 1000));
  return s < 10 ? "hace un momento" : s < 60 ? `hace ${s} segundos` : s < 3600 ? `hace ${Math.round(s / 60)} min` : "hace más de una hora";
};
const hayContenido = (g: { tipo: Tipo | null; lineas: LineaForm[]; justificacion: string }) =>
  Boolean(g.tipo) && (g.justificacion.trim().length > 0 || g.lineas.some((l) => l.nombre.trim() || l.codigo.trim() || l.elegido));

const PREGUNTA: Record<Tipo, string> = {
  nuevo: "¿Qué actividad quiere crear?",
  editar: "¿Qué códigos quiere editar y qué cambia en cada uno?",
  mejorar: "¿De qué códigos parte y cómo quedan?",
  eliminar: "¿Qué códigos quiere dar de baja?",
};

export function Formulario({ ctx, id }: { ctx: Contexto; id?: string }) {
  const sedeInicial = sedeUnica(ctx.sede);
  const unidades = useUnidades();
  const flujos = useFlujos();
  const guardar = useGuardarSolicitud();
  const borrador = useDetalle(id ?? null);
  const [params] = useSearchParams();

  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [periodo, setPeriodo] = useState(ctx.periodo);
  const [sede, setSede] = useState(sedeInicial);
  const [unidad, setUnidad] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [justificacion, setJustificacion] = useState("");
  const [tocado, setTocado] = useState<Set<string>>(new Set());
  const [mostrar, setMostrar] = useState(false);
  const [falla, setFalla] = useState("");
  const [aviso, setAviso] = useState("");
  const [cargado, setCargado] = useState(false);
  const [servidorId, setServidorId] = useState<string | null>(id ?? null);
  const [guardadoEn, setGuardadoEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [restaurable, setRestaurable] = useState<Guardado | null>(null);
  const [enviado, setEnviado] = useState<{ id: string; folio: string } | null>(null);
  const [panel, setPanel] = useState<{ codigo: string; periodo: string; sede: string } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const direccion = useRef<1 | -1>(1);
  const panelPaso = useRef<HTMLDivElement>(null);
  const tituloPaso = useRef<HTMLHeadingElement>(null);
  const primeraVez = useRef(true);
  const envio = useRef<HTMLDivElement>(null);
  const ancho = useMemo(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(min-width: 1100px)").matches), []);

  const errores = useMemo(() => validar(tipo, periodo, sede, lineas, justificacion), [tipo, periodo, sede, lineas, justificacion]);
  const del = (p: number) => errores.filter((e) => e.paso === p);

  // --- Valores por defecto inteligentes ---------------------------------------------------------
  useEffect(() => {
    if (!unidad && unidades.data?.length === 1 && !id) setUnidad(unidades.data[0].id);
  }, [unidades.data, unidad, id]);

  // --- Un borrador sin enviar en este equipo ----------------------------------------------------
  useEffect(() => {
    if (id || params.get("codigo")) return;
    const g = leerLocal();
    if (g && hayContenido(g)) setRestaurable(g);
  }, [id, params]);

  // --- Editar un borrador o una devuelta: se parte de lo guardado --------------------------------
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
      d.lineas.map((l, i) => {
        const cat = l.antes?.ficha?.catalogo ?? null;
        const actual: Actual | null = d.tipo === "nuevo" ? null : {
          codigo: l.codigo ?? "",
          nombre: cat?.nombre ?? "",
          tipoActividad: cat?.directa === true ? "directa" : cat?.directa === false ? "apoyo" : "",
          vinculacion: cat?.vinculacion ?? "",
          instrucciones: cat?.instrucciones ?? "",
          nProfesores: l.antes?.ficha?.n_profesores ?? null,
          sinCaptura: Boolean(l.antes?.ficha?.sin_captura_nomina),
        };
        const base = nuevaLinea(d.periodo, d.sede);
        const c = l.cambios ?? {};
        return {
          ...base,
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
          codigoNuevo: l.codigo_nuevo ?? "",
          motivo: l.motivo ?? "",
          cambia: { ...sinCambios(), ...Object.fromEntries(Object.keys(c).map((k) => [k, true])) },
          actual,
          abierta: i === 0,
        };
      }),
    );
    setPaso(2);
    setCargado(true);
  }, [id, borrador.data, cargado]);

  // --- Copia local mientras se escribe -----------------------------------------------------------
  useEffect(() => {
    if (id || enviado) return;
    const g: Guardado = { v: 1, tipo, prioridad, periodo, sede, unidad, justificacion, lineas, paso, ts: Date.now() };
    if (!hayContenido(g)) return;
    const t = window.setTimeout(() => {
      escribirLocal(g);
      setGuardadoEn(g.ts);
    }, 700);
    return () => window.clearTimeout(t);
  }, [tipo, prioridad, periodo, sede, unidad, justificacion, lineas, paso, id, enviado]);
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  // --- Transición entre pasos ---------------------------------------------------------------------
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    cambiarPaso(panelPaso.current, direccion.current);
    tituloPaso.current?.focus({ preventScroll: false });
    setAnuncio(`Paso ${paso} de ${PASOS.length}: ${PASOS[paso - 1].titulo}`);
  }, [paso]);
  useEffect(() => {
    if (enviado) aparecer(envio.current);
  }, [enviado]);

  const ir = (n: number) => {
    direccion.current = n >= paso ? 1 : -1;
    setPaso(n);
  };

  const editar = useCallback((clave: string, cambio: Partial<LineaForm>) => setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambio } : l))), []);
  const marcar = useCallback((campo: string) => setTocado((t) => (t.has(campo) ? t : new Set(t).add(campo))), []);

  function elegirTipo(t: Tipo) {
    if (t === tipo) return;
    setTipo(t);
    // Las líneas de un tipo no significan lo mismo en otro: se parte de una tarjeta vacía.
    setLineas([nuevaLinea(periodo, sede)]);
    setTocado(new Set());
    setMostrar(false);
    setPanel(null);
  }

  /** Al elegir un código se lee su ficha del Warehouse: lo actual para comparar y, en Mejorar, los datos precargados. */
  async function elegir(clave: string, tipoActual: Tipo, c: { codigo: string; nombre: string | null; tipo_actividad: string; vinculacion: string | null }, per: string, sed: string) {
    editar(clave, { elegido: true, codigo: c.codigo, origenCodigo: c.codigo, origenPeriodo: per, origenSede: sed, actual: { codigo: c.codigo, nombre: c.nombre ?? "", tipoActividad: c.tipo_actividad === "directa" || c.tipo_actividad === "apoyo" ? c.tipo_actividad : "", vinculacion: c.vinculacion ?? "", instrucciones: "", nProfesores: null, sinCaptura: false }, nombre: tipoActual === "mejorar" ? (c.nombre ?? "").slice(0, MAX_NOMBRE) : "" });
    setPanel({ codigo: c.codigo, periodo: per, sede: sed });
    try {
      const f = await fichaDe(per, sed, c.codigo);
      const cat = f.catalogo;
      const actual: Actual = {
        codigo: c.codigo,
        nombre: cat?.nombre ?? c.nombre ?? "",
        tipoActividad: cat?.directa === true ? "directa" : cat?.directa === false ? "apoyo" : c.tipo_actividad === "directa" || c.tipo_actividad === "apoyo" ? c.tipo_actividad : "",
        vinculacion: cat?.vinculacion ?? c.vinculacion ?? "",
        instrucciones: cat?.instrucciones ?? "",
        nProfesores: f.n_profesores,
        sinCaptura: f.sin_captura_nomina,
      };
      const parche: Partial<LineaForm> = { actual };
      if (tipoActual === "mejorar") {
        const n = recortar(actual.nombre, MAX_NOMBRE, "nombre");
        const v = recortar(actual.vinculacion, MAX_VINCULACION, "vinculación");
        const i = recortar(actual.instrucciones, MAX_INSTRUCCIONES, "instrucciones");
        Object.assign(parche, { nombre: n.texto, tipoActividad: actual.tipoActividad, vinculacion: v.texto, instrucciones: i.texto, recortes: [n.recorte, v.recorte, i.recorte].filter((x): x is string => Boolean(x)) });
      }
      editar(clave, parche);
    } catch {
      /* sin ficha, la tarjeta sigue con lo que trajo la búsqueda */
    }
  }

  // --- Llegar desde Estructura con el tipo y el código ya elegidos -------------------------------
  useEffect(() => {
    const t = params.get("tipo");
    const codigo = (params.get("codigo") ?? "").toUpperCase();
    if (id || !codigo || (t !== "editar" && t !== "mejorar" && t !== "eliminar")) return;
    const l = nuevaLinea(ctx.periodo, sedeInicial);
    setTipo(t);
    setLineas([l]);
    setPaso(2);
    void elegir(l.clave, t, { codigo, nombre: null, tipo_actividad: "", vinculacion: null }, ctx.periodo, sedeInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agregar = () => {
    const nueva = nuevaLinea(periodo, sede);
    setLineas((p) => [...p.map((l) => ({ ...l, abierta: false })), nueva]);
    window.setTimeout(() => document.getElementById(`gm-cuerpo-${nueva.clave}`)?.querySelector<HTMLElement>("input, select, textarea")?.focus(), 60);
  };
  const duplicar = (clave: string) =>
    setLineas((p) => {
      const o = p.find((l) => l.clave === clave);
      if (!o) return p;
      const c = nuevaLinea(periodo, sede);
      return [...p.map((l) => ({ ...l, abierta: false })), { ...o, clave: c.clave, codigo: "", abierta: true }];
    });
  const quitar = (clave: string) => setLineas((p) => (p.length > 1 ? p.filter((l) => l.clave !== clave) : [nuevaLinea(periodo, sede)]));

  /** Lleva a un campo con problema: cambia de paso, abre su tarjeta y le da el foco. */
  function irAlError(e: ErrorForm) {
    if (e.clave) editar(e.clave, { abierta: true });
    ir(e.paso);
    window.setTimeout(() => document.getElementById(e.id)?.focus(), 120);
  }

  function continuar() {
    const faltan = del(paso);
    if (faltan.length > 0) {
      setMostrar(true);
      setAnuncio(`Falta completar ${faltan.length} ${faltan.length === 1 ? "dato" : "datos"} en este paso.`);
      document.getElementById(faltan[0].id)?.focus();
      return;
    }
    ir(paso + 1);
  }

  async function guardarEnPortal(enviar: boolean) {
    setFalla("");
    setAviso("");
    if (!tipo) return;
    if (enviar && errores.length > 0) {
      setMostrar(true);
      irAlError(errores[0]);
      return;
    }
    try {
      const r = await guardar.mutateAsync({
        id: servidorId,
        tipo,
        prioridad,
        unidad: unidad || null,
        periodo,
        sede,
        justificacion: justificacion.trim(),
        lineas: lineas.map((l) => aEntrada(l, tipo)),
        enviar,
      });
      setServidorId(r.id);
      if (enviar) {
        escribirLocal(null);
        setEnviado({ id: r.id, folio: r.folio });
        setAnuncio(`Solicitud ${r.folio} enviada.`);
      } else {
        escribirLocal(null);
        setAviso(`Borrador guardado en el portal como ${r.folio}. Puede seguir o volver luego desde la bandeja.`);
      }
    } catch (e) {
      setFalla(mensajeDe(e));
    }
  }

  function restaurar(g: Guardado) {
    setTipo(g.tipo);
    setPrioridad(g.prioridad);
    setPeriodo(g.periodo);
    setSede(g.sede);
    setUnidad(g.unidad);
    setJustificacion(g.justificacion);
    setLineas(g.lineas);
    setPaso(Math.min(g.paso, 4));
    setRestaurable(null);
  }
  function descartarLocal() {
    escribirLocal(null);
    setRestaurable(null);
  }

  function otraSolicitud() {
    setEnviado(null);
    setServidorId(null);
    setTipo(null);
    setLineas([]);
    setJustificacion("");
    setPaso(1);
    setMostrar(false);
    setTocado(new Set());
    setPanel(null);
  }

  const flujoDefecto = flujos.data?.find((f) => f.por_defecto && f.activo) ?? flujos.data?.[0];
  const ver = (campoId: string) => {
    const e = errores.find((x) => x.id === campoId);
    return e && (mostrar || tocado.has(campoId)) ? e.mensaje : null;
  };
  const largoJust = justificacion.trim().length;

  if (id && borrador.isPending) return <Cargando filas={4} etiqueta="Abriendo la solicitud" />;
  if (id && borrador.error) return <ErrorCaja error={borrador.error} onReintentar={() => void borrador.refetch()} />;
  if (id && borrador.data && !borrador.data.puedo_editar) return <ErrorCaja error={new Error("Esta solicitud ya no se puede editar: solo un borrador o una devuelta.")} titulo="No se puede editar" />;

  // --- Enviada ---------------------------------------------------------------------------------------
  if (enviado) {
    return (
      <div className="gm-enviada" ref={envio}>
        <p className="gm-enviada__marca" aria-hidden="true">
          ✓
        </p>
        <h2 tabIndex={-1} ref={(el) => el?.focus()}>
          Solicitud {enviado.folio} enviada
        </h2>
        <p>Quedó registrada y ya está en el primer paso de aprobación.</p>
        <ol className="gm-pasos-lista">
          {(flujoDefecto?.pasos ?? []).map((p) => (
            <li key={p.orden}>{p.nombre}</li>
          ))}
        </ol>
        <p className="gm-nota">Le llega un correo de acuse. Cada decisión lleva una nota y recibirá un aviso en cada paso. Plazo indicativo: {flujoDefecto?.plazo_dias ?? PLAZO_INDICADOR} días hábiles.</p>
        <div className="gm-botones">
          <button type="button" className="button-primary" onClick={() => ctx.ir("bandeja", enviado.id)}>
            Ver la solicitud
          </button>
          <button type="button" className="button-secondary" onClick={otraSolicitud}>
            Crear otra
          </button>
        </div>
      </div>
    );
  }

  const faltanPaso = del(paso);
  const resumenErrores = mostrar && faltanPaso.length > 0 ? faltanPaso : [];

  return (
    <div className="gm-formulario">
      {restaurable && (
        <div className="gm-restaurar" role="region" aria-label="Borrador sin enviar">
          <span>Hay un borrador sin enviar en este equipo ({hace(restaurable.ts, ahora)}).</span>
          <button type="button" className="button-secondary" onClick={() => restaurar(restaurable)}>
            Continuar con él
          </button>
          <button type="button" className="button-ghost" onClick={descartarLocal}>
            Descartar
          </button>
        </div>
      )}

      <nav aria-label="Pasos de la solicitud">
        <ol className="gm-pasos-form">
          {PASOS.map((p) => (
            <li key={p.n} data-estado={p.n === paso ? "actual" : p.n < paso ? "hecho" : "pendiente"}>
              <button type="button" aria-current={p.n === paso ? "step" : undefined} disabled={p.n > paso && del(paso).length > 0} onClick={() => ir(p.n)}>
                <span className="gm-pasos-form__n" aria-hidden="true">
                  {p.n < paso ? "✓" : p.n}
                </span>
                <span>{p.titulo}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="gm-formulario__estado" aria-live="off">
        <span>{id ? "Editando una solicitud ya guardada en el portal" : guardadoEn ? `Borrador guardado en este equipo ${hace(guardadoEn, ahora)}` : "Se guarda un borrador en este equipo mientras escribe"}</span>
      </div>

      <div className="gm-formulario__cuerpo" ref={panelPaso}>
        <h2 className="gm-formulario__titulo" tabIndex={-1} ref={tituloPaso}>
          {paso === 1 ? "¿Qué quiere hacer?" : paso === 2 && tipo ? PREGUNTA[tipo] : paso === 3 ? "¿Por qué lo pide?" : "Revise antes de enviar"}
        </h2>

        {resumenErrores.length > 0 && (
          <div className="gm-resumen-errores" role="alert">
            <h3>
              Falta completar {resumenErrores.length} {resumenErrores.length === 1 ? "dato" : "datos"}
            </h3>
            <ul>
              {resumenErrores.map((e, i) => (
                <li key={`${e.id}-${i}`}>
                  <button type="button" onClick={() => irAlError(e)}>
                    {e.mensaje}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 1 · Qué quiere hacer */}
        {paso === 1 && (
          <>
            <div className="gm-tipos" role="radiogroup" aria-label="Tipo de solicitud" id="gm-tipo" tabIndex={-1}>
              {(Object.keys(TIPOS) as Tipo[]).map((t) => (
                <label key={t} className="gm-tipo" data-activo={tipo === t}>
                  <input type="radio" name="tipo" checked={tipo === t} onChange={() => elegirTipo(t)} disabled={Boolean(id)} />
                  <b>{TIPOS[t].nombre}</b>
                  <span>{TIPOS[t].ayuda}</span>
                  <em>{TIPOS[t].ejemplo}</em>
                </label>
              ))}
            </div>
            {id && <p className="gm-nota">El tipo no se cambia al corregir una solicitud: para otro tipo, cree una nueva.</p>}
            {tipo && (
              <DondeAplica
                key="donde"
                periodo={periodo}
                sede={sede}
                unidad={unidad}
                prioridad={prioridad}
                periodos={ctx.periodos}
                unidades={unidades.data ?? []}
                onPeriodo={(p) => { setPeriodo(p); setLineas((ls) => ls.map((l) => (l.elegido ? l : { ...l, origenPeriodo: p }))); }}
                onSede={(s) => { setSede(s); setLineas((ls) => ls.map((l) => (l.elegido ? l : { ...l, origenSede: s }))); }}
                onUnidad={setUnidad}
                onPrioridad={setPrioridad}
              />
            )}
          </>
        )}

        {/* 2 · Actividades */}
        {paso === 2 && tipo && (
          <div className="gm-paso2">
            <div className="gm-paso2__lista">
              <p className="gm-ayuda">
                {tipo === "nuevo"
                  ? "Una tarjeta por cada actividad nueva. Mientras escribe el nombre, el portal busca si ya existe algo parecido."
                  : tipo === "editar"
                    ? "Elija el código y marque solo lo que cambia. Verá lo que hay hoy y cómo quedaría."
                    : tipo === "mejorar"
                      ? "Elija el código del que parte, de este periodo o de uno anterior. Se precarga y usted ajusta lo que cambia."
                      : "Elija el código que se da de baja. Verá a cuántos profesores afecta."}{" "}
                Varias actividades que se deciden juntas pueden ir en la misma solicitud.
              </p>
              {lineas.map((l, i) => (
                <div key={l.clave}>
                  <TarjetaActividad
                    linea={l}
                    indice={i}
                    total={lineas.length}
                    tipo={tipo}
                    periodo={periodo}
                    sede={sede}
                    periodos={ctx.periodos}
                    errores={errores.filter((e) => e.clave === l.clave)}
                    mostrar={mostrar}
                    tocado={tocado}
                    onMarcar={marcar}
                    onCambio={(c) => editar(l.clave, c)}
                    onElegir={(c, per, sed) => void elegir(l.clave, tipo, c, per, sed)}
                    onQuitar={() => quitar(l.clave)}
                    onDuplicar={tipo === "nuevo" ? () => duplicar(l.clave) : undefined}
                    onActivar={(codigo) => setPanel((p) => (p?.codigo === codigo ? p : { codigo, periodo: tipo === "mejorar" ? l.origenPeriodo : periodo, sede: tipo === "mejorar" ? l.origenSede : sede }))}
                  />
                  {tipo === "nuevo" && l.abierta && l.nombre.trim().length >= 3 && <ParecidosNuevo periodo={periodo} sede={sede} texto={l.nombre.trim()} onVer={(codigo) => setPanel({ codigo, periodo, sede })} />}
                </div>
              ))}
              {lineas.length < 30 && (
                <button type="button" id="gm-agregar" className="button-secondary gm-agregar" onClick={agregar}>
                  + Agregar otra actividad
                </button>
              )}
            </div>

            <aside className="gm-paso2__panel" aria-label="Qué hay hoy con este código">
              {panel ? (
                <details className="gm-panel-hoy" open={ancho} key={`${panel.codigo}|${panel.periodo}|${panel.sede}`}>
                  <summary>Qué hay hoy con {panel.codigo}</summary>
                  <PanelCodigo periodo={panel.periodo} sede={panel.sede} codigo={panel.codigo} />
                </details>
              ) : (
                <div className="gm-panel-hoy gm-panel-hoy--vacio">
                  <h3>Qué hay hoy con este código</h3>
                  <p className="gm-nota">Al elegir un código verá aquí, desde el Warehouse, lo que el Master dice de él: cuántos profesores lo tienen, las horas, el promedio y el programa.</p>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* 3 · Justificación */}
        {paso === 3 && (
          <div className="gm-paso3">
            <Campo id="gm-justificacion" etiqueta="Justificación" ayuda="Es lo que leen quienes aprueban. Determina si la solicitud avanza." error={ver("gm-justificacion")} contador={{ valor: justificacion.length, max: MAX_JUSTIFICACION }}>
              <textarea
                id="gm-justificacion"
                rows={9}
                value={justificacion}
                maxLength={MAX_JUSTIFICACION}
                onChange={(e) => setJustificacion(e.target.value)}
                onBlur={() => marcar("gm-justificacion")}
                aria-describedby="gm-justificacion-ayuda gm-just-medidor"
                aria-invalid={Boolean(ver("gm-justificacion"))}
                placeholder="Qué cambia, por qué, a quién afecta y si cuesta algo."
              />
            </Campo>
            <p id="gm-just-medidor" className="gm-medidor" data-listo={largoJust >= MIN_JUSTIFICACION}>
              <span className="gm-barra" aria-hidden="true">
                <i style={{ transform: `scaleX(${Math.min(largoJust / MIN_JUSTIFICACION, 1)})` }} />
              </span>
              {largoJust >= MIN_JUSTIFICACION ? "Ya alcanza el mínimo." : `Faltan ${MIN_JUSTIFICACION - largoJust} caracteres para el mínimo de ${MIN_JUSTIFICACION}.`}
            </p>
            <div className="gm-guia">
              <h3>Una buena justificación responde cuatro cosas</h3>
              <ul>
                <li>Qué cambia y en qué actividades.</li>
                <li>Por qué hace falta ahora.</li>
                <li>A cuántos profesores o programas toca.</li>
                <li>Si necesita presupuesto: dígalo de forma explícita, la Vicerrectoría Administrativa y Financiera lo lee primero.</li>
              </ul>
              <details className="gm-plegable">
                <summary>Ver un ejemplo</summary>
                <p className="gm-ejemplo">
                  «La cohorte 2026 tiene 38 proyectos de grado y el cupo de asesoría de DOC-02 no alcanza para asignarlos a tiempo. Se pide pasar de 2 a 4 horas por semana por profesor, lo que toca a 6 profesores de Ingeniería de Sistemas en Bucaramanga. No requiere presupuesto adicional: las horas salen de la carga ya contratada.»
                </p>
              </details>
            </div>
          </div>
        )}

        {/* 4 · Revisar y enviar */}
        {paso === 4 && tipo && (
          <div className="gm-paso4">
            <dl className="gm-kv">
              <dt>Qué hace</dt>
              <dd>{TIPOS[tipo].nombre}</dd>
              <dt>Dónde</dt>
              <dd>
                {nombreSede(sede)} · {nombrePeriodo(periodo)}
              </dd>
              <dt>Unidad</dt>
              <dd>{unidades.data?.find((u) => u.id === unidad)?.nombre ?? "Sin unidad"}</dd>
              <dt>Prioridad</dt>
              <dd>{PRIORIDADES[prioridad]}</dd>
            </dl>
            <h3>Actividades ({lineas.length})</h3>
            <ul className="gm-resumen-lineas">
              {lineas.map((l, i) => (
                <li key={l.clave}>
                  <b>
                    {i + 1}. {tituloLinea(l, tipo)}
                  </b>
                  {tipo === "editar" && (
                    <ul className="gm-diff">
                      {camposQueCambian(l).map((c: CampoEditar) => (
                        <li key={c}>
                          <span>{NOMBRE_CAMPO[c]}</span>
                          <span>{valorActual(l.actual, c).slice(0, 90)}</span> → <b>{valorPropuesto(l, c).slice(0, 90)}</b>
                        </li>
                      ))}
                      {l.motivo.trim() && <li className="gm-diff__motivo">Motivo: {l.motivo.trim()}</li>}
                    </ul>
                  )}
                  {tipo === "nuevo" && <span className="gm-muted"> {nombreTipoActividad(l.tipoActividad)}</span>}
                </li>
              ))}
            </ul>
            <h3>Justificación</h3>
            <p className="gm-justificacion-resumen">{justificacion.trim().length > 280 ? `${justificacion.trim().slice(0, 280)}…` : justificacion.trim() || "—"}</p>
            <div className="gm-despues">
              <h3>Qué pasa después</h3>
              {flujoDefecto ? (
                <p>
                  Pasa a <b>{flujoDefecto.pasos[0]?.nombre}</b>
                  {flujoDefecto.pasos.slice(1).map((p) => (
                    <span key={p.orden}>
                      , luego a <b>{p.nombre}</b>
                    </span>
                  ))}
                  . Planeación aplica el cambio en el Master al final.
                </p>
              ) : (
                <p>Todavía no hay un flujo configurado.</p>
              )}
              <p className="gm-nota">Plazo indicativo: {flujoDefecto?.plazo_dias ?? PLAZO_INDICADOR} días hábiles. Recibirá un correo de acuse al enviar y un aviso en cada paso. Una vez enviada no se edita; si la devuelven con una nota, podrá corregirla.</p>
            </div>
          </div>
        )}

        {falla && (
          <p className="gm-error gm-error--bloque" role="alert">
            {falla}
          </p>
        )}
        {aviso && (
          <p className="gm-nota" role="status">
            {aviso}
          </p>
        )}

        <div className="gm-acciones gm-acciones--form">
          {paso > 1 && (
            <button type="button" className="button-ghost" onClick={() => ir(paso - 1)}>
              Atrás
            </button>
          )}
          {paso < 4 ? (
            <button type="button" className="button-primary" onClick={continuar} disabled={paso === 1 && !tipo}>
              Continuar
            </button>
          ) : (
            <button type="button" className="button-primary" disabled={guardar.isPending} onClick={() => void guardarEnPortal(true)}>
              {guardar.isPending ? "Enviando…" : "Enviar a revisión"}
            </button>
          )}
          {tipo && (
            <button type="button" className="button-secondary" disabled={guardar.isPending} onClick={() => void guardarEnPortal(false)}>
              Guardar borrador
            </button>
          )}
          <button type="button" className="button-ghost" onClick={() => ctx.ir("bandeja")}>
            Cancelar
          </button>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}

/** Periodo y sede por defecto a la vista; unidad y prioridad, plegadas. */
function DondeAplica({
  periodo, sede, unidad, prioridad, periodos, unidades, onPeriodo, onSede, onUnidad, onPrioridad,
}: {
  periodo: string;
  sede: string;
  unidad: string;
  prioridad: Prioridad;
  periodos: string[];
  unidades: { id: string; nombre: string }[];
  onPeriodo: (p: string) => void;
  onSede: (s: string) => void;
  onUnidad: (u: string) => void;
  onPrioridad: (p: Prioridad) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) entrada(ref.current.children, 4);
  }, []);
  return (
    <div className="gm-donde" ref={ref}>
      <h3>¿Dónde aplica?</h3>
      <div className="gm-rejilla" id="gm-periodo">
        <Campo id="gm-periodo-sel" etiqueta="Periodo">
          <select id="gm-periodo-sel" value={periodo} onChange={(e) => onPeriodo(e.target.value)}>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {nombrePeriodo(p)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="gm-sede-sel" etiqueta="Sede">
          <select id="gm-sede-sel" value={sede} onChange={(e) => onSede(e.target.value)}>
            {SEDES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <details className="gm-plegable">
        <summary>Unidad y prioridad ({unidades.find((u) => u.id === unidad)?.nombre ?? "sin unidad"}, {PRIORIDADES[prioridad].toLowerCase()})</summary>
        <div className="gm-rejilla">
          <Campo id="gm-unidad-sel" etiqueta="Unidad que solicita" ayuda={unidades.length ? "Las unidades donde usted es Gestor o Contribuyente." : "No pertenece a una unidad: la solicitud va sin unidad."}>
            <select id="gm-unidad-sel" value={unidad} onChange={(e) => onUnidad(e.target.value)}>
              <option value="">Sin unidad</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="gm-prioridad-sel" etiqueta="Prioridad" ayuda="Normal salvo que haya una fecha encima.">
            <select id="gm-prioridad-sel" value={prioridad} onChange={(e) => onPrioridad(e.target.value as Prioridad)}>
              {(Object.keys(PRIORIDADES) as Prioridad[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADES[p]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </details>
    </div>
  );
}
