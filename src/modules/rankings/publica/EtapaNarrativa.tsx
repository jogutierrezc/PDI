/* Etapa 4 de Pilo Publica: narrativa por eje, en español e inglés, con citas a la vista. */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropuestaImagen, RespuestaImagenes, RespuestaRedactar, RespuestaTraducir } from "./api";
import { motivoSinPilo } from "./contexto";
import type { EtapaProps } from "./contexto";
import { siguientePos, useActualizarInforme, useBloques, useBorrarBloque, useCifras, useFuentes, useGuardarBloque, useMedios } from "./datos";
import { EditorParrafos } from "./EditorParrafos";
import { ImagenesPorEnlace } from "./ImagenEnlace";
import type { Medios } from "./datos";
import { citasDe, esImagenEnlace } from "./tipos";
import type { BloquePP } from "./tipos";
import { BotonPilo, Campo, ErrorAviso, Interruptor, Tarjeta, Vacio } from "./ui";

const ORIGEN: Record<string, string> = { pilo: "Redactado por Pilo", persona: "Escrito a mano", editado: "Pilo, editado a mano" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Problemas de verificación de un bloque de texto: cada uno impide publicar o avisa. */
export function problemasDe(b: BloquePP, libro: Set<string>): string[] {
  const out: string[] = [];
  if (!b.text_es.trim()) return ["Sin texto en español."];
  if (citasDe(b).length === 0) out.push("Sin cita: ningún párrafo se publica sin su fuente.");
  const figs = b.figs ?? [];
  const faltan = figs.filter((k) => !libro.has(k));
  if (faltan.length) out.push(`Cita cifras que no están en el libro: ${faltan.join(", ")}.`);
  if (/\d/.test(b.text_es) && figs.length === 0) out.push("Tiene números, pero no los enlaza a cifras del libro. Revísalos.");
  if (b.warn) out.push(b.warn);
  return out;
}

export function EtapaNarrativa(p: EtapaProps) {
  const qc = useQueryClient();
  const bloques = useBloques(p.informe.id);
  const cifras = useCifras(p.informe.id);
  const fuentes = useFuentes(p.informe.id);
  const guardar = useGuardarBloque();
  const borrar = useBorrarBloque();
  const informeUp = useActualizarInforme();
  const [tab, setTab] = useState<string>("portada");
  const [resumen, setResumen] = useState<string | null>(null);
  const [profundidad, setProfundidad] = useState<"normal" | "profunda">("profunda");

  const propuestas = useQuery<PropuestaImagen[]>({ queryKey: ["pp", "propuestas", p.informe.id], enabled: false, initialData: [], staleTime: Infinity, queryFn: () => [] });

  const ejes = useMemo(() => (bloques.data ?? []).filter((b) => b.kind === "texto" && b.sec !== "portada"), [bloques.data]);
  // las de noticia (las que se eligen en cada eje) y las manuales por enlace (las que Pilo no toca)
  const imagenes = useMemo(() => (bloques.data ?? []).filter((b) => b.kind === "imagen" && !esImagenEnlace(b)), [bloques.data]);
  const manuales = useMemo(() => (bloques.data ?? []).filter(esImagenEnlace), [bloques.data]);
  const libro = useMemo(() => new Set((cifras.data ?? []).map((c) => c.key)), [cifras.data]);

  const idsNoticias = useMemo(() => {
    const a = (fuentes.data ?? []).filter((f) => f.kind === "noticia" && f.include && UUID.test(f.ref)).map((f) => f.ref);
    const b = (propuestas.data ?? []).map((x) => x.news_id);
    const c = imagenes.map((x) => x.spec.news_id ?? "");
    return [...a, ...b, ...c].filter((x) => UUID.test(x));
  }, [fuentes.data, propuestas.data, imagenes]);
  const medios = useMedios(idsNoticias);

  useEffect(() => {
    if (tab !== "portada" && !ejes.some((e) => e.id === tab)) setTab("portada");
  }, [ejes, tab]);

  const faltaIngles = ejes.filter((e) => e.text_es.trim() && !e.text_en.trim()).length;
  const sinCita = ejes.filter((e) => e.text_es.trim() && citasDe(e).length === 0).length;

  const redactar = async (extra: Record<string, unknown>, etiqueta: string) => {
    setResumen(null);
    const r = await p.corrida.correr<RespuestaRedactar>(etiqueta, "redactar", { profundidad, ...extra });
    if (r) setResumen(`Pilo escribió ${r.escritos}.${r.sin_usar ? ` ${r.sin_usar} fuentes quedaron sin usar.` : ""}`);
  };
  const traducir = async () => {
    setResumen(null);
    const r = await p.corrida.correr<RespuestaTraducir>("Pilo traduce lo que falta", "traducir");
    if (r) setResumen("Traducción al día. Revisa el inglés antes de publicar.");
  };
  const pedirImagenes = async () => {
    setResumen(null);
    const r = await p.corrida.correr<RespuestaImagenes>("Pilo propone imágenes", "imagenes");
    if (r) {
      qc.setQueryData(["pp", "propuestas", p.informe.id], r.propuestas ?? []);
      setResumen(`Pilo propuso ${r.propuestas?.length ?? 0} imágenes. Elígelas en cada eje.`);
    }
  };
  const nuevoEje = async () => {
    const id = await guardar.mutateAsync({ informe_id: p.informe.id, patch: { kind: "texto", sec: "ejes", pos: siguientePos(bloques.data), heading_es: "Nuevo eje", text_es: "" } });
    setTab(id);
  };

  if (bloques.isPending || cifras.isPending) return <p role="status">Cargando la narrativa…</p>;
  if (bloques.error || cifras.error) return <ErrorAviso error={bloques.error ?? cifras.error} onReintentar={() => { void bloques.refetch(); void cifras.refetch(); }} />;

  const eje = ejes.find((e) => e.id === tab);

  return (
    <div className="pp-stack">
      <div className="pp-acciones">
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void redactar({ sec: "ejes" }, "Pilo redacta los ejes")}>
          Pilo redacta los ejes
        </BotonPilo>
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void redactar({ sec: "portada" }, "Pilo redacta la portada")}>
          Redactar la portada
        </BotonPilo>
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void traducir()}>
          Traducir lo que falte{faltaIngles ? ` (${faltaIngles})` : ""}
        </BotonPilo>
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void pedirImagenes()}>
          Pilo propone imágenes
        </BotonPilo>
        <div className="pp-prof">
          <span className="pp-opt-t" id="pp-prof-t">
            Profundidad
          </span>
          <div className="pp-seg" role="group" aria-labelledby="pp-prof-t">
            <button type="button" aria-pressed={profundidad === "normal"} onClick={() => setProfundidad("normal")} title="1 o 2 párrafos por eje">
              Normal
            </button>
            <button type="button" aria-pressed={profundidad === "profunda"} onClick={() => setProfundidad("profunda")} title="3 a 6 párrafos por eje, con contexto, evidencia y alcance">
              Profunda
            </button>
          </div>
        </div>
        {motivoSinPilo(p.pilo, p.corrida) && !p.corrida.progreso.corriendo && <small className="pp-nota">{motivoSinPilo(p.pilo, p.corrida)}</small>}
      </div>
      {resumen && (
        <p className="pp-nota" role="status">
          {resumen}
        </p>
      )}
      {sinCita > 0 && (
        <div className="pp-aviso-caja pp-aviso-caja--warn" role="status">
          <strong>
            {sinCita} {sinCita === 1 ? "eje sin cita" : "ejes sin cita"}
          </strong>
          <p>Un texto sin su fuente no se puede publicar. Pídele a Pilo que lo redacte con la evidencia o añade la cita.</p>
        </div>
      )}

      <Tarjeta
        titulo="Narrativa"
        cuenta={`${ejes.length} ${ejes.length === 1 ? "eje" : "ejes"}`}
        acciones={
          <button type="button" className="pp-btn pp-btn--sm" onClick={() => void nuevoEje()} disabled={guardar.isPending}>
            + Escribir un eje a mano
          </button>
        }
      >
        <div className="pp-tabs" role="tablist" aria-label="Partes de la narrativa">
          {[{ id: "portada", t: "Portada" }, ...ejes.map((e, i) => ({ id: e.id, t: `Eje ${i + 1}${e.heading_es ? ` · ${e.heading_es}` : ""}` }))].map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
              {x.t}
            </button>
          ))}
        </div>

        {tab === "portada" && (
          <div className="pp-pad pp-stack">
            <p className="pp-nota">El título y la introducción abren el informe. Se guardan al salir de cada campo.</p>
            <div className="pp-dos">
              <Campo etiqueta="Título en español" valor={p.informe.title_es} lang="es" onGuardar={(v) => informeUp.mutate({ id: p.informe.id, patch: { title_es: v } })} />
              <Campo etiqueta="Título en inglés" valor={p.informe.title_en} lang="en" onGuardar={(v) => informeUp.mutate({ id: p.informe.id, patch: { title_en: v } })} />
            </div>
            <div className="pp-dos">
              <Campo etiqueta="Introducción en español" valor={p.informe.lead_es} lang="es" multilinea filas={6} onGuardar={(v) => informeUp.mutate({ id: p.informe.id, patch: { lead_es: v } })} />
              <Campo etiqueta="Introducción en inglés" valor={p.informe.lead_en} lang="en" multilinea filas={6} onGuardar={(v) => informeUp.mutate({ id: p.informe.id, patch: { lead_en: v } })} />
            </div>
            {!p.informe.lead_es.trim() && <p className="pp-warn">La introducción en español está vacía.</p>}
            {p.informe.lead_es.trim() && !p.informe.lead_en.trim() && <p className="pp-warn">Falta la introducción en inglés.</p>}
          </div>
        )}

        {eje && (
          <EjeEditor
            key={eje.id}
            b={eje}
            libro={libro}
            p={p}
            imagen={imagenes.find((i) => i.spec.eje === eje.id)}
            propuestas={(propuestas.data ?? []).filter((x) => !x.block_id || x.block_id === eje.id)}
            medios={medios.data}
            cargandoMedios={medios.isFetching}
            idsFuentes={(fuentes.data ?? []).filter((f) => f.kind === "noticia" && f.include && UUID.test(f.ref)).map((f) => f.ref)}
            guardar={(patch) => guardar.mutate({ informe_id: p.informe.id, id: eje.id, patch })}
            elegirImagen={(spec) => {
              const actual = imagenes.find((i) => i.spec.eje === eje.id);
              if (!spec) {
                if (actual) borrar.mutate(actual.id);
                return;
              }
              guardar.mutate({ informe_id: p.informe.id, id: actual?.id, patch: actual ? { spec: { ...actual.spec, ...spec, eje: eje.id } } : { kind: "imagen", sec: "ejes", pos: siguientePos(bloques.data), spec: { ...spec, eje: eje.id } } });
            }}
            borrar={() => borrar.mutate(eje.id)}
            redactar={() => void redactar({ sec: "ejes", block_id: eje.id }, "Pilo redacta este eje")}
            profundizar={() => void redactar({ sec: "ejes", block_id: eje.id, profundizar: true, profundidad: "profunda" }, "Pilo profundiza este eje")}
          />
        )}
        {ejes.length === 0 && tab === "portada" && (
          <div className="pp-pad">
            <Vacio titulo="Todavía no hay ejes">Pilo redacta un eje por tema con las fuentes que dejaste marcadas, citando cada afirmación. También puedes escribir uno a mano.</Vacio>
          </div>
        )}
      </Tarjeta>

      <ImagenesPorEnlace
        manuales={manuales}
        ejes={ejes}
        onCrear={async (spec) => {
          await guardar.mutateAsync({ informe_id: p.informe.id, patch: { kind: "imagen", sec: "imagenes", pos: siguientePos(bloques.data), origin: "persona", enabled: true, spec } });
        }}
        onEditar={async (id, spec) => {
          await guardar.mutateAsync({ informe_id: p.informe.id, id, patch: { spec } });
        }}
        onQuitar={(id) => borrar.mutate(id)}
        onVisible={(id, v) => guardar.mutate({ informe_id: p.informe.id, id, patch: { enabled: v } })}
      />
      {(guardar.error || borrar.error || informeUp.error) && <ErrorAviso error={guardar.error ?? borrar.error ?? informeUp.error} />}
      <div className="pp-acciones">
        <button type="button" className="button-secondary" onClick={() => p.ir(2)}>
          ← Gráficos
        </button>
        <button type="button" className="button-primary" onClick={() => p.ir(4)}>
          Continuar a la diagramación →
        </button>
      </div>
    </div>
  );
}

