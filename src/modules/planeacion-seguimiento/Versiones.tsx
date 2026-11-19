/* Planeación y Seguimiento · versiones: la línea base v1.0 (borrador o publicada) y publicar (solo el administrador). Comparar llega en la fase 4. */

import { useState } from "react";
import { Link } from "react-router-dom";
import { calidadDeDatos, resumir } from "./calculos";
import { useLineas, usePublicarVersion, useVersiones } from "./api";
import { usePs } from "./contexto";
import { DESDE_MODULO, PaginaCompleta } from "./marco/PaginaCompleta";
import { Nota } from "./partes";
import { entero, millones, puedeAdministrar, type VersionResumen } from "./modelo";
import { LoadingBlock } from "../../components/ui/QueryState";
import { Icon } from "../../components/ui/Icon";

const ORIGEN: Record<string, string> = { carga_matriz: "Carga de la matriz", solicitud: "Solicitud de cambio", restauracion: "Restauración" };
const fechaHora = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—");

export const EstadoVersion = ({ v }: { v: VersionResumen }) =>
  v.estado === "publicada" ? (
    <span className="ps-estado" data-tono="ok"><b aria-hidden="true">●</b>Publicada{v.vigente ? " · vigente" : ""}</span>
  ) : (
    <span className="ps-estado" data-tono="pend"><b aria-hidden="true">◆</b>Borrador · sin publicar</span>
  );

export function Versiones() {
  const { plan, nivel, ruta } = usePs();
  const q = useVersiones(plan?.id ?? null);
  const admin = puedeAdministrar(nivel);
  if (q.isPending) return <LoadingBlock rows={3} label="Cargando las versiones" />;
  const lista = q.data ?? [];
  return (
    <div className="ps-seccion">
      <p className="ps-sub">
        Una versión es una foto completa del plan. La <strong>publicada</strong> no se puede editar: es la línea base vigente. Un <strong>borrador</strong> se revisa y se publica. Compararlas y pedir cambios llega en la fase 4.
      </p>
      <ul className="ps-versiones">
        {lista.map((v) => (
          <li key={v.id} className="ps-version">
            <div className="ps-version__cab">
              <h2>{v.etiqueta}</h2>
              <EstadoVersion v={v} />
            </div>
            <dl className="ps-version__datos">
              <div><dt>Origen</dt><dd>{(v.origen && ORIGEN[v.origen]) ?? v.origen ?? "—"}</dd></div>
              <div><dt>Líneas</dt><dd>{entero(v.nLineas)}</dd></div>
              <div><dt>Inversión</dt><dd>{millones(v.inversion)}</dd></div>
              <div><dt>Creada</dt><dd>{fechaHora(v.creadaEn)}</dd></div>
              <div><dt>Publicada</dt><dd>{fechaHora(v.publicadaEn)}</dd></div>
            </dl>
            {v.nota ? <p className="ps-nota">Nota: {v.nota}</p> : null}
            <div className="ps-version__acciones">
              {admin && v.estado === "borrador" ? (
                <Link className="button-primary" to={ruta("publicar", v.id)} state={DESDE_MODULO}>Publicar {v.etiqueta}</Link>
              ) : null}
              {!admin && v.estado === "borrador" ? <Nota>Solo el administrador de planeación publica.</Nota> : null}
            </div>
          </li>
        ))}
      </ul>
      {lista.length === 0 ? <Nota>El plan aún no tiene versiones.</Nota> : null}
    </div>
  );
}

