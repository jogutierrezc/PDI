/* =============================================================================
   CMS Portales · lo que el inspector muestra de un bloque como datos.

   Funciones puras: el esquema del bloque como componente (generado del
   registro), la fila que viaja a la base, el código GSAP de su entrada y el
   resumen de una línea para la lista de capas. Sin React ni Supabase.
   ========================================================================== */

import type { CampoBloque, DefinicionBloque, Subcampo } from "./bloques";
import { partirId, type LineaBloque } from "./logica";
import type { Movimiento, Props } from "./tipos";

type TipoAtributo = "string" | "text" | "boolean" | "enumeration" | "integer" | "component";

export interface AtributoEsquema {
  type: TipoAtributo;
  required?: true;
  enum?: string[];
  min?: number;
  max?: number;
  repeatable?: true;
  component?: string;
  attributes?: Record<string, AtributoEsquema>;
}

export interface EsquemaBloque {
  collectionName: string;
  info: { displayName: string; description: string; group: string; live: boolean };
  attributes: Record<string, AtributoEsquema>;
}

const TIPO_POR_CAMPO: Record<CampoBloque["tipo"], TipoAtributo> = {
  texto: "string",
  imagen: "string",
  area: "text",
  bool: "boolean",
  enum: "enumeration",
  numero: "integer",
  lista: "component",
  codigo: "text",
};

function atributoDe(campo: CampoBloque | Subcampo, requerido = false): AtributoEsquema {
  const atributo: AtributoEsquema = { type: TIPO_POR_CAMPO[campo.tipo as CampoBloque["tipo"]] ?? "string" };
  if (requerido) atributo.required = true;
  if (campo.tipo === "enum") atributo.enum = (campo.opciones ?? []).map((o) => o.valor);
  if (campo.tipo === "numero") {
    const c = campo as CampoBloque;
    if (c.min !== undefined) atributo.min = c.min;
    if (c.max !== undefined) atributo.max = c.max;
  }
  return atributo;
}

/** La definición del bloque como componente, en el estilo de un esquema de Strapi. */
export function esquemaDeBloque(def: DefinicionBloque): EsquemaBloque {
  const attributes: Record<string, AtributoEsquema> = {};
  for (const campo of def.campos) {
    const atributo = atributoDe(campo, Boolean(campo.requerido));
    if (campo.tipo === "lista") {
      atributo.repeatable = true;
      atributo.component = `cms.${def.tipo}-${campo.clave}`;
      atributo.attributes = Object.fromEntries((campo.subcampos ?? []).map((s) => [s.clave, atributoDe(s)]));
    }
    attributes[campo.clave] = atributo;
  }
  return {
    collectionName: `components_cms_${def.tipo.replace(/-/g, "_")}`,
    info: { displayName: def.nombre, description: def.ayuda, group: def.grupo, live: Boolean(def.vivo) },
    attributes,
  };
}

/**
 * El esquema de «Columnas con contenido»: el de siempre más `items`, la lista de columnas, cada una
 * con su lista de bloques anidados (cualquier tipo anidable del registro). Aparte de esquemaDeBloque
 * para que éste siga siendo un atributo por campo del registro.
 */
export function esquemaDeContenedor(def: DefinicionBloque): EsquemaBloque {
  const base = esquemaDeBloque(def);
  return {
    ...base,
    attributes: {
      ...base.attributes,
      items: {
        type: "component",
        repeatable: true,
        component: `cms.${def.tipo}-columna`,
        attributes: {
          id: { type: "string" },
          bloques: {
            type: "component",
            repeatable: true,
            component: "cms.bloque-anidado",
            attributes: { id: { type: "string", required: true }, tipo: { type: "string", required: true }, props: { type: "text" } },
          },
        },
      },
    },
  };
}

/** Un bloque anidado tal como viaja dentro de las props de su contenedor (sin `ancho`: ocupa la columna). */
export function hijoDeBloque(linea: LineaBloque): { id: string; tipo: string; props: Props } {
  return { id: partirId(linea.id)?.hijo ?? linea.id, tipo: linea.tipo, props: linea.props };
}

/** La fila de `cms_bloques` tal como se escribe al guardar: las claves «_» viajan dentro de `props`. */
export function filaDeBloque(linea: LineaBloque, orden: number): { id: string; orden: number; tipo: string; ancho: number; props: Props } {
  return { id: linea.id, orden, tipo: linea.tipo, ancho: linea.ancho, props: linea.props };
}

/** El código GSAP de la entrada, igual al que ejecuta render.tsx (useEntrada). */
export function codigoGsap(m: Movimiento): string {
  const ease = JSON.stringify(m.ease);
  const base = `  duration: ${m.dur},\n  delay: ${m.delay},\n  ease: ${ease},`;
  switch (m.preset) {
    case "ninguna":
      return "// Sin entrada: el bloque aparece ya compuesto.";
    case "palabras":
      return `gsap.from(".cms-w", {\n  yPercent: 105,\n${base}\n  stagger: ${m.stagger},\n  clearProps: "transform"\n});`;
    case "sube":
      return `gsap.from(bloque, {\n  y: 24, opacity: 0,\n${base}\n  clearProps: "opacity,transform"\n});`;
    case "cascada":
      return `gsap.from("[data-in]", {\n  y: 24, opacity: 0,\n${base}\n  stagger: ${m.stagger},\n  clearProps: "opacity,transform"\n});`;
    case "zoom":
      return `gsap.from(".cms-arte", {\n  scale: 1.16,\n${base}\n  clearProps: "transform"\n});`;
  }
}

/** Una línea para reconocer el bloque en la lista de capas: su título, su texto o su antetítulo. */
export function resumenDeBloque(props: Props, largo = 60): string {
  for (const clave of ["titulo", "texto", "antetitulo", "cita"]) {
    const v = props[clave];
    if (typeof v === "string" && v.trim()) {
      const limpio = v.replace(/\s+/g, " ").trim();
      return limpio.length > largo ? `${limpio.slice(0, largo - 1).trimEnd()}…` : limpio;
    }
  }
  return "";
}
