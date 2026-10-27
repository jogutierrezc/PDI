/* =============================================================================
   Observatorio insertado · /obs-embed.

   Se ve dentro de un marco (iframe) que pone public/obs.js en otra página: sin
   menú ni cabecera del portal. Pide el contenido a obs_publico_insertado
   (0233) —solo lo publicado y agregado, con la reserva «< 5» aplicada en la
   base— y lo dibuja con los mismos componentes del Observatorio público.
   Primera entrega: portada, tema, sección y visor. Tableros y filtro cruzado
   quedan para una fase posterior (los huecos ya están en las opciones).

   Avisa su alto a la página anfitriona con postMessage; el cargador solo acepta
   el mensaje si viene de su propio marco y del origen de este portal.
   ========================================================================== */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Idioma, OpcionesInsertado, TipoInsertado } from "../admin/observatorio/publicar/opciones";
import { datasetFrom, viewFrom } from "../admin/observatorio/store";
import type { DatasetRow, ViewRow } from "../admin/observatorio/store";
import type { ObsTopicConfig } from "../admin/observatorio/model";
import type { LiveTopic } from "../datos-abiertos/observatorio/live";
import { aplicarFiltros, guardarCache, leerCache, leerParametros, origenAnfitrion, textoEmbed } from "./obs-embed";
import type { EstadoEmbed } from "./obs-embed";
import "../datos-abiertos/datos-abiertos.css";
import "../datos-abiertos/observatorio/observatorio.css";
import "./obs-embed.css";

const LiveTopicBody = lazy(() => import("../datos-abiertos/observatorio/LiveTopic"));

interface Respuesta {
  estado: EstadoEmbed;
  insertado?: { codigo: string; nombre: string; tipo: string; seccion: string | null; opciones: { titulo?: boolean; fuente?: boolean; barra?: boolean; enlace?: boolean; aspecto?: string; lang?: Idioma; f?: Record<string, string> } };
  observatorio?: { nombre: string; slug: string; principal: boolean; descripcion: string };
  contenido?: {
    lineas?: { id: string; nombre: string; orden: number }[];
    temas?: { slug: string; codigo: string | null; nombre: string | null; resumen: string | null; linea_id: string | null }[];
    tema?: { slug: string; nombre: string | null } & Pick<ObsTopicConfig, "template" | "intro" | "sections">;
    vistas?: ViewRow[];
    datasets?: DatasetRow[];
  };
  servido_en?: string;
}

/** Lo que el panel «Insertar y publicar» manda al marco de vista previa (/obs-embed?previa=1). */
export interface ConfigPrevia { obs: string; nombre: string; tipo: TipoInsertado; tema: string | null; seccion: string | null; visor: string | null; opciones: OpcionesInsertado }

const avisar = (id: string, tipo: string, extra: object = {}) => {
  try {
    window.parent.postMessage({ fuente: "obs-embed", tipo, id, ...extra }, "*");
  } catch {
    /* fuera de un marco no hay a quién avisar */
  }
};

