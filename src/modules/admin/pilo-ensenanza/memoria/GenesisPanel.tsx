/* =============================================================================
   Mr. Pilo en Enseñanza · Memoria › Génesis («Mis notas» de la app, 0131).

   En la app, un estudiante con cuenta de Pilo conecta Génesis con su propio
   código y contraseña y ve su histórico de notas (función pilo-genesis). Aquí
   la administración decide lo único que esa función necesita de la base: A
   DÓNDE llamar (pilo_spaces.genesis_url) y si está encendida
   (pilo_spaces.genesis_on). Nace apagada y sin dirección.

   No hay token ni secreto que guardar: cada estudiante entra con lo suyo, y
   nada de Génesis entra a la memoria de Pilo. Este panel no llama a Génesis ni
   a la función: solo guarda la dirección, revisada con la misma regla de la
   función (genesisSite: https, dominio público, sin ruta; puede llevar puerto).

   Sin la migración 0131 el panel lo dice y se apaga.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { genesisSite } from "../../../pilo-app/notas/servidor-logica";
import { Group, StatusMark, Switch } from "../../pilo/ui";
import { Skeleton } from "../ui";
import type { MemoryPartProps } from "./DocumentsPanel";
import { faultOf, missingMigration } from "./flow";
import type { Fault } from "./flow";
import { FaultNote, MissingNote } from "./parts";

/** La migración que le da dónde guardarse. */
const MIGRATION = "0131";

interface GenesisSetup {
  /** Falta la migración: no hay dónde guardar. */
  missing: boolean;
  on: boolean;
  url: string;
}

async function fetchGenesis(space: string): Promise<GenesisSetup> {
  const row = await supabase.from("pilo_spaces").select("genesis_on, genesis_url").eq("id", space).maybeSingle();
  if (row.error) {
    if (missingMigration(row.error) || /genesis_/i.test(row.error.message ?? "")) return { missing: true, on: false, url: "" };
    throw row.error;
  }
  const r = (row.data ?? {}) as Record<string, unknown>;
  return { missing: false, on: r.genesis_on === true, url: typeof r.genesis_url === "string" ? r.genesis_url : "" };
}

/** La dirección y el interruptor viven en la ficha del espacio; se guardan al momento. */
async function saveGenesis(space: string, patch: { genesis_on?: boolean; genesis_url?: string }): Promise<void> {
  const { error } = await supabase.from("pilo_spaces").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", space);
  if (error) throw error;
}

export function GenesisPanel({ space, disabled }: MemoryPartProps) {
  const client = useQueryClient();
  const key = ["pilo-ia", "memoria", "genesis", space] as const;
  const setup = useQuery({ queryKey: key, enabled: !disabled, queryFn: () => fetchGenesis(space) });
  const [url, setUrl] = useState("");
  const [urlBad, setUrlBad] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "url" | "on">(null);
  const [fault, setFault] = useState<{ where: string; fault: Fault } | null>(null);

  const data = setup.data;
  useEffect(() => {
    if (data) setUrl(data.url);
  }, [data?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (what: "url" | "on", where: string, patch: { genesis_on?: boolean; genesis_url?: string }) => {
    if (busy) return;
    setBusy(what);
    setFault(null);
    try {
      await saveGenesis(space, patch);
    } catch (error) {
      setFault({ where, fault: faultOf(error) });
    } finally {
      setBusy(null);
      void client.invalidateQueries({ queryKey: key });
    }
  };

  const saveUrl = () => {
    const raw = url.trim();
    // Vaciarla la quita, y con ella se apaga: encendida sin dirección no sirve.
    if (!raw) return void (setUrlBad(null), act("url", "No se guardó la dirección", { genesis_url: "", genesis_on: false }));
    const checked = genesisSite(raw);
    if (!checked.ok) return setUrlBad(checked.reason);
    setUrlBad(null);
    void act("url", "No se guardó la dirección", { genesis_url: checked.site });
  };

  const state = !data || data.missing ? null : !data.url ? (
    <StatusMark tone="off">Sin dirección</StatusMark>
  ) : !data.on ? (
    <StatusMark tone="warn">Dirección guardada · apagada</StatusMark>
  ) : (
    <StatusMark tone="ok">Encendida para los estudiantes</StatusMark>
  );

  return (
    <Group title="Génesis · Mis notas" aside={<small>{state}</small>}>
      <p className="pis-lead">
        En la app, cada estudiante entra a Génesis con su propio código y contraseña para ver su histórico de notas. Pilo solo lee, no guarda la contraseña ni las notas, y nada de eso
        entra a esta memoria. Aquí se dice a qué Génesis llama la app, y si está encendida.
      </p>

      {disabled ? (
        <p className="pis-small">Sin la migración 0113 este Pilo no tiene dónde guardar la conexión.</p>
      ) : setup.isError ? (
        <FaultNote fault={faultOf(setup.error)} lead="No se pudo leer la conexión con Génesis" onRetry={() => void setup.refetch()} />
      ) : setup.isPending || !data ? (
        <Skeleton rows={1} label="Leyendo la conexión con Génesis" />
      ) : data.missing ? (
        <MissingNote migration={MIGRATION} what="Sin ella no hay dónde guardar la dirección de Génesis, y la app dice que Mis notas aún no está disponible." />
      ) : (
        <>
          <form
            className="pen-field"
            onSubmit={(e) => {
              e.preventDefault();
              saveUrl();
            }}
          >
            <span className="pen-field__label">Dirección de Génesis</span>
            <span className="pen-add">
              <input
                type="url"
                inputMode="url"
                value={url}
                placeholder="https://…"
                aria-label="Dirección de Génesis"
                aria-invalid={Boolean(urlBad) || undefined}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlBad(null);
                }}
              />
              <button type="submit" className="button-secondary" disabled={Boolean(busy) || url.trim() === data.url}>
                {busy === "url" ? "Guardando…" : "Guardar dirección"}
              </button>
            </span>
            <small>
              {urlBad ? (
                <b className="pen-bad">{urlBad}</b>
              ) : (
                "La de entrada al portal del estudiante, con https y sin ruta. Puede llevar puerto (https://sitio:81). Se guarda al momento, aparte de «Guardar cambios»."
              )}
            </small>
          </form>

          <div className="pis-actions">
            <span className="pen-doc__switch">
              <Switch on={data.on} disabled={Boolean(busy) || !data.url} onChange={(on) => void act("on", "No se cambió Mis notas", { genesis_on: on })} label="Mis notas en la app" />
              {data.on ? "Mis notas encendida" : "Mis notas apagada"}
            </span>
            {!data.url && <span className="pis-small">Guarde la dirección para poder encenderla.</span>}
          </div>

          {fault && <FaultNote fault={fault.fault} lead={fault.where} />}

          <p className="pis-note">
            <b>Antes de encenderla.</b> La dirección que se conoce hoy es la del ambiente de validación de Génesis, no la de producción, y atiende en un puerto propio: no está comprobado
            que la función de Pilo pueda salir por ese puerto. Hace falta el visto bueno de TI para que Pilo entre con credenciales de estudiantes. La función solo llama a cuatro rutas
            de Génesis (el ingreso, el polígrafo, el récord de notas y el polígrafo en PDF) y descarta los datos personales que trae el ingreso.
          </p>
        </>
      )}
    </Group>
  );
}
