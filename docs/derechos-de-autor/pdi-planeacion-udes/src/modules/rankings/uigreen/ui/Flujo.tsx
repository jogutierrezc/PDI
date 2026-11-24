/* =============================================================================
   UI GreenMetric · el flujo de un indicador: qué falta para enviar, enviar,
   tomar para revisión, devolver, aprobar y reabrir; comentarios; historial con
   diferencias entre versiones. Los botones salen de lib/estados.ts; la base
   vuelve a comprobar cada paso.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { useAprobar, useComentar, useComentarios, useDevolver, useEnviar, useEvaluacion, useMarcarTraduccionRevisada, usePendientesTraduccion, useReabrir, useResolverComentario, useTomarRevision, useVersiones } from "../datos";
import { accionesDisponibles } from "../lib/estados";
import type { AccionFlujo } from "../lib/estados";
import type { ActorUgm, PreguntaCiclo, RespuestaUgm } from "../lib/tipos";
import { Alerta, Campo, Cargando, Dialogo, confirmar, fechaCorta, hace } from "./comunes";
import { useUgm } from "./contexto";

export function ParaEnviar({ r, sucio }: { r: RespuestaUgm; sucio: boolean }) {
  const ev = useEvaluacion(r.id);
  if (ev.isLoading) return <Cargando />;
  const d = ev.data;
  if (!d) return <p className="ugm-muted">No se pudo evaluar todavía.</p>;
  return (
    <div>
      <p className="ugm-num">
        <b>{d.cumplidos}</b> de <b>{d.total}</b> requisitos cumplidos
      </p>
      {d.faltan.length === 0 ? (
        <p className="ugm-ok">
          <Icon name="check" size={16} /> Está completo para enviar.
        </p>
      ) : (
        <ul className="ugm-faltan">
          {d.faltan.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {sucio && <p className="ugm-peq ugm-muted">Hay cambios sin guardar; guarde el avance para actualizar esta lista.</p>}
    </div>
  );
}

export function PanelFlujo({ r, p, actor, guardar, sucio, publicada }: { r: RespuestaUgm; p: PreguntaCiclo; actor: ActorUgm | null; guardar: () => Promise<boolean>; sucio: boolean; publicada: boolean }) {
  const u = useUgm();
  const [dlg, setDlg] = useState<AccionFlujo | null>(null);
  const tomar = useTomarRevision();
  const acciones = accionesDisponibles(r.estado, actor, publicada).filter((a) => a !== "publicar" && a !== "retirar");
  const zona = useRef<HTMLDivElement>(null);
  if (acciones.length === 0) {
    return (
      <p className="ugm-muted">
        {actor === "jefe" ? "Usted ve este indicador como jefe de la oficina; no puede cambiar su estado." : r.estado === "aprobado" ? "Aprobado. Solo la administración puede reabrirlo." : "No hay acciones para su papel en este estado."}
      </p>
    );
  }
  return (
    <div ref={zona} className="ugm-acciones ugm-acciones--flujo">
      {acciones.includes("enviar") && (
        <button type="button" className="ugm-btn ugm-btn--pri" onClick={() => setDlg("enviar")}>
          <Icon name="share" size={16} /> Enviar para revisión
        </button>
      )}
      {acciones.includes("tomar") && (
        <button type="button" className="ugm-btn" onClick={() => void u.hacer(() => tomar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id }), "Tomado para revisión.")}>
          <Icon name="eye" size={16} /> Tomar para revisión
        </button>
      )}
      {acciones.includes("aprobar") && (
        <button type="button" className="ugm-btn ugm-btn--ok" onClick={() => setDlg("aprobar")}>
          <Icon name="check" size={16} /> Aprobar
        </button>
      )}
      {acciones.includes("devolver") && (
        <button type="button" className="ugm-btn" onClick={() => setDlg("devolver")}>
          <Icon name="undo" size={16} /> Devolver con comentario
        </button>
      )}
      {acciones.includes("reabrir") && (
        <button type="button" className="ugm-btn" onClick={() => setDlg("reabrir")}>
          <Icon name="undo" size={16} /> Reabrir
        </button>
      )}
      {dlg === "enviar" && <Enviar r={r} p={p} guardar={guardar} sucio={sucio} onCerrar={() => { setDlg(null); confirmar(zona.current); }} />}
      {dlg === "aprobar" && <Aprobar r={r} onCerrar={() => { setDlg(null); confirmar(zona.current); }} />}
      {(dlg === "devolver" || dlg === "reabrir") && <ConComentario r={r} reabrir={dlg === "reabrir"} onCerrar={() => setDlg(null)} />}
    </div>
  );
}

function Enviar({ r, p, guardar, sucio, onCerrar }: { r: RespuestaUgm; p: PreguntaCiclo; guardar: () => Promise<boolean>; sucio: boolean; onCerrar: () => void }) {
  const u = useUgm();
  const enviar = useEnviar();
  const revisar = useMarcarTraduccionRevisada();
  const ev = useEvaluacion(r.id);
  const pend = usePendientesTraduccion(r.id);
  const [leida, setLeida] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const hayTraduccion = p.esquema.campos.some((c) => c.traducible) || p.esquema.tablas.some((t) => t.columnas.some((c) => c.tipo === "texto"));
  const necesitaRevision = hayTraduccion && (pend.data?.length ?? 0) > 0;

  return (
    <Dialogo titulo={`Enviar ${r.q} para revisión`} descripcion="Quien revisa recibirá un aviso. Mientras tanto no podrá editar." onCerrar={onCerrar}>
      <div className="ugm-form">
        {sucio && <Alerta tipo="aviso">Hay cambios sin guardar: se guardarán al enviar.</Alerta>}
        {ev.data && ev.data.faltan.length > 0 && (
          <Alerta tipo="aviso">
            Según lo guardado, todavía falta:
            <ul className="ugm-faltan">
              {ev.data.faltan.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Alerta>
        )}
        {necesitaRevision && (
          <label className="ugm-check">
            <input type="checkbox" checked={leida} onChange={(e) => setLeida(e.target.checked)} />
            <span>Revisé la traducción al inglés: cifras, siglas y nombres propios coinciden con el español.</span>
          </label>
        )}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="ugm-btn ugm-btn--pri"
            disabled={ocupado || (necesitaRevision && !leida)}
            onClick={async () => {
              setOcupado(true);
              try {
                if (!(await guardar())) return;
                if (necesitaRevision && !(await u.hacer(() => revisar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id })))) return;
                if (await u.hacer(() => enviar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id }), `${r.q} quedó enviado a revisión.`)) onCerrar();
              } finally {
                setOcupado(false);
              }
            }}
          >
            {ocupado ? "Enviando…" : "Enviar"}
          </button>
        </footer>
      </div>
    </Dialogo>
  );
}

function Aprobar({ r, onCerrar }: { r: RespuestaUgm; onCerrar: () => void }) {
  const u = useUgm();
  const aprobar = useAprobar();
  const [sinDatos, setSinDatos] = useState(false);
  const [comentario, setComentario] = useState("");
  return (
    <Dialogo titulo={`Aprobar ${r.q}`} descripcion="Aprobado, el responsable ya no puede editarlo. Solo la administración lo reabre." onCerrar={onCerrar}>
      <div className="ugm-form">
        <label className="ugm-check">
          <input type="checkbox" checked={sinDatos} onChange={(e) => setSinDatos(e.target.checked)} />
          <span>Confirmo que el indicador y sus evidencias no contienen datos personales que no deban publicarse.</span>
        </label>
        <Campo id="ap-com" etiqueta="Comentario (opcional)">
          <textarea id="ap-com" className="ugm-input ugm-area" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </Campo>
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="ugm-btn ugm-btn--ok" disabled={!sinDatos || aprobar.isPending} onClick={async () => (await u.hacer(() => aprobar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, sinDatosPersonales: sinDatos, comentario: comentario.trim() || undefined }), `${r.q} aprobado.`)) && onCerrar()}>
            Aprobar
          </button>
        </footer>
      </div>
    </Dialogo>
  );
}

function ConComentario({ r, reabrir, onCerrar }: { r: RespuestaUgm; reabrir: boolean; onCerrar: () => void }) {
  const u = useUgm();
  const devolver = useDevolver();
  const reabrirM = useReabrir();
  const [texto, setTexto] = useState("");
  const ocupado = devolver.isPending || reabrirM.isPending;
  return (
    <Dialogo titulo={reabrir ? `Reabrir ${r.q}` : `Devolver ${r.q}`} descripcion={reabrir ? "Vuelve a captura y el responsable recibe el comentario." : "Quien responde recibe el comentario por correo y corrige."} onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const accion = reabrir ? () => reabrirM.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, comentario: texto.trim() }) : () => devolver.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, comentario: texto.trim() });
          if (await u.hacer(accion, reabrir ? `${r.q} reabierto.` : `${r.q} devuelto.`)) onCerrar();
        }}
      >
        <Campo id="dv-com" etiqueta="Comentario (obligatorio)" ayuda="Diga qué debe cambiar y por qué.">
          <textarea id="dv-com" className="ugm-input ugm-area" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
        </Campo>
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={texto.trim().length < 3 || ocupado}>
            {reabrir ? "Reabrir" : "Devolver"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}

/* ---------- Comentarios ------------------------------------------------------------------------- */

