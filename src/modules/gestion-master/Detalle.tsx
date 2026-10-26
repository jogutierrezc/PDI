/* =============================================================================
   Gestión Master · el detalle de una solicitud (el panel lateral de la bandeja).

   Cuatro vistas sobre la misma solicitud: lo que se pide, la comparación con lo
   que decía el Master, el flujo paso a paso y el historial con los comentarios.
   La decisión vive abajo, siempre visible: aprobar, devolver con nota o
   rechazar, y en las tres la nota es obligatoria (como en Rua, también al
   aprobar). Tras decidir, un sello confirma el resultado antes de que cambie la
   pantalla.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useCancelar, useComentar, useDecidir, useDetalle, useMarcarAplicada } from "./api";
import type { Contexto } from "./contexto";
import {
  APLICACION, MIN_NOTA, TIPOS, fechaCorta, fechaHora, mensajeDe, nombrePeriodo, nombreSede, resumenLinea,
  type Decision, type Detalle, type Evento, type Linea, type Paso,
} from "./modelo";
import { PanelCodigo } from "./PanelCodigo";
import { aparecer, avanzarPaso, sello } from "./movimiento";
import { Cargando, ErrorCaja, PastillaAplicacion, PastillaEstado } from "./partes";

type Vista = "solicitud" | "comparacion" | "flujo" | "historial";

const ETIQUETA_EVENTO: Record<string, string> = {
  borrador: "Guardó un borrador",
  enviada: "Envió la solicitud",
  paso_aprobado: "Aprobó el paso",
  devuelta: "Devolvió la solicitud con una nota",
  rechazada: "Rechazó la solicitud",
  cancelada: "Canceló la solicitud",
  aprobada: "La solicitud quedó aprobada",
  aplicada: "Marcó el cambio como aplicado en el Master",
  reflejada: "El Master ya refleja el cambio",
  comentario: "Comentó",
};

const NOMBRE_PASO: Record<Paso["estado"], string> = { bloqueado: "Aún no le toca", pendiente: "En turno", aprobado: "Aprobó", devuelto: "Devolvió", rechazado: "Rechazó", omitido: "No aplicó" };

function textoEvento(e: Evento): string {
  const base = ETIQUETA_EVENTO[e.tipo] ?? e.tipo;
  const paso = typeof e.datos?.paso === "string" ? e.datos.paso : "";
  return e.tipo === "paso_aprobado" && paso ? `${base} «${paso}»` : base;
}

/** Lo que se pide, línea por línea, frente a lo que decía el catálogo del Master al pedirlo. */
function Comparacion({ d }: { d: Detalle }) {
  return (
    <div className="gm-comparacion">
      {d.lineas.map((l) => (
        <ComparacionLinea key={l.id} d={d} l={l} />
      ))}
    </div>
  );
}

