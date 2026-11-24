/* =============================================================================
   Gestión Master · Histórico de Rua (solo lectura).

   Rua se apaga: lo que se tramitó allí queda para consultar aquí, sin poder
   cambiarse. Se importa una sola vez desde un export de Rua (JSON) y se puede
   repetir: el folio de Rua es la llave. Importar es de Planeación (gestor).

   Cómo sacar el export: en el editor SQL del proyecto de Rua se corre la
   consulta de abajo, se copia el resultado (una celda JSON) y se pega o se sube
   aquí. Lleva el nombre de quien solicitó y de quienes firmaron, como estaba en
   Rua: son datos de personal de la universidad, y solo los ve quien tiene acceso
   al módulo.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useImportarRua, useRua, type FilaRua } from "./api";
import type { Contexto } from "./contexto";
import { fechaCorta, mensajeDe } from "./modelo";
import { useEntrada } from "./movimiento";
import { Cargando, ErrorCaja, Vacio } from "./partes";

export const SQL_EXPORT_RUA = `select jsonb_agg(jsonb_build_object(
  'folio', s.folio, 'tipo', s.tipo, 'estado', s.estado, 'prioridad', s.prioridad,
  'solicitante', p.nombre_completo, 'unidad', coalesce(v.nombre, ''),
  'concepto', s.concepto_justificativo, 'creada_en', s.creado_en, 'resuelta_en', s.resuelto_en,
  'lineas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'codigo', sa.propuesta_codigo, 'nomenclatura', sa.propuesta_nomenclatura, 'tipo', sa.propuesta_tipo,
      'actual_codigo', a.codigo, 'actual_nomenclatura', a.nomenclatura) order by sa.orden)
    from public.solicitud_actividades sa
    left join public.actividades a on a.id = sa.actividad_id
    where sa.solicitud_id = s.id), '[]'::jsonb),
  'etapas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'etapa', e.nombre, 'estado', se.estado, 'revisor', rp.nombre_completo,
      'justificacion', se.justificacion, 'decidida_en', se.decidida_en) order by se.orden)
    from public.solicitud_etapas se
    join public.etapas_flujo e on e.codigo = se.etapa_codigo
    left join public.perfiles rp on rp.id = se.revisor_id
    where se.solicitud_id = s.id), '[]'::jsonb)
) order by s.creado_en) as export
from public.solicitudes s
join public.perfiles p on p.id = s.solicitante_id
left join public.vicerrectorias v on v.id = p.vicerrectoria_id;`;

const TIPO_RUA: Record<string, string> = { crear: "Crear", editar: "Editar", eliminar: "Eliminar" };
const ESTADO_RUA: Record<string, string> = { borrador: "Borrador", pendiente: "Pendiente", revision: "En revisión", aprobada: "Aprobada", denegada: "Denegada", cancelada: "Cancelada" };

export function Rua({ ctx }: { ctx: Contexto }) {
  const q = useRua();
  const importar = useImportarRua();
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const gestor = ctx.nivel === "gestor";

  const filas = q.data ?? [];
  const visibles = useMemo(() => {
    const t = busqueda.toLowerCase();
    return filas.filter((f) => !t || `${f.folio} ${f.solicitante} ${f.unidad} ${f.lineas.map((l) => `${l.codigo ?? ""} ${l.nomenclatura ?? ""} ${l.actual_nomenclatura ?? ""}`).join(" ")}`.toLowerCase().includes(t));
  }, [filas, busqueda]);
  useEntrada(raiz, ".gm-fila-tabla", `${q.isPending}|${visibles.length}`, !q.isPending);

  async function leerArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setTexto(await archivo.text());
  }

  async function subir() {
    setError("");
    setMensaje("");
    try {
      let datos: unknown = JSON.parse(texto);
      // El editor SQL entrega [{"export": [...]}] o {"export": [...]}: se acepta cualquiera de las tres formas.
      if (Array.isArray(datos) && datos.length === 1 && datos[0] && typeof datos[0] === "object" && "export" in (datos[0] as object)) datos = (datos[0] as { export: unknown }).export;
      else if (datos && typeof datos === "object" && !Array.isArray(datos) && "export" in (datos as object)) datos = (datos as { export: unknown }).export;
      if (!Array.isArray(datos)) throw new Error("Se esperaba una lista de solicitudes de Rua.");
      const n = await importar.mutateAsync(datos);
      setMensaje(`Se importaron ${n} solicitudes de Rua.`);
      setTexto("");
      void q.refetch();
    } catch (e) {
      setError(e instanceof SyntaxError ? "El texto no es un JSON válido. Copie la celda «export» completa." : mensajeDe(e));
    }
  }

  return (
    <div className="gm-seccion-pagina" ref={raiz}>
      <p className="gm-nota">Solicitudes que se tramitaron en Rua. Es un archivo: no se editan ni se reabren. Lo nuevo se pide en «Nueva solicitud».</p>

      <label className="admin-field gm-selector">
        <span>Buscar</span>
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Folio, solicitante, unidad o código" autoComplete="off" />
      </label>

      {q.isPending ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCaja error={q.error} onReintentar={() => void q.refetch()} />
      ) : filas.length === 0 ? (
        <Vacio titulo="Todavía no se ha importado el histórico de Rua" texto={gestor ? "Siga las instrucciones de abajo para importarlo." : "Planeación puede importarlo desde un export de Rua."} />
      ) : (
        <div className="gm-tabla-envoltura">
          <table className="gm-tabla">
            <caption className="sr-only">Solicitudes históricas de Rua</caption>
            <thead>
              <tr>
                <th scope="col">Folio</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
                <th scope="col">Solicitante</th>
                <th scope="col">Unidad</th>
                <th scope="col">Creada</th>
                <th scope="col">Resuelta</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <FilaRuaFila key={f.id} f={f} abierta={abierta === f.id} onAbrir={() => setAbierta(abierta === f.id ? null : f.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gestor && (
        <section aria-labelledby="gm-rua-importar" className="gm-importar">
          <h3 id="gm-rua-importar">Importar el histórico de Rua</h3>
          <ol className="gm-lista-simple">
            <li>En el editor SQL del proyecto de Rua, corra esta consulta.</li>
            <li>Copie la celda «export» (un JSON) y péguela abajo, o suba el archivo.</li>
            <li>Importe. Se puede repetir: un folio ya importado se actualiza, no se duplica.</li>
          </ol>
          <details>
            <summary>Ver la consulta para Rua</summary>
            <pre className="gm-codigo-sql">{SQL_EXPORT_RUA}</pre>
            <button type="button" className="button-secondary" onClick={() => void navigator.clipboard?.writeText(SQL_EXPORT_RUA)}>
              Copiar la consulta
            </button>
          </details>
          <label className="admin-field">
            <span>Export de Rua (JSON)</span>
            <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder='[{"folio":"REQ-2026-0001", ...}]' />
          </label>
          <div className="gm-botones">
            <label className="button-secondary gm-archivo">
              Subir un archivo .json
              <input type="file" accept=".json,application/json,text/plain" className="sr-only" onChange={(e) => void leerArchivo(e.target.files?.[0])} />
            </label>
            <button type="button" className="button-primary" disabled={!texto.trim() || importar.isPending} onClick={() => void subir()}>
              {importar.isPending ? "Importando…" : "Importar"}
            </button>
          </div>
          {mensaje && <p className="gm-nota" role="status">{mensaje}</p>}
          {error && <p className="gm-error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}

function FilaRuaFila({ f, abierta, onAbrir }: { f: FilaRua; abierta: boolean; onAbrir: () => void }) {
  return (
    <>
      <tr className="gm-fila-tabla">
        <td>
          <button type="button" className="gm-grupo__boton" aria-expanded={abierta} onClick={onAbrir}>
            <span className="gm-mono">{f.folio}</span>
          </button>
        </td>
        <td>{TIPO_RUA[f.tipo] ?? f.tipo}</td>
        <td>{ESTADO_RUA[f.estado] ?? f.estado}</td>
        <td>{f.solicitante || "—"}</td>
        <td>{f.unidad || "—"}</td>
        <td>{fechaCorta(f.creada_en)}</td>
        <td>{fechaCorta(f.resuelta_en)}</td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={7}>
            <div className="gm-rua-detalle">
              <h4>Concepto justificativo</h4>
              <p>{f.concepto || "—"}</p>
              <h4>Actividades</h4>
              <ul className="gm-lista-simple">
                {f.lineas.map((l, i) => (
                  <li key={i}>
                    <span className="gm-mono">{l.codigo ?? l.actual_codigo ?? "(sin código)"}</span> {l.nomenclatura ?? l.actual_nomenclatura ?? ""}
                    {l.actual_nomenclatura && l.nomenclatura && l.actual_nomenclatura !== l.nomenclatura ? <small> · antes: {l.actual_nomenclatura}</small> : null}
                  </li>
                ))}
              </ul>
              <h4>Firmas</h4>
              <ul className="gm-lista-simple">
                {f.etapas.length === 0 && <li>Sin etapas registradas.</li>}
                {f.etapas.map((e, i) => (
                  <li key={i}>
                    <b>{e.etapa}</b>: {e.estado}
                    {e.revisor ? ` · ${e.revisor}` : ""}
                    {e.decidida_en ? ` · ${fechaCorta(e.decidida_en)}` : ""}
                    {e.justificacion ? <em> «{e.justificacion}»</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
