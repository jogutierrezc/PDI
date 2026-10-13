/* =============================================================================
   UDES Sostenible · color y dibujo de cada ODS en los informes.

   - `odsTone(hex)`: el acento del ODS y sus variantes, como variables CSS:
       --ods / --o-acc   color oficial (rellenos, barras, anillos)
       --o-acc-deep      el mismo tono oscurecido con tinta hasta que el texto
                         pequeño cumple contraste AA sobre el fondo tintado
                         (el 7 amarillo y el 2 mostaza nunca van como texto puro)
       --o-acc-soft      fondo tintado muy claro (secciones, cápsulas)
       --o-acc-tint      tinte del encabezado (degradado radial)
       --o-acc-on        texto legible sobre el color oficial (blanco o tinta)
   - `OdsArtStrip`: la tira de los 17 colores del informe original, con la
     tarjeta del dibujo al pasar el cursor o enfocar (solo con hover fino).
   ========================================================================== */

import { useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ODS_LIST, ODS_ROUTES, odsArt } from "./ods-data";
import type { OdsEdition } from "./ods-data";

type Rgb = [number, number, number];

const INK: Rgb = [20, 35, 59];
const WHITE: Rgb = [255, 255, 255];

const rgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** `p` del color `a` y el resto de `b`. */
const mix = (a: Rgb, b: Rgb, p: number): Rgb => a.map((v, i) => v * p + b[i] * (1 - p)) as Rgb;
const lum = (c: Rgb) => {
  const ch = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Texto legible sobre el color oficial del ODS: blanco o tinta oscura. */
export function odsOn(hex: string): string {
  const c = rgb(hex);
  return contrast(c, WHITE) >= contrast(c, INK) ? "#fff" : "#14233b";
}

/** Variantes del color del ODS como variables CSS (ver el encabezado del archivo). */
export function odsTone(hex: string): CSSProperties {
  const c = rgb(hex);
  const soft = mix(c, WHITE, 0.1);
  /* La variante más viva que mantiene 4,6:1 sobre el fondo tintado. */
  let deep = c;
  for (let p = 1; p >= 0.3; p -= 0.05) {
    deep = mix(c, INK, p);
    if (contrast(deep, soft) >= 4.6) break;
  }
  return {
    "--ods": hex,
    "--o-acc": hex,
    "--o-acc-deep": toHex(deep),
    "--o-acc-soft": toHex(soft),
    "--o-acc-tint": toHex(mix(c, WHITE, 0.16)),
    "--o-acc-on": odsOn(hex),
  } as CSSProperties;
}

/* --- Tira de los 17 colores ------------------------------------------------------------------------ */

/**
 * Tira fina con los 17 colores oficiales que enlaza a cada informe. El activo es más ancho.
 * Con cursor (o al enfocar con teclado) se despliega una tarjeta con el dibujo y el nombre;
 * los dibujos se piden solo cuando el visitante se acerca a la tira.
 */
export function OdsArtStrip({ current, edition, label = "Los 17 informes ODS" }: { current: number; edition: OdsEdition; label?: string }) {
  const [armed, setArmed] = useState(false);
  const arm = () => setArmed(true);
  return (
    <nav className="ods-art-strip" aria-label={label} onPointerEnter={arm} onFocus={arm}>
      <ol>
        {ODS_LIST.map((x) => (
          <li key={x.n} style={{ "--c": x.color, "--c-on": odsOn(x.color) } as CSSProperties} className={x.n === current ? "is-on" : undefined}>
            <Link to={ODS_ROUTES.report(x.n, edition)} aria-current={x.n === current ? "page" : undefined} aria-label={`ODS ${x.n}: ${x.name}`}>
              <span className="ods-art-card" aria-hidden="true">
                <span className="ods-art-card__img">{armed && <img src={odsArt(x.n)} alt="" width={800} height={1085} decoding="async" />}</span>
                <b>ODS {x.n}</b>
                <span>{x.name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
