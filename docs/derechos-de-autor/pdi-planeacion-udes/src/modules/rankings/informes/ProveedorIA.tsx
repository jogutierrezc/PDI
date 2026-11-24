/* =============================================================================
   Informes ODS con Pilo · el proveedor de IA de los rankings.

   «Igual que Pilo» (el proveedor de Mr. Pilo) o «Mistral» (con la clave que
   ya guarda Mr. Pilo), el modelo (texto libre, con las sugerencias de
   Mistral), el modelo de visión y el tamaño del lote. Planeación lo ve; solo
   la administración lo cambia (la base también lo impide). Dice qué proveedor
   y modelo está usando Pilo ahora y avisa si falta la clave.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth";
import { AJUSTES_IA_DE_PARTIDA, MODELOS_MISTRAL, VISION_MISTRAL, useAjustesRankingsIA, useGuardarAjustesRankingsIA } from "./datos";
import type { AjustesRankingsIA, EstadoPiloInforme } from "./datos";

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** «mistral · mistral-small-latest · visión pixtral-12b-2409 · lote 5». */
export function textoEnUso(e: EstadoPiloInforme | undefined): string {
  if (!e) return "";
  const partes = [e.proveedor || (e.eleccion === "mistral" ? "Mistral" : "el de Mr. Pilo"), e.modelo, e.vision ? `visión ${e.vision}` : "", e.lote ? `lote ${e.lote}` : ""].filter(Boolean);
  return partes.join(" · ");
}

export function ProveedorIA({ estado }: { estado?: EstadoPiloInforme }) {
  const auth = useAuth();
  const admin = typeof auth.hasRole === "function" ? auth.hasRole("admin") : auth.profile?.role === "admin";
  const q = useAjustesRankingsIA();
  const guardar = useGuardarAjustesRankingsIA();
  const actual = q.data ?? AJUSTES_IA_DE_PARTIDA;
  const [a, setA] = useState<AjustesRankingsIA>(actual);
  const firma = JSON.stringify(actual);
  useEffect(() => setA(JSON.parse(firma) as AjustesRankingsIA), [firma]);
  const cambiado = JSON.stringify(a) !== firma;
  const faltaClave = estado && !estado.lista && /clave|key|api/i.test(estado.motivo ?? "");

  return (
    <details className="ri-ia">
      <summary>
        Proveedor de IA: <b>{actual.ai_provider === "mistral" ? "Mistral" : "igual que Pilo"}</b>
        {estado && textoEnUso(estado) && <span className="ri-mute"> · Pilo usa {textoEnUso(estado)}</span>}
      </summary>
      {faltaClave && (
        <p className="ri-error" role="alert">
          Falta la clave del proveedor: {estado?.motivo}
        </p>
      )}
      <fieldset className="ri-ia__form" disabled={!admin || guardar.isPending}>
        <legend className="ri-k">Proveedor de IA para los rankings</legend>
        <div className="ri-seg" role="group" aria-label="Proveedor">
          <button type="button" aria-pressed={a.ai_provider === "pilo"} onClick={() => setA({ ...a, ai_provider: "pilo" })}>
            Igual que Pilo
          </button>
          <button type="button" aria-pressed={a.ai_provider === "mistral"} onClick={() => setA({ ...a, ai_provider: "mistral" })}>
            Mistral
          </button>
        </div>
        <label className="ri-field">
          Modelo
          <input type="text" list="ri-modelos" placeholder={a.ai_provider === "mistral" ? MODELOS_MISTRAL[0] : "El de Mr. Pilo"} value={a.ai_model} onChange={(e) => setA({ ...a, ai_model: e.target.value })} />
          <datalist id="ri-modelos">
            {MODELOS_MISTRAL.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="ri-field">
          Modelo de visión
          <select value={a.ai_vision_model} onChange={(e) => setA({ ...a, ai_vision_model: e.target.value })}>
            <option value="">Sin visión</option>
            <option value={VISION_MISTRAL}>{VISION_MISTRAL}</option>
          </select>
        </label>
        <label className="ri-field">
          Tamaño de lote
          <select value={a.ai_batch} onChange={(e) => setA({ ...a, ai_batch: Number(e.target.value) })}>
            <option value={0}>Automático</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="ri-row">
          <button type="button" className="button-primary rk-sm" disabled={!cambiado} onClick={() => guardar.mutate(a)}>
            Guardar
          </button>
        </div>
      </fieldset>
      {!admin && <p className="ri-mute">Solo la administración cambia el proveedor; Planeación lo ve.</p>}
      {guardar.error && (
        <p className="ri-error" role="alert">
          {errorTexto(guardar.error)}
        </p>
      )}
      {q.error && <p className="ri-error">No se pudieron leer los ajustes: {errorTexto(q.error)}</p>}
    </details>
  );
}
