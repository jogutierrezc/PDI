/* =============================================================================
   Planeación y Seguimiento · Fase 3 · paso «Plan de Desarrollo Institucional» del formulario de actividad.
   Obligatorio al crear: «Esta actividad se conecta con el PDI» (pilares → líneas de acción, varios, con buscador)
   o «No tiene conexión con el PDI». Todo con teclado y toque; nada se arrastra. Hasta 12 elementos.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { PilarCatalogo, SeleccionPdi } from "./modeloF3";
import { MAX_ITEMS_PDI } from "./modeloF3";
import { alternarItem, claveItem, filtrarCatalogo, rotuloItem } from "./pdi";

export function SelectorPdi({ valor, onCambio, catalogo, cargando, error, errorBuscar, editandoSinDefinir, alSalir }: { valor: SeleccionPdi; onCambio: (v: SeleccionPdi) => void; catalogo: readonly PilarCatalogo[]; cargando?: boolean; error?: string | null; errorBuscar?: string | null; editandoSinDefinir?: boolean; alSalir?: () => void }) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => filtrarCatalogo(catalogo, q), [catalogo, q]);
  const elegido = (i: { pillarId: string; lineaId: string | null }) => valor.items.some((x) => claveItem(x) === claveItem(i));
  const lleno = valor.items.length >= MAX_ITEMS_PDI;
  const poner = (i: { pillarId: string; lineaId: string | null }) => onCambio(alternarItem(valor, i));
  const nLineasDelPilar = (p: PilarCatalogo) => valor.items.filter((i) => i.pillarId === p.pillarId).length;

  return (
    <div className="ps-pdi-sel">
      <fieldset className="ps-radios" id="pdi-conexion" tabIndex={-1} aria-describedby={error ? "pdi-conexion-error" : undefined} onBlur={alSalir}>
        <legend>¿Esta actividad se relaciona con el Plan de Desarrollo Institucional? <span className="ps-oblig">(obligatorio)</span></legend>
        <label className="ps-opcion ps-opcion--grande ps-opcion--tarjeta">
          <input type="radio" name="pdi-conexion" checked={valor.conexion === "con_pdi"} onChange={() => onCambio({ conexion: "con_pdi", items: valor.items })} />
          <span><strong>Esta actividad se conecta con el PDI</strong><small>Elija uno o varios pilares o líneas de acción.</small></span>
        </label>
        <label className="ps-opcion ps-opcion--grande ps-opcion--tarjeta">
          <input type="radio" name="pdi-conexion" checked={valor.conexion === "sin_pdi"} onChange={() => onCambio({ conexion: "sin_pdi", items: [] })} />
          <span><strong>No tiene conexión con el PDI</strong><small>Es una actividad de la operación de la oficina.</small></span>
        </label>
      </fieldset>
      {editandoSinDefinir && valor.conexion === "sin_definir" ? <p className="ps-nota"><Icon name="info" size={13} /> Esta actividad es anterior a este dato y está «sin definir». Puede dejarla así o elegir una de las dos opciones.</p> : null}
      {error ? <p className="ps-campo__error" id="pdi-conexion-error"><Icon name="alert" size={14} /> {error}</p> : null}

      {valor.conexion === "con_pdi" ? (
        <div className="ps-pdi-cuerpo">
          <div className="ps-campo" data-error={errorBuscar ? "true" : undefined}>
            <label htmlFor="pdi-buscar">Buscar un pilar o una línea de acción</label>
            <div className="ps-buscar"><Icon name="search" size={15} /><input id="pdi-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Por ejemplo: ciberseguridad, LA-2.1" autoComplete="off" aria-describedby={errorBuscar ? "pdi-buscar-error" : "pdi-contador"} aria-invalid={Boolean(errorBuscar)} /></div>
            {errorBuscar ? <p className="ps-campo__error" id="pdi-buscar-error"><Icon name="alert" size={14} /> {errorBuscar}</p> : null}
          </div>
          <p className="ps-nota" id="pdi-contador" role="status" aria-live="polite">{valor.items.length} de {MAX_ITEMS_PDI} elegidos{lleno ? ": ya no caben más; quite alguno para cambiar" : ""}.</p>
          {valor.items.length ? (
            <ul className="ps-pdi-elegidos" aria-label="Lo que eligió">
              {valor.items.map((i) => {
                const r = rotuloItem(catalogo, i);
                return <li key={claveItem(i)}><span><strong>{r.linea ?? "Pilar completo"}</strong><em>{r.pilar}</em></span><button type="button" className="ps-pdi-quitar" onClick={() => poner(i)} aria-label={`Quitar ${r.linea ?? r.pilar}`}><Icon name="close" size={13} /> Quitar</button></li>;
              })}
            </ul>
          ) : null}
          {cargando ? <p className="ps-nota">Cargando el catálogo del PDI…</p> : null}
          {!cargando && catalogo.length === 0 ? <p className="ps-aviso ps-aviso--info"><Icon name="info" size={16} /> <span>El catálogo del PDI no está disponible. Puede declarar la actividad sin conexión y definirla después.</span></p> : null}
          {!cargando && catalogo.length > 0 && visibles.length === 0 ? <p className="ps-nota">Nada coincide con «{q}». Pruebe con otra palabra o con el código de la línea.</p> : null}
          <div className="ps-pdi-catalogo">
            {visibles.map((p) => (
              <details key={p.pillarId} className="ps-pdi-pilar" open={Boolean(q) || nLineasDelPilar(p) > 0 || undefined}>
                <summary><span><b>{p.codigo}</b> {p.nombre}</span>{nLineasDelPilar(p) ? <span className="ps-estado" data-tono="ok"><Icon name="check" size={12} />{nLineasDelPilar(p)} elegido{nLineasDelPilar(p) === 1 ? "" : "s"}</span> : null}</summary>
                <div className="ps-pdi-pilar__cuerpo">
                  <label className="ps-opcion ps-pdi-opcion">
                    <input type="checkbox" checked={elegido({ pillarId: p.pillarId, lineaId: null })} disabled={lleno && !elegido({ pillarId: p.pillarId, lineaId: null })} onChange={() => poner({ pillarId: p.pillarId, lineaId: null })} />
                    <span><strong>Todo el pilar {p.codigo}</strong><small>La actividad se conecta con el pilar, sin una línea concreta.</small></span>
                  </label>
                  {p.areas.map((a) => (
                    <fieldset key={a.areaId} className="ps-pdi-area">
                      <legend>{a.codigo} · {a.nombre}</legend>
                      {a.lineas.map((l) => {
                        const i = { pillarId: p.pillarId, lineaId: l.lineaId };
                        return (
                          <label key={l.lineaId} className="ps-opcion ps-pdi-opcion">
                            <input type="checkbox" checked={elegido(i)} disabled={lleno && !elegido(i)} onChange={() => poner(i)} />
                            <span><strong>{l.codigo}</strong> {l.nombre}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
