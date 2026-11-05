/* =============================================================================
   conv-firma · código QR como SVG (vectorial, nítido al imprimir).
   Librería: qrcode-generator 2.0.4 (JavaScript puro, sin dependencias; funciona en Deno).
   ========================================================================== */

import qrcode from "npm:qrcode-generator@2.0.4";

/** SVG escalable del QR de `texto` (solo ASCII: es una URL). Corrección de errores M. Sin zona de silencio (la pone el CSS). */
export function qrSvg(texto: string): string {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    let inicio = -1;
    for (let c = 0; c <= n; c++) {
      const oscuro = c < n && q.isDark(r, c);
      if (oscuro && inicio < 0) inicio = c;
      if (!oscuro && inicio >= 0) {
        d += `M${inicio} ${r}h${c - inicio}v1h-${c - inicio}z`;
        inicio = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
