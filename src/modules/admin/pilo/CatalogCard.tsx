/* =============================================================================
   Intranet · Mr. Pilo con IA · el catálogo de Pilo.

   Lo que Planeación escribe para Pilo, en Excel:
     Respuestas   preguntas con su respuesta oficial, variantes y fuente;
     Capciosas    microexpresiones rápidas que se disparan por palabras.
   Por clase: descargar la plantilla (con ejemplos) o lo que ya hay, importar
   un libro (se revisa fila por fila antes de guardar; con «reemplazar», el
   libro manda y lo que no viene se borra), y ver lo guardado, con cuántas
   veces sirvió cada entrada y un interruptor para dejarla de usar.

   Se aplica al momento, como las claves: no espera a «Guardar cambios».
   Es la sección «Catálogo» del módulo (PiloAiSettings).
   ========================================================================== */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { downloadBlob } from "../traslado/transfer";
import { workbookToTables } from "../institucion/structure-sheet";
import { COLUMNS, EXAMPLES, fillCatalogTemplate, parseCatalogTable, SHEET_NAME } from "./catalog-sheet";
import type { CatalogKind, CatalogRow, ParseResult } from "./catalog-sheet";
import { Icon } from "../../../components/ui/Icon";
import { Group, StatusMark, Switch } from "./ui";

interface Entry extends CatalogRow {
  kind: CatalogKind;
  hits: number;
  updated_at: string;
}

const KEY = ["pilo-ia", "catalogo"] as const;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function useCatalog() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Entry[] | null> => {
      const { data, error } = await supabase.from("pilo_catalog").select("*").order("key");
      if (error) return null; // sin 0096
      return (data ?? []) as Entry[];
    },
  });
}

const LEAD: Record<CatalogKind, string> = {
  respuesta:
    "Preguntas con la respuesta oficial de Planeación. Pilo la da tal cual, sin IA, cuando la pregunta se parece a la escrita o a una de sus variantes, y cita la fuente si la tiene.",
  capciosa:
    "Microexpresiones: respuestas cortas y rápidas para preguntas capciosas (salarios, la vida personal de Pilo, bromas). Se disparan cuando la pregunta trae las palabras de un disparador, y Pilo las dice con la emoción elegida.",
};

