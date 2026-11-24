/* =============================================================================
   Reportes Institucionales · nombres ↔ códigos.

   Adentro se trabaja con etiquetas («Bucaramanga (Santander)»); los códigos
   solo aparecen al exportar. `resolver` acepta, en este orden:
     1. la etiqueta exacta (ítems activos);
     2. el código exacto (también ítems inactivos: el código no miente);
     3. el código numérico sin ceros a la izquierda (Excel se come el 0 de
        «05001»), solo activos;
     4. la etiqueta sin tildes ni mayúsculas, si es única (activos);
     5. el nombre sin departamento, sin tildes, si es único (activos). Así
        «Barbosa» no resuelve cuando hay uno en Antioquia y otro en Santander.
   ========================================================================== */

import type { Campo, Contexto, Fuente, ItemCatalogo } from "../tipos";
import { normalizar, vacio } from "./texto";

interface Opcion {
  codigo: string;
  /** Etiqueta que se muestra. */
  nombre: string;
  /** Nombre sin departamento (para comparar). */
  base: string;
  activo: boolean;
  item?: ItemCatalogo;
}

/** «Bucaramanga (Santander)»; solo el nombre si no hay departamento o es igual al nombre. */
export function etiqueta(item: { nombre: string; departamento?: string | null }): string {
  const nombre = String(item.nombre ?? "").trim();
  const dep = String(item.departamento ?? "").trim();
  if (!dep || normalizar(dep) === normalizar(nombre)) return nombre;
  return `${nombre} (${dep})`;
}

/** Todas las opciones de una fuente, activas o no. */
function lista(fuente: Fuente, ctx: Contexto): Opcion[] {
  if (fuente.tipo === "catalogo") {
    return (ctx.catalogos[fuente.catalogo] ?? []).map((item) => ({
      codigo: item.codigo,
      nombre: etiqueta(item),
      base: item.nombre,
      activo: item.activo,
      item,
    }));
  }
  return (ctx.dominios[fuente.dominio]?.valores ?? []).map((v) => ({
    codigo: v.codigo,
    nombre: v.nombre,
    base: v.nombre,
    activo: true,
  }));
}

const sinCeros = (codigo: string) => codigo.replace(/^0+(?=\d)/, "");

function salida(o: Opcion): { codigo: string; nombre: string; item?: ItemCatalogo } {
  return o.item ? { codigo: o.codigo, nombre: o.nombre, item: o.item } : { codigo: o.codigo, nombre: o.nombre };
}

/** Nombre o código → ítem del catálogo/dominio, o null si no existe o es ambiguo. */
export function resolver(
  fuente: Fuente,
  valor: string,
  ctx: Contexto,
): { codigo: string; nombre: string; item?: ItemCatalogo } | null {
  if (vacio(valor)) return null;
  const v = String(valor).trim();
  const todas = lista(fuente, ctx);
  const activas = todas.filter((o) => o.activo);

  const porEtiqueta = activas.find((o) => o.nombre === v);
  if (porEtiqueta) return salida(porEtiqueta);

  const porCodigo = todas.find((o) => o.codigo === v);
  if (porCodigo) return salida(porCodigo);

  if (/^\d+$/.test(v)) {
    const cod = activas.filter((o) => /^\d+$/.test(o.codigo) && sinCeros(o.codigo) === sinCeros(v));
    if (cod.length === 1) return salida(cod[0]);
  }

  const n = normalizar(v);
  // Códigos alfabéticos en minúscula («cc» por «CC»).
  const codigoN = activas.filter((o) => normalizar(o.codigo) === n);
  if (codigoN.length === 1) return salida(codigoN[0]);

  const etiquetaN = activas.filter((o) => normalizar(o.nombre) === n);
  if (etiquetaN.length === 1) return salida(etiquetaN[0]);
  if (etiquetaN.length > 1) return null;

  const baseN = activas.filter((o) => normalizar(o.base) === n);
  if (baseN.length === 1) return salida(baseN[0]);
  return null;
}

/** Opciones activas de un campo con fuente, ya como etiquetas. Catálogos en orden alfabético; dominios en el orden del manual. */
export function opciones(fuente: Fuente, ctx: Contexto): { codigo: string; nombre: string }[] {
  const activas = lista(fuente, ctx)
    .filter((o) => o.activo)
    .map((o) => ({ codigo: o.codigo, nombre: o.nombre }));
  if (fuente.tipo === "catalogo") activas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return activas;
}

/** Si el valor es un código o un nombre sin tildes, lo deja como la etiqueta del catálogo. Si no resuelve, lo deja igual. */
export function canonizar(campo: Campo, valor: string, ctx: Contexto): string {
  if (!campo.fuente || vacio(valor)) return valor;
  return resolver(campo.fuente, valor, ctx)?.nombre ?? valor;
}
