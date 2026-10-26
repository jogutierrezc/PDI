/* Warehouse UDES · Cargas: cargar un reporte (Excel descargado o traído de la plataforma), traer varios a la vez y el historial. */

import { Fragment, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CONJUNTOS, CORTES, GRUPOS, MAX_SEDES_PESADAS, PERMANENTE, SEDES, SISTEMAS, agrupar, cargable, cargaPorArchivo, conjuntoPorId, esPesado, pideSolo } from "./conjuntos";
import { reportePorId } from "./reportes";
import type { Hoja } from "./motor";
import {
  cargarDesdeServidor,
  esCancelacion,
  guardarHoja,
  leerArchivoExcel,
  mensajeDe,
  probarServidor,
  sondearServidor,
  useCargas,
  useEstadoServidor,
  usePoliticas,
  whKeys,
  type Cobertura,
  type ResultadoNeutro,
  type Sonda,
} from "./store";
import type { Contexto } from "./Warehouse";

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

type EstadoLote = {
  estado: "espera" | "cola" | "en curso" | "ok" | "igual" | "sin datos" | "galileo" | "error" | "cancelada";
  /** Lo corto que cabe en la celda. */
  texto: string;
  /** El mensaje completo del error, para el detalle de abajo y el tooltip. */
  detalle?: string;
};

/** Lo que se muestra cuando la plataforma no entregó datos o Galileo no responde (cuando la función no dio su propio mensaje). */
function textoNeutro(tipo: ResultadoNeutro) {
  return tipo === "galileo_no_responde" ? "Galileo no responde en esta sede." : "Sin datos en este periodo y sede.";
}

/** Cupo para los reportes pesados: de a `max` a la vez entre todas las sedes. */
function crearCupo(max: number) {
  let libres = max;
  const cola: (() => void)[] = [];
  return {
    async tomar() {
      if (libres > 0) {
        libres--;
        return;
      }
      await new Promise<void>((r) => cola.push(r));
    },
    soltar() {
      const siguiente = cola.shift();
      if (siguiente) siguiente();
      else libres++;
    },
  };
}

