/* =============================================================================
   Encuestas con Pilo · los textos de un logro o un reto.

   Cada subpaso del bloque (título, descripción, cifras) tiene lo que Pilo dice
   y lo que se lee en pantalla. Quien edita la encuesta puede cambiar cada texto
   por separado para el logro y para el reto; lo que deja vacío usa el de aquí.
   ========================================================================== */

import { CLAVES_TEXTO_APORTE } from "./estructura";
import type { ClaveTextoAporte, Pregunta, TextosAporte } from "./estructura";

export type TipoAporteTexto = "logro" | "reto";

export interface CampoTexto {
  clave: ClaveTextoAporte;
  etiqueta: string;
  /** «pilo» es lo que dice Pilo; «pantalla» lo que se lee en el formulario. */
  donde: "pilo" | "pantalla";
  largo: "corto" | "largo";
}

export interface GrupoTexto {
  id: "titulo" | "descripcion" | "cifras";
  nombre: string;
  campos: CampoTexto[];
}

export const GRUPOS_TEXTO: GrupoTexto[] = [
  {
    id: "titulo",
    nombre: "1 · Título",
    campos: [
      { clave: "piloTitulo", etiqueta: "Lo que dice Pilo", donde: "pilo", largo: "largo" },
      { clave: "tituloPregunta", etiqueta: "Pregunta", donde: "pantalla", largo: "corto" },
      { clave: "tituloAyuda", etiqueta: "Explicación debajo de la pregunta", donde: "pantalla", largo: "largo" },
      { clave: "tituloEjemplo", etiqueta: "Ejemplo dentro del campo", donde: "pantalla", largo: "corto" },
    ],
  },
  {
    id: "descripcion",
    nombre: "2 · Descripción",
    campos: [
      { clave: "piloDescripcion", etiqueta: "Lo que dice Pilo", donde: "pilo", largo: "largo" },
      { clave: "descripcionPregunta", etiqueta: "Pregunta", donde: "pantalla", largo: "corto" },
      { clave: "descripcionAyuda", etiqueta: "Explicación debajo de la pregunta", donde: "pantalla", largo: "largo" },
    ],
  },
  {
    id: "cifras",
    nombre: "3 · Cifras",
    campos: [
      { clave: "piloCifras", etiqueta: "Lo que dice Pilo", donde: "pilo", largo: "largo" },
      { clave: "cifrasPregunta", etiqueta: "Pregunta", donde: "pantalla", largo: "corto" },
      { clave: "cifrasAyuda", etiqueta: "Explicación debajo de la pregunta", donde: "pantalla", largo: "largo" },
    ],
  },
];

export const TEXTOS_POR_DEFECTO: Record<TipoAporteTexto, Record<ClaveTextoAporte, string>> = {
  logro: {
    piloTitulo: "Dígame cuál es el logro que quiere destacar. Una frase corta, como el título en el video.",
    tituloPregunta: "¿Cuál es el logro que quiere destacar?",
    tituloAyuda: "Una frase corta, como el título que verá en el video.",
    tituloEjemplo: "Por ejemplo, Acreditación de alta calidad del programa",
    piloDescripcion: "Ahora descríbalo en máximo {max} caracteres. Lo concreto ayuda: qué se hizo, para quién y qué cambió.",
    descripcionPregunta: "Descríbalo en pocas líneas",
    descripcionAyuda: "Qué se hizo, para quién y qué cambió. Máximo {max} caracteres.",
    piloCifras: "Estas son las cifras que lo respaldan. Cada una lleva qué es, de qué tipo y su valor. Puede agregar varias.",
    cifrasPregunta: "¿Qué cifras lo respaldan?",
    cifrasAyuda: "Cada cifra dice qué es, de qué tipo es y cuánto vale. Agregue las que quiera (hasta {cifras}).",
  },
  reto: {
    piloTitulo: "Dígame cuál es el reto. Una frase corta, como el título en el video.",
    tituloPregunta: "¿Cuál es el reto que enfrenta?",
    tituloAyuda: "Una frase corta, como el título que verá en el video.",
    tituloEjemplo: "Por ejemplo, Aumentar la permanencia en primer semestre",
    piloDescripcion: "Ahora descríbalo en máximo {max} caracteres. Lo concreto ayuda: qué se hizo, para quién y qué cambió.",
    descripcionPregunta: "Descríbalo en pocas líneas",
    descripcionAyuda: "Qué se hizo, para quién y qué cambió. Máximo {max} caracteres.",
    piloCifras: "Estas son las cifras que lo respaldan. Cada una lleva qué es, de qué tipo y su valor. Puede agregar varias.",
    cifrasPregunta: "¿Qué cifras lo respaldan?",
    cifrasAyuda: "Cada cifra dice qué es, de qué tipo es y cuánto vale. Agregue las que quiera (hasta {cifras}).",
  },
};

/** El texto de un campo: el que escribió quien edita, o el de por defecto si lo dejó vacío. */
export function textoAporte(textos: TextosAporte | undefined, tipo: TipoAporteTexto, clave: ClaveTextoAporte, valores: { max?: number; cifras?: number } = {}): string {
  const propio = textos?.[clave]?.trim();
  const base = propio || TEXTOS_POR_DEFECTO[tipo][clave];
  return base.replace(/\{max\}/g, String(valores.max ?? "")).replace(/\{cifras\}/g, String(valores.cifras ?? ""));
}

/** Cambia un texto de un bloque; un texto vacío se quita para que vuelva el de por defecto. */
export function ponerTextoAporte(p: Pregunta, tipo: TipoAporteTexto, clave: ClaveTextoAporte, valor: string): Pregunta["textos"] {
  const actual: TextosAporte = { ...(p.textos?.[tipo] ?? {}) };
  if (valor.trim()) actual[clave] = valor;
  else delete actual[clave];
  const sig = { ...(p.textos ?? {}), [tipo]: actual };
  if (!Object.keys(sig.logro ?? {}).length) delete sig.logro;
  if (!Object.keys(sig.reto ?? {}).length) delete sig.reto;
  return Object.keys(sig).length ? sig : undefined;
}

export const hayTextosPropios = (p: Pregunta): boolean => CLAVES_TEXTO_APORTE.some((k) => p.textos?.logro?.[k] || p.textos?.reto?.[k]);
