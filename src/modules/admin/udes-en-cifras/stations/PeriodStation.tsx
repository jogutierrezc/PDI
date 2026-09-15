/* =============================================================================
   Estación 1 · Periodo y campus.

   El periodo es global: sus años son las columnas de toda la captura. Aquí se
   ajusta el vigente (corte, marca de cifras ilustrativas, publicación), se
   eligen los campus que cubre, se mantienen las oficinas que aparecen como
   fuente y se abre el periodo siguiente copiando la estructura.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { supabase } from "../../../../lib/supabase";
import type { OdOffice, OdPeriod } from "../../../../types/database";
import type { StationProps } from "../OdAdmin";
import {
  odAdminKeys,
  useAllCampuses,
  useCopyPeriod,
  useDeleteOffice,
  useMakeCurrentPeriod,
  useOdPeriods,
  useSaveOffice,
  useSavePeriod,
  useSavePeriodCampuses,
} from "../od-data";
import { ConfirmButton, Panel, SaveState } from "../ui";

export function PeriodStation({ data, periodId, canEdit }: StationProps) {
  const period = data.rows.period;
  return (
    <div className="oda-stack">
      <PeriodForm key={period.id + period.updated_at} period={period} canEdit={canEdit} />
      <div className="oda-columns">
        <CampusPanel periodId={periodId} canEdit={canEdit} selected={data.rows.campuses} />
        <OfficesPanel offices={data.rows.offices} canEdit={canEdit} />
      </div>
      <PeriodsPanel canEdit={canEdit} currentId={periodId} />
    </div>
  );
}

function PeriodForm({ period, canEdit: editable }: { period: OdPeriod; canEdit: boolean }) {
    const save = useSavePeriod();
    const [form, setForm] = useState({
      label: period.label,
      start_year: period.start_year,
      end_year: period.end_year,
      cutoff_date: period.cutoff_date,
      illustrative: period.illustrative,
      status: period.status,
      note: period.note,
    });
    const dirty = JSON.stringify(form) !== JSON.stringify({
      label: period.label, start_year: period.start_year, end_year: period.end_year, cutoff_date: period.cutoff_date,
      illustrative: period.illustrative, status: period.status, note: period.note,
    });
    const years = form.end_year - form.start_year + 1;
    const invalid = years < 1 || years > 13;

    return (
      <Panel
        id="oda-periodo"
        title={`Periodo ${period.label}`}
        description={
          <>
            {years > 0 ? `${years} cortes anuales` : "Rango inválido"} · cada informe abarca todos los años del periodo.
            {period.is_current ? " Es el periodo vigente del portal." : " No es el periodo vigente."}
          </>
        }
        actions={
          <>
            <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
            <button
              type="button"
              className="button-primary"
              disabled={!editable || !dirty || invalid || save.isPending}
              onClick={() => save.mutate({ id: period.id, patch: form })}
            >
              Guardar periodo
            </button>
          </>
        }
      >
        <div className="oda-form-grid">
          <label className="admin-field">
            <span>Nombre</span>
            <input value={form.label} disabled={!editable} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label className="admin-field">
            <span>Año inicial</span>
            <input type="number" min={2000} max={2100} value={form.start_year} disabled={!editable} onChange={(e) => setForm({ ...form, start_year: Number(e.target.value) })} />
          </label>
          <label className="admin-field">
            <span>Año final</span>
            <input type="number" min={2000} max={2100} value={form.end_year} disabled={!editable} onChange={(e) => setForm({ ...form, end_year: Number(e.target.value) })} />
          </label>
          <label className="admin-field">
            <span>Fecha de corte publicada</span>
            <input type="date" value={form.cutoff_date} disabled={!editable} onChange={(e) => setForm({ ...form, cutoff_date: e.target.value })} />
          </label>
          <label className="admin-field">
            <span>Estado del periodo</span>
            <select value={form.status} disabled={!editable} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
              <option value="borrador">Borrador: el portal no lo muestra</option>
              <option value="publicado">Publicado: el portal lo muestra</option>
              <option value="archivado">Archivado</option>
            </select>
          </label>
          <label className="oda-check admin-field--wide">
            <input type="checkbox" checked={form.illustrative} disabled={!editable} onChange={(e) => setForm({ ...form, illustrative: e.target.checked })} />
            <span>
              <strong>Cifras ilustrativas</strong>
              <small>Cada cifra del portal lleva la marca "Dato ilustrativo". Desmárcalo cuando las cifras sean oficiales.</small>
            </span>
          </label>
          <label className="admin-field admin-field--wide">
            <span>Nota interna</span>
            <textarea value={form.note} disabled={!editable} rows={2} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
        {invalid && <p className="admin-field-error"><Icon name="alert" size={14} /> El periodo debe tener entre 1 y 13 años.</p>}
      </Panel>
    );
}

/* --- Campus ------------------------------------------------------------------ */