export function Cargas({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const cliente = useQueryClient();
  const politicas = usePoliticas();
  const cargas = useCargas();
  const servidor = useEstadoServidor(true);
  const entrada = useRef<HTMLInputElement>(null);

  const elegibles = CONJUNTOS.filter((c) => cargaPorArchivo(c) || pideSolo(c));
  const pedido = ctx.params.get("conjunto") ?? "";
  const [conjuntoId, setConjuntoId] = useState(elegibles.some((c) => c.id === pedido) ? pedido : "ma_rendimiento");
  const conjunto = conjuntoPorId(conjuntoId) ?? elegibles[0];
  const reporte = reportePorId(conjunto.id);
  const [corte, setCorte] = useState(ctx.params.get("corte") ?? "1");
  const [motivo, setMotivo] = useState("");
  const [archivo, setArchivo] = useState<{ nombre: string; hoja: Hoja } | null>(null);
  const [sobre, setSobre] = useState(false);
  const [avance, setAvance] = useState<{ texto: string; hecho: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "neutro" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Para cancelar lo que se está trayendo (la espera de una tarea o las celdas que faltan del lote).
  const control = useRef<AbortController | null>(null);
  const [cancelable, setCancelable] = useState(false);
  const [sonda, setSonda] = useState<Sonda | null>(null);
  // Cada celda del lote es «sede|conjunto»: el resultado de un conjunto en una sede no se mezcla con el de otra.
  const [lote, setLote] = useState<Record<string, EstadoLote>>({});
  const [sedesLote, setSedesLote] = useState<string[]>([ctx.sede]);
  const [elegidos, setElegidos] = useState<string[]>(() =>
    CONJUNTOS.filter((c) => pideSolo(c) && cargable(c) && !c.porCorte && reportePorId(c.id)?.verificado && c.tipo !== "catalogo").map((c) => c.id),
  );

  const { periodo, sede } = ctx;
  // Los catálogos no dependen de un periodo; lo demás va con el de la pantalla (o el que fija la plataforma).
  const periodoDeCarga = conjunto.tipo === "catalogo" ? PERMANENTE : periodo;
  const corteDeCarga = conjunto.porCorte ? corte : "";
  const vigente = cobertura.find((c) => c.conjunto === conjunto.id && c.periodo === periodoDeCarga && c.sede === sede && c.corte === corteDeCarga);
  const cerrado = cobertura.some((c) => c.periodo === periodoDeCarga && c.periodo_estado === "cerrado");
  const pideMotivo = Boolean(vigente) && cerrado;
  const motivoFalta = pideMotivo && motivo.trim().length < 5;
  const nombreSede = SEDES.find((s) => s.id === sede)?.nombre;

  const politica = politicas.data?.find((p) => p.conjunto === conjunto.id);
  const revision = useMemo(() => {
    if (!archivo || !politica) return null;
    const conserva = politica.modo === "permitir" ? archivo.hoja.columnas.filter((c) => politica.lista.includes(c)) : archivo.hoja.columnas.filter((c) => !politica.lista.includes(c));
    const descarta = archivo.hoja.columnas.filter((c) => !conserva.includes(c));
    // En modo «permitir» un archivo sin ninguna columna esperada es otro reporte.
    const otroReporte = politica.modo === "permitir" && conserva.length < Math.min(3, politica.lista.length);
    return { conserva, descarta, otroReporte };
  }, [archivo, politica]);

  const refrescar = () => cliente.invalidateQueries({ queryKey: whKeys.all });

  const elegir = async (f: File | undefined) => {
    setResultado(null);
    setArchivo(null);
    if (!f) return;
    try {
      const hoja = await leerArchivoExcel(f, conjunto.id);
      if (hoja.filas.length === 0) throw new Error("El archivo no trae filas.");
      setArchivo({ nombre: f.name, hoja });
    } catch (e) {
      setResultado({ tipo: "error", texto: mensajeDe(e) });
    }
  };

  const guardar = async () => {
    if (!archivo) return;
    setOcupado(true);
    setResultado(null);
    try {
      const r = await guardarHoja({ conjunto: conjunto.id, periodo: periodoDeCarga, sede, corte: corteDeCarga, motivo }, archivo.hoja, archivo.nombre, (texto, hecho, total) => setAvance({ texto, hecho, total }), politica);
      setResultado({
        tipo: "ok",
        texto: r.duplicada
          ? `Ese contenido ya estaba guardado (versión ${r.version}); no se creó otra versión.`
          : `Guardado: ${r.filas.toLocaleString("es-CO")} filas en ${periodoDeCarga}, versión ${r.version}.`,
      });
      setArchivo(null);
      setMotivo("");
      if (entrada.current) entrada.current.value = "";
    } catch (e) {
      setResultado({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      await refrescar();
      setOcupado(false);
      setAvance(null);
    }
  };

  const traer = async () => {
    setOcupado(true);
    setResultado(null);
    setAvance({ texto: "Pidiendo el reporte a la plataforma", hecho: 0, total: 1 });
    const ctl = new AbortController();
    control.current = ctl;
    setCancelable(true);
    try {
      const r = await cargarDesdeServidor(
        { conjunto: conjunto.id, sede, periodo, corte: corteDeCarga, motivo },
        { signal: ctl.signal, alAvance: (texto) => setAvance({ texto, hecho: 0, total: 1 }) },
      );
      if (r.neutro) {
        setResultado({ tipo: "neutro", texto: `${r.mensaje ?? textoNeutro(r.neutro)} No se guardó nada.` });
        return;
      }
      setResultado({
        tipo: "ok",
        texto: r.duplicada
          ? `La plataforma entregó lo mismo que ya estaba guardado en ${r.periodo} (versión ${r.version}).`
          : `Traído de la plataforma (${nombreSede}): ${r.filas.toLocaleString("es-CO")} filas de ${r.periodo}, versión ${r.version}.${
              r.confirmado === false ? " El reporte no dice de qué periodo es: se guardó con el pedido, sin confirmar." : ""
            }`,
      });
    } catch (e) {
      setResultado(esCancelacion(e) ? { tipo: "ok", texto: "Cancelado: no se guardó nada." } : { tipo: "error", texto: mensajeDe(e) });
    } finally {
      control.current = null;
      setCancelable(false);
      await refrescar();
      setOcupado(false);
      setAvance(null);
    }
  };

  const sondear = async () => {
    setOcupado(true);
    setResultado(null);
    setSonda(null);
    const ctl = new AbortController();
    control.current = ctl;
    setCancelable(true);
    try {
      const r = await sondearServidor({ conjunto: conjunto.id, sede, periodo, corte: corteDeCarga }, { signal: ctl.signal, alAvance: (texto) => setAvance({ texto, hecho: 0, total: 1 }) });
      if (r.neutro) setResultado({ tipo: "neutro", texto: r.mensaje ?? textoNeutro(r.neutro) });
      else setSonda(r);
    } catch (e) {
      setResultado(esCancelacion(e) ? { tipo: "ok", texto: "Cancelado." } : { tipo: "error", texto: mensajeDe(e) });
    } finally {
      control.current = null;
      setCancelable(false);
      setOcupado(false);
      setAvance(null);
    }
  };

  /**
   * Trae las celdas pedidas (sede × reporte). Dentro de una sede va una celda a la vez (su plataforma no atiende bien varios
   * reportes grandes juntos); las sedes van en paralelo, cada una con su servidor y su inicio de sesión, pero los reportes
   * pesados (conjuntos.ts) no los trae más de MAX_SEDES_PESADAS sedes a la vez: las demás esperan su turno con esa celda
   * «En cola» y siguen con el resto cuando les toca. Cada celda corre aparte: un fallo (incluida una función caída) se
   * anota en su celda y no detiene la siguiente ni deja el resto «En espera».
   */
  const correrCeldas = async (celdas: { sede: string; id: string }[]) => {
    if (celdas.length === 0) return;
    setOcupado(true);
    setResultado(null);
    const ctl = new AbortController();
    control.current = ctl;
    setCancelable(true);
    setLote((l) => ({ ...l, ...Object.fromEntries(celdas.map((c) => [`${c.sede}|${c.id}`, { estado: "espera", texto: "En espera" } as EstadoLote])) }));
    const cupo = crearCupo(MAX_SEDES_PESADAS);
    const porSede = new Map<string, string[]>();
    for (const c of celdas) porSede.set(c.sede, [...(porSede.get(c.sede) ?? []), c.id]);
    const poner = (clave: string, e: EstadoLote) => setLote((l) => ({ ...l, [clave]: e }));
    try {
      await Promise.all(
        [...porSede].map(async ([s, ids]) => {
          for (const id of ids) {
            const clave = `${s}|${id}`;
            const pesado = esPesado(id);
            let tomado = false;
            try {
              if (ctl.signal.aborted) {
                poner(clave, { estado: "cancelada", texto: "Cancelada" });
                continue;
              }
              if (pesado) {
                poner(clave, { estado: "cola", texto: "En cola (reporte pesado)" });
                await cupo.tomar();
                tomado = true;
                if (ctl.signal.aborted) {
                  poner(clave, { estado: "cancelada", texto: "Cancelada" });
                  continue;
                }
              }
              poner(clave, { estado: "en curso", texto: "Pidiéndolo…" });
              const r = await cargarDesdeServidor(
                { conjunto: id, sede: s, periodo, corte: "", motivo: "" },
                { signal: ctl.signal, alAvance: (texto) => poner(clave, { estado: "en curso", texto }) },
              );
              if (r.neutro === "sin_datos") {
                poner(clave, { estado: "sin datos", texto: "Sin datos en este periodo y sede", detalle: r.mensaje });
                continue;
              }
              if (r.neutro === "galileo_no_responde") {
                poner(clave, { estado: "galileo", texto: "Galileo no responde en esta sede", detalle: r.mensaje });
                continue;
              }
              poner(
                clave,
                r.duplicada
                  ? { estado: "igual", texto: `Sin cambios (v${r.version})` }
                  : { estado: "ok", texto: `${r.filas.toLocaleString("es-CO")} filas · ${r.periodo} · v${r.version}${r.confirmado === false ? " · periodo sin confirmar" : ""}` },
              );
            } catch (e) {
              poner(clave, esCancelacion(e) ? { estado: "cancelada", texto: "Cancelada" } : { estado: "error", texto: "Error", detalle: mensajeDe(e) });
            } finally {
              if (tomado) cupo.soltar();
            }
          }
        }),
      );
    } finally {
      control.current = null;
      setCancelable(false);
      await refrescar();
      setOcupado(false);
    }
  };

  const traerVarios = () => {
    setLote({});
    void correrCeldas(sedesLote.flatMap((s) => elegidos.map((id) => ({ sede: s, id }))));
  };

  // Lo que quedó mal o sin hacer del último lote (las sedes que ya no están marcadas no cuentan).
  const pendientes = Object.entries(lote)
    .filter(([clave, e]) => (e.estado === "error" || e.estado === "cancelada") && sedesLote.includes(clave.split("|")[0]))
    .map(([clave]) => ({ sede: clave.split("|")[0], id: clave.split("|")[1] }));
  const resumen = Object.values(lote).reduce(
    (r, e) => ({ ...r, [e.estado]: (r[e.estado] ?? 0) + 1 }),
    {} as Partial<Record<EstadoLote["estado"], number>>,
  );
  const hayLote = Object.keys(lote).length > 0;
  const cancelar = () => control.current?.abort();

  const probar = async () => {
    setOcupado(true);
    setResultado(null);
    try {
      const r = await probarServidor(sede);
      setResultado({ tipo: "ok", texto: `Las tres plataformas (${nombreSede}) aceptaron la cuenta. Periodo abierto: ${r.periodos?.master ?? r.periodo}.` });
    } catch (e) {
      setResultado({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setOcupado(false);
    }
  };

  const puedeAArchivo = cargaPorArchivo(conjunto);

  return (
    <>
      <div className="wh-dos">
        <section className="wh-panel" aria-labelledby="wh-cargar">
          <div className="wh-panel__cabeza">
            <h2 id="wh-cargar">Cargar un reporte</h2>
            <span className="wh-etiqueta">
              {periodoDeCarga} · {nombreSede}
            </span>
          </div>
          <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-4)" }}>
            <div className="wh-fila">
              <label className="wh-campo">
                <span>Reporte</span>
                <select
                  value={conjunto.id}
                  onChange={(e) => {
                    setConjuntoId(e.target.value);
                    setArchivo(null);
                    setResultado(null);
                    setSonda(null);
                  }}
                >
                  {agrupar(elegibles).map((g) => (
                    <optgroup key={g.grupo} label={GRUPOS[g.grupo].nombre}>
                      {g.conjuntos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} · {SISTEMAS[c.sistema].nombre}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {conjunto.porCorte && (
                <label className="wh-campo">
                  <span>Corte</span>
                  <select value={corte} onChange={(e) => setCorte(e.target.value)}>
                    {CORTES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <p className="wh-muted">
              {conjunto.privacidad} El periodo y la sede son los de arriba ({periodoDeCarga}, {nombreSede}).
            </p>
            {conjunto.nota && <p className="wh-aviso">{conjunto.nota}</p>}

            {vigente && (
              <p className={cerrado ? "wh-aviso wh-aviso--ambar" : "wh-aviso"}>
                Ya hay una versión guardada (v{vigente.version}, {vigente.filas.toLocaleString("es-CO")} filas, {fecha(vigente.terminada_en)}).
                {cerrado ? " El periodo está cerrado: recargarlo exige un motivo y queda como una versión nueva." : " Cargar de nuevo crea otra versión; la anterior se conserva."}
              </p>
            )}
            {pideMotivo && (
              <label style={{ display: "grid", gap: 6 }}>
                <span className="wh-muted">Motivo de la recarga (obligatorio)</span>
                <input className="wh-texto" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se vuelve a cargar un periodo cerrado" />
              </label>
            )}

            {puedeAArchivo ? (
              <>
                <div
                  className="wh-zona"
                  data-sobre={sobre}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(true);
                  }}
                  onDragLeave={() => setSobre(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSobre(false);
                    void elegir(e.dataTransfer.files[0]);
                  }}
                >
                  <b>{archivo ? archivo.nombre : "Suelte aquí el Excel descargado de la plataforma"}</b>
                  <span className="wh-muted">
                    {archivo ? `${archivo.hoja.filas.length.toLocaleString("es-CO")} filas · ${archivo.hoja.columnas.length} columnas` : "El archivo no se guarda: solo lo que permite la política."}
                  </span>
                  <input ref={entrada} type="file" accept=".xlsx" hidden onChange={(e) => void elegir(e.target.files?.[0])} />
                  <button type="button" className="button-secondary" onClick={() => entrada.current?.click()} disabled={ocupado}>
                    {archivo ? "Elegir otro archivo" : "Elegir archivo"}
                  </button>
                </div>

                {revision && archivo && (
                  <div style={{ display: "grid", gap: "var(--space-2)" }}>
                    {revision.otroReporte ? (
                      <p className="wh-aviso wh-aviso--rojo">Este archivo no parece ser «{conjunto.nombre}»: faltan las columnas que esa política conserva. Revise que descargó el reporte correcto.</p>
                    ) : (
                      <p className="wh-aviso wh-aviso--verde">
                        Se guardarán {revision.conserva.length} columnas
                        {revision.descarta.length ? ` y se descartarán ${revision.descarta.length}` : ""}.
                      </p>
                    )}
                    {revision.descarta.length > 0 && (
                      <p className="wh-nota-chica">
                        Descartadas: <span className="wh-mono">{revision.descarta.join(", ")}</span>
                      </p>
                    )}
                    {politica && politica.seudonimizar.some((s) => revision.conserva.includes(s)) && (
                      <p className="wh-nota-chica">
                        Se reemplazan por un seudónimo: <span className="wh-mono">{politica.seudonimizar.filter((s) => revision.conserva.includes(s)).join(", ")}</span>
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="wh-muted">Este reporte llega como una lista, no como un Excel: se trae de la plataforma (a la derecha).</p>
            )}

            {avance && (
              <div role="status" aria-live="polite">
                <p className="wh-muted">{avance.texto}</p>
                <div className="wh-progreso">
                  <i style={{ width: `${avance.total ? (100 * avance.hecho) / avance.total : 0}%` }} />
                </div>
              </div>
            )}
            {resultado && (
              <p className={resultado.tipo === "ok" ? "wh-aviso wh-aviso--verde" : resultado.tipo === "neutro" ? "wh-aviso wh-aviso--ambar" : "wh-aviso wh-aviso--rojo"} role={resultado.tipo === "error" ? "alert" : "status"}>
                {resultado.texto}
              </p>
            )}

            {puedeAArchivo && (
              <div className="wh-fila">
                <button type="button" className="button-primary" disabled={!archivo || ocupado || motivoFalta || Boolean(revision?.otroReporte)} onClick={() => void guardar()}>
                  Guardar en el almacén
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="wh-panel" aria-labelledby="wh-servidor">
          <div className="wh-panel__cabeza">
            <h2 id="wh-servidor">Traer de la plataforma</h2>
            <span className="wh-etiqueta" data-t={servidor.data?.configurado ? "ok" : "sin_politica"}>
              {servidor.isPending ? "Revisando" : servidor.data?.configurado ? "Cuenta lista" : "Sin configurar"}
            </span>
          </div>
          <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-3)" }}>
            {reporte ? (
              <>
                <p>
                  El servidor inicia sesión en {SISTEMAS[conjunto.sistema].nombre} con la cuenta de servicio, pide <b>{conjunto.nombre}</b>
                  {conjunto.porCorte ? " del corte elegido" : ""} y lo guarda.
                </p>
                <p className="wh-muted">
                  {reporte.periodoVia === "ruta" || reporte.periodoVia === "consulta"
                    ? `Pide el periodo de la pantalla (${periodo}): esta plataforma deja consultar periodos anteriores.`
                    : reporte.periodoVia === "cuerpo"
                      ? `Pide el periodo de la pantalla (${periodo}) en el cuerpo de la petición. Si la plataforma devuelve otro, no se guarda nada${reporte.confirma ? "." : "; como el archivo no dice de qué periodo es, solo se acepta el periodo abierto de la sede."}`
                      : reporte.periodoVia === "sesion"
                        ? `Trae el periodo que la plataforma tiene abierto; si el de la pantalla (${periodo}) es otro, no se guarda y se avisa.`
                        : "Es un catálogo: no depende de un periodo."}
                  {reporte.entrega === "tarea" ? " La plataforma lo genera aparte y puede tardar varios minutos." : ""}
                </p>
                {!reporte.verificado && (
                  <p className="wh-aviso wh-aviso--ambar">El HAR no mostró este reporte completo. «Sondear columnas» lo pide y muestra solo los nombres de sus columnas, sin guardar nada.</p>
                )}
                {!cargable(conjunto) && <p className="wh-aviso wh-aviso--ambar">{conjunto.privacidad}</p>}
                {servidor.error ? (
                  <p className="wh-aviso wh-aviso--ambar">{mensajeDe(servidor.error)}</p>
                ) : servidor.data && !servidor.data.configurado ? (
                  <p className="wh-aviso wh-aviso--ambar">
                    Faltan las variables <span className="wh-mono">WAREHOUSE_MASTER_USER</span> y <span className="wh-mono">WAREHOUSE_MASTER_PASSWORD</span> en la función.
                    {puedeAArchivo ? " Mientras tanto, cargue el Excel a mano." : ""}
                  </p>
                ) : null}
                <div className="wh-fila">
                  <button type="button" className="button-primary" disabled={ocupado || !servidor.data?.configurado || motivoFalta || !cargable(conjunto)} onClick={() => void traer()}>
                    Traer {conjunto.porCorte ? CORTES.find((c) => c.id === corte)?.nombre.toLowerCase() : "ahora"}
                  </button>
                  <button type="button" className="button-secondary" disabled={ocupado || !servidor.data?.configurado} onClick={() => void sondear()}>
                    Sondear columnas
                  </button>
                  <button type="button" className="button-secondary" disabled={ocupado || !servidor.data?.configurado} onClick={() => void probar()}>
                    Probar la conexión
                  </button>
                  {cancelable && (
                    <button type="button" className="button-secondary" onClick={cancelar}>
                      Cancelar
                    </button>
                  )}
                </div>
                {sonda && (
                  <div className="wh-capa">
                    <b>
                      {sonda.filas.toLocaleString("es-CO")} filas · periodo {sonda.periodo} · {nombreSede}
                    </b>
                    {sonda.periodoArchivo && (
                      <p className={sonda.periodoArchivo === sonda.periodo ? "wh-nota-chica" : "wh-aviso wh-aviso--rojo"}>
                        El archivo dice ser del periodo {sonda.periodoArchivo}
                        {sonda.periodoArchivo === sonda.periodo ? "." : ": no coincide con el pedido, por eso no se guardaría."}
                      </p>
                    )}
                    {sonda.sinPolitica && <p className="wh-aviso wh-aviso--ambar">Este conjunto no tiene política de privacidad: la base no lo guardaría.</p>}
                    {sonda.otroReporte && <p className="wh-aviso wh-aviso--rojo">Casi ninguna columna de las que la política conserva está en este archivo: es otro reporte o tiene otra forma en esta sede.</p>}
                    {sonda.faltan && sonda.faltan.length > 0 && !sonda.otroReporte && (
                      <p className="wh-nota-chica">
                        Columnas que la política espera y esta sede no trajo: <span className="wh-mono">{sonda.faltan.join(", ")}</span>
                      </p>
                    )}
                    {(sonda.avisos ?? []).map((a) => (
                      <p key={a} className="wh-aviso wh-aviso--ambar">
                        {a}
                      </p>
                    ))}
                    <p className="wh-nota-chica">Columnas (así se escriben en la política):</p>
                    <code className="wh-codigo">{sonda.columnas.join(", ")}</code>
                  </div>
                )}
              </>
            ) : (
              <p className="wh-muted">Este reporte aún no se pide solo. Descargue el Excel de la plataforma y cárguelo a la izquierda.</p>
            )}
          </div>
        </aside>
      </div>

      <section className="wh-panel" aria-labelledby="wh-lote">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-lote">Traer varios reportes del periodo</h2>
            <p className="wh-muted">
              De {periodo}, en las sedes marcadas. Dentro de cada sede van uno tras otro; las sedes van a la vez, cada una con su servidor, pero los reportes pesados (marcados abajo) no los trae más de {MAX_SEDES_PESADAS} sedes al
              mismo tiempo. Un fallo se anota en su celda y no detiene lo demás. Los reportes que fija la plataforma solo se traen si {periodo} es el periodo abierto de la sede (si no, la celda lo dice). El rendimiento por
              corte se trae aparte, un corte a la vez.
            </p>
            <div className="wh-fila" role="group" aria-label="Sedes del lote">
              {SEDES.map((s) => (
                <label key={s.id} className="wh-campo">
                  <input
                    type="checkbox"
                    checked={sedesLote.includes(s.id)}
                    disabled={ocupado}
                    onChange={(ev) => setSedesLote((l) => (ev.target.checked ? SEDES.map((x) => x.id).filter((x) => x === s.id || l.includes(x)) : l.filter((x) => x !== s.id)))}
                  />
                  <span>{s.nombre}</span>
                </label>
              ))}
              <button type="button" className="button-secondary" disabled={ocupado} onClick={() => setSedesLote(SEDES.map((s) => s.id))}>
                Todas las sedes
              </button>
            </div>
          </div>
          <div className="wh-fila">
            <button type="button" className="button-primary" disabled={ocupado || elegidos.length === 0 || sedesLote.length === 0 || !servidor.data?.configurado} onClick={traerVarios}>
              Traer {elegidos.length} en {sedesLote.length} {sedesLote.length === 1 ? "sede" : "sedes"}
            </button>
            {cancelable && (
              <button type="button" className="button-secondary" onClick={cancelar}>
                Cancelar
              </button>
            )}
          </div>
        </div>
        <div className="wh-tabla-envuelta">
          <table className="wh-tabla">
            <thead>
              <tr>
                <th scope="col">Traer</th>
                <th scope="col">Reporte</th>
                <th scope="col">Plataforma</th>
                {sedesLote.map((s) => (
                  <th key={s} scope="col">
                    {SEDES.find((x) => x.id === s)?.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agrupar(CONJUNTOS.filter((c) => pideSolo(c) && !c.porCorte)).map((g) => (
                <Fragment key={g.grupo}>
                  <tr>
                    <th scope="rowgroup" colSpan={3 + sedesLote.length} className="wh-muted">
                      {GRUPOS[g.grupo].nombre} · {GRUPOS[g.grupo].detalle}
                    </th>
                  </tr>
                  {g.conjuntos.map((c) => {
                    const r = reportePorId(c.id)!;
                    return (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Traer ${c.nombre}`}
                            checked={elegidos.includes(c.id)}
                            disabled={ocupado || !cargable(c)}
                            onChange={(ev) => setElegidos((l) => (ev.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))}
                          />
                        </td>
                        <td>
                          {c.nombre}
                          {!r.verificado && <small className="wh-muted"> · sin verificar</small>}
                          {!cargable(c) && <small className="wh-muted"> · falta política</small>}
                          {esPesado(c.id) && <small className="wh-muted"> · pesado</small>}
                        </td>
                        <td>{SISTEMAS[c.sistema].nombre}</td>
                        {sedesLote.map((s) => {
                          const e = lote[`${s}|${c.id}`];
                          return (
                            <td key={s}>
                              {e && (
                                <span className="wh-etiqueta" data-t={e.estado === "ok" || e.estado === "igual" ? "ok" : e.estado === "error" ? "error" : e.estado === "galileo" ? "sin_politica" : undefined} title={e.detalle ?? e.texto}>
                                  {e.texto}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {hayLote && !ocupado && (
          <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-3)" }}>
            <p className={pendientes.length ? "wh-aviso wh-aviso--ambar" : "wh-aviso wh-aviso--verde"} role="status">
              Terminó: {resumen.ok ?? 0} bien, {resumen.igual ?? 0} sin cambios, {resumen.error ?? 0} con error
              {resumen["sin datos"] ? `, ${resumen["sin datos"]} sin datos en este periodo y sede` : ""}
              {resumen.galileo ? `, ${resumen.galileo} con Galileo sin responder` : ""}
              {resumen.cancelada ? `, ${resumen.cancelada} canceladas` : ""}.
            </p>
            {pendientes.length > 0 && (
              <>
                <div className="wh-fila">
                  <button type="button" className="button-primary" disabled={!servidor.data?.configurado} onClick={() => void correrCeldas(pendientes)}>
                    Reintentar solo las que fallaron ({pendientes.length})
                  </button>
                </div>
                <details open>
                  <summary>Qué pasó con cada una</summary>
                  <ul style={{ display: "grid", gap: "var(--space-2)", margin: "var(--space-2) 0 0", paddingLeft: "var(--space-4)" }}>
                    {pendientes.map((p) => {
                      const e = lote[`${p.sede}|${p.id}`];
                      return (
                        <li key={`${p.sede}|${p.id}`} className="wh-nota-chica">
                          <b>
                            {SEDES.find((x) => x.id === p.sede)?.nombre} · {conjuntoPorId(p.id)?.nombre ?? p.id}:
                          </b>{" "}
                          {e?.detalle ?? e?.texto}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </>
            )}
          </div>
        )}
      </section>

      <section className="wh-panel" aria-labelledby="wh-historial">
        <div className="wh-panel__cabeza">
          <h2 id="wh-historial">Historial de cargas</h2>
          <span className="wh-muted">Las últimas 200</span>
        </div>
        {cargas.isPending ? (
          <p className="wh-panel__cuerpo wh-muted">Cargando…</p>
        ) : (
          <div className="wh-tabla-envuelta">
            <table className="wh-tabla">
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Reporte</th>
                  <th scope="col">Periodo</th>
                  <th scope="col">Sede</th>
                  <th scope="col">Corte</th>
                  <th scope="col">Versión</th>
                  <th scope="col" className="wh-num">
                    Filas
                  </th>
                  <th scope="col">Origen</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(cargas.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>{fecha(c.creada_en)}</td>
                    <td>{conjuntoPorId(c.conjunto)?.nombre ?? c.conjunto}</td>
                    <td>{c.periodo}</td>
                    <td>{SEDES.find((s) => s.id === c.sede)?.nombre ?? c.sede}</td>
                    <td>{c.corte ? CORTES.find((x) => x.id === c.corte)?.nombre : "—"}</td>
                    <td>v{c.version}</td>
                    <td className="wh-num">{c.filas.toLocaleString("es-CO")}</td>
                    <td>{c.origen === "servidor" ? "Plataforma" : "Archivo"}</td>
                    <td>
                      <span className="wh-etiqueta" data-t={c.estado === "guardada" ? "ok" : c.estado === "error" ? "error" : undefined} title={c.error || c.motivo || undefined}>
                        {c.estado === "en_curso" ? "En curso" : c.estado === "guardada" ? "Vigente" : c.estado === "reemplazada" ? "Reemplazada" : "Error"}
                      </span>
                    </td>
                  </tr>
                ))}
                {cargas.data?.length === 0 && (
                  <tr>
                    <td colSpan={9} className="wh-muted">
                      Aún no se ha cargado nada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
