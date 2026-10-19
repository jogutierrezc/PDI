/* =============================================================================
   Revisión (Planeación): los informes enviados, leídos como quedarán, con una
   nota por sección. Aprobar los congela y Pilo aprende de ellos
   (pilo-informes → aprender); devolver exige nota y las cifras vuelven a ser
   vivas. ?informe=<id> abre uno.
   ========================================================================== */

import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFundido } from "../../rankings/movimiento";
import { useInstancias, usePilares, usePlanUnidad, useRevisar, useUnidades } from "../datos";
import { componerNota, leerNota } from "../estados";
import type { CicloRow, ContenidoSeccion, EstadoInstancia, InstanciaRow, PilarRef, RequisitoRow, SeccionDef } from "../types";
import { Matriz, TablaAnexos, TablaFilas, TablaMetas } from "./Bloques";
import { Aviso, Cargando, EstadoPill, Vacio, fmtFecha, mensajeDe } from "./comunes";
import { TablaMetasPrograma } from "./MetasPrograma";
import { useModeloInforme } from "./modelo";
import type { ModeloInforme } from "./modelo";
import { LecturaTexto, resolverDe } from "./Texto";

type Filtro = "sent" | "back" | "ok" | "todos";
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "sent", texto: "Por revisar" },
  { id: "back", texto: "Devueltos" },
  { id: "ok", texto: "Aprobados" },
  { id: "todos", texto: "Todos" },
];

