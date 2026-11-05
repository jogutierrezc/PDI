// Portado de Roomy (business-intelligence/utils/observacion255.js) a TypeScript con el mismo comportamiento.
// ─── Observación para pegar en Master ───────────────────────────────────────
//
// El campo de observación de Master valida en el propio navegador:
//
//     ng-disabled="… status_payroll.refuse.length < 20 ||
//                    status_payroll.refuse.length > 255"
//
// Es decir, entre 20 y 255 caracteres, ambos inclusive. Por debajo o por
// encima el botón «Guardar» queda deshabilitado y el revisor no entiende por
// qué. La observación que genera el modelo es mucho más larga —una frase
// completa por regla rota, con las horas de cada lado— así que pegarla tal
// cual nunca funciona.
//
// Este módulo la arma aprovechando el espacio, en tres pasadas:
//
//   1. **Todas las causas, en su versión corta.** Lo que bloquea va primero y,
//      si hay que recortar, se recorta por el final: nunca una causa a la
//      mitad. Lo que no entra se anuncia con «+N más».
//   2. **Las causas se amplían a su texto largo**, en el mismo orden de
//      prioridad, mientras quepan. Una observación de 83 caracteres cuando el
//      campo admite 255 obliga al revisor a abrir el portal para entenderla.
//   3. **Contexto al final**: la distribución de horas de la tipología y, si
//      no hubo nada que decir, que la revisión se hizo y salió limpia.
//
// Siempre queda entre 20 y 255.

import { hrs } from './formato'

export const MIN_MASTER = 20
export const MAX_MASTER = 255

/** Orden en que las causas entran al resumen: lo que bloquea, primero. */
const PRIORIDAD: Record<string, number> = {
  'Incumplimiento': 0,
  'Consideración de aprobación': 1,
  'Pendiente de fuente': 2,
  'Corrección de codificación': 3,
  'Recomendación de perfil': 4,
  'Preventiva': 5,
}

const SEPARADOR = '. '

/** Recorta espacios repetidos y saltos de línea, que Master no respeta. */
function limpiar(texto: unknown): string {
  return String(texto ?? '').replace(/\s+/g, ' ').trim()
}

/** Sin el punto final: el separador ya lo pone. */
const sinCierre = (texto: unknown) => limpiar(texto).replace(/[\s.;:]+$/, '')

/**
 * El contexto que la observación necesita, sacado de una fila de
 * `bi_profesor_resumen`. La sincronización y la ficha lo arman igual, así que
 * las dos producen el mismo texto.
 */
/** Lo que la observación necesita de una fila del resumen (las horas por rubro y canasta). */
export interface FilaHoras {
  perfil?: string
  veredicto?: string
  horas_total?: number | null
  horas_esperadas?: number | null
  horas_ensenanza?: number | null
  horas_derivadas?: number | null
  horas_inv_ext?: number | null
  horas_gestion?: number | null
  horas_capacitacion?: number | null
  horas_comite?: number | null
  horas_docencia?: number | null
  horas_investigacion?: number | null
  horas_extension?: number | null
  horas_administracion?: number | null
  horas_bienestar?: number | null
}

export interface ObservacionCorta {
  texto?: string
  resumen?: string
  tipo?: string
}

export interface ContextoObservacion {
  perfil?: string
  veredicto?: string
  horas?: { total: unknown; esperadas: unknown }
  distribucion?: Record<string, unknown>
  canastas?: Record<string, unknown>
}

export function contextoDeFila(fila: FilaHoras | null | undefined): ContextoObservacion {
  if (!fila) return {}
  return {
    perfil: fila.perfil,
    veredicto: fila.veredicto,
    horas: { total: fila.horas_total, esperadas: fila.horas_esperadas },
    distribucion: {
      'ens. directa': fila.horas_ensenanza,
      derivadas: fila.horas_derivadas,
      'inv/ext': fila.horas_inv_ext,
      'gestión': fila.horas_gestion,
      'capacitación': fila.horas_capacitacion,
      'comité': fila.horas_comite,
    },
    // Las canastas de Master sí suman el total —incluido bienestar, que la
    // tipología no desglosa—, así que completan el cuadro cuando hay sitio.
    canastas: {
      docencia: fila.horas_docencia,
      'investigación': fila.horas_investigacion,
      'extensión': fila.horas_extension,
      'administración': fila.horas_administracion,
      bienestar: fila.horas_bienestar,
    },
  }
}

/** «Distribución: ens. directa 22, derivadas 8, gestión 8 h», sin los ceros. */
function textoDistribucion(distribucion: Record<string, unknown> | undefined, rotulo = 'Distribución'): string {
  const partes = Object.entries(distribucion ?? {})
    .filter(([, valor]) => Number(valor) > 0)
    .map(([nombre, valor]) => `${nombre} ${hrs(valor)}`)
  return partes.length ? `${rotulo}: ${partes.join(', ')} h` : ''
}

/** La frase que cierra un caso sin observaciones, según el veredicto. */
function cierre(veredicto?: string, perfil?: string): string {
  if (veredicto === 'Cumple') return `Revisión automática: cumple todas las reglas de la tipología ${perfil ?? ''}`.trim()
  if (veredicto === 'No aplica') return 'Contrato sin tipología 2026: no hay reglas automáticas que aplicar, requiere revisión operativa'
  if (veredicto === 'Pendiente parametrizar') return 'Perfil pendiente de parametrizar en el modelo de tipología'
  return 'Revisión automática de tipología sin observaciones'
}

