/* =============================================================================
   Convenios · Registro: búsqueda, filtros, orden, tabla densa de 20 por página,
   exportación de lo filtrado (Excel y CSV) y los accesos a Importar y Nuevo.
   Abrir un convenio lleva al detalle a pantalla completa.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { descargarExportacion } from "../contactos/archivos";
import type { Exportacion } from "../lib/exportar-contactos";
import { Pildora, useAviso } from "./comunes";
import { ANCHOS_EXPORTACION, diasFaltantes, ENCABEZADOS_EXPORTACION, filaDeExportacion, filtrar, POR_PAGINA, terminaTexto, TIPOS, fechaLarga, vigenciaDe } from "./logica";
import type { Convenio, Filtros, FiltroEstado, Orden } from "./logica";

const ESTADOS: [FiltroEstado, string][] = [
  ["", "Todos los estados"],
  ["Vigente", "Vigente"],
  ["Por vencer", "Por vencer"],
  ["Vencido", "Vencido"],
  ["tramite", "En trámite"],
  ["Sin fecha", "Sin fecha de término"],
  ["desajuste", "Estado desactualizado"],
];

const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

export function Registro({
  convenios,
  hoy,
  filtros,
  onFiltros,
  crea,
  onAbrir,
  onImportar,
  onNuevo,
}: {
  convenios: Convenio[];
  hoy: string;
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  crea: boolean;
  onAbrir: (id: string) => void;
  onImportar: () => void;
  onNuevo: () => void;
}) {
  const [pagina, setPagina] = useState(0);
  const [aviso, decir] = useAviso();
  const lista = useMemo(() => filtrar(convenios, filtros, hoy), [convenios, filtros, hoy]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas - 1);
  const paises = useMemo(() => unicos(convenios.map((c) => c.pais)), [convenios]);
  const campus = useMemo(() => unicos(convenios.map((c) => c.campus)), [convenios]);

  useEffect(() => setPagina(0), [filtros]);

  const poner = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onFiltros({ ...filtros, [k]: v });
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.tipo || filtros.naturaleza || filtros.pais || filtros.campus);

  const exportar = async (formato: "xlsx" | "csv") => {
    if (!lista.length) return decir("No hay convenios para exportar.");
    const x: Exportacion = {
      encabezados: ENCABEZADOS_EXPORTACION,
      filas: lista.map((c) => filaDeExportacion(c, hoy)),
      archivo: `convenios_${hoy}`,
      hoja: "Convenios",
      anchos: ANCHOS_EXPORTACION,
      repetidas: 0,
    };
    await descargarExportacion(x, formato);
    decir(`${lista.length} convenios exportados.`);
  };

  return (
    <section className="conv-panel">
      <div className="conv-bar">
        {crea ? (
          <button type="button" className="conv-btn conv-btn--pri" onClick={onNuevo}>
            <Icon name="plus" size={16} />
            Nuevo convenio
          </button>
        ) : null}
        {crea ? (
          <button type="button" className="conv-btn" onClick={onImportar}>
            <Icon name="upload" size={16} />
            Importar Excel
          </button>
        ) : null}
        <span className="conv-sep" aria-hidden="true" />
        <button type="button" className="conv-btn" onClick={() => void exportar("xlsx")}>
          <Icon name="download" size={16} />
          Exportar Excel
        </button>
        <button type="button" className="conv-btn" onClick={() => void exportar("csv")}>
          <Icon name="download" size={16} />
          Exportar CSV
        </button>
        <span className="conv-grow" />
        <span className="conv-aviso-linea" role="status" aria-live="polite">
          {aviso}
        </span>
      </div>

      <div className="conv-filtros">
        <input type="search" value={filtros.q} onChange={(e) => poner("q", e.target.value)} placeholder="Buscar institución, país, código u objeto" aria-label="Buscar" />
        <select value={filtros.estado} onChange={(e) => poner("estado", e.target.value as FiltroEstado)} aria-label="Estado">
          {ESTADOS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <select value={filtros.tipo} onChange={(e) => poner("tipo", e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={filtros.naturaleza} onChange={(e) => poner("naturaleza", e.target.value)} aria-label="Naturaleza">
          <option value="">Nacional e internacional</option>
          <option>Internacional</option>
          <option>Nacional</option>
        </select>
        <select value={filtros.pais} onChange={(e) => poner("pais", e.target.value)} aria-label="País">
          <option value="">Todos los países</option>
          {paises.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filtros.campus} onChange={(e) => poner("campus", e.target.value)} aria-label="Campus">
          <option value="">Todos los campus</option>
          {campus.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filtros.orden} onChange={(e) => poner("orden", e.target.value as Orden)} aria-label="Orden">
          <option value="cod">Orden: código</option>
          <option value="venc">Orden: vence primero</option>
          <option value="inst">Orden: institución</option>
        </select>
        {hayFiltros ? (
          <button type="button" className="conv-btn conv-btn--sm" onClick={() => onFiltros({ ...filtros, q: "", estado: "", tipo: "", naturaleza: "", pais: "", campus: "" })}>
            Quitar filtros
          </button>
        ) : null}
      </div>

      <div className="conv-tabla">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Institución</th>
              <th>País</th>
              <th>Tipo</th>
              <th>Firma</th>
              <th>Termina</th>
              <th>Días</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(actual * POR_PAGINA, actual * POR_PAGINA + POR_PAGINA).map((c) => {
              const d = diasFaltantes(c, hoy);
              return (
                <tr
                  key={c.id}
                  tabIndex={0}
                  onClick={() => onAbrir(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAbrir(c.id);
                  }}
                >
                  <td className="conv-mono">{c.codigo}</td>
                  <td>
                    <span className="conv-nm" title={c.institucion}>
                      {c.institucion}
                    </span>
                    <span className="conv-sub">{c.modalidad || "Sin modalidad"}</span>
                  </td>
                  <td>{c.pais}</td>
                  <td>{c.tipo}</td>
                  <td className="conv-mono">{fechaLarga(c.fecha_firma)}</td>
                  <td className="conv-mono">{terminaTexto(c)}</td>
                  <td className="conv-mono">{d == null ? "—" : d}</td>
                  <td>
                    <Pildora vigencia={vigenciaDe(c, hoy)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lista.length ? (
          <div className="conv-vacio">
            <b>{convenios.length ? "Ningún convenio coincide con estos filtros." : "Todavía no hay convenios."}</b>
            <p>{convenios.length ? "Pruebe con otra búsqueda o quite algún filtro." : crea ? "Importe el Excel institucional o cree el primero con «Nuevo convenio»." : "Quien coordina Internacionalización los irá cargando."}</p>
          </div>
        ) : null}
      </div>

      <div className="conv-pie">
        <span>
          <b>{lista.length}</b> de {convenios.length} convenios
        </span>
        <span className="conv-grow" />
        <button type="button" className="conv-btn conv-btn--sm" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>
          Anterior
        </button>
        <span>
          Página <b>{actual + 1}</b> de {paginas}
        </span>
        <button type="button" className="conv-btn conv-btn--sm" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)}>
          Siguiente
        </button>
      </div>
    </section>
  );
}
