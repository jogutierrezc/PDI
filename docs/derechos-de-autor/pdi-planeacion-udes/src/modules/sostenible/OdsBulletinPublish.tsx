/* =============================================================================
   UDES Sostenible · panel «Emitir edición» del boletín de informes ODS.
   Solo para quien puede emitir; sube el PDF generado con «Guardar como PDF».
   ========================================================================== */

import { useState } from "react";
import type { FormEvent } from "react";
import { describeDatabaseError, FriendlyError } from "../../data/errors";
import type { OdBulletinEditionRow } from "../../types/database";
import { MAX_BULLETIN_BYTES } from "../boletin/data";
import { useOdsBulletinAdmin } from "./ods-bulletin-data";
import { formatEditionDate } from "./OdsBulletinDownload";
import "./ods-publish.css";

function readable(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  if (error && typeof error === "object" && "message" in error) return describeDatabaseError(error as never).message;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export function OdsBulletinPublish() {
  const admin = useOdsBulletinAdmin();
  const year = new Date().getFullYear();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState(`Edición ${year}`);
  const [cut, setCut] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  if (!admin.allowed) return null;

  const busy = admin.publishing || admin.settingStatus || admin.removing;
  const fileError = file && file.size > MAX_BULLETIN_BYTES ? "El PDF pasa de 50 MB." : null;
  const canSubmit = Boolean(file && label.trim() && !fileError && !busy && admin.period);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setMsg(null);
    try {
      await admin.publish({ file, label: label.trim(), cutLabel: cut.trim(), note: note.trim() });
      setFile(null);
      setNote("");
      setInputKey((k) => k + 1);
      setMsg({ kind: "ok", text: "Edición publicada: ya se puede descargar desde el portal." });
    } catch (error) {
      setMsg({ kind: "err", text: readable(error) });
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
    } catch (error) {
      setMsg({ kind: "err", text: readable(error) });
    } finally {
      setConfirming(null);
    }
  };

  const toggle = (ed: OdBulletinEditionRow) =>
    act(
      () => admin.setStatus({ id: ed.id, status: ed.status === "publicado" ? "retirado" : "publicado" }),
      ed.status === "publicado" ? "Edición retirada del portal." : "Edición publicada de nuevo.",
    );

  return (
    <section className="opp" aria-label="Emitir edición del boletín">
      <h2 className="opb-h">Emitir edición</h2>
      <p className="odsx-note">
        Genera el PDF con «Descargar PDF → Guardar como PDF» y súbelo aquí. El público lo descarga solo mientras la edición esté publicada.
      </p>

      <form className="opp-form" onSubmit={(e) => void submit(e)}>
        <label className="opp-field">
          <span>Archivo PDF</span>
          <input key={inputKey} type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {fileError && (
          <p className="opp-msg opp-msg--err" role="alert">
            {fileError}
          </p>
        )}
        <label className="opp-field">
          <span>Etiqueta</span>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Edición ${year}`} />
        </label>
        <label className="opp-field">
          <span>Corte</span>
          <input type="text" value={cut} onChange={(e) => setCut(e.target.value)} placeholder="Corte: junio de 2026" />
        </label>
        <label className="opp-field">
          <span>Nota (opcional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </label>
        <button className="odsx-btn odsx-btn--pri" type="submit" disabled={!canSubmit}>
          {admin.publishing ? "Publicando…" : "Publicar edición"}
        </button>
        {!admin.period && !admin.isLoading && <p className="opp-msg opp-msg--err">No hay un periodo vigente donde guardar la edición.</p>}
      </form>

      {msg && (
        <p className={`opp-msg opp-msg--${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
      {admin.error && (
        <p className="opp-msg opp-msg--err" role="alert">
          {readable(admin.error)}
        </p>
      )}

      <h3 className="opp-sub">Ediciones emitidas</h3>
      {admin.isLoading ? (
        <p className="odsx-note">Cargando ediciones…</p>
      ) : admin.editions.length === 0 ? (
        <p className="odsx-note">Aún no se ha emitido ninguna edición.</p>
      ) : (
        <ul className="opp-list">
          {admin.editions.map((ed) => (
            <li key={ed.id} className="opp-item">
              <div className="opp-info">
                <b>{ed.title}</b>
                <span>
                  {ed.label}
                  {ed.cut_label ? ` · ${ed.cut_label}` : ""} · {formatEditionDate(ed.published_at)}
                </span>
                <em className={`opp-state opp-state--${ed.status}`}>{ed.status === "publicado" ? "Publicada" : "Retirada"}</em>
              </div>
              {confirming === ed.id ? (
                <div className="opp-confirm" role="alertdialog" aria-label="Confirmar eliminación">
                  <span>¿Eliminar esta edición y su PDF?</span>
                  <button className="odsx-btn" type="button" disabled={busy} onClick={() => void act(() => admin.remove(ed), "Edición eliminada.")}>
                    Sí, eliminar
                  </button>
                  <button className="odsx-btn" type="button" onClick={() => setConfirming(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="opp-actions">
                  <button className="odsx-btn" type="button" disabled={busy} onClick={() => void toggle(ed)}>
                    {ed.status === "publicado" ? "Retirar" : "Publicar"}
                  </button>
                  <button className="odsx-btn" type="button" disabled={busy} onClick={() => setConfirming(ed.id)}>
                    Eliminar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
