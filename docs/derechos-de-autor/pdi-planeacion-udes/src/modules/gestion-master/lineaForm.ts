/* =============================================================================
   Gestión Master · la actividad de un formulario: su forma, sus valores por
   defecto y su validación (pura). Las reglas son las de la base (0194 y 0197);
   aquí se repiten solo para avisar antes de enviar y para decir QUÉ campo falla.
   ========================================================================== */

import type { LineaEntrada } from "./api";
import {
  CAMPOS_EDITAR, MAX_INSTRUCCIONES, MAX_JUSTIFICACION, MAX_MOTIVO, MAX_NOMBRE, MAX_VINCULACION, MIN_JUSTIFICACION, MIN_MOTIVO,
  NOMBRE_CAMPO, nombreTipoActividad, validarCodigo, type CampoEditar, type Tipo,
} from "./modelo";

/** Lo que el catálogo del Master dice hoy de un código (para mostrar «actual → propuesto» y comparar). */
export interface Actual {
  codigo: string;
  nombre: string;
  tipoActividad: "" | "directa" | "apoyo";
  vinculacion: string;
  instrucciones: string;
  nProfesores: number | null;
  sinCaptura: boolean;
}

export interface LineaForm {
  clave: string;
  codigo: string;
  origenCodigo: string;
  origenPeriodo: string;
  origenSede: string;
  nombre: string;
  tipoActividad: "" | "directa" | "apoyo";
  instrucciones: string;
  vinculacion: string;
  activa: boolean;
  /** Mejorar, Editar y Eliminar: ya se eligió un código del catálogo. */
  elegido: boolean;
  /** Editar: el código que debe quedar, y qué campos se cambian. */
  codigoNuevo: string;
  motivo: string;
  cambia: Record<CampoEditar, boolean>;
  actual: Actual | null;
  /** Editar: lo que se supo del código nuevo al comprobarlo (vacío si está libre). */
  avisoCodigoNuevo: string;
  /** La tarjeta está abierta (si no, se ve su resumen de una línea). */
  abierta: boolean;
  /** Textos del catálogo que se recortaron al precargarlos por pasarse del tope. */
  recortes: string[];
}

let contador = 0;
export const nuevaClave = () => `linea-${++contador}`;

export const sinCambios = (): Record<CampoEditar, boolean> => ({ codigo: false, nombre: false, tipo_actividad: false, vinculacion: false, instrucciones: false });

export const nuevaLinea = (periodo: string, sede: string): LineaForm => ({
  clave: nuevaClave(),
  codigo: "",
  origenCodigo: "",
  origenPeriodo: periodo,
  origenSede: sede,
  nombre: "",
  tipoActividad: "",
  instrucciones: "",
  vinculacion: "",
  activa: true,
  elegido: false,
  codigoNuevo: "",
  motivo: "",
  cambia: sinCambios(),
  actual: null,
  avisoCodigoNuevo: "",
  abierta: true,
  recortes: [],
});

/** Recorta un texto del catálogo al tope del campo; devuelve el texto y, si se recortó, el nombre del campo. */
export function recortar(valor: string | null | undefined, tope: number, campo: string): { texto: string; recorte: string | null } {
  const t = valor ?? "";
  return t.length > tope ? { texto: t.slice(0, tope), recorte: `${campo} (el catálogo trae ${t.length} caracteres y el máximo es ${tope})` } : { texto: t, recorte: null };
}

/** El valor propuesto de un campo de Editar, en palabras, y el actual. */
export function valorActual(a: Actual | null, campo: CampoEditar): string {
  if (!a) return "—";
  if (campo === "codigo") return a.codigo || "—";
  if (campo === "tipo_actividad") return nombreTipoActividad(a.tipoActividad);
  const v = campo === "nombre" ? a.nombre : campo === "vinculacion" ? a.vinculacion : a.instrucciones;
  return v || "—";
}
export function valorPropuesto(l: LineaForm, campo: CampoEditar): string {
  if (campo === "codigo") return l.codigoNuevo.trim().toUpperCase() || "—";
  if (campo === "tipo_actividad") return nombreTipoActividad(l.tipoActividad);
  const v = campo === "nombre" ? l.nombre : campo === "vinculacion" ? l.vinculacion : l.instrucciones;
  return v.trim() || "—";
}