function ComparacionLinea({ d, l }: { d: Detalle; l: Linea }) {
  const ficha = l.antes?.ficha;
  const cat = ficha?.catalogo ?? null;
  const tipoVigente = cat ? (cat.directa === true ? "Directa" : cat.directa === false ? "De apoyo" : (cat.tipo ?? "—")) : "No existe";
  const pedido = (v: string | null | undefined, vigente: string) => (v && v !== vigente ? v : vigente);
  const tipoPedido = l.despues.tipo_actividad === "directa" ? "Directa" : l.despues.tipo_actividad === "apoyo" ? "De apoyo" : null;
  const nombreCampo: Record<string, string> = { codigo: "Código", nombre: "Nombre", tipo_actividad: "Tipo de actividad", vinculacion: "Tipo de vinculación", instrucciones: "Instrucciones" };
  const tipoTexto = (v: string | null | undefined) => (v === "directa" ? "Directa" : v === "apoyo" ? "De apoyo" : (v ?? "—"));
  const filas: [string, string, string][] =
    d.tipo === "editar"
      ? Object.entries(l.cambios ?? {}).map(([campo, v]) => [nombreCampo[campo] ?? campo, campo === "tipo_actividad" ? tipoTexto(v.antes) : (v.antes ?? "—"), campo === "tipo_actividad" ? tipoTexto(v.despues) : (v.despues ?? "—")] as [string, string, string])
      : d.tipo === "nuevo"
      ? [
          ["Nombre", "No existe", l.nombre ?? "—"],
          ["Tipo", "—", tipoPedido ?? "—"],
          ["Vinculación", "—", l.vinculacion ?? "—"],
          ["Estado", "—", "Activa"],
        ]
      : d.tipo === "eliminar"
        ? [
            ["Estado", cat?.activa === false ? "Inactiva" : "Activa", "Inactiva (baja)"],
            ["Profesores con el código", ficha?.n_profesores === null || ficha?.n_profesores === undefined ? "—" : String(ficha.n_profesores), "0"],
          ]
        : [
            ["Nombre", cat?.nombre ?? "—", pedido(l.nombre, cat?.nombre ?? "—")],
            ["Tipo", tipoVigente, pedido(tipoPedido, tipoVigente)],
            ["Vinculación", cat?.vinculacion ?? "—", pedido(l.vinculacion, cat?.vinculacion ?? "—")],
            ["Instrucciones", cat?.instrucciones ?? "—", pedido(l.instrucciones, cat?.instrucciones ?? "—")],
          ];
  return (
    <div className="gm-comparacion__linea">
      <h4>
        {resumenLinea({ codigo: l.codigo, nombre: d.tipo === "editar" ? (cat?.nombre ?? null) : l.nombre, codigo_nuevo: l.codigo_nuevo })}
        {l.origen_codigo && l.origen_periodo && (
          <small>
            {" "}
            · parte de {l.origen_codigo} ({nombrePeriodo(l.origen_periodo)}, {nombreSede(l.origen_sede ?? d.sede)})
          </small>
        )}
      </h4>
      <p className="gm-fuente">
        {ficha?.carga_actdir ? `Vigente: catálogo del Master (ms_actdir), corte del ${fechaCorta(ficha.carga_actdir.corte)}.` : l.antes?.ficha?.sin_captura_catalogo ? "No había captura del catálogo del Master al pedirlo." : d.tipo === "nuevo" ? "Es una actividad nueva: no hay nada vigente con qué comparar." : "Sin datos del catálogo."}
      </p>
      {d.tipo === "editar" && l.motivo && <p className="gm-nota">Motivo del cambio: {l.motivo}</p>}
      {d.tipo === "editar" && l.codigo_nuevo && (ficha?.n_profesores ?? 0) > 0 && <p className="gm-impacto">Cambiar el código afecta a {ficha?.n_profesores} {ficha?.n_profesores === 1 ? "profesor" : "profesores"} que hoy lo tienen asignado.</p>}
      <div className="gm-tabla-envoltura">
        <table className="gm-tabla gm-tabla--cmp">
          <thead>
            <tr>
              <th scope="col">Campo</th>
              <th scope="col">Vigente en el Master</th>
              <th scope="col">Solicitado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([campo, vigente, pedida]) => (
              <tr key={campo}>
                <th scope="row">{campo}</th>
                <td>{vigente}</td>
                <td data-cambia={vigente !== pedida}>
                  {pedida}
                  {vigente !== pedida && <span className="gm-cambia"> ← cambia</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** El flujo de esta solicitud: cada paso con su estado, quién lo decidió y su nota. */
function Flujo({ d }: { d: Detalle }) {
  const ronda = d.pasos.filter((p) => p.ronda === d.ronda);
  const anteriores = d.pasos.filter((p) => p.ronda < d.ronda);
  const previo = useRef<Record<string, string>>({});
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  useEffect(() => {
    // El paso que acaba de aprobarse llena su línea y asienta su punto.
    for (const p of ronda) {
      if (previo.current[p.id] && previo.current[p.id] !== p.estado && p.estado === "aprobado") {
        const li = refs.current[p.id];
        avanzarPaso(li?.querySelector(".gm-paso__linea i") ?? null, li?.querySelector(".gm-paso__punto") ?? null);
      }
      previo.current[p.id] = p.estado;
    }
  }, [ronda]);
  return (
    <>
      <ol className="gm-pasos">
        {ronda.map((p) => (
          <li key={p.id} data-estado={p.estado} ref={(el) => { refs.current[p.id] = el; }}>
            <span className="gm-paso__punto" aria-hidden="true">
              {p.estado === "aprobado" ? "✓" : p.orden}
            </span>
            <span className="gm-paso__linea" aria-hidden="true">
              <i />
            </span>
            <div>
              <b>{p.nombre}</b>
              <span className="gm-paso__estado">
                {NOMBRE_PASO[p.estado]}
                {p.decidido_por ? ` · ${p.decidido_por}` : ""}
                {p.decidido_en ? ` · ${fechaCorta(p.decidido_en)}` : ""}
                {p.por_admin ? " · firmado por administración" : ""}
              </span>
              {p.nota && <p className="gm-paso__nota">«{p.nota}»</p>}
            </div>
          </li>
        ))}
      </ol>
      {anteriores.length > 0 && (
        <details className="gm-anteriores">
          <summary>Rondas anteriores ({anteriores.length} pasos)</summary>
          <ul>
            {anteriores.map((p) => (
              <li key={p.id}>
                Ronda {p.ronda} · {p.nombre}: {NOMBRE_PASO[p.estado].toLowerCase()}
                {p.nota ? ` («${p.nota}»)` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.estado === "aprobada" && (
        <p className="gm-nota">
          {d.aplicacion ? `${APLICACION[d.aplicacion]}.` : ""} El portal no escribe en el Master: Planeación aplica el cambio y la siguiente captura de <span className="gm-mono">ms_actdir</span> lo confirma.
        </p>
      )}
    </>
  );
}

export function Detalle({ id, ctx, onCerrar }: { id: string; ctx: Contexto; onCerrar: () => void }) {
  const q = useDetalle(id);
  const decidir = useDecidir();
  const cancelar = useCancelar();
  const comentar = useComentar();
  const aplicar = useMarcarAplicada();
  const [vista, setVista] = useState<Vista>("solicitud");
  const [accion, setAccion] = useState<Decision | "aplicar" | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [sellado, setSellado] = useState("");
  const [comentario, setComentario] = useState("");
  const selloRef = useRef<HTMLDivElement>(null);
  const confirmaRef = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titulo.current?.focus();
    setAccion(null);
    setNota("");
    setError("");
  }, [id]);
  useEffect(() => {
    if (accion) aparecer(confirmaRef.current);
  }, [accion]);

  if (q.isPending) return <Cargando filas={4} etiqueta="Abriendo la solicitud" />;
  if (q.error) return <ErrorCaja error={q.error} onReintentar={() => void q.refetch()} titulo="No se pudo abrir la solicitud" />;
  const d = q.data;
  const paso = d.pasos.find((p) => p.ronda === d.ronda && p.estado === "pendiente");
  const comentarios = d.eventos.filter((e) => e.tipo === "comentario");
  const notaOk = nota.trim().length >= MIN_NOTA;
  const puedeAplicar = d.estado === "aprobada" && d.aplicacion === "sin_aplicar" && ctx.nivel === "gestor";

  async function confirmar() {
    if (!accion) return;
    setError("");
    try {
      if (accion === "aplicar") {
        await aplicar.mutateAsync({ id, nota: nota.trim() });
        setSellado("Marcada como aplicada en el Master. La próxima captura de ms_actdir la confirma.");
      } else {
        const r = await decidir.mutateAsync({ id, decision: accion, nota: nota.trim() });
        const nuevo = r[0];
        setSellado(accion === "aprobar" ? (nuevo?.estado === "aprobada" ? "Aprobada. Pasa a la cola de aplicación en el Master." : `Paso aprobado. Sigue: ${nuevo?.paso_siguiente ?? "el siguiente paso"}.`) : accion === "devolver" ? "Devuelta al solicitante con su nota." : "Solicitud rechazada. La cadena queda cerrada.");
      }
      sello(selloRef.current, () => {
        setSellado("");
        setAccion(null);
        setNota("");
      });
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  const vistas: [Vista, string][] = [["solicitud", "Solicitud"], ["comparacion", "Comparación"], ["flujo", "Flujo"], ["historial", `Historial y comentarios (${d.eventos.length})`]];
  const ocupado = decidir.isPending || aplicar.isPending;

  return (
    <>
      <div className="gm-detalle__cabeza">
        <div className="gm-detalle__fila">
          <span className="gm-mono">{d.folio}</span>
          <PastillaEstado estado={d.estado} />
          <button type="button" className="button-ghost" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <h3 ref={titulo} tabIndex={-1}>
          {TIPOS[d.tipo].nombre}: {d.lineas.map((l) => (l.codigo ? `${l.codigo}${l.codigo_nuevo ? ` → ${l.codigo_nuevo}` : ""}` : (l.nombre ?? "sin código"))).slice(0, 3).join(", ")}
          {d.lineas.length > 3 ? ` y ${d.lineas.length - 3} más` : ""}
        </h3>
        <PastillaAplicacion aplicacion={d.aplicacion} />
      </div>

      <div className="gm-detalle__cuerpo">
        <div className="gm-subtabs" role="tablist" aria-label="Vistas de la solicitud">
          {vistas.map(([v, nombre]) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`gm-tab-${v}`}
              aria-selected={vista === v}
              aria-controls="gm-vista"
              tabIndex={vista === v ? 0 : -1}
              onClick={() => setVista(v)}
              onKeyDown={(e) => {
                const i = vistas.findIndex(([x]) => x === vista);
                const n = e.key === "ArrowRight" ? vistas[(i + 1) % vistas.length] : e.key === "ArrowLeft" ? vistas[(i - 1 + vistas.length) % vistas.length] : null;
                if (n) {
                  e.preventDefault();
                  setVista(n[0]);
                  window.setTimeout(() => document.getElementById(`gm-tab-${n[0]}`)?.focus(), 0);
                }
              }}
            >
              {nombre}
            </button>
          ))}
        </div>

        <div id="gm-vista" role="tabpanel" aria-labelledby={`gm-tab-${vista}`}>
          {vista === "solicitud" && (
            <>
              <dl className="gm-kv">
                <dt>Tipo</dt>
                <dd>{TIPOS[d.tipo].nombre}</dd>
                <dt>Sede y periodo</dt>
                <dd>
                  {nombreSede(d.sede)} · {nombrePeriodo(d.periodo)}
                </dd>
                <dt>Unidad</dt>
                <dd>{d.unidad ?? "Sin unidad"}</dd>
                <dt>Solicitante</dt>
                <dd>{d.solicitante ?? "—"}</dd>
                <dt>Prioridad</dt>
                <dd>{d.prioridad}</dd>
                <dt>Enviada</dt>
                <dd>{fechaHora(d.enviada_en)}</dd>
                <dt>Plazo indicativo</dt>
                <dd>
                  {d.limite_en ? `${fechaCorta(d.limite_en)} (15 días hábiles) ` : "—"}
                </dd>
                <dt>Turno</dt>
                <dd>{paso ? paso.nombre : d.estado === "aprobada" ? "Aprobada por todos los pasos" : "—"}</dd>
              </dl>
              <div className="gm-justificacion">
                <b>Justificación</b>
                <p>{d.justificacion || "Sin justificación todavía."}</p>
              </div>
              <h4>Actividades ({d.lineas.length})</h4>
              {d.lineas.map((l) => (
                <details key={l.id} className="gm-linea-detalle" open={d.lineas.length === 1}>
                  <summary>{resumenLinea({ codigo: l.codigo, nombre: l.nombre, codigo_nuevo: l.codigo_nuevo })}</summary>
                  {d.tipo === "editar" && Object.keys(l.cambios ?? {}).length > 0 && (
                    <p className="gm-nota">Cambia: {Object.keys(l.cambios).map((c) => c.replace("tipo_actividad", "tipo").replace("vinculacion", "vinculación")).join(", ")}.{l.motivo ? ` Motivo: ${l.motivo}` : ""}</p>
                  )}
                  {(l.origen_codigo ?? l.codigo) ? (
                    <PanelCodigo periodo={l.origen_periodo ?? d.periodo} sede={l.origen_sede ?? d.sede} codigo={(l.origen_codigo ?? l.codigo)!} titulo="Hoy, según el Warehouse" />
                  ) : (
                    <p className="gm-nota">Actividad nueva sin código sugerido: no hay nada en el catálogo con qué compararla.</p>
                  )}
                </details>
              ))}
            </>
          )}
          {vista === "comparacion" && <Comparacion d={d} />}
          {vista === "flujo" && <Flujo d={d} />}
          {vista === "historial" && (
            <>
              <ol className="gm-historial">
                {d.eventos.filter((e) => e.tipo !== "comentario").map((e) => (
                  <li key={e.id}>
                    <time dateTime={e.creado_en}>{fechaHora(e.creado_en)}</time>
                    <span>
                      <b>{e.actor ?? "Sistema"}</b> {textoEvento(e)}
                      {typeof e.datos?.nota === "string" && e.datos.nota ? <em> «{String(e.datos.nota)}»</em> : null}
                    </span>
                  </li>
                ))}
              </ol>
              <h4>Comentarios ({comentarios.length})</h4>
              {comentarios.length === 0 && <p className="gm-nota">Sin comentarios todavía.</p>}
              {comentarios.map((c) => (
                <p key={c.id} className="gm-comentario">
                  <b>{c.actor ?? "Alguien"}</b> · {fechaHora(c.creado_en)}
                  <br />
                  {String(c.datos?.texto ?? "")}
                </p>
              ))}
              <label className="admin-field">
                <span>Nuevo comentario</span>
                <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} />
              </label>
              <button
                type="button"
                className="button-secondary"
                disabled={comentario.trim().length < 2 || comentar.isPending}
                onClick={async () => {
                  try {
                    await comentar.mutateAsync({ id, texto: comentario.trim() });
                    setComentario("");
                  } catch (e) {
                    setError(mensajeDe(e));
                  }
                }}
              >
                Publicar comentario
              </button>
            </>
          )}
        </div>
      </div>

      <div className="gm-detalle__pie">
        {d.puedo_decidir ? (
          <>
            <div className="gm-botones">
              <button type="button" className="button-primary" onClick={() => setAccion("aprobar")} disabled={ocupado}>
                Aprobar
              </button>
              <button type="button" className="button-secondary" onClick={() => setAccion("devolver")} disabled={ocupado}>
                Devolver con nota
              </button>
              <button type="button" className="button-danger" onClick={() => setAccion("rechazar")} disabled={ocupado}>
                Rechazar
              </button>
            </div>
          </>
        ) : (
          <div className="gm-botones">
            {d.puedo_editar && (
              <button type="button" className="button-primary" onClick={() => ctx.ir("nueva", id)}>
                {d.estado === "devuelta" ? "Corregir y reenviar" : "Seguir editando"}
              </button>
            )}
            {d.puedo_cancelar && (
              <button
                type="button"
                className="button-secondary"
                disabled={cancelar.isPending}
                onClick={async () => {
                  try {
                    await cancelar.mutateAsync(id);
                  } catch (e) {
                    setError(mensajeDe(e));
                  }
                }}
              >
                Cancelar la solicitud
              </button>
            )}
            {puedeAplicar && (
              <button type="button" className="button-primary" onClick={() => setAccion("aplicar")}>
                Marcar como aplicada en el Master
              </button>
            )}
            {!d.puedo_editar && !d.puedo_cancelar && !puedeAplicar && (
              <p className="gm-nota">
                {d.estado === "pendiente" || d.estado === "revision"
                  ? `Espera la decisión de ${paso?.nombre ?? "un paso del flujo"}.`
                  : d.estado === "devuelta"
                    ? "Está devuelta: la corrige quien la creó."
                    : "La solicitud ya está cerrada."}
              </p>
            )}
          </div>
        )}

        {accion && (
          <div className="gm-confirma" ref={confirmaRef}>
            <label className="admin-field">
              <span>
                {accion === "aplicar" ? "Qué se aplicó en el Master" : "Nota de la decisión"} (obligatoria, mínimo {accion === "aplicar" ? 5 : MIN_NOTA} caracteres)
              </span>
              <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} autoFocus aria-describedby="gm-nota-cuenta" />
            </label>
            <div className="gm-contador-texto">
              <span id="gm-nota-cuenta">{nota.trim().length} / {accion === "aplicar" ? 5 : MIN_NOTA}</span>
            </div>
            <div className="gm-botones">
              <button
                type="button"
                className={accion === "rechazar" ? "button-danger" : "button-primary"}
                disabled={ocupado || (accion === "aplicar" ? nota.trim().length < 5 : !notaOk)}
                onClick={() => void confirmar()}
              >
                {accion === "aprobar" ? "Confirmar: aprobar" : accion === "devolver" ? "Confirmar: devolver" : accion === "rechazar" ? "Confirmar: rechazar" : "Confirmar: aplicada"}
              </button>
              <button type="button" className="button-ghost" onClick={() => { setAccion(null); setNota(""); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="gm-error" role="alert">
            {error}
          </p>
        )}
        <div className="gm-sello" ref={selloRef} data-accion={accion ?? ""} aria-hidden="true">
          {sellado}
        </div>
        <p className="sr-only" role="status">
          {sellado}
        </p>
      </div>
    </>
  );
}
