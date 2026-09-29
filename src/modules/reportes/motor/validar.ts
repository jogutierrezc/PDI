/* =============================================================================
   Reportes Institucionales · validación declarativa.

   Las reglas genéricas salen de cada Campo (obligatorio, formato, fuente); las
   condicionales y los cruces, de spec.reglas y spec.reglasPlantilla. Aquí no
   hay un `if` por plantilla.
   ========================================================================== */

import type { Ayudas, Campo, Contexto, ErrorFila, Fila, Formato, PlantillaSpec } from "../tipos";
import { resolver } from "./nombres";
import { documento, fecha, vacio } from "./texto";

/** Lo que el motor le presta a las reglas de cada plantilla. */
export const ayudas: Ayudas = { vacio, resolver, documento, fecha };

type ErrorSinFila = Omit<ErrorFila, "fila">;

/** «Municipio donde estudia» → «municipio donde estudia»; respeta siglas («SNIES del programa»). */
function minuscula(texto: string): string {
  const [primera = ""] = texto.split(" ");
  if (primera.length > 1 && primera === primera.toUpperCase()) return texto;
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

const NOMBRE_CATALOGO: Record<string, string> = {
  programa: "programas",
  municipio: "municipios",
  pais: "países",
};

const soloDigitos = (v: string) => /^\d+$/.test(v);

/** Revisa el formato de un valor no vacío. null = está bien. */
function revisarFormato(campo: Campo, formato: Formato, v: string): Pick<ErrorSinFila, "mensaje" | "arreglo"> | null {
  const nombre = minuscula(campo.etiqueta);
  switch (formato) {
    case "texto":
      return null;
    case "entero":
      return soloDigitos(v) ? null : { mensaje: `«${v}» no es un número entero válido para ${nombre}. Escríbalo sin puntos, comas ni decimales.` };
    case "anio":
      return /^\d{4}$/.test(v) ? null : { mensaje: `«${v}» no es un año válido para ${nombre}. Escriba los 4 dígitos, p. ej. 2026.` };
    case "fecha":
      return fecha(v) ? null : { mensaje: `«${v}» no es una fecha válida para ${nombre}. Use dd/mm/aaaa y una fecha que exista.` };
    case "documento": {
      const limpio = documento(v);
      if (limpio === v) return null;
      return {
        mensaje: `«${v}» lleva puntos, comas, apóstrofes o espacios en ${nombre}. Debe quedar seguido: ${limpio}.`,
        arreglo: { etiqueta: "Quitar puntos", cambios: { [campo.codigo]: limpio } },
      };
    }
    case "correo":
      return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v) ? null : { mensaje: `«${v}» no es un correo válido para ${nombre}. Debe tener @ y un dominio con punto.` };
    case "telefono": {
      const digitos = v.replace(/[\s()+-]/g, "");
      return /^\d{7,10}$/.test(digitos) ? null : { mensaje: `«${v}» no es un teléfono válido para ${nombre}. Debe tener de 7 a 10 dígitos.` };
    }
    case "dinero": {
      if (soloDigitos(v)) return null;
      const limpio = v.replace(/[$.\s]/g, "");
      return {
        mensaje: `«${v}» no es un valor en pesos válido para ${nombre}. Escríbalo entero, sin puntos ni decimales.`,
        ...(soloDigitos(limpio) ? { arreglo: { etiqueta: "Quitar puntos", cambios: { [campo.codigo]: limpio } } } : {}),
      };
    }
  }
}

function fueraDeCatalogo(campo: Campo, v: string, ctx: Contexto): string {
  const f = campo.fuente!;
  const donde =
    f.tipo === "catalogo"
      ? NOMBRE_CATALOGO[f.catalogo] ?? f.catalogo
      : minuscula(ctx.dominios[f.dominio]?.etiqueta ?? campo.etiqueta);
  return `“${v}” no está en el catálogo de ${donde}. Elija un valor de la lista.`;
}

/** Reglas genéricas de una fila (obligatorio, formato, fuente) + spec.reglas. */
function validarFila(spec: PlantillaSpec, fila: Fila, ctx: Contexto): ErrorSinFila[] {
  const out: ErrorSinFila[] = [];
  for (const campo of spec.campos) {
    const seccion = `${campo.seccion} ${spec.nombre}`;
    const valor = fila[campo.codigo];
    if (vacio(valor)) {
      if (campo.obligatorio) {
        out.push({ campo: campo.codigo, seccion, mensaje: `Falta ${minuscula(campo.etiqueta)}. Es obligatorio en la plantilla.` });
      }
      continue;
    }
    const v = String(valor).trim();
    if (campo.formato) {
      const e = revisarFormato(campo, campo.formato, v);
      if (e) {
        out.push({ campo: campo.codigo, seccion, ...e });
        continue;
      }
    }
    if (campo.fuente && !resolver(campo.fuente, v, ctx)) {
      out.push({ campo: campo.codigo, seccion, mensaje: fueraDeCatalogo(campo, v, ctx) });
    }
  }
  for (const regla of spec.reglas) out.push(...regla(fila, ctx, ayudas));
  return out;
}

/** Ordena por fila y luego por el orden de la columna en la plantilla; quita duplicados exactos. */
function ordenar(spec: PlantillaSpec, errores: ErrorFila[]): ErrorFila[] {
  const columna = new Map(spec.campos.map((c, i) => [c.codigo, i]));
  const vistos = new Set<string>();
  const unicos = errores.filter((e) => {
    const clave = JSON.stringify([e.fila, e.campo, e.mensaje, e.seccion, e.arreglo ?? null]);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  return unicos
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        a.e.fila - b.e.fila ||
        (columna.get(a.e.campo) ?? Number.MAX_SAFE_INTEGER) - (columna.get(b.e.campo) ?? Number.MAX_SAFE_INTEGER) ||
        a.i - b.i,
    )
    .map(({ e }) => e);
}

export function validarCeldas(spec: PlantillaSpec, filas: Fila[], ctx: Contexto): ErrorFila[] {
  const errores: ErrorFila[] = [];
  filas.forEach((fila, i) => {
    for (const e of validarFila(spec, fila, ctx)) errores.push({ ...e, fila: i });
  });
  return ordenar(spec, errores);
}

export function validarPlantilla(spec: PlantillaSpec, filas: Fila[], ctx: Contexto): ErrorFila[] {
  const errores = validarCeldas(spec, filas, ctx);
  for (const regla of spec.reglasPlantilla) errores.push(...regla(filas, ctx, ayudas));
  return ordenar(spec, errores);
}
