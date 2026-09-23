/* =============================================================================
   Carga masiva de usuarios y asignaciones desde Excel.

   Tres tiempos, en la misma pantalla: descargar la plantilla (con las listas
   de roles y unidades de esta base), subirla y ver la vista previa por
   persona, y aplicar. Aplicar solo se habilita sin errores.

   Crear una cuenta pasa por la Edge Function y no es una transacción con lo
   demás: se aplica persona por persona y se informa de cada una. Una que
   falle no deshace las anteriores, y se dice cuál falló y por qué. Las
   unidades se AÑADEN (admin_set_memberships sin reemplazar): la carga no
   quita a nadie de donde ya estaba.
   ========================================================================== */

import { useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { keys, useAccessRoles } from "../../../data/queries";
import { useCreateUser } from "../../../data/mutations";
import { supabase } from "../../../lib/supabase";
import type { Profile } from "../../../types/database";
import { cellText } from "../../impacto/import/matrix";
import { downloadBlob } from "../traslado/transfer";
import { UNIT_KIND, UNIT_ROLE } from "../../tableros/model";
import { peopleKeys, setMemberships, type UnitOption } from "./people-db";
import { planUsers, USER_COLUMNS, type PlannedPerson, type UsersPlan } from "./users-sheet";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Outcome = { email: string; ok: boolean; text: string };

export function BulkUsers({ profiles, units }: { profiles: Profile[]; units: UnitOption[] }) {
  const access = useAccessRoles();
  const createUser = useCreateUser();
  const client = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<UsersPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState("");
  const roles = access.data?.roles ?? [];

  async function downloadTemplate() {
    setError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("Personas", { views: [{ state: "frozen", ySplit: 1 }] });
      sheet.columns = USER_COLUMNS.map((header, i) => ({ header, width: [34, 30, 24, 28, 18, 20, 28, 28][i] }));
      sheet.getRow(1).font = { bold: true };
      sheet.addRow([
        "nombre.apellido@udes.edu.co",
        "Nombre Apellido",
        "Programa de Medicina",
        "Consulta",
        "MED",
        "Gestor",
        "Director del programa",
        "Dirección de programa",
      ]);
      sheet.getRow(2).font = { italic: true, color: { argb: "FF6B7C93" } };

      const lists = book.addWorksheet("Listas");
      lists.columns = [
        { header: "Roles globales", width: 32 },
        { header: "Roles de unidad", width: 32 },
        { header: "Código", width: 14 },
        { header: "Unidad", width: 48 },
        { header: "Clase", width: 16 },
        { header: "Funciones", width: 16 },
        { header: "Qué hace", width: 70 },
      ];
      lists.getRow(1).font = { bold: true };
      const globals = roles.filter((r) => (r.scope ?? "global") === "global").map((r) => r.name);
      const locals = roles.filter((r) => r.scope === "unidad").map((r) => r.name);
      const sorted = [...units].sort((a, b) => a.code.localeCompare(b.code, "es"));
      const functions = (["jefe", "editor", "visor"] as const).map((key) => UNIT_ROLE[key]);
      const height = Math.max(globals.length, locals.length, sorted.length, functions.length);
      for (let i = 0; i < height; i += 1) {
        const unit = sorted[i];
        lists.addRow([
          globals[i] ?? "",
          locals[i] ?? "",
          unit?.code ?? "",
          unit?.name ?? "",
          unit ? UNIT_KIND[unit.kind].label : "",
          functions[i]?.label ?? "",
          functions[i]?.hint ?? "",
        ]);
      }
      const last = 500;
      for (let row = 2; row <= last; row += 1) {
        sheet.getCell(`D${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Listas!$A$2:$A$${globals.length + 1}`],
        };
        sheet.getCell(`E${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Listas!$C$2:$C$${sorted.length + 1}`],
        };
        sheet.getCell(`F${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Listas!$F$2:$F$${functions.length + 1}`],
        };
        sheet.getCell(`H${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Listas!$B$2:$B$${locals.length + 1}`],
        };
      }
      const buffer = await book.xlsx.writeBuffer();
      downloadBlob(new Blob([buffer], { type: XLSX }), "usuarios-y-asignaciones.xlsx");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo armar la plantilla.");
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setOutcomes([]);
    setPlan(null);
    setFileName(file.name);
    setReading(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const sheet = book.getWorksheet("Personas") ?? book.worksheets[0];
      if (!sheet) throw new Error("El archivo no tiene hojas.");
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row, number) => {
        const values: string[] = [];
        for (let col = 1; col <= USER_COLUMNS.length; col += 1) values.push(cellText(row.getCell(col).value).trim());
        rows[number - 1] = values;
      });
      // La fila de ejemplo de la plantilla no es una persona.
      const cleaned = rows
        .map((row) => row ?? [])
        .filter((row, index) => index === 0 || row[0] !== "nombre.apellido@udes.edu.co");
      setPlan(planUsers(cleaned, { roles, units, profiles }));
    } catch (failure) {
      setError(failure instanceof Error ? `No se pudo leer el archivo: ${failure.message}` : "No se pudo leer el archivo.");
    } finally {
      setReading(false);
    }
  }

  async function apply() {
    if (!plan || plan.errorCount > 0) return;
    setApplying(true);
    const done: Outcome[] = [];
    for (const person of plan.people) {
      try {
        let id = person.existingId;
        const role = roles.find((r) => r.id === person.globalRoleId);
        if (!id) {
          const result = await createUser.mutateAsync({
            email: person.email,
            full_name: person.name,
            role: role?.base_role ?? "consulta",
            access_role_id: person.globalRoleId,
            unit: person.unit || undefined,
          });
          id = result.user.id;
        } else if (person.globalRoleId) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ access_role_id: person.globalRoleId })
            .eq("id", id);
          if (updateError) throw new Error(updateError.message);
        }
        if (person.assignments.length > 0) {
          await setMemberships(
            id,
            person.assignments.map((a) => ({
              unit_id: a.unitId,
              access_role_id: a.accessRoleId,
              role: a.board,
              title: a.title || null,
            })),
            false,
          );
        }
        done.push({
          email: person.email,
          ok: true,
          text: person.existingId ? "Actualizada." : "Creada; se le envió la invitación.",
        });
      } catch (failure) {
        done.push({ email: person.email, ok: false, text: failure instanceof Error ? failure.message : "Falló." });
      }
      setOutcomes([...done]);
    }
    void client.invalidateQueries({ queryKey: keys.profiles() });
    void client.invalidateQueries({ queryKey: peopleKeys.all });
    setApplying(false);
  }

  const created = plan?.people.filter((p) => !p.existingId).length ?? 0;
  const updated = (plan?.people.length ?? 0) - created;
  const assignments = plan?.people.reduce((n, p) => n + p.assignments.length, 0) ?? 0;
  const failed = outcomes.filter((o) => !o.ok).length;

  return (
    <div className="us-bulk">
      <ol className="us-bulk__steps">
        <li>
          <h3>Descargue la plantilla</h3>
          <p>
            Una fila por unidad: la misma persona puede ocupar varias filas. En cada unidad diga su función con los
            datos (Gestor, Contribuyente o Consulta), su cargo y, si reporta en Impacto, su rol. La hoja «Listas» trae
            los roles y los códigos de unidad de esta intranet.
          </p>
          <button type="button" className="button-ghost" onClick={() => void downloadTemplate()} disabled={access.isPending}>
            <Icon name="download" size={15} /> Descargar plantilla
          </button>
        </li>
        <li>
          <h3>Súbala diligenciada</h3>
          <p>Nada se escribe al subirla: primero verá qué pasaría con cada persona.</p>
          <label className="button-ghost us-file">
            <Icon name="upload" size={15} /> {reading ? "Leyendo…" : "Elegir archivo .xlsx"}
            <input type="file" accept=".xlsx" onChange={(event) => void readFile(event)} disabled={reading || applying} />
          </label>
          {fileName && <small className="users-hint">{fileName}</small>}
        </li>
      </ol>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {plan && (
        <section className="us-preview" aria-labelledby="vista-previa">
          <header>
            <h3 id="vista-previa">Vista previa</h3>
            <p>
              {created} {created === 1 ? "persona nueva" : "personas nuevas"} · {updated}{" "}
              {updated === 1 ? "existente" : "existentes"} · {assignments}{" "}
              {assignments === 1 ? "asignación" : "asignaciones"}
              {plan.errorCount > 0 && (
                <strong className="us-raised">
                  {" "}
                  · {plan.errorCount} {plan.errorCount === 1 ? "error" : "errores"}
                </strong>
              )}
            </p>
          </header>
          {plan.errors.map((text) => (
            <p key={text} className="admin-error" role="alert">
              <Icon name="alert" size={16} /> {text}
            </p>
          ))}
          <ul className="us-preview__list">
            {plan.people.map((person) => (
              <PreviewRow key={person.email || person.lines[0]} person={person} outcome={outcomes.find((o) => o.email === person.email)} />
            ))}
          </ul>
          <footer className="us-savebar">
            {plan.errorCount > 0 ? (
              <small className="us-raised">Corrija el archivo y vuelva a subirlo: con errores no se aplica nada.</small>
            ) : outcomes.length > 0 && !applying ? (
              <small className={failed ? "us-raised" : "users-hint"}>
                {failed ? `${failed} no se pudieron aplicar; las demás quedaron listas.` : "Listo: se aplicó todo."}
              </small>
            ) : (
              <small className="users-hint">Las unidades se añaden: nadie sale de donde ya estaba.</small>
            )}
            <button
              type="button"
              className="button-primary"
              disabled={plan.errorCount > 0 || applying || outcomes.length > 0 || plan.people.length === 0}
              onClick={() => void apply()}
            >
              {applying ? `Aplicando… ${outcomes.length} de ${plan.people.length}` : "Aplicar"}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}

function PreviewRow({ person, outcome }: { person: PlannedPerson; outcome?: Outcome }) {
  const state = outcome ? (outcome.ok ? "hecho" : "fallo") : person.errors.length ? "error" : person.existingId ? "actualiza" : "crea";
  const label: Record<string, string> = {
    hecho: "Hecho",
    fallo: "Falló",
    error: "Con errores",
    actualiza: "Se actualiza",
    crea: "Se crea",
  };
  return (
    <li className="us-preview__row" data-state={state}>
      <div className="us-preview__who">
        <strong>{person.name || person.email || "Sin correo"}</strong>
        <small>
          {person.email} · filas {person.lines.join(", ")}
        </small>
      </div>
      <div className="us-preview__what">
        {person.globalRoleLabel && <span className="us-tag">{person.globalRoleLabel}</span>}
        {person.assignments.map((a) => (
          <span key={a.line} className="us-tag us-tag--unit">
            {a.unitLabel} · {a.board ? UNIT_ROLE[a.board].label : "Consulta"}
            {a.title ? ` · ${a.title}` : ""}
            {a.accessRoleId ? ` · ${a.roleLabel}` : ""}
          </span>
        ))}
        {person.errors.map((text) => (
          <small key={text} className="us-raised">
            <Icon name="alert" size={13} /> {text}
          </small>
        ))}
        {outcome && <small className={outcome.ok ? "users-hint" : "us-raised"}>{outcome.text}</small>}
      </div>
      <span className="us-state" data-state={state}>
        {label[state]}
      </span>
    </li>
  );
}
