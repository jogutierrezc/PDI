/* =============================================================================
   Intranet · Capacitación de Pilo (solo administración).

   Una sola memoria con dos capas de pensamiento: Institucional (el Pilo de
   Planeación) y Académica (Mr. Pilo en Enseñanza). Esta pantalla es el lugar
   para capacitarlo; no abre ni cierra a Pilo, eso sigue en cada Mr. Pilo.

   Tres secciones por el riel de la cabecera, enlazables por la dirección:

     Capas y memoria      ?seccion=capas           las dos capas y las fuentes.
     Bandeja y capacitación ?seccion=bandeja&pagina=3&capa=ensenanza
                                                   lo que Pilo no supo, paginado.
     Oficinas y permisos  ?seccion=oficinas        qué puede enseñar cada oficina.

   El panel de Pilo a la izquierda (PiloDock), con sus datos. Sin la migración
   0180 se pintan los valores de partida y se dice arriba.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { PiloDock } from "../pilo-ensenanza/PiloDock";
import type { DockFact } from "../pilo-ensenanza/PiloDock";
import { revealSection } from "../pilo/motion";
import { StatusMark } from "../pilo/ui";
import "../pilo/pilo-settings.css";
import "../pilo-ensenanza/pilo-ensenanza.css";
import "./pilo-capacitacion.css";
import { Capacitar } from "./Capacitar";
import { Capas } from "./Capas";
import { Oficinas } from "./Oficinas";
import { useConteos, useInboxPage, useOficinas } from "./store";

const SHELL = {
  section: "pilo_capacitacion" as const,
  kicker: "Sistema",
  title: "Capacitación de Pilo",
  description: "Una memoria, dos capas de pensamiento. Lo que Pilo sabe, lo que no supo y quién puede enseñarle.",
};

type SeccionId = "capas" | "bandeja" | "oficinas";

const SECCIONES: { id: SeccionId; label: string; title: string; lead: string }[] = [
  {
    id: "capas",
    label: "Capas y memoria",
    title: "Dos capas, una memoria",
    lead: "La capa decide cómo razona Pilo; el público decide quién puede oír cada respuesta. Cada oficina enseña lo suyo y todo cae en la misma memoria.",
  },
  {
    id: "bandeja",
    label: "Bandeja y capacitación",
    title: "Bandeja y capacitación",
    lead: "Elija una pregunta que Pilo no supo, enséñele la respuesta y decida qué capa piensa y quién puede oírla.",
  },
  {
    id: "oficinas",
    label: "Oficinas y permisos",
    title: "Oficinas y permisos",
    lead: "Planeación define qué capas y qué públicos puede tocar cada oficina. Los roles son los de la estructura de usuarios.",
  },
];

function parseSeccion(raw: string | null): SeccionId {
  return SECCIONES.find((s) => s.id === raw)?.id ?? "capas";
}

export function PiloCapacitacionPage() {
  const [params, setParams] = useSearchParams();
  const seccion = parseSeccion(params.get("seccion"));
  const panels = useRef<Record<string, HTMLElement | null>>({});
  const via = useRef<"pointer" | "keyboard" | null>(null);

  // Lo que se muestra en el riel y en el panel: el total de la bandeja y los conteos.
  const todas = useInboxPage(1, "todas");
  const pendientes = todas.data ? todas.data.total : null;
  const conteos = useConteos();
  const oficinas = useOficinas();
  const missing = oficinas.data?.missing ?? false;

  // Cambiar de sección con el puntero se ve; con el teclado, no.
  useLayoutEffect(() => {
    if (via.current === "pointer") revealSection(panels.current[seccion] ?? null);
    via.current = null;
  }, [seccion]);

  const go = (id: SeccionId, how: "pointer" | "keyboard" = "pointer") => {
    if (id === seccion) return;
    via.current = how;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("seccion", id);
        return next;
      },
      { replace: true },
    );
  };

  const cat = conteos.data ? conteos.data.catalogo.planeacion + conteos.data.catalogo.ensenanza : null;
  const facts: DockFact[] = [
    {
      id: "catalogo",
      label: "Catálogo",
      value: cat === null ? <StatusMark tone="off">Sin contar</StatusMark> : cat.toLocaleString("es-CO"),
      detail: "respuestas firmadas por oficinas",
      onClick: () => go("capas"),
    },
    {
      id: "bandeja",
      label: "Bandeja",
      value: pendientes === null ? <StatusMark tone="off">Sin contar</StatusMark> : pendientes.toLocaleString("es-CO"),
      detail: "preguntas esperando respuesta",
      onClick: () => go("bandeja"),
    },
    {
      id: "memoria",
      label: "Memoria",
      value: !conteos.data ? <StatusMark tone="off">Sin contar</StatusMark> : conteos.data.memoria.toLocaleString("es-CO"),
      detail: "pasajes leídos por trozos, con página",
      onClick: () => go("capas"),
    },
  ];

  const rail = (
    <nav className="admin-rail pis-tabs" aria-label="Secciones de Capacitación de Pilo">
      {SECCIONES.map((s) => {
        const on = s.id === seccion;
        return (
          <button
            key={s.id}
            type="button"
            className="admin-rail__tab"
            aria-current={on ? "page" : undefined}
            onClick={(e) => go(s.id, e.detail === 0 ? "keyboard" : "pointer")}
          >
            {s.label}
            {s.id === "bandeja" && pendientes !== null && <span className="pcap-count">{pendientes.toLocaleString("es-CO")}</span>}
          </button>
        );
      })}
    </nav>
  );

  const body: Record<SeccionId, () => ReactNode> = {
    capas: () => <Capas pendientes={pendientes} />,
    bandeja: () => <Capacitar />,
    oficinas: () => <Oficinas missing={missing} />,
  };

  return (
    <AdminShell {...SHELL} rail={rail}>
      <div className="pis pen pcap">
        {missing && (
          <p className="pis-warn" role="status">
            <strong>Falta aplicar la migración 0180</strong> en la base. Hasta entonces, la capa, el público y los permisos por oficina se muestran con sus valores de
            partida y no se guardan. La bandeja y el catálogo funcionan como siempre.
          </p>
        )}

        <div className="pen-app">
          <PiloDock status="Aprendiendo de dos capas" facts={facts} nod={0} />

          <div className="pen-work">
            {SECCIONES.map((s) => (
              <section
                key={s.id}
                id={`pcap-panel-${s.id}`}
                aria-labelledby={`pcap-h-${s.id}`}
                hidden={s.id !== seccion}
                className="pis-panel"
                ref={(el) => (panels.current[s.id] = el)}
              >
                <header className="pis-panel__head">
                  <h2 id={`pcap-h-${s.id}`}>{s.title}</h2>
                  <p>{s.lead}</p>
                </header>
                {body[s.id]()}
              </section>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
