/* =============================================================================
   Pilo at Work · red de seguridad de estilo para las respuestas del chat.

   La guía de estilo vive en el prompt (supabase/functions/pilo-work/index.ts, constante
   PERSONA). Esto solo corrige lo que un modelo pequeño deje pasar, sin cambiar el sentido:
     · quita emojis y pictogramas,
     · colapsa las reglas horizontales «---»,
     · quita los «#» de los encabezados cuando la respuesta es corta (< 120 palabras),
     · recorta cierres de relleno al final («¡Estoy listo!», «No dude en escribirme»).
   No toca bloques de código (```), código en línea, tablas, listas ni enlaces.
   ========================================================================== */

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}-\u{23FF}\u{FE0F}\u{200D}]/gu;
const CIERRE = /^[¡!\s]*(estoy listo|listo para|cualquier (duda|cosa|consulta)|no dude en|quedo (atento|atenta)|espero (haberle|que (le )?(sirva|haya))|si necesita algo más|estaré aquí|a su disposición|¿?en qué más (puedo|le puedo))/i;

export function limpiarRespuesta(entrada: string, final = true): string {
  // Se separa el texto en trozos de código (intactos) y texto (se limpia).
  const trozos = entrada.split(/(```[\s\S]*?(?:```|$))/g);
  const palabras = entrada.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  const corto = palabras < 120;
  const fuera = trozos.map((t, i) => {
    if (i % 2 === 1) return t; // dentro de ```
    return t
      .split(/(`[^`\n]*`)/g)
      .map((p, j) => {
        if (j % 2 === 1) return p; // código en línea
        let x = p.replace(EMOJI, "");
        x = x.replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, "");
        if (corto) x = x.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
        return x;
      })
      .join("");
  });
  let r = fuera.join("").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (final) {
    const partes = r.split(/\n{2,}/);
    while (partes.length > 1 && partes[partes.length - 1].length < 200 && CIERRE.test(partes[partes.length - 1]) && !/```/.test(partes[partes.length - 1])) partes.pop();
    r = partes.join("\n\n");
  }
  return r;
}
