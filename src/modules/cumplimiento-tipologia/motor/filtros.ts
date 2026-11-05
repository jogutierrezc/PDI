// Portado de Roomy (business-intelligence/utils/biFiltros.js) a TypeScript con el mismo comportamiento.
// Filtrado del corte. Vive fuera del contexto para que el módulo de contexto
// exporte solo su proveedor y su hook.

/** Aplica los filtros activos a la lista de resúmenes. */
export interface FiltrosResumen {
  busqueda?: string
  veredicto?: string
  perfil?: string
  programa?: string
  estadoMaster?: string
  nomina?: string
  causa?: string
  categoria?: string
  tipo?: string
}

export interface FilaFiltrable {
  id: string
  veredicto: string
  perfil: string
  programa: string
  estado_master: string
  fuente_nomina: string
  nombre?: string
  seudonimo?: string
  contrato: string
}

/** Observaciones mínimas que usa el filtro por causa, categoría o tipo. */
export interface ObservacionFiltrable {
  causa: string
  categoria: string
  tipo: string
}

export function filtrarResumenes<T extends FilaFiltrable>(resumenes: T[], filtros: FiltrosResumen, observacionesPorResumen: Map<string, ObservacionFiltrable[]>): T[] {
  const termino = String(filtros.busqueda ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return resumenes.filter((r) => {
    if (filtros.veredicto && r.veredicto !== filtros.veredicto) return false
    if (filtros.perfil && r.perfil !== filtros.perfil) return false
    if (filtros.programa && r.programa !== filtros.programa) return false
    if (filtros.estadoMaster && r.estado_master !== filtros.estadoMaster) return false
    if (filtros.nomina && r.fuente_nomina !== filtros.nomina) return false
    if (filtros.causa || filtros.categoria || filtros.tipo) {
      const obs = observacionesPorResumen.get(r.id) ?? []
      const coincide = obs.some((o) =>
        (!filtros.causa || o.causa === filtros.causa)
        && (!filtros.categoria || o.categoria === filtros.categoria)
        && (!filtros.tipo || o.tipo === filtros.tipo))
      if (!coincide) return false
    }
    if (termino) {
      const heno = `${r.nombre ?? ''} ${r.seudonimo ?? ''} ${r.programa} ${r.perfil} ${r.contrato}`
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (!heno.includes(termino)) return false
    }
    return true
  })
}
