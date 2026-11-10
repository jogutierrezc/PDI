/* Portal de alertas · de las filas de reprobación a lo que dibujan los gráficos (lógica pura). */

import { MIN_DETALLE, cursosDe, filasDelCorte, gruposDeRiesgo, tasa, tasaPorCorte, type AlcancePlan, type CorteRiesgo } from "../monitor/logica";
import { completarRiesgo, type FilaRiesgoEst } from "./estimacion";
import type { ItemRank, PuntoCorteEst, PuntoGrupo } from "./graficos";

export { completarRiesgo, type FilaRiesgoEst };

/** Las filas de un corte; con `estimar` apagado, sin las que no vienen de notas. */
export function filasCorte(filas: FilaRiesgoEst[], corte: CorteRiesgo, alcance: AlcancePlan, estimar: boolean): FilaRiesgoEst[] {
  return (filasDelCorte(filas, corte, alcance) as FilaRiesgoEst[]).filter((f) => estimar || !f.est);
}

/** Los cursos (con detalle) como filas de un ranking; marca los que incluyen algo estimado. */
export function itemsCursos(filas: FilaRiesgoEst[], mostrarPrograma = false): ItemRank[] {
  const estimados = new Set(filas.filter((f) => f.est).map((f) => f.codigo_materia));
  return cursosDe(filas)
    .filter((c) => c.con >= MIN_DETALLE)
    .map((c) => ({ clave: c.codigo_materia, nombre: c.materia, sub: `${c.con.toLocaleString("es-CO")} matrículas, ${c.grupos} ${c.grupos === 1 ? "grupo" : "grupos"}${mostrarPrograma ? `, ${c.programas} ${c.programas === 1 ? "programa" : "programas"}` : ""}`, tasa: c.tasa, est: estimados.has(c.codigo_materia) }));
}

export function puntosGrupos(filas: FilaRiesgoEst[]): PuntoGrupo[] {
  const estimados = new Set(filas.filter((f) => f.est).map((f) => f.grupo_clave));
  return gruposDeRiesgo(filas)
    .filter((g) => g.con >= MIN_DETALLE)
    .map((g) => ({ clave: g.clave, nombre: g.materia, grupo: g.grupo, con: g.con, bajo: g.bajo, tasa: g.tasa, est: estimados.has(g.clave) }));
}

/** La tasa en cada corte, con lo estimado marcado y los cortes sin notas a la vista. */
export function puntosCorte(filas: FilaRiesgoEst[], alcance: AlcancePlan, estimar: boolean): PuntoCorteEst[] {
  const reales = tasaPorCorte(filas.filter((f) => !f.est), alcance);
  return ([1, 2, 3, 4] as CorteRiesgo[]).map((c) => {
    const r = reales.find((x) => x.corte === c);
    if (r) return { corte: c, tasa: r.tasa, con: r.con, hay: true, est: false };
    const fs = estimar ? filasCorte(filas, c, alcance, true).filter((f) => f.est) : [];
    const con = fs.reduce((s, f) => s + f.con, 0);
    return fs.length ? { corte: c, tasa: tasa(fs.reduce((s, f) => s + f.bajo, 0), con), con, hay: true, est: true } : { corte: c, tasa: 0, con: 0, hay: false, est: false };
  });
}

/** El último corte con notas reales (o el 2 si no hay ninguno): donde abre una pantalla por defecto. */
export function corteInicial(filas: FilaRiesgoEst[]): CorteRiesgo {
  const reales = ([3, 2, 1] as CorteRiesgo[]).find((c) => filas.some((f) => !f.est && f.corte === c && f.plan === "tres_cortes"));
  return reales ?? 2;
}