export function ObsEmbed() {
  const leidos = useMemo(() => leerParametros(window.location.search), []);
  // Vista previa del taller (0234): la configuración llega por mensaje desde el panel, del mismo origen, y se pide a obs_vista_previa.
  const previa = useMemo(() => new URLSearchParams(window.location.search).get("previa") === "1", []);
  const [config, setConfig] = useState<ConfigPrevia | null>(null);
  const params = useMemo(
    () => (config ? { ...leidos, aspecto: config.opciones.aspecto, lang: config.opciones.lang, filtros: config.opciones.f, altura: typeof config.opciones.altura === "number" ? config.opciones.altura : null } : leidos),
    [leidos, config],
  );
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [fallo, setFallo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const lang: Idioma = params.lang ?? respuesta?.insertado?.opciones.lang ?? "es";
  const aspecto = params.aspecto ?? respuesta?.insertado?.opciones.aspecto ?? "claro";

  // Documento propio del marco: sin fondo del portal, tema por parámetro.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("obs-embed-doc");
    if (aspecto === "claro" || aspecto === "oscuro") html.setAttribute("data-theme", aspecto === "oscuro" ? "dark" : "light");
    else html.removeAttribute("data-theme");
    return () => html.classList.remove("obs-embed-doc");
  }, [aspecto]);

  // La carga: caché de 1 hora por insertado, clave y origen; la vista se cuenta una vez por sesión.
  useEffect(() => {
    if (previa) return;
    if (!params.id) {
      setRespuesta({ estado: "no_existe" });
      return;
    }
    const vistaPrevia = params.origenDeclarado === "@vista-previa";
    const { origen } = vistaPrevia ? { origen: "@vista-previa" } : origenAnfitrion(params.origenDeclarado);
    const llave = `obs-embed:${params.id}:${params.clave ?? ""}:${origen ?? ""}`;
    const guardada = vistaPrevia ? null : leerCache<Respuesta>(llave);
    if (guardada) {
      setRespuesta(guardada);
      return;
    }
    let vivo = true;
    const medida = `${llave}:contada`;
    let yaContada = false;
    try {
      yaContada = window.sessionStorage.getItem(medida) === "1";
    } catch {
      /* sin almacenamiento: se cuenta */
    }
    void supabase
      .rpc("obs_publico_insertado", { p_id: params.id, p_clave: params.clave, p_origen: origen, p_medir: !yaContada })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) return setFallo(true);
        const r = data as Respuesta;
        // Solo lo bueno se guarda: un aviso (pausado, sin publicar…) se vuelve a preguntar.
        if (r.estado === "ok") {
          guardarCache(llave, r);
          try {
            window.sessionStorage.setItem(medida, "1");
          } catch {
            /* nada */
          }
        }
        setRespuesta(r);
      });
    return () => {
      vivo = false;
    };
  }, [params]);

  useEffect(() => {
    if (!previa) return;
    const alRecibir = (e: MessageEvent) => {
      const m = e.data as { fuente?: string; tipo?: string; config?: ConfigPrevia } | null;
      if (e.origin === window.location.origin && e.source === window.parent && m?.fuente === "obs-previa" && m.tipo === "config" && m.config) setConfig(m.config);
    };
    window.addEventListener("message", alRecibir);
    window.parent.postMessage({ fuente: "obs-previa", tipo: "listo" }, window.location.origin);
    return () => window.removeEventListener("message", alRecibir);
  }, [previa]);
  const destino = config ? JSON.stringify([config.obs, config.tipo, config.tema, config.seccion, config.visor, config.nombre]) : "";
  useEffect(() => {
    if (!previa || !config) return;
    let vivo = true;
    setFallo(false);
    void supabase
      .rpc("obs_vista_previa", { p_obs: config.obs, p_nombre: config.nombre, p_tipo: config.tipo, p_tema: config.tema, p_seccion: config.seccion, p_visor: config.visor, p_opciones: config.opciones })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) return setFallo(true);
        setRespuesta(data as Respuesta);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo el destino pide de nuevo; las opciones se dibujan al instante
  }, [previa, destino]);

  // Alto automático hacia la página anfitriona.
  useEffect(() => {
    if (!raiz.current) return;
    const enviar = () => avisar(params.id, "alto", { alto: Math.ceil(params.altura ?? document.documentElement.scrollHeight) });
    const observador = new ResizeObserver(enviar);
    observador.observe(document.body);
    enviar();
    return () => observador.disconnect();
  }, [params, respuesta, fallo]);

  const estado: EstadoEmbed | "cargando" = fallo ? "error" : respuesta ? respuesta.estado : "cargando";
  const opciones = (previa && config ? (config.opciones as NonNullable<Respuesta["insertado"]>["opciones"]) : respuesta?.insertado?.opciones) ?? {};
  const vivo = useMemo(() => (respuesta?.estado === "ok" ? aTema(respuesta, { ...opciones.f, ...params.filtros }) : null), [respuesta, params.filtros, opciones.f]);

  return (
    <div ref={raiz} className="obs-embed" data-barra={opciones.barra === false ? "no" : undefined} data-fuente={opciones.fuente === false ? "no" : undefined} lang={lang}>
      {estado === "cargando" && <p className="obs-embed__aviso" role="status">{textoEmbed(lang, "cargando")}</p>}
      {estado !== "cargando" && estado !== "ok" && <p className="obs-embed__aviso" role="alert" data-estado={estado}>{textoEmbed(lang, estado)}</p>}
      {respuesta?.estado === "ok" && (
        <>
          {opciones.titulo !== false && <h1 className="obs-embed__titulo">{respuesta.insertado!.nombre}</h1>}
          {respuesta.contenido?.temas && <Portada r={respuesta} />}
          {vivo && (
            <Suspense fallback={<p className="obs-embed__aviso" role="status">{textoEmbed(lang, "cargando")}</p>}>
              <LiveTopicBody live={vivo} slug={respuesta.contenido!.tema!.slug} />
            </Suspense>
          )}
          {opciones.enlace !== false && respuesta.observatorio && (
            <p className="obs-embed__pie">
              <a href={enlacePortal(respuesta)} target="_blank" rel="noopener noreferrer">{textoEmbed(lang, "ver")}</a>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function enlacePortal(r: Respuesta) {
  const base = `${window.location.origin}/datos-abiertos/observatorio`;
  return r.contenido?.tema ? `${base}/${r.contenido.tema.slug}` : base;
}

function aTema(r: Respuesta, filtros: Record<string, string>): LiveTopic | null {
  const c = r.contenido;
  if (!c?.tema || !c.vistas || !c.datasets) return null;
  const datasets = new Map(c.datasets.map((d) => [d.id, aplicarFiltros(datasetFrom(d), filtros)]));
  const orden = new Map(c.tema.sections.map((s, i) => [s, i]));
  const views = c.vistas.map(viewFrom).filter((v) => orden.has(v.section) && datasets.has(v.datasetId)).sort((a, b) => orden.get(a.section)! - orden.get(b.section)! || a.position - b.position);
  const usados = [...datasets.values()];
  return {
    config: { slug: c.tema.slug, template: c.tema.template, intro: c.tema.intro, sections: c.tema.sections, status: "publicado" },
    datasets,
    views,
    sources: [...new Set(usados.map((d) => d.source).filter(Boolean))],
    updatedAt: usados.map((d) => d.updatedAt).sort().pop() ?? "",
  };
}

function Portada({ r }: { r: Respuesta }) {
  const { lineas = [], temas = [] } = r.contenido!;
  const base = `${window.location.origin}/datos-abiertos/observatorio`;
  return (
    <div className="obs-embed__portada">
      {lineas.map((l) => {
        const propios = temas.filter((t) => t.linea_id === l.id);
        return propios.length === 0 ? null : (
          <section key={l.id}>
            <h2>{l.nombre}</h2>
            <ul>
              {propios.map((t) => (
                <li key={t.slug}>
                  <a href={`${base}/${t.slug}`} target="_blank" rel="noopener noreferrer">
                    <b>{t.codigo}</b> {t.nombre}
                  </a>
                  {t.resumen && <small>{t.resumen}</small>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
