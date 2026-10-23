/* =============================================================================
   UDrive · el dibujo de un mapa de OpenStreetMap, el mismo en el editor, el
   PDF y el panel de propiedades.

   Teselas estándar de OSM como <img> en una rejilla de porcentajes (así el
   paginado espera a que carguen, como con cualquier imagen) y los marcadores
   encima. Todo se mide sobre un lienzo lógico de 640 × 360 y se escala con el
   ancho del bloque; los textos usan unidades de contenedor (cqw) para escalar
   con él. La atribución a OpenStreetMap va siempre visible.
   ========================================================================== */

import type { MouseEvent } from "react";
import type { Marcador } from "../lib/documento";
import { ALTO_MAPA, ANCHO_MAPA, ATRIBUCION, puntoEnMapa, teselasVisibles } from "../lib/mapa";

export interface PropsMapa {
  lat: number;
  lng: number;
  zoom: number;
  marcadores: readonly Marcador[];
  /** Descripción para quien no ve el mapa. */
  alt: string;
  /** Si se da, el mapa responde al clic con el punto del lienzo lógico (0–640, 0–360). */
  alElegir?: (x: number, y: number) => void;
}

const pct = (v: number, total: number): string => `${(v / total) * 100}%`;

export function MapaOsm({ lat, lng, zoom, marcadores, alt, alElegir }: PropsMapa) {
  const teselas = teselasVisibles(lat, lng, zoom);
  const alClic = alElegir
    ? (e: MouseEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width > 0) alElegir(((e.clientX - r.left) / r.width) * ANCHO_MAPA, ((e.clientY - r.top) / r.height) * ALTO_MAPA);
      }
    : undefined;
  return (
    <div className="ud-pdf-mapa" role="img" aria-label={alt || "Mapa de OpenStreetMap"} data-clic={alElegir ? "true" : undefined} onClick={alClic}>
      {teselas.map((t) => (
        <img
          key={t.url + t.x + t.y}
          src={t.url}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          style={{ left: pct(t.x, ANCHO_MAPA), top: pct(t.y, ALTO_MAPA), width: pct(256, ANCHO_MAPA), height: pct(256, ALTO_MAPA) }}
        />
      ))}
      {marcadores.map((m) => {
        const p = puntoEnMapa(m.lat, m.lng, { lat, lng, zoom });
        if (p.x < -40 || p.x > ANCHO_MAPA + 40 || p.y < -20 || p.y > ALTO_MAPA + 60) return null;
        return (
          <div key={m.id} className="ud-pdf-mapa-m" style={{ left: pct(p.x, ANCHO_MAPA), top: pct(p.y, ALTO_MAPA) }}>
            <svg viewBox="0 0 24 32" aria-hidden="true">
              <path d="M12 31C12 31 2 19.5 2 12a10 10 0 0120 0c0 7.5-10 19-10 19z" fill="#c0392b" stroke="#fff" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" fill="#fff" />
            </svg>
            {m.etiqueta.trim() ? <span>{m.etiqueta}</span> : null}
          </div>
        );
      })}
      <span className="ud-pdf-mapa-atr">{ATRIBUCION}</span>
    </div>
  );
}
