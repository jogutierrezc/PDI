/* =============================================================================
   CMS Portales · pruebas del registro de bloques.

   Cada valor de partida tiene que cumplir sus propios campos (tipo, opciones,
   rangos y requeridos), un bloque vivo no puede traer contenido editable que
   no sea su encabezado, y todo tipo tiene grupo y movimiento válidos.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { BLOQUES, GRUPOS, definicion, type CampoBloque, type Subcampo } from "./bloques";
import type { Props } from "./tipos";

/** Un valor de un campo simple o de un elemento de lista debe ser válido para su definición. */
function errorDeCampo(campo: CampoBloque | Subcampo, valor: unknown, requerido: boolean): string | null {
  const vacio = valor === undefined || valor === null || (typeof valor === "string" && valor.trim() === "");
  if (vacio) return requerido ? `«${campo.clave}» es obligatorio y está vacío` : null;
  switch (campo.tipo) {
    case "texto":
    case "area":
      return typeof valor === "string" ? null : `«${campo.clave}» debe ser texto`;
    case "bool":
      return typeof valor === "boolean" ? null : `«${campo.clave}» debe ser verdadero o falso`;
    case "enum": {
      const ok = (campo.opciones ?? []).some((o) => o.valor === valor);
      return ok ? null : `«${campo.clave}» = «${String(valor)}» no es una opción`;
    }
    case "numero": {
      const c = campo as CampoBloque;
      if (typeof valor !== "number" || !Number.isFinite(valor)) return `«${campo.clave}» debe ser un número`;
      if (c.min !== undefined && valor < c.min) return `«${campo.clave}» menor que ${c.min}`;
      if (c.max !== undefined && valor > c.max) return `«${campo.clave}» mayor que ${c.max}`;
      return null;
    }
    default:
      return null;
  }
}

describe("registro de bloques", () => {
  it("cada tipo aparece una sola vez y en un grupo conocido", () => {
    const tipos = BLOQUES.map((b) => b.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
    for (const b of BLOQUES) expect(GRUPOS).toContain(b.grupo);
  });

  it("los grupos nuevos existen y cada uno tiene al menos un tipo", () => {
    for (const grupo of ["Landing", "Planeación", "Datos en vivo"] as const) {
      expect(GRUPOS).toContain(grupo);
      expect(BLOQUES.some((b) => b.grupo === grupo)).toBe(true);
    }
  });

  it("definicion() encuentra cada tipo y devuelve undefined para uno desconocido", () => {
    for (const b of BLOQUES) expect(definicion(b.tipo)).toBe(b);
    expect(definicion("no-existe")).toBeUndefined();
  });

  it("el movimiento por defecto respeta el prototipo: la cinta no se mueve, los vivos suben", () => {
    expect(definicion("ticker")?.movimiento).toBe("ninguna");
    expect(definicion("ods")?.movimiento).toBe("ninguna");
    for (const b of BLOQUES.filter((x) => x.vivo)) expect(b.movimiento).toBe("sube");
  });
});

describe("valores de partida frente a sus campos", () => {
  for (const def of BLOQUES) {
    it(`«${def.tipo}» cumple sus campos`, () => {
      const props: Props = def.valores();
      const claves = new Set(def.campos.map((c) => c.clave));

      // Ninguna clave de contenido queda fuera del registro (las «_» son reservadas).
      for (const clave of Object.keys(props)) {
        if (clave.startsWith("_")) continue;
        expect(claves.has(clave), `clave «${clave}» no está en los campos de «${def.tipo}»`).toBe(true);
      }

      const errores: string[] = [];
      for (const campo of def.campos) {
        const valor = props[campo.clave];
        if (campo.tipo === "lista") {
          if (!Array.isArray(valor)) {
            if (campo.requerido) errores.push(`«${campo.clave}» debe ser una lista`);
            continue;
          }
          valor.forEach((fila, i) => {
            if (typeof fila !== "object" || fila === null) {
              errores.push(`«${campo.clave}[${i}]» no es un objeto`);
              return;
            }
            const sub = new Set((campo.subcampos ?? []).map((s) => s.clave));
            for (const k of Object.keys(fila)) if (!sub.has(k)) errores.push(`«${campo.clave}[${i}].${k}» no existe`);
            for (const s of campo.subcampos ?? []) {
              const e = errorDeCampo(s, (fila as Props)[s.clave], false);
              if (e) errores.push(`${campo.clave}[${i}]: ${e}`);
            }
          });
          continue;
        }
        const e = errorDeCampo(campo, valor, Boolean(campo.requerido));
        if (e) errores.push(e);
      }
      expect(errores).toEqual([]);
    });
  }

  it("un bloque vivo no trae campos que no sean texto de encabezado, salvo el selector de su micrositio", () => {
    // Los micrositios eligen con un selector (ranking o subcategoría) qué sección dibujan; no es contenido.
    const selectores = ["ranking", "categoria"];
    for (const def of BLOQUES.filter((b) => b.vivo)) {
      for (const campo of def.campos) {
        const permitidos = selectores.includes(campo.clave) ? ["enum"] : ["texto", "area"];
        expect(permitidos, `${def.tipo}.${campo.clave}`).toContain(campo.tipo);
      }
    }
  });

  it("los vivos sin campos no producen contenido editable", () => {
    for (const def of BLOQUES.filter((b) => b.vivo && b.campos.length === 0)) {
      expect(Object.keys(def.valores()), def.tipo).toEqual([]);
    }
  });

  it("el encabezado de indicadores se edita, y el tablero no tiene campos propios", () => {
    const indicadores = definicion("indicadores");
    expect(indicadores?.vivo).toBe(true);
    expect(indicadores?.campos.map((c) => c.clave)).toEqual(["antetitulo", "titulo", "texto"]);
  });
});
