/* =============================================================================
   Datos de Sostenibilidad · el equipo de una oficina.

   Quién es gestor o colaborador. Repartir los accesos es del gestor de la
   oficina —o de la administración—; el directorio de personas es el de la
   intranet (el mismo que usa Mis Tableros para invitar).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../../admin/udes-en-cifras/ui";
import { SelectorPersona } from "../../admin/components/SelectorPersona";
import { useGuardarMiembro, useMiembros, useQuitarMiembro } from "../datos";
import type { DsOficina } from "../tipos";

export const ROL_TEXTO: Record<"gestor" | "colaborador", string> = {
  gestor: "Gestor",
  colaborador: "Colaborador",
};

export function EquipoOficina({ oficina }: { oficina: DsOficina }) {
  const id = oficina.oficina_id;
  const miembros = useMiembros(id);
  const guardar = useGuardarMiembro(id);
  const quitar = useQuitarMiembro(id);
  const [invitando, setInvitando] = useState(false);
  const [persona, setPersona] = useState("");
  const [rol, setRol] = useState<"gestor" | "colaborador">("colaborador");

  const mios = useMemo(() => new Set((miembros.data ?? []).map((m) => m.user_id)), [miembros.data]);

  return (
    <Panel
      title={`Equipo de ${oficina.oficina}`}
      description="El gestor dirige la oficina y reparte los accesos; el colaborador aporta libros. Planeación y la administración siempre leen."
      actions={
        <>
          <SaveState pending={guardar.isPending || quitar.isPending} error={guardar.error ?? quitar.error} success={guardar.isSuccess} />
          <button type="button" className="button-primary" onClick={() => setInvitando((v) => !v)}>
            <Icon name="plus" size={15} /> Añadir a alguien
          </button>
        </>
      }
    >
      {invitando && (
        <form
          className="tb-invite"
          onSubmit={(e) => {
            e.preventDefault();
            if (!persona) return;
            guardar.mutate({ user_id: persona, rol }, { onSuccess: () => { setInvitando(false); setPersona(""); } });
          }}
        >
          <SelectorPersona value={persona} onChange={setPersona} excluir={mios} />
          <label className="admin-field">
            <span>Papel</span>
            <select value={rol} onChange={(e) => setRol(e.target.value as "gestor" | "colaborador")}>
              <option value="colaborador">Colaborador · aporta libros</option>
              <option value="gestor">Gestor · además reparte accesos</option>
            </select>
          </label>
          <button type="submit" className="button-secondary" disabled={!persona || guardar.isPending}>
            Añadirlo
          </button>
        </form>
      )}

      {miembros.isPending ? (
        <p className="admin-loading">Cargando el equipo…</p>
      ) : (miembros.data ?? []).length === 0 ? (
        <StageEmpty title="Nadie trabaja aquí todavía">
          Añada al primer gestor: será quien reparta los accesos de esta oficina.
        </StageEmpty>
      ) : (
        <ul className="tb-list">
          {(miembros.data ?? []).map((m) => (
            <li key={m.id}>
              <span className="tb-list__row">
                <span className="tb-list__main">
                  <strong>{m.name}</strong>
                  <small>{m.email}</small>
                </span>
                <span className="tb-list__see" data-level={m.rol === "gestor" ? "publico" : "unidad"}>
                  {ROL_TEXTO[m.rol]}
                </span>
                <ConfirmButton label="Quitar" confirmLabel={`Quitar a ${m.name}`} onConfirm={() => quitar.mutate(m.id)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
