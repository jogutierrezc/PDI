/* =============================================================================
   Informes · lógica pura de las mejoras de la migración 0279: qué oficinas usan
   cada plantilla, cómo se valida una estructura propia y cómo se arma una nueva.
   Sin React ni Supabase: se prueba aparte (mejoras-logica.test.ts). La base repite
   estas reglas (informe_secciones_validas, informe_plantilla_permitida).
   ========================================================================== */

import { PLANTILLAS, TITULO_EVIDENCIAS, seccionesComoJson } from "./plantillas";
import type { DimId, PapelResponsable, Plantilla, PlantillaUnidadRow, ResponsableRow, SeccionEstructuraJson } from "./types";

export const TIPOS_ESTRUCTURA: { tipo: SeccionEstructuraJson["tipo"]; nombre: string; ayuda: string }[] = [
  { tipo: "narr", nombre: "Texto", ayuda: "La oficina escribe un texto (resumen, introducción, conclusiones…)." },
  { tipo: "pdi", nombre: "Alineación estratégica", ayuda: "Aportes a los pilares del PDI, con sus acciones, tablas y gráficas." },
  { tipo: "metas", nombre: "Objetivos y metas", ayuda: "Metas del año con lo programado y lo alcanzado." },
  { tipo: "dim", nombre: "Resultados y evidencias", ayuda: "La oficina elige a qué criterios reporta; indicadores con cifras o acciones." },
  { tipo: "matriz", nombre: "Síntesis", ayuda: "Matriz armada con las cifras de las secciones anteriores." },
  { tipo: "filas", nombre: "Tabla de filas", ayuda: "Una fila por punto, con las columnas que se definan." },
  { tipo: "logros", nombre: "Logros e innovaciones", ayuda: "Hasta tres logros, cada uno con su evidencia." },
  { tipo: "evid", nombre: "Evidencias y fuentes de verificación", ayuda: "Obligatoria en toda estructura: sin ella no se puede enviar el informe." },
  { tipo: "anexos", nombre: "Anexos", ayuda: "Se arma sola con los archivos cargados." },
];

export const DIMENSIONES_ESTRUCTURA: { id: DimId; nombre: string }[] = [
  { id: "acad", nombre: "Gestión académica" },
  { id: "prof", nombre: "Gestión profesoral" },
  { id: "cal", nombre: "Calidad y oferta" },
  { id: "inv", nombre: "Investigación" },
  { id: "ext", nombre: "Extensión e internacionalización" },
  { id: "fin", nombre: "Gestión administrativa y financiera" },
];

export const nombreDeTipo = (tipo: string): string => TIPOS_ESTRUCTURA.find((t) => t.tipo === tipo)?.nombre ?? tipo;

/** Sin filas, la plantilla es de todas las unidades; con filas, solo de las listadas. */
export function plantillaPermitida(filas: PlantillaUnidadRow[], plantilla: Plantilla, unitId: string): boolean {
  const propias = filas.filter((f) => f.plantilla === plantilla);
  return propias.length === 0 || propias.some((f) => f.unit_id === unitId);
}

/** Las oficinas a las que se limita una plantilla (vacío: todas). */
export const unidadesDePlantilla = (filas: PlantillaUnidadRow[], plantilla: Plantilla): string[] => filas.filter((f) => f.plantilla === plantilla).map((f) => f.unit_id);

/** Las plantillas que una unidad puede usar, entre las que se ofrecen (activas). */
export function plantillasDeUnidad(filas: PlantillaUnidadRow[], unitId: string, ofrecidas: Plantilla[]): Plantilla[] {
  return ofrecidas.filter((p) => plantillaPermitida(filas, p, unitId));
}