export function Comentarios({ r, puede }: { r: RespuestaUgm; puede: boolean }) {
  const u = useUgm();
  const lista = useComentarios(r.id);
  const comentar = useComentar();
  const resolver = useResolverComentario();
  const [texto, setTexto] = useState("");
  return (
    <div className="ugm-form">
      {lista.isLoading ? (
        <Cargando />
      ) : (lista.data ?? []).length === 0 ? (
        <p className="ugm-muted">Sin comentarios todavía.</p>
      ) : (
        <ul className="ugm-comentarios">
          {lista.data!.map((c) => (
            <li key={c.id} className={`ugm-comentario${c.tipo === "devolucion" ? " ugm-comentario--dev" : ""}${c.resuelto ? " ugm-comentario--res" : ""}`}>
              <header>
                <b>{u.nombre(c.autor)}</b> <span className="ugm-muted">{hace(c.created_at)}</span>
                {c.tipo === "devolucion" && <span className="ugm-etq ugm-etq--aviso">Devolución</span>}
                {c.tipo === "aprobacion" && <span className="ugm-etq ugm-etq--ok">Aprobación</span>}
              </header>
              <p>{c.texto}</p>
              {puede && c.tipo === "devolucion" && (
                <button type="button" className="ugm-link" onClick={() => void u.hacer(() => resolver.mutateAsync({ ciclo: u.ciclo.id, comentario: c.id, resuelto: !c.resuelto }))}>
                  {c.resuelto ? "Marcar como pendiente" : "Marcar como resuelto"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puede && (
        <form
          className="ugm-fila-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (texto.trim() && (await u.hacer(() => comentar.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, texto: texto.trim() })))) setTexto("");
          }}
        >
          <Campo id="cm-txt" etiqueta="Nuevo comentario">
            <textarea id="cm-txt" className="ugm-input ugm-area" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <button type="submit" className="ugm-btn" disabled={!texto.trim() || comentar.isPending}>
            Comentar
          </button>
        </form>
      )}
    </div>
  );
}

/* ---------- Historial y diferencias ------------------------------------------------------------- */

const MOTIVO: Record<string, string> = { envio: "Envío", devolucion: "Devolución", aprobacion: "Aprobación", reapertura: "Reapertura", importacion: "Importación", arrastre: "Arrastre del ciclo anterior" };
const GRUPOS = ["valores", "textos_es", "textos_en", "tablas", "tablas_en"] as const;
const PREFIJO: Record<string, string> = { valores: "", textos_es: " (español)", textos_en: " (inglés)", tablas: " (tabla)", tablas_en: " (tabla en inglés)" };

function aplanar(s: Record<string, unknown>): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const g of GRUPOS) {
    const v = s[g];
    if (v && typeof v === "object") for (const [k, val] of Object.entries(v as Record<string, unknown>)) m.set(`${g}.${k}`, val);
  }
  if ("opcion" in s) m.set("opcion", s.opcion);
  return m;
}
const texto = (v: unknown): string => (v === undefined || v === null || v === "" ? "—" : Array.isArray(v) && v.length && typeof v[0] === "object" ? `${v.length} filas` : typeof v === "object" ? JSON.stringify(v) : String(v));

export function Historial({ r, p }: { r: RespuestaUgm; p: PreguntaCiclo }) {
  const u = useUgm();
  const versiones = useVersiones(r.id);
  const [desde, setDesde] = useState("");
  const actual: Record<string, unknown> = { valores: r.valores, textos_es: r.textos_es, textos_en: r.textos_en, tablas: r.tablas, tablas_en: r.tablas_en, opcion: r.opcion };
  const lista = versiones.data ?? [];
  const base = lista.find((v) => v.id === (desde || lista[0]?.id));

  const cambios = useMemo(() => {
    if (!base) return [];
    const a = aplanar(base.snapshot);
    const b = aplanar(actual);
    const claves = new Set([...a.keys(), ...b.keys()]);
    const etiqueta = (c: string) => {
      const [g, k] = c.split(".");
      const nombre = c === "opcion" ? "Opción elegida" : (p.esquema.campos.find((x) => x.k === k)?.es ?? p.esquema.tablas.find((x) => x.k === k)?.es ?? k);
      return nombre + (PREFIJO[g] ?? "");
    };
    return [...claves].filter((c) => JSON.stringify(a.get(c) ?? null) !== JSON.stringify(b.get(c) ?? null)).map((c) => ({ c, campo: etiqueta(c), antes: texto(a.get(c)), despues: texto(b.get(c)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, r.updated_at]);

  if (versiones.isLoading) return <Cargando />;
  return (
    <div className="ugm-form">
      {lista.length === 0 ? (
        <p className="ugm-muted">Aún no hay versiones: se guardan al enviar, devolver, aprobar o reabrir.</p>
      ) : (
        <>
          <ul className="ugm-lista">
            {lista.map((v) => (
              <li key={v.id} className="ugm-fila-simple">
                <span>
                  <b>Versión {v.version}</b> · {MOTIVO[v.motivo] ?? v.motivo}
                  <small>
                    {u.nombre(v.autor)} · {fechaCorta(v.created_at)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <Campo id="hs-desde" etiqueta="Qué cambió desde la versión">
            <select id="hs-desde" className="ugm-input ugm-input--sel" value={base?.id ?? ""} onChange={(e) => setDesde(e.target.value)}>
              {lista.map((v) => (
                <option key={v.id} value={v.id}>
                  Versión {v.version} · {MOTIVO[v.motivo] ?? v.motivo}
                </option>
              ))}
            </select>
          </Campo>
          {cambios.length === 0 ? (
            <p className="ugm-muted">Sin diferencias con lo que hay ahora.</p>
          ) : (
            <div className="ugm-tabla-marco">
              <table className="ugm-tabla ugm-tabla--lista">
                <thead>
                  <tr>
                    <th scope="col">Campo</th>
                    <th scope="col">Antes</th>
                    <th scope="col">Ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {cambios.map((c) => (
                    <tr key={c.c}>
                      <th scope="row" data-et="Campo">{c.campo}</th>
                      <td data-et="Antes" className="ugm-diff ugm-diff--antes">{c.antes}</td>
                      <td data-et="Ahora" className="ugm-diff ugm-diff--despues">{c.despues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
