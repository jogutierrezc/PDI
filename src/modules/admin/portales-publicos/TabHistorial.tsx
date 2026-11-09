/* =============================================================================
   Portales públicos · pestaña «Historial».

   La bitácora (pub_bitacora): quién, cuándo y qué cambió, con lo que había antes y
   lo que quedó. La llenan disparadores de la base, así que nadie puede cambiar un
   portal o un vínculo sin dejar rastro. Muestra los 200 cambios más recientes.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { BitacoraFila } from "./datos";

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const ACCION: Record<string, { texto: string; tono: "ok" | "mal" | "info" }> = {
  "portal.habilitar": { texto: "Portal habilitado", tono: "ok" },
  "portal.deshabilitar": { texto: "Portal deshabilitado", tono: "mal" },
  "portal.editar": { texto: "Mensaje del portal", tono: "info" },
  "menu.crear": { texto: "Vínculo cambiado", tono: "info" },
  "menu.cambiar": { texto: "Vínculo modificado", tono: "info" },
  "menu.restaurar": { texto: "Vínculo restaurado", tono: "ok" },
};

const CAMPO: Record<string, string> = {
  habilitado: "Habilitado",
  mensaje: "Mensaje",
  regreso: "Regreso",
  oculto: "Oculto",
  etiqueta: "Etiqueta",
  destino: "Destino",
  desde: "Desde",
  hasta: "Hasta",
  nota: "Nota",
};

const IGNORAR = new Set(["slug", "clave", "portal", "nombre", "descripcion", "orden", "etiqueta_original"]);

function ver(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if ((campo === "regreso" || campo === "desde" || campo === "hasta") && typeof valor === "string") {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? valor : FECHA.format(d);
  }
  return String(valor);
}

/** Los campos que cambiaron, con su antes y su después. */
function diferencias(f: BitacoraFila): { campo: string; antes: string; despues: string }[] {
  const antes = f.antes ?? {};
  const despues = f.despues ?? {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((c) => !IGNORAR.has(c));
  return campos
    .filter((c) => JSON.stringify(antes[c] ?? null) !== JSON.stringify(despues[c] ?? null))
    .map((c) => ({ campo: CAMPO[c] ?? c, antes: ver(c, antes[c]), despues: ver(c, despues[c]) }));
}

export function TabHistorial({ filas, actualizando, onActualizar, nombres }: { filas: BitacoraFila[]; actualizando: boolean; onActualizar: () => void; nombres: Map<string, string> }) {
  const [buscar, setBuscar] = useState("");
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? filas.filter((f) => `${f.clave} ${f.actor_nombre} ${ACCION[f.accion]?.texto ?? f.accion} ${nombres.get(f.clave) ?? ""}`.toLowerCase().includes(q)) : filas;
  }, [filas, buscar, nombres]);

  return (
    <div className="ppa-pestana">
      <div className="ppa-filtros">
        <p className="ppa-intro">Cada cambio queda anotado por la base de datos: quién lo hizo, cuándo, qué había antes y qué quedó. Se muestran los 200 más recientes.</p>
        <label className="admin-field">
          <span>Buscar</span>
          <input type="search" value={buscar} placeholder="Portal, clave o persona" onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <button type="button" className="button-secondary" disabled={actualizando} onClick={onActualizar}>
          {actualizando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="admin-empty">{filas.length === 0 ? "Todavía no se ha cambiado nada: los portales y el menú están como en el código." : "Ningún cambio coincide con la búsqueda."}</p>
      ) : (
        <ol className="ppa-historial">
          {visibles.map((f) => {
            const a = ACCION[f.accion] ?? { texto: f.accion, tono: "info" as const };
            const cambios = diferencias(f);
            return (
              <li key={f.id} className="ppa-evento" data-tono={a.tono}>
                <div className="ppa-evento__cabeza">
                  <strong>{a.texto}</strong>
                  <span>
                    {nombres.get(f.clave) ? `${nombres.get(f.clave)} · ` : ""}
                    <code>{f.clave}</code>
                  </span>
                  <time dateTime={f.created_at}>{FECHA.format(new Date(f.created_at))}</time>
                </div>
                <p className="ppa-evento__quien">{f.actor_nombre || "Persona no identificada"}</p>
                {cambios.length > 0 && (
                  <ul className="ppa-evento__cambios">
                    {cambios.map((c) => (
                      <li key={c.campo}>
                        <b>{c.campo}:</b> <span>{c.antes}</span> → <span>{c.despues}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
