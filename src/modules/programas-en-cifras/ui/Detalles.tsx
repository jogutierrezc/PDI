/* =============================================================================
   Programas en Cifras · el panel de detalles.

   Con un archivo seleccionado: su estado, a qué cuadro responde y cuánto cubre
   (anillos), y su actividad. En la carpeta del CNA, sin archivo: la ventana de
   observación, la ruta de periodos 01 y 02, «Cerrar el periodo» y «Emitir el
   Cuadro Maestro».
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useActividad, useBorrarArchivo, useCerrarPeriodo, useDefinirVentana, useReabrirPeriodo } from "../datos";
import { cobertura, destino as destinoDe, etiquetaSistema, nombreCorto } from "../lib/destinos";
import { ANIOS_VENTANA, puedeCerrar, ventanaPorDefecto } from "../lib/periodos";
import type { AniosVentana } from "../lib/periodos";
import { puedeEliminarArchivo, ETIQUETA_ROL } from "../lib/permisos";
import type { PcActividadRow } from "../tipos";
import { Anillo, IconoArchivo } from "../../../components/espacio/piezas";
import { PanelDetalles } from "../../../components/espacio/Explorador";
import { haceCuanto, textoFilas } from "../../../components/espacio/logica";
import { FichaEstado } from "./comunes";
import { carpetaDe, useEspacio } from "./contexto";
import type { ControlExplorador } from "./Explorador";
import { textoTipoArchivo } from "./logica";

const ACCION: Record<string, string> = {
  archivo_creado: "Se creó el archivo",
  archivo_eliminado: "Se eliminó un archivo",
  estado: "Cambió de estado",
  estructura: "Se cambiaron los campos",
  filas: "Se editaron filas",
  ventana: "Se definió la ventana de observación",
  periodo_cerrado: "Se cerró un periodo",
  periodo_reabierto: "Se reabrió un periodo",
  emision: "Se emitió el Cuadro Maestro",
};

export const textoActividad = (a: Pick<PcActividadRow, "accion">): string => ACCION[a.accion] ?? "Se hizo un cambio";

export function Detalles({ control, onEmitir }: { control: ControlExplorador; onEmitir: () => void }) {
  const espacio = useEspacio();
  const { archivos, carpetas, respuestas, resumen, editable, rol, pareja, abrirEditor } = espacio;
  const { estado, cambiar } = control;
  const archivo = estado.seleccion ? archivos.find((a) => a.id === estado.seleccion) : undefined;
  const cna = carpetaDe(carpetas, "cna");
  const enCna = estado.seccion === "archivos" && Boolean(cna) && estado.carpeta === cna?.id && !archivo;
  const borrar = useBorrarArchivo();
  const [confirmando, setConfirmando] = useState(false);
  const actividad = useActividad(pareja.programa_id, pareja.campus_id, archivo?.id, 5);

  let cuerpo;
  if (enCna) cuerpo = <CarpetaCna onEmitir={onEmitir} />;
  else if (!archivo) {
    cuerpo = (
      <div className="es-dsec">
        <h3>Detalles</h3>
        <p className="es-note">Seleccione un archivo para ver su estado, a qué cuadro responde y cuánto cubre.</p>
      </div>
    );
  } else {
    const rs = respuestas.filter((r) => r.archivo_id === archivo.id);
    const info = resumen.get(archivo.id);
    cuerpo = (
      <>
        <div className="es-dhead">
          <span className="es-kbig">
            <IconoArchivo tipo={archivo.tipo} className="es-kico" />
          </span>
          <h2>{archivo.nombre}</h2>
        </div>
        <dl className="es-kv">
          <dt>Tipo</dt>
          <dd>{textoTipoArchivo(archivo.tipo)}</dd>
          <dt>Estado</dt>
          <dd>
            <FichaEstado estado={archivo.estado} errores={info?.errores ?? 0} />
          </dd>
          <dt>Modificado</dt>
          <dd>{haceCuanto(archivo.updated_at)}</dd>
          <dt>Propietario</dt>
          <dd>{pareja.programa}</dd>
          <dt>Contenido</dt>
          <dd className="es-num">
            {textoFilas(info?.filas ?? 0)} · {archivo.columnas.length} campos
          </dd>
        </dl>
        <div className="es-act">
          <button type="button" className="es-btn es-btn--pri es-btn--sm" onClick={(e) => abrirEditor(archivo.id, e.currentTarget.getBoundingClientRect())}>
            <Icon name="pen" size={16} />
            {editable ? "Abrir" : "Ver"}
          </button>
          {puedeEliminarArchivo(rol, archivo) ? (
            confirmando ? (
              <>
                <button
                  type="button"
                  className="es-btn es-btn--sm"
                  disabled={borrar.isPending}
                  onClick={() =>
                    borrar.mutate(
                      { id: archivo.id, programa: pareja.programa_id, campus: pareja.campus_id },
                      {
                        onSuccess: () => {
                          setConfirmando(false);
                          cambiar({ seleccion: null });
                          espacio.decir(`«${archivo.nombre}» eliminado.`);
                        },
                        onError: (e) => espacio.decir(e.message),
                      },
                    )
                  }
                >
                  <Icon name="trash" size={16} />
                  Sí, eliminar
                </button>
                <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setConfirmando(false)}>
                  No
                </button>
              </>
            ) : (
              <button type="button" className="es-btn es-btn--sm" onClick={() => setConfirmando(true)}>
                <Icon name="trash" size={16} />
                Eliminar
              </button>
            )
          ) : null}
        </div>
        <div className="es-dsec">
          <h3>Responde a</h3>
          {rs.length ? (
            rs.map((r) => {
              const d = destinoDe(r.destino_id);
              if (!d) return null;
              const cv = cobertura(r.mapa, d, archivo.columnas);
              return (
                <div className="pc-cov" key={r.destino_id}>
                  <Anillo pct={cv.pct} size={34} etiqueta={`Cobertura de ${d.nombre}`} />
                  <div>
                    <b>{d.sistema === "CNA" ? etiquetaSistema(d) + " · " + nombreCorto(d) : etiquetaSistema(d)}</b>
                    <span className="es-num">
                      {cv.n} de {cv.t} columnas
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="es-note">Todavía no responde a ningún cuadro del CNA ni plantilla del SNIES. Ábralo y conéctelo desde «Responde a».</p>
          )}
        </div>
        <div className="es-dsec">
          <h3>Actividad</h3>
          {actividad.data?.length ? (
            <ul className="es-plain">
              {actividad.data.map((a) => (
                <li key={a.id}>
                  {haceCuanto(a.en)}: {textoActividad(a)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="es-note">Todavía no hay movimientos.</p>
          )}
        </div>
      </>
    );
  }
  return <PanelDetalles abierto={estado.detalles}>{cuerpo}</PanelDetalles>;
}

/* ---------- La carpeta del CNA: ventana, periodos y emisión ------------------------------------ */

