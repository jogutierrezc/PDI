/* =============================================================================
   UDrive · comparar dos versiones de un documento, sin React.

   Se compara por id de bloque: qué bloques se agregaron, cuáles se quitaron,
   cuáles cambiaron de contenido y cuáles solo cambiaron de lugar. También el
   cambio de portada, índices y fuentes. Es una lista legible, no un diff de
   texto: el texto de un párrafo cambiado se muestra entero, de entonces y de ahora.
   ========================================================================== */

import { NOMBRE_BLOQUE } from "./documento";
import type { Bloque, Documento } from "./documento";
import { aPlano } from "./texto";

export type TipoCambio = "agregado" | "quitado" | "cambiado" | "movido" | "documento";

export interface Cambio {
  tipo: TipoCambio;
  bloqueId: string | null;
  /** «Párrafo», «Gráfica»… */
  clase: string;
  /** Lo que tenía (en una línea, recortado). */
  antes: string;
  despues: string;
}

const recorte = (t: string, n = 140): string => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);

/** Una línea que describe el bloque, para la lista de cambios. */
export function resumenDeBloque(b: Bloque): string {
  switch (b.tipo) {
    case "capitulo":
      return recorte(b.titulo || "(sin título)");
    case "parrafo":
    case "destacado":
    case "nota":
      return recorte(aPlano(b.texto) || "(vacío)");
    case "lista":
      return recorte(b.items.map((i) => aPlano(i)).join(" · ") || "(vacía)");
    case "tabla":
    case "grafica":
    case "imagen":
    case "mapa":
      return recorte(b.titulo || "(sin título propio)");
    case "referencias":
      return b.titulo;
    default:
      return "";
  }
}

export function compararDocumentos(antes: Documento, despues: Documento): Cambio[] {
  const cambios: Cambio[] = [];
  const a = new Map(antes.bloques.map((b, i) => [b.id, { b, i }]));
  const d = new Map(despues.bloques.map((b, i) => [b.id, { b, i }]));
  for (const [id, { b }] of a) if (!d.has(id)) cambios.push({ tipo: "quitado", bloqueId: id, clase: NOMBRE_BLOQUE[b.tipo], antes: resumenDeBloque(b), despues: "" });
  const comunesAntes = antes.bloques.filter((x) => d.has(x.id)).map((x) => x.id);
  const comunesDespues = despues.bloques.filter((x) => a.has(x.id)).map((x) => x.id);
  for (const [id, { b }] of d) {
    const previo = a.get(id);
    if (!previo) {
      cambios.push({ tipo: "agregado", bloqueId: id, clase: NOMBRE_BLOQUE[b.tipo], antes: "", despues: resumenDeBloque(b) });
    } else if (JSON.stringify(previo.b) !== JSON.stringify(b)) {
      cambios.push({ tipo: "cambiado", bloqueId: id, clase: NOMBRE_BLOQUE[b.tipo], antes: resumenDeBloque(previo.b), despues: resumenDeBloque(b) });
    } else if (comunesAntes.indexOf(id) !== comunesDespues.indexOf(id)) {
      // «Movido» solo si cambió su orden entre los bloques que siguen en ambas versiones.
      cambios.push({ tipo: "movido", bloqueId: id, clase: NOMBRE_BLOQUE[b.tipo], antes: "", despues: resumenDeBloque(b) });
    }
  }
  if (JSON.stringify(antes.portada) !== JSON.stringify(despues.portada)) cambios.push({ tipo: "documento", bloqueId: null, clase: "Portada", antes: antes.portada.titulo, despues: despues.portada.titulo });
  if (JSON.stringify(antes.indices) !== JSON.stringify(despues.indices)) cambios.push({ tipo: "documento", bloqueId: null, clase: "Índices", antes: "", despues: "" });
  if (JSON.stringify(antes.fuentes) !== JSON.stringify(despues.fuentes)) cambios.push({ tipo: "documento", bloqueId: null, clase: "Fuentes de las citas", antes: `${antes.fuentes.length}`, despues: `${despues.fuentes.length}` });
  return cambios;
}

export const ETIQUETA_CAMBIO: Record<TipoCambio, string> = { agregado: "Agregado", quitado: "Quitado", cambiado: "Cambiado", movido: "Movido", documento: "Cambió" };
