/* =============================================================================
   Programas en Cifras · el panel «Responde a» del editor.

   Une cada columna del archivo con la que pide un cuadro del CNA o una
   plantilla del SNIES (el mapa destino → columna). Muestra la cobertura en
   anillo, avisa cuando un valor no está en la lista del Ministerio o del CNA,
   deja ver cómo quedaría la salida y conecta o desconecta destinos. El mapa se
   edita aunque la estructura esté bloqueada; el cuadro de origen de un archivo
   del CNA no se desconecta.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useGuardarRespuesta, useQuitarRespuesta } from "../datos";
import { autoMap, avisosDeDominio, cobertura, destino as destinoDe, DESTINOS, nombreCorto, opcionesDe } from "../lib/destinos";
import { puedeDesconectar } from "../lib/permisos";
import type { ArchivoCompleto, DestinoLocal, PcMapa } from "../tipos";
import { Anillo } from "../../../components/espacio/piezas";
import { useEspacio } from "./contexto";
import type { FilaLocal } from "../../../components/espacio/tipos";
import { textoDeValor } from "../../../components/espacio/logica";

export function PanelRespuesta({ archivo, filas, editable }: { archivo: ArchivoCompleto; filas: readonly FilaLocal[]; editable: boolean }) {
  const { respuestas, pareja, rol, salud, decir } = useEspacio();
  const guardar = useGuardarRespuesta();
  const quitar = useQuitarRespuesta();
  const propias = useMemo(() => respuestas.filter((r) => r.archivo_id === archivo.id), [respuestas, archivo.id]);
  const [mapas, setMapas] = useState<Record<string, PcMapa>>({});
  const [salida, setSalida] = useState<Record<string, boolean>>({});
  // Lo que viene de la base manda; lo escrito aquí lo adelanta mientras llega.
  useEffect(() => setMapas({}), [propias]);
  const base = { archivo: archivo.id, programa: pareja.programa_id, campus: pareja.campus_id };

  const mapaDe = (id: string, original: PcMapa) => mapas[id] ?? original;

  const cambiar = (d: DestinoLocal, original: PcMapa, claveDestino: string, claveArchivo: string) => {
    const siguiente: PcMapa = { ...mapaDe(d.id, original) };
    if (claveArchivo) siguiente[claveDestino] = claveArchivo;
    else delete siguiente[claveDestino];
    setMapas((m) => ({ ...m, [d.id]: siguiente }));
    guardar.mutate({ ...base, destino: d.id, mapa: siguiente }, { onError: (e) => decir(e.message) });
  };

  const libres = DESTINOS.filter((d) => !d.automatico && (salud || !d.solo_salud) && !propias.some((r) => r.destino_id === d.id));
  const datos = useMemo(() => filas.map((f) => f.datos), [filas]);

  return (
    <>
      <div>
        <h3>Responde a</h3>
        <p className="es-sub">Une cada columna con la que pide el CNA o el SNIES. Con esto el archivo alimenta las salidas.</p>
      </div>
      {propias.length ? (
        propias.map((r) => {
          const d = destinoDe(r.destino_id);
          if (!d) return null;
          const mapa = mapaDe(d.id, r.mapa);
          const cv = cobertura(mapa, d, archivo.columnas);
          const avisos = avisosDeDominio(d, mapa, datos);
          const verSalida = salida[d.id];
          return (
            <div className="pc-tgt" key={d.id}>
              <header>
                <Anillo pct={cv.pct} size={34} etiqueta={`Cobertura de ${d.nombre}`} />
                <div>
                  <span className="es-tag" data-s={d.sistema}>
                    {d.sistema}
                  </span>
                  <b>{nombreCorto(d)}</b>
                  <span className="es-note es-num">
                    {cv.n} de {cv.t} columnas
                  </span>
                </div>
                {editable && puedeDesconectar(rol, archivo, d.id) ? (
                  <button type="button" className="es-mini" aria-label={`Desconectar ${nombreCorto(d)}`} onClick={() => quitar.mutate({ archivo: archivo.id, destino: d.id, programa: pareja.programa_id, campus: pareja.campus_id }, { onSuccess: () => decir("Desconectado."), onError: (e) => decir(e.message) })}>
                    <Icon name="close" size={14} />
                  </button>
                ) : null}
              </header>
              <div className="pc-map">
                {d.columnas.map((dc) => (
                  <MapaFila key={dc.clave} etiqueta={dc.etiqueta} valor={mapa[dc.clave] ?? ""} columnas={archivo.columnas} deshabilitado={!editable} onCambiar={(v) => cambiar(d, r.mapa, dc.clave, v)} />
                ))}
              </div>
              {avisos.length ? (
                <ul className="pc-issues">
                  {avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
              <div style={{ padding: "0 12px 12px" }}>
                <button type="button" className="es-btn es-btn--sm" aria-expanded={Boolean(verSalida)} onClick={() => setSalida((s) => ({ ...s, [d.id]: !s[d.id] }))}>
                  <Icon name="eye" size={16} />
                  {verSalida ? "Ocultar la salida" : "Ver la salida"}
                </button>
              </div>
              {verSalida ? <Salida destino={d} mapa={mapa} filas={datos} /> : null}
            </div>
          );
        })
      ) : (
        <p className="es-note">Este archivo todavía no responde a ningún cuadro. Conéctelo para que alimente el CNA o el SNIES.</p>
      )}
      {editable && libres.length ? (
        <label className="es-fl">
          Conectar a…
          <select
            value=""
            onChange={(e) => {
              const d = destinoDe(e.target.value);
              if (!d) return;
              guardar.mutate({ ...base, destino: d.id, mapa: autoMap(archivo.columnas, d) }, { onSuccess: () => decir("Conectado. Revise el emparejamiento."), onError: (er) => decir(er.message) });
            }}
          >
            <option value="">Elegir un destino</option>
            {libres.map((d) => (
              <option key={d.id} value={d.id}>
                {d.sistema} · {d.sistema === "CNA" ? d.nombre : nombreCorto(d)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

function MapaFila({ etiqueta, valor, columnas, deshabilitado, onCambiar }: { etiqueta: string; valor: string; columnas: ArchivoCompleto["columnas"]; deshabilitado: boolean; onCambiar: (v: string) => void }) {
  return (
    <>
      <span className="pc-tc">{etiqueta}</span>
      <span className="pc-ar" data-no={!valor} />
      <select aria-label={`Columna para ${etiqueta}`} value={valor} disabled={deshabilitado} onChange={(e) => onCambiar(e.target.value)}>
        <option value="">— sin columna —</option>
        {columnas.map((c) => (
          <option key={c.clave} value={c.clave}>
            {c.etiqueta}
          </option>
        ))}
      </select>
    </>
  );
}

/** Cómo quedarían las primeras filas en el cuadro: lo que no está en la lista del CNA o del SNIES se pinta en rojo. */
function Salida({ destino, mapa, filas }: { destino: DestinoLocal; mapa: PcMapa; filas: readonly Record<string, unknown>[] }) {
  return (
    <div className="pc-prevt">
      <table>
        <thead>
          <tr>
            {destino.columnas.map((c) => (
              <th key={c.clave}>{c.etiqueta}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, 4).map((f, i) => (
            <tr key={i}>
              {destino.columnas.map((c) => {
                const origen = mapa[c.clave];
                if (!origen) return <td className="pc-m" key={c.clave}>—</td>;
                const v = textoDeValor(f[origen]);
                const lista = opcionesDe(c);
                const mal = lista.length > 0 && v !== "" && !lista.includes(v);
                return (
                  <td key={c.clave} className={mal ? "pc-x" : undefined} title={mal ? `No está en la lista del ${destino.sistema}` : undefined}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
