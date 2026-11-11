/* Tablero IGA · filtros por la estructura institucional (vicerrectoría → facultad → sede → programa).
   Las opciones salen de los programas que existen y se encadenan: elegir una facultad deja las sedes y programas de esa facultad. */

import { distintos, filtrarProgramas } from "./financiero-datos";
import type { FiltroFin, ProgramaFin } from "./financiero-datos";

export const SIN_FILTRO: FiltroFin = { vr: "", fac: "", sede: "", prog: "" };

export function BarraFiltros({ programas, filtros, poner }: { programas: ProgramaFin[]; filtros: FiltroFin; poner: (c: Partial<FiltroFin>) => void }) {
  const base = filtrarProgramas(programas, { ...SIN_FILTRO, vr: filtros.vr });
  const facultades = distintos(base.map((p) => p.facultad));
  const sedes = distintos(filtrarProgramas(base, { ...SIN_FILTRO, fac: filtros.fac }).map((p) => p.sede));
  const progs = distintos(filtrarProgramas(base, { ...SIN_FILTRO, fac: filtros.fac, sede: filtros.sede }).map((p) => p.programa));
  const activo = Boolean(filtros.vr || filtros.fac || filtros.sede || filtros.prog);
  const campo = (etiqueta: string, valor: string, lista: string[], todas: string, cambio: (v: string) => void) => (
    <label className="iga-campo">
      <span>{etiqueta}</span>
      <select value={valor} onChange={(e) => cambio(e.target.value)}>
        <option value="">{todas}</option>
        {lista.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </label>
  );
  return (
    <div className="iga-filtros" role="group" aria-label="Filtros por la estructura institucional">
      <label className="iga-campo">
        <span>Vicerrectoría</span>
        <select value={filtros.vr} onChange={(e) => poner({ vr: e.target.value === "pos" ? "pos" : "", fac: "", prog: "" })}>
          <option value="">Todas</option>
          <option value="pos">Posgrados</option>
        </select>
      </label>
      {campo("Facultad", filtros.fac, facultades, "Toda la UDES", (v) => poner({ fac: v, prog: "" }))}
      {campo("Sede", filtros.sede, sedes, "Todas", (v) => poner({ sede: v, prog: "" }))}
      {campo("Programa", filtros.prog, progs, "Todos", (v) => poner({ prog: v }))}
      {activo && <button type="button" className="iga-limpiar" onClick={() => poner({ ...SIN_FILTRO })}>Quitar filtros</button>}
    </div>
  );
}
