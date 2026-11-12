/* Alineación estratégica (sección «pdi»): se elige un pilar del Plan de Desarrollo y se
   redacta lo que la oficina aporta a ese pilar, con las acciones que se articulan con él y,
   en cada acción, tablas o gráficas de apoyo (los mismos bloques de las secciones libres).
   Maestro-detalle: la lista de pilares a un lado, el pilar elegido al otro. */

import { useEffect, useState } from "react";
import type { CifraVista } from "../cifras-vivas";
import { ETIQUETA_ESTADO, accionTieneContenido, accionVacia, aporteTieneContenido, aporteVacio, conAlineacion, estadoDePilar, moverAccion, normalizarAlineacion, textoAnterior } from "../alineacion";
import type { EstadoPilar } from "../alineacion";
import type { Resolver } from "../tokens";
import type { AccionDePilar, AporteAPilar, ContenidoSeccion, PilarRef } from "../types";
import { BloquesLibres } from "./BloquesLibres";
import { CampoTexto } from "./Texto";

const GLIFO: Record<EstadoPilar, string> = { "sin-incluir": "–", vacio: "○", corto: "◐", listo: "✓" };
const TONO: Record<EstadoPilar, string> = { "sin-incluir": "", vacio: "is-mid", corto: "is-mid", listo: "is-ok" };

