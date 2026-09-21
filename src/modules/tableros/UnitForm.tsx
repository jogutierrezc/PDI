/* =============================================================================
   Mis Tableros · crear y corregir una unidad.

   El organigrama se edita donde se lee, en la misma espina, y no en una
   pantalla de mantenimiento aparte: quien lo está mirando es quien sabe que
   falta una facultad, y mandarle a otro sitio a ponerla es pedirle que se
   acuerde de volver.

   Solo Planeación y los administradores lo tocan: la estructura institucional
   no la cambia cada facultad. Eso lo concede la política `units_write` de la
   0057; aquí solo se evita ofrecer el botón.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ConfirmButton, SaveState } from "../admin/udes-en-cifras/ui";
import { UNIT_KIND, freeSlug, unitChildren, unitDescendants } from "./model";
import type { Unit, UnitKind } from "./model";
import { useDeleteUnit, useSaveUnit } from "./store";
/* Lo prestado viaja con su hoja: Panel, SaveState, StageEmpty, ConfirmButton y
   los campos son de UDES en Cifras, y sus estilos viven en od-admin.css. Sin
   esto se dibujan desnudos. */
import "../admin/udes-en-cifras/od-admin.css";
import "./tableros.css";

export interface UnitDraft {
  id?: string;
  name: string;
  code: string;
  slug: string;
  kind: UnitKind;
  parent_id: string | null;
  description: string;
}

const empty = (parentId: string | null): UnitDraft => ({
  name: "",
  code: "",
  slug: "",
  kind: parentId ? "programa" : "facultad",
  parent_id: parentId,
  description: "",
});

/** El código que se propone: las iniciales, en mayúsculas y sin acentos. */
const proposeCode = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(word))
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);

export function UnitForm({
  units,
  initial,
  parentId,
  onDone,
  onCancel,
}: {
  units: Unit[];
  initial?: Unit;
  parentId?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const save = useSaveUnit();
  const [f, setF] = useState<UnitDraft>(
    initial
      ? {
          id: initial.id,
          name: initial.name,
          code: initial.code,
          slug: initial.slug,
          kind: initial.kind,
          parent_id: initial.parentId,
          description: initial.description,
        }
      : empty(parentId ?? null),
  );

  const set = (patch: Partial<UnitDraft>) => setF({ ...f, ...patch });

  // Una unidad no puede colgar de sí misma ni de una de las suyas: la base lo
  // impide con un disparador, y aquí ni se ofrece.
  const forbidden = new Set(initial ? [initial.id, ...unitDescendants(units, initial.id).map((u) => u.id)] : []);
  const parents = units.filter((u) => !forbidden.has(u.id)).sort((a, b) => a.name.localeCompare(b.name, "es"));

  const takenCodes = units.filter((u) => u.id !== initial?.id).map((u) => u.code.toUpperCase());
  const takenSlugs = units.filter((u) => u.id !== initial?.id).map((u) => u.slug);
  const code = (f.code || proposeCode(f.name)).toUpperCase();
  const slug = f.slug || freeSlug(f.name, takenSlugs);
  const codeTaken = Boolean(code) && takenCodes.includes(code);
  const valid = f.name.trim().length > 1 && code.length > 0 && !codeTaken;

  return (
    <form
      className="oda-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        save.mutate(
          {
            ...(f.id ? { id: f.id } : {}),
            name: f.name.trim(),
            code,
            slug,
            kind: f.kind,
            parent_id: f.parent_id,
            description: f.description.trim(),
            position: initial?.position ?? unitChildren(units, f.parent_id).length + 1,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Cómo se llama</span>
          <input
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Facultad de Ciencias de la Salud"
            autoFocus
            required
          />
        </label>

        <label className="admin-field">
          <span>Qué es</span>
          <select value={f.kind} onChange={(e) => set({ kind: e.target.value as UnitKind })}>
            {(Object.keys(UNIT_KIND) as UnitKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {UNIT_KIND[kind].label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span>De qué unidad cuelga</span>
          <select value={f.parent_id ?? ""} onChange={(e) => set({ parent_id: e.target.value || null })}>
            <option value="">De ninguna: es de primer nivel</option>
            {parents.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} · {u.name}
              </option>
            ))}
          </select>
          <small className="oda-field-hint">
            Quien trabaje en la unidad de arriba trabajará también aquí, con el mismo papel, salvo que se le
            ponga otro.
          </small>
        </label>

        <label className="admin-field">
          <span>Código</span>
          <input
            value={f.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase().slice(0, 8) })}
            placeholder={proposeCode(f.name) || "FCS"}
          />
          <small className="oda-field-hint">
            {codeTaken ? (
              <strong>Ese código ya es de otra unidad.</strong>
            ) : (
              <>Sale en el árbol, a la izquierda del nombre. Vacío, se propone «{proposeCode(f.name) || "—"}».</>
            )}
          </small>
        </label>

        <label className="admin-field admin-field--wide">
          <span>De qué se ocupa <small>opcional</small></span>
          <input
            value={f.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Pregrados y posgrados del área de la salud"
          />
        </label>
      </div>

      <p className="oda-field-hint">
        Sus tableros vivirán en <code>/tableros/{slug || "…"}/…</code>. El identificador no cambia al renombrarla.
      </p>

      <div className="oda-inline-form__actions">
        <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button-primary" disabled={!valid || save.isPending}>
          {initial ? "Guardar" : "Crear unidad"}
        </button>
      </div>
    </form>
  );
}

/** Quitar una unidad. La base no deja si algo cuelga de ella, y se dice por qué. */
export function UnitDelete({ unit, units, onDone }: { unit: Unit; units: Unit[]; onDone: () => void }) {
  const remove = useDeleteUnit();
  const children = unitChildren(units, unit.id);

  if (children.length > 0) {
    return (
      <p className="oda-field-hint">
        <Icon name="lock" size={14} /> No se puede quitar mientras {children.length === 1 ? "cuelgue" : "cuelguen"}{" "}
        {children.length} {children.length === 1 ? "unidad" : "unidades"} de ella. Recolócalas primero.
      </p>
    );
  }

  return (
    <>
      <SaveState pending={remove.isPending} error={remove.error} success={remove.isSuccess} />
      <ConfirmButton
        label="Quitar la unidad"
        confirmLabel="Quitarla con sus tableros"
        onConfirm={() => remove.mutate(unit.id, { onSuccess: onDone })}
      />
    </>
  );
}
