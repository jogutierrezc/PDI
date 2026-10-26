/* =============================================================================
   Gestión Master · Flujos de aprobación.

   El flujo por defecto es: Vicerrectoría Administrativa y Financiera aprueba
   primero y Planeación revisa, aprueba y aplica el cambio en el Master. Es
   configurable: Planeación (gestor) puede añadir pasos (p. ej. la Vicerrectoría
   Académica), reordenarlos, ponerles suplente y plazo, y crear funciones nuevas,
   sin tocar código. Una solicitud en curso conserva la copia de los pasos con
   que se envió: cambiar el flujo no altera lo que ya está en camino.

   Cada paso se ata a una FUNCIÓN, no a un cargo: la función la lleva un rol de
   acceso (Usuarios y roles › Gestión Master), como en Rua con los permisos.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useFlujos, useFunciones, useGuardarFlujo, useGuardarFuncion } from "./api";
import type { Contexto } from "./contexto";
import { PLAZO_INDICADOR, mensajeDe, type Flujo, type FlujoPaso } from "./modelo";
import { avanzarPaso, entrada } from "./movimiento";
import { Cargando, ErrorCaja } from "./partes";

const NUEVO: Flujo = {
  id: "",
  nombre: "Flujo nuevo",
  descripcion: "",
  plazo_dias: PLAZO_INDICADOR,
  por_defecto: false,
  activo: true,
  pasos: [{ orden: 1, nombre: "Primer paso", funcion: "vaf", suplente_funcion: null, plazo_dias: null }],
};

export function Flujos({ ctx }: { ctx: Contexto }) {
  const flujos = useFlujos();
  const funciones = useFunciones();
  const guardar = useGuardarFlujo();
  const guardarFuncion = useGuardarFuncion();
  const edita = ctx.nivel === "gestor";
  const [sel, setSel] = useState<string>("");
  const [borrador, setBorrador] = useState<Flujo | null>(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [nf, setNf] = useState({ codigo: "", nombre: "" });
  const [demo, setDemo] = useState(1);
  const lineas = useRef<(HTMLLIElement | null)[]>([]);
  const raiz = useRef<HTMLDivElement>(null);

  const lista = flujos.data ?? [];
  const actual = borrador ?? lista.find((f) => f.id === sel) ?? lista.find((f) => f.por_defecto) ?? lista[0] ?? null;
  const funcs = (funciones.data ?? []).filter((f) => f.activa);
  const nombreFuncion = (c: string | null) => funciones.data?.find((f) => f.codigo === c)?.nombre ?? c ?? "—";

  useEffect(() => {
    if (raiz.current) entrada(raiz.current.querySelectorAll(".gm-paso-edicion"), 8);
  }, [actual?.id, borrador === null]);

  if (flujos.isPending || funciones.isPending) return <Cargando filas={4} />;
  if (flujos.error) return <ErrorCaja error={flujos.error} onReintentar={() => void flujos.refetch()} titulo="No se pudo leer el flujo" />;
  if (!actual) return <ErrorCaja error={new Error("No hay flujos. Planeación debe crear uno.")} titulo="Sin flujo" />;

  const editando = borrador !== null;
  const cambiar = (c: (f: Flujo) => void) => setBorrador((p) => {
    const f: Flujo = structuredClone(p ?? actual);
    c(f);
    f.pasos.forEach((x, i) => { x.orden = i + 1; });
    return f;
  });
  const mover = (i: number, d: -1 | 1) => cambiar((f) => { const j = i + d; if (j < 0 || j >= f.pasos.length) return; [f.pasos[i], f.pasos[j]] = [f.pasos[j], f.pasos[i]]; });

  async function guardarCambios() {
    if (!borrador) return;
    setError("");
    setAviso("");
    try {
      await guardar.mutateAsync({ id: borrador.id || null, nombre: borrador.nombre, descripcion: borrador.descripcion, plazo: borrador.plazo_dias, pasos: borrador.pasos, porDefecto: borrador.por_defecto });
      setAviso("Flujo guardado. Lo que ya está en curso conserva sus pasos; las solicitudes nuevas usan este.");
      setBorrador(null);
      setSel("");
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  const pasos = actual.pasos;
  function avanzar() {
    if (demo >= pasos.length) return;
    const i = demo;
    setDemo(demo + 1);
    window.setTimeout(() => avanzarPaso(lineas.current[i]?.querySelector(".gm-paso__linea i") ?? null, lineas.current[i]?.querySelector(".gm-paso__punto") ?? null), 0);
  }

  return (
    <div className="gm-seccion-pagina" ref={raiz}>
      <div className="gm-filtros">
        <label className="admin-field">
          <span>Flujo</span>
          <select value={actual.id} onChange={(e) => { setSel(e.target.value); setBorrador(null); setDemo(1); }} disabled={editando}>
            {lista.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
                {f.por_defecto ? " (por defecto)" : ""}
              </option>
            ))}
          </select>
        </label>
        {edita && !editando && (
          <>
            <button type="button" className="button-secondary" onClick={() => setBorrador(structuredClone(actual))}>
              Editar este flujo
            </button>
            <button type="button" className="button-ghost" onClick={() => setBorrador(structuredClone(NUEVO))}>
              Crear un flujo nuevo
            </button>
          </>
        )}
      </div>
      {!edita && <p className="gm-nota">Solo Planeación configura los flujos. Aquí se ve cómo se aprueba una solicitud.</p>}
      {aviso && <p className="gm-nota" role="status">{aviso}</p>}

      <div className="gm-dos">
        <section aria-labelledby="gm-pasos-titulo">
          <h3 id="gm-pasos-titulo">Pasos</h3>
          {editando && borrador && (
            <div className="gm-rejilla">
              <label className="admin-field">
                <span>Nombre del flujo</span>
                <input value={borrador.nombre} onChange={(e) => cambiar((f) => { f.nombre = e.target.value; })} />
              </label>
              <label className="admin-field">
                <span>Plazo indicativo (días hábiles)</span>
                <input type="number" min={1} max={120} value={borrador.plazo_dias} onChange={(e) => cambiar((f) => { f.plazo_dias = Number(e.target.value) || PLAZO_INDICADOR; })} />
              </label>
              <label className="gm-marcar gm-marcar--solo">
                <input type="checkbox" checked={borrador.por_defecto} onChange={(e) => cambiar((f) => { f.por_defecto = e.target.checked; })} />
                Usar por defecto
              </label>
            </div>
          )}
          <ol className="gm-constructor">
            {pasos.map((p, i) => (
              <li key={`${p.orden}-${i}`} className="gm-paso-edicion">
                <span className="gm-paso__n" aria-hidden="true">{i + 1}</span>
                {editando ? (
                  <div className="gm-rejilla">
                    <label className="admin-field gm-ancho">
                      <span>Nombre del paso</span>
                      <input value={p.nombre} onChange={(e) => cambiar((f) => { f.pasos[i].nombre = e.target.value; })} />
                    </label>
                    <label className="admin-field">
                      <span>Quién aprueba (función)</span>
                      <select value={p.funcion} onChange={(e) => cambiar((f) => { f.pasos[i].funcion = e.target.value; })}>
                        {funcs.map((f) => (
                          <option key={f.codigo} value={f.codigo}>
                            {f.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>Suplente</span>
                      <select value={p.suplente_funcion ?? ""} onChange={(e) => cambiar((f) => { f.pasos[i].suplente_funcion = e.target.value || null; })}>
                        <option value="">Sin suplente</option>
                        {funcs.filter((f) => f.codigo !== p.funcion).map((f) => (
                          <option key={f.codigo} value={f.codigo}>
                            {f.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>Plazo del paso (días hábiles, opcional)</span>
                      <input type="number" min={1} max={120} value={p.plazo_dias ?? ""} onChange={(e) => cambiar((f) => { f.pasos[i].plazo_dias = e.target.value ? Number(e.target.value) : null; })} />
                    </label>
                    <div className="gm-botones">
                      <button type="button" className="button-ghost" onClick={() => mover(i, -1)} disabled={i === 0}>
                        Subir
                      </button>
                      <button type="button" className="button-ghost" onClick={() => mover(i, 1)} disabled={i === pasos.length - 1}>
                        Bajar
                      </button>
                      <button type="button" className="button-ghost" onClick={() => cambiar((f) => { f.pasos.splice(i, 1); })} disabled={pasos.length <= 1}>
                        Quitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <b>{p.nombre}</b>
                    <span className="gm-paso__estado">
                      Aprueba: {nombreFuncion(p.funcion)}
                      {p.suplente_funcion ? ` · suplente: ${nombreFuncion(p.suplente_funcion)}` : ""}
                      {p.plazo_dias ? ` · ${p.plazo_dias} días hábiles` : ""}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {editando && (
            <div className="gm-botones">
              <button type="button" className="button-secondary" onClick={() => cambiar((f) => { if (f.pasos.length < 8) f.pasos.push({ orden: f.pasos.length + 1, nombre: "Nuevo paso", funcion: funcs[0]?.codigo ?? "vaf", suplente_funcion: null, plazo_dias: null } as FlujoPaso); })} disabled={pasos.length >= 8}>
                Añadir un paso
              </button>
              <button type="button" className="button-primary" onClick={() => void guardarCambios()} disabled={guardar.isPending}>
                {guardar.isPending ? "Guardando…" : "Guardar el flujo"}
              </button>
              <button type="button" className="button-ghost" onClick={() => { setBorrador(null); setError(""); }}>
                Descartar
              </button>
            </div>
          )}
          {error && <p className="gm-error" role="alert">{error}</p>}
          <p className="gm-nota">Un paso se firma con nota, también al aprobar. Rechazar corta el flujo; devolver lo reinicia cuando se reenvía. Nadie decide sobre su propia solicitud. Plazo indicativo: {actual.plazo_dias} días hábiles, el de Rua; no corta nada.</p>
        </section>

        <section aria-labelledby="gm-vista-titulo">
          <h3 id="gm-vista-titulo">Cómo avanza una solicitud</h3>
          <ol className="gm-pasos" aria-label="Avance de una solicitud de ejemplo">
            {pasos.map((p, i) => {
              const estado = i < demo ? "aprobado" : i === demo ? "pendiente" : "bloqueado";
              return (
                <li key={`${p.orden}-${i}`} data-estado={estado} ref={(el) => { lineas.current[i] = el; }}>
                  <span className="gm-paso__punto" aria-hidden="true">{estado === "aprobado" ? "✓" : i + 1}</span>
                  <span className="gm-paso__linea" aria-hidden="true"><i /></span>
                  <div>
                    <b>{p.nombre}</b>
                    <span className="gm-paso__estado">{estado === "aprobado" ? "Aprobó" : estado === "pendiente" ? "En turno" : "Aún no le toca"}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="gm-botones">
            <button type="button" className="button-secondary" onClick={avanzar} disabled={demo >= pasos.length}>
              {demo >= pasos.length ? "Todos aprobaron" : "Aprobar el paso en turno"}
            </button>
            <button type="button" className="button-ghost" onClick={() => setDemo(1)}>
              Reiniciar
            </button>
          </div>
          <p className="gm-nota" aria-live="polite">
            {demo >= pasos.length ? "Al aprobar el último paso la solicitud queda aprobada y pasa a la cola de aplicación en el Master (Planeación, a mano)." : "Vista de ejemplo: no cambia ninguna solicitud."}
          </p>
        </section>
      </div>

      <section aria-labelledby="gm-funciones-titulo" className="gm-funciones">
        <h3 id="gm-funciones-titulo">Funciones de aprobación</h3>
        <ul className="gm-lista-simple">
          {(funciones.data ?? []).map((f) => (
            <li key={f.codigo}>
              <b>{f.nombre}</b> <span className="gm-mono">{f.codigo}</span>
              {!f.activa && " · apagada"}
            </li>
          ))}
        </ul>
        <p className="gm-nota">Cada rol de acceso lleva una función (Usuarios y roles › Gestión Master › «Revisa y decide un paso»). Para sumar la Vicerrectoría Académica al flujo basta con usar su función en un paso y asignarla a su rol.</p>
        {edita && (
          <form
            className="gm-rejilla"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await guardarFuncion.mutateAsync({ codigo: nf.codigo.trim().toLowerCase(), nombre: nf.nombre.trim(), activa: true });
                setNf({ codigo: "", nombre: "" });
                await funciones.refetch();
              } catch (err) {
                setError(mensajeDe(err));
              }
            }}
          >
            <label className="admin-field">
              <span>Código (minúsculas, sin espacios)</span>
              <input value={nf.codigo} onChange={(e) => setNf({ ...nf, codigo: e.target.value })} placeholder="auditoria" pattern="[a-z][a-z0-9_-]{1,29}" required />
            </label>
            <label className="admin-field">
              <span>Nombre</span>
              <input value={nf.nombre} onChange={(e) => setNf({ ...nf, nombre: e.target.value })} placeholder="Auditoría" required />
            </label>
            <button type="submit" className="button-secondary" disabled={guardarFuncion.isPending}>
              Añadir función
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
