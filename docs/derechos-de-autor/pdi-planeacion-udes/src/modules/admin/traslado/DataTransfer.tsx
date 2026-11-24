/* =============================================================================
   Traslado de datos

   Lleva todo el contenido de un servidor de Supabase a otro sin pasar por el
   importador del panel, que carga tabla por tabla y tropieza con las llaves
   foráneas. El origen puede ser otro servidor —se entra con su URL, su clave
   anónima y una cuenta de administración de allí— o un respaldo .zip bajado
   antes desde esta misma pantalla.

   Lo que importa aquí es no sorprender: antes de tocar nada se enseña, tabla
   por tabla, cuántas filas llegan y cuántas hay ahora, y la importación pide
   una confirmación explícita porque **reemplaza** lo que hay en este servidor.
   Por eso el primer bloque es el respaldo de este servidor: es la vuelta atrás.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { supabase } from "../../../lib/supabase";
import { formatBytes } from "../../../data/storage";
import {
  backupName,
  backupToZip,
  connectSource,
  downloadBlob,
  importBackup,
  inventory,
  makePlan,
  readBackup,
  zipToBackup,
} from "./transfer";
import type { Backup, ImportReport, Plan, Progress } from "./transfer";
import "./transfer.css";

const HERE = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const count = (n: number) => n.toLocaleString("es-CO");

type Origin = "server" | "file";

export function DataTransfer() {
  const queryClient = useQueryClient();

  const [origin, setOrigin] = useState<Origin>("server");
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [includeFiles, setIncludeFiles] = useState(true);

  const [backup, setBackup] = useState<Backup | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState<"backup" | "read" | "import" | null>(null);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<void>) {
    setError("");
    setBusy(kind);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  /** El respaldo de este servidor: la vuelta atrás de todo lo demás. */
  const downloadHere = () =>
    run("backup", async () => {
      const here = await readBackup(supabase, { source: HERE, includeFiles }, setProgress);
      setProgress({ step: "Comprimiendo", done: 0, total: 1 });
      downloadBlob(backupToZip(here), backupName(HERE));
    });

  async function loaded(next: Backup) {
    const target = await inventory();
    setBackup(next);
    setPlan(makePlan(next, target));
    setAgreed(false);
    setReport(null);
  }

  const readServer = (event: FormEvent) => {
    event.preventDefault();
    if (hostOf(url) === hostOf(HERE)) {
      setError("El origen es este mismo servidor. Escribe la URL del otro proyecto.");
      return;
    }
    void run("read", async () => {
      setProgress({ step: "Entrando al origen", done: 0, total: 1 });
      const client = await connectSource(url, anonKey, email, password);
      try {
        await loaded(await readBackup(client, { source: url.trim(), includeFiles }, setProgress));
      } finally {
        await client.auth.signOut();
      }
    });
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    void run("read", async () => {
      setProgress({ step: `Abriendo ${file.name}`, done: 0, total: 1 });
      await loaded(await zipToBackup(file));
    });
  };

  const startImport = () => {
    if (!backup || !plan) return;
    void run("import", async () => {
      const result = await importBackup(backup, plan, setProgress);
      setReport(result);
      setPlan(null);
      setBackup(null);
      // Todo lo que la intranet tenía en caché es ya de otro servidor.
      await queryClient.invalidateQueries();
    });
  };

  const totals = useMemo(() => {
    if (!plan || !backup) return null;
    return {
      incoming: plan.rows.reduce((sum, r) => sum + r.incoming, 0),
      current: plan.rows.reduce((sum, r) => sum + r.current, 0),
      files: backup.files.length,
      fileBytes: backup.files.reduce((sum, f) => sum + f.bytes.byteLength, 0),
    };
  }, [plan, backup]);

  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <AdminShell
      section="transfer"
      kicker="Sistema"
      title="Traslado de datos"
      description="Copia todo el contenido de otro servidor de Supabase en este, resolviendo las llaves foráneas que hacen fallar la importación del panel."
    >
      {error && (
        <p className="transfer-alert" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      {progress && (
        <div className="transfer-progress" role="status" aria-live="polite">
          <div className="transfer-progress__label">
            <span>{progress.step}…</span>
            {progress.total > 1 && (
              <span>
                {count(progress.done)} / {count(progress.total)}
              </span>
            )}
          </div>
          <div className="transfer-progress__bar">
            <i style={{ width: `${percent}%` }} />
          </div>
          {busy === "import" && <small>No cierres ni recargues esta pestaña hasta que termine.</small>}
        </div>
      )}

      {/* --- 1. Respaldo de este servidor ------------------------------------- */}
      <section className="admin-card">
        <div className="admin-card__head">
          <div className="transfer-head">
            <span className="transfer-step">1</span>
            <div>
              <h2>Respaldo de este servidor</h2>
              <p>
                Importar reemplaza el contenido de <code>{hostOf(HERE) || "este servidor"}</code>. Descarga
                antes un respaldo: si algo sale mal, se vuelve a cargar desde aquí mismo como origen «Archivo».
              </p>
            </div>
          </div>
          <button className="button-secondary" type="button" disabled={busy !== null} onClick={() => void downloadHere()}>
            <Icon name="download" size={15} />
            {busy === "backup" ? "Preparando…" : "Descargar respaldo"}
          </button>
        </div>
        <label className="transfer-check">
          <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
          Incluir los archivos de Storage (imágenes, documentos, boletines)
        </label>
      </section>

      {/* --- 2. Origen --------------------------------------------------------- */}
      <section className="admin-card">
        <div className="transfer-head">
          <span className="transfer-step">2</span>
          <div>
            <h2>De dónde vienen los datos</h2>
            <p>
              El origen necesita la migración <code>0062_traslado_de_datos.sql</code> aplicada, igual que este
              servidor, y las mismas migraciones de esquema.
            </p>
          </div>
        </div>

        <div className="transfer-tabs" role="tablist" aria-label="Origen">
          <button type="button" role="tab" aria-selected={origin === "server"} onClick={() => setOrigin("server")}>
            Otro servidor
          </button>
          <button type="button" role="tab" aria-selected={origin === "file"} onClick={() => setOrigin("file")}>
            Archivo de respaldo
          </button>
        </div>

        {origin === "server" ? (
          <form className="admin-form__grid" onSubmit={readServer}>
            <label className="admin-field">
              <span>URL del proyecto de origen</span>
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
              />
            </label>
            <label className="admin-field">
              <span>Clave anónima (anon key)</span>
              <input required value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJhbGciOi…" />
            </label>
            <label className="admin-field">
              <span>Correo de un administrador del origen</span>
              <input required type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="admin-field">
              <span>Contraseña</span>
              <input
                required
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="admin-field--wide transfer-actions">
              <small>La contraseña solo se usa para leer el origen; no se guarda.</small>
              <button className="button-primary" type="submit" disabled={busy !== null}>
                <Icon name="download" size={15} />
                {busy === "read" ? "Leyendo…" : "Leer el origen"}
              </button>
            </div>
          </form>
        ) : (
          <label className="admin-field">
            <span>Respaldo .zip descargado desde esta pantalla</span>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={busy !== null}
              onChange={(e) => {
                readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </section>

      {/* --- 3. Revisar e importar ------------------------------------------------ */}
      {plan && backup && totals && (
        <section className="admin-card">
          <div className="admin-card__head">
            <div className="transfer-head">
              <span className="transfer-step">3</span>
              <div>
                <h2>Qué va a cambiar</h2>
                <p>
                  Origen <code>{hostOf(backup.source)}</code>, leído el{" "}
                  {new Date(backup.createdAt).toLocaleString("es-CO")}.
                </p>
              </div>
            </div>
            {origin === "server" && (
              <button
                className="button-ghost"
                type="button"
                disabled={busy !== null}
                onClick={() => downloadBlob(backupToZip(backup), backupName(backup.source))}
              >
                <Icon name="download" size={15} />
                Guardar como .zip
              </button>
            )}
          </div>

          <dl className="transfer-stats">
            <div>
              <dt>Tablas</dt>
              <dd>{plan.rows.length}</dd>
              <small>se vacían y se llenan con las del origen</small>
            </div>
            <div>
              <dt>Filas</dt>
              <dd>{count(totals.incoming)}</dd>
              <small>reemplazan las {count(totals.current)} de ahora</small>
            </div>
            <div>
              <dt>Archivos</dt>
              <dd>{count(totals.files)}</dd>
              <small>{totals.files ? formatBytes(totals.fileBytes) : "sin archivos"}</small>
            </div>
          </dl>

          {(plan.unknown.length > 0 || backup.fileErrors.length > 0 || plan.rows.some((r) => r.droppedColumns.length)) && (
            <ul className="transfer-warnings">
              {plan.unknown.length > 0 && (
                <li>
                  Estas tablas no existen aquí y se omiten (faltan migraciones): <code>{plan.unknown.join(", ")}</code>
                </li>
              )}
              {plan.rows
                .filter((r) => r.droppedColumns.length > 0)
                .map((r) => (
                  <li key={r.table}>
                    <code>{r.table}</code>: columnas que aquí no existen y se descartan —{" "}
                    <code>{r.droppedColumns.join(", ")}</code>
                  </li>
                ))}
              {backup.fileErrors.length > 0 && (
                <li>{backup.fileErrors.length} archivos no se pudieron leer del origen y no se copiarán.</li>
              )}
            </ul>
          )}

          <details className="transfer-details">
            <summary>Ver tabla por tabla</summary>
            <table className="transfer-table">
              <thead>
                <tr>
                  <th scope="col">Tabla</th>
                  <th scope="col">Llegan</th>
                  <th scope="col">Hay ahora</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => (
                  <tr key={row.table}>
                    <td>
                      <code>{row.table}</code>
                      {row.table === "profiles" && <small> · se emparejan por correo, no se borran</small>}
                    </td>
                    <td>{count(row.incoming)}</td>
                    <td>{count(row.current)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.untouched.length > 0 && (
              <p className="transfer-muted">
                No vienen en el respaldo y se quedan como están: <code>{plan.untouched.join(", ")}</code>
              </p>
            )}
          </details>

          <p className="transfer-muted">
            Las cuentas de usuario no viajan: cada perfil del origen se asigna a la cuenta de este servidor con el
            mismo correo, y lo que era de alguien sin cuenta aquí queda sin autor. Tú conservas la administración.
          </p>

          <label className="transfer-check transfer-check--danger">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            Entiendo que se reemplaza el contenido de <strong>{hostOf(HERE)}</strong> y que no se puede deshacer sin
            un respaldo.
          </label>

          <div className="transfer-actions">
            <button className="button-ghost" type="button" disabled={busy !== null} onClick={() => setPlan(null)}>
              Descartar
            </button>
            <button className="button-primary" type="button" disabled={!agreed || busy !== null} onClick={startImport}>
              <Icon name="upload" size={15} />
              {busy === "import" ? "Importando…" : "Importar en este servidor"}
            </button>
          </div>
        </section>
      )}

      {report && <ImportSummary report={report} />}
    </AdminShell>
  );
}

function ImportSummary({ report }: { report: ImportReport }) {
  const inserted = report.loaded.reduce((sum, r) => sum + r.inserted, 0);
  const short = report.loaded.filter((r) => r.inserted < r.sent && r.table !== "profiles");
  const deleted = report.repaired.reduce((sum, r) => sum + r.deleted, 0);
  const nulled = report.repaired.reduce((sum, r) => sum + r.nulled, 0);

  return (
    <section className="admin-card" role="status">
      <p className="admin-notice">
        <Icon name="check" size={15} />
        Importación terminada: {count(inserted)} filas en {report.loaded.length} tablas
        {report.filesUploaded > 0 && ` y ${count(report.filesUploaded)} archivos`}.
      </p>

      <ul className="transfer-warnings">
        {report.missingUsers.length > 0 && (
          <li>
            {report.missingUsers.length} personas del origen no tienen cuenta aquí:{" "}
            <code>{report.missingUsers.join(", ")}</code>. Créalas en <strong>Usuarios y roles</strong> y vuelve a
            importar si necesitas conservar su autoría y sus asignaciones.
          </li>
        )}
        {(deleted > 0 || nulled > 0) && (
          <li>
            Referencias sin destino: {count(nulled)} quedaron vacías y {count(deleted)} filas se retiraron porque no
            pueden existir sin ellas.
          </li>
        )}
        {short.map((r) => (
          <li key={r.table}>
            <code>{r.table}</code>: {count(r.sent - r.inserted)} filas repetidas no se cargaron.
          </li>
        ))}
        {report.fileErrors.length > 0 && (
          <li>
            {report.fileErrors.length} archivos no se copiaron:
            <code className="transfer-block">{report.fileErrors.slice(0, 20).join("\n")}</code>
          </li>
        )}
      </ul>

      {report.repaired.length > 0 && (
        <details className="transfer-details">
          <summary>Referencias revisadas</summary>
          <table className="transfer-table">
            <thead>
              <tr>
                <th scope="col">Llave</th>
                <th scope="col">Autoría traducida</th>
                <th scope="col">Vaciadas</th>
                <th scope="col">Retiradas</th>
              </tr>
            </thead>
            <tbody>
              {report.repaired.map((r) => (
                <tr key={`${r.table}.${r.name}`}>
                  <td>
                    <code>{r.name}</code>
                  </td>
                  <td>{count(r.remapped)}</td>
                  <td>{count(r.nulled)}</td>
                  <td>{count(r.deleted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
