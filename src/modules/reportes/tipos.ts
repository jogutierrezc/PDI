/* =============================================================================
   Reportes Institucionales · el contrato del módulo.

   Todo el módulo habla con estos tipos. Adentro se trabaja con nombres
   («Bucaramanga (Santander)», «Medicina», «Colombia»); los códigos oficiales
   (DIVIPOLA, país, código SNIES del programa, siglas del manual) solo aparecen
   en el archivo plano que se exporta para HECAA.

   Piezas y dueños:
     snies/dominios.ts          valores fijos del manual (tipo de documento…)   Francisco
     snies/plantillas/*.ts      una PlantillaSpec por plantilla SNIES           Francisco
     motor/*.ts                 validar, nombres↔códigos, importar, exportar    Diego
     store.ts                   consultas y mutaciones a Supabase (ri_*)        Miguel
     *.tsx + reportes.css       pantallas                                       Leonardo
   ========================================================================== */

export type ReporteId = "snies" | "cna";

export type PlantillaId =
  | "participante"
  | "inscritos"
  | "inscritos_programa"
  | "admitidos"
  | "primer_curso"
  | "matriculados"
  | "graduados"
  | "docentes";

/** Estado de una plantilla en un periodo. El orden es el del tablero. */
export type Estado = "pendiente" | "cargada" | "errores" | "validada" | "enviada";

/** Periodo SNIES: «2026-2». */
export type PeriodoCodigo = string;
export interface Periodo {
  anio: number;
  semestre: 1 | 2;
}

/* ---------- catálogos: nombre adentro, código afuera ---------- */

/** Catálogos que administra la intranet (tabla ri_catalogo_items). */
export type CatalogoId = "programa" | "municipio" | "pais";

export interface ItemCatalogo {
  catalogo: CatalogoId;
  codigo: string;
  nombre: string;
  /** Solo municipios: el departamento, para distinguir homónimos. */
  departamento?: string | null;
  /** Solo programas: códigos DIVIPOLA donde tiene registro calificado. */
  oferta?: string[];
  activo: boolean;
}

/** Valores fijados por el manual. Se consultan, no se editan. */
export interface Dominio {
  id: string;
  etiqueta: string;
  seccion: string;
  valores: { codigo: string; nombre: string }[];
}

/** De dónde sale la lista de un campo. */
export type Fuente =
  | { tipo: "catalogo"; catalogo: CatalogoId }
  | { tipo: "dominio"; dominio: string };

export type Formato =
  | "texto"
  | "entero"
  | "anio"
  | "fecha" // dd/mm/aaaa o dd-mm-aaaa
  | "documento" // sin puntos, comas, apóstrofes ni espacios
  | "correo"
  | "telefono"
  | "dinero"; // pesos, entero, sin puntos

/* ---------- plantillas ---------- */

export interface Campo {
  /** Clave en Fila y encabezado del archivo para HECAA, tal cual: «AÑO», «ID_MUNICIPIO». */
  codigo: string;
  /** Lo que ve la persona: «Municipio donde estudia». */
  etiqueta: string;
  /** Agrupa el formulario: «Identificación», «Programa»… */
  grupo: string;
  obligatorio: boolean;
  fuente?: Fuente;
  formato?: Formato;
  /** Otros encabezados que se reconocen al importar (versiones viejas de la plantilla). */
  alias?: string[];
  /** Nota corta bajo el campo del formulario. */
  ayuda?: string;
  placeholder?: string;
  /** Sección del manual que lo define: «§3.4.7». */
  seccion: string;
  /** La columna es ancha en la hoja (nombres largos). */
  ancho?: boolean;
}

/** Una fila tal como se captura: nombres, no códigos. Claves = Campo.codigo. */
export type Fila = Record<string, string>;

export interface ErrorFila {
  /** Índice de la fila (0 = primera). */
  fila: number;
  /** Campo.codigo donde se marca. */
  campo: string;
  /** Qué está mal y cómo se arregla, en español llano. */
  mensaje: string;
  /** «§3.4.7 Matriculados». */
  seccion: string;
  /** Arreglo automático, si lo hay: se aplica sobre la fila. */
  arreglo?: { etiqueta: string; cambios: Partial<Fila> };
}

/** Lo que una regla necesita saber del mundo. */
export interface Contexto {
  periodo: Periodo;
  catalogos: Record<CatalogoId, ItemCatalogo[]>;
  dominios: Record<string, Dominio>;
  /** Datos de otras plantillas para los cruces; los llena useCruces(). */
  cruces: Cruces;
}

export interface Cruces {
  /** NUM_DOCUMENTO normalizados reportados en Participante (cualquier periodo). */
  participantes: Set<string>;
  /** «documento|codigoPrograma» reportados en Matriculados, cualquier periodo. */
  matriculados: Set<string>;
  /** «documento|codigoPrograma» → periodo en que ya se graduó (otros periodos). */
  graduados: Map<string, PeriodoCodigo>;
  /** Población estudiantil por periodo: «documento|codigoPrograma|periodo».
   *  Relación de inscritos no trae programa: su clave es «documento||periodo». */
  inscritos: Set<string>;
  inscritosPrograma: Set<string>;
  admitidos: Set<string>;
  primerCurso: Set<string>;
}

