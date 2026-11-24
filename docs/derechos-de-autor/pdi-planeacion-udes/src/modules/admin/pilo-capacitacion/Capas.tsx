/* =============================================================================
   Capacitación de Pilo · Capas y memoria.

   Cuatro filas plegables, como en Mr. Pilo en Enseñanza: las dos capas (qué
   público tiene cada una), las fuentes de la memoria unificada y el cuaderno de
   decisiones. Los números son reales cuando la base los tiene (catálogo,
   bandeja, pasajes); lo que no se cuenta desde aquí dice «Sin contar aquí», no
   un cero.
   ========================================================================== */

import { useState } from "react";
import { FoldRow } from "../pilo-ensenanza/ui";
import { plural } from "../pilo/ui";
import type { CapaFiltro, Conteos } from "./store";
import { useConteos } from "./store";

type RowId = "institucional" | "academica" | "fuentes" | "cuaderno";

const CAPAS_FUENTE: { id: CapaFiltro; label: string }[] = [
  { id: "todas", label: "Ambas capas" },
  { id: "planeacion", label: "Institucional" },
  { id: "ensenanza", label: "Académica" },
];

/** Una fuente de la memoria: en qué capas está, y su número si se cuenta desde aquí. */
interface Fuente {
  nombre: string;
  nota: string;
  capas: ("planeacion" | "ensenanza")[];
  cuenta: (c: Conteos | null, pendientes: number | null) => string;
}

const SIN_CONTAR = "Sin contar aquí";

const FUENTES: Fuente[] = [
  {
    nombre: "Catálogo de respuestas",
    nota: "Redactadas y firmadas por cada oficina",
    capas: ["planeacion", "ensenanza"],
    cuenta: (c) => (c ? plural(c.catalogo.planeacion + c.catalogo.ensenanza, "respuesta", "respuestas") : SIN_CONTAR),
  },
  {
    nombre: "Bandeja de aprendizaje",
    nota: "Preguntas sin respuesta y votos «No me sirvió»",
    capas: ["planeacion", "ensenanza"],
    cuenta: (_c, p) => (p === null ? SIN_CONTAR : plural(p, "abierta", "abiertas")),
  },
  {
    nombre: "Pasajes de documentos y Moodle",
    nota: "Documentos leídos por trozos, con página",
    capas: ["planeacion", "ensenanza"],
    cuenta: (c) => (c ? plural(c.memoria, "pasaje", "pasajes") : SIN_CONTAR),
  },
  {
    nombre: "Cifras en vivo",
    nota: "UDES en Cifras, año, periodo y sede",
    capas: ["planeacion", "ensenanza"],
    cuenta: () => SIN_CONTAR,
  },
  {
    nombre: "Acuerdos, normas y reglamentos",
    nota: "Documentos leídos por trozos",
    capas: ["planeacion"],
    cuenta: () => SIN_CONTAR,
  },
  {
    nombre: "Reglamento estudiantil y planes de estudio",
    nota: "Malla curricular por programa y sede",
    capas: ["ensenanza"],
    cuenta: () => SIN_CONTAR,
  },
];

const NOTAS = [
  { cuando: "Septiembre 2026", titulo: "Búsqueda híbrida por palabras y significado", cuerpo: "Los embeddings se suman al texto. El umbral de parecido sigue sin calibrar con datos reales." },
  { cuando: "Septiembre 2026", titulo: "Bandeja de aprendizaje", cuerpo: "La misma pregunta suma veces y se cierra con la clave del catálogo. Es la base de esta capacitación." },
  { cuando: "Octubre 2026", titulo: "Pensamiento unificado de ambos Pilos", cuerpo: "Un solo camino rápido de respuesta; las memorias siguen separadas y solo se tocan en un mapa de conexiones." },
  { cuando: "Por decidir", titulo: "Dos capas con un público por pieza", cuerpo: "La capa define cómo piensa Pilo; el público define quién puede oír cada respuesta." },
];