export function Revision({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const instancias = useInstancias(ciclo.id);
  const unidades = useUnidades();
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>("sent");
  const detalle = useRef<HTMLDivElement>(null);
  const elegido = params.get("informe");
  useFundido(detalle, elegido);

  const fallo = [instancias.error, unidades.error].find((e): e is Error => e instanceof Error);
  if (fallo) return <Aviso error={fallo} />;
  if (instancias.isPending || unidades.isPending) return <Cargando texto="Cargando los informes…" />;

  const nombre = new Map((unidades.data ?? []).map((u) => [u.id, u.name]));
  const kindDe = new Map((unidades.data ?? []).map((u) => [u.id, u.kind]));
  const lista = (instancias.data ?? []).filter((i) => filtro === "todos" || i.estado === filtro);
  const inst = (instancias.data ?? []).find((i) => i.id === elegido) ?? null;
  const elegir = (id: string) => {
    const p = new URLSearchParams(params);
    p.set("informe", id);
    setParams(p, { replace: true });
  };

  return (
    <div className="inf-rev">
      <div className="inf-card">
        <div style={{ padding: "var(--space-3) var(--space-3) 0" }}>
          <div className="rk-seg" role="group" aria-label="Filtrar informes">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.texto}
              </button>
            ))}
          </div>
        </div>
        {lista.length ? (
          <ul className="inf-lista">
            {lista.map((i) => (
              <li key={i.id}>
                <button type="button" aria-current={i.id === elegido} onClick={() => elegir(i.id)}>
                  <b>{nombre.get(i.unit_id) ?? "Unidad"}</b>
                  <span className="inf-row">
                    <EstadoPill estado={i.estado} />
                    <span className="inf-hint">
                      Plantilla {i.plantilla}
                      {i.enviado_en ? ` · enviado ${fmtFecha(i.enviado_en)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inf-muted" style={{ padding: "var(--space-4)" }}>
            {filtro === "sent" ? "No hay informes esperando revisión." : "No hay informes en este estado."}
          </p>
        )}
      </div>
      <div ref={detalle}>
        {inst ? (
          <Detalle key={inst.id} inst={inst} ciclo={ciclo} requisitos={requisitos} unidad={nombre.get(inst.unit_id) ?? "Unidad"} esFacultad={kindDe.get(inst.unit_id) === "facultad"} />
        ) : (
          <Vacio>Elija un informe de la lista para leerlo y decidir.</Vacio>
        )}
      </div>
    </div>
  );
}

function Detalle({ inst, ciclo, requisitos, unidad, esFacultad }: { inst: InstanciaRow; ciclo: CicloRow; requisitos: RequisitoRow[]; unidad: string; esFacultad: boolean }) {
  const plan = usePlanUnidad(inst.unit_id, esFacultad);
  const m = useModeloInforme(inst, ciclo, requisitos, plan.data?.acciones ?? []);
  const pilares = usePilares();
  const revisar = useRevisar();
  const previa = leerNota(inst.nota_revision);
  const [general, setGeneral] = useState("");
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState("");

  if (m.error) return <Aviso error={m.error} />;
  if (m.cargando) return <Cargando texto="Cargando el informe…" />;

  const resolver = resolverDe(m.incluidas);
  const decidir = (a: Extract<EstadoInstancia, "ok" | "back">) => {
    const nota = a === "back" ? componerNota(general, m.plantilla.secciones.map((s) => ({ clave: s.clave, titulo: s.titulo, nota: notas[s.clave] ?? "" }))) : "";
    revisar.mutate(
      { instancia: inst, a, nota, porSeccion: a === "back" ? Object.entries(notas).map(([clave, n]) => ({ clave, nota: n })) : [] },
      {
        onSuccess: (r) =>
          setHecho(
            a === "back"
              ? "Devuelto a la unidad con su nota. Las cifras vuelven a ser vivas."
              : r.avisoPilo
                ? `Aprobado y congelado. Pilo no pudo aprender esta vez: ${r.avisoPilo}`
                : "Aprobado y congelado. Pilo aprendió de este informe.",
          ),
      },
    );
  };
  const hayNotas = general.trim() || Object.values(notas).some((n) => n.trim());

  return (
    <article className="inf-card inf-pad" aria-labelledby="inf-det">
      <div className="inf-ehd">
        <div>
          <span className="inf-eyebrow">
            {m.plantilla.nombre} · {m.plantilla.quien} · {ciclo.anio}
          </span>
          <h2 id="inf-det">{unidad}</h2>
        </div>
        <EstadoPill estado={inst.estado} />
      </div>
      <p className="inf-lead">
        {m.frio ? "Las cifras son la foto tomada al enviar." : "Las cifras se leen en vivo: el informe no está enviado."}
        {inst.enviado_en ? ` Enviado el ${fmtFecha(inst.enviado_en)}.` : ""}
      </p>
      {inst.estado === "back" && previa.general && (
        <div className="inf-nota" role="note">
          <b>Nota con la que se devolvió</b>
          {previa.general}
        </div>
      )}

      {m.plantilla.secciones.map((def, i) => (
        <section key={def.clave} className="inf-lectura" aria-labelledby={`inf-l-${def.clave}`}>
          <h3 id={`inf-l-${def.clave}`}>
            {i + 1}. {def.titulo}
          </h3>
          <LecturaSeccion def={def} c={m.contenidoGuardado(def.clave)} m={m} pilares={pilares.data ?? []} resolver={resolver} />
          {inst.estado === "back" && previa.porSeccion[def.clave] && <p className="inf-hint">Nota anterior: {previa.porSeccion[def.clave]}</p>}
          {(inst.estado === "sent" || inst.estado === "ok") && (
            <input
              className="inf-in"
              value={notas[def.clave] ?? ""}
              onChange={(e) => setNotas({ ...notas, [def.clave]: e.target.value })}
              placeholder="Nota para esta sección (solo si la devuelve)"
              aria-label={`Nota para ${def.titulo}`}
            />
          )}
        </section>
      ))}

      {(inst.estado === "sent" || inst.estado === "ok") && (
        <div className="inf-blk" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--space-4)" }}>
          <label className="inf-lab">
            Nota general para la unidad
            <textarea className="inf-in" value={general} onChange={(e) => setGeneral(e.target.value)} placeholder="Qué debe corregir la unidad" />
          </label>
          <div className="inf-row">
            {inst.estado === "sent" && (
              <button type="button" className="inf-btn inf-btn--pri" onClick={() => decidir("ok")} disabled={revisar.isPending}>
                {revisar.isPending ? "Guardando…" : "Aprobar"}
              </button>
            )}
            <button type="button" className="inf-btn" onClick={() => decidir("back")} disabled={revisar.isPending || !hayNotas}>
              {inst.estado === "ok" ? "Reabrir y devolver con nota" : "Devolver con nota"}
            </button>
            {!hayNotas && <span className="inf-hint">Para devolver, escriba al menos una nota.</span>}
          </div>
        </div>
      )}
      {revisar.error && (
        <p className="inf-error" role="alert">
          {mensajeDe(revisar.error)}
        </p>
      )}
      {hecho && (
        <p className="inf-nota" role="status">
          {hecho}
        </p>
      )}
    </article>
  );
}

/** Una sección como se leerá, sin controles de edición. */
export function LecturaSeccion({ def, c, m, pilares, resolver }: { def: SeccionDef; c: ContenidoSeccion; m: ModeloInforme; pilares: PilarRef[]; resolver: ReturnType<typeof resolverDe> }) {
  const texto = c.texto?.trim() ? (
    <div className="inf-pv">
      <LecturaTexto texto={c.texto} resolver={resolver} />
    </div>
  ) : null;
  const sinNada = <p className="inf-muted">Sin contenido.</p>;
  switch (def.tipo) {
    case "narr":
      return texto ?? sinNada;
    case "pdi": {
      const marcados = pilares.filter((p) => c.pilares?.includes(p.id));
      return (
        <>
          <p className="inf-muted">{marcados.length ? `Se articula con: ${marcados.map((p) => `${p.numeral}. ${p.name}`).join(" · ")}` : "No marcó pilares."}</p>
          {texto}
        </>
      );
    }
    case "metas": {
      const propias = c.metas ?? [];
      if (!propias.length && !m.metasPrograma.length) return sinNada;
      return (
        <>
          <TablaMetasPrograma filas={m.metasPrograma} observaciones={c.observaciones ?? {}} editable={false} cambiarObservacion={() => {}} aceptar={() => {}} esperaIndicadores={false} />
          {propias.length > 0 && (
            <>
              {m.metasPrograma.length > 0 && <p className="inf-muted">Metas adicionales</p>}
              <TablaMetas metas={propias} editable={false} cambiar={() => {}} />
            </>
          )}
        </>
      );
    }
    case "dim": {
      const ctx = m.contexto(def);
      const cifras = [...ctx.cifras.filter((x) => x.incluida), ...ctx.propias];
      const justificadas = cifras.filter((x) => x.justificacion.trim());
      return (
        <>
          <Matriz cifras={cifras} />
          {justificadas.length > 0 && (
            <ul className="inf-ctl">
              {justificadas.map((x) => (
                <li key={x.clave}>
                  <span className="inf-ico" aria-hidden="true">
                    ✓
                  </span>
                  <span>
                    <b>{x.etiqueta}:</b> {x.justificacion}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {texto}
        </>
      );
    }
    case "matriz":
      return (
        <>
          <Matriz cifras={m.incluidas} />
          {texto}
        </>
      );
    case "filas":
      return (c.filas ?? []).length ? <TablaFilas columnas={def.columnas ?? []} filas={c.filas ?? []} editable={false} cambiar={() => {}} /> : sinNada;
    case "logros":
      return (c.logros ?? []).length ? (
        <ul className="inf-ctl">
          {(c.logros ?? []).map((l, i) => (
            <li key={i}>
              <span className="inf-ico" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <b>{l.titulo}</b> {l.resultado} {l.anexo !== null && <span className="inf-hint">(Anexo {l.anexo})</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        sinNada
      );
    case "evid":
    case "anexos":
      return <TablaAnexos anexos={m.anexos.data ?? []} />;
  }
}
