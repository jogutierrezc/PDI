// Portado de Roomy (business-intelligence/utils/biFormato.js) a TypeScript con el mismo comportamiento.
// Constantes y formateadores del portal. Viven fuera de los archivos de
// componentes para que el recargado en caliente no tenga que decidir si un
// módulo exporta componentes o valores.

export const VEREDICTOS: Record<string, { clase: string; cinta: string }> = {
  'Cumple': { clase: 'ok', cinta: 'bi-rib-ok' },
  'No cumple': { clase: 'fail', cinta: 'bi-rib-fail' },
  'Pendiente de fuente': { clase: 'warn', cinta: 'bi-rib-warn' },
  'No aplica': { clase: 'mute', cinta: 'bi-rib-mute' },
  'Pendiente parametrizar': { clase: 'mute', cinta: 'bi-rib-mute' },
}

export const ORDEN_VEREDICTOS = ['Cumple', 'No cumple', 'Pendiente de fuente', 'No aplica', 'Pendiente parametrizar']

export const TIPO_CLASE: Record<string, string> = {
  'Incumplimiento': 'fail',
  'Preventiva': 'warn',
  'Corrección de codificación': 'accent',
  'Recomendación de perfil': 'accent',
  'Pendiente de fuente': 'warn',
  'Consideración de aprobación': 'ok',
}

export const ORDEN_TIPOS = [
  'Incumplimiento', 'Consideración de aprobación', 'Preventiva', 'Corrección de codificación',
  'Recomendación de perfil', 'Pendiente de fuente',
]

/**
 * Las canastas de horas, como las exporta Master.
 *
 * Es lo que el tablero muestra y compara. La tipología razona con un desglose
 * más fino —separa la preparación de la clase, junta investigación con
 * extensión y saca capacitación y comité a su propio cubo—, pero ese desglose
 * es un detalle interno de las reglas y vive en `DESGLOSE_TIPOLOGIA`.
 */
export const CANASTAS = [
  { campo: 'horas_docencia', nombre: 'Docencia', color: 'var(--doc)' },
  { campo: 'horas_investigacion', nombre: 'Investigación', color: 'var(--ie)' },
  { campo: 'horas_extension', nombre: 'Extensión', color: 'var(--ext)' },
  { campo: 'horas_administracion', nombre: 'Administración', color: 'var(--ges)' },
  { campo: 'horas_bienestar', nombre: 'Bienestar', color: 'var(--cap)' },
]

/** El desglose con el que se deciden las reglas, visible en la ficha. */
export const DESGLOSE_TIPOLOGIA = [
  { campo: 'horas_ensenanza', nombre: 'Enseñanza directa', color: 'var(--doc)' },
  { campo: 'horas_derivadas', nombre: 'Derivadas de la enseñanza', color: 'var(--deriv)' },
  { campo: 'horas_inv_ext', nombre: 'Investigación y/o extensión', color: 'var(--ie)' },
  { campo: 'horas_gestion', nombre: 'Gestión académica', color: 'var(--ges)' },
  { campo: 'horas_capacitacion', nombre: 'Capacitación', color: 'var(--cap)' },
  { campo: 'horas_comite', nombre: 'Comité de programa', color: 'var(--com)' },
]

export const ESTADOS_MASTER: Record<string, string> = {
  APROBADA: 'ok',
  PREAPROBADA: 'accent',
  SIN_APROBAR: 'fail',
  NO_DETERMINADO: 'mute',
  SIN_DATO_MASTER: 'mute',
}

/**
 * En qué reporte de nómina apareció el profesor. El corte funde pregrado y
 * posgrado por cédula; para comparar contra un reporte de Master hay que poder
 * separarlos otra vez.
 */
export const FUENTES_NOMINA: Record<string, string> = {
  PREGRADO: 'Pregrado',
  AMBAS: 'Pregrado y posgrado',
  POSGRADO: 'Solo posgrado',
}

export const nf = (valor: unknown) => Number(valor ?? 0).toLocaleString('es-CO')

export const hrs = (valor: unknown) => {
  const n = Number(valor ?? 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export const veredictoClase = (veredicto: string) => (VEREDICTOS[veredicto] ?? VEREDICTOS['No aplica']).clase

/** Agrupa y cuenta, para las barras que además filtran. */
export function contarPor<T>(items: T[], obtenerClave: (item: T) => string | null | undefined): [string, number][] {
  const conteo = new Map<string, number>()
  for (const item of items) {
    const clave = obtenerClave(item) || '—'
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1])
}