export function CatalogSection() {
  const client = useQueryClient();
  const catalog = useCatalog();
  const [kind, setKind] = useState<CatalogKind>("capciosa");
  const [parsed, setParsed] = useState<{ file: string; result: ParseResult } | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => (catalog.data ?? []).filter((e) => e.kind === kind), [catalog.data, kind]);
  const count = (k: CatalogKind) => (catalog.data ?? []).filter((e) => e.kind === k).length;

  const importRows = useMutation({
    mutationFn: async ({ k, valid, all }: { k: CatalogKind; valid: CatalogRow[]; all: boolean }) => {
      const { data, error } = await supabase.rpc("pilo_catalog_import", { p_kind: k, p_rows: valid as never, p_replace: all });
      if (error) throw error;
      return data as { added: number; updated: number; removed: number; total: number };
    },
    onSuccess: (r) => {
      setMessage({ ok: true, text: `Listo: ${r.added} nuevas, ${r.updated} actualizadas${r.removed ? `, ${r.removed} borradas` : ""}. Hay ${r.total} en total.` });
      setParsed(null);
      setReplace(false);
      void client.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => setMessage({ ok: false, text: `No se importó: ${(e as Error).message}` }),
  });

  const toggle = useMutation({
    mutationFn: async ({ key, active }: { key: string; active: boolean }) => {
      const { error } = await supabase.from("pilo_catalog").update({ active }).eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });

  async function download(which: "plantilla" | "actual") {
    setBusy(which);
    setMessage(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      book.creator = "Planeación Institucional · UDES";
      fillCatalogTemplate(book, kind, which === "plantilla" ? EXAMPLES[kind] : rows);
      const buffer = await book.xlsx.writeBuffer();
      const name = kind === "respuesta" ? "respuestas" : "capciosas";
      downloadBlob(new Blob([buffer], { type: XLSX }), which === "plantilla" ? `pilo-${name}-plantilla.xlsx` : `pilo-${name}.xlsx`);
    } catch (e) {
      setMessage({ ok: false, text: `No se pudo armar el archivo: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy("leer");
    setMessage(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      setParsed({ file: file.name, result: parseCatalogTable(kind, workbookToTables(book)) });
    } catch (e) {
      setParsed(null);
      setMessage({ ok: false, text: `No se pudo leer el archivo: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  const errors = parsed ? [...parsed.result.problems, ...parsed.result.rows.flatMap((r) => r.errors)] : [];
  const missing = catalog.data === null;

  return (
    <>
      {missing && <p className="pis-warn">Falta aplicar la migración 0096 en la base para guardar el catálogo.</p>}

      <Group title="Clase" aside={<small>Se aplica al momento, como las claves</small>}>
        <div className="pis-seg" role="radiogroup" aria-label="Clase del catálogo">
          {(["capciosa", "respuesta"] as CatalogKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setParsed(null);
                setMessage(null);
              }}
            >
              {SHEET_NAME[k]} <span className="pis-seg__n">{count(k)}</span>
            </button>
          ))}
        </div>
        <p className="pis-lead">{LEAD[kind]}</p>
      </Group>

      <Group title="Escribirlas en Excel">
        <div className="pis-actions">
          <button type="button" className="button-secondary" onClick={() => download("plantilla")} disabled={Boolean(busy)}>
            <Icon name="download" size={16} />
            {busy === "plantilla" ? "Armando…" : "Descargar plantilla"}
          </button>
          <button type="button" className="button-secondary" onClick={() => download("actual")} disabled={Boolean(busy) || rows.length === 0}>
            <Icon name="download" size={16} />
            {busy === "actual" ? "Armando…" : "Descargar lo que hay"}
          </button>
          <label className="button-primary pis-file" aria-disabled={missing || Boolean(busy) || undefined}>
            <Icon name="upload" size={16} />
            {busy === "leer" ? "Leyendo…" : "Importar Excel"}
            <input
              type="file"
              accept=".xlsx"
              disabled={missing || Boolean(busy)}
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="pis-small">
          Columnas: {COLUMNS[kind].map((c) => c.header).join(" · ")}. La plantilla trae ejemplos y una hoja «Cómo llenarla».
        </p>

        {parsed && (
          <div className="pis-preview" role="status">
            <p className="pis-preview__head">
              <StatusMark tone={errors.length ? "warn" : "ok"}>{parsed.file}</StatusMark>
              {parsed.result.valid.length} {parsed.result.valid.length === 1 ? "fila lista" : "filas listas"}
              {errors.length ? ` · ${errors.length} ${errors.length === 1 ? "error" : "errores"}` : ""}
            </p>
            {errors.length > 0 && (
              <ul className="pis-preview__errors">
                {errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {errors.length > 12 && <li>… y {errors.length - 12} más.</li>}
              </ul>
            )}
            <label className="pis-preview__replace" data-on={replace || undefined}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Reemplazar: borrar las {kind === "respuesta" ? "respuestas" : "capciosas"} guardadas que no vengan en este libro
            </label>
            <div className="pis-actions">
              <button type="button" className="button-secondary" onClick={() => setParsed(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={!parsed.result.valid.length || importRows.isPending}
                onClick={() => importRows.mutate({ k: kind, valid: parsed.result.valid, all: replace })}
              >
                {importRows.isPending ? "Importando…" : `Importar ${parsed.result.valid.length}${errors.length ? " (sin las que tienen error)" : ""}`}
              </button>
            </div>
          </div>
        )}
        {message && (
          <p className="pis-result" role="status">
            <StatusMark tone={message.ok ? "ok" : "fail"}>{message.text}</StatusMark>
          </p>
        )}
      </Group>

      <Group
        title={kind === "respuesta" ? "Respuestas guardadas" : "Capciosas guardadas"}
        aside={rows.length ? <small>{rows.filter((e) => e.active).length} en uso de {rows.length}</small> : null}
      >
        {toggle.isError && (
          <p className="pis-error" role="alert">
            No se cambió: {(toggle.error as Error).message}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="pis-small">Todavía no hay {kind === "respuesta" ? "respuestas" : "capciosas"}. Descargue la plantilla, escríbalas e impórtelas.</p>
        ) : (
          <ul className="pis-cat">
            {rows.map((e) => (
              <li key={e.key} data-off={!e.active || undefined}>
                <code>{e.key}</code>
                <span>
                  <strong>{kind === "respuesta" ? e.question : e.question || e.triggers.join(" · ")}</strong>
                  <small>{e.answer}</small>
                  {kind === "capciosa" && <small>Disparadores: {e.triggers.join(" · ")}</small>}
                </span>
                <em>
                  {e.mood} · {e.hits} {e.hits === 1 ? "uso" : "usos"}
                </em>
                <Switch on={e.active} onChange={(active) => toggle.mutate({ key: e.key, active })} label={`Usar ${e.key}`} />
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}
