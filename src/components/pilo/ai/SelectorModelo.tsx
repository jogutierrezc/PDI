/* =============================================================================
   Selector «Pilo · Astra»: segmentado, visible solo si el servidor ofrece más de un
   modelo (hay sesión y Astra está encendido). La elección se recuerda en este
   navegador. `useModelos` pide el catálogo una vez (acción `modelos`).
   ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import { fetchModelos } from "./client";
import type { AskPortal, CatalogoModelos, ModeloId } from "./client";
import { guardarModelo, leerModelo, modeloVigente } from "./modelo";
import { tr, useLang } from "../i18n";

const SOLO_PILO: CatalogoModelos = { modelos: [{ id: "pilo", label: "Pilo", razona: false }], defecto: "pilo" };

export function useModelos(portal: AskPortal = "pregunta", activo = true) {
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(SOLO_PILO);
  const [elegido, setElegido] = useState<ModeloId | null>(() => leerModelo());
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void fetchModelos(portal).then((c) => vivo && setCatalogo(c));
    return () => {
      vivo = false;
    };
  }, [portal, activo]);
  const modelo = modeloVigente(catalogo, elegido);
  const elegir = useCallback((id: ModeloId) => {
    guardarModelo(id);
    setElegido(id);
  }, []);
  const info = catalogo.modelos.find((m) => m.id === modelo) ?? catalogo.modelos[0];
  return { catalogo, modelo, elegir, razona: info.razona };
}

export function SelectorModelo({ catalogo, modelo, onChange, disabled = false, className = "" }: { catalogo: CatalogoModelos; modelo: ModeloId; onChange: (id: ModeloId) => void; disabled?: boolean; className?: string }) {
  useLang();
  if (catalogo.modelos.length < 2) return null;
  return (
    <div className={`pp-modelo ${className}`.trim()} role="radiogroup" aria-label={tr("Modelo de Pilo")}>
      {catalogo.modelos.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={modelo === m.id} disabled={disabled} title={m.razona ? tr("Razona antes de responder; tarda más.") : tr("Respuesta rápida.")} onClick={() => onChange(m.id)}>
          {m.id === "pilo" ? "Pilo" : "Astra"}
        </button>
      ))}
    </div>
  );
}