/** Los campos que de verdad cambian en una línea de Editar (marcados y distintos de lo actual). */
export function camposQueCambian(l: LineaForm): CampoEditar[] {
  return CAMPOS_EDITAR.filter((c) => l.cambia[c] && valorPropuesto(l, c) !== valorActual(l.actual, c) && valorPropuesto(l, c) !== "—");
}

/** Lo que se envía a la base: en Editar, solo los campos marcados. */
export function aEntrada(l: LineaForm, tipo: Tipo): LineaEntrada {
  if (tipo === "editar") {
    return {
      codigo: l.codigo,
      codigo_nuevo: l.cambia.codigo ? l.codigoNuevo : "",
      nombre: l.cambia.nombre ? l.nombre : "",
      tipo_actividad: l.cambia.tipo_actividad ? l.tipoActividad : "",
      vinculacion: l.cambia.vinculacion ? l.vinculacion : "",
      instrucciones: l.cambia.instrucciones ? l.instrucciones : "",
      motivo: l.motivo,
      activa: true,
    };
  }
  return {
    codigo: l.codigo,
    origen_codigo: l.origenCodigo || undefined,
    origen_periodo: l.origenCodigo ? l.origenPeriodo : undefined,
    origen_sede: l.origenCodigo ? l.origenSede : undefined,
    nombre: l.nombre,
    tipo_actividad: l.tipoActividad,
    instrucciones: l.instrucciones,
    vinculacion: l.vinculacion,
    activa: l.activa,
  };
}

/** Una actividad en una línea: «ACT-12 → ACT-45 · Nombre». */
export function tituloLinea(l: LineaForm, tipo: Tipo): string {
  const cod = l.codigo.trim().toUpperCase();
  if (tipo === "nuevo") return [cod || "Sin código", l.nombre.trim()].filter(Boolean).join(" · ") || "Actividad nueva";
  if (!l.elegido) return "Sin elegir";
  const nuevo = tipo === "editar" && l.cambia.codigo && l.codigoNuevo.trim() ? ` → ${l.codigoNuevo.trim().toUpperCase()}` : "";
  return `${cod}${nuevo}${l.actual?.nombre ? ` · ${l.actual.nombre}` : l.nombre ? ` · ${l.nombre}` : ""}`;
}

export interface ErrorForm {
  /** Id del campo, para llevar el foco. */
  id: string;
  mensaje: string;
  /** Paso del formulario donde se arregla (1 a 4). */
  paso: number;
  clave?: string;
}

export const idCampo = (clave: string, campo: string) => `gm-${clave}-${campo}`;

