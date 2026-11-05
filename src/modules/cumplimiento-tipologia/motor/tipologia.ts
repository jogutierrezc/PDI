// ─── Motor de tipología profesoral ──────────────────────────────────────────
//
// Portado de Roomy (business-intelligence/services/tipologiaEngine.js) a
// TypeScript, con el mismo comportamiento: perfiles, canastas, reglas,
// veredicto, perfil sugerido, consideración de aprobación y lectura operativa.
// No importa nada de Roomy. Es la ÚNICA copia del motor: corre en el navegador
// de quien calcula el corte (ver README). Lo único que cambia respecto a Roomy
// son los tipos y la opción `posgradoCargado` de `calcularMedidas`.
//
// Porta al navegador el modelo del tablero `Tipologia_desde_2026B.pbix`, cuyas
// 75 medidas DAX viven en `TMDLScripts/Script 1.tmdl` dentro del archivo.
//
// Dos decisiones del modelo original que conviene tener presentes:
//
//   · **El veredicto lo produce el motor de observaciones, no una banda de
//     horas.** `Cumple tipología horas` devuelve "No cumple" en cuanto el
//     detalle de incumplimiento trae texto. No hay grados intermedios.
//
//   · **Son seis canastas, no las cuatro del reporte de nómina.** Salen de la
//     categoría de cada actividad: la preparación de clase se separa de la
//     docencia, investigación y extensión se cuentan juntas, y capacitación y
//     comité de programa salen a su propio cubo. El comité además se resta de
//     la gestión para los topes, porque su límite es independiente.
//
// Una diferencia deliberada con el tablero: allí la causa de cada observación
// se deduce después, buscando fragmentos de texto dentro de la frase ya escrita
// (`CONTAINSSTRING`). Varios patrones quedaron desalineados de las frases que
// las medidas emiten, y esas observaciones caen en «pendiente clasificar».
// Aquí la causa se asigna al generar la observación, así que el texto puede
// reescribirse sin romper la clasificación.


// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Una actividad de la nómina de un profesor, ya normalizada. */
export interface Actividad {
  codigo: string
  nombre?: string
  tipo?: string
  grupo?: string
  departamento?: string
  codPrograma?: string
  horas: number
  horasSemestre?: number
  matriculados?: number | null
  capacidad?: number | null
  observacion?: string
  /** 'Pregrado' o 'Posgrado'. */
  nivel?: string
}

export type CampusCodigo = 'BUC' | 'CUC' | 'VAL' | 'BOG'

export interface Ajuste {
  rubro: string
  corto: string
  actual: number
  objetivo: number
  delta: number
  compensa?: boolean
}

export interface Observacion {
  causa: string
  texto: string
  resumen: string
  categoria: string
  tipo: string
  ajuste?: Ajuste | null
  ajustes?: Ajuste[]
}

export interface Regla {
  nombre: string
  horas: number
  docMin?: number
  docMaxRef?: number
  prepTope?: number
  gestionMax?: number
  gestionSug?: number
  comiteMax?: number
  ieMin?: number
  ieMaxRef?: number
  capacitacionMax?: number
  docPosgradoMin?: number
  docPregradoMin?: number
  docPosgradoMaxRef?: number
  direccion?: number
  direccionDocMin?: number
  direccionDerivMin?: number
  coordEnsDocMin?: number
  coordEnsDocMaxRef?: number
  coordEnsEstudiantesMin?: number
  coordPracticas?: number[]
  coordInvMax?: number
  coordExtMax?: number
  calidadMax?: number
  soloDocenciaDirecta?: boolean
  totalEstricto?: 'menor' | 'maximo'
}

export type Reglas = Record<string, Regla>

export type Veredicto = 'Cumple' | 'No cumple' | 'Pendiente de fuente' | 'No aplica' | 'Pendiente parametrizar'

export interface Medidas {
  total: number
  docencia: number
  investigacion: number
  extension: number
  administracion: number
  bienestarMaster: number
  ensDirecta: number
  derivadas: number
  invExt: number
  gestion: number
  capacitacion: number
  bienestar: number
  informatica: number
  comite: number
  gestionSinComite: number
  capacitacionCFI: number
  preparacion: number
  direccion: number
  coordEnsenanza: number
  coordPracticas: number
  coordExtension: number
  calidad: number
  comiteCurricular: number
  coordInvestigacion: number
  coordInvestigacionInvalida: number
  tutoriasValidas: number
  tutoriasNoAutorizadas: number
  tutoriasCodigoInvalido: number
  docPosgrado: number
  docPregrado: number
  noDocenciaDirecta: number
  rolesAdministrativos: number
  gruposSinMatricula: Actividad[]
  actividades: number
  sinFuentePosgrado: boolean
  /** Roomy no las calcula (no hay fuente): las reglas que las usan quedan inactivas, igual que allá. */
  programasCoordinacion?: number
  estudiantesCoordinacion?: number | null
}

// ─── Las canastas que exporta Master ────────────────────────────────────────
//
// El tablero lee la nómina como Master la publica, no como la ordena la
// tipología. La columna `TIPO DE ACTIVIDAD` trae cuatro valores —DOCENCIA,
// INVESTIGACIÓN, EXTENSIÓN y ADMINISTRATIVA— y bienestar no es uno de ellos:
// sus actividades van tipificadas como docencia y se reconocen por el
// departamento o por el prefijo `BI` del código. Son las mismas cinco canastas
// que ya usa el resto de la aplicación en `academicNormalization`.
//
// La tipología razona con un desglose más fino —separa la preparación de la
// clase, junta investigación con extensión y saca capacitación y comité a su
// propio cubo—, y ese desglose sigue calculándose para las reglas. Pero lo que
// se muestra y se compara es lo que Master exporta.

export const CANASTAS_MASTER = ['DOCENCIA', 'INVESTIGACIÓN', 'EXTENSIÓN', 'ADMINISTRACIÓN', 'BIENESTAR']

/**
 * Canasta de Master de una actividad.
 *
 * Se decide por `TIPO DE ACTIVIDAD`, que es lo que el reporte trae, y solo se
 * cae al código cuando esa columna falta. Bienestar se detecta antes que nada:
 * sus actividades llegan marcadas como docencia.
 */
export function canastaMaster(actividad: Pick<Actividad, 'departamento' | 'codigo' | 'tipo'> | null | undefined): string {
  const departamento = String(actividad?.departamento ?? '').toUpperCase()
  const codigo = String(actividad?.codigo ?? '').trim().toUpperCase()
  if (departamento.includes('BIENESTAR') || codigo === 'BI' || codigo.startsWith('BI-')) return 'BIENESTAR'

  const tipo = String(actividad?.tipo ?? '').toUpperCase()
  if (tipo.startsWith('DOCEN')) return 'DOCENCIA'
  if (tipo.startsWith('INVEST')) return 'INVESTIGACIÓN'
  if (tipo.startsWith('EXTEN')) return 'EXTENSIÓN'
  if (tipo.startsWith('ADMIN')) return 'ADMINISTRACIÓN'

  // Sin la columna de tipo —la trae siempre, pero por si acaso— se deduce del
  // prefijo del código, que es la tipología de la actividad en Master.
  const categoria = categoriaDeActividad(codigo, departamento)
  if (categoria === CATEGORIAS.ENSENANZA || categoria === CATEGORIAS.DERIVADA) return 'DOCENCIA'
  if (categoria === CATEGORIAS.INV_EXT) return codigo.startsWith('EXTDI') ? 'EXTENSIÓN' : 'INVESTIGACIÓN'
  if (categoria === CATEGORIAS.BIENESTAR) return 'BIENESTAR'
  return 'ADMINISTRACIÓN'
}

/** Categorías de actividad, tal como las nombra el modelo. */
export const CATEGORIAS = {
  ENSENANZA: 'ENSEÑANZA DIRECTA',
  DERIVADA: 'DERIVADA DE LA ENSEÑANZA',
  INV_EXT: 'INVESTIGACIÓN Y/O EXTENSIÓN',
  GESTION: 'GESTIÓN ACADÉMICA SEGÚN FUNCIÓN MISIONAL',
  CAPACITACION: 'CAPACITACIÓN Y FORMACIÓN PROFESORAL',
  BIENESTAR: 'BIENESTAR INSTITUCIONAL',
  INFORMATICA: 'INFORMÁTICA',
}

const CATEGORIA_POR_PREFIJO: Record<string, string> = {
  ENSDI: CATEGORIAS.ENSENANZA,
  COMPGEN: CATEGORIAS.ENSENANZA,
  DVENS: CATEGORIAS.DERIVADA,
  INVDI: CATEGORIAS.INV_EXT,
  EXTDI: CATEGORIAS.INV_EXT,
  GEENS: CATEGORIAS.GESTION,
  GEINV: CATEGORIAS.GESTION,
  GEEXT: CATEGORIAS.GESTION,
  GEINT: CATEGORIAS.GESTION,
  CAPFP: CATEGORIAS.CAPACITACION,
  BI: CATEGORIAS.BIENESTAR,
}

