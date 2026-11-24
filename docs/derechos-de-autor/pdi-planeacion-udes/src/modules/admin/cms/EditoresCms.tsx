/* =============================================================================
   CMS Portales · editores por portal.

   La administración nombra a quién, sin rol Planeación, puede editar y publicar
   un portal (cms_editores, migración 0199). El directorio de personas es el de
   la intranet (SelectorPersona).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { SelectorPersona } from "../components/SelectorPersona";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../udes-en-cifras/ui";
import { useProfiles } from "../../tableros/store";
import { FaltaMigracionCms, useEditores, useGuardarEditor, useQuitarEditor } from "./store";
import type { CmsPortal, PortalSlug } from "./tipos";

export function EditoresCms({ portales, portalInicial }: { portales: CmsPortal[]; portalInicial: PortalSlug }) {
  const editores = useEditores(true);
  const perfiles = useProfiles();
  const guardar = useGuardarEditor();
  const quitar = useQuitarEditor();
  const [anadiendo, setAnadiendo] = useState(false);
  const [persona, setPersona] = useState("");
  const [portal, setPortal] = useState<PortalSlug>(portalInicial);

  const lista = editores.data ?? [];
  const yaEnPortal = useMemo(() => new Set(lista.filter((e) => e.portal === portal).map((e) => e.user_id)), [lista, portal]);
  const personas = useMemo(() => new Map((perfiles.data ?? []).map((p) => [p.id, p])), [perfiles.data]);
  const nombrePortal = (slug: string) => portales.find((p) => p.slug === slug)?.nombre ?? slug;

  // Sin la migración 0199 no hay nada que repartir: el aviso de la pantalla ya lo dice.
  if (editores.error instanceof FaltaMigracionCms) return null;

  return (
    <Panel
      title="Editores"
      description="Personas que editan y publican un portal sin tener rol Planeación. Solo ven y tocan las páginas del portal que se les asigna."
      actions={
        <>
          <SaveState pending={guardar.isPending || quitar.isPending} error={guardar.error ?? quitar.error} success={guardar.isSuccess} />
          <button type="button" className="button-primary" onClick={() => setAnadiendo((v) => !v)}>
            <Icon name="plus" size={15} /> Añadir a alguien
          </button>
        </>
      }
    >
      {anadiendo && (
        <form
          className="tb-invite"
          onSubmit={(e) => {
            e.preventDefault();
            if (!persona) return;
            guardar.mutate({ user_id: persona, portal }, { onSuccess: () => { setAnadiendo(false); setPersona(""); } });
          }}
        >
          <SelectorPersona value={persona} onChange={setPersona} excluir={yaEnPortal} />
          <label className="admin-field">
            <span>Portal</span>
            <select value={portal} onChange={(e) => setPortal(e.target.value as PortalSlug)}>
              {portales.map((p) => (
                <option key={p.slug} value={p.slug}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="button-secondary" disabled={!persona || guardar.isPending}>
            Añadirlo
          </button>
        </form>
      )}

      {editores.isPending ? (
        <p className="admin-loading">Cargando los editores…</p>
      ) : lista.length === 0 ? (
        <StageEmpty title="Nadie edita por designación todavía">
          Planeación y la administración editan todos los portales. Añada a alguien para que edite solo uno.
        </StageEmpty>
      ) : (
        <ul className="tb-list">
          {lista.map((e) => {
            const p = personas.get(e.user_id);
            const nombre = p?.name ?? "Persona del directorio";
            return (
              <li key={e.id}>
                <span className="tb-list__row">
                  <span className="tb-list__main">
                    <strong>{nombre}</strong>
                    <small>{p?.email ?? ""}</small>
                  </span>
                  <span className="tb-list__see" data-level="unidad">{nombrePortal(e.portal)}</span>
                  <ConfirmButton label="Quitar" confirmLabel={`Quitar a ${nombre}`} onConfirm={() => quitar.mutate(e.id)} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
