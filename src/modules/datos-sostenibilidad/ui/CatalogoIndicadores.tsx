/* =============================================================================
   Datos de Sostenibilidad · el catálogo de indicadores (solo administración).

   Crear y editar los indicadores de los 17 ODS a los que un libro se conecta
   (ds_indicadores, 0178). La RLS solo deja escribir a la administración; esta
   pantalla además no se ofrece a nadie más. El id no se cambia una vez creado
   (los libros se conectan por él); para que el portal use la cifra de un
   indicador hay que mapearlo en sostenible/cifras-reales.ts (IND_DE_DS).
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { Panel, SaveState } from "../../admin/udes-en-cifras/ui";
import { useGuardarIndicador, useIndicadores } from "../datos";
import type { DsIndicador } from "../tipos";

const VACIO: DsIndicador = { id: "", ods: 13, nombre: "", descripcion: "", unidad: "", position: 1 };

export function CatalogoIndicadores() {
  const indicadores = useIndicadores();
  const guardar = useGuardarIndicador();
  // `nuevo` distingue crear (el id se escribe) de editar (el id queda fijo).
  const [form, setForm] = useState<{ datos: DsIndicador; nuevo: boolean } | null>(null);

  const lista = indicadores.data ?? [];
  const set = (cambio: Partial<DsIndicador>) => setForm((f) => (f ? { ...f, datos: { ...f.datos, ...cambio } } : f));
  const valido = form && form.datos.id.trim() !== "" && form.datos.nombre.trim() !== "" && form.datos.ods >= 1 && form.datos.ods <= 17;

  return (
    <Panel
      title="Catálogo de indicadores"
      description="Los indicadores de los 17 ODS a los que se conectan los libros de datos. El id (por ejemplo «13.5») no cambia una vez creado."
      actions={
        <>
          <SaveState pending={guardar.isPending} error={guardar.error} success={guardar.isSuccess} />
          <button type="button" className="button-primary" onClick={() => setForm({ datos: { ...VACIO, position: lista.length + 1 }, nuevo: true })}>
            <Icon name="plus" size={15} /> Nuevo indicador
          </button>
        </>
      }
    >
      {form && (
        <form
          className="tb-invite"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) return;
            guardar.mutate(form.datos, { onSuccess: () => setForm(null) });
          }}
        >
          <label className="admin-field">
            <span>Id</span>
            <input value={form.datos.id} onChange={(e) => set({ id: e.target.value })} disabled={!form.nuevo} maxLength={40} placeholder="13.5" required />
          </label>
          <label className="admin-field">
            <span>ODS (1 a 17)</span>
            <input type="number" min={1} max={17} value={form.datos.ods} onChange={(e) => set({ ods: Number(e.target.value) })} required />
          </label>
          <label className="admin-field">
            <span>Nombre</span>
            <input value={form.datos.nombre} onChange={(e) => set({ nombre: e.target.value })} required />
          </label>
          <label className="admin-field">
            <span>Unidad</span>
            <input value={form.datos.unidad} onChange={(e) => set({ unidad: e.target.value })} placeholder="%, kWh, t CO₂…" />
          </label>
          <label className="admin-field">
            <span>Orden dentro del ODS</span>
            <input type="number" min={0} value={form.datos.position} onChange={(e) => set({ position: Number(e.target.value) })} />
          </label>
          <label className="admin-field">
            <span>Descripción</span>
            <textarea rows={2} value={form.datos.descripcion} onChange={(e) => set({ descripcion: e.target.value })} />
          </label>
          <button type="submit" className="button-secondary" disabled={!valido || guardar.isPending}>
            {form.nuevo ? "Crear" : "Guardar"}
          </button>
          <button type="button" className="button-secondary" onClick={() => setForm(null)}>
            Cancelar
          </button>
        </form>
      )}

      {indicadores.isPending ? (
        <p className="admin-loading">Cargando el catálogo…</p>
      ) : indicadores.error ? (
        <ErrorBlock error={indicadores.error} onRetry={() => void indicadores.refetch()} />
      ) : (
        <ul className="tb-list">
          {lista.map((i) => (
            <li key={i.id}>
              <span className="tb-list__row">
                <span className="tb-list__main">
                  <strong>
                    {i.id} · {i.nombre}
                  </strong>
                  <small>
                    ODS {i.ods}
                    {i.unidad ? ` · ${i.unidad}` : ""}
                    {i.descripcion ? ` · ${i.descripcion}` : ""}
                  </small>
                </span>
                <button type="button" className="button-secondary" onClick={() => setForm({ datos: i, nuevo: false })}>
                  Editar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
