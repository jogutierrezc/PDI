/* =============================================================================
   Presentación con Pilo · el botón «Crear presentación con Pilo», su diálogo
   (tono, duración, enfoque), el trabajo en vivo (pasos y pensamiento de Astra, con
   cancelación), el visor y «Presentaciones de este informe».

   Siempre con Pilo Astra 1.0: si no está disponible, se dice y se enlaza a la
   administración; nunca se usa otro modelo. El visor y GSAP cargan solo al abrirlo
   (import dinámico). La presentación se guarda al crearla (migración 0284); los
   cambios de texto se guardan con «Guardar».
   ========================================================================== */

import { Suspense, lazy, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { PanelPensamiento } from "../../../components/pilo/ai/PensamientoPilo";
import { Icon } from "../../../components/ui/Icon";
import { Cajon } from "../ui/Responsables";
import { Cargando, fmtFecha, mensajeDe } from "../ui/comunes";
import { abrirPresentacion, useEliminarPresentacion, useGuardarPresentacion, usePresentaciones } from "./datos";
import { INFO_TONOS, TONOS, otroTono } from "./modelo";
import type { Presentacion, Tono } from "./modelo";
import type { NoVerificado } from "./presentaciones";
import { usePresentacion } from "./usePresentacion";

const Visor = lazy(() => import("./Visor"));
const MAX_ENFOQUE = 300;

const PASOS = [
  ["leyendo", "Leyendo el informe"],
  ["organizando", "Organizando las diapositivas"],
  ["redactando", "Redactando con Pilo Astra 1.0"],
  ["validando", "Revisando cifras y enlaces"],
] as const;

interface Abierta {
  presentacion: Presentacion;
  /** Id en la base (guardada), si ya lo está. */
  id?: string;
  sinVerificar?: NoVerificado[];
  ajustes?: string[];
  pensamientoS?: number | null;
  sucia: boolean;
}

export function PresentacionConPilo({ instanciaId, obtenerEntrada, listo = true }: { instanciaId: string; /** El JSON de `entradaLibro`, ya resuelto con cifras. */ obtenerEntrada: () => unknown; listo?: boolean }) {
  const [dialogo, setDialogo] = useState(false);
  const [lista, setLista] = useState(false);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [tono, setTono] = useState<Tono>("institucional");
  const [duracion, setDuracion] = useState("");
  const [enfoque, setEnfoque] = useState("");
  const [aviso, setAviso] = useState("");
  const { estado, crear, cancelar, reiniciar } = usePresentacion();
  const guardar = useGuardarPresentacion();
  const guardadas = usePresentaciones(lista ? instanciaId : null);

  const guardarAbierta = useCallback(
    async (a: Abierta, extra?: { pensamiento_s?: number | null }) => {
      try {
        const id = await guardar.mutateAsync({ id: a.id, instancia_id: instanciaId, presentacion: a.presentacion, pensamiento_s: extra?.pensamiento_s ?? a.pensamientoS });
        setAbierta((x) => (x && x.presentacion === a.presentacion ? { ...x, id, sucia: false } : x));
        setAviso("");
      } catch (e) {
        setAviso(`La presentación está en pantalla, pero no se pudo guardar. ${mensajeDe(e)}`);
      }
    },
    [guardar, instanciaId],
  );

  const alCrear = async () => {
    const entrada = obtenerEntrada();
    const dur = Number(duracion);
    const r = await crear({ instancia_id: instanciaId, entrada, tono, duracion_min: Number.isFinite(dur) && dur >= 1 ? Math.min(180, Math.round(dur)) : undefined, enfoque });
    if (!r) return;
    const nueva: Abierta = { presentacion: r.presentacion, sinVerificar: r.no_verificado, ajustes: r.ajustes, pensamientoS: r.pensamiento_s, sucia: true };
    setAbierta(nueva);
    setDialogo(false);
    reiniciar();
    void guardarAbierta(nueva, { pensamiento_s: r.pensamiento_s });
  };

  const abrirGuardada = async (id: string) => {
    setAviso("");
    try {
      const a = await abrirPresentacion(id);
      if (!a) return setAviso("Esa presentación ya no existe.");
      setAbierta({ presentacion: a.presentacion, id, pensamientoS: a.fila.pensamiento_s, sucia: false });
    } catch (e) {
      setAviso(mensajeDe(e));
    }
  };

  const abrirDialogo = (t?: Tono) => {
    if (t) setTono(t);
    reiniciar();
    setDialogo(true);
  };
  const cerrarDialogo = () => {
    if (estado.fase === "trabajando") cancelar();
    else reiniciar();
    setDialogo(false);
  };

  return (
    <>
      <button type="button" className="inf-btn inf-btn--pri" onClick={() => abrirDialogo()} disabled={!listo} title={listo ? "Pilo arma una presentación con este informe, con Pilo Astra 1.0" : "Espere a que el informe termine de cargar"}>
        <Icon name="spark" size={16} /> Crear presentación con Pilo
      </button>
      <button type="button" className="inf-btn" aria-expanded={lista} onClick={() => setLista((x) => !x)}>
        Presentaciones de este informe
      </button>

      {lista && (
        <div className="inf-card inf-pad pr-guardadas" style={{ flexBasis: "100%", display: "grid", gap: 8 }}>
          <Guardadas instanciaId={instanciaId} q={guardadas} onAbrir={abrirGuardada} />
        </div>
      )}
      {aviso && (
        <p className="inf-error" role="alert" style={{ flexBasis: "100%" }}>
          {aviso}
        </p>
      )}

      {dialogo && (
        <Cajon titulo="Crear presentación con Pilo" subtitulo="Pilo Astra 1.0" onCerrar={cerrarDialogo}>
          {estado.fase === "trabajando" || estado.fase === "listo" ? (
            <Trabajo estado={estado} onCancelar={() => { cancelar(); }} />
          ) : (
            <Formulario
              tono={tono}
              setTono={setTono}
              duracion={duracion}
              setDuracion={setDuracion}
              enfoque={enfoque}
              setEnfoque={setEnfoque}
              error={estado.fase === "error" ? estado : null}
              onCrear={alCrear}
              onCancelar={cerrarDialogo}
            />
          )}
        </Cajon>
      )}

      {abierta && (
        <Suspense fallback={<Cargando texto="Abriendo la presentación…" />}>
          <Visor
            presentacion={abierta.presentacion}
            onCambiar={(p) => setAbierta((x) => (x ? { ...x, presentacion: p, sucia: true } : x))}
            onCerrar={() => setAbierta(null)}
            onRegenerar={() => {
              const t = otroTono(abierta.presentacion.tono);
              setAbierta(null);
              abrirDialogo(t);
            }}
            onGuardar={() => void guardarAbierta(abierta)}
            guardando={guardar.isPending}
            estadoGuardado={guardar.isPending ? "Guardando…" : abierta.sucia ? (abierta.id ? "Cambios sin guardar" : "Sin guardar") : "Guardada"}
            sinVerificar={abierta.sinVerificar}
            ajustes={abierta.ajustes}
            pensamientoS={abierta.pensamientoS}
          />
        </Suspense>
      )}
    </>
  );
}

function Formulario({
  tono, setTono, duracion, setDuracion, enfoque, setEnfoque, error, onCrear, onCancelar,
}: {
  tono: Tono; setTono: (t: Tono) => void; duracion: string; setDuracion: (v: string) => void; enfoque: string; setEnfoque: (v: string) => void;
  error: { code: string; mensaje: string; detalle?: string[]; retryAfter?: number } | null; onCrear: () => void; onCancelar: () => void;
}) {
  const idD = useId();
  const idE = useId();
  const dur = Number(duracion);
  const durMal = duracion !== "" && (!Number.isFinite(dur) || dur < 1 || dur > 180);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!durMal) onCrear();
      }}
      style={{ display: "grid", gap: 16 }}
    >
      <p className="inf-sub">Pilo lee este informe y arma las diapositivas sobre la plantilla institucional. No inventa cifras, nombres ni fechas: lo que falte queda como «[por completar]».</p>

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend className="inf-eyebrow" style={{ padding: 0, marginBottom: 6 }}>Tono</legend>
        {TONOS.map((t) => (
          <label key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: `1px solid ${tono === t ? "var(--brand-blue-strong, #1b5fc1)" : "var(--line-strong, #c9d3e3)"}`, borderRadius: 10, cursor: "pointer", background: tono === t ? "var(--brand-blue-soft, #eaf1fc)" : "transparent" }}>
            <input type="radio" name="tono" value={t} checked={tono === t} onChange={() => setTono(t)} style={{ marginTop: 3 }} />
            <span>
              <b>{INFO_TONOS[t].nombre}</b>
              <br />
              <span className="inf-hint">{INFO_TONOS[t].ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor={idD} className="inf-eyebrow">Duración (minutos, opcional)</label>
        <input id={idD} type="number" inputMode="numeric" min={1} max={180} value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="Ej.: 15" style={{ minHeight: 38, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line-strong, #c9d3e3)", maxWidth: 160 }} aria-invalid={durMal} />
        {durMal ? <span className="inf-error" role="alert">La duración va de 1 a 180 minutos.</span> : <span className="inf-hint">Con ella, Pilo ajusta cuántas diapositivas hace.</span>}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor={idE} className="inf-eyebrow">Enfoque (opcional)</label>
        <textarea id={idE} value={enfoque} maxLength={MAX_ENFOQUE} rows={3} onChange={(e) => setEnfoque(e.target.value)} placeholder="Ej.: Destacar la permanencia y los logros de investigación" style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line-strong, #c9d3e3)", font: "inherit", resize: "vertical" }} />
        <span className="inf-hint">{enfoque.length}/{MAX_ENFOQUE} · Sirve para elegir qué destacar; no cambia los hechos.</span>
      </div>

      {error && <ErrorPresentacionAviso e={error} />}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="inf-btn" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="inf-btn inf-btn--pri" disabled={durMal}>
          <Icon name="spark" size={16} /> Crear
        </button>
      </div>
    </form>
  );
}

function ErrorPresentacionAviso({ e }: { e: { code: string; mensaje: string; detalle?: string[]; retryAfter?: number } }) {
  return (
    <div className="inf-error" role="alert" style={{ display: "grid", gap: 6 }}>
      <b>{e.mensaje}</b>
      {e.code === "astra_apagado" && (
        <span>
          Pilo Astra 1.0 se enciende en la administración. <Link className="inf-link" to="/admin/pilo-work">Ir a Administración · Pilo Work</Link>
        </span>
      )}
      {e.code === "astra_limite" && e.retryAfter ? <span>Puede volver a intentarlo en unos {Math.ceil(e.retryAfter / 60)} min.</span> : null}
      {e.detalle?.length ? (
        <details>
          <summary>Qué falló</summary>
          <ul>{e.detalle.slice(0, 6).map((d, i) => <li key={i}>{d}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function Trabajo({ estado, onCancelar }: { estado: ReturnType<typeof usePresentacion>["estado"]; onCancelar: () => void }) {
  const pasos = estado.fase === "trabajando" ? estado.pasos : [];
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (estado.fase !== "trabajando") return <p className="inf-sub">Listo.</p>;
  const hechos = new Set(pasos.map((p) => p.id));
  const ultimo = [...PASOS].reverse().find(([id]) => hechos.has(id))?.[0];
  return (
    <div style={{ display: "grid", gap: 14 }} aria-live="polite">
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {PASOS.map(([id, texto]) => {
          const visto = hechos.has(id);
          const actual = id === ultimo;
          return (
            <li key={id} style={{ display: "flex", gap: 8, alignItems: "center", color: visto ? "var(--ink)" : "var(--ink-faint, #8a97ad)", fontWeight: actual ? 700 : 500 }}>
              <span aria-hidden="true">{visto && !actual ? "✓" : actual ? "●" : "○"}</span>
              {texto}
              <span className="inf-sr">{visto && !actual ? " (hecho)" : actual ? " (en curso)" : " (pendiente)"}</span>
            </li>
          );
        })}
      </ol>
      <PanelPensamiento thinking={estado.pensamiento} fase={ultimo === "validando" ? "redactando" : "pensando"} startedAt={estado.desde} />
      <p className="inf-hint">Astra razona antes de responder: puede tardar uno o dos minutos. Puede cancelar cuando quiera.</p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="inf-btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function Guardadas({ instanciaId, q, onAbrir }: { instanciaId: string; q: ReturnType<typeof usePresentaciones>; onAbrir: (id: string) => void }) {
  const eliminar = useEliminarPresentacion(instanciaId);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  if (q.isPending) return <Cargando texto="Cargando las presentaciones…" />;
  if (q.error) return <p className="inf-error" role="alert">{mensajeDe(q.error)}</p>;
  const filas = q.data ?? [];
  if (!filas.length) return <p className="inf-sub">Este informe todavía no tiene presentaciones. Cree la primera con Pilo.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }} aria-label="Presentaciones de este informe">
      {filas.map((f) => (
        <li key={f.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span>
            <b>{f.titulo}</b>
            <br />
            <span className="inf-hint">
              {INFO_TONOS[f.tono]?.nombre ?? f.tono} · {fmtFecha(f.creado_en)}
              {f.pensamiento_s ? ` · Pilo pensó ${Math.round(f.pensamiento_s)} s` : ""}
            </span>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="inf-btn inf-btn--sm" onClick={() => onAbrir(f.id)}>Abrir</button>
            {confirmando === f.id ? (
              <>
                <button type="button" className="inf-btn inf-btn--sm" disabled={eliminar.isPending} onClick={() => eliminar.mutate(f.id, { onSettled: () => setConfirmando(null) })}>Sí, eliminar</button>
                <button type="button" className="inf-btn inf-btn--sm" onClick={() => setConfirmando(null)}>No</button>
              </>
            ) : (
              <button type="button" className="inf-btn inf-btn--sm" onClick={() => setConfirmando(f.id)}>Eliminar</button>
            )}
          </span>
        </li>
      ))}
      {eliminar.error && <li className="inf-error" role="alert">{mensajeDe(eliminar.error)}</li>}
    </ul>
  );
}
