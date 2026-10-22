/* =============================================================================
   Encuestas con Pilo · «Mis encuestas y plantillas».

   La lista de encuestas con su estado, acceso y respuestas; duplicar; y las
   plantillas para empezar (Rendición de Cuentas 2026, Satisfacción, Evento, En
   blanco). Crear o duplicar pide solo el nombre; el enlace sale de él.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { useQuery } from "@tanstack/react-query";
import { contarRespuestas } from "../api";
import { slugLibre } from "../lib/editor";
import { preguntasDe } from "../lib/estructura";
import { PLANTILLAS_ENCUESTA } from "../lib/plantillas";
import type { PlantillaEncuesta } from "../lib/plantillas";
import { enterList } from "../motion";
import { ESTADOS_ENCUESTA, textoEstadoEncuesta } from "../tipos";
import type { Encuesta, EstadoEncuesta } from "../tipos";

const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" });

type Accion = { tipo: "plantilla"; plantilla: PlantillaEncuesta } | { tipo: "duplicar"; encuesta: Encuesta };

export function ListaEncuestas({
  encuestas,
  puedeEditar,
  trabajando,
  onAbrir,
  onCrear,
  onDuplicar,
}: {
  encuestas: readonly Encuesta[];
  puedeEditar: boolean;
  trabajando: boolean;
  onAbrir: (slug: string, vista?: string) => void;
  onCrear: (a: { slug: string; titulo: string; plantilla: PlantillaEncuesta }) => void;
  onDuplicar: (a: { origen: Encuesta; slug: string; titulo: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<EstadoEncuesta | "">("");
  const [accion, setAccion] = useState<Accion | null>(null);
  const [nombre, setNombre] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const conteos = useQuery({ queryKey: ["encuestas", "conteos", encuestas.map((e) => e.id).join(",")], queryFn: () => contarRespuestas(encuestas.map((e) => e.id)), retry: false });

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return encuestas.filter((e) => (!filtro || e.estado === filtro) && (!t || `${e.titulo} ${e.slug}`.toLowerCase().includes(t)));
  }, [encuestas, q, filtro]);

  useLayoutEffect(() => {
    if (lista.current) enterList(Array.from(lista.current.children).slice(0, 10));
  }, [filtro]);

  const empezar = (a: Accion) => {
    setAccion(a);
    setNombre(a.tipo === "plantilla" ? a.plantilla.titulo : `${a.encuesta.titulo} (copia)`);
    window.setTimeout(() => document.getElementById("le-nombre")?.focus(), 30);
  };
  const confirmar = () => {
    if (!accion || nombre.trim().length < 5) return;
    const slug = slugLibre(nombre, encuestas.map((e) => e.slug));
    if (accion.tipo === "plantilla") onCrear({ slug, titulo: nombre.trim(), plantilla: accion.plantilla });
    else onDuplicar({ origen: accion.encuesta, slug, titulo: nombre.trim() });
    setAccion(null);
  };

  return (
    <div className="ed-lista">
      <section className="ed-lista__cab" aria-labelledby="le-t">
        <div>
          <h2 id="le-t">Mis encuestas</h2>
          <p className="ed-fino">Cree encuestas propias, deje que Pilo guíe a quien responde y revise lo que llega. Cada una se abre a cuentas UDES o a cualquier persona.</p>
        </div>
        {puedeEditar && (
          <button type="button" className="ed-btn ed-btn--pri" onClick={() => document.getElementById("le-plantillas")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Nueva encuesta
          </button>
        )}
      </section>

      {accion && (
        <form
          className="ed-card ed-pad ed-crear"
          onSubmit={(ev) => {
            ev.preventDefault();
            confirmar();
          }}
        >
          <h3 className="ed-h3">{accion.tipo === "plantilla" ? `Nueva encuesta desde «${accion.plantilla.nombre}»` : `Duplicar «${accion.encuesta.titulo}»`}</h3>
          <div className="ed-field">
            <label htmlFor="le-nombre">Nombre de la encuesta</label>
            <input id="le-nombre" className="ed-in" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} aria-describedby="le-slug" />
            <span id="le-slug" className="ed-fino">
              Enlace: /encuesta/{slugLibre(nombre, encuestas.map((e) => e.slug))}
              {accion.tipo === "duplicar" ? " · se copia la estructura y los ajustes, no las respuestas." : ""}
            </span>
          </div>
          <div className="ed-fila ed-fila--sep">
            <button type="submit" className="ed-btn ed-btn--pri" disabled={nombre.trim().length < 5 || trabajando}>
              {trabajando ? "Creando…" : accion.tipo === "plantilla" ? "Crear encuesta" : "Duplicar"}
            </button>
            <button type="button" className="ed-btn" onClick={() => setAccion(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="ed-fila">
        <div className="en-busca">
          <input type="search" placeholder="Buscar por nombre o enlace" aria-label="Buscar una encuesta" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ed-seg" role="group" aria-label="Filtrar por estado">
          <button type="button" aria-pressed={filtro === ""} onClick={() => setFiltro("")}>
            Todas {encuestas.length}
          </button>
          {ESTADOS_ENCUESTA.map((s) => (
            <button key={s.id} type="button" aria-pressed={filtro === s.id} onClick={() => setFiltro(s.id)}>
              {s.texto} {encuestas.filter((e) => e.estado === s.id).length}
            </button>
          ))}
        </div>
      </div>

      <div ref={lista} className="ed-filas" aria-label="Lista de encuestas">
        {visibles.map((e) => (
          <article key={e.id} className="ed-fila-enc">
            <div className="ed-fila-enc__t">
              <h3>{e.titulo}</h3>
              <span className="ed-fino">
                /{e.slug} · actualizada {FECHA.format(new Date(e.updated_at))}
              </span>
            </div>
            <div className="ed-fila-enc__e">
              <span className="ed-estado" data-s={e.estado}>
                <i aria-hidden="true" />
                {textoEstadoEncuesta(e.estado)}
              </span>
              <span className="ed-chip">{e.acceso === "microsoft" ? "Con Microsoft UDES" : "Abierta"}</span>
            </div>
            <div className="ed-fila-enc__n">
              <b>{conteos.data?.[e.id] ?? "–"}</b>
              <span className="ed-fino">respuestas</span>
            </div>
            <div className="ed-fila-enc__a">
              <button type="button" className="ed-btn ed-btn--sm" onClick={() => onAbrir(e.slug, "editor")}>
                {puedeEditar ? "Editar" : "Abrir"}
              </button>
              <button type="button" className="ed-btn ed-btn--sm" onClick={() => onAbrir(e.slug, "respuestas")}>
                Respuestas
              </button>
              {puedeEditar && (
                <button type="button" className="ed-btn ed-btn--sm" aria-label={`Duplicar ${e.titulo}`} onClick={() => empezar({ tipo: "duplicar", encuesta: e })}>
                  Duplicar
                </button>
              )}
            </div>
          </article>
        ))}
        {visibles.length === 0 && (
          <div className="ed-vacio">
            <PiloFace size={80} expression="pensar" label="Mr. Pilo" />
            <h3>{encuestas.length ? "Ninguna encuesta coincide" : "Todavía no hay encuestas"}</h3>
            <p>{encuestas.length ? "Pruebe con otra búsqueda o quite el filtro." : "Empiece desde una plantilla."}</p>
          </div>
        )}
      </div>

      {puedeEditar && (
        <section id="le-plantillas" aria-labelledby="le-pl" className="ed-plantillas">
          <h2 id="le-pl">Empiece desde una plantilla</h2>
          <p className="ed-fino">Todas se pueden cambiar por completo en el editor.</p>
          <div className="ed-tpls">
            {PLANTILLAS_ENCUESTA.map((p) => {
              const e = p.estructura();
              return (
                <article key={p.codigo} className="ed-tpl" data-feat={p.codigo === "rendicion" ? "1" : undefined}>
                  <h3>{p.nombre}</h3>
                  <p>{p.descripcion}</p>
                  <div className="ed-fila">
                    <span className="ed-chip">{e.secciones.length} {e.secciones.length === 1 ? "sección" : "secciones"}</span>
                    <span className="ed-chip">{preguntasDe(e).length} preguntas</span>
                  </div>
                  <button type="button" className="ed-btn" onClick={() => empezar({ tipo: "plantilla", plantilla: p })}>
                    Usar esta plantilla
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