function CarpetaCna({ onEmitir }: { onEmitir: () => void }) {
  const { periodos, archivos, carpetas, resumen, editable, rol, pareja, decir } = useEspacio();
  const cna = carpetaDe(carpetas, "cna");
  const cerrar = useCerrarPeriodo();
  const reabrir = useReabrirPeriodo();
  const definir = useDefinirVentana();
  const [cambiando, setCambiando] = useState(false);
  const [anios, setAnios] = useState<AniosVentana>(periodos?.ventana?.anios ?? 5);
  const [hasta, setHasta] = useState(periodos?.ventana?.hasta ?? ventanaPorDefecto().hasta);
  const delCna = useMemo(() => archivos.filter((a) => a.carpeta_id === cna?.id), [archivos, cna]);
  const erroresCna = delCna.reduce((s, a) => s + (resumen.get(a.id)?.errores ?? 0), 0);
  const pendientes = delCna.filter((a) => a.estado !== "listo").length;
  const v = periodos?.ventana ?? null;
  const siguiente = periodos?.siguiente ?? null;
  const cierre = periodos && siguiente ? puedeCerrar(siguiente, periodos, erroresCna) : null;
  const ultimoCerrado = periodos ? [...periodos.periodos].reverse().find((p) => p.cerrado) : undefined;
  const base = { programa: pareja.programa_id, campus: pareja.campus_id };
  const hechos = periodos?.cerrados ?? 0;
  const total = periodos?.total ?? 0;
  const yaDefine = !v || cambiando;
  const anioActual = new Date().getFullYear();
  const opcionesHasta = Array.from({ length: 8 }, (_, i) => anioActual + 1 - i).flatMap((a) => [`${a}-02`, `${a}-01`]);

  return (
    <>
      <div className="es-dhead">
        <span className="es-kbig">
          <IconoArchivo tipo="carpeta" className="es-kico" />
        </span>
        <h2>{cna?.nombre ?? "Cuadro Maestro CNA"}</h2>
      </div>
      <div className="es-dsec" data-tour="pc-periodos">
        <h3>Ventana de observación</h3>
        {v ? (
          <>
            <div className="pc-route" role="list" aria-label="Periodos de la ventana">
              {periodos!.periodos.map((p) => (
                <span key={p.codigo} role="listitem" className="pc-rp es-num" data-s={p.cerrado ? "ok" : p.codigo === siguiente ? "open" : ""}>
                  {p.codigo}
                </span>
              ))}
            </div>
            <p className="es-note" style={{ marginTop: 8 }}>
              <b className="es-num">
                {hechos} de {total}
              </b>{" "}
              periodos cerrados. Se cierran en orden, año por año y semestre a semestre (01 y 02).
            </p>
          </>
        ) : (
          <p className="es-note">Todavía no hay ventana de observación. Elija cuántos años observa el programa y hasta qué periodo.</p>
        )}
        {editable && yaDefine ? (
          <div className="pc-ventana-sel">
            <select className="es-sel" value={anios} onChange={(e) => setAnios(Number(e.target.value) as AniosVentana)} aria-label="Años de la ventana">
              {ANIOS_VENTANA.map((a) => (
                <option key={a} value={a}>
                  {a} años
                </option>
              ))}
            </select>
            <select className="es-sel" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta el periodo">
              {opcionesHasta.map((p) => (
                <option key={p} value={p}>
                  hasta {p}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="es-btn es-btn--sm es-btn--pri"
              disabled={definir.isPending}
              onClick={() =>
                definir.mutate(
                  { ...base, anios, hasta },
                  {
                    onSuccess: () => {
                      setCambiando(false);
                      decir("Ventana definida.");
                    },
                    onError: (e) => decir(e.message),
                  },
                )
              }
            >
              {v ? "Guardar ventana" : "Definir ventana"}
            </button>
          </div>
        ) : editable ? (
          <button type="button" className="es-btn es-btn--sm es-btn--ghost" style={{ marginTop: 6 }} onClick={() => setCambiando(true)}>
            Cambiar la ventana
          </button>
        ) : null}
        {editable && siguiente && cierre ? (
          <>
            <button
              type="button"
              className="es-btn es-btn--sm"
              style={{ marginTop: 8 }}
              disabled={!cierre.ok || cerrar.isPending}
              onClick={() =>
                cerrar.mutate(
                  { ...base, codigo: siguiente },
                  { onSuccess: () => decir(`Periodo ${siguiente} cerrado.`), onError: (e) => decir(e.message) },
                )
              }
            >
              Cerrar el periodo {siguiente}
            </button>
            {!cierre.ok && cierre.motivo ? (
              <p className="es-note" style={{ marginTop: 6 }}>
                {erroresCna > 0 ? "Corrija los errores de los archivos de esta carpeta para cerrarlo." : cierre.motivo}
              </p>
            ) : null}
          </>
        ) : null}
        {editable && ultimoCerrado ? (
          <button
            type="button"
            className="es-btn es-btn--sm es-btn--ghost"
            style={{ marginTop: 6 }}
            disabled={reabrir.isPending}
            onClick={() => reabrir.mutate({ ...base, codigo: ultimoCerrado.codigo }, { onSuccess: () => decir(`Periodo ${ultimoCerrado.codigo} reabierto.`), onError: (e) => decir(e.message) })}
          >
            Reabrir el {ultimoCerrado.codigo}
          </button>
        ) : null}
      </div>
      <div className="es-dsec">
        <h3>Emitir</h3>
        <button type="button" className="es-btn es-btn--pri es-btn--sm" data-tour="pc-emitir" disabled={!editable} onClick={onEmitir}>
          <Icon name="download" size={16} />
          Emitir el Cuadro Maestro
        </button>
        <p className="es-note" style={{ marginTop: 6 }}>
          {!editable
            ? `${rol ? ETIQUETA_ROL[rol] : "Su rol"} solo observa: emite el programa.`
            : periodos?.completa && pendientes === 0
              ? "Todo listo. Revisamos las condiciones antes de generar el Excel."
              : "Se habilita cuando todos los periodos están cerrados y los archivos del CNA, listos. Al pulsar vemos qué falta."}
        </p>
      </div>
    </>
  );
}