/** Publicar: una página completa con su resumen y la confirmación en línea (no un diálogo). */
export function PublicarVersion({ id }: { id: string }) {
  const { plan, nivel, ruta, ir } = usePs();
  const versiones = useVersiones(plan?.id ?? null);
  const v = versiones.data?.find((x) => x.id === id);
  const lineasQ = useLineas(v?.id ?? null);
  const publicar = usePublicarVersion();
  const [nota, setNota] = useState("");
  const [entiendo, setEntiendo] = useState(false);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Versiones", a: ruta("versiones") }, { texto: "Publicar" }];
  if (versiones.isPending) return <PaginaCompleta titulo="Publicar versión" migas={migas} regresarA={ruta("versiones")}><LoadingBlock rows={3} /></PaginaCompleta>;
  if (!v) return <PaginaCompleta titulo="No encuentro esa versión" migas={migas} regresarA={ruta("versiones")} regresarTexto="Regresar a versiones"><Nota>La versión no existe o ya no está disponible.</Nota></PaginaCompleta>;
  if (!puedeAdministrar(nivel)) return <PaginaCompleta titulo={`Publicar ${v.etiqueta}`} migas={migas} regresarA={ruta("versiones")} regresarTexto="Regresar a versiones"><p className="ps-aviso"><Icon name="lock" size={16} /> Solo el administrador de planeación publica versiones.</p></PaginaCompleta>;
  if (hecho) {
    return (
      <PaginaCompleta titulo={`${hecho} publicada`} migas={migas} regresarA={ruta("versiones")} regresarTexto="Regresar a versiones" claveFoco="hecho">
        <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> La versión {hecho} quedó publicada y es la vigente del plan. Ya no se puede editar.</p>
        <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(ruta("resumen"))}>Ver el resumen del plan</button><button type="button" className="button-secondary" onClick={() => ir(ruta("versiones"))}>Ver las versiones</button></div>
      </PaginaCompleta>
    );
  }
  const lineas = lineasQ.data ?? [];
  const r = resumir(lineas);
  const malas = calidadDeDatos(lineas).filter((h) => h.inconsistentes.length);
  const yaPublicada = v.estado === "publicada";
  const confirmar = async () => {
    if (!entiendo) {
      setErrorCampo("Marque la casilla para confirmar que entiende que la versión queda congelada.");
      document.getElementById("pub-entiendo")?.focus();
      return;
    }
    setErrorCampo(null);
    try {
      const res = await publicar.mutateAsync({ versionId: v.id, nota: nota.trim() });
      setHecho(res.etiqueta || v.etiqueta);
    } catch {
      /* el error se muestra abajo */
    }
  };
  return (
    <PaginaCompleta
      titulo={`Publicar ${v.etiqueta}`}
      subtitulo="Revise lo que va a quedar congelado y confirme."
      migas={migas}
      regresarA={ruta("versiones")}
      regresarTexto="Regresar a versiones"
      ancho="angosto"
      pie={
        yaPublicada ? null : (
          <>
            <div className="ps-pie__izq" />
            <div className="ps-pie__der">
              <button type="button" className="button-secondary" onClick={() => ir(ruta("versiones"))} disabled={publicar.isPending}>Ahora no</button>
              <button type="button" className="button-primary" onClick={confirmar} disabled={publicar.isPending || lineas.length === 0} aria-busy={publicar.isPending || undefined}>{publicar.isPending ? "Publicando…" : `Publicar ${v.etiqueta}`}</button>
            </div>
          </>
        )
      }
    >
      {yaPublicada ? <p className="ps-aviso"><Icon name="info" size={16} /> Esta versión ya está publicada.</p> : null}
      {publicar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(publicar.error as Error).message}</p> : null}
      <dl className="ps-ficha">
        <div><dt>Plan</dt><dd>{plan?.nombre}</dd></div>
        <div><dt>Líneas</dt><dd>{entero(v.nLineas)}</dd></div>
        <div><dt>Inversión total</dt><dd>{millones(v.inversion)}</dd></div>
        <div><dt>Evaluadas</dt><dd>{r.evaluados} de {r.n}</dd></div>
      </dl>
      {malas.length ? <p className="ps-aviso"><Icon name="alert" size={16} /> La calidad de datos marca inconsistencias ({malas.map((m) => m.titulo.toLowerCase()).join("; ")}). Puede publicar igual, pero conviene revisarlas antes en «Calidad de datos».</p> : null}
      <div className="ps-bloque">
        <h2>Qué pasa al publicar</h2>
        <ul className="ps-pasos-lista">
          <li>La versión queda <strong>congelada</strong>: no se puede editar ni borrar.</li>
          <li>Pasa a ser la <strong>vigente</strong>: la línea base con la que se medirá el seguimiento.</li>
          <li>Para cambiarla después se abre un borrador por solicitud de cambio (fase 4).</li>
        </ul>
      </div>
      {!yaPublicada ? (
        <div className="ps-bloque">
          <div className="ps-campo">
            <label htmlFor="pub-nota">Nota de la publicación <span className="ps-oblig">(opcional)</span></label>
            <textarea id="pub-nota" rows={3} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: línea base aprobada por la Vicerrectoría." />
          </div>
          <div className="ps-campo" data-error={errorCampo ? "true" : undefined}>
            <label className="ps-opcion ps-opcion--grande">
              <input id="pub-entiendo" type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} aria-invalid={Boolean(errorCampo)} aria-describedby={errorCampo ? "pub-entiendo-error" : undefined} />
              <span>Entiendo que una versión publicada no se puede editar.</span>
            </label>
            {errorCampo ? <p className="ps-campo__error" id="pub-entiendo-error"><Icon name="alert" size={14} /> {errorCampo}</p> : null}
          </div>
        </div>
      ) : null}
    </PaginaCompleta>
  );
}

export function Comparar() {
  const { ruta } = usePs();
  return (
    <PaginaCompleta titulo="Comparar versiones" subtitulo="Qué cambió entre dos versiones del plan" migas={[{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Versiones", a: ruta("versiones") }, { texto: "Comparar" }]} regresarA={ruta("versiones")} regresarTexto="Regresar a versiones">
      <p className="ps-aviso"><Icon name="info" size={16} /> Comparar versiones llega en la fase 4, junto con las solicitudes de cambio. Hoy el plan solo tiene la línea base v1.0.</p>
    </PaginaCompleta>
  );
}