function CampusPanel({ periodId, canEdit, selected }: { periodId: string; canEdit: boolean; selected: StationProps["data"]["rows"]["campuses"] }) {
  const all = useAllCampuses();
  const save = useSavePeriodCampuses();
  const [chosen, setChosen] = useState<Record<string, { on: boolean; label: string }>>({});

  useEffect(() => {
    if (!all.data) return;
    setChosen(
      Object.fromEntries(
        all.data.map((c) => {
          const current = selected.find((s) => s.campus_id === c.id);
          return [c.id, { on: Boolean(current), label: current?.label ?? c.name }];
        }),
      ),
    );
  }, [all.data, selected]);

  const submit = () => {
    if (!all.data) return;
    const keep = all.data
      .filter((c) => chosen[c.id]?.on)
      .map((c, index) => ({ period_id: periodId, campus_id: c.id, label: chosen[c.id].label || c.name, position: index + 1 }));
    const remove = selected.filter((s) => !chosen[s.campus_id]?.on).map((s) => s.campus_id);
    save.mutate({ periodId, keep, remove });
  };

  return (
    <Panel
      id="oda-campus"
      title="Campus del periodo"
      description="Cada campus elegido es una fila de captura por indicador. El total institucional se calcula o se captura aparte según el indicador."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button type="button" className="button-secondary" disabled={!canEdit || save.isPending} onClick={submit}>
            Guardar campus
          </button>
        </>
      }
    >
      {all.isPending ? (
        <p className="oda-muted">Cargando campus…</p>
      ) : (
        <ul className="oda-choice-list">
          {(all.data ?? []).map((c) => (
            <li key={c.id}>
              <label className="oda-check">
                <input
                  type="checkbox"
                  checked={chosen[c.id]?.on ?? false}
                  disabled={!canEdit}
                  onChange={(e) => setChosen({ ...chosen, [c.id]: { ...chosen[c.id], on: e.target.checked } })}
                />
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.code}</small>
                </span>
              </label>
              <input
                className="oda-inline-input"
                aria-label={`Nombre público de ${c.name}`}
                value={chosen[c.id]?.label ?? ""}
                disabled={!canEdit || !chosen[c.id]?.on}
                onChange={(e) => setChosen({ ...chosen, [c.id]: { ...chosen[c.id], label: e.target.value } })}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --- Oficinas ------------------------------------------------------------------ */

function OfficesPanel({ offices, canEdit }: { offices: OdOffice[]; canEdit: boolean }) {
  const save = useSaveOffice();
  const remove = useDeleteOffice();
  const [draft, setDraft] = useState({ name: "", contact_email: "" });

  return (
    <Panel
      id="oda-oficinas"
      title="Oficinas fuente"
      description='Aparecen como "Reporta:" en cada cifra del portal.'
      actions={<SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess || remove.isSuccess} />}
    >
      <ul className="oda-office-list">
        {offices.map((office) => (
          <OfficeRow key={office.id} office={office} canEdit={canEdit} onSave={(o) => save.mutate(o)} onDelete={() => remove.mutate(office.id)} />
        ))}
      </ul>
      {canEdit && (
        <form
          className="oda-add-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.name.trim()) return;
            save.mutate({ name: draft.name.trim(), contact_email: draft.contact_email.trim(), position: offices.length + 1 }, { onSuccess: () => setDraft({ name: "", contact_email: "" }) });
          }}
        >
          <input aria-label="Nombre de la oficina" placeholder="Nombre de la oficina" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input aria-label="Correo de contacto" placeholder="Correo (opcional)" type="email" value={draft.contact_email} onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })} />
          <button type="submit" className="button-secondary" disabled={!draft.name.trim()}>
            <Icon name="plus" size={15} /> Añadir
          </button>
        </form>
      )}
    </Panel>
  );
}

function OfficeRow({ office, canEdit, onSave, onDelete }: { office: OdOffice; canEdit: boolean; onSave: (o: OdOffice) => void; onDelete: () => void }) {
  const [name, setName] = useState(office.name);
  const changed = name.trim() !== office.name;
  return (
    <li>
      <input className="oda-inline-input" aria-label="Nombre de la oficina" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
      {changed && (
        <button type="button" className="oda-link-button" onClick={() => onSave({ ...office, name: name.trim() })}>
          Guardar
        </button>
      )}
      {canEdit && <ConfirmButton label="Borrar" confirmLabel="¿Borrar la oficina?" onConfirm={onDelete} />}
    </li>
  );
}

