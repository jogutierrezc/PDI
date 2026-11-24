/* =============================================================================
   UDrive · citas y referencias en estilo APA 7 (en español), sin React.

   Una fuente se escribe una vez (documento.fuentes) y se cita en el texto con
   {{cita:id}}. La cita en el texto sale como «(Pérez, 2021)», «(Pérez y Gómez,
   2021, p. 12)» o «(Pérez et al., 2021)»; la lista de referencias se ordena
   por autor y año, con el título en cursiva donde APA lo pide. Los autores se
   escriben uno por línea (o separados por «;») como «Apellido, I.»; una
   entidad se escribe completa y cuenta como un solo autor.
   ========================================================================== */

import type { Fuente } from "./documento";
import { enlaceSeguro, escapar } from "./texto";

/** Cada autor en una línea (o separado por «;»). */
export function listaDeAutores(autores: string): string[] {
  return autores
    .split(/[\n;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** El apellido (o la entidad) para citar en el texto. */
const apellido = (autor: string): string => (autor.includes(",") ? autor.split(",")[0].trim() : autor);

const unir = (partes: readonly string[]): string => (partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);

/** «(Pérez, 2021)» o «(Pérez et al., 2021, p. 12)». Sin autor, el título abreviado. */
export function citaEnTexto(f: Fuente, extra = ""): string {
  const autores = listaDeAutores(f.autores).map(apellido);
  const quien = autores.length === 0 ? `«${f.titulo.slice(0, 40).trim()}${f.titulo.length > 40 ? "…" : ""}»` : autores.length === 1 ? autores[0] : autores.length === 2 ? `${autores[0]} y ${autores[1]}` : `${autores[0]} et al.`;
  const anio = f.anio.trim() || "s. f.";
  return `(${quien}, ${anio}${extra.trim() ? `, ${extra.trim()}` : ""})`;
}

/** La referencia completa con marcas de cursiva (*…*) para pasar por `tramos`. */
export function referenciaApa(f: Fuente): string {
  const autores = unir(listaDeAutores(f.autores));
  const anio = f.anio.trim() || "s. f.";
  const cabeza = `${autores ? `${escapar(autores)} ` : ""}(${escapar(anio)}).`;
  const punto = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);
  const titulo = escapar(f.titulo.trim());
  const origen = escapar(f.origen.trim());
  let cuerpo = "";
  switch (f.tipo) {
    case "libro":
      cuerpo = [titulo && `*${punto(titulo)}*`, origen && punto(origen)].filter(Boolean).join(" ");
      break;
    case "articulo": {
      const vol = f.volumen.trim() ? `, *${escapar(f.volumen.trim())}*` : "";
      const pag = f.paginas.trim() ? `, ${escapar(f.paginas.trim())}` : "";
      cuerpo = [titulo && punto(titulo), origen && `*${origen}*${vol}${pag}.`].filter(Boolean).join(" ");
      break;
    }
    case "informe":
      cuerpo = [titulo && `*${punto(titulo)}*`, origen && punto(origen)].filter(Boolean).join(" ");
      break;
    default:
      cuerpo = [titulo && `*${punto(titulo)}*`, origen && punto(origen)].filter(Boolean).join(" ");
  }
  const url = f.url.trim();
  const enlace = url ? (enlaceSeguro(url) ? `[${escapar(url)}](${url})` : escapar(url)) : "";
  return [cabeza, cuerpo, enlace].filter(Boolean).join(" ");
}

/** Las fuentes por orden alfabético de autor, luego año y título. */
export function ordenarFuentes(fuentes: readonly Fuente[]): Fuente[] {
  const clave = (f: Fuente) => `${(listaDeAutores(f.autores)[0] ?? f.titulo).toLowerCase()}|${f.anio}|${f.titulo.toLowerCase()}`;
  return fuentes.slice().sort((a, b) => clave(a).localeCompare(clave(b), "es"));
}

export function fuenteNueva(id: string): Fuente {
  return { id, tipo: "libro", autores: "", anio: "", titulo: "", origen: "", volumen: "", paginas: "", url: "" };
}

/** ¿Está lo mínimo para que la referencia tenga sentido? Vacío si sí. */
export function falta(f: Fuente): string {
  if (!f.titulo.trim()) return "Falta el título.";
  if (!f.autores.trim() && !f.origen.trim()) return "Falta el autor o la entidad.";
  return "";
}
