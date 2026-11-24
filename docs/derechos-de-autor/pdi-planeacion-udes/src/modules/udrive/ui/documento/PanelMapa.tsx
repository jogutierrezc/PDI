/* =============================================================================
   UDrive · las propiedades del bloque «mapa».

   Buscar un lugar por nombre (Nominatim, de OpenStreetMap: una consulta cuando
   la persona pulsa «Buscar», nunca mientras escribe), centrar con un clic en la
   vista, ajustar el zoom y poner marcadores con rótulo. El mapa es el mismo
   dibujo del documento (salida/MapaOsm.tsx).
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { LIMITES, nuevoIdBloque } from "../../lib/documento";
import type { AnchoFigura, BMapa } from "../../lib/documento";
import { ZOOM_MAX, ZOOM_MIN, buscarLugar, limitar, puntoDesdeMapa, redondear } from "../../lib/mapa";
import type { Lugar } from "../../lib/mapa";
import { MapaOsm } from "../../salida/MapaOsm";

interface Props {
  b: BMapa;
  editable: boolean;
  anchos: { id: AnchoFigura; texto: string }[];
  poner(cambio: Partial<BMapa>, clave?: string): void;
}

export function PanelMapa({ b, editable, anchos, poner }: Props) {
  const [consulta, setConsulta] = useState("");
  const [lugares, setLugares] = useState<Lugar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const aborto = useRef<AbortController | null>(null);
  useEffect(() => () => aborto.current?.abort(), []);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (buscando || consulta.trim().length < 3) return;
    aborto.current?.abort();
    const ac = new AbortController();
    aborto.current = ac;
    setBuscando(true);
    setError("");
    buscarLugar(consulta, ac.signal)
      .then((r) => {
        setLugares(r);
        if (!r.length) setError("No se encontró ese lugar. Pruebe con otro nombre o con la ciudad.");
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setLugares(null);
        setError(err instanceof Error ? err.message : "No se pudo buscar el lugar.");
      })
      .finally(() => !ac.signal.aborted && setBuscando(false));
  };

  const centrar = (lat: number, lng: number, zoom?: number) => poner({ lat: redondear(lat), lng: redondear(lng), ...(zoom ? { zoom } : {}) });
  const marcar = (lat: number, lng: number, etiqueta = "") => {
    if (b.marcadores.length >= LIMITES.marcadores) return;
    poner({ marcadores: [...b.marcadores, { id: nuevoIdBloque(), lat: redondear(lat), lng: redondear(lng), etiqueta: etiqueta.split(",")[0].slice(0, 80) }] });
  };
  const ponerEtiqueta = (id: string, etiqueta: string) => poner({ marcadores: b.marcadores.map((m) => (m.id === id ? { ...m, etiqueta } : m)) }, `t:${b.id}:m:${id}`);
  const zoom = (z: number) => poner({ zoom: Math.round(limitar(z, ZOOM_MIN, ZOOM_MAX)) }, `p:${b.id}:zoom`);

  return (
    <>
      <form className="es-fl" onSubmit={buscar}>
        Buscar un lugar
        <div style={{ display: "flex", gap: 6 }}>
          <input type="search" className="es-inp" style={{ flex: 1 }} value={consulta} maxLength={200} disabled={!editable} placeholder="Ej.: Universidad de Santander, Cúcuta" onChange={(e) => setConsulta(e.target.value)} />
          <button type="submit" className="es-btn es-btn--sm" disabled={!editable || buscando || consulta.trim().length < 3}>{buscando ? "Buscando…" : "Buscar"}</button>
        </div>
      </form>
      <p className="es-note">La búsqueda usa datos de OpenStreetMap (Nominatim) y se hace solo al pulsar «Buscar».</p>
      {error ? <p className="ud-aviso" data-t="error" role="alert" style={{ margin: 0 }}>{error}</p> : null}
      {lugares?.length ? (
        <ul className="ud-lugares" aria-label="Resultados de la búsqueda" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {lugares.map((l, n) => (
            <li key={`${l.lat},${l.lng},${n}`} style={{ display: "grid", gap: 4 }}>
              <span className="es-note" style={{ margin: 0 }}>{l.nombre}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="es-btn es-btn--sm" disabled={!editable} onClick={() => centrar(l.lat, l.lng, Math.max(b.zoom, 14))}>Centrar aquí</button>
                <button type="button" className="es-btn es-btn--sm" disabled={!editable || b.marcadores.length >= LIMITES.marcadores} onClick={() => (centrar(l.lat, l.lng, Math.max(b.zoom, 14)), marcar(l.lat, l.lng, l.nombre))}>Centrar y marcar</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="es-fl">
        Vista del mapa
        <MapaOsm lat={b.lat} lng={b.lng} zoom={b.zoom} marcadores={b.marcadores} alt="Vista previa del mapa" alElegir={editable ? (x, y) => { const p = puntoDesdeMapa(x, y, b); centrar(p.lat, p.lng); } : undefined} />
        <span className="es-note">Haga clic en el mapa para centrarlo en ese punto.</span>
      </div>

      <label className="es-fl">
        Zoom: {b.zoom}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button type="button" className="es-btn es-btn--sm" aria-label="Alejar" disabled={!editable || b.zoom <= ZOOM_MIN} onClick={() => zoom(b.zoom - 1)}>−</button>
          <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={1} value={b.zoom} disabled={!editable} style={{ flex: 1 }} onChange={(e) => zoom(Number(e.target.value))} />
          <button type="button" className="es-btn es-btn--sm" aria-label="Acercar" disabled={!editable || b.zoom >= ZOOM_MAX} onClick={() => zoom(b.zoom + 1)}>+</button>
        </div>
      </label>

      <div className="es-fl">
        Marcadores ({b.marcadores.length})
        {b.marcadores.map((m, n) => (
          <div key={m.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" className="es-inp" style={{ flex: 1 }} value={m.etiqueta} maxLength={80} disabled={!editable} placeholder={`Marcador ${n + 1}`} aria-label={`Rótulo del marcador ${n + 1}`} onChange={(e) => ponerEtiqueta(m.id, e.target.value)} />
            <button type="button" className="es-btn es-btn--sm" disabled={!editable} title="Centrar el mapa en este marcador" aria-label={`Centrar en el marcador ${n + 1}`} onClick={() => centrar(m.lat, m.lng)}>
              <Icon name="external" size={14} />
            </button>
            <button type="button" className="es-btn es-btn--sm" disabled={!editable} aria-label={`Quitar el marcador ${n + 1}`} onClick={() => poner({ marcadores: b.marcadores.filter((x) => x.id !== m.id) })}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} disabled={!editable || b.marcadores.length >= LIMITES.marcadores} onClick={() => marcar(b.lat, b.lng)}>Agregar marcador en el centro</button>
      </div>

      <label className="es-fl">
        Título de la figura
        <input type="text" className="es-inp" value={b.titulo} maxLength={300} disabled={!editable} placeholder="Título del pie" onChange={(e) => poner({ titulo: e.target.value }, `t:${b.id}:titulo`)} />
      </label>
      <label className="es-fl">
        Nota o fuente
        <input type="text" className="es-inp" value={b.nota} maxLength={600} disabled={!editable} placeholder="Ej.: Elaboración propia con datos de OpenStreetMap" onChange={(e) => poner({ nota: e.target.value }, `t:${b.id}:nota`)} />
      </label>
      <label className="es-fl">
        Texto alternativo (para quien no ve el mapa)
        <input type="text" className="es-inp" value={b.alt} maxLength={300} disabled={!editable} onChange={(e) => poner({ alt: e.target.value }, `t:${b.id}:alt`)} />
      </label>
      <label className="es-fl">
        Ancho
        <select className="es-inp" value={b.ancho} disabled={!editable} onChange={(e) => poner({ ancho: e.target.value as AnchoFigura })}>
          {anchos.map((a) => <option key={a.id} value={a.id}>{a.texto}</option>)}
        </select>
      </label>
      <label className="es-ck"><input type="checkbox" checked={b.enIndice} disabled={!editable} onChange={(e) => poner({ enIndice: e.target.checked })} /> Aparece en el índice de ilustraciones</label>
    </>
  );
}
