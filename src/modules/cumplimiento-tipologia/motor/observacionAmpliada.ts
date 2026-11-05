// Portado de Roomy (business-intelligence/utils/observacionAmpliada.js) a TypeScript con el mismo comportamiento.
// ─── Observación ampliada ───────────────────────────────────────────────────
//
// La de 255 caracteres es lo que cabe en Master. Esta es lo que un revisor
// necesita para decidir sin abrir el portal: quién es, qué carga tiene, cómo
// se reparte, cada observación en su texto completo y qué hacer. No tiene
// límite porque no va a Master: va a informes, correos y al Excel.
//
// Se arma a partir de la fila de `bi_profesor_resumen` y sus observaciones,
// igual que la de 255, para que la sincronización y la ficha digan lo mismo.

import { REGLAS_BASE } from './tipologia'
import { FUENTES_NOMINA, hrs } from './formato'
import type { FilaHoras, ObservacionCorta } from './observacion255'

/** Secciones en el orden en que se leen: lo que bloquea, primero. */
const SECCIONES: [string, string, boolean][] = [
  ['Incumplimiento', 'Incumplimientos', true],
  ['Consideración de aprobación', 'Consideración de aprobación', false],
  ['Recomendación de perfil', 'Recomendación de perfil', false],
  ['Corrección de codificación', 'Correcciones de codificación', true],
  ['Pendiente de fuente', 'Pendiente de fuente', false],
  ['Preventiva', 'Preventivas', true],
]

/** «Consideración de aprobación: el profesor…» → «El profesor…». */
export function sinRotulo(texto: unknown): string {
  const resto = String(texto ?? '').replace(/^Consideración de aprobación:\s*/, '')
  return resto.charAt(0).toUpperCase() + resto.slice(1)
}

const lista = (pares: [string, unknown][]) => pares
  .filter(([, valor]) => Number(valor) > 0)
  .map(([nombre, valor]) => `${nombre} ${hrs(valor)} h`)
  .join('; ') || 'sin horas registradas'

/**
 * @param {object} fila          fila de `bi_profesor_resumen` (o el objeto que se va a guardar)
 * @param {Array}  observaciones `{ tipo, texto, resumen }` del profesor
 * @param {string} [fecha]       fecha de revisión, dd/MM/yyyy
 */
/** La fila del resumen que la observación ampliada necesita. Sin nombre ni cédula: el Warehouse solo guarda el seudónimo. */
export interface FilaAmpliada extends FilaHoras {
  seudonimo?: string
  sede?: string
  programa?: string
  contrato?: string
  horas_pregrado?: number | null
  horas_posgrado?: number | null
  estado_master?: string
  estado_master_texto?: string
  fuente_nomina?: string
  lectura_operativa?: string
}

/** La línea de identidad, sin nombre: el portal no lo guarda. La pantalla del administrador la completa con el nombre leído en vivo. */
export const LINEA_PROFESOR = 'Profesor: '

export function componerObservacionAmpliada({ fila, observaciones = [], fecha }: { fila?: FilaAmpliada | null; observaciones?: ObservacionCorta[]; fecha?: string } = {}): string {
  if (!fila) return ''
  const marca = fecha ?? new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const nombrePerfil = REGLAS_BASE[fila.perfil ?? '']?.nombre
  const lineas: string[] = []

  lineas.push(`Revisión de tipología profesoral — ${marca}`)
  lineas.push(`${LINEA_PROFESOR}identificado por el seudónimo ${fila.seudonimo || '—'} · ${fila.sede || '—'} · ${fila.programa || 'sin programa principal'}`)
  lineas.push(`Contrato: ${fila.contrato || '—'} · Perfil ${fila.perfil || '—'}${nombrePerfil ? ` (${nombrePerfil})` : ''}`)

  const esperadas = fila.horas_esperadas
  const carga = esperadas != null
    ? `${hrs(fila.horas_total)} h programadas de ${hrs(esperadas)} h del contrato`
    : `${hrs(fila.horas_total)} h programadas`
  lineas.push(`Veredicto: ${fila.veredicto}. Carga: ${carga}.`)

  lineas.push(`Distribución según la tipología: ${lista([
    ['enseñanza directa', fila.horas_ensenanza],
    ['derivadas de la enseñanza', fila.horas_derivadas],
    ['investigación y/o extensión', fila.horas_inv_ext],
    ['gestión académica', fila.horas_gestion],
    ['capacitación', fila.horas_capacitacion],
    ['comité de programa', fila.horas_comite],
  ])}.`)
  lineas.push(`Distribución según Master: ${lista([
    ['docencia', fila.horas_docencia],
    ['investigación', fila.horas_investigacion],
    ['extensión', fila.horas_extension],
    ['administración', fila.horas_administracion],
    ['bienestar', fila.horas_bienestar],
  ])}.`)
  if (Number(fila.horas_posgrado) > 0) {
    lineas.push(`Enseñanza directa por nivel: pregrado ${hrs(fila.horas_pregrado)} h, posgrado ${hrs(fila.horas_posgrado)} h.`)
  }

  for (const [tipo, titulo, numerar] of SECCIONES) {
    const items = observaciones.filter((o) => o.tipo === tipo)
    if (!items.length) continue
    lineas.push('')
    lineas.push(numerar ? `${titulo} (${items.length}):` : `${titulo}:`)
    items.forEach((o, i) => {
      // Bajo su propio título, el rótulo con que empieza la frase sobra.
      const texto = sinRotulo(String(o.texto || o.resumen || '').replace(/\s+/g, ' ').trim())
      lineas.push(numerar ? `${i + 1}. ${texto}` : texto)
    })
  }
  if (!observaciones.length) {
    lineas.push('')
    lineas.push('Sin observaciones: la distribución cumple todas las reglas del perfil.')
  }

  lineas.push('')
  const estado = fila.estado_master_texto || fila.estado_master || 'sin dato'
  const nomina = FUENTES_NOMINA[fila.fuente_nomina ?? '']
  lineas.push(`Estado en Master: ${estado}${nomina ? ` (nómina: ${nomina.toLowerCase()})` : ''}.`)
  if (fila.lectura_operativa) lineas.push(`Lectura operativa: ${fila.lectura_operativa}.`)

  return lineas.join('\n')
}