export function Capas({ pendientes }: { pendientes: number | null }) {
  const conteos = useConteos();
  const [open, setOpen] = useState<RowId | null>("fuentes");
  const [capa, setCapa] = useState<CapaFiltro>("todas");
  const c = conteos.data ?? null;
  const fuentes = FUENTES.filter((f) => capa === "todas" || f.capas.includes(capa));
  const pick = (id: RowId) => setOpen((prev) => (prev === id ? null : id));

  return (
    <div className="pis-sheet">
      {!conteos.isPending && !c && (
        <p className="pis-warn" role="status">
          No se pudieron contar el catálogo y la memoria. Las cifras de esta pantalla dicen «Sin contar aquí» hasta que la base responda.
        </p>
      )}

      <div className="pis-group pcap-capa-rows">
        <FoldRow
          id="institucional"
          title="Pilo Institucional"
          summary={`Administrativos, colaboradores y Consejo Directivo · ${c ? plural(c.catalogo.planeacion, "respuesta", "respuestas") : SIN_CONTAR}`}
          open={open === "institucional"}
          onToggle={() => pick("institucional")}
        >
          <p className="pcap-texto">Responde sobre trámites, normas, cifras y procesos de la universidad. Piensa como la memoria de la gestión.</p>
          <div className="pcap-chips">
            <span className="pcap-tag" data-capa="institucional">
              <i aria-hidden="true" />
              Personal administrativo
            </span>
            <span className="pcap-tag" data-capa="institucional">
              <i aria-hidden="true" />
              Colaboradores
            </span>
            <span className="pcap-tag" data-capa="institucional">
              <i aria-hidden="true" />
              Consejo Directivo
            </span>
          </div>
        </FoldRow>

        <FoldRow
          id="academica"
          title="Pilo Académico"
          summary={`Profesores y estudiantes, más lo institucional que les toca · ${c ? plural(c.catalogo.ensenanza, "respuesta", "respuestas") : SIN_CONTAR}`}
          open={open === "academica"}
          onToggle={() => pick("academica")}
        >
          <p className="pcap-texto">Hereda lo institucional que le toca a cada público y suma calendario, reglamentos, planes de estudio y Moodle.</p>
          <div className="pcap-chips">
            <span className="pcap-tag" data-capa="academica">
              <i aria-hidden="true" />
              Profesores
            </span>
            <span className="pcap-tag" data-capa="academica">
              <i aria-hidden="true" />
              Estudiantes
            </span>
            <span className="pcap-tag" data-capa="academica">
              <i aria-hidden="true" />
              Lo institucional que les corresponde
            </span>
          </div>
        </FoldRow>

        <FoldRow
          id="fuentes"
          title="Qué sabe Pilo"
          summary={`${FUENTES.length} fuentes en la memoria unificada`}
          open={open === "fuentes"}
          onToggle={() => pick("fuentes")}
        >
          <div className="pis-seg pcap-capas" role="radiogroup" aria-label="Ver capa">
            {CAPAS_FUENTE.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={capa === f.id} onClick={() => setCapa(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <ul className="pcap-fuentes">
            {fuentes.map((f) => {
              const compartida = f.capas.length === 2;
              return (
                <li key={f.nombre} className="pcap-fuente">
                  <span className="pcap-fuente__name">
                    <strong>{f.nombre}</strong>
                    <small>{f.nota}</small>
                  </span>
                  <span className="pcap-fuente__count">{f.cuenta(c, pendientes)}</span>
                  <span className="pcap-fuente__capa">
                    {compartida ? (
                      <span className="pcap-tag" data-capa="compartida">
                        <i aria-hidden="true" />
                        Compartida
                      </span>
                    ) : (
                      <span className="pcap-tag" data-capa={f.capas[0] === "planeacion" ? "institucional" : "academica"}>
                        <i aria-hidden="true" />
                        {f.capas[0] === "planeacion" ? "Solo institucional" : "Solo académica"}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </FoldRow>

        <FoldRow
          id="cuaderno"
          title="Cuaderno de conocimiento"
          summary="Decisiones y optimizaciones, en graphify"
          open={open === "cuaderno"}
          onToggle={() => pick("cuaderno")}
        >
          <p className="pcap-texto">Cada decisión sobre la memoria queda anotada con su porqué, para que el equipo y el propio Pilo sepan qué se cambió y qué falta optimizar.</p>
          <ol className="pcap-notas">
            {NOTAS.map((n) => (
              <li key={n.titulo}>
                <span>{n.cuando}</span>
                <strong>{n.titulo}</strong>
                <small>{n.cuerpo}</small>
              </li>
            ))}
          </ol>
        </FoldRow>
      </div>
    </div>
  );
}
