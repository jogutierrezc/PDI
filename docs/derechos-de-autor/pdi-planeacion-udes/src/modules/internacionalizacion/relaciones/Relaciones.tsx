/* =============================================================================
   Internacionalización · Relaciones (0254): el directorio único de contactos
   (académicos y empleadores), el formulario, la exportación, las plantillas de
   correo, el envío masivo y la validación de correos.

   La selección del Directorio viaja a Envío masivo y a Validar correos. Las
   cuatro pestañas se desmontan al salir (no hay estado oculto que se pierda).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FaltaMigracion } from "../datos";
import { AvisoMigracion, Cargando, ErrorCaja } from "../ui/comunes";
import type { Ctx } from "../ui/comunes";
import { Directorio } from "./Directorio";
import { EnvioMasivo } from "./EnvioMasivo";
import { PlantillasCorreo } from "./PlantillasCorreo";
import { ValidarCorreos } from "./ValidarCorreos";
import { useDirectorio, usePlantillasRel } from "./datos";
import "./relaciones.css";

type Pestana = "directorio" | "plantillas" | "envio" | "validar";
const PESTANAS: { id: Pestana; rotulo: string }[] = [
  { id: "directorio", rotulo: "Directorio" },
  { id: "plantillas", rotulo: "Plantillas" },
  { id: "envio", rotulo: "Envío masivo" },
  { id: "validar", rotulo: "Validar correos" },
];

const norma = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase().trim();

export function Relaciones({ ctx }: { ctx: Ctx }) {
  const directorio = useDirectorio();
  const plantillas = usePlantillasRel();
  const [pestana, setPestana] = useState<Pestana>("directorio");
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [plantillaId, setPlantillaId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [llegada, setLlegada] = useState("");
  const atendido = useRef(false);

  const contactos = useMemo(() => directorio.data ?? [], [directorio.data]);
  const elegidos = useMemo(() => contactos.filter((c) => seleccion.has(c.id)), [contactos, seleccion]);

  // Llegada desde Convenios › Avisar: ?plantilla=<nombre>&institucion=<texto>. Abre Envío masivo con esa
  // plantilla y los contactos de la institución ya elegidos. No envía nada: el envío sigue siendo manual.
  useEffect(() => {
    const nombrePlantilla = params.get("plantilla");
    if (atendido.current || !nombrePlantilla || !directorio.data || !plantillas.data) return;
    atendido.current = true;
    const institucion = params.get("institucion") ?? "";
    const plantilla = plantillas.data.find((p) => p.nombre === nombrePlantilla);
    const k = norma(institucion);
    const coinciden = k.length >= 4 ? directorio.data.filter((c) => { const i = norma(c.institucion); return i.length >= 4 && (i.includes(k) || k.includes(i)); }) : [];
    if (plantilla) setPlantillaId(plantilla.id);
    setSeleccion(new Set(coinciden.map((c) => c.id)));
    setPestana("envio");
    setLlegada(
      coinciden.length
        ? `Se eligieron ${coinciden.length} contactos de ${institucion} para la plantilla «${nombrePlantilla}». Revise la lista antes de enviar.`
        : `No hay contactos de ${institucion} en el Directorio. Agréguelos en la pestaña Directorio o elija a quién enviar.${plantilla ? "" : ` La plantilla «${nombrePlantilla}» no existe: aplique la migración 0255.`}`,
    );
    const p = new URLSearchParams(params);
    p.delete("plantilla");
    p.delete("institucion");
    setParams(p, { replace: true });
  }, [params, setParams, directorio.data, plantillas.data]);

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const sig = PESTANAS[(i + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length].id;
    setPestana(sig);
    window.setTimeout(() => document.getElementById(`rel-t-${sig}`)?.focus(), 0);
  };

  const error = directorio.error ?? plantillas.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!directorio.data || !plantillas.data) return <Cargando texto="Abriendo Relaciones…" />;

  return (
    <div className="rel">
      <div className="rel-tabs" role="tablist" aria-label="Relaciones" onKeyDown={alTeclear}>
        {PESTANAS.map((p) => (
          <button key={p.id} id={`rel-t-${p.id}`} type="button" role="tab" aria-selected={pestana === p.id} aria-controls="rel-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => setPestana(p.id)}>
            {p.rotulo}
            {p.id === "directorio" ? <span className="rel-n">{contactos.length}</span> : p.id === "plantillas" ? <span className="rel-n">{plantillas.data.length}</span> : null}
          </button>
        ))}
      </div>
      {llegada ? (
        <p className="rel-nota-caja" role="status">
          {llegada}
        </p>
      ) : null}
      <section id="rel-panel" role="tabpanel" aria-labelledby={`rel-t-${pestana}`} className="rel-panel">
        {pestana === "directorio" ? (
          <Directorio ctx={ctx} contactos={contactos} seleccion={seleccion} onSeleccion={setSeleccion} onIr={setPestana} />
        ) : pestana === "plantillas" ? (
          <PlantillasCorreo plantillas={plantillas.data} muestra={elegidos[0] ?? contactos[0] ?? null} activa={plantillaId} onActiva={setPlantillaId} onUsar={(id) => { setPlantillaId(id); setPestana("envio"); }} />
        ) : pestana === "envio" ? (
          <EnvioMasivo contactos={contactos} elegidos={elegidos} plantillas={plantillas.data} plantillaId={plantillaId} onPlantilla={setPlantillaId} />
        ) : (
          <ValidarCorreos contactos={contactos} elegidos={elegidos} plantillas={plantillas.data} plantillaId={plantillaId} />
        )}
      </section>
    </div>
  );
}
