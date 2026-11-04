/* =============================================================================
   Internacionalización · Gestión de convenios (0256 y 0257): avisos de vencimiento y
   modelos de convenio, conectados al módulo Convenios. La ruta es
   /admin/internacionalizacion/gestion?tab=avisos|modelos[&convenio=<id>]; con
   ?tab=modelos&convenio=… se abre «Generar convenio» para ese convenio (el botón
   «Iniciar renovación» del detalle de Convenios llega por ahí).

   Quienes ven Internacionalización ven todo; escriben quienes pueden crear.
   La segunda parte (firma electrónica y vista del firmante) añade una pestaña a PESTANAS.
   ========================================================================== */

import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { FaltaMigracion } from "../datos";
import { useConvenios } from "../convenios/datos";
import type { Convenio } from "../convenios/logica";
import { puedeCrear, hoyBogota } from "../lib/permisos";
import { AvisoMigracion, Cargando, ErrorCaja } from "../ui/comunes";
import type { Ctx } from "../ui/comunes";
import { Avisos } from "./Avisos";
import { Modelos } from "./Modelos";
import "../convenios/convenios.css";
import "./gestion.css";

type Pestana = "avisos" | "modelos";

// La segunda parte agrega aquí { id: "firma", rotulo: "Firma" } y su componente.
const PESTANAS: { id: Pestana; rotulo: string }[] = [
  { id: "avisos", rotulo: "Avisos" },
  { id: "modelos", rotulo: "Modelos" },
];

export function Gestion({ ctx }: { ctx: Ctx }) {
  const q = useConvenios();
  const [params, setParams] = useSearchParams();
  const animado = useRef(false);

  const pedida = params.get("tab");
  const pestana: Pestana = PESTANAS.some((p) => p.id === pedida) ? (pedida as Pestana) : "avisos";
  const crea = ctx.director || ctx.planeacion || puedeCrear(ctx.yo);
  const hoy = hoyBogota();
  const convenios: Convenio[] = q.data ?? [];
  const convenioInicial = pestana === "modelos" ? params.get("convenio") : null;

  const elegir = (id: Pestana) => {
    const p = new URLSearchParams(params);
    p.set("tab", id);
    if (id !== "modelos") p.delete("convenio");
    setParams(p, { replace: true });
  };
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const sig = PESTANAS[(i + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length].id;
    elegir(sig);
    window.setTimeout(() => document.getElementById(`gest-t-${sig}`)?.focus(), 0);
  };

  if (q.error instanceof FaltaMigracion) return <AvisoMigracion error={q.error} />;
  if (q.error) return <ErrorCaja error={q.error as Error} />;
  if (!q.data) return <Cargando texto="Abriendo Gestión de convenios…" />;

  return (
    <div className="conv gest">
      <div className="conv-tabs" role="tablist" aria-label="Gestión de convenios" onKeyDown={alTeclear}>
        {PESTANAS.map((p) => (
          <button key={p.id} id={`gest-t-${p.id}`} type="button" role="tab" aria-selected={pestana === p.id} aria-controls="gest-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => elegir(p.id)}>
            {p.rotulo}
          </button>
        ))}
      </div>
      <div id="gest-panel" role="tabpanel" aria-labelledby={`gest-t-${pestana}`} className="conv-vista">
        {pestana === "avisos" ? (
          <Avisos
            convenios={convenios}
            hoy={hoy}
            crea={crea}
            animar={!animado.current}
            onAnimado={() => {
              animado.current = true;
            }}
          />
        ) : (
          <Modelos convenios={convenios} hoy={hoy} crea={crea} convenioInicial={convenioInicial} />
        )}
      </div>
    </div>
  );
}