/**
 * Compone la observación de 255 caracteres para un profesor.
 *
 * @param {object} opciones
 * @param {string} opciones.perfil        código de perfil, para dar contexto
 * @param {string} opciones.veredicto     Cumple / No cumple / …
 * @param {Array}  opciones.observaciones lista con `{ texto, resumen, tipo }`
 * @param {string} [opciones.fecha]       fecha de revisión, formato dd/MM/yyyy
 * @param {{ total, esperadas }} [opciones.horas]  carga programada y la del contrato
 * @param {object} [opciones.distribucion] horas por rubro de la tipología
 * @param {object} [opciones.canastas]     horas por canasta de Master
 * @returns {{ texto: string, incluidas: number, omitidas: number, longitud: number }}
 */
export function componerObservacion255({ perfil, veredicto, observaciones = [], fecha, horas, distribucion, canastas }: ContextoObservacion & {
  observaciones?: ObservacionCorta[]
  fecha?: string
} = {}): { texto: string; incluidas: number; omitidas: number; longitud: number } {
  const marca = fecha ?? new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const total = Number(horas?.total)
  const carga = horas && Number.isFinite(total)
    ? ` (${hrs(total)}${horas.esperadas != null ? `/${hrs(horas.esperadas)}` : ''} h)`
    : ''
  const encabezado = sinCierre(`${marca} ${perfil ?? ''} ${veredicto ?? ''}`) + carga

  // La consideración de aprobación ya nombra el perfil sugerido: repetirlo en
  // un campo de 255 caracteres es gastar el espacio dos veces.
  const conConsideracion = observaciones.some((o) => o.tipo === 'Consideración de aprobación')
  const ordenadas = observaciones
    .filter((o) => !(conConsideracion && o.tipo === 'Recomendación de perfil'))
    .map((o, indice) => ({ ...o, indice }))
    .sort((a, b) => (PRIORIDAD[a.tipo ?? ''] ?? 9) - (PRIORIDAD[b.tipo ?? ''] ?? 9) || a.indice - b.indice)
    .map((o) => ({ corto: sinCierre(o.resumen || o.texto), largo: sinCierre(o.texto || o.resumen) }))
    .filter((o) => o.corto)

  const armar = (partes: string[], omitidas = 0, extras: string[] = []) => {
    const piezas = [encabezado, ...partes]
    if (omitidas > 0) piezas.push(`+${omitidas} más`)
    return `${[...piezas, ...extras].filter(Boolean).join(SEPARADOR)}.`
  }
  const cabe = (texto: string) => texto.length <= MAX_MASTER

  // 1. Causas cortas, mientras quepan con el aviso de las que faltan.
  const partes: string[] = []
  let omitidas = 0
  for (let i = 0; i < ordenadas.length; i += 1) {
    const restantes = ordenadas.length - i - 1
    if (!cabe(armar([...partes, ordenadas[i].corto], restantes))) {
      omitidas = ordenadas.length - i
      break
    }
    partes.push(ordenadas[i].corto)
  }

  // Si ni la primera causa cabe entera, vale más recortarla que anunciar «+1
  // más» sobre un texto vacío: quien lea en Master necesita saber de qué se
  // trata, aunque la frase quede a medias.
  if (partes.length === 0 && ordenadas.length > 0) {
    const sobra = ordenadas.length - 1
    const espacio = MAX_MASTER - armar([''], sobra).length - 1
    if (espacio > 0) {
      partes.push(`${ordenadas[0].corto.slice(0, espacio).trimEnd()}…`)
      omitidas = sobra
    }
  }

  // 2. Cada causa incluida pasa a su texto largo si todavía cabe.
  for (let i = 0; i < partes.length; i += 1) {
    const largo = ordenadas[i]?.largo
    if (!largo || largo === partes[i]) continue
    const prueba = partes.map((p, j) => (j === i ? largo : p))
    if (cabe(armar(prueba, omitidas))) partes[i] = largo
  }

  // 3. Contexto, si queda sitio.
  const extras: string[] = []
  const candidatos = [
    ordenadas.length === 0 ? cierre(veredicto, perfil) : '',
    textoDistribucion(distribucion, 'Tipología'),
    textoDistribucion(canastas, 'Master'),
  ].filter(Boolean)
  for (const extra of candidatos) {
    if (cabe(armar(partes, omitidas, [...extras, extra]))) extras.push(extra)
  }

  let texto = armar(partes, omitidas, extras)

  // Un profesor sin observaciones ni horas deja un texto demasiado corto.
  if (texto.length < MIN_MASTER) {
    texto = `${texto} Revisión automática de tipología sin observaciones.`.trim()
  }
  // Defensa final: ninguna ruta debería llegar aquí, pero el campo de Master no
  // admite un carácter de más y vale más recortar que dejar el botón muerto.
  if (texto.length > MAX_MASTER) texto = `${texto.slice(0, MAX_MASTER - 1).trimEnd()}…`

  return {
    texto,
    incluidas: partes.length,
    omitidas,
    longitud: texto.length,
  }
}

/**
 * Copia al portapapeles y devuelve si lo consiguió.
 *
 * `navigator.clipboard` no existe fuera de contextos seguros ni en algunos
 * navegadores embebidos, así que hay un camino de respaldo con un textarea
 * fuera de pantalla. El llamador decide qué decirle al usuario.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Sigue por el camino de respaldo.
  }
  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
