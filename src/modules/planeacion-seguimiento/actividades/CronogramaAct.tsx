/* Planeación y Seguimiento · Fase 2 · CRONOGRAMA de actividades (Gantt) por oficina o por persona.
   Reutiliza la estructura y las clases del Gantt de la fase 1 (ps-gantt); la escala es de meses, no de años. */

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { Nota } from "../partes";
import { fecha } from "../modelo";
import { BarraActividades, useDatosActividades } from "./barra";
import { DEF_ESTADOS, diasEntre, sumarDias, type Actividad } from "./modelo";
import { ChipEstado } from "./partes";
import { SinOficinas } from "./vacios";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Primer día de cada mes (o trimestre si el rango es largo) entre dos fechas. */
export function marcasDeTiempo(ini: string, fin: string): { fecha: string; texto: string }[] {
  const meses = (Number(fin.slice(0, 4)) - Number(ini.slice(0, 4))) * 12 + Number(fin.slice(5, 7)) - Number(ini.slice(5, 7)) + 1;
  const paso = meses > 30 ? 6 : meses > 14 ? 3 : 1;
  const out: { fecha: string; texto: string }[] = [];
  let y = Number(ini.slice(0, 4));
  let m = Number(ini.slice(5, 7));
  while (`${y}-${String(m).padStart(2, "0")}-01` <= fin) {
    out.push({ fecha: `${y}-${String(m).padStart(2, "0")}-01`, texto: `${MES[m - 1]} ${String(y).slice(2)}` });
    m += paso;
    while (m > 12) { m -= 12; y += 1; }
  }
  return out;
}

