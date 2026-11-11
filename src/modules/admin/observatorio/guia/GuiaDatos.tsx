/* =============================================================================
   Observatorio · Guía de datos de un tema (Captura de datos).

   La lista de indicadores del tema con su fuente, su estado y su ORIGEN. Quien
   puede editar conecta cada uno a una tabla del taller, a un libro de UDrive o
   a una cifra viva del Warehouse, o lo devuelve a «foto». Quien solo puede ver
   lee la misma lista, con el historial, y no tiene ningún botón que escriba:
   la base lo impide de todos modos (obs_indicador_conectar pide Editar).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { Panel } from "../../udes-en-cifras/ui";
import { useArchivos } from "../../../udrive/datos";
import { useCatalogoWh } from "../fuenteWarehouse";
import { plural } from "../model";
import type { ObsDataset } from "../model";
import { ORIGEN_TEXTO, origenVisible, useConectarIndicador, useIndicadores, useVersionesIndicador } from "./api";
import type { Indicador, OrigenTipo } from "./api";
import "./guia.css";

const DONDE: Record<string, string> = {
  calidad: "Calidad y oferta", estudiantes: "Académica", profesores: "Profesores", gestion: "Administrativa", extension: "Extensión",
  internacional: "Internacionalización", investigacion: "Investigación", financiero: "Financiera",
};

export function GuiaDatos({ topic, obsId, canEdit, datasets }: { topic: string; obsId: string | null; canEdit: boolean; datasets: ObsDataset[] }) {
  const q = useIndicadores(obsId);
  const [abierto, setAbierto] = useState<string | null>(null);
  const todos = q.data?.filas ?? [];
  const lista = useMemo(() => todos.filter((i) => i.tema_slug === topic), [todos, topic]);
  if (!obsId || q.isPending || q.isError || q.data?.falta || lista.length === 0) {
    return q.data?.falta && obsId ? (
      <p className="obs-guia-aviso" role="note">
        <Icon name="alert" size={15} /> Falta aplicar la migración <code>0277_obs_guia_datos.sql</code> para ver la guía de datos de este tema.
      </p>
    ) : null;
  }
  const c = { act: 0, foto: 0, dato: 0, falta: 0 };
  lista.forEach((i) => void (c[origenVisible(i).clave] += 1));
  const sel = lista.find((i) => i.id === abierto) ?? null;

  return (
    <Panel
      id="obs-guia"
      title="Guía de datos"
      description="Cada indicador del tema, de dónde sale y si se actualiza solo. Una foto estática es una cifra puesta a mano; un libro, una tabla o una cifra viva se actualizan con su origen."
    >
      <p className="obs-guia-cuenta" aria-label="Resumen de la guía">
        <span><b>{lista.length}</b> indicadores</span>
        <span data-tone="ok"><b>{c.act}</b> con origen conectado</span>
        <span><b>{c.foto}</b> fotos por convertir</span>
        <span><b>{c.dato}</b> archivos por adaptar</span>
        <span data-tone="risk"><b>{c.falta}</b> sin archivo</span>
      </p>
      {!canEdit && (
        <p className="obs-guia-aviso" role="note">
          <Icon name="eye" size={15} /> Tu rol puede ver la guía y su historial. Conectar los datos pide el permiso de editar.
        </p>
      )}
      <ul className="obs-guia" role="list">
        {lista.map((i) => {
          const o = origenVisible(i);
          return (
            <li key={i.id} className="obs-guia__fila" data-abierto={i.id === abierto ? "true" : undefined}>
              <button type="button" className="obs-guia__cab" aria-expanded={i.id === abierto} onClick={() => setAbierto(i.id === abierto ? null : i.id)}>
                <span className="obs-guia__nombre">
                  {i.nombre}
                  <small>
                    {i.fuente || "Sin archivo ubicado"}
                    {i.cobertura ? ` · ${i.cobertura}` : ""} · por {i.nivel}
                  </small>
                </span>
                <span className="obs-guia__donde">{i.vista ? `${DONDE[i.vista] ?? i.vista}${i.vista_pestana ? ` · ${i.vista_pestana}` : ""}` : "Aún no se muestra"}</span>
                <span className="oda-badge" data-tone={o.clave === "act" ? "ok" : o.clave === "foto" ? undefined : "warn"}>
                  {o.texto}
                </span>
              </button>
              {i.id === abierto && sel && <Conexion ind={sel} obsId={obsId} canEdit={canEdit} datasets={datasets} />}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* --- Conectar un origen ------------------------------------------------------------------ */