/**
 * Prefijos que el motor sabe clasificar.
 *
 * Cualquier otro cae en gestión, que es donde el propio Master deja lo
 * administrativo sin clasificar. La etapa de verificación del catálogo compara
 * contra esta lista, no contra el catálogo descargado: el catálogo puede venir
 * incompleto —su captura no incluye `GEENS-CPR`, que son 247 filas de la
 * nómina— y usarlo para clasificar rompería la regla de comité de programa.
 */
export const PREFIJOS_CONOCIDOS = Object.keys(CATEGORIA_POR_PREFIJO)

/**
 * Categoría de una actividad a partir de su código.
 *
 * Un código numérico es una asignatura y cuenta como enseñanza directa; el
 * resto se resuelve por el prefijo, que es la tipología de la actividad en
 * Master. Sin prefijo conocido cae en gestión, que es donde el propio Master
 * deja las actividades administrativas sin clasificar.
 */
export function categoriaDeActividad(codigo: unknown, departamento: unknown = ''): string {
  const code = String(codigo ?? '').trim().toUpperCase()
  if (!code) return CATEGORIAS.ENSENANZA
  if (/^\d/.test(code)) return CATEGORIAS.ENSENANZA
  if (code === 'BI' || code.startsWith('BI-')) return CATEGORIAS.BIENESTAR
  const prefijo = code.split('-')[0]
  const conocida = CATEGORIA_POR_PREFIJO[prefijo]
  if (conocida) return conocida
  if (/INFORM[ÁA]TICA/.test(String(departamento).toUpperCase())) return CATEGORIAS.INFORMATICA
  return CATEGORIAS.GESTION
}

/** Códigos de actividad con regla propia. */
export const CODIGOS: Record<string, string> = {
  PREPARACION: 'DVENS-PCEAE',
  COMITE_PROGRAMA: 'GEENS-CPR',
  CAPACITACION_CFI: 'CAPFP-PP-CFI',
  TUTORIA: 'ENSDI-TUT',
  TUTORIA_INVALIDA: 'DVENS-TUT',
  DIRECCION: 'GEENS-D',
  COORD_ENSENANZA: 'GEENS-CEP',
  COORD_PRACTICAS: 'GEENS-CPP',
  COORD_EXTENSION: 'GEEXT-CE',
  CALIDAD: 'GEENS-CP',
  COMITE_CURRICULAR: 'GEENS-CC',
  COORD_INVESTIGACION: 'INVDI-CI',
  COORD_INVESTIGACION_INVALIDA: 'GEINV-CI',
}

/** Perfiles con regla automática. Fuera de esta lista el veredicto no aplica. */
export const PERFILES_PARAMETRIZADOS = [
  'PLE-TC', 'PLE-MT', 'PMI-TC', 'PMI-MT', 'PIE-TC', 'PLI-TC', 'PLA-TC',
  'PC', 'INSBI-TC', 'INSBI-MT', 'INSBI-CAT', 'INS-INF',
]

/** Los siete perfiles de la tipología profesoral, entre los que se reclasifica. */
export const PERFILES_TIPOLOGIA = ['PLE-TC', 'PLE-MT', 'PMI-TC', 'PMI-MT', 'PIE-TC', 'PLI-TC', 'PLA-TC']

export const PERFIL_SIN_TIPOLOGIA = 'NO APLICA PERFIL 2026'

/** Perfiles cuyo total no se exige exacto: tienen un máximo, no una cifra fija. */
const PERFILES_TOTAL_PROPIO = ['PC', 'INSBI-CAT', 'INS-INF']

const PERFIL_POR_CONTRATO: [RegExp, string][] = [
  [/L[IÍ]DER EN ENSE[ÑN]ANZA TC/, 'PLE-TC'],
  [/L[IÍ]DER EN ENSE[ÑN]ANZA MT/, 'PLE-MT'],
  [/MISIONAL TC/, 'PMI-TC'],
  [/MISIONAL MT/, 'PMI-MT'],
  [/INVESTIGADOR ?\/ ?EXTENSIONISTA TC/, 'PIE-TC'],
  [/L[IÍ]DER EN INVESTIGACI[OÓ]N TC/, 'PLI-TC'],
  [/L[IÍ]DER ADMINISTRATIVO TC/, 'PLA-TC'],
  [/INSTRUCTOR DE BIENESTAR INSTITUCIONAL TIEMPO COMPLETO/, 'INSBI-TC'],
  [/INSTRUCTOR DE BIENESTAR INSTITUCIONAL MEDIO TIEMPO/, 'INSBI-MT'],
  [/INSTRUCTOR DE BIENESTAR INSTITUCIONAL C[ÁA]TEDRA/, 'INSBI-CAT'],
  [/INSTRUCTOR DE INFORM[ÁA]TICA/, 'INS-INF'],
  [/\(PC\)|PROFESOR C[ÁA]TEDRA/, 'PC'],
]

/**
 * Código de perfil a partir del nombre del contrato que imprime la nómina.
 *
 * La nómina no trae el código, solo la denominación; el código es lo que usan
 * las reglas y lo que pide el tablero. El orden importa: «INSTRUCTOR DE
 * BIENESTAR INSTITUCIONAL CÁTEDRA» tiene que resolverse antes que la regla
 * genérica de cátedra.
 */
export function perfilDeContrato(contrato: unknown): string {
  const texto = String(contrato ?? '').toUpperCase()
  for (const [patron, codigo] of PERFIL_POR_CONTRATO) {
    if (patron.test(texto)) return codigo
  }
  return PERFIL_SIN_TIPOLOGIA
}

/** Horas que el contrato exige sumar. La distribución debe dar exactamente esto. */
export function horasContratoEsperadas(perfil: string | null | undefined): number | null {
  if (!perfil || perfil === PERFIL_SIN_TIPOLOGIA) return null
  if (perfil === 'PC' || perfil === 'INSBI-CAT') return 6
  if (perfil === 'INS-INF') return 30
  if (perfil.endsWith('-TC')) return 40
  if (perfil.endsWith('-MT')) return 20
  return null
}

// ─── Catálogo de causas ──────────────────────────────────────────────────────
//
// `tipo` decide el veredicto: solo «Incumplimiento» bloquea el cumplimiento.
// «Pendiente de fuente» tampoco cumple, pero por una razón distinta —falta un
// insumo—, y merece decirse aparte para no culpar al profesor de un dato que
// nadie ha sincronizado todavía.

export const TIPO = {
  INCUMPLIMIENTO: 'Incumplimiento',
  PREVENTIVA: 'Preventiva',
  CODIFICACION: 'Corrección de codificación',
  RECOMENDACION: 'Recomendación de perfil',
  FUENTE: 'Pendiente de fuente',
  CONSIDERACION: 'Consideración de aprobación',
}

