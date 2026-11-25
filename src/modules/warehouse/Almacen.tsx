/* Warehouse UDES · Almacén: cómo se guarda, periodos cerrados y política de privacidad. */

import { useState } from "react";
import { CONJUNTOS, conjuntoPorId, errorPeriodoNuevo, normalizarPeriodo, periodosSugeridos } from "./conjuntos";
import { mensajeDe, useCerrarPeriodo, useCrearPeriodo, useEliminarPeriodo, usePeriodosWh, usePoliticas, useReabrirPeriodo, type Cobertura } from "./store";
import type { Contexto } from "./Warehouse";

export function Almacen({ ctx, cobertura, permisos, periodos: existentes }: { ctx: Contexto; cobertura: Cobertura[]; permisos: { administrar: boolean }; periodos: string[] }) {
  const periodos = usePeriodosWh();
  const politicas = usePoliticas();
  const cerrar = useCerrarPeriodo();
  const reabrir = useReabrirPeriodo();
  const crear = useCrearPeriodo();
  const quitar = useEliminarPeriodo();
  const [nuevo, setNuevo] = useState("");
  const [mensajeNuevo, setMensajeNuevo] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [nota, setNota] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const estado = periodos.data?.find((p) => p.periodo === ctx.periodo);
  const cerrado = estado?.estado === "cerrado";
  const enPeriodo = cobertura.filter((c) => c.periodo === ctx.periodo);

  const errorNuevo = nuevo.trim() ? errorPeriodoNuevo(nuevo, existentes) : null;
  const sugeridos = periodosSugeridos(existentes);
  const cargados = new Set(cobertura.map((c) => c.periodo));
  // Se pueden quitar los periodos creados que siguen abiertos y sin cargas.
  const quitables = (periodos.data ?? []).filter((p) => p.estado === "abierto" && p.periodo !== "permanente" && !cargados.has(p.periodo)).map((p) => p.periodo).sort().reverse();

  const crearPeriodo = async (texto: string) => {
    setMensajeNuevo(null);
    const periodo = normalizarPeriodo(texto);
    const problema = errorPeriodoNuevo(texto, existentes);
    if (!periodo || problema) {
      setMensajeNuevo({ tipo: "error", texto: problema ?? "Escriba el año y la letra A o B, por ejemplo 2027A." });
      return;
    }
    try {
      await crear.mutateAsync({ periodo });
      setMensajeNuevo({ tipo: "ok", texto: `${periodo.toUpperCase()} quedó creado y abierto. Ya aparece en el selector de periodo.` });
      setNuevo("");
    } catch (e) {
      setMensajeNuevo({ tipo: "error", texto: mensajeDe(e) });
    }
  };

  const quitarPeriodo = async (periodo: string) => {
    setMensajeNuevo(null);
    try {
      await quitar.mutateAsync(periodo);
      setMensajeNuevo({ tipo: "ok", texto: `${periodo.toUpperCase()} se quitó.` });
    } catch (e) {
      setMensajeNuevo({ tipo: "error", texto: mensajeDe(e) });
    }
  };

  const accion = async (cerrando: boolean) => {
    setMensaje(null);
    try {
      await (cerrando ? cerrar : reabrir).mutateAsync({ periodo: ctx.periodo, nota });
      setMensaje({ tipo: "ok", texto: cerrando ? `${ctx.periodo} quedó cerrado.` : `${ctx.periodo} se reabrió.` });
      setNota("");
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDe(e) });
    }
  };

  return (
    <>
      <section aria-labelledby="wh-capas">
        <h2 id="wh-capas" style={{ marginBottom: "var(--space-3)" }}>
          Cómo se guarda
        </h2>
        <div className="wh-capas">
          <div className="wh-capa">
            <b>1 · Manifiesto del original</b>
            <p>De cada archivo recibido queda su nombre, la huella SHA-256 de su contenido, las columnas y cuándo y quién lo cargó. El archivo en sí no se conserva.</p>
            <p className="wh-nota-chica">Los Excel de Davinci y Master traen documento, dirección, salud y contraseñas. Guardarlos sería guardar lo que la política descarta.</p>
          </div>
          <div className="wh-capa">
            <b>2 · Filas limpias</b>
            <p>
              Una fila por registro en <span className="wh-mono">wh_filas</span>, ya filtrada por la política de su conjunto: lo personal se descarta, el código del estudiante se conserva como dato personal (solo para el seguimiento académico) y el docente queda como seudónimo.
            </p>
            <p className="wh-nota-chica">La limpieza ocurre dentro de la base. Cargar desde el navegador o desde el servidor da el mismo resultado.</p>
          </div>
          <div className="wh-capa">
            <b>3 · Consulta</b>
            <p>
              Vistas listas para preguntar: <span className="wh-mono">v_wh_cobertura</span>, <span className="wh-mono">wh_vigentes</span> y <span className="wh-mono">v_wh_rendimiento</span> con sus columnas ya numéricas.
            </p>
            <p className="wh-nota-chica">Cada conjunto nuevo suma su vista cuando su encabezado está confirmado.</p>
          </div>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-reglas-a">
        <div className="wh-panel__cabeza">
          <h2 id="wh-reglas-a">Reglas de los periodos</h2>
        </div>
        <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-2)" }}>
          <p>
            <b>Periodo abierto.</b> Se puede recargar cuantas veces haga falta. Cada carga con contenido distinto es una versión nueva; la anterior queda como «reemplazada», no se borra.
          </p>
          <p>
            <b>Periodo cerrado.</b> Lo guardado queda protegido: recargarlo exige un motivo, que queda en el historial. Cerrarlo lo hace Planeación; reabrirlo, la administración.
          </p>
          <p>
            <b>Mismo contenido.</b> Si una descarga trae exactamente lo mismo que ya está guardado, no crea versión. La huella es del contenido, no del archivo (el .xlsx lleva la hora de creación).
          </p>
          <p>
            <b>Rendimiento por corte.</b> Master solo entrega el periodo que tiene abierto. El historial de notas se arma cargando cada corte cuando ocurre; no se puede pedir después.
          </p>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-cierre">
        <div className="wh-panel__cabeza">
          <h2 id="wh-cierre">Periodo {ctx.periodo}</h2>
          <span className="wh-etiqueta" data-t={cerrado ? undefined : "ok"}>
            {cerrado ? "Cerrado" : "Abierto"}
          </span>
        </div>
        <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-3)" }}>
          <p className="wh-muted">
            {enPeriodo.length} cargas vigentes · {enPeriodo.reduce((s, c) => s + c.filas, 0).toLocaleString("es-CO")} filas
            {cerrado && estado?.nota ? ` · cerrado: ${estado.nota}` : ""}
          </p>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="wh-muted">{cerrado ? "Motivo para reabrirlo (obligatorio)" : "Nota del cierre (opcional)"}</span>
            <input className="wh-texto" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
          </label>
          <div className="wh-fila">
            {cerrado ? (
              <button type="button" className="button-secondary" disabled={!permisos.administrar || nota.trim().length < 5 || reabrir.isPending} onClick={() => void accion(false)}>
                Reabrir {ctx.periodo}
              </button>
            ) : (
              <button type="button" className="button-primary" disabled={cerrar.isPending} onClick={() => void accion(true)}>
                Cerrar {ctx.periodo}
              </button>
            )}
            {cerrado && !permisos.administrar && <span className="wh-muted">Reabrir es de la administración.</span>}
          </div>
          {mensaje && (
            <p className={mensaje.tipo === "ok" ? "wh-aviso wh-aviso--verde" : "wh-aviso wh-aviso--rojo"} role={mensaje.tipo === "error" ? "alert" : "status"}>
              {mensaje.texto}
            </p>
          )}
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-nuevo">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-nuevo">Crear un periodo nuevo</h2>
            <p className="wh-muted">Para preparar un periodo que la plataforma aún no tiene (2027A, 2027B…). Queda abierto y vacío, y aparece en el selector de periodo.</p>
          </div>
        </div>
        <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-3)" }}>
          <form
            className="wh-fila"
            onSubmit={(e) => {
              e.preventDefault();
              void crearPeriodo(nuevo);
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span className="wh-muted">Periodo (año y letra)</span>
              <input
                className="wh-texto"
                value={nuevo}
                maxLength={8}
                placeholder="2027A"
                aria-invalid={errorNuevo ? true : undefined}
                aria-describedby={errorNuevo ? "wh-nuevo-error" : undefined}
                onChange={(e) => setNuevo(e.target.value)}
              />
            </label>
            <button type="submit" className="button-primary" disabled={!nuevo.trim() || Boolean(errorNuevo) || crear.isPending} style={{ alignSelf: "end" }}>
              {crear.isPending ? "Creando…" : "Crear periodo"}
            </button>
          </form>
          {errorNuevo && (
            <p id="wh-nuevo-error" className="wh-muted">
              {errorNuevo}
            </p>
          )}
          {sugeridos.length > 0 && (
            <div className="wh-fila" role="group" aria-label="Periodos sugeridos">
              <span className="wh-muted">Sugeridos:</span>
              {sugeridos.map((p) => (
                <button key={p} type="button" className="button-secondary" disabled={crear.isPending} onClick={() => void crearPeriodo(p)}>
                  Crear {p.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {quitables.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="wh-muted">Abiertos y sin cargas (se pueden quitar):</span>
              <div className="wh-fila">
                {quitables.map((p) => (
                  <span key={p} className="wh-etiqueta">
                    {p.toUpperCase()}
                    <button type="button" className="oda-link-button" disabled={quitar.isPending} aria-label={`Quitar el periodo ${p.toUpperCase()}`} onClick={() => void quitarPeriodo(p)} style={{ marginLeft: 8 }}>
                      Quitar
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {mensajeNuevo && (
            <p className={mensajeNuevo.tipo === "ok" ? "wh-aviso wh-aviso--verde" : "wh-aviso wh-aviso--rojo"} role={mensajeNuevo.tipo === "error" ? "alert" : "status"}>
              {mensajeNuevo.texto}
            </p>
          )}
          <p className="wh-nota-chica">Traer datos de la plataforma a un periodo futuro solo funciona cuando la plataforma ya lo tenga abierto; mientras tanto se puede cargar un Excel a mano.</p>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-politica">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-politica">Política de privacidad por conjunto</h2>
            <p className="wh-muted">Un conjunto sin política no se puede guardar. Las políticas viven en la base (migración 0155).</p>
          </div>
        </div>
        <div className="wh-tabla-envuelta">
          <table className="wh-tabla">
            <thead>
              <tr>
                <th scope="col">Conjunto</th>
                <th scope="col">Regla</th>
                <th scope="col">Seudónimo</th>
                <th scope="col">Qué hace</th>
              </tr>
            </thead>
            <tbody>
              {(politicas.data ?? [])
                .filter((p) => !p.conjunto.startsWith("dm_"))
                .map((p) => (
                  <tr key={p.conjunto}>
                    <td>{conjuntoPorId(p.conjunto)?.nombre ?? p.conjunto}</td>
                    <td>{p.modo === "permitir" ? `Solo ${p.lista.length} columnas` : p.lista.length ? `Todas menos ${p.lista.join(", ")}` : "Todas"}</td>
                    <td className="wh-mono">{p.seudonimizar.join(", ") || "—"}</td>
                    <td>{p.nota}</td>
                  </tr>
                ))}
              {CONJUNTOS.filter((c) => c.estado === "sin_politica").map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td colSpan={3}>
                    <span className="wh-etiqueta" data-t="sin_politica">
                      Sin política
                    </span>{" "}
                    {c.privacidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-donde">
        <div className="wh-panel__cabeza">
          <h2 id="wh-donde">Dónde corre</h2>
        </div>
        <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-2)" }}>
          <p>
            La API de Master está en el puerto 81, pide sesión y entrega los reportes como Excel en base64 (hasta unos 4 MB). Por eso la carga automática la hace la función <span className="wh-mono">warehouse</span> del servidor, no el navegador.
          </p>
          <p>
            Usa una <b>cuenta de servicio</b> de Master (variables <span className="wh-mono">WAREHOUSE_MASTER_USER</span> y <span className="wh-mono">WAREHOUSE_MASTER_PASSWORD</span>), nunca la de una persona. La contraseña no sale del servidor ni se escribe en los registros.
          </p>
          <p className="wh-aviso wh-aviso--ambar">
            Los HAR de la carpeta «har warehouse» contienen el usuario y la contraseña de quien los grabó, además de tokens en las URLs. No los comparta, no los suba a Drive, y cambie esa contraseña.
          </p>
        </div>
      </section>
    </>
  );
}