/** Todo lo que impide enviar, con el campo y el paso. */
export function validar(tipo: Tipo | null, periodo: string, sede: string, lineas: LineaForm[], justificacion: string): ErrorForm[] {
  const e: ErrorForm[] = [];
  if (!tipo) {
    e.push({ id: "gm-tipo", mensaje: "Elija qué quiere hacer.", paso: 1 });
    return e;
  }
  if (!periodo || !sede) e.push({ id: "gm-periodo", mensaje: "Elija el periodo y la sede.", paso: 1 });
  if (lineas.length === 0) e.push({ id: "gm-agregar", mensaje: "Añada al menos una actividad.", paso: 2 });
  const usados = new Map<string, string>();
  const registrar = (cod: string, clave: string) => {
    if (!cod) return null;
    if (usados.has(cod) && usados.get(cod) !== `${clave}`) return `El código ${cod} ya está en otra actividad de esta solicitud.`;
    usados.set(cod, clave);
    return null;
  };
  lineas.forEach((l, i) => {
    const n = `Actividad ${i + 1}`;
    const cod = l.codigo.trim().toUpperCase();
    const mal = (campo: string, mensaje: string) => e.push({ id: idCampo(l.clave, campo), mensaje: `${n}: ${mensaje}`, paso: 2, clave: l.clave });
    if (l.nombre.length > MAX_NOMBRE) mal("nombre", `el nombre pasa de ${MAX_NOMBRE} caracteres.`);
    if (l.vinculacion.length > MAX_VINCULACION) mal("vinculacion", `la vinculación pasa de ${MAX_VINCULACION} caracteres.`);
    if (l.instrucciones.length > MAX_INSTRUCCIONES) mal("instrucciones", `las instrucciones pasan de ${MAX_INSTRUCCIONES} caracteres.`);
    if (tipo === "nuevo") {
      if (!l.nombre.trim()) mal("nombre", "escriba el nombre de la actividad.");
      if (!l.tipoActividad) mal("tipo", "elija si es directa o de apoyo.");
      const c = validarCodigo(l.codigo, false);
      if (c) mal("codigo", c);
      else {
        const d = registrar(cod, l.clave);
        if (d) mal("codigo", d);
      }
      return;
    }
    if (!l.elegido || !cod) {
      mal("buscar", "elija un código del catálogo del Master.");
      return;
    }
    const d = registrar(cod, l.clave);
    if (d) mal("buscar", d);
    if (tipo === "mejorar" && !l.nombre.trim()) mal("nombre", "escriba cómo debe quedar el nombre.");
    if (tipo === "editar") {
      const marcados = CAMPOS_EDITAR.filter((c2) => l.cambia[c2]);
      if (marcados.length === 0) {
        mal("cambios", "marque al menos un dato que cambia.");
      } else if (camposQueCambian(l).length === 0) {
        mal("cambios", "lo que escribió es igual a lo que hay hoy: no cambia nada.");
      }
      if (l.cambia.codigo) {
        const nuevo = l.codigoNuevo.trim().toUpperCase();
        const c = validarCodigo(l.codigoNuevo, true);
        if (c) mal("codigo-nuevo", `el código nuevo: ${c.charAt(0).toLowerCase()}${c.slice(1)}`);
        else if (nuevo === cod) mal("codigo-nuevo", "el código nuevo es igual al actual.");
        else {
          const dup = registrar(nuevo, `${l.clave}-n`);
          if (dup) mal("codigo-nuevo", dup);
          else if (l.avisoCodigoNuevo) mal("codigo-nuevo", l.avisoCodigoNuevo);
        }
      }
      if (l.cambia.nombre && !l.nombre.trim()) mal("nombre", "escriba el nombre nuevo.");
      if (l.cambia.tipo_actividad && !l.tipoActividad) mal("tipo", "elija el tipo nuevo.");
      if (l.cambia.vinculacion && !l.vinculacion.trim()) mal("vinculacion", "escriba la vinculación nueva.");
      if (l.cambia.instrucciones && !l.instrucciones.trim()) mal("instrucciones", "escriba las instrucciones nuevas.");
      const m = l.motivo.trim().length;
      if (m < MIN_MOTIVO) mal("motivo", `escriba el motivo del cambio (al menos ${MIN_MOTIVO} caracteres; lleva ${m}).`);
      if (l.motivo.length > MAX_MOTIVO) mal("motivo", `el motivo pasa de ${MAX_MOTIVO} caracteres.`);
    }
  });
  const j = justificacion.trim().length;
  if (j < MIN_JUSTIFICACION) e.push({ id: "gm-justificacion", mensaje: `La justificación necesita ${MIN_JUSTIFICACION - j} caracteres más para llegar al mínimo de ${MIN_JUSTIFICACION}.`, paso: 3 });
  if (justificacion.length > MAX_JUSTIFICACION) e.push({ id: "gm-justificacion", mensaje: `La justificación pasa de ${MAX_JUSTIFICACION} caracteres.`, paso: 3 });
  return e;
}

export { NOMBRE_CAMPO };
