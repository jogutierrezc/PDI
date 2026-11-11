/* =============================================================================
   Observatorio · Tableros: filtros del observatorio y revisión antes de publicar.

   Qué filtros ofrece el observatorio (vicerrectoría, facultad, programa, sede),
   quién responde por él y qué falta antes de abrirlo. Quien edita guarda; quien
   solo ve lee el mismo estado. Publicar el observatorio se hace en el panel
   Observatorios: aquí se revisa y se enlaza.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { Panel } from "../../udes-en-cifras/ui";
import { useObsState } from "../store";
import { useIndicadores } from "./api";
import { FILTROS_BASE, useFiltrosTablero, useGuardarFiltros, useObservatorioPorEnlace } from "./tablero";
import type { FiltrosTablero } from "./tablero";
import { useObservatorios } from "../publicar/api";

const FILTROS: { id: "vicerrectoria" | "facultad" | "programa" | "sede"; label: string; hint: string }[] = [
  { id: "vicerrectoria", label: "Vicerrectoría", hint: "Todas, o solo Posgrados (los posgrados siguen en su facultad)" },
  { id: "facultad", label: "Facultad", hint: "Las siete facultades" },
  { id: "sede", label: "Sede", hint: "Bucaramanga, Cúcuta y Valledupar" },
  { id: "programa", label: "Programa", hint: "Un programa a la vez" },
];

export function AjustesTablero({ obsId, canEdit }: { obsId: string; canEdit: boolean }) {
  const lista = useObservatorios();
  const obs = lista.data?.find((o) => o.id === obsId);
  const base = useObservatorioPorEnlace(obs?.slug);
  const ajustes = useFiltrosTablero(obsId);
  const guardar = useGuardarFiltros(obsId);
  const indicadores = useIndicadores(obsId);
  const estado = useObsState();
  const [local, setLocal] = useState<FiltrosTablero>(FILTROS_BASE);
  useEffect(() => void (ajustes.data && setLocal(ajustes.data)), [ajustes.data]);

  // Solo se muestra donde hay una guía de datos: el observatorio de Indicadores de Gestión Académica.
  if (!obs || indicadores.isPending || !indicadores.data || indicadores.data.falta || indicadores.data.filas.length === 0) return null;

  const filas = indicadores.data.filas;
  const conectados = filas.filter((i) => i.origen_tipo !== "foto").length;
  const temas = base.data?.temas ?? [];
  const conVisores = temas.filter((t) => (estado.data?.views ?? []).some((v) => v.topic === t.slug && v.visible)).length;
  const cambio = JSON.stringify(local) !== JSON.stringify(ajustes.data ?? FILTROS_BASE);
  const revisiones: { ok: boolean; titulo: string; detalle: string }[] = [
    { ok: local.responsable.trim().length > 0, titulo: "Responsable asignado", detalle: local.responsable.trim() || "Escribe quién responde por este observatorio" },
    { ok: conVisores === temas.length && temas.length > 0, titulo: "Cada página tiene visores", detalle: `${conVisores} de ${temas.length} páginas con al menos un visor visible` },
    { ok: conectados === filas.length, titulo: "Cada indicador tiene origen conectado", detalle: `${conectados} de ${filas.length}. Los demás se muestran como foto estática y no se actualizan solos` },
    { ok: obs.estado === "publicado", titulo: "Observatorio publicado", detalle: obs.estado === "publicado" ? "Ya se puede abrir al público" : "Está en borrador: solo lo ve quien tiene acceso al taller" },
  ];

  return (
    <Panel
      id="obs-ajustes"
      title="Filtros y revisión del observatorio"
      description={<>Qué filtros ofrece {obs.nombre} y qué falta antes de abrirlo. {!canEdit && "Tu rol puede ver este estado; guardar pide el permiso de editar."}</>}
      actions={
        <Link className="button-secondary" to={`/admin/observatorio-ver/${obs.slug}`}>
          <Icon name="eye" size={15} /> Abrir el observatorio
        </Link>
      }
    >
      <fieldset className="obs-guia__form" disabled={!canEdit}>
        <legend>Filtros que verá quien lo lea</legend>
        <div className="obs-guia__tipos">
          {FILTROS.map((f) => (
            <label key={f.id} data-on={local[f.id] ? "true" : undefined} title={f.hint}>
              <input type="checkbox" checked={local[f.id]} onChange={(e) => setLocal({ ...local, [f.id]: e.target.checked })} />
              {f.label}
            </label>
          ))}
        </div>
        <label className="obs-guia__campo">
          <span>Responsable del observatorio</span>
          <input type="text" maxLength={120} value={local.responsable} onChange={(e) => setLocal({ ...local, responsable: e.target.value })} placeholder="Por ejemplo: Dirección de Planeación" />
        </label>
        {guardar.isError && <p className="obs-guia-aviso" role="alert"><Icon name="alert" size={15} /> {(guardar.error as Error).message || "No se pudo guardar."}</p>}
        {canEdit && (
          <div className="obs-guia__acciones">
            <button type="button" className="button-primary" disabled={!cambio || guardar.isPending} onClick={() => guardar.mutate({ vicerrectoria: local.vicerrectoria, facultad: local.facultad, programa: local.programa, sede: local.sede, responsable: local.responsable.trim() })}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </fieldset>

      <ul className="obs-guia" role="list" aria-label="Revisión antes de publicar">
        {revisiones.map((r) => (
          <li key={r.titulo} className="obs-guia__fila">
            <div className="obs-guia__cab" style={{ cursor: "default" }}>
              <span className="obs-guia__nombre">{r.titulo}<small>{r.detalle}</small></span>
              <span />
              <span className="oda-badge" data-tone={r.ok ? "ok" : "warn"}>{r.ok ? "Listo" : "Pendiente"}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="obs-guia__vacio">
        Para publicar o despublicar el observatorio usa el panel <Link to="/admin/observatorio/observatorios">Observatorios</Link>.
      </p>
    </Panel>
  );
}