function EjeEditor({
  b,
  libro,
  p,
  imagen,
  propuestas,
  medios,
  cargandoMedios,
  idsFuentes,
  guardar,
  elegirImagen,
  borrar,
  redactar,
  profundizar,
}: {
  b: BloquePP;
  libro: Set<string>;
  p: EtapaProps;
  imagen: BloquePP | undefined;
  propuestas: PropuestaImagen[];
  medios: Medios | undefined;
  cargandoMedios: boolean;
  idsFuentes: string[];
  guardar: (patch: Partial<BloquePP>) => void;
  elegirImagen: (spec: { news_id: string; image_id?: string } | null) => void;
  borrar: () => void;
  redactar: () => void;
  profundizar: () => void;
}) {
  const citas = citasDe(b);
  const problemas = problemasDe(b, libro);
  const bloqueadoPorPersona = b.origin !== "pilo" && b.text_es.trim().length > 0;
  const [confirma, setConfirma] = useState(false);

  // imágenes candidatas: las propuestas por Pilo y las de las noticias marcadas como fuente
  const candidatas = useMemo(() => {
    const out: { key: string; news_id: string; image_id?: string; url: string; titulo: string; minors: boolean }[] = [];
    const visto = new Set<string>();
    const agrega = (news_id: string, image_id?: string, url?: string) => {
      const im = (image_id && medios?.imagenes.get(image_id)) || medios?.deNoticia.get(news_id)?.[0];
      const n = medios?.noticias.get(news_id);
      const u = url ?? im?.url ?? n?.image_url;
      const key = `${news_id}:${im?.id ?? image_id ?? ""}`;
      if (!u || visto.has(key)) return;
      visto.add(key);
      out.push({ key, news_id, image_id: im?.id ?? image_id, url: u, titulo: n?.title ?? "Noticia", minors: Boolean(im?.minors) });
    };
    for (const x of propuestas) agrega(x.news_id, x.image_id, x.url);
    for (const id of idsFuentes) for (const im of medios?.deNoticia.get(id) ?? []) agrega(id, im.id);
    return out.slice(0, 40);
  }, [propuestas, idsFuentes, medios]);

  return (
    <div className="pp-pad pp-stack">
      <div className="pp-para-h">
        <span className={`pp-by pp-by--${b.origin}`}>{ORIGEN[b.origin] ?? b.origin}</span>
        <span className="pp-cites" aria-label="Citas del texto">
          {citas.length ? citas.map((c, i) => <span className="pp-cite" key={i}>{c}</span>) : <span className="pp-cite pp-cite--mal">Sin cita</span>}
          {(b.figs ?? []).map((k) => (
            <span className={`pp-cite${libro.has(k) ? " pp-cite--cifra" : " pp-cite--mal"}`} key={k} title={libro.has(k) ? "Cifra del libro" : "No está en el libro"}>
              {k}
            </span>
          ))}
        </span>
        <span className="pp-sp">
          <BotonPilo pilo={p.pilo} corrida={p.corrida} chico onClick={redactar}>
            Pilo redacta este eje
          </BotonPilo>{" "}
          <BotonPilo pilo={p.pilo} corrida={p.corrida} chico onClick={profundizar}>
            Profundizar
          </BotonPilo>
        </span>
      </div>
      {bloqueadoPorPersona && <p className="pp-nota">Este texto lo tocó una persona: Pilo no lo pisa. Para que lo vuelva a escribir, vacía antes el texto en español.</p>}
      {problemas.length > 0 && (
        <ul className="pp-warn-lista" role="status">
          {problemas.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}

      {(b.warn ?? "").startsWith("SIN VERIFICAR") && (
        <div className="pp-aviso-caja pp-aviso-caja--warn" role="status">
          <strong>Borrador sin verificar</strong>
          <p>Pilo escribió este texto, pero no pasó la verificación de citas y cifras. Corrígelo con las fuentes y, cuando esté bien, quita el aviso.</p>
          <button type="button" className="pp-btn pp-btn--sm" onClick={() => guardar({ warn: null, enabled: true })}>
            Ya lo revisé: quitar el aviso y mostrarlo
          </button>
        </div>
      )}

      <div className="pp-dos">
        <Campo etiqueta="Título del eje (español)" valor={b.heading_es} lang="es" onGuardar={(v) => guardar({ heading_es: v })} />
        <Campo etiqueta="Título del eje (inglés)" valor={b.heading_en} lang="en" onGuardar={(v) => guardar({ heading_en: v })} />
      </div>
      <EditorParrafos es={b.text_es} en={b.text_en} onGuardar={(v) => guardar(v)} />
      <p className="pp-nota">Un texto en profundidad suele llevar de 3 a 6 párrafos por eje. «Profundizar» le pide a Pilo ampliar este eje con más contexto y evidencia, sin pisar lo que escribiste a mano.</p>
      {b.text_es.trim() && !b.text_en.trim() && <p className="pp-warn">Falta el inglés de este eje.</p>}

      <div>
        <div className="pp-opt-t">Imagen de este eje</div>
        <p className="pp-nota">Salen de las noticias aprobadas. Pilo no ve las imágenes: revisa el pie y la autorización.</p>
        <div className="pp-pics" role="group" aria-label="Imágenes disponibles">
          <button type="button" className="pp-pic" aria-pressed={!imagen} onClick={() => elegirImagen(null)}>
            <span className="pp-pic__ph">Sin imagen</span>
          </button>
          {candidatas.map((c) => {
            const on = Boolean(imagen && imagen.spec.news_id === c.news_id && (!imagen.spec.image_id || imagen.spec.image_id === c.image_id));
            return (
              <button key={c.key} type="button" className="pp-pic" aria-pressed={on} onClick={() => elegirImagen({ news_id: c.news_id, image_id: c.image_id })}>
                <img src={c.url} alt="" loading="lazy" />
                <small>{c.titulo}</small>
                {c.minors && <small className="pp-warn">Menores: autorización</small>}
              </button>
            );
          })}
        </div>
        {candidatas.length === 0 && <p className="pp-nota">{cargandoMedios ? "Buscando imágenes…" : "No hay imágenes todavía. Marca noticias en Fuentes o pulsa «Pilo propone imágenes»."}</p>}
      </div>

      <div className="pp-acciones">
        <label className="pp-check">
          <Interruptor marcado={b.enabled} etiqueta="Mostrar este eje en el informe" onCambio={(v) => guardar({ enabled: v })} /> Mostrar en el informe
        </label>
        {confirma ? (
          <>
            <span className="pp-warn">¿Eliminar este eje?</span>
            <button type="button" className="pp-btn pp-btn--mal" onClick={borrar}>
              Sí, eliminar
            </button>
            <button type="button" className="pp-btn" onClick={() => setConfirma(false)}>
              No
            </button>
          </>
        ) : (
          <button type="button" className="pp-btn" onClick={() => setConfirma(true)}>
            Eliminar eje
          </button>
        )}
      </div>
    </div>
  );
}
