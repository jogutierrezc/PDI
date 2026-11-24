/* =============================================================================
   UI GreenMetric · la lista de los 118 indicadores: búsqueda, filtros, vista
   plana o por categoría, responsable con su oficina, estado, campos completos,
   evidencias y última edición.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { compararQ, codigoConPunto } from "../lib/catalogo";
import { ESTADOS, ETIQUETA_ESTADO } from "../lib/estados";
import type { CategoriaId, EstadoRespuesta, PreguntaCiclo, RespuestaUgm } from "../lib/tipos";
import { Barra, Estado, Vacio, hace } from "./comunes";
import { useUgm } from "./contexto";
import { useConteoEvidencias } from "./lectura";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Indicadores() {
  const u = useUgm();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState("");
  const [cat, setCat] = useState<CategoriaId | "">("");
  const [persona, setPersona] = useState("");
  const [porCategoria, setPorCategoria] = useState(false);
  const estado = (params.get("estado") ?? "") as EstadoRespuesta | "";
  const evidencias = useConteoEvidencias(u.ciclo.id);

  const responsable = useMemo(() => new Map(u.asignaciones.filter((a) => a.rol === "responsable" && a.q).map((a) => [a.q as string, a])), [u.asignaciones]);
  const personas = useMemo(() => [...new Set([...responsable.values()].map((a) => a.usuario_id))], [responsable]);

  const filas = useMemo(() => {
    const t = sinTildes(texto.trim());
    return u.preguntas
      .map((p) => ({ p, r: u.porQ.get(p.q) }))
      .filter((x): x is { p: PreguntaCiclo; r: RespuestaUgm } => !!x.r)
      .filter(({ p, r }) => {
        if (cat && p.categoria !== cat) return false;
        if (estado && r.estado !== estado) return false;
        const a = responsable.get(p.q);
        if (persona === "none" ? !!a : persona && a?.usuario_id !== persona) return false;
        return !t || sinTildes(`${p.q} ${p.indicador ?? ""} ${codigoConPunto(p.indicador)} ${p.nombre_es} ${p.nombre_en} ${a ? u.nombre(a.usuario_id) : ""}`).includes(t);
      })
      .sort((a, b) => compararQ(a.p.q, b.p.q));
  }, [u, texto, cat, estado, persona, responsable]);

  const marcados = u.seleccion;
  const alternar = (q: string) => {
    const n = new Set(marcados);
    if (n.has(q)) n.delete(q);
    else n.add(q);
    u.setSeleccion(n);
  };
  const todosMarcados = filas.length > 0 && filas.every(({ p }) => marcados.has(p.q));

  const fila = ({ p, r }: { p: PreguntaCiclo; r: RespuestaUgm }) => {
    const a = responsable.get(p.q);
    const nEv = evidencias.data?.get(r.id) ?? 0;
    return (
      <tr key={p.q}>
        {u.esAdmin && !u.soloMios && (
          <td className="ugm-chk">
            <input type="checkbox" aria-label={`Marcar ${p.q}`} checked={marcados.has(p.q)} onChange={() => alternar(p.q)} />
          </td>
        )}
        <td data-et="Pregunta" className="ugm-num ugm-cod">
          {p.q}
        </td>
        <td data-et="Indicador" className="ugm-celda-nombre">
          <button type="button" className="ugm-link ugm-link--bloque" onClick={() => u.abrir(p.q)}>
            {p.nombre_es}
          </button>
          <small>
            {p.categoria}
            {p.indicador ? ` · ${codigoConPunto(p.indicador)}` : ""}
            {p.calculada ? " · calculado" : ""}
          </small>
        </td>
        <td data-et="Responsable">
          {a ? (
            <>
              {u.nombre(a.usuario_id)}
              <small>{u.oficina(a.unidad_id)}</small>
            </>
          ) : (
            <span className="ugm-muted">Sin responsable</span>
          )}
        </td>
        <td data-et="Estado">
          <Estado estado={r.estado} />
        </td>
        <td data-et="Campos completos" className="ugm-celda-pct">
          <span className="ugm-num">{r.completitud} %</span>
          <Barra aprobado={r.completitud} etiqueta={`${r.completitud} % de campos completos`} />
        </td>
        <td data-et="Evidencias" className="ugm-num ugm-der">
          {p.requiere_evidencia || nEv ? nEv : "—"}
          {p.requiere_evidencia && nEv === 0 && r.estado !== "sin_asignar" && <span className="ugm-falta"> falta</span>}
        </td>
        <td data-et="Última edición" className="ugm-muted">
          {hace(r.updated_at)}
        </td>
      </tr>
    );
  };

  const cabecera = (
    <thead>
      <tr>
        {u.esAdmin && !u.soloMios && (
          <th scope="col" className="ugm-chk">
            <input
              type="checkbox"
              aria-label="Marcar todos los que se ven"
              checked={todosMarcados}
              onChange={() => {
                const n = new Set(marcados);
                filas.forEach(({ p }) => (todosMarcados ? n.delete(p.q) : n.add(p.q)));
                u.setSeleccion(n);
              }}
            />
          </th>
        )}
        <th scope="col">N.º</th>
        <th scope="col">Indicador</th>
        <th scope="col">Responsable</th>
        <th scope="col">Estado</th>
        <th scope="col">Campos completos</th>
        <th scope="col" className="ugm-der">
          Evidencias
        </th>
        <th scope="col">Última edición</th>
      </tr>
    </thead>
  );

  return (
    <div className="ugm-pila">
      <section className="ugm-sec ugm-filtros" aria-label="Buscar y filtrar">
        <div className="ugm-buscar">
          <Icon name="search" size={16} />
          <label className="ugm-sr" htmlFor="ugm-buscar">
            Buscar indicador
          </label>
          <input id="ugm-buscar" className="ugm-input" type="search" placeholder="Buscar por número, nombre o persona" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="ugm-chips" role="group" aria-label="Categoría">
          <button type="button" className="ugm-chip" aria-pressed={cat === ""} onClick={() => setCat("")}>
            Todas
          </button>
          {u.categorias.map((c) => (
            <button key={c.categoria} type="button" className="ugm-chip" aria-pressed={cat === c.categoria} onClick={() => setCat(cat === c.categoria ? "" : c.categoria)} title={c.nombre_es}>
              {c.categoria}
            </button>
          ))}
        </div>
        <label className="ugm-sr" htmlFor="ugm-f-estado">
          Estado
        </label>
        <select
          id="ugm-f-estado"
          className="ugm-input ugm-input--sel ugm-input--sm"
          value={estado}
          onChange={(e) => {
            const p = new URLSearchParams(params);
            if (e.target.value) p.set("estado", e.target.value);
            else p.delete("estado");
            setParams(p, { replace: true });
          }}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
        <label className="ugm-sr" htmlFor="ugm-f-resp">
          Responsable
        </label>
        <select id="ugm-f-resp" className="ugm-input ugm-input--sel ugm-input--sm" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">Todas las personas</option>
          <option value="none">Sin responsable</option>
          {personas.map((id) => (
            <option key={id} value={id}>
              {u.nombre(id)}
            </option>
          ))}
        </select>
        <button type="button" className="ugm-btn ugm-btn--sm" aria-pressed={porCategoria} onClick={() => setPorCategoria(!porCategoria)}>
          <Icon name={porCategoria ? "list" : "layers"} size={16} /> {porCategoria ? "Ver lista" : "Ver por categoría"}
        </button>
      </section>

      {marcados.size > 0 && u.esAdmin && !u.soloMios && (
        <div className="ugm-barra-sel" role="region" aria-label="Acciones sobre la selección">
          <b className="ugm-num">{marcados.size}</b> {marcados.size === 1 ? "marcado" : "marcados"}
          <button type="button" className="ugm-btn ugm-btn--pri ugm-btn--sm" onClick={() => u.ir("asignar")}>
            <Icon name="user" size={16} /> Asignar responsable
          </button>
          <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => u.setSeleccion(new Set())}>
            Limpiar
          </button>
        </div>
      )}

      <p className="ugm-muted ugm-peq" aria-live="polite">
        {filas.length} de {u.respuestas.length} indicadores
      </p>

      {filas.length === 0 ? (
        <Vacio>Ningún indicador coincide con estos filtros.</Vacio>
      ) : porCategoria ? (
        u.categorias
          .filter((c) => filas.some(({ p }) => p.categoria === c.categoria))
          .map((c) => (
            <section key={c.categoria} className="ugm-sec">
              <h2>
                <b className="ugm-cod">{c.categoria}</b> {c.nombre_es}
              </h2>
              <div className="ugm-tabla-marco">
                <table className="ugm-tabla ugm-tabla--lista">
                  {cabecera}
                  <tbody>{filas.filter(({ p }) => p.categoria === c.categoria).map(fila)}</tbody>
                </table>
              </div>
            </section>
          ))
      ) : (
        <div className="ugm-tabla-marco">
          <table className="ugm-tabla ugm-tabla--lista">
            {cabecera}
            <tbody>{filas.map(fila)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