/** Lo que se le dice a Planeación de una estructura antes de guardarla (mismas reglas que la base). Vacío: está bien. */
export function validarEstructura(nombre: string, secciones: SeccionEstructuraJson[]): string[] {
  const f: string[] = [];
  const n = nombre.trim().length;
  if (n < 3) f.push("Ponga un nombre de al menos 3 letras.");
  if (n > 80) f.push("El nombre pasa de 80 caracteres.");
  if (secciones.length < 2) f.push("Una estructura lleva al menos 2 secciones.");
  if (secciones.length > 30) f.push("Una estructura lleva como máximo 30 secciones.");
  secciones.forEach((s, i) => {
    if (!s.titulo.trim()) f.push(`La sección ${i + 1} necesita un título.`);
    else if (s.titulo.trim().length > 120) f.push(`El título de la sección ${i + 1} pasa de 120 caracteres.`);
    if (s.tipo === "dim" && !(s.dims ?? []).length) f.push(`«${s.titulo.trim() || `Sección ${i + 1}`}» necesita al menos una dimensión (los criterios base a los que puede reportar).`);
    if (s.tipo === "filas" && !(s.columnas ?? []).filter((c) => c.trim()).length) f.push(`«${s.titulo.trim() || `Sección ${i + 1}`}» necesita al menos una columna.`);
  });
  if (!secciones.some((s) => s.tipo === "evid")) f.push("Toda estructura lleva «Evidencias y fuentes de verificación»: sin ella no se puede enviar el informe.");
  if (secciones.filter((s) => s.tipo === "anexos").length > 1) f.push("Solo puede haber una sección de anexos.");
  return f;
}

/** Deja la lista en forma: la de evidencias existe y los anexos, si hay, van al final. No cambia el orden de lo demás. */
export function normalizarSecciones(secciones: SeccionEstructuraJson[]): SeccionEstructuraJson[] {
  let lista = secciones.map((s) => ({ ...s, titulo: s.titulo.trim() }));
  const anexos = lista.filter((s) => s.tipo === "anexos");
  if (anexos.length) lista = [...lista.filter((s) => s.tipo !== "anexos"), anexos[0]];
  if (!lista.some((s) => s.tipo === "evid")) {
    const evid: SeccionEstructuraJson = { titulo: TITULO_EVIDENCIAS, tipo: "evid" };
    const i = lista.findIndex((s) => s.tipo === "anexos");
    lista = i < 0 ? [...lista, evid] : [...lista.slice(0, i), evid, ...lista.slice(i)];
  }
  return lista;
}

/** Una estructura nueva: copia de una plantilla A–D (o una base mínima si no se elige). */
export function seccionesIniciales(base: Plantilla | ""): SeccionEstructuraJson[] {
  if (base && PLANTILLAS[base]) return seccionesComoJson(base);
  return [
    { titulo: "Resumen ejecutivo", tipo: "narr", extension: "1 a 3 párrafos", minimo: 25 },
    { titulo: "Alineación estratégica", tipo: "pdi" },
    { titulo: "Resultados y evidencias", tipo: "dim", dims: ["inv", "ext", "fin"] },
    { titulo: "Logros e innovaciones", tipo: "logros" },
    { titulo: TITULO_EVIDENCIAS, tipo: "evid" },
    { titulo: "Anexos", tipo: "anexos" },
  ];
}

/** Mueve una sección una posición (−1 arriba, +1 abajo). Los anexos se quedan al final. */
export function moverSeccion(secciones: SeccionEstructuraJson[], i: number, paso: -1 | 1): SeccionEstructuraJson[] {
  const j = i + paso;
  if (j < 0 || j >= secciones.length || secciones[i].tipo === "anexos" || secciones[j].tipo === "anexos") return secciones;
  const copia = [...secciones];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

export const ETIQUETA_PAPEL: Record<PapelResponsable, string> = { jefe: "Gestor", editor: "Contribuyente", visor: "Consulta" };
export const AYUDA_PAPEL: Record<PapelResponsable, string> = {
  jefe: "Diligencia y envía el informe",
  editor: "Diligencia el informe; no lo envía",
  visor: "Solo lo ve",
};

/** Quién puede escribir el informe de la unidad con su usuario: Gestor y Contribuyente. */
export const quienEscribe = (responsables: ResponsableRow[]): ResponsableRow[] => responsables.filter((r) => r.rol === "jefe" || r.rol === "editor");

/** ¿Hay algo que restablecer? (asignaciones hechas desde Informes). */
export const hayAsignados = (responsables: ResponsableRow[]): boolean => responsables.some((r) => r.asignado);