function Conexion({ ind, obsId, canEdit, datasets }: { ind: Indicador; obsId: string; canEdit: boolean; datasets: ObsDataset[] }) {
  const [tipo, setTipo] = useState<OrigenTipo>(ind.origen_tipo === "foto" ? (ind.conjunto_vivo ? "viva" : "tabla") : ind.origen_tipo);
  const [ref, setRef] = useState<string>(ind.origen_ref ?? "");
  const [nota, setNota] = useState(ind.origen_nota ?? "");
  const guardar = useConectarIndicador(obsId);
  const historial = useVersionesIndicador(ind.id);
  const archivos = useArchivos();
  const catalogo = useCatalogoWh(obsId, tipo === "viva");
  const libros = (archivos.data ?? []).filter((a) => a.tipo === "tabla" && !a.borrado_en);
  const conjuntos = [...new Set((catalogo.data ?? []).map((x) => x.conjunto))].sort();
  const opciones: { id: string; texto: string }[] =
    tipo === "tabla" ? datasets.map((d) => ({ id: d.id, texto: `${d.title} · ${plural(d.rows.length, "fila", "filas")}` }))
    : tipo === "libro" ? libros.map((a) => ({ id: a.id, texto: a.nombre }))
    : tipo === "viva" ? conjuntos.map((x) => ({ id: x, texto: x }))
    : [];
  const sugerido = tipo === "viva" ? ind.conjunto_vivo : tipo === "libro" ? ind.libro_existente : null;
  const valido = tipo === "foto" || (ref !== "" && opciones.some((o) => o.id === ref));
  const cambio = tipo !== ind.origen_tipo || (tipo !== "foto" && ref !== (ind.origen_ref ?? ""));

  return (
    <div className="obs-guia__panel">
      <div className="obs-guia__datos">
        <p><b>Estado:</b> {ind.estado === "ok" ? "ya se muestra en el tablero" : ind.estado === "dato" ? "hay un archivo por adaptar" : "todavía no hay archivo"}.</p>
        {ind.hojas.length > 0 && <p><b>Hojas de origen:</b> {ind.hojas.join(", ")}.</p>}
        {ind.origen_tipo !== "foto" && <p><b>Origen actual:</b> {ORIGEN_TEXTO[ind.origen_tipo]}{ind.origen_nota ? `, ${ind.origen_nota}` : ""}.</p>}
      </div>

      {canEdit ? (
        <fieldset className="obs-guia__form">
          <legend>De dónde sale</legend>
          <div className="obs-guia__tipos" role="radiogroup" aria-label="Tipo de origen">
            {(["tabla", "libro", "viva", "foto"] as OrigenTipo[]).map((t) => (
              <label key={t} data-on={tipo === t ? "true" : undefined}>
                <input type="radio" name={`tipo-${ind.id}`} checked={tipo === t} onChange={() => { setTipo(t); setRef(""); }} />
                {t === "tabla" ? "Tabla del taller" : t === "libro" ? "Libro de UDrive" : t === "viva" ? "Cifra viva (Warehouse)" : "Foto estática"}
              </label>
            ))}
          </div>
          {tipo !== "foto" && (
            <label className="obs-guia__campo">
              <span>{tipo === "tabla" ? "Tabla de este tema" : tipo === "libro" ? "Tabla de UDrive" : "Conjunto del Warehouse"}</span>
              <select value={ref} onChange={(e) => setRef(e.target.value)}>
                <option value="">{opciones.length ? "Elegir…" : tipo === "tabla" ? "Este tema aún no tiene tablas: impórtalas arriba" : "No hay opciones disponibles"}</option>
                {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
              </select>
              {sugerido && <small>Ya existe: {sugerido}.</small>}
            </label>
          )}
          <label className="obs-guia__campo">
            <span>Nota para el historial (opcional)</span>
            <input type="text" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: corte 2026-1" />
          </label>
          {guardar.isError && <p className="obs-guia-aviso" role="alert"><Icon name="alert" size={15} /> {(guardar.error as Error).message || "No se pudo guardar."}</p>}
          <div className="obs-guia__acciones">
            <button
              type="button"
              className="button-primary"
              disabled={!valido || !cambio || guardar.isPending}
              onClick={() => guardar.mutate({ id: ind.id, tipo, ref: tipo === "foto" ? null : ref, nota: tipo === "foto" ? undefined : nota })}
            >
              {guardar.isPending ? "Guardando…" : tipo === "foto" ? "Volver a foto" : ind.origen_tipo === "foto" ? "Conectar" : "Guardar cambio"}
            </button>
          </div>
        </fieldset>
      ) : null}

      <section aria-label="Historial">
        <h3 className="obs-guia__h">Historial</h3>
        {historial.isPending ? <p className="obs-guia__vacio">Cargando…</p> : historial.isError || !historial.data?.length ? (
          <p className="obs-guia__vacio">Todavía no hay conexiones registradas.</p>
        ) : (
          <ol className="obs-guia__hist">
            {historial.data.map((v) => (
              <li key={v.id}><b>v{v.version}</b><span>{v.texto}<small>{new Date(v.created_at).toLocaleString("es-CO")}</small></span></li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
