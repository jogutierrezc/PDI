/* =============================================================================
   UDrive · Unidades de trabajo · capacidad y registro (administración general).

   Cuánto del servidor está comprometido (suma de las cuotas de las unidades
   activas) y cuánto está en uso; el uso y el tope de cada unidad, con la cuota
   editable; las peticiones de ampliación (aprobar o rechazar) y el registro de
   cambios de todas las unidades, que solo se agrega. Solo el rol de
   administración general (la base también lo exige).
   ========================================================================== */

import { useState } from "react";
import { Link } from "react-router-dom";
import { haceCuanto } from "../../../components/espacio/logica";
import { useAuth } from "../../../lib/auth";
import { errorDe, useCapacidad, useFijarCuota, useFijarParametro, useRegistroGlobal, useResolverPeticion } from "./datos";
import { BarraUso } from "./Espacio";
import { GB, textoAccion, textoBytes } from "./lib";
import { EstadoUnidades, MarcoUnidades } from "./Marco";
import type { CapacidadUnidad } from "./tipos";

const aGb = (b: number) => String(Math.round((b / GB) * 10) / 10);

function FilaUnidad({ c, onError }: { c: CapacidadUnidad; onError: (m: string) => void }) {
  const fijar = useFijarCuota();
  const resolver = useResolverPeticion();
  const [cuota, setCuota] = useState(aGb(c.cuota_bytes));
  const [otorga, setOtorga] = useState(c.peticion_bytes ? aGb(c.peticion_bytes) : "");
  const [respuesta, setRespuesta] = useState("");
  return (
    <>
      <tr data-archivada={Boolean(c.archivada_en)}>
        <th scope="row"><Link to={`/admin/udrive/unidad/${c.unidad_id}?s=espacio`}><span className="un-mono un-mono--chico" style={{ ["--ac" as string]: c.acento }} aria-hidden="true">{c.monograma}</span> {c.nombre}</Link>{c.archivada_en ? <span className="un-chip">Archivada</span> : null}</th>
        <td className="un-td-barra"><BarraUso uso={c.uso_bytes} cuota={c.cuota_bytes} /><small>{textoBytes(c.uso_bytes)} de {textoBytes(c.cuota_bytes)}</small></td>
        <td>
          <form className="un-fila un-fila--junta" onSubmit={(e) => { e.preventDefault(); const n = Number(cuota.replace(",", ".")); if (!(n >= 0)) return onError("Escriba la cuota en GB."); fijar.mutate({ unidad: c.unidad_id, bytes: Math.round(n * GB) }, { onError: (er) => onError(errorDe(er as Error).message) }); }}>
            <label className="un-sr" htmlFor={`cu-${c.unidad_id}`}>Cuota en GB de {c.nombre}</label>
            <input id={`cu-${c.unidad_id}`} className="un-corto" type="text" inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} />
            <span>GB</span>
            <button type="submit" className="un-btn un-btn--sec un-btn--chico" disabled={fijar.isPending}>Guardar</button>
          </form>
        </td>
      </tr>
      {c.peticion_id ? (
        <tr className="un-peticion">
          <td colSpan={3}>
            <p><strong>{c.peticion_por ?? "Quien administra"}</strong> pide {textoBytes(c.peticion_bytes ?? 0)} más ({c.peticion_fecha ? haceCuanto(c.peticion_fecha) : ""}): {c.peticion_motivo}</p>
            <div className="un-fila">
              <div className="un-fld"><label htmlFor={`ot-${c.peticion_id}`}>GB que se conceden</label><input id={`ot-${c.peticion_id}`} className="un-corto" type="text" inputMode="decimal" value={otorga} onChange={(e) => setOtorga(e.target.value)} /></div>
              <div className="un-fld un-fld--crece"><label htmlFor={`re-${c.peticion_id}`}>Respuesta <span className="un-ayuda">(opcional)</span></label><input id={`re-${c.peticion_id}`} type="text" value={respuesta} maxLength={200} onChange={(e) => setRespuesta(e.target.value)} /></div>
              <button type="button" className="un-btn" disabled={resolver.isPending} onClick={() => { const n = Number(otorga.replace(",", ".")); if (!(n > 0)) return onError("Indique cuántos GB se conceden."); resolver.mutate({ id: c.peticion_id!, aprobar: true, bytes: Math.round(n * GB), respuesta }, { onError: (er) => onError(errorDe(er as Error).message) }); }}>Aprobar</button>
              <button type="button" className="un-btn un-btn--peligro" disabled={resolver.isPending} onClick={() => resolver.mutate({ id: c.peticion_id!, aprobar: false, bytes: null, respuesta }, { onError: (er) => onError(errorDe(er as Error).message) })}>Rechazar</button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function CapacidadAdmin() {
  const { hasRole } = useAuth();
  const admin = hasRole("admin");
  const cap = useCapacidad(admin);
  const registro = useRegistroGlobal(admin);
  const parametro = useFijarParametro();
  const [error, setError] = useState("");
  const [capGb, setCapGb] = useState<string | null>(null);
  const [defGb, setDefGb] = useState<string | null>(null);

  if (!admin) {
    return (
      <MarcoUnidades actual="capacidad">
        <div className="un-pagina"><div className="un-vacio"><strong>Esta vista es de la administración general</strong><span>Aquí se ve el uso y el tope de todas las unidades. Su unidad tiene su propia sección «Espacio».</span><Link className="un-btn" to="/admin/udrive/unidades">Volver a las unidades</Link></div></div>
      </MarcoUnidades>
    );
  }
  if (cap.isPending || cap.error) return <EstadoUnidades cargando={cap.isPending} error={cap.error} reintentar={() => void cap.refetch()} />;
  const r = cap.data.resumen;
  const comprometido = r.capacidad_bytes ? r.comprometido_bytes / r.capacidad_bytes : 0;
  const sobre = r.comprometido_bytes > r.capacidad_bytes;
  const guardarParametro = (clave: "cuota_unidad_bytes" | "capacidad_servidor_bytes", texto: string) => {
    const n = Number(texto.replace(",", "."));
    if (!(n > 0)) return setError("Escriba un número de GB mayor que cero.");
    setError("");
    parametro.mutate({ clave, valor: n * GB }, { onError: (e) => setError(errorDe(e as Error).message) });
  };

  return (
    <MarcoUnidades actual="capacidad">
      <div className="un-pagina">
        <header className="un-cab">
          <div>
            <p className="un-kicker">Administración general</p>
            <h1>Capacidad y registro</h1>
            <p className="un-ayuda un-cab__d">Cuánto del servidor está prometido a las unidades, cuánto se usa de verdad, quién pidió más espacio y qué se cambió.</p>
          </div>
        </header>
        {error ? <p className="un-nota un-nota--error" role="alert">{error}</p> : null}

        <section className="un-caja" aria-labelledby="un-c-res">
          <h2 id="un-c-res">El servidor</h2>
          <div className="un-cifras">
            <div><span>Capacidad</span><strong>{textoBytes(r.capacidad_bytes)}</strong></div>
            <div><span>Comprometido (cuotas)</span><strong>{textoBytes(r.comprometido_bytes)}</strong><small>{Math.round(comprometido * 100)} % de la capacidad</small></div>
            <div><span>En uso en unidades</span><strong>{textoBytes(r.uso_unidades_bytes)}</strong></div>
            <div><span>En uso fuera de unidades</span><strong>{textoBytes(r.uso_personal_bytes)}</strong><small>Carpetas personales</small></div>
          </div>
          <BarraUso uso={r.comprometido_bytes} cuota={r.capacidad_bytes} />
          {sobre ? <p className="un-nota un-nota--aviso">Las cuotas suman más que la capacidad del servidor. Conviene bajar alguna cuota o ampliar el servidor antes de aprobar más espacio.</p> : null}
          <form className="un-fila" onSubmit={(e) => { e.preventDefault(); guardarParametro("capacidad_servidor_bytes", capGb ?? aGb(r.capacidad_bytes)); }}>
            <div className="un-fld"><label htmlFor="un-c-cap">Capacidad del servidor (GB)</label><input id="un-c-cap" className="un-corto" type="text" inputMode="decimal" value={capGb ?? aGb(r.capacidad_bytes)} onChange={(e) => setCapGb(e.target.value)} /></div>
            <button type="submit" className="un-btn un-btn--sec" disabled={parametro.isPending}>Guardar</button>
          </form>
          <form className="un-fila" onSubmit={(e) => { e.preventDefault(); guardarParametro("cuota_unidad_bytes", defGb ?? aGb(r.cuota_defecto_bytes)); }}>
            <div className="un-fld"><label htmlFor="un-c-def">Cuota de una unidad nueva (GB)</label><input id="un-c-def" className="un-corto" type="text" inputMode="decimal" value={defGb ?? aGb(r.cuota_defecto_bytes)} onChange={(e) => setDefGb(e.target.value)} /></div>
            <button type="submit" className="un-btn un-btn--sec" disabled={parametro.isPending}>Guardar</button>
          </form>
          <p className="un-ayuda">La cuota por defecto solo afecta a las unidades que se creen de ahora en adelante.</p>
        </section>

        <section className="un-caja" aria-labelledby="un-c-un">
          <h2 id="un-c-un">Cada unidad</h2>
          {cap.data.unidades.some((c) => c.peticion_id) ? <p className="un-nota un-nota--info">Hay {cap.data.unidades.filter((c) => c.peticion_id).length} peticiones de ampliación en espera, al comienzo de la lista.</p> : null}
          <div className="un-tabla" tabIndex={0} role="region" aria-label="Uso y cuota de cada unidad">
            <table>
              <thead><tr><th scope="col">Unidad</th><th scope="col">Uso</th><th scope="col">Cuota</th></tr></thead>
              <tbody>{cap.data.unidades.map((c) => <FilaUnidad key={c.unidad_id} c={c} onError={setError} />)}</tbody>
            </table>
          </div>
        </section>

        <section className="un-caja" aria-labelledby="un-c-reg">
          <h2 id="un-c-reg">Registro de cambios</h2>
          <p className="un-ayuda">Solo se agrega: nadie lo edita ni lo borra. Lo que hace la administración general en unidades ajenas va marcado.</p>
          {registro.isPending ? <p className="un-ayuda">Cargando…</p> : registro.error ? <p className="un-nota un-nota--error">{errorDe(registro.error as Error).message}</p> : (
            <div className="un-tabla" tabIndex={0} role="region" aria-label="Registro de cambios">
              <table>
                <thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Cómo</th><th scope="col">Qué</th><th scope="col">Unidad</th></tr></thead>
                <tbody>
                  {(registro.data ?? []).map((e) => (
                    <tr key={e.id}>
                      <td>{haceCuanto(e.cuando)}</td>
                      <td>{e.actor_nombre ?? "—"}</td>
                      <td>{e.como === "admin_general" ? <span className="un-chip un-chip--nav">Admin general</span> : "Miembro"}</td>
                      <td>{textoAccion(e.accion)}</td>
                      <td><Link to={`/admin/udrive/unidad/${e.unidad_id}`}>{e.unidad}</Link></td>
                    </tr>
                  ))}
                  {!(registro.data ?? []).length ? <tr><td colSpan={5}>Todavía no hay movimientos.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </MarcoUnidades>
  );
}
