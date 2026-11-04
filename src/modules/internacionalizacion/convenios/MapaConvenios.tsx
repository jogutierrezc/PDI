/* =============================================================================
   Convenios · mapa del mundo por país. Usa las siluetas de «UDES en cifras»
   (datos-abiertos/data/world-map): no se copian. Escala de 5 tonos, campus
   marcado, zoom y arrastre. El clic en un país lo elige; la lista «Países con
   más convenios» del panel es la alternativa por teclado.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as PEvent } from "react";
import gsap from "gsap";
import { Icon } from "../../../components/ui/Icon";
import { COUNTRIES, WORLD_CAMPUS_POINTS, WORLD_HEIGHT, WORLD_WIDTH } from "../../datos-abiertos/data/world-map";
import { movimientoReducido } from "../ui/movimiento";
import { ESCALA, tonoDe } from "./logica";
import type { GrupoPais } from "./logica";

type Caja = [number, number, number, number];
const TODO: Caja = [0, 0, WORLD_WIDTH, WORLD_HEIGHT];
const CAMPUS = WORLD_CAMPUS_POINTS.bucaramanga ?? [297.4, 229.8];

export function MapaConvenios({ grupos, seleccion, onSeleccion, variosPaises }: { grupos: Map<string, GrupoPais>; seleccion: string | null; onSeleccion: (cod: string | null) => void; variosPaises: number }) {
  const [caja, setCaja] = useState<Caja>(TODO);
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);
  const envoltura = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const arrastre = useRef<{ x: number; y: number; caja: Caja; movido: boolean } | null>(null);
  const vivo = useRef<Caja>(TODO);
  vivo.current = caja;

  const zoom = (f: number) => {
    const [x, y, w] = vivo.current;
    const h = (w * WORLD_HEIGHT) / WORLD_WIDTH;
    let nw = f ? w / f : WORLD_WIDTH;
    nw = Math.min(WORLD_WIDTH, Math.max(WORLD_WIDTH / 6, nw));
    const nh = (nw * WORLD_HEIGHT) / WORLD_WIDTH;
    const nx = f ? Math.min(Math.max(x + (w - nw) / 2, 0), WORLD_WIDTH - nw) : 0;
    const ny = f ? Math.min(Math.max(y + (h - nh) / 2, 0), WORLD_HEIGHT - nh) : 0;
    const destino: Caja = [nx, ny, nw, nh];
    const nodo = svg.current;
    if (!nodo || movimientoReducido()) {
      setCaja(destino);
      return;
    }
    const o = { x, y, w, h };
    gsap.to(o, {
      x: nx,
      y: ny,
      w: nw,
      h: nh,
      duration: 0.3,
      ease: "expo.out",
      onUpdate: () => nodo.setAttribute("viewBox", `${o.x} ${o.y} ${o.w} ${o.h}`),
      onComplete: () => setCaja(destino),
    });
  };

  const alBajar = (e: PEvent<SVGSVGElement>) => {
    arrastre.current = { x: e.clientX, y: e.clientY, caja: vivo.current, movido: false };
  };
  const alMover = (e: PEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    const caja0 = envoltura.current?.getBoundingClientRect();
    if (caja0) {
      const el = (e.target as Element).closest("[data-c]");
      const cod = el?.getAttribute("data-c");
      const pais = cod ? COUNTRIES.find((c) => c.code === cod) : null;
      setTip(pais ? { x: Math.min(e.clientX - caja0.left + 12, caja0.width - 190), y: e.clientY - caja0.top + 14, texto: `${pais.name}: ${grupos.get(pais.code)?.n ?? 0} convenios` } : null);
    }
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.movido && Math.abs(dx) + Math.abs(dy) > 4) {
      a.movido = true;
      // El puntero se captura solo al arrastrar: así el clic simple sigue llegando al país.
      svg.current?.setPointerCapture(e.pointerId);
    }
    if (!a.movido || a.caja[2] >= WORLD_WIDTH - 1) return;
    const k = a.caja[2] / (svg.current?.getBoundingClientRect().width || 1);
    const nx = Math.min(Math.max(a.caja[0] - dx * k, 0), WORLD_WIDTH - a.caja[2]);
    const ny = Math.min(Math.max(a.caja[1] - dy * k, 0), WORLD_HEIGHT - a.caja[3]);
    setCaja([nx, ny, a.caja[2], a.caja[3]]);
  };
  const alSoltar = (e: PEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movido) return;
    const cod = (e.target as Element).closest("[data-c]")?.getAttribute("data-c");
    if (cod && grupos.has(cod)) onSeleccion(cod === seleccion ? null : cod);
  };

  const formas = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const g = grupos.get(c.code);
        const fill = g ? (tonoDe(g.n) ?? "#E4E8EC") : "#E4E8EC";
        const clase = `conv-pa${g ? " is-on" : ""}${seleccion === c.code ? " is-sel" : ""}`;
        if (c.d) {
          return (
            <path key={c.code} className={clase} data-c={c.code} d={c.d} fill={fill}>
              <title>{g ? `${c.name}: ${g.n}` : c.name}</title>
            </path>
          );
        }
        return g ? (
          <circle key={c.code} className={clase} data-c={c.code} cx={c.c[0]} cy={c.c[1]} r={3.2} fill={fill}>
            <title>{`${c.name}: ${g.n}`}</title>
          </circle>
        ) : null;
      }),
    [grupos, seleccion],
  );

  return (
    <div className="conv-mapa-caja">
      <div className="conv-mapa-cab">
        <div>
          <h2>Convenios por país</h2>
          <p className="conv-sub">
            {grupos.size} países con convenio. El color indica cuántos convenios hay.
            {variosPaises ? ` ${variosPaises} redes y convenios de varios países, o sin país, no se ubican en el mapa.` : ""}
          </p>
        </div>
        <div className="conv-zoom" role="group" aria-label="Zoom del mapa">
          <button type="button" className="conv-btn conv-btn--sm" aria-label="Acercar" onClick={() => zoom(1.6)}>
            <Icon name="plus" size={14} />
          </button>
          <button type="button" className="conv-btn conv-btn--sm" aria-label="Alejar" onClick={() => zoom(0.625)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          <button type="button" className="conv-btn conv-btn--sm" onClick={() => zoom(0)}>
            Todo el mundo
          </button>
        </div>
      </div>
      <div className="conv-mapa" ref={envoltura} onPointerLeave={() => setTip(null)}>
        <svg
          ref={svg}
          viewBox={caja.join(" ")}
          role="img"
          aria-label={`Mapa de convenios por país. ${grupos.size} países con convenio.`}
          className={caja[2] < WORLD_WIDTH - 1 ? "is-zoom" : undefined}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={() => (arrastre.current = null)}
        >
          {formas}
          <g className="conv-campus" aria-hidden="true">
            <circle cx={CAMPUS[0]} cy={CAMPUS[1]} r={5.5} />
            <circle cx={CAMPUS[0]} cy={CAMPUS[1]} r={1.8} />
          </g>
        </svg>
        {tip ? (
          <div className="conv-tip" style={{ left: tip.x, top: tip.y }}>
            {tip.texto}
          </div>
        ) : null}
      </div>
      <div className="conv-leyenda">
        {[...ESCALA].reverse().map((e) => (
          <span key={e.min}>
            <b style={{ background: e.color }} />
            {e.rotulo}
          </span>
        ))}
        <span>
          <b className="conv-anillo" />
          Campus UDES
        </span>
      </div>
    </div>
  );
}
