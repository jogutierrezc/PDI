/* =============================================================================
   CMS Portales · campo «referencia» del inspector.

   Elige cosas que ya existen en la base: los indicadores PUBLICADOS de Datos de
   Sostenibilidad (varios, con búsqueda y orden) o un tablero publicado (uno).
   Las opciones se cargan al abrir el bloque; con estado de carga, de vacío y de
   error (incluida la migración sin aplicar). Guarda solo ids; si una elección
   ya no está publicada se ve marcada y la página pública la omite.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { esFaltaMigracion } from "../../datos-sostenibilidad/sos";
import { useIndicadoresPublicados, useTablerosPublicos } from "../../datos-sostenibilidad/tableros";
import type { CampoBloque } from "./bloques";

interface Opcion {
  id: string;
  nombre: string;
  detalle: string;
}

const TOPE = 24;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los ids guardados como lista de textos; cualquier otra cosa es una lista vacía. */
const idsDe = (valor: unknown): string[] => (Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : []);

export function CampoReferencia({ campo, valor, onCambio }: { campo: CampoBloque; valor: unknown; onCambio: (valor: unknown, fusion: boolean) => void }) {
  return campo.fuente === "tableros" ? (
    <ReferenciaTablero campo={campo} valor={typeof valor === "string" ? valor : ""} onCambio={onCambio} />
  ) : (
    <ReferenciaIndicadores campo={campo} ids={idsDe(valor)} onCambio={onCambio} />
  );
}

/** El texto que reemplaza al selector mientras carga, falla o no hay nada que elegir; vacío si hay opciones. */
function estadoDe(cargando: boolean, error: unknown, cuantas: number, vacio: string): string {
  if (cargando) return "Cargando las opciones…";
  if (error) return esFaltaMigracion(error) ? `${error.message} Aplíquela para poder elegir.` : error instanceof Error ? error.message : "No se pudieron cargar las opciones.";
  return cuantas === 0 ? vacio : "";
}

/* --- Un tablero publicado ---------------------------------------------------------------------- */

function ReferenciaTablero({ campo, valor, onCambio }: { campo: CampoBloque; valor: string; onCambio: (v: unknown, fusion: boolean) => void }) {
  const q = useTablerosPublicos();
  const estado = estadoDe(q.isPending, q.error, q.data?.length ?? 0, "Todavía no hay tableros publicados. Publique uno en Datos de Sostenibilidad → Tableros.");
  const esta = q.data?.some((t) => t.slug === valor);
  return (
    <label className="cms-campo">
      <span>{campo.etiqueta}</span>
      {estado ? (
        <p className="cms-ayuda" role={q.error ? "alert" : "status"}>
          {estado}
        </p>
      ) : (
        <select className="cms-input" value={valor} onChange={(e) => onCambio(e.target.value, false)}>
          <option value="">Ninguno</option>
          {valor && !esta ? <option value={valor}>{valor} (ya no está publicado)</option> : null}
          {(q.data ?? []).map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.nombre}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

/* --- Varios indicadores publicados, en orden ------------------------------------------------------ */

function ReferenciaIndicadores({ campo, ids, onCambio }: { campo: CampoBloque; ids: string[]; onCambio: (v: unknown, fusion: boolean) => void }) {
  const q = useIndicadoresPublicados();
  const [buscar, setBuscar] = useState("");
  const opciones = useMemo<Opcion[]>(() => (q.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, detalle: [c.ods ? `ODS ${c.ods}` : "", c.id].filter(Boolean).join(" · ") })), [q.data]);
  const porId = new Map(opciones.map((o) => [o.id, o]));
  const libres = opciones.filter((o) => !ids.includes(o.id) && (!buscar.trim() || sinTildes(`${o.nombre} ${o.id}`).includes(sinTildes(buscar.trim()))));
  const estado = estadoDe(q.isPending, q.error, opciones.length, "Todavía no hay indicadores publicados. Publíquelos en Datos de Sostenibilidad → Indicadores.");

  const mover = (i: number, j: number) => {
    if (j < 0 || j >= ids.length) return;
    const nuevos = [...ids];
    [nuevos[i], nuevos[j]] = [nuevos[j]!, nuevos[i]!];
    onCambio(nuevos, false);
  };

  return (
    <div className="cms-ref">
      <span className="cms-ref__tit">{campo.etiqueta}</span>
      {ids.length > 0 ? (
        <ol className="cms-ref__lista" aria-label="Indicadores elegidos, en orden">
          {ids.map((id, i) => {
            const o = porId.get(id);
            const falta = !o && !q.isPending && !q.error;
            return (
              <li key={id} className="cms-ref__fila" data-falta={falta ? "" : undefined}>
                <span className="cms-ref__nombre">
                  {o?.nombre ?? id}
                  <small>{o ? o.detalle : falta ? "Ya no está publicado: no saldrá" : "…"}</small>
                </span>
                <span className="cms-ref__acciones">
                  <button type="button" className="cms-ib" aria-label={`Subir ${o?.nombre ?? id}`} disabled={i === 0} onClick={() => mover(i, i - 1)}>
                    <Icon name="chevron-down" size={14} className="cms-ico--arriba" />
                  </button>
                  <button type="button" className="cms-ib" aria-label={`Bajar ${o?.nombre ?? id}`} disabled={i === ids.length - 1} onClick={() => mover(i, i + 1)}>
                    <Icon name="chevron-down" size={14} />
                  </button>
                  <button type="button" className="cms-ib cms-ib--peligro" aria-label={`Quitar ${o?.nombre ?? id}`} onClick={() => onCambio(ids.filter((x) => x !== id), false)}>
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="cms-ayuda">No ha elegido ningún indicador.</p>
      )}
      {estado ? (
        <p className="cms-ayuda" role={q.error ? "alert" : "status"}>
          {estado}
        </p>
      ) : ids.length >= TOPE ? (
        <p className="cms-ayuda">Llegó al máximo de {TOPE} indicadores.</p>
      ) : (
        <>
          <input className="cms-input" type="search" value={buscar} placeholder="Buscar por nombre o código" aria-label="Buscar indicadores publicados" onChange={(e) => setBuscar(e.target.value)} />
          <div className="cms-ref__opciones" role="group" aria-label="Indicadores publicados disponibles">
            {libres.map((o) => (
              <button key={o.id} type="button" className="cms-ref__op" onClick={() => onCambio([...ids, o.id], false)}>
                <Icon name="plus" size={12} />
                <span>
                  {o.nombre} <small>{o.detalle}</small>
                </span>
              </button>
            ))}
            {libres.length === 0 ? <p className="cms-ayuda">{buscar.trim() ? "Ningún indicador coincide con la búsqueda." : "Ya eligió todos los indicadores publicados."}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
