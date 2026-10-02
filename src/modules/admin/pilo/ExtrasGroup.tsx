/* =============================================================================
   Intranet · Mr. Pilo con IA · Funciones ampliadas (0119).

   Quién puede adjuntar un archivo para que Pilo lo analice y quién puede
   pedirle código, por cada Pilo, y los topes de las dos funciones. El archivo
   se lee en el dispositivo de la persona y no se guarda: aquí solo viven el
   permiso y los topes (tabla pilo_extras).

   Cada cambio se aplica al momento: no espera a «Guardar cambios». Sin la
   migración 0119 el grupo lo dice y queda apagado.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { extraSettings } from "../../../components/pilo/ai/logic";
import type { ExtraAudience, ExtraSettings } from "../../../components/pilo/ai/logic";
import { Group, StatusMark } from "./ui";

const SPACES: { id: "planeacion" | "ensenanza"; name: string }[] = [
  { id: "planeacion", name: "Pilo de la Universidad" },
  { id: "ensenanza", name: "Pilo en Enseñanza" },
];

const AUDIENCES: { id: ExtraAudience; label: string }[] = [
  { id: "nadie", label: "Nadie" },
  { id: "admin", label: "Solo administración" },
  { id: "sesion", label: "Con sesión" },
  { id: "publico", label: "Todos" },
];

const KEY = ["pilo-ia", "extras-admin"];

type Rows = Record<string, ExtraSettings>;
type Patch = Partial<{ files_aud: ExtraAudience; code_aud: ExtraAudience; file_max_mb: number; file_daily: number; code_max_tokens: number }>;

function useExtrasAdmin() {
  return useQuery({
    queryKey: KEY,
    retry: false,
    queryFn: async (): Promise<Rows | null> => {
      const { data, error } = await supabase.from("pilo_extras").select("*");
      // Sin la migración 0119 la tabla no existe.
      if (error) return null;
      return Object.fromEntries(((data ?? []) as { space: string }[]).map((row) => [row.space, extraSettings(row)]));
    },
  });
}

function useSaveExtras() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ space, patch }: { space: string; patch: Patch }) => {
      const { error } = await supabase.from("pilo_extras").update({ ...patch, updated_at: new Date().toISOString() }).eq("space", space);
      if (error) throw new Error(error.message);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: KEY });
      void client.invalidateQueries({ queryKey: ["pilo-ia", "extras"] });
    },
  });
}

const clamp = (value: string, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function ExtrasGroup() {
  const rows = useExtrasAdmin();
  const save = useSaveExtras();
  const missing = rows.data === null;
  const of = (space: string) => rows.data?.[space] ?? extraSettings(null);
  const change = (space: string, patch: Patch) => save.mutate({ space, patch });

  const audience = (space: (typeof SPACES)[number], field: "files_aud" | "code_aud", what: string) => {
    const now = of(space.id)[field === "files_aud" ? "filesAud" : "codeAud"];
    return (
      <select value={now} disabled={missing || rows.isPending} aria-label={`${what} en ${space.name}`} onChange={(e) => change(space.id, { [field]: e.target.value as ExtraAudience })}>
        {AUDIENCES.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    );
  };

  const limit = (space: (typeof SPACES)[number], field: "file_max_mb" | "file_daily" | "code_max_tokens", label: string, min: number, max: number) => {
    const current = of(space.id);
    const value = field === "file_max_mb" ? current.fileMaxMb : field === "file_daily" ? current.fileDaily : current.codeMaxTokens;
    return (
      <label>
        {label}
        {/* Se guarda al salir del campo: escribir un número no dispara un guardado por cada tecla. */}
        <input key={`${space.id}-${field}-${value}`} type="number" min={min} max={max} defaultValue={value} disabled={missing || rows.isPending} onBlur={(e) => {
          const next = clamp(e.target.value, min, max, value);
          e.target.value = String(next);
          if (next !== value) change(space.id, { [field]: next });
        }} />
      </label>
    );
  };

  return (
    <Group
      title="Funciones ampliadas"
      aside={
        <small role="status">
          {missing ? <StatusMark tone="warn">Falta la migración 0119</StatusMark> : save.isPending ? "Guardando…" : save.isError ? <StatusMark tone="fail">No se guardó</StatusMark> : "Cada cambio se aplica al momento"}
        </small>
      }
    >
      <p className="pis-lead">
        Decida, por cada Pilo, quién puede adjuntar un archivo para que Pilo lo analice y quién puede pedirle código. El archivo se lee en el dispositivo de la persona y no se
        guarda en el servidor ni entra a la memoria de Pilo: solo viajan a la IA los pasajes que la pregunta necesita, sin correos, teléfonos ni documentos.
      </p>
      {missing && <p className="pis-warn">Falta aplicar la migración 0119 en la base: hasta entonces las dos funciones están apagadas para todos.</p>}

      <div className="pis-extras" role="table" aria-label="Quién puede usar cada función">
        <div role="row" className="pis-extras__head">
          <span role="columnheader">Función</span>
          {SPACES.map((s) => (
            <span key={s.id} role="columnheader">
              {s.name}
            </span>
          ))}
        </div>
        <div role="row">
          <span role="rowheader">
            <strong>Analizar archivos</strong>
            <small>Word, Excel, CSV y PDF con texto</small>
          </span>
          {SPACES.map((s) => (
            <span key={s.id} role="cell">
              {audience(s, "files_aud", "Analizar archivos")}
            </span>
          ))}
        </div>
        <div role="row">
          <span role="rowheader">
            <strong>Generar código</strong>
            <small>Bloques de código y respuestas más extensas</small>
          </span>
          {SPACES.map((s) => (
            <span key={s.id} role="cell">
              {audience(s, "code_aud", "Generar código")}
            </span>
          ))}
        </div>
      </div>

      {SPACES.map((s) => (
        <div key={s.id} className="pis-grid pis-grid--3" role="group" aria-label={`Topes de ${s.name}`}>
          {limit(s, "file_max_mb", `${s.name}: tamaño máximo del archivo (MB)`, 1, 25)}
          {limit(s, "file_daily", "Análisis por persona al día (0 = sin tope)", 0, 200)}
          {limit(s, "code_max_tokens", "Extensión de una respuesta con código o análisis", 400, 4000)}
        </div>
      ))}

      <p className="pis-small">
        «Con sesión» es, por ahora, el personal con cuenta en la intranet. A quien no tiene permiso el clip no le aparece; si pide código, Pilo se lo explica en palabras. La
        administración no tiene tope diario.
      </p>
      {save.isError && (
        <p className="pis-error" role="alert">
          No se guardó: {(save.error as Error).message}
        </p>
      )}
    </Group>
  );
}