export function CronogramaAct() {
  const d = useDatosActividades();
  const { ruta } = usePs();
  const [params, setParams] = useSearchParams();
  const por = params.get("por") === "oficina" ? "oficina" : "persona";
  const conFecha = useMemo(() => d.filtradas.filter((a) => a.fin), [d.filtradas]);
  const rango = useMemo(() => {
    if (!conFecha.length) return null;
    const ini = conFecha.map((a) => a.inicio ?? a.fin!).sort()[0];
    const fin = conFecha.map((a) => a.fin!).sort().at(-1)!;
    const i0 = `${ini.slice(0, 7)}-01`;
    const f = new Date(`${fin.slice(0, 7)}-01T00:00:00Z`);
    f.setUTCMonth(f.getUTCMonth() + 1);
    return { ini: i0, fin: f.toISOString().slice(0, 10) };
  }, [conFecha]);
  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; acts: Actividad[] }>();
    for (const a of conFecha) {
      const claves = por === "oficina" ? [a.oficinaId] : a.asignados.length ? a.asignados : ["__sin__"];
      for (const k of claves) {
        const g = m.get(k) ?? { titulo: por === "oficina" ? (d.porId.get(k)?.nombre ?? "Oficina") : k === "__sin__" ? "Sin responsable" : d.nombreDe(k), acts: [] };
        g.acts.push(a);
        m.set(k, g);
      }
    }
    return [...m.entries()].sort((a, b) => (a[0] === "__sin__" ? 1 : b[0] === "__sin__" ? -1 : a[1].titulo.localeCompare(b[1].titulo, "es"))).map(([k, g]) => ({ k, ...g, acts: g.acts.sort((x, y) => (x.inicio ?? x.fin!).localeCompare(y.inicio ?? y.fin!)) }));
  }, [conFecha, por, d.porId, d.nombreDe]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.cargando) return <LoadingBlock rows={4} label="Cargando el cronograma" />;
  if (!d.oficinas.length) return <SinOficinas />;
  const marcas = rango ? marcasDeTiempo(rango.ini, rango.fin) : [];
  const total = rango ? Math.max(1, diasEntre(rango.ini, rango.fin)) : 1;
  const pos = (f: string) => Math.min(100, Math.max(0, (diasEntre(rango!.ini, f) / total) * 100));
  const hoyPos = rango && d.hoy >= rango.ini && d.hoy <= rango.fin ? pos(d.hoy) : null;
  const sin = d.filtradas.length - conFecha.length;
  return (
    <div className="ps-seccion">
      <BarraActividades d={d} />
      <div className="ps-selector ps-selector--linea">
        <label htmlFor="ps-por">Ver por</label>
        <select id="ps-por" value={por} onChange={(e) => { const s = new URLSearchParams(params); s.set("por", e.target.value); setParams(s, { replace: true }); }}>
          <option value="persona">Persona</option>
          <option value="oficina">Oficina</option>
        </select>
      </div>
      {d.cargandoActs ? <LoadingBlock rows={4} label="Cargando actividades" /> : !rango ? (
        <EmptyBlock title="No hay actividades con fecha para dibujar" hint="Cree actividades con su fecha de fin, o cambie la búsqueda." />
      ) : (
        <>
          <div className="ps-gantt ps-gantt--act" role="table" aria-label={`Cronograma de actividades por ${por}`}>
            <div className="ps-gantt__fila ps-gantt__cab" role="row">
              <span role="columnheader" className="ps-gantt__l">Actividad</span>
              <span role="columnheader" className="ps-gantt__t ps-gantt__t--meses" aria-hidden="true">
                {marcas.map((m) => <span key={m.fecha} style={{ left: `${pos(m.fecha)}%` }}>{m.texto}</span>)}
              </span>
            </div>
            {grupos.map((g) => (
              <div role="rowgroup" key={g.k}>
                <div className="ps-gantt__grupo" role="row"><span role="cell"><strong>{g.titulo}</strong> · {g.acts.length} {g.acts.length === 1 ? "actividad" : "actividades"}</span></div>
                {g.acts.map((a) => {
                  const ini = a.inicio ?? a.fin!;
                  return (
                    <div className="ps-gantt__fila" role="row" key={`${g.k}-${a.id}`}>
                      <span role="cell" className="ps-gantt__l">
                        <Link to={ruta("actividad", a.id)} state={DESDE_MODULO}>{a.titulo}</Link>
                        <em className="ps-gantt__fechas">{a.esHito ? `Hito · ${fecha(a.fin)}` : `${fecha(a.inicio)} a ${fecha(a.fin)}`} · <ChipEstado estado={a.estado} /></em>
                      </span>
                      <span role="cell" className="ps-gantt__t ps-gantt__t--meses" aria-hidden="true">
                        {marcas.map((m) => <i key={m.fecha} className="ps-gantt__linea" style={{ left: `${pos(m.fecha)}%` }} />)}
                        {hoyPos !== null ? <i className="ps-gantt__hoy" style={{ left: `${hoyPos}%` }} /> : null}
                        {a.esHito ? (
                          <i className="ps-gantt__hito" data-tono={DEF_ESTADOS[a.estado].tono} style={{ left: `${pos(a.fin!)}%` }} />
                        ) : (
                          <i className="ps-gantt__barra ps-gantt__barra--act" data-tono={DEF_ESTADOS[a.estado].tono} style={{ left: `${pos(ini)}%`, width: `${Math.max(0.8, pos(sumarDias(a.fin!, 1)) - pos(ini))}%` }} />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <ul className="ps-leyenda ps-leyenda--linea">
            {Object.values(DEF_ESTADOS).map((e) => <li key={e.id}><i className="ps-sw ps-sw--estado" data-tono={e.tono} aria-hidden="true" />{e.nombre}</li>)}
            <li><i className="ps-gantt__hoy ps-gantt__hoy--leyenda" aria-hidden="true" />Hoy ({fecha(d.hoy)})</li>
          </ul>
          {sin > 0 ? <Nota>{sin} {sin === 1 ? "actividad" : "actividades"} sin fecha no aparecen en el cronograma.</Nota> : null}
        </>
      )}
    </div>
  );
}
