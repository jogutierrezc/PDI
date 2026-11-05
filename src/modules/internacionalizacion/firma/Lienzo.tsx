/* =============================================================================
   Firma de convenios · lienzo para firmar con el ratón, el dedo o un lápiz.

   Guarda los trazos como puntos normalizados (0 a 1) y los vuelve a dibujar si el recuadro cambia
   de tamaño (girar el teléfono no borra la firma). `exportar()` recorta el trazo y devuelve un PNG
   en data URL con un tamaño que el servidor acepta (24 a 2000 × 1000 px, hasta 400 KB).
   ========================================================================== */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export interface LienzoRef {
  borrar: () => void;
  exportar: () => string | null;
}

interface Props {
  alto: number | string;
  etiqueta: string;
  grosor?: number;
  /** Se llama cuando el recuadro pasa de vacío a con firma y al revés. */
  onCambio?: (conTrazo: boolean) => void;
  className?: string;
}

type Punto = [number, number];

export const Lienzo = forwardRef<LienzoRef, Props>(function Lienzo({ alto, etiqueta, grosor = 2.4, onCambio, className }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const trazos = useRef<Punto[][]>([]);
  const largo = useRef(0);
  const dibujando = useRef(false);
  const lleno = useRef(false);
  const cambio = useRef(onCambio);
  cambio.current = onCambio;

  const pintar = useCallback(() => {
    const c = cv.current;
    if (!c) return;
    const x = c.getContext("2d");
    if (!x) return;
    const r = window.devicePixelRatio || 1;
    const w = c.width / r;
    const h = c.height / r;
    x.setTransform(r, 0, 0, r, 0, 0);
    x.clearRect(0, 0, w, h);
    x.lineWidth = grosor;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.strokeStyle = "#12253A";
    for (const t of trazos.current) {
      if (t.length === 1) {
        x.beginPath();
        x.arc(t[0][0] * w, t[0][1] * h, grosor / 2, 0, Math.PI * 2);
        x.fillStyle = "#12253A";
        x.fill();
        continue;
      }
      x.beginPath();
      x.moveTo(t[0][0] * w, t[0][1] * h);
      for (let i = 1; i < t.length - 1; i++) {
        const mx = ((t[i][0] + t[i + 1][0]) / 2) * w;
        const my = ((t[i][1] + t[i + 1][1]) / 2) * h;
        x.quadraticCurveTo(t[i][0] * w, t[i][1] * h, mx, my);
      }
      const u = t[t.length - 1];
      x.lineTo(u[0] * w, u[1] * h);
      x.stroke();
    }
  }, [grosor]);

  const medir = useCallback(() => {
    const c = cv.current;
    if (!c) return;
    const r = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * r));
    const h = Math.max(1, Math.round(c.clientHeight * r));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    pintar();
  }, [pintar]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    medir();
    const o = new ResizeObserver(medir);
    o.observe(c);
    return () => o.disconnect();
  }, [medir]);

  const avisar = () => {
    const ahora = largo.current > 18;
    if (ahora !== lleno.current) {
      lleno.current = ahora;
      cambio.current?.(ahora);
    }
  };

  const punto = (e: React.PointerEvent<HTMLCanvasElement>): Punto => {
    const b = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))];
  };

  const abajo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    trazos.current.push([punto(e)]);
    pintar();
  };
  const mueve = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const t = trazos.current[trazos.current.length - 1];
    const p = punto(e);
    const a = t[t.length - 1];
    const b = e.currentTarget.getBoundingClientRect();
    largo.current += Math.hypot((p[0] - a[0]) * b.width, (p[1] - a[1]) * b.height);
    t.push(p);
    pintar();
    avisar();
  };
  const arriba = () => {
    dibujando.current = false;
    avisar();
  };

  useImperativeHandle(ref, () => ({
    borrar() {
      trazos.current = [];
      largo.current = 0;
      pintar();
      avisar();
    },
    exportar() {
      const c = cv.current;
      if (!c || largo.current <= 18) return null;
      const x = c.getContext("2d");
      if (!x) return null;
      const w = c.width;
      const h = c.height;
      const d = x.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (d[(j * w + i) * 4 + 3] > 10) {
            if (i < x0) x0 = i;
            if (i > x1) x1 = i;
            if (j < y0) y0 = j;
            if (j > y1) y1 = j;
          }
        }
      }
      if (x1 < x0) return null;
      const m = 8;
      let ancho = x1 - x0 + 1 + 2 * m;
      let altoPx = y1 - y0 + 1 + 2 * m;
      const f = Math.min(1, 1800 / ancho, 900 / altoPx);
      const o = document.createElement("canvas");
      o.width = Math.max(24, Math.round(ancho * f));
      o.height = Math.max(24, Math.round(altoPx * f));
      const ox = o.getContext("2d");
      if (!ox) return null;
      ox.drawImage(c, x0 - m, y0 - m, ancho, altoPx, 0, 0, o.width, o.height);
      ancho = o.width;
      altoPx = o.height;
      return o.toDataURL("image/png");
    },
  }));

  return (
    <canvas
      ref={cv}
      className={className}
      style={{ height: alto, touchAction: "none" }}
      role="img"
      aria-label={etiqueta}
      onPointerDown={abajo}
      onPointerMove={mueve}
      onPointerUp={arriba}
      onPointerCancel={arriba}
    />
  );
});