/* --- Periodos ---------------------------------------------------------------------- */

function PeriodsPanel({ canEdit, currentId }: { canEdit: boolean; currentId: string }) {
  const periods = useOdPeriods();
  const makeCurrent = useMakeCurrentPeriod();
  const copy = useCopyPeriod();
  const navigate = useNavigate();
  const latest = periods.data?.[0];
  const [next, setNext] = useState(() => ({
    start: (latest?.start_year ?? 2020) + 1,
    end: (latest?.end_year ?? 2025) + 1,
  }));

  return (
    <Panel
      id="oda-periodos"
      title="Periodos"
      description="Abrir el periodo siguiente copia informes, indicadores, KPI, conjuntos y diseño de la ficha. No copia cifras: nace vacío y en borrador."
      tone="quiet"
      actions={<SaveState pending={makeCurrent.isPending || copy.isPending} error={makeCurrent.error ?? copy.error} success={makeCurrent.isSuccess || copy.isSuccess} />}
    >
      <table className="oda-table">
        <thead>
          <tr>
            <th scope="col">Periodo</th>
            <th scope="col">Años</th>
            <th scope="col">Estado</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {(periods.data ?? []).map((p) => (
            <tr key={p.id} data-selected={p.id === currentId || undefined}>
              <th scope="row">
                {p.label}
                {p.is_current && <span className="oda-badge" data-tone="ok">Vigente</span>}
              </th>
              <td>{p.start_year}–{p.end_year}</td>
              <td>{p.status === "publicado" ? "Publicado" : p.status === "archivado" ? "Archivado" : "Borrador"}</td>
              <td className="oda-table__actions">
                {p.id !== currentId && (
                  <button type="button" className="oda-link-button" onClick={() => navigate(`/admin/udes-en-cifras/periodo?periodo=${p.id}`)}>
                    Abrir
                  </button>
                )}
                {!p.is_current && canEdit && (
                  <button type="button" className="oda-link-button" onClick={() => makeCurrent.mutate(p.id)}>
                    Hacer vigente
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && latest && (
        <form
          className="oda-add-row"
          onSubmit={(event) => {
            event.preventDefault();
            copy.mutate(
              { source: currentId, label: `${next.start}-${next.end}`, start: next.start, end: next.end },
              { onSuccess: (id) => navigate(`/admin/udes-en-cifras/periodo?periodo=${id}`) },
            );
          }}
        >
          <span className="oda-add-row__label">Abrir periodo copiando este</span>
          <input type="number" aria-label="Año inicial del periodo nuevo" value={next.start} onChange={(e) => setNext({ ...next, start: Number(e.target.value) })} />
          <input type="number" aria-label="Año final del periodo nuevo" value={next.end} onChange={(e) => setNext({ ...next, end: Number(e.target.value) })} />
          <button type="submit" className="button-secondary" disabled={next.end < next.start || copy.isPending}>
            Abrir {next.start}-{next.end}
          </button>
        </form>
      )}
    </Panel>
  );
}

/* --- Primer periodo ------------------------------------------------------------------ */

/** Sin ningún periodo todavía: el módulo arranca creando uno. */
export function FirstPeriod({ canEdit }: { canEdit: boolean }) {
  const client = useQueryClient();
  const [form, setForm] = useState({ start: 2020, end: 2025 });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = async () => {
    setPending(true);
    setError(null);
    const { error: insertError } = await supabase.from("od_periods").insert({
      label: `${form.start}-${form.end}`,
      start_year: form.start,
      end_year: form.end,
      is_current: true,
      status: "borrador",
    });
    setPending(false);
    if (insertError) setError(insertError.message);
    else await client.invalidateQueries({ queryKey: odAdminKeys.all });
  };

  return (
    <div className="oda-first">
      <h2>Empieza por el periodo</h2>
      <p>
        UDES en Cifras trabaja por periodos: cada informe abarca todos los años del periodo, con un corte por año.
        Crea el primero para configurar campus, informes y cifras.
      </p>
      {canEdit ? (
        <div className="oda-add-row">
          <input type="number" aria-label="Año inicial" value={form.start} onChange={(e) => setForm({ ...form, start: Number(e.target.value) })} />
          <input type="number" aria-label="Año final" value={form.end} onChange={(e) => setForm({ ...form, end: Number(e.target.value) })} />
          <button type="button" className="button-primary" disabled={pending || form.end < form.start} onClick={() => void create()}>
            Crear periodo {form.start}-{form.end}
          </button>
        </div>
      ) : (
        <p className="oda-muted">Planeación todavía no ha creado ningún periodo.</p>
      )}
      {error && <p className="admin-field-error"><Icon name="alert" size={14} /> {error}</p>}
    </div>
  );
}