export const CAUSAS: Record<string, { categoria: string; tipo: string; detalle: string }> = {
  TOTAL_HORAS_SEMANALES:                     { categoria: 'Regla global', tipo: TIPO.INCUMPLIMIENTO, detalle: 'La distribución semanal no coincide con las horas esperadas' },
  TUTORIA_NO_AUTORIZADA:                     { categoria: 'Tutorías', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Tutoría registrada en un departamento no autorizado' },
  TUTORIA_CODIGO_NO_VALIDO:                  { categoria: 'Tutorías', tipo: TIPO.INCUMPLIMIENTO, detalle: 'DVENS-TUT no es un código válido de tutoría' },
  MATRICULA_CERO:                            { categoria: 'Regla global', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Curso o grupo sin estudiantes matriculados' },
  ENSENANZA_MINIMO:                          { categoria: 'Enseñanza', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Enseñanza directa por debajo del mínimo' },
  ENSENANZA_MAXIMO_REFERENCIA:               { categoria: 'Enseñanza', tipo: TIPO.PREVENTIVA, detalle: 'Enseñanza directa por encima del máximo de referencia' },
  PREPARACION_MAXIMO:                        { categoria: 'Preparación de clase', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Preparación de clase por encima del máximo permitido' },
  PREPARACION_BAJA:                          { categoria: 'Preparación de clase', tipo: TIPO.PREVENTIVA, detalle: 'Preparación de clase por debajo del máximo operativo' },
  GESTION_MAXIMO:                            { categoria: 'Gestión', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Gestión académica por encima o no permitida para el perfil' },
  GESTION_BAJA:                              { categoria: 'Gestión', tipo: TIPO.PREVENTIVA, detalle: 'Gestión académica por debajo del valor sugerido' },
  INVESTIGACION_EXTENSION_MINIMO:            { categoria: 'Investigación/extensión', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Investigación o extensión por debajo del mínimo' },
  INVESTIGACION_EXTENSION_MAXIMO_REFERENCIA: { categoria: 'Investigación/extensión', tipo: TIPO.PREVENTIVA, detalle: 'Investigación o extensión por encima del máximo de referencia' },
  CAPACITACION_MAXIMO:                       { categoria: 'Capacitación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Capacitación y formación profesoral por encima del máximo' },
  COMITE_PROGRAMA:                           { categoria: 'Comité de programa', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Comité de programa no permitido o por encima del límite' },
  CODIFICACION_GEINV_CI:                     { categoria: 'Corrección de codificación', tipo: TIPO.CODIFICACION, detalle: 'Coordinación de investigación registrada con código de gestión' },
  ROL_ADMINISTRATIVO_AUSENTE:                { categoria: 'Roles administrativos', tipo: TIPO.INCUMPLIMIENTO, detalle: 'No se identifica actividad de liderazgo o coordinación' },
  DIRECCION_HORAS:                           { categoria: 'Roles administrativos', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Horas de dirección distintas a la asignación establecida' },
  DIRECCION_DOCENCIA_MINIMO:                 { categoria: 'Roles administrativos', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Enseñanza directa del director por debajo del mínimo' },
  DIRECCION_DERIVADAS_MINIMO:                { categoria: 'Roles administrativos', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Actividades derivadas del director por debajo del mínimo' },
  COORDINACION_ENSENANZA_DOCENCIA:           { categoria: 'Coordinación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Enseñanza directa del coordinador por debajo del mínimo' },
  COORDINACION_ENSENANZA_SIN_PROGRAMA:       { categoria: 'Coordinación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Coordinación de enseñanza sin programa asociado' },
  COORDINACION_ENSENANZA_BAJA:               { categoria: 'Coordinación', tipo: TIPO.PREVENTIVA, detalle: 'Coordinación de enseñanza por debajo de la referencia de estudiantes' },
  DOCENCIA_COORDINACION_MAXIMO_REFERENCIA:   { categoria: 'Coordinación', tipo: TIPO.PREVENTIVA, detalle: 'Enseñanza directa del coordinador por encima de la referencia' },
  COORDINACION_PRACTICAS_HORAS:              { categoria: 'Coordinación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Horas de coordinación de prácticas fuera de los valores establecidos' },
  COORDINACION_INVESTIGACION_MAXIMO:         { categoria: 'Coordinación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Coordinación de investigación por encima del máximo' },
  COORDINACION_EXTENSION_MAXIMO:             { categoria: 'Coordinación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Coordinación de extensión por encima del máximo' },
  CALIDAD_MAXIMO:                            { categoria: 'Coordinación', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Calidad o autorregulación por encima del máximo' },
  PERFIL_NO_DOCENCIA:                        { categoria: 'Perfil', tipo: TIPO.INCUMPLIMIENTO, detalle: 'Actividades distintas a clase directa en un perfil de cátedra' },
  PERFIL_SUGERIDO:                           { categoria: 'Perfil', tipo: TIPO.RECOMENDACION, detalle: 'Distribución de horas con mejor ajuste a otro perfil' },
  FUENTE_POSGRADO_FALTANTE:                  { categoria: 'Pendiente de fuente', tipo: TIPO.FUENTE, detalle: 'La regla necesita el reporte de nómina de posgrado' },
  CONSIDERACION_APROBACION:                  { categoria: 'Aprobación', tipo: TIPO.CONSIDERACION, detalle: 'Carga completa del contrato programada, pero la distribución no cumple la tipología' },
}

// ─── Umbrales por perfil ─────────────────────────────────────────────────────
//
// Son los valores del modelo. La tabla `bi_perfil_regla` guarda la copia
// editable; esta constante es la semilla y el valor de respaldo cuando la
// tabla todavía no existe.

export const REGLAS_BASE: Reglas = {
  'PLE-TC': { nombre: 'Profesor líder en enseñanza TC', horas: 40, docMin: 22, docMaxRef: 25, prepTope: 9, gestionMax: 8, gestionSug: 4, comiteMax: 1 },
  'PLE-MT': { nombre: 'Profesor líder en enseñanza MT', horas: 20, docMin: 10, docMaxRef: 14, prepTope: 5, gestionMax: 2, gestionSug: 2, comiteMax: 0 },
  'PMI-TC': { nombre: 'Profesor misional TC', horas: 40, docMin: 18, docMaxRef: 20, ieMin: 6, ieMaxRef: 12, gestionMax: 5, comiteMax: 1 },
  'PMI-MT': { nombre: 'Profesor misional MT', horas: 20, docMin: 12, docMaxRef: 12, ieMin: 4, ieMaxRef: 4, gestionMax: 0, comiteMax: 0 },
  'PIE-TC': { nombre: 'Profesor investigador / extensionista TC', horas: 40, docMin: 12, docMaxRef: 16, ieMin: 16, ieMaxRef: 24, capacitacionMax: 1, comiteMax: 1 },
  'PLI-TC': { nombre: 'Profesor líder en investigación TC', horas: 40, docPosgradoMin: 8, docPregradoMin: 3, docPosgradoMaxRef: 15, prepTope: 3, ieMin: 25, capacitacionMax: 1, gestionMax: 0, comiteMax: 1 },
  'PLA-TC': { nombre: 'Profesor líder administrativo TC', horas: 40, direccion: 32, direccionDocMin: 6, direccionDerivMin: 2, coordEnsDocMin: 12, coordEnsDocMaxRef: 16, coordEnsEstudiantesMin: 80, coordPracticas: [5, 10, 18], coordInvMax: 20, coordExtMax: 15, calidadMax: 20 },
  'PC': { nombre: 'Profesor cátedra', horas: 6, soloDocenciaDirecta: true },
  'INSBI-TC': { nombre: 'Instructor de bienestar TC', horas: 40 },
  'INSBI-MT': { nombre: 'Instructor de bienestar MT', horas: 20 },
  'INSBI-CAT': { nombre: 'Instructor de bienestar cátedra', horas: 6, totalEstricto: 'menor' },
  'INS-INF': { nombre: 'Instructor de informática', horas: 30, totalEstricto: 'maximo' },
}

/** Departamentos donde ENSDI-TUT es una actividad válida, por campus. */
export const TUTORIA_AUTORIZADA: Record<string, string[]> = {
  BUC: ['SALUD PUBLICA', 'CIENCIAS BASICAS', 'MATEMATICAS', 'MORFOFISIOLOGIA', 'HUMANIDADES', 'EXITO ESTUDIANTIL'],
  CUC: ['CIENCIAS BASICAS SALUD', 'CIENCIAS BASICAS INGENIERIAS', 'SOCIOHUMANIDADES', 'EXITO ESTUDIANTIL', 'MORFOFISIOLOGIA'],
  VAL: ['SALUD PUBLICA Y EPIDEMIOLOGIA', 'CIENCIAS BASICAS', 'SOCIOHUMANIDADES', 'DESARROLLO ESTUDIANTIL', 'MORFOFISIOLOGIA'],
  BOG: [],
}

const sinTildes = (valor: unknown) => String(valor ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * Si el departamento puede registrar tutorías.
 *
 * El modelo cruza por `CAMPUS-CÓDIGO de programa`; la nómina consolidada trae
 * el nombre del departamento y no su código, así que aquí el cruce es por
 * nombre normalizado. Cuando `bi_departamento_tutoria` traiga los códigos
 * sincronizados, esta función recibe la lista y el cruce vuelve a ser por
 * código.
 */
export function tutoriaAutorizada(campus: string, departamento: unknown, autorizados: Record<string, string[]> = TUTORIA_AUTORIZADA): boolean {
  const lista = autorizados[campus] ?? []
  const nombre = sinTildes(departamento)
  if (!nombre) return false
  return lista.some((permitido) => nombre.includes(permitido) || permitido.includes(nombre))
}

// ─── Medidas de horas ────────────────────────────────────────────────────────

const techo = (valor: number) => Math.ceil(valor - 1e-9)

/**
 * Cuánto hay que mover un rubro para que la regla pase: `delta` positivo es
 * subir, negativo es bajar. Viaja con la observación para que la consideración
 * de aprobación pueda decir «sube 2 h aquí, baja 2 h allá» sin volver a
 * deducir cada umbral.
 */
const ajuste = (rubro: string, corto: string, actual: number, objetivo: number): Ajuste => ({ rubro, corto, actual, objetivo, delta: objetivo - actual })

const h = (valor: number) => (Number.isInteger(valor) ? String(valor) : Number(valor).toFixed(2).replace(/0+$/, '').replace(/\.$/, ''))

/**
 * Reproduce las medidas de horas del modelo sobre las actividades de un profesor.
 *
 * `actividades` es una lista de `{ codigo, nombre, grupo, departamento, horas,
 * matriculados, capacidad, nivel }`, tal como sale del Reporte Consolidado de
 * Nómina. `nivel` es 'Pregrado' o 'Posgrado' según de qué reporte venga la fila.
 */
export function calcularMedidas(
  actividades: Actividad[] | null | undefined,
  { campus = 'BUC', autorizados = TUTORIA_AUTORIZADA, posgradoCargado }: { campus?: string; autorizados?: Record<string, string[]>; posgradoCargado?: boolean } = {},
): Medidas {
  const lista = actividades ?? []
  const suma = (predicado: (a: Actividad) => boolean) => lista.reduce((total, a) => (predicado(a) ? total + (Number(a.horas) || 0) : total), 0)
  const codigo = (a: Actividad) => String(a.codigo ?? '').trim().toUpperCase()
  const categoria = (a: Actividad) => categoriaDeActividad(a.codigo, a.departamento)
  const esPosgrado = (a: Actividad) => String(a.nivel ?? '').toUpperCase().startsWith('POS')

  const ensDirecta = suma((a) => categoria(a) === CATEGORIAS.ENSENANZA)
  const gestion = suma((a) => categoria(a) === CATEGORIAS.GESTION)
  const comite = suma((a) => codigo(a) === CODIGOS.COMITE_PROGRAMA)
  const direccion = suma((a) => codigo(a) === CODIGOS.DIRECCION)
  const coordEnsenanza = suma((a) => codigo(a) === CODIGOS.COORD_ENSENANZA)
  const coordPracticas = suma((a) => codigo(a) === CODIGOS.COORD_PRACTICAS)
  const coordExtension = suma((a) => codigo(a) === CODIGOS.COORD_EXTENSION)
  const calidad = suma((a) => codigo(a) === CODIGOS.CALIDAD)
  const comiteCurricular = suma((a) => codigo(a) === CODIGOS.COMITE_CURRICULAR)
  const coordInvestigacion = suma((a) => codigo(a) === CODIGOS.COORD_INVESTIGACION)
  const total = suma(() => true)
  const docPosgrado = suma((a) => categoria(a) === CATEGORIAS.ENSENANZA && esPosgrado(a))

  // Un grupo es uno solo aunque la nómina lo parta en varias filas: la misma
  // asignatura y grupo aparece dos veces cuando se liquidan por separado las
  // horas de teoría y las de laboratorio, y otra vez si el profesor sale en la
  // nómina de pregrado y en la de posgrado. Contarlo dos veces inflaría la
  // observación —«2 grupos con cero matriculados» donde hay uno— y duplicaría
  // la fila al guardarla.
  const gruposSinMatricula: Actividad[] = []
  const gruposVistos = new Set<string>()
  for (const a of lista) {
    if (String(a.grupo ?? '').trim() === '' || Number(a.matriculados) !== 0) continue
    const llave = `${String(a.codigo ?? '').toUpperCase()}|${a.grupo}`
    if (gruposVistos.has(llave)) continue
    gruposVistos.add(llave)
    gruposSinMatricula.push(a)
  }

  return {
    total,

    // ── Las cinco canastas de Master, que es lo que se muestra ──
    docencia: suma((a) => canastaMaster(a) === 'DOCENCIA'),
    investigacion: suma((a) => canastaMaster(a) === 'INVESTIGACIÓN'),
    extension: suma((a) => canastaMaster(a) === 'EXTENSIÓN'),
    administracion: suma((a) => canastaMaster(a) === 'ADMINISTRACIÓN'),
    bienestarMaster: suma((a) => canastaMaster(a) === 'BIENESTAR'),

    // ── El desglose que necesitan las reglas de la tipología ──
    ensDirecta,
    derivadas: suma((a) => categoria(a) === CATEGORIAS.DERIVADA),
    invExt: suma((a) => categoria(a) === CATEGORIAS.INV_EXT),
    gestion,
    capacitacion: suma((a) => categoria(a) === CATEGORIAS.CAPACITACION),
    bienestar: suma((a) => categoria(a) === CATEGORIAS.BIENESTAR),
    informatica: suma((a) => categoria(a) === CATEGORIAS.INFORMATICA),
    comite,
    gestionSinComite: Math.max(0, gestion - comite),
    capacitacionCFI: suma((a) => codigo(a) === CODIGOS.CAPACITACION_CFI),
    preparacion: suma((a) => codigo(a) === CODIGOS.PREPARACION),
    direccion,
    coordEnsenanza,
    coordPracticas,
    coordExtension,
    calidad,
    comiteCurricular,
    coordInvestigacion,
    coordInvestigacionInvalida: suma((a) => codigo(a) === CODIGOS.COORD_INVESTIGACION_INVALIDA),
    tutoriasValidas: suma((a) => codigo(a) === CODIGOS.TUTORIA && tutoriaAutorizada(campus, a.departamento, autorizados)),
    tutoriasNoAutorizadas: suma((a) => codigo(a) === CODIGOS.TUTORIA && !tutoriaAutorizada(campus, a.departamento, autorizados)),
    tutoriasCodigoInvalido: suma((a) => codigo(a) === CODIGOS.TUTORIA_INVALIDA),
    docPosgrado,
    docPregrado: Math.max(0, ensDirecta - docPosgrado),
    noDocenciaDirecta: Math.max(0, total - ensDirecta),
    rolesAdministrativos: direccion + coordEnsenanza + coordPracticas + coordExtension + calidad + comiteCurricular + coordInvestigacion,
    gruposSinMatricula,
    actividades: lista.length,
    // La regla de PLI mide horas de posgrado; sin el reporte de posgrado
    // sincronizado no se puede cerrar, y decirlo es más honesto que reprobar.
    // `posgradoCargado` es la unica diferencia con Roomy: cuando la fuente de nomina ya incluye posgrado (la del
    // Warehouse si), un profesor sin horas de posgrado no es «falta de fuente» sino una carga sin posgrado.
    sinFuentePosgrado: posgradoCargado ? false : !lista.some(esPosgrado),
  }
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

/**
 * Evalúa las reglas de la tipología sobre las medidas de un profesor.
 *
 * Cada observación lleva su causa, su texto largo —el que se muestra en el
 * portal— y un resumen corto que es el que se copia a Master, donde el campo
 * de observación admite 255 caracteres.
 *
 * @returns {{ observaciones: Array, veredicto: string }}
 */
export function evaluarTipologia(medidas: Medidas, perfil: string, reglas: Reglas = REGLAS_BASE): { observaciones: Observacion[]; veredicto: Veredicto } {
  const m = medidas
  // Los umbrales que un perfil no define quedan `undefined` y las comparaciones dan falso, como en el JavaScript de Roomy.
  const regla = (reglas[perfil] ?? {}) as Required<Regla>
  const obs: Observacion[] = []
  const agregar = (causa: string, texto: string, resumen: string, ajusteDeHoras: Ajuste | null = null) => {
    const meta = CAUSAS[causa]
    obs.push({ causa, texto, resumen, categoria: meta.categoria, tipo: meta.tipo, ajuste: ajusteDeHoras })
  }
  const esperadas = horasContratoEsperadas(perfil)
  const topePreparacionGlobal = techo(m.ensDirecta * 0.35)

  // ── Reglas globales, iguales para todos los perfiles ──
  if (m.tutoriasCodigoInvalido > 0) {
    agregar('TUTORIA_CODIGO_NO_VALIDO',
      `Tutorías: DVENS-TUT no es un código válido. Se registran ${h(m.tutoriasCodigoInvalido)} h; el código correcto es ENSDI-TUT y solo para departamentos autorizados.`,
      `DVENS-TUT no es válido (${h(m.tutoriasCodigoInvalido)}h): use ENSDI-TUT`)
  }
  if (m.coordInvestigacionInvalida > 0) {
    agregar('CODIFICACION_GEINV_CI',
      `Coordinación de investigación registrada con GEINV-CI (${h(m.coordInvestigacionInvalida)} h); el código que corresponde es INVDI-CI.`,
      `GEINV-CI (${h(m.coordInvestigacionInvalida)}h) debe ser INVDI-CI`)
  }
  if (m.tutoriasNoAutorizadas > 0) {
    agregar('TUTORIA_NO_AUTORIZADA',
      `Tutoría no autorizada para el departamento: se registran ${h(m.tutoriasNoAutorizadas)} h con ENSDI-TUT y este departamento no está en la lista de autorizados.`,
      `Tutoría no autorizada en el depto (${h(m.tutoriasNoAutorizadas)}h)`)
  }
  if (m.gruposSinMatricula.length > 0) {
    const n = m.gruposSinMatricula.length
    agregar('MATRICULA_CERO',
      `Se identificaron ${n} grupo${n === 1 ? '' : 's'} con cero matriculados; revise si esas horas deben mantenerse en la distribución semanal.`,
      `${n} grupo${n === 1 ? '' : 's'} con cero matriculados`)
  }
  // Los perfiles de cátedra e instructor validan su total con su propia regla.
  if (esperadas !== null && !PERFILES_TOTAL_PROPIO.includes(perfil) && m.total !== esperadas) {
    const arriba = m.total > esperadas
    agregar('TOTAL_HORAS_SEMANALES',
      `La distribución semanal de horas suma ${h(m.total)} h y ${arriba ? 'supera' : 'está por debajo de'} las ${esperadas} h del contrato.`,
      `Total ${h(m.total)}h ${arriba ? '>' : '<'} ${esperadas}h del contrato`,
      ajuste('Total semanal', 'Total', m.total, esperadas))
  }
  if (m.preparacion > topePreparacionGlobal) {
    agregar('PREPARACION_MAXIMO',
      `Las horas de preparación de clase superan el 35 %: con ${h(m.ensDirecta)} h de enseñanza directa el máximo es ${h(topePreparacionGlobal)} h y se registran ${h(m.preparacion)} h en DVENS-PCEAE.`,
      `Preparación ${h(m.preparacion)}h > tope ${h(topePreparacionGlobal)}h`,
      ajuste('Preparación de clase', 'Prep.', m.preparacion, topePreparacionGlobal))
  }

  // ── Reglas del perfil ──
  if (perfil === 'PLE-TC' || perfil === 'PLE-MT') {
    const tope = Math.min(regla.prepTope ?? Infinity, topePreparacionGlobal)
    if (m.ensDirecta < regla.docMin) {
      agregar('ENSENANZA_MINIMO',
        `Las horas de enseñanza directa están por debajo del mínimo de ${perfil}: se registran ${h(m.ensDirecta)} h y deben ser al menos ${regla.docMin} h.`,
        `Docencia ${h(m.ensDirecta)}h < mín ${regla.docMin}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.docMin))
    }
    if (m.derivadas > tope) {
      agregar('PREPARACION_MAXIMO',
        `Preparación de clase: se registran ${h(m.derivadas)} h y el máximo calculado para esta distribución es ${h(tope)} h. Hay ${h(m.derivadas - tope)} h de más.`,
        `Derivadas ${h(m.derivadas)}h > tope ${h(tope)}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, tope))
    }
    if (m.gestionSinComite > regla.gestionMax) {
      agregar('GESTION_MAXIMO',
        `Las horas de gestión académica superan el límite de ${regla.gestionMax} h para ${perfil}: se registran ${h(m.gestionSinComite)} h.`,
        `Gestión ${h(m.gestionSinComite)}h > máx ${regla.gestionMax}h`,
        ajuste('Gestión académica', 'Gestión', m.gestionSinComite, regla.gestionMax))
    }
    if (m.comite > regla.comiteMax) {
      agregar('COMITE_PROGRAMA',
        `Comité de programa registra ${h(m.comite)} h y el máximo para ${perfil} es ${regla.comiteMax} h.`,
        `Comité ${h(m.comite)}h > máx ${regla.comiteMax}h`,
        ajuste('Comité de programa', 'Comité', m.comite, regla.comiteMax))
    }
    if (m.ensDirecta > regla.docMaxRef) {
      agregar('ENSENANZA_MAXIMO_REFERENCIA',
        `Se registran ${h(m.ensDirecta)} h de docencia directa; el máximo de referencia para ${perfil} es ${regla.docMaxRef} h.`,
        `Docencia ${h(m.ensDirecta)}h sobre referencia ${regla.docMaxRef}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.docMaxRef))
    }
    if (m.derivadas < tope) {
      agregar('PREPARACION_BAJA',
        `Las horas de preparación de clase son ${h(m.derivadas)} h y el máximo calculado es ${h(tope)} h. Revisar si falta esta actividad.`,
        `Derivadas ${h(m.derivadas)}h bajo el tope ${h(tope)}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, tope))
    }
    if (regla.gestionSug != null && m.gestionSinComite < regla.gestionSug) {
      agregar('GESTION_BAJA',
        `Se registran ${h(m.gestionSinComite)} h de gestión académica; para ${perfil} se sugieren al menos ${regla.gestionSug} h.`,
        `Gestión ${h(m.gestionSinComite)}h bajo lo sugerido ${regla.gestionSug}h`,
        ajuste('Gestión académica', 'Gestión', m.gestionSinComite, regla.gestionSug))
    }
  }

  if (perfil === 'PMI-TC' || perfil === 'PMI-MT') {
    if (m.ensDirecta < regla.docMin) {
      agregar('ENSENANZA_MINIMO',
        `Las horas de enseñanza directa están por debajo del mínimo de ${perfil}: se registran ${h(m.ensDirecta)} h y deben ser al menos ${regla.docMin} h.`,
        `Docencia ${h(m.ensDirecta)}h < mín ${regla.docMin}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.docMin))
    }
    if (m.invExt < regla.ieMin) {
      agregar('INVESTIGACION_EXTENSION_MINIMO',
        `Las horas de investigación y/o extensión están por debajo del mínimo de ${regla.ieMin} h para ${perfil}. Se registran ${h(m.invExt)} h.`,
        `Inv/ext ${h(m.invExt)}h < mín ${regla.ieMin}h`,
        ajuste('Investigación y/o extensión', 'Inv/ext', m.invExt, regla.ieMin))
    }
    if (m.gestionSinComite > regla.gestionMax) {
      agregar('GESTION_MAXIMO',
        regla.gestionMax === 0
          ? `El perfil ${perfil} no permite horas de gestión o administración; se registran ${h(m.gestionSinComite)} h.`
          : `Las horas de gestión académica superan el límite de ${regla.gestionMax} h para ${perfil}: se registran ${h(m.gestionSinComite)} h.`,
        regla.gestionMax === 0
          ? `${perfil} no permite gestión; hay ${h(m.gestionSinComite)}h`
          : `Gestión ${h(m.gestionSinComite)}h > máx ${regla.gestionMax}h`,
        ajuste('Gestión académica', 'Gestión', m.gestionSinComite, regla.gestionMax))
    }
    if (m.comite > regla.comiteMax) {
      agregar('COMITE_PROGRAMA',
        `Comité de programa registra ${h(m.comite)} h y el máximo para ${perfil} es ${regla.comiteMax} h.`,
        `Comité ${h(m.comite)}h > máx ${regla.comiteMax}h`,
        ajuste('Comité de programa', 'Comité', m.comite, regla.comiteMax))
    }
    if (m.ensDirecta > regla.docMaxRef) {
      agregar('ENSENANZA_MAXIMO_REFERENCIA',
        `Se registran ${h(m.ensDirecta)} h de enseñanza directa; el máximo de referencia para ${perfil} es ${regla.docMaxRef} h.`,
        `Docencia ${h(m.ensDirecta)}h sobre referencia ${regla.docMaxRef}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.docMaxRef))
    }
    if (m.invExt > regla.ieMaxRef) {
      agregar('INVESTIGACION_EXTENSION_MAXIMO_REFERENCIA',
        `Se registran ${h(m.invExt)} h de investigación y/o extensión; el máximo de referencia para ${perfil} es ${regla.ieMaxRef} h.`,
        `Inv/ext ${h(m.invExt)}h sobre referencia ${regla.ieMaxRef}h`,
        ajuste('Investigación y/o extensión', 'Inv/ext', m.invExt, regla.ieMaxRef))
    }
  }

  if (perfil === 'PIE-TC') {
    if (m.ensDirecta < regla.docMin) {
      agregar('ENSENANZA_MINIMO',
        `Las horas de enseñanza directa están por debajo del mínimo de ${regla.docMin} h para PIE. Se registran ${h(m.ensDirecta)} h.`,
        `Docencia ${h(m.ensDirecta)}h < mín ${regla.docMin}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.docMin))
    }
    if (m.derivadas > topePreparacionGlobal) {
      agregar('PREPARACION_MAXIMO',
        `Las horas de preparación de clase derivada superan el 35 % permitido. Se registran ${h(m.derivadas)} h y el máximo es ${h(topePreparacionGlobal)} h.`,
        `Derivadas ${h(m.derivadas)}h > tope ${h(topePreparacionGlobal)}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, topePreparacionGlobal))
    }
    if (m.invExt < regla.ieMin) {
      agregar('INVESTIGACION_EXTENSION_MINIMO',
        `Las horas de investigación y/o extensión están por debajo del mínimo de ${regla.ieMin} h para PIE. Se registran ${h(m.invExt)} h.`,
        `Inv/ext ${h(m.invExt)}h < mín ${regla.ieMin}h`,
        ajuste('Investigación y/o extensión', 'Inv/ext', m.invExt, regla.ieMin))
    }
    if (m.capacitacion > regla.capacitacionMax) {
      agregar('CAPACITACION_MAXIMO',
        `La capacitación y formación profesoral supera el límite: se registran ${h(m.capacitacion)} h y el máximo es ${regla.capacitacionMax} h.`,
        `Capacitación ${h(m.capacitacion)}h > máx ${regla.capacitacionMax}h`,
        ajuste('Capacitación', 'Capacitación', m.capacitacion, regla.capacitacionMax))
    }
    if (m.comite > regla.comiteMax) {
      agregar('COMITE_PROGRAMA',
        `El comité de programa supera el límite: se registran ${h(m.comite)} h y el máximo es ${regla.comiteMax} h.`,
        `Comité ${h(m.comite)}h > máx ${regla.comiteMax}h`,
        ajuste('Comité de programa', 'Comité', m.comite, regla.comiteMax))
    }
    if (m.ensDirecta > regla.docMaxRef) {
      agregar('ENSENANZA_MAXIMO_REFERENCIA',
        `Se registran ${h(m.ensDirecta)} h de enseñanza directa; el máximo de referencia para PIE es ${regla.docMaxRef} h.`,
        `Docencia ${h(m.ensDirecta)}h sobre referencia ${regla.docMaxRef}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.docMaxRef))
    }
    if (m.invExt > regla.ieMaxRef) {
      agregar('INVESTIGACION_EXTENSION_MAXIMO_REFERENCIA',
        `Se registran ${h(m.invExt)} h de investigación y/o extensión; el máximo de referencia para PIE es ${regla.ieMaxRef} h.`,
        `Inv/ext ${h(m.invExt)}h sobre referencia ${regla.ieMaxRef}h`,
        ajuste('Investigación y/o extensión', 'Inv/ext', m.invExt, regla.ieMaxRef))
    }
    if (m.derivadas < topePreparacionGlobal) {
      agregar('PREPARACION_BAJA',
        `Se registran ${h(m.derivadas)} h de preparación de clase derivada; el máximo calculado es ${h(topePreparacionGlobal)} h. Revisar si falta esta actividad.`,
        `Derivadas ${h(m.derivadas)}h bajo el tope ${h(topePreparacionGlobal)}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, topePreparacionGlobal))
    }
  }

  if (perfil === 'PLI-TC') {
    const tope = Math.min(regla.prepTope ?? Infinity, topePreparacionGlobal)
    if (m.sinFuentePosgrado) {
      agregar('FUENTE_POSGRADO_FALTANTE',
        `PLI exige al menos ${regla.docPosgradoMin} h de enseñanza directa en posgrado y ${regla.docPregradoMin} h en pregrado. Este periodo solo tiene cargado el reporte de nómina de pregrado, así que la regla no se puede cerrar: falta sincronizar la nómina de posgrado.`,
        `Falta la nómina de posgrado para evaluar PLI`)
    } else {
      if (m.docPosgrado < regla.docPosgradoMin) {
        agregar('ENSENANZA_MINIMO',
          `Las horas de enseñanza directa en posgrado están por debajo del mínimo de ${regla.docPosgradoMin} h para PLI. Se registran ${h(m.docPosgrado)} h.`,
          `Posgrado ${h(m.docPosgrado)}h < mín ${regla.docPosgradoMin}h`,
          ajuste('Enseñanza directa en posgrado', 'Ens. posgrado', m.docPosgrado, regla.docPosgradoMin))
      }
      if (m.docPregrado < regla.docPregradoMin) {
        agregar('ENSENANZA_MINIMO',
          `Las horas de enseñanza directa en pregrado están por debajo del mínimo de ${regla.docPregradoMin} h para PLI. Se registran ${h(m.docPregrado)} h.`,
          `Pregrado ${h(m.docPregrado)}h < mín ${regla.docPregradoMin}h`,
          ajuste('Enseñanza directa en pregrado', 'Ens. pregrado', m.docPregrado, regla.docPregradoMin))
      }
      if (m.docPosgrado > regla.docPosgradoMaxRef) {
        agregar('ENSENANZA_MAXIMO_REFERENCIA',
          `Se registran ${h(m.docPosgrado)} h de enseñanza directa en posgrado; el máximo de referencia para PLI es ${regla.docPosgradoMaxRef} h.`,
          `Posgrado ${h(m.docPosgrado)}h sobre referencia ${regla.docPosgradoMaxRef}h`,
          ajuste('Enseñanza directa en posgrado', 'Ens. posgrado', m.docPosgrado, regla.docPosgradoMaxRef))
      }
    }
    if (m.derivadas > tope) {
      agregar('PREPARACION_MAXIMO',
        `Las horas de preparación de clase derivada superan el máximo operativo de ${h(tope)} h. Se registran ${h(m.derivadas)} h.`,
        `Derivadas ${h(m.derivadas)}h > tope ${h(tope)}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, tope))
    }
    if (m.invExt < regla.ieMin) {
      agregar('INVESTIGACION_EXTENSION_MINIMO',
        `Las horas de investigación y/o extensión están por debajo del mínimo de ${regla.ieMin} h para PLI. Se registran ${h(m.invExt)} h.`,
        `Inv/ext ${h(m.invExt)}h < mín ${regla.ieMin}h`,
        ajuste('Investigación y/o extensión', 'Inv/ext', m.invExt, regla.ieMin))
    }
    if (m.capacitacionCFI > regla.capacitacionMax) {
      agregar('CAPACITACION_MAXIMO',
        `La capacitación y formación profesoral supera el límite: se registran ${h(m.capacitacionCFI)} h y el máximo es ${regla.capacitacionMax} h.`,
        `Capacitación ${h(m.capacitacionCFI)}h > máx ${regla.capacitacionMax}h`,
        ajuste('Capacitación', 'Capacitación', m.capacitacionCFI, regla.capacitacionMax))
    }
    if (m.gestionSinComite > regla.gestionMax) {
      agregar('GESTION_MAXIMO',
        `El perfil PLI no permite horas de gestión o administración; se registran ${h(m.gestionSinComite)} h.`,
        `PLI no permite gestión; hay ${h(m.gestionSinComite)}h`,
        ajuste('Gestión académica', 'Gestión', m.gestionSinComite, regla.gestionMax))
    }
    if (m.comite > regla.comiteMax) {
      agregar('COMITE_PROGRAMA',
        `El comité de programa supera el límite para PLI: se registran ${h(m.comite)} h.`,
        `Comité ${h(m.comite)}h > máx ${regla.comiteMax}h`,
        ajuste('Comité de programa', 'Comité', m.comite, regla.comiteMax))
    }
    if (m.derivadas < tope) {
      agregar('PREPARACION_BAJA',
        `Se registran ${h(m.derivadas)} h de preparación de clase derivada; el máximo operativo es ${h(tope)} h.`,
        `Derivadas ${h(m.derivadas)}h bajo el tope ${h(tope)}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, tope))
    }
  }

  if (perfil === 'PLA-TC') {
    if (m.rolesAdministrativos === 0) {
      agregar('ROL_ADMINISTRATIVO_AUSENTE',
        'No se identifica una actividad de liderazgo o coordinación dentro de la distribución semanal de horas.',
        'Sin actividad de liderazgo o coordinación')
    }
    if (m.direccion > 0 && m.direccion !== regla.direccion) {
      agregar('DIRECCION_HORAS',
        `Las horas de dirección de programa o coordinación de departamento no coinciden con la asignación establecida: se registran ${h(m.direccion)} h y deberían ser ${regla.direccion} h.`,
        `Dirección ${h(m.direccion)}h ≠ ${regla.direccion}h establecidas`,
        ajuste('Dirección de programa', 'Dirección', m.direccion, regla.direccion))
    }
    if (m.direccion > 0 && m.ensDirecta < regla.direccionDocMin) {
      agregar('DIRECCION_DOCENCIA_MINIMO',
        `En la distribución asociada a dirección, las horas de enseñanza directa están por debajo del mínimo: se registran ${h(m.ensDirecta)} h y deberían ser al menos ${regla.direccionDocMin} h.`,
        `Docencia del director ${h(m.ensDirecta)}h < ${regla.direccionDocMin}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.direccionDocMin))
    }
    if (m.direccion > 0 && m.derivadas < regla.direccionDerivMin) {
      agregar('DIRECCION_DERIVADAS_MINIMO',
        `En la distribución asociada a dirección, las actividades derivadas de la enseñanza están por debajo del mínimo: se registran ${h(m.derivadas)} h y deberían ser al menos ${regla.direccionDerivMin} h.`,
        `Derivadas del director ${h(m.derivadas)}h < ${regla.direccionDerivMin}h`,
        ajuste('Derivadas de la enseñanza', 'Derivadas', m.derivadas, regla.direccionDerivMin))
    }
    if (m.coordEnsenanza > 0 && m.ensDirecta < regla.coordEnsDocMin) {
      agregar('COORDINACION_ENSENANZA_DOCENCIA',
        `Para el rol de coordinación de enseñanza, las horas de enseñanza directa están por debajo del mínimo: se registran ${h(m.ensDirecta)} h y deberían ser al menos ${regla.coordEnsDocMin} h.`,
        `Docencia del coordinador ${h(m.ensDirecta)}h < ${regla.coordEnsDocMin}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.coordEnsDocMin))
    }
    if (m.coordEnsenanza > 0 && m.programasCoordinacion === 0) {
      agregar('COORDINACION_ENSENANZA_SIN_PROGRAMA',
        'Se registran horas de coordinación de enseñanza, pero no se encontró ningún programa asociado al código GEENS-CEP.',
        'Coordinación de enseñanza sin programa asociado')
    }
    if (m.coordEnsenanza > 0 && m.estudiantesCoordinacion != null && m.estudiantesCoordinacion < regla.coordEnsEstudiantesMin) {
      agregar('COORDINACION_ENSENANZA_BAJA',
        `Los programas asociados a la coordinación de enseñanza registran ${m.estudiantesCoordinacion} estudiantes; la referencia mínima es ${regla.coordEnsEstudiantesMin}.`,
        `Coordinación con ${m.estudiantesCoordinacion} estudiantes (<${regla.coordEnsEstudiantesMin})`)
    }
    if (m.coordEnsenanza > 0 && m.ensDirecta > regla.coordEnsDocMaxRef) {
      agregar('DOCENCIA_COORDINACION_MAXIMO_REFERENCIA',
        `Enseñanza directa por encima de la referencia para coordinación de enseñanza: se registran ${h(m.ensDirecta)} h y la referencia es ${regla.coordEnsDocMaxRef} h.`,
        `Docencia del coordinador ${h(m.ensDirecta)}h > ${regla.coordEnsDocMaxRef}h`,
        ajuste('Enseñanza directa', 'Ens. directa', m.ensDirecta, regla.coordEnsDocMaxRef))
    }
    if (m.coordPracticas > 0 && !(regla.coordPracticas ?? []).includes(m.coordPracticas)) {
      agregar('COORDINACION_PRACTICAS_HORAS',
        `Las horas de coordinación de prácticas no coinciden con los valores establecidos (${(regla.coordPracticas ?? []).join(', ')} h); se registran ${h(m.coordPracticas)} h.`,
        `Coord. prácticas ${h(m.coordPracticas)}h no válida`)
    }
    if (m.coordInvestigacion > regla.coordInvMax) {
      agregar('COORDINACION_INVESTIGACION_MAXIMO',
        `Las horas de coordinación de investigación superan el máximo: se registran ${h(m.coordInvestigacion)} h y el máximo es ${regla.coordInvMax} h.`,
        `Coord. investigación ${h(m.coordInvestigacion)}h > ${regla.coordInvMax}h`,
        ajuste('Coordinación de investigación', 'Coord. inv.', m.coordInvestigacion, regla.coordInvMax))
    }
    if (m.coordExtension > regla.coordExtMax) {
      agregar('COORDINACION_EXTENSION_MAXIMO',
        `Las horas de coordinación de extensión superan el máximo: se registran ${h(m.coordExtension)} h y el máximo es ${regla.coordExtMax} h.`,
        `Coord. extensión ${h(m.coordExtension)}h > ${regla.coordExtMax}h`,
        ajuste('Coordinación de extensión', 'Coord. ext.', m.coordExtension, regla.coordExtMax))
    }
    if (m.calidad > regla.calidadMax) {
      agregar('CALIDAD_MAXIMO',
        `Las horas asignadas a calidad o autorregulación superan el máximo: se registran ${h(m.calidad)} h y el máximo es ${regla.calidadMax} h.`,
        `Calidad ${h(m.calidad)}h > máx ${regla.calidadMax}h`,
        ajuste('Calidad y autorregulación', 'Calidad', m.calidad, regla.calidadMax))
    }
  }

  if (perfil === 'PC') {
    if (m.total > regla.horas) {
      agregar('TOTAL_HORAS_SEMANALES',
        `Para este perfil la distribución semanal está por encima de lo esperado: se registran ${h(m.total)} h y el máximo es ${regla.horas} h.`,
        `Total ${h(m.total)}h > máx ${regla.horas}h de cátedra`,
        ajuste('Total semanal', 'Total', m.total, regla.horas))
    }
    if (m.noDocenciaDirecta > 0) {
      agregar('PERFIL_NO_DOCENCIA',
        `Se registran ${h(m.noDocenciaDirecta)} h en actividades diferentes a clase directa; revise si corresponden a este perfil.`,
        `${h(m.noDocenciaDirecta)}h fuera de clase directa`,
        ajuste('Actividades distintas a clase directa', 'Fuera de clase', m.noDocenciaDirecta, 0))
    }
  }

  if (perfil === 'INSBI-TC' || perfil === 'INSBI-MT') {
    if (esperadas !== null && m.total !== esperadas) {
      agregar('TOTAL_HORAS_SEMANALES',
        `La distribución semanal de horas suma ${h(m.total)} h; para este perfil deberían registrarse ${esperadas} h.`,
        `Total ${h(m.total)}h ≠ ${esperadas}h del contrato`)
    }
  }
  if (perfil === 'INSBI-CAT' && m.total >= regla.horas) {
    agregar('TOTAL_HORAS_SEMANALES',
      `Para este perfil la distribución semanal está por encima de lo esperado: se registran ${h(m.total)} h y deben ser menos de ${regla.horas} h.`,
      `Total ${h(m.total)}h ≥ ${regla.horas}h permitidas`)
  }
  if (perfil === 'INS-INF' && m.total > regla.horas) {
    agregar('TOTAL_HORAS_SEMANALES',
      `Las horas asignadas están por encima de lo esperado: se registran ${h(m.total)} h y el máximo es ${regla.horas} h.`,
      `Total ${h(m.total)}h > máx ${regla.horas}h`)
  }

  return { observaciones: obs, veredicto: veredictoDe(perfil, obs) }
}

/** Veredicto del profesor a partir de sus observaciones. */
export function veredictoDe(perfil: string, observaciones: Observacion[]): Veredicto {
  const bloqueantes = observaciones.filter((o) => o.tipo === TIPO.INCUMPLIMIENTO)
  const fuente = observaciones.filter((o) => o.tipo === TIPO.FUENTE)
  if (bloqueantes.length > 0) return 'No cumple'
  // Una regla que no se puede evaluar no es un incumplimiento del profesor.
  if (fuente.length > 0) return 'Pendiente de fuente'
  if (perfil === PERFIL_SIN_TIPOLOGIA) return 'No aplica'
  if (PERFILES_PARAMETRIZADOS.includes(perfil)) return 'Cumple'
  return 'Pendiente parametrizar'
}

/**
 * Perfil de la tipología cuya regla sí acepta esta distribución de horas.
 *
 * Solo se proponen perfiles con las mismas horas de contrato: cambiar de TC a
 * MT no es una reclasificación, es otra vinculación.
 */
export function perfilSugerido(medidas: Medidas, perfilActual: string, reglas: Reglas = REGLAS_BASE): string | null {
  if (!PERFILES_TIPOLOGIA.includes(perfilActual)) return null
  const horas = horasContratoEsperadas(perfilActual)
  for (const candidato of PERFILES_TIPOLOGIA) {
    if (candidato === perfilActual) continue
    if (horasContratoEsperadas(candidato) !== horas) continue
    const { observaciones } = evaluarTipologia(medidas, candidato, reglas)
    if (observaciones.every((o) => o.tipo !== TIPO.INCUMPLIMIENTO && o.tipo !== TIPO.FUENTE)) return candidato
  }
  return null
}

// ─── Consideración de aprobación ─────────────────────────────────────────────
//
// El veredicto es binario: basta un incumplimiento para «No cumple». Pero no es
// lo mismo un profesor al que le faltan horas que uno con la carga completa mal
// repartida: al segundo se le puede aprobar la nómina si se actualiza la
// tipología, porque el total que se paga no cambia. Esta observación lo dice y
// propone cómo, sin tocar el veredicto.

/** Si el profesor tiene programada la carga completa de su contrato. */
export function cargaCompleta(medidas: Medidas, perfil: string, observaciones: Observacion[] = []): boolean {
  const esperadas = horasContratoEsperadas(perfil)
  if (esperadas === null || !(medidas.total > 0)) return false
  if (observaciones.some((o) => o.causa === 'TOTAL_HORAS_SEMANALES')) return false
  return PERFILES_TOTAL_PROPIO.includes(perfil) || medidas.total === esperadas
}

/**
 * Un ajuste por rubro. Si dos reglas piden mover el mismo —el mínimo del
 * perfil y el del rol de director, por ejemplo—, manda la más exigente.
 */
function consolidarAjustes(observaciones: Observacion[]): Ajuste[] {
  const porRubro = new Map<string, Ajuste>()
  for (const o of observaciones) {
    const a = o.ajuste
    if (!a || !a.delta) continue
    const previo = porRubro.get(a.rubro)
    if (!previo || Math.abs(a.delta) > Math.abs(previo.delta)) porRubro.set(a.rubro, a)
  }
  // Primero lo que sube y luego lo que baja: se lee como un traslado.
  return [...porRubro.values()].sort((x, y) => y.delta - x.delta)
}

/** Qué hacer con un incumplimiento que no se arregla moviendo horas. */
function accionSinAjuste(o: Observacion, regla: Regla): string {
  switch (o.causa) {
    case 'MATRICULA_CERO':
      return `retirar o reasignar las horas de ${o.resumen.replace(/^\d+ grupos?/, (t: string) => `los ${t}`)}`
    case 'TUTORIA_CODIGO_NO_VALIDO':
    case 'TUTORIA_NO_AUTORIZADA':
      return `corregir la tutoría (${o.resumen})`
    case 'ROL_ADMINISTRATIVO_AUSENTE':
      return 'registrar la actividad de liderazgo o coordinación que sustenta el perfil'
    case 'COORDINACION_PRACTICAS_HORAS':
      return `llevar la coordinación de prácticas a un valor permitido (${(regla.coordPracticas ?? []).join(', ')} h)`
    case 'COORDINACION_ENSENANZA_SIN_PROGRAMA':
      return 'asociar el programa a la coordinación de enseñanza (GEENS-CEP)'
    default:
      return `atender: ${o.resumen}`
  }
}

const conSigno = (delta: number) => `${delta > 0 ? '+' : '−'}${h(Math.abs(delta))}`

/**
 * Observación de consideración de aprobación, o `null` si no aplica.
 *
 * Aplica cuando el profesor no cumple la tipología pero tiene programada la
 * carga completa de su contrato. La recomendación es, en este orden:
 * reclasificarlo al perfil donde su distribución ya cumple —si existe—, o
 * redistribuir las horas dentro del mismo total, rubro por rubro, y corregir lo
 * que no es cuestión de horas (grupos vacíos, códigos mal usados).
 */
export function consideracionDeAprobacion({ medidas, perfil, observaciones, sugerido = null, reglas = REGLAS_BASE }: {
  medidas: Medidas
  perfil: string
  observaciones: Observacion[]
  sugerido?: string | null
  reglas?: Reglas
}): Observacion | null {
  if (veredictoDe(perfil, observaciones) !== 'No cumple') return null
  if (!cargaCompleta(medidas, perfil, observaciones)) return null

  const regla = (reglas[perfil] ?? {}) as Regla
  const esperadas = horasContratoEsperadas(perfil) as number
  const incumplimientos = observaciones.filter((o) => o.tipo === TIPO.INCUMPLIMIENTO)
  const ajustes = consolidarAjustes(incumplimientos)
  const sinAjuste = incumplimientos.filter((o) => !o.ajuste?.delta)
  const n = incumplimientos.length

  // Lo que sube tiene que salir de algún sitio y lo que baja tiene que ir a
  // alguno. Primero se buscan los rubros que el propio modelo ya señala con
  // margen —por encima de su referencia, o por debajo de su tope o de lo
  // sugerido—, para que el traslado cuadre sin inventar de dónde.
  const movimientos: Ajuste[] = [...ajustes]
  let pendiente = ajustes.reduce((suma, a) => suma + a.delta, 0)
  const margenes = consolidarAjustes(observaciones.filter((o) => o.tipo === TIPO.PREVENTIVA))
    .filter((a) => !ajustes.some((b) => b.rubro === a.rubro))
  for (const margen of margenes) {
    if (pendiente === 0) break
    if (Math.sign(margen.delta) === Math.sign(pendiente)) continue
    const mover = Math.min(Math.abs(pendiente), Math.abs(margen.delta)) * Math.sign(margen.delta)
    movimientos.push({ ...margen, objetivo: margen.actual + mover, delta: mover, compensa: true })
    pendiente += mover
  }
  movimientos.sort((x, y) => y.delta - x.delta)

  const recomendaciones: string[] = []
  if (sugerido) {
    const nombre = reglas[sugerido]?.nombre
    recomendaciones.push(`actualizar la tipología a ${sugerido}${nombre ? ` (${nombre})` : ''}: con ese perfil la distribución actual cumple sin mover una hora`)
  }
  if (ajustes.length) {
    const pasos = movimientos.map((a) => {
      const motivo = !a.compensa ? '' : a.delta < 0 ? '; está sobre su referencia' : '; tiene margen en el perfil'
      return `${a.delta > 0 ? 'subir' : 'bajar'} ${a.rubro.toLowerCase()} de ${h(a.actual)} a ${h(a.objetivo)} h (${conSigno(a.delta)}${motivo})`
    })
    let frase = `${sugerido ? `si se mantiene ${perfil}, ` : ''}redistribuir dentro de las mismas ${h(medidas.total)} h: ${pasos.join(', ')}`
    if (pendiente > 0) frase += `; para no pasar del contrato, liberar ${h(pendiente)} h${movimientos.some((a) => a.compensa) ? ' más' : ''} de actividades que el perfil no exige`
    if (pendiente < 0) frase += `; las ${h(-pendiente)} h que quedan libres deben pasar a actividades que el perfil admite, para conservar la carga completa`
    recomendaciones.push(frase)
  }
  for (const o of sinAjuste) recomendaciones.push(accionSinAjuste(o, regla))

  const carga = medidas.total === esperadas
    ? `las ${h(esperadas)} h completas de su contrato ${perfil}`
    : `${h(medidas.total)} h, dentro del máximo de ${h(esperadas)} h de su contrato ${perfil}`

  const texto = `Consideración de aprobación: el profesor tiene programadas ${carga}, pero la distribución no cumple la tipología (${n} incumplimiento${n === 1 ? '' : 's'}). `
    + `Recomendación: ${recomendaciones.join('; ')}. `
    + 'Como la carga total no cambia, puede considerarse la aprobación condicionada a que la tipología se actualice en Master.'

  const corto = sugerido
    ? `actualizando tipología a ${sugerido}`
    : ajustes.length
      ? `redistribuyendo ${movimientos.map((a) => `${a.corto} ${conSigno(a.delta)}h`).join(', ')}`
      : `tras corregir ${n} observación${n === 1 ? '' : 'es'}`
  const resumen = `Carga completa ${h(medidas.total)}h: aprobable ${corto}`

  const meta = CAUSAS.CONSIDERACION_APROBACION
  return { causa: 'CONSIDERACION_APROBACION', categoria: meta.categoria, tipo: meta.tipo, texto, resumen, ajuste: null, ajustes: movimientos }
}

/** Lectura operativa: cruza el veredicto del modelo con el estado en Master. */
export function lecturaOperativa(veredicto: string, estadoMaster: unknown, tipoPreaprobacion: unknown, { consideracion = false }: { consideracion?: boolean } = {}): string {
  const estado = String(estadoMaster ?? '').toUpperCase()
  const pre = String(tipoPreaprobacion ?? '').toUpperCase()
  if (!estado || estado === 'SIN_DATO_MASTER') return 'Sin dato en Master para esta cédula y campus'

  if (veredicto === 'Cumple') {
    if (estado === 'APROBADA') return 'OK operativo: cumple en el modelo y ya está aprobado en Master'
    if (estado === 'PREAPROBADA' && pre === 'AUTOMATICA') return 'OK operativo: cumple en el modelo y fue preaprobado automáticamente en Master'
    if (estado === 'PREAPROBADA' && pre === 'MANUAL') return 'Cumple en el modelo y tiene preaprobación manual en Master'
    if (estado === 'SIN_APROBAR') return 'Candidato para preaprobar según el modelo'
    if (estado === 'NO_DETERMINADO') return 'Cumple en el modelo, pero el estado en Master aparece no determinado'
  }
  if (veredicto === 'No cumple') {
    if (estado === 'APROBADA') return 'Aprobado en Master, pero el modelo identifica observaciones; conviene revisar si fue excepción, ajuste manual o diferencia de criterios'
    if (estado === 'PREAPROBADA' && pre === 'MANUAL') return 'No cumple según el modelo, pero está preaprobado manualmente en Master; revisar observación registrada'
    if (estado === 'PREAPROBADA' && pre === 'AUTOMATICA') return 'No cumple según el modelo, pero Master lo preaprobó automáticamente; conviene revisar diferencia de criterios'
    if (estado === 'SIN_APROBAR') {
      return consideracion
        ? 'Tiene la carga completa programada: considerar la aprobación condicionada a actualizar la tipología'
        : 'Requiere revisión antes de preaprobar'
    }
    if (estado === 'NO_DETERMINADO') return 'Requiere revisión; Master no tiene un estado determinado para esta cédula y campus'
  }
  if (veredicto === 'No aplica') return 'Revisión operativa: el modelo no aplica validación automática para este perfil'
  if (veredicto === 'Pendiente de fuente') return 'No se puede cerrar el veredicto: falta sincronizar un insumo del modelo'
  return 'Revisar estado operativo'
}
