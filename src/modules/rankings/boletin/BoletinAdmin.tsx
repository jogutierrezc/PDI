/* =============================================================================
   Boletín PDF de los informes ODS · el entorno de administración.

   El boletín ya no se arma en la página pública: se arma aquí, a partir de los
   informes PUBLICADOS de Pilo Publica (cifras destacadas, narrativa, imágenes
   elegidas, gráficos y proyectos). Desde aquí se descarga el PDF y se publica
   la edición en Boletines, que es lo único que el público ve.

   El PDF sale con la impresión del navegador («Guardar como PDF»): el documento
   ya trae su @page A4 y sus saltos (boletin.css). Sin ninguna librería de PDF,
   lo que se ve en la vista previa es lo que se imprime.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { loadBulletinFont } from "../../boletin/fonts";
import { canIssueOdsBulletin, useOdsBulletinAdmin } from "../../sostenible/ods-bulletin-data";
import { EditorPortada } from "../../informes/vista/EditorPortada";
import type { Aviso } from "../../informes/vista/EditorPortada";
import type { PerfilOficina, PortadaDiseno } from "../../informes/vista/perfil";
import "../../informes/informes.css";
import { ODS_LIST, RECTOR } from "../../sostenible/ods-data";
import { OdsBulletinPublish } from "../../sostenible/OdsBulletinPublish";
import { useRectorText } from "../../sostenible/ods-selection";
import { reduced } from "../../sostenible/widgets";
import type { Lang } from "../../sostenible/i18n";
import { useInformes } from "../publica/datos";
import { EDICIONES, EDICION_BASE } from "../publica/tipos";
import { DocumentoBoletin } from "./DocumentoBoletin";
import { ctxDe } from "./PortadaPagina";
import { disenoDeBoletin, paraGuardar } from "./portada";
import type { FuenteBoletin, OpcionesBoletin } from "./DocumentoBoletin";
import "./boletin.css";

gsap.registerPlugin(useGSAP);

const ACENTOS: [string, string][] = [
  ["#2b5c30", "Verde UDES"],
  ["#014898", "Azul institucional"],
  ["#0f6f78", "Verde azulado"],
];
const PAGINAS: [keyof OpcionesBoletin["paginas"], string][] = [
  ["portada", "Portada"],
  ["presentacion", "Presentación rectoral"],
  ["indice", "Contenido"],
  ["contraportada", "Contraportada"],
];
const PARTES: [keyof OpcionesBoletin["partes"], string][] = [
  ["cifras", "Cifras destacadas"],
  ["imagenes", "Imágenes elegidas"],
  ["narrativa", "Narrativa por ejes"],
  ["graficos", "Gráficos"],
  ["proyectos", "Proyectos y lo que viene"],
];

export function BoletinAdmin() {
  const auth = useAuth();
  if (auth.loading) return <p role="status">Verificando tu acceso…</p>;
  if (!auth.profile || !canIssueOdsBulletin(auth)) {
    return (
      <p className="bpf-aviso">
        El boletín PDF lo emite el equipo de Planeación con un periodo vigente. Tu rol puede ver los informes, pero no armar ni publicar el boletín.
      </p>
    );
  }
  return <Generador />;
}

function Generador() {
  const informes = useInformes();
  const adm = useOdsBulletinAdmin();
  const rector = useRectorText();
  const [edicion, setEdicion] = useState<number>(EDICION_BASE);
  const [lang, setLang] = useState<Lang>("es");
  const [acento, setAcento] = useState(ACENTOS[0][0]);
  const [fuente, setFuente] = useState<FuenteBoletin>("Open Sans");
  const [paginas, setPaginas] = useState<OpcionesBoletin["paginas"]>({ portada: true, presentacion: true, indice: true, contraportada: true });
  const [partes, setPartes] = useState<OpcionesBoletin["partes"]>({ cifras: true, imagenes: true, narrativa: true, graficos: true, proyectos: true });
  const [maxCifras, setMaxCifras] = useState(8);
  const [elegidos, setElegidos] = useState<number[] | null>(null);
  const [montado, setMontado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState(false);
  const [guardandoPortada, setGuardandoPortada] = useState(false);
  const [avisoPortada, setAvisoPortada] = useState<Aviso | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (fuente !== "Open Sans") void loadBulletinFont(fuente);
  }, [fuente]);
  useEffect(() => setElegidos(null), [edicion]);

  /** Estado del informe de cada ODS en la edición: solo los publicados entran al boletín. */
  const estado = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of informes.data ?? []) if (i.ranking === "impact" && i.edition === edicion) m.set(Number(i.unit_key), i.state);
    return m;
  }, [informes.data, edicion]);
  const publicados = useMemo(() => ODS_LIST.filter((o) => estado.get(o.n) === "publicado").map((o) => o.n), [estado]);
  const incluidos = (elegidos ?? publicados).filter((n) => publicados.includes(n));

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".bpf-panel > section", { opacity: 0, x: -10, duration: 0.38, ease: "power3.out", stagger: 0.04, clearProps: "opacity,transform" });
      gsap.from(".bpf-papel", { opacity: 0, y: 14, duration: 0.45, ease: "power3.out", delay: 0.1, clearProps: "opacity,transform" });
    },
    { scope: raiz },
  );

  /** La portada guardada en la plantilla del boletín (o el buen valor por defecto). */
  const diseno = useMemo(() => disenoDeBoletin(adm.row?.settings, edicion), [adm.row?.settings, edicion]);
  const opts: OpcionesBoletin = { edicion, lang, acento, fuente, rector: rector.text, paginas, partes, maxCifras, portada: diseno.portada, perfil: diseno.perfil, escalarPortada: true };

  const guardarPortada = async (portada: PortadaDiseno, perfil: PerfilOficina) => {
    setGuardandoPortada(true);
    setAvisoPortada(null);
    try {
      await adm.saveSettings({ odsPortada: paraGuardar({ portada, perfil }) });
      setAvisoPortada({ tono: "ok", texto: "Portada guardada. Ya es la del boletín." });
    } catch (e) {
      setAvisoPortada({ tono: "error", texto: e instanceof Error ? e.message : "No se pudo guardar la portada. Lo que escribiste sigue en pantalla." });
    } finally {
      setGuardandoPortada(false);
    }
  };

  const alternar = (n: number) => setElegidos((a) => ((a ?? publicados).includes(n) ? (a ?? publicados).filter((x) => x !== n) : [...(a ?? publicados), n].sort((x, y) => x - y)));

  const imprimir = async () => {
    if (!incluidos.length) return setAviso("Elige al menos un ODS publicado.");
    setAviso("");
    if (fuente !== "Open Sans") await loadBulletinFont(fuente);
    /* Las imágenes y los gráficos deben estar listos antes de abrir la impresión. */
    await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".bpf-print-root img")).map((img) => img.decode().catch(() => undefined)));
    const quitar = () => {
      document.body.classList.remove("bpf-imprimiendo");
      window.removeEventListener("afterprint", quitar);
    };
    document.body.classList.add("bpf-imprimiendo");
    window.addEventListener("afterprint", quitar);
    window.print();
  };

  if (informes.isPending) return <p role="status">Cargando los informes…</p>;
  if (informes.error) return <p className="bpf-aviso" role="alert">No se pudieron leer los informes de Pilo Publica. Revisa que la migración 0262 esté aplicada.</p>;

  return (
    <div ref={raiz} className="bpf-admin-wrap">
      <div className="bpf-admin">
        <aside className="bpf-panel" aria-label="Opciones del boletín">
          <section>
            <h3>Edición</h3>
            <select aria-label="Edición del ranking" value={edicion} onChange={(e) => setEdicion(Number(e.target.value))}>
              {EDICIONES.map((y) => (
                <option key={y} value={y}>
                  THE Impact {y}
                </option>
              ))}
            </select>
            <div className="opt-seg" role="group" aria-label="Idioma del boletín">
              <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")}>
                Español
              </button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
                English
              </button>
            </div>
          </section>

          <section>
            <h3>
              ODS incluidos · {incluidos.length} de {publicados.length} publicados
            </h3>
            <div className="bpf-chips" role="group" aria-label="ODS incluidos en el boletín">
              {ODS_LIST.map((o) => {
                const est = estado.get(o.n);
                const ok = est === "publicado";
                return (
                  <button
                    key={o.n}
                    type="button"
                    className="bpf-ch"
                    style={{ "--c": o.color } as CSSProperties}
                    aria-pressed={incluidos.includes(o.n)}
                    aria-label={`ODS ${o.n}, ${o.name}${ok ? "" : est ? `, informe en ${est}` : ", sin informe"}`}
                    title={ok ? o.name : est ? `${o.name}: el informe está en ${est}; publícalo para incluirlo` : `${o.name}: aún no tiene informe en Pilo Publica`}
                    disabled={!ok}
                    onClick={() => alternar(o.n)}
                  >
                    {o.n}
                  </button>
                );
              })}
            </div>
            <div className="bpf-quick">
              <button className="pp-btn pp-btn--sm" type="button" onClick={() => setElegidos(publicados)}>
                Todos los publicados
              </button>
              <button className="pp-btn pp-btn--sm" type="button" onClick={() => setElegidos([])}>
                Ninguno
              </button>
            </div>
            {publicados.length === 0 && <p className="bpf-nota">Todavía no hay informes publicados para esta edición. Publícalos en Pilo Publica y vuelve.</p>}
          </section>

          <section>
            <h3>Qué lleva cada ODS</h3>
            {PARTES.map(([k, t]) => (
              <label key={k} className="bpf-check">
                <input type="checkbox" checked={partes[k]} onChange={(e) => setPartes((p) => ({ ...p, [k]: e.target.checked }))} />
                {t}
              </label>
            ))}
            <label className="bpf-check">
              <span>Cifras destacadas por ODS</span>
              <select aria-label="Cifras destacadas por ODS" value={maxCifras} disabled={!partes.cifras} onChange={(e) => setMaxCifras(Number(e.target.value))}>
                {[4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h3>Portada</h3>
            <p className="bpf-nota">
              {diseno.portada.titulo}
            </p>
            <button type="button" className="pp-btn pp-btn--sm" aria-pressed={editando} onClick={() => { setEditando((v) => !v); setAvisoPortada(null); }}>
              {editando ? "Volver al boletín" : "Editar la portada"}
            </button>
            <p className="bpf-nota">Cinco composiciones, textos, foto con encuadre, color de acento y monograma: el diseño de Informes Institucionales.</p>
          </section>

          <section>
            <h3>Páginas</h3>
            {PAGINAS.map(([k, t]) => (
              <label key={k} className="bpf-check">
                <input type="checkbox" checked={paginas[k]} onChange={(e) => setPaginas((p) => ({ ...p, [k]: e.target.checked }))} />
                {t}
              </label>
            ))}
          </section>

          <section>
            <h3>Estilo</h3>
            <div className="bpf-sw" role="group" aria-label="Color de acento">
              {ACENTOS.map(([c, t]) => (
                <button key={c} type="button" style={{ "--c": c } as CSSProperties} aria-pressed={acento === c} aria-label={t} title={t} onClick={() => setAcento(c)} />
              ))}
            </div>
            <select aria-label="Fuente del boletín" value={fuente} onChange={(e) => setFuente(e.target.value as FuenteBoletin)}>
              <option>Open Sans</option>
              <option>Montserrat</option>
            </select>
          </section>

          {paginas.presentacion && (
            <section>
              <h3>Presentación del Rector</h3>
              <textarea className="bpf-texto" aria-label="Texto de la presentación rectoral" value={rector.text} onChange={(e) => rector.setText(e.target.value)} />
              <p className="bpf-nota">Separa los párrafos con una línea en blanco. {RECTOR.illustrative ? "Texto de ejemplo: cámbialo por el del Rector." : ""}</p>
              {rector.edited && (
                <button className="pp-btn pp-btn--sm" type="button" onClick={rector.reset}>
                  Volver al texto original
                </button>
              )}
            </section>
          )}
        </aside>

        <div className="bpf-visor">
          <div className="bpf-visor__bar">
            <p className="bpf-nota" role="status">
              {incluidos.length === 1 ? "1 ODS" : `${incluidos.length} ODS`} · A4 · {lang === "es" ? "Español" : "English"} · la paginación final es la de la impresión
            </p>
            <button type="button" className="button-primary" onClick={() => void imprimir()} disabled={incluidos.length === 0}>
              Descargar PDF
            </button>
          </div>
          {aviso && (
            <p className="bpf-aviso" role="alert">
              {aviso}
            </p>
          )}
          {editando ? (
            <EditorPortada
              ctx={ctxDe(diseno.perfil, diseno.portada.anio, null)}
              portada={diseno.portada}
              perfil={diseno.perfil}
              unidadId="boletin-ods"
              puedeDiseno
              puedePerfil
              guardando={guardandoPortada}
              aviso={avisoPortada}
              onGuardar={(p, pf) => void guardarPortada(p, pf)}
              onCerrar={() => setEditando(false)}
            />
          ) : incluidos.length === 0 && !paginas.portada ? (
            <p className="bpf-aviso">Elige al menos un ODS publicado o una página para ver el boletín.</p>
          ) : (
            <div className="bpf-papel">
              <DocumentoBoletin incluidos={incluidos} opts={opts} />
            </div>
          )}

          <section className="bpf-publicar" aria-labelledby="bpf-pub-t">
            <h2 id="bpf-pub-t">Publicar en Boletines</h2>
            <ol className="bpf-nota">
              <li>«Descargar PDF» abre la impresión: elige «Guardar como PDF», tamaño A4, márgenes predeterminados y marca «Gráficos de fondo».</li>
              <li>Sube aquí ese PDF: queda como edición del boletín, se muestra en la página pública de Boletines y no cambia después.</li>
            </ol>
            <p className="bpf-nota">
              El público solo ve la edición publicada, en <Link to="/datos-abiertos/boletines">Boletines</Link> y en la página de descarga de UDES Sostenible. El armado del boletín es solo de este entorno.
            </p>
            <OdsBulletinPublish />
          </section>
        </div>
      </div>
      {montado && createPortal(<div className="bpf-print-root">{incluidos.length > 0 || paginas.portada ? <DocumentoBoletin incluidos={incluidos} opts={{ ...opts, escalarPortada: false }} /> : null}</div>, document.body)}
    </div>
  );
}