export function Alineacion({
  pilares,
  c,
  cambiar,
  editable,
  cifras,
  resolver,
}: {
  pilares: PilarRef[];
  c: ContenidoSeccion;
  cambiar: (c: ContenidoSeccion) => void;
  editable: boolean;
  cifras: CifraVista[];
  resolver: Resolver;
}) {
  const aportes = normalizarAlineacion(c);
  const anterior = textoAnterior(c);
  // Pilares guardados cuyo id ya no existe en el Plan: se muestran igual para no perder su contenido.
  const huerfanos = aportes.filter((a) => !pilares.some((p) => p.id === a.pilar));
  const lista: PilarRef[] = [...pilares, ...huerfanos.map((a) => ({ id: a.pilar, numeral: "?", name: "Pilar que ya no está en el Plan", progress: null }))];
  const [elegido, setElegido] = useState<string>(() => aportes[0]?.pilar ?? lista[0]?.id ?? "");
  useEffect(() => {
    if (!lista.some((p) => p.id === elegido) && lista[0]) setElegido(lista[0].id);
  }, [lista.length, elegido]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lista.length) return <p className="inf-muted">No se pudieron leer los pilares del Plan de Desarrollo.</p>;

  const pilar = lista.find((p) => p.id === elegido) ?? lista[0];
  const aporte = aportes.find((a) => a.pilar === pilar.id);
  const guardar = (n: AporteAPilar[]) => cambiar(conAlineacion(c, n));
  const poner = (a: AporteAPilar) => guardar(aportes.map((x) => (x.pilar === a.pilar ? a : x)));
  const incluir = () => guardar([...aportes, aporteVacio(pilar.id)]);
  const quitar = () => {
    if (aporte && aporteTieneContenido(aporte) && !window.confirm(`Se borrará el aporte al pilar ${pilar.numeral} con sus acciones, tablas y gráficas. ¿Continuar?`)) return;
    guardar(aportes.filter((x) => x.pilar !== pilar.id));
  };

  const copiarAnterior = () => {
    if (!aporte) return;
    poner({ ...aporte, aporte: aporte.aporte.trim() ? `${aporte.aporte.trim()}\n\n${anterior}` : anterior });
  };
  const quitarAnterior = () => {
    if (!window.confirm("Se borrará el texto de la versión anterior. ¿Continuar?")) return;
    cambiar({ ...c, texto: "" });
  };

  const incluidos = aportes.length;

  return (
    <div className="inf-ali">
      <nav className="inf-ali__lista" aria-label="Pilares del Plan de Desarrollo">
        <p className="inf-ali__res" aria-live="polite">
          {incluidos === 0 ? "Ningún pilar con aporte" : `${incluidos} de ${lista.length} ${lista.length === 1 ? "pilar" : "pilares"} con aporte`}
        </p>
        <ul>
          {lista.map((p) => {
            const e = estadoDePilar(aportes.find((a) => a.pilar === p.id));
            const on = p.id === pilar.id;
            return (
              <li key={p.id}>
                <button type="button" className={`inf-ali__pilar${on ? " is-on" : ""}`} aria-current={on ? "true" : undefined} onClick={() => setElegido(p.id)}>
                  <span className="inf-ali__num">{p.numeral}</span>
                  <span className="inf-ali__nom">{p.name}</span>
                  <span className={`inf-pill ${TONO[e]}`}>
                    <span aria-hidden="true">{GLIFO[e]}</span> {ETIQUETA_ESTADO[e]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="inf-ali__det" aria-label={`Aporte al pilar ${pilar.numeral}`}>
        <header className="inf-ali__cab">
          <div>
            <span className="inf-eyebrow">Pilar {pilar.numeral}</span>
            <h3>{pilar.name}</h3>
            {pilar.progress !== null && <span className="inf-src">Avance del pilar en el Plan: {pilar.progress} %</span>}
          </div>
          {editable && aporte && (
            <button type="button" className="inf-btn inf-btn--sm" onClick={quitar}>
              Quitar este aporte
            </button>
          )}
        </header>

        {anterior && (
          <div className="inf-ali__ant">
            <span className="inf-eyebrow">Texto anterior de la sección</span>
            <p>{anterior}</p>
            {editable && (
              <div className="inf-row">
                <button type="button" className="inf-btn inf-btn--sm" onClick={copiarAnterior} disabled={!aporte}>
                  Copiar al aporte de este pilar
                </button>
                <button type="button" className="inf-link" onClick={quitarAnterior}>
                  Quitar texto anterior
                </button>
                {!aporte && <span className="inf-hint">Primero redacte un aporte a este pilar.</span>}
              </div>
            )}
          </div>
        )}

        {!aporte ? (
          <div className="inf-ali__vacio">
            <p className="inf-muted">{editable ? "La oficina aún no aporta a este pilar en este informe." : "La oficina no registró aporte a este pilar."}</p>
            {editable && (
              <button type="button" className="inf-btn inf-btn--pri" onClick={incluir}>
                Redactar aporte a este pilar
              </button>
            )}
          </div>
        ) : (
          <DetalleAporte key={pilar.id} a={aporte} poner={poner} editable={editable} cifras={cifras} resolver={resolver} numeral={pilar.numeral} />
        )}
      </section>
    </div>
  );
}

function DetalleAporte({ a, poner, editable, cifras, resolver, numeral }: { a: AporteAPilar; poner: (a: AporteAPilar) => void; editable: boolean; cifras: CifraVista[]; resolver: Resolver; numeral: string }) {
  const ponerAccion = (i: number, x: AccionDePilar) => poner({ ...a, acciones: a.acciones.map((y, k) => (k === i ? x : y)) });
  const quitarAccion = (i: number) => {
    if (accionTieneContenido(a.acciones[i]) && !window.confirm("Esta acción tiene contenido y se borrará con sus tablas y gráficas. ¿Continuar?")) return;
    poner({ ...a, acciones: a.acciones.filter((_, k) => k !== i) });
  };
  return (
    <>
      <div className="inf-blk">
        <CampoTexto
          etiqueta={`Aporte de la oficina al pilar ${numeral}`}
          valor={a.aporte}
          onChange={(t) => poner({ ...a, aporte: t })}
          cifras={cifras}
          resolver={resolver}
          editable={editable}
          minimo={10}
          placeholder="Cuente qué aporta su oficina a este pilar y con qué resultados…"
        />
      </div>

      <div className="inf-blk">
        <h4 className="inf-ali__sub">Acciones articuladas con este pilar</h4>
        {a.acciones.length === 0 && <p className="inf-muted">{editable ? "Aún no hay acciones. Agregue una para describirla y apoyarla con tablas o gráficas." : "Sin acciones registradas."}</p>}
        <ol className="inf-ali__acciones">
          {a.acciones.map((x, i) => (
            <li key={x.id} className="inf-ali__accion">
              <div className="inf-ali__acc-cab">
                <b className="inf-ali__acc-n">Acción {i + 1}</b>
                {editable && (
                  <div className="inf-row">
                    <button type="button" className="inf-link" onClick={() => poner({ ...a, acciones: moverAccion(a.acciones, i, -1) })} disabled={i === 0}>
                      Subir
                    </button>
                    <button type="button" className="inf-link" onClick={() => poner({ ...a, acciones: moverAccion(a.acciones, i, 1) })} disabled={i === a.acciones.length - 1}>
                      Bajar
                    </button>
                    <button type="button" className="inf-link" onClick={() => quitarAccion(i)}>
                      Quitar acción
                    </button>
                  </div>
                )}
              </div>
              {editable ? (
                <>
                  <label className="inf-ali__campo">
                    <span>Título de la acción</span>
                    <input className="inf-in" value={x.titulo} onChange={(e) => ponerAccion(i, { ...x, titulo: e.target.value })} placeholder="Nombre corto de la acción" />
                  </label>
                  <label className="inf-ali__campo">
                    <span>Descripción corta</span>
                    <textarea className="inf-in" rows={2} value={x.descripcion} onChange={(e) => ponerAccion(i, { ...x, descripcion: e.target.value })} placeholder="Qué se hizo y qué resultó" />
                  </label>
                </>
              ) : (
                <div>
                  <h5 className="inf-ali__acc-t">{x.titulo || "Acción sin título"}</h5>
                  {x.descripcion && <p>{x.descripcion}</p>}
                </div>
              )}
              <BloquesLibres bloques={x.bloques} editable={editable} cambiar={(bloques) => ponerAccion(i, { ...x, bloques })} cifras={cifras} resolver={resolver} />
            </li>
          ))}
        </ol>
        {editable && (
          <div className="inf-row">
            <button type="button" className="inf-btn inf-btn--sm" onClick={() => poner({ ...a, acciones: [...a.acciones, accionVacia()] })}>
              + Agregar una acción
            </button>
          </div>
        )}
      </div>
    </>
  );
}