/** Ayudas que el motor le presta a las reglas de cada plantilla. */
export interface Ayudas {
  vacio(v: string | undefined | null): boolean;
  /** Nombre o código → ítem del catálogo/dominio, o null. */
  resolver(fuente: Fuente, valor: string, ctx: Contexto): { codigo: string; nombre: string; item?: ItemCatalogo } | null;
  /** Documento sin puntos, comas, apóstrofes ni espacios. */
  documento(v: string): string;
  /** Fecha dd/mm/aaaa o dd-mm-aaaa → Date, o null si no existe. */
  fecha(v: string): Date | null;
}

/** Regla sobre una fila. Devuelve errores sin `fila` (el motor la pone). */
export type ReglaFila = (fila: Fila, ctx: Contexto, h: Ayudas) => Omit<ErrorFila, "fila">[];
/** Regla sobre toda la plantilla (repetidos, cruces con otras plantillas). */
export type ReglaPlantilla = (filas: Fila[], ctx: Contexto, h: Ayudas) => ErrorFila[];

/** Fechas de reporte de un semestre, «MM-DD»; `siguienteAnio` si cae al año siguiente. */
export interface Corte {
  fecha: string;
  siguienteAnio?: boolean;
}
export interface FechasSemestre {
  primerCorte: Corte | null;
  definitiva: Corte | null;
}

export interface PlantillaSpec {
  id: PlantillaId;
  nombre: string;
  /** Módulo SNIES: «Población estudiantil». */
  modulo: string;
  seccion: string;
  /** Orden de cargue (1 = Participante). */
  orden: number;
  /** Plantillas que deben existir antes (§3.1.1). */
  depende: PlantillaId[];
  fechas: { 1: FechasSemestre; 2: FechasSemestre };
  /** false: aparece en el tablero con sus fechas, pero aún no se captura. */
  disponible: boolean;
  /** Columnas en el orden exacto de la plantilla de HECAA. Vacío si no está disponible. */
  campos: Campo[];
  /** Reglas condicionales de una fila (p. ej. municipio de nacimiento solo si país = Colombia). */
  reglas: ReglaFila[];
  /** Reglas de toda la hoja: repetidos y cruces. Solo corren al validar. */
  reglasPlantilla: ReglaPlantilla[];
}

/* ---------- lo que expone el motor (Diego) ---------- */

export interface ResultadoImportacion {
  filas: Fila[];
  /** Campo.codigo reconocidos. */
  reconocidas: string[];
  /** Obligatorios que no vinieron. */
  faltantes: string[];
  /** Encabezados del archivo que no son de la plantilla. */
  ignoradas: string[];
  /** Cuántos códigos se cambiaron por nombres. */
  convertidos: number;
}

export interface Motor {
  /** Nombre que se muestra: «Bucaramanga (Santander)», «Medicina». */
  etiqueta(item: { nombre: string; departamento?: string | null }): string;
  /** Opciones de un campo con fuente, ya como etiquetas. */
  opciones(fuente: Fuente, ctx: Contexto): { codigo: string; nombre: string }[];
  /** Si el valor es un código o un nombre sin tildes, lo deja como la etiqueta del catálogo. */
  canonizar(campo: Campo, valor: string, ctx: Contexto): string;
  /** Obligatorios, formatos, valores fuera de catálogo y reglas de fila. */
  validarCeldas(spec: PlantillaSpec, filas: Fila[], ctx: Contexto): ErrorFila[];
  /** validarCeldas + reglasPlantilla (cruces). Es lo que corre «Validar plantilla». */
  validarPlantilla(spec: PlantillaSpec, filas: Fila[], ctx: Contexto): ErrorFila[];
  /** Excel (.xlsx) o CSV (; o ,) → matriz de texto. */
  leerArchivo(archivo: File): Promise<string[][]>;
  importar(spec: PlantillaSpec, matriz: string[][], ctx: Contexto): ResultadoImportacion;
  /** Filas con códigos, en el orden de la plantilla, con encabezado. */
  exportar(spec: PlantillaSpec, filas: Fila[], ctx: Contexto): string[][];
  /** Descarga el .xlsx para HECAA. Nombre: «<plantilla>_<periodo>.xlsx». */
  descargarXlsx(spec: PlantillaSpec, periodo: PeriodoCodigo, filas: Fila[], ctx: Contexto): Promise<void>;
}

/* ---------- lo que expone store.ts (Miguel) ---------- */

export interface Entrega {
  id: string;
  reporte: ReporteId;
  plantilla: PlantillaId;
  periodo: PeriodoCodigo;
  estado: Estado;
  filas: number;
  errores: number;
  validada_en: string | null;
  enviada_en: string | null;
  certificado_path: string | null;
  updated_at: string;
}
