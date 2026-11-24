/* =============================================================================
   UDrive · Unidades de trabajo · espacio y cuota de una unidad.

   El uso se calcula en la base (todo lo que ocupan los archivos de la unidad,
   también lo de la papelera) y la cuota se comprueba al subir, en un disparador:
   el cliente solo avisa. Barra con aviso al 80 % y al 100 %. Quien administra
   puede pedir una ampliación con un motivo; la resuelve la administración
   general, que además puede fijar la cuota directamente.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { haceCuanto } from "../../../components/espacio/logica";
import { useAuth } from "../../../lib/auth";
import { errorDe, useFijarCuota, usePedirAmpliacion, usePeticiones } from "./datos";
import { fraccionCuota, GB, nivelCuota, textoBytes } from "./lib";
import { entrarNota, llenarBarra } from "./movimiento";
import type { UnidadFila } from "./tipos";

export function BarraUso({ uso, cuota, id }: { uso: number; cuota: number; id?: string }) {
  const nivel = nivelCuota(uso, cuota);
  const f = fraccionCuota(uso, cuota);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => llenarBarra(ref.current), []);
  return (
    <div className="un-barra" data-nivel={nivel} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} aria-label="Espacio usado" id={id}>
      <i ref={ref} style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function EspacioUnidad({ u }: { u: UnidadFila }) {
  const { hasRole } = useAuth();
  const general = hasRole("admin");
  const admin = u.mi_rol === "admin";
  const nivel = nivelCuota(u.uso_bytes, u.cuota_bytes);
  const peticiones = usePeticiones(u.id, admin);
  const pedir = usePedirAmpliacion();
  const fijar = useFijarCuota();
  const [gb, setGb] = useState("5");
  const [motivo, setMotivo] = useState("");
  const [nuevaCuota, setNuevaCuota] = useState(String(Math.round((u.cuota_bytes / GB) * 10) / 10));
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const nota = useRef<HTMLParagraphElement>(null);

  const pendiente = (peticiones.data ?? []).find((p) => p.estado === "pendiente");
  const gbNum = Number(gb.replace(",", "."));
  const motivoOk = motivo.trim().length >= 10;
  const falla = (m: string) => {
    setError(m);
    requestAnimationFrame(() => entrarNota(nota.current));
  };

  return (
    <div className="un-pagina un-pagina--angosta">
      <header className="un-cab">
        <div>
          <p className="un-kicker">{u.nombre}</p>
          <h1>Espacio</h1>
          <p className="un-ayuda un-cab__d">Todo lo que ocupan los archivos de la unidad cuenta, también lo que está en su papelera. Al llegar al tope no se pueden subir más archivos.</p>
        </div>
      </header>

      <section className="un-caja" aria-labelledby="un-e-uso">
        <h2 id="un-e-uso">Uso</h2>
        <p className="un-uso-t"><strong>{textoBytes(u.uso_bytes)}</strong> de {textoBytes(u.cuota_bytes)} <span className="un-ayuda">({Math.round(fraccionCuota(u.uso_bytes, u.cuota_bytes) * 100)} %)</span></p>
        <BarraUso uso={u.uso_bytes} cuota={u.cuota_bytes} />
        {nivel === "lleno" ? <p className="un-nota un-nota--error" role="status">La unidad llegó al 100 % de su espacio. {admin ? "Libere espacio vaciando la papelera vencida (en Personas) o pida una ampliación." : "Avise a quien la administra."}</p> : null}
        {nivel === "aviso" ? <p className="un-nota un-nota--aviso" role="status">La unidad pasó el 80 % de su espacio. {admin ? "Conviene liberar espacio o pedir una ampliación antes de que se llene." : "Avise a quien la administra."}</p> : null}
      </section>

      {admin && u.es_miembro ? (
        <section className="un-caja" aria-labelledby="un-e-pedir">
          <h2 id="un-e-pedir">Pedir más espacio</h2>
          {pendiente ? (
            <p className="un-nota un-nota--info">Hay una petición en espera: {textoBytes(pendiente.bytes_pedidos)} más. La resuelve la administración general; el resultado aparece aquí y en el registro.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                setOk("");
                if (!(gbNum > 0)) return falla("Indique cuántos GB más necesita.");
                if (!motivoOk) return falla("Cuente para qué lo necesita, en al menos 10 caracteres.");
                pedir.mutate({ unidad: u.id, bytes: Math.round(gbNum * GB), motivo: motivo.trim() }, { onSuccess: () => { setOk("Petición enviada. La administración general la revisará."); setMotivo(""); }, onError: (er) => falla(errorDe(er as Error).message) });
              }}
              noValidate
            >
              <div className="un-dos">
                <div className="un-fld"><label htmlFor="un-e-gb">GB adicionales</label><input id="un-e-gb" type="text" inputMode="decimal" value={gb} onChange={(e) => setGb(e.target.value)} /></div>
              </div>
              <div className="un-fld"><label htmlFor="un-e-m">Motivo</label><textarea id="un-e-m" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: cargamos las evidencias de acreditación de los cinco programas." /><span className="un-ayuda">{motivo.trim().length} de 500 · mínimo 10</span></div>
              <div><button type="submit" className="un-btn" disabled={pedir.isPending}>Enviar la petición</button></div>
            </form>
          )}
          {ok ? <p className="un-nota un-nota--ok" role="status">{ok}</p> : null}
          {error ? <p className="un-nota un-nota--error" role="alert" ref={nota}>{error}</p> : null}
          {(peticiones.data ?? []).length ? (
            <div className="un-tabla" tabIndex={0} role="region" aria-label="Peticiones de ampliación">
              <table>
                <thead><tr><th scope="col">Cuándo</th><th scope="col">Pidió</th><th scope="col">Estado</th><th scope="col">Respuesta</th></tr></thead>
                <tbody>
                  {(peticiones.data ?? []).map((p) => (
                    <tr key={p.id}>
                      <td>{haceCuanto(p.created_at)}</td>
                      <td>{textoBytes(p.bytes_pedidos)}</td>
                      <td>{p.estado === "pendiente" ? "En espera" : p.estado === "aprobada" ? `Aprobada (${textoBytes(p.bytes_otorgados ?? 0)})` : "Rechazada"}</td>
                      <td>{p.respuesta ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {general ? (
        <section className="un-caja" aria-labelledby="un-e-fijar">
          <h2 id="un-e-fijar">Definir la cuota (administración general)</h2>
          <form
            className="un-fila"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              setOk("");
              const n = Number(nuevaCuota.replace(",", "."));
              if (!(n >= 0)) return falla("Escriba la cuota en GB.");
              fijar.mutate({ unidad: u.id, bytes: Math.round(n * GB) }, { onSuccess: () => setOk("Cuota actualizada."), onError: (er) => falla(errorDe(er as Error).message) });
            }}
          >
            <div className="un-fld"><label htmlFor="un-e-c">Cuota en GB</label><input id="un-e-c" type="text" inputMode="decimal" value={nuevaCuota} onChange={(e) => setNuevaCuota(e.target.value)} /></div>
            <button type="submit" className="un-btn un-btn--sec" disabled={fijar.isPending}>Guardar la cuota</button>
          </form>
          <p className="un-ayuda">No puede ser menor que lo que la unidad ya ocupa ni pasar la capacidad del servidor. Queda en el registro. En <a href="/admin/udrive/unidades/capacidad">Capacidad y registro</a> se ven todas las unidades.</p>
          {!(admin && u.es_miembro) && ok ? <p className="un-nota un-nota--ok" role="status">{ok}</p> : null}
          {!(admin && u.es_miembro) && error ? <p className="un-nota un-nota--error" role="alert">{error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
