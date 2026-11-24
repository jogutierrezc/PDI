/* =============================================================================
   Recolector de noticias · «Configurar perfil»: la hoja lateral de un perfil de
   ranking (migración 0242).

   Tres pestañas, como la pantalla aprobada:
     Qué busca       los temas activos, las palabras propias (lista editable) y
                     de qué fuentes lee.
     Cuánto basta    el mínimo para proponer, los temas por nota, el peso del
                     título, la constante y la confianza de Pilo; con la vista
                     previa en vivo en el pie.
     Publicación     por ranking: si recibe noticias, quién aprueba y dónde
                     aparece.
   Se edita un borrador de los cuatro perfiles y «Guardar» escribe solo los que
   cambiaron. Esc cierra (en seco), el foco queda dentro de la hoja y vuelve al
   botón que la abrió. Entra desde la derecha (280 ms) y sale en 160 ms
   (movimiento.ts: useHoja); el indicador de las pestañas se desliza con el
   ratón (useIndicador) y los controles se aprietan al pulsarlos (usePresion).
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui/Icon";
import { NEWS_SOURCES } from "./noticias";
import { entradaUnica, useHoja, useIndicador, usePresion } from "./movimiento";
import { CATALOGO, FABRICA, MODOS, PERFIL_IDS, VISTA, cambioDePerfil, conModo, contarPropuestas, pasosPublicacion, temaInfo, temaVars } from "./perfiles";
import type { ConfigPerfil, ModoPerfil, PerfilId, Perfiles } from "./perfiles";

export type TabPerfil = "busca" | "basta" | "pub";

const TABS: [TabPerfil, string][] = [
  ["busca", "Qué busca"],
  ["basta", "Cuánto basta"],
  ["pub", "Publicación"],
];

const SEDES = new Set(["bucaramanga", "cucuta", "valledupar", "bogota"]);

interface Dial {
  campo: "umbral" | "max_temas" | "peso_titulo" | "saturacion" | "umbral_pilo";
  etiqueta: string;
  min: number;
  max: number;
  valor: (v: number) => string;
  ayuda: string;
}

const DIALES: Dial[] = [
  { campo: "umbral", etiqueta: "Puntaje mínimo para proponer", min: 10, max: 90, valor: (v) => String(v), ayuda: "Desde este puntaje (0 a 100) el perfil propone el tema a quien revisa." },
  { campo: "max_temas", etiqueta: "Temas por nota, como máximo", min: 1, max: 6, valor: (v) => String(v), ayuda: "De fábrica se proponen los tres mejores." },
  { campo: "peso_titulo", etiqueta: "Peso del título frente al texto", min: 1, max: 6, valor: (v) => `${v}×`, ayuda: "De fábrica el título pesa el triple. Con 1× título y texto valen igual." },
  { campo: "saturacion", etiqueta: "Rapidez con que crece el puntaje", min: 6, max: 30, valor: (v) => String(v), ayuda: "Una constante más baja da puntajes altos con pocas coincidencias." },
  { campo: "umbral_pilo", etiqueta: "Confianza para que Pilo decida solo", min: 50, max: 100, valor: (v) => String(v), ayuda: "Con una confianza menor, la nota queda por revisar. Solo cuenta con «Pilo aprueba lo claro» encendido." },
];

interface Props {
  perfil: PerfilId;
  guardadas: Perfiles;
  /** ¿Existe la migración 0242? Sin ella la hoja se puede mirar, no guardar. */
  hay: boolean;
  /** Todas las notas cargadas (título y extracto): la vista previa se calcula con ellas. */
  notas: { title: string; excerpt: string }[];
  /** Cuántas notas hay aprobadas hoy en el perfil que se mira. */
  aprobadas: number;
  tab: TabPerfil;
  onTab: (t: TabPerfil) => void;
  guardando: boolean;
  error: string | null;
  onGuardar: (cambios: Partial<Perfiles>) => void;
  onCerrar: () => void;
}

export function PerfilHoja({ perfil, guardadas, hay, notas, aprobadas, tab, onTab, guardando, error, onGuardar, onCerrar }: Props) {
  const idTitulo = useId();
  const [borrador, setBorrador] = useState<Perfiles>(guardadas);
  const [aviso, setAviso] = useState("");
  const [nueva, setNueva] = useState("");
  const hoja = useRef<HTMLElement>(null);
  const velo = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const campoNueva = useRef<HTMLInputElement>(null);
  const cfg = borrador[perfil];
  const cat = CATALOGO[perfil];

  const cerrar = useHoja(hoja, true, { lado: "derecha", alCerrar: onCerrar, velo }).cerrar;
  useIndicador(tabs, '[aria-selected="true"]', tab, true);
  usePresion(hoja, ".rk-tchip, .rk-src, .rk-modo > button, .rk-iconbtn");

  const cambia = (id: PerfilId, f: (c: ConfigPerfil) => ConfigPerfil) => setBorrador((b) => ({ ...b, [id]: f(b[id]) }));
  const cambiados = PERFIL_IDS.filter((id) => cambioDePerfil(borrador[id], guardadas[id]));

  // Las palabras propias nuevas entran con un fundido corto (solo si las agrega el ratón o el teclado, una a la vez).
  const largo = useRef(cfg.palabras.length);
  useEffect(() => {
    if (cfg.palabras.length > largo.current) entradaUnica(hoja.current?.querySelector(".rk-term:last-of-type") ?? null);
    largo.current = cfg.palabras.length;
  }, [cfg.palabras.length]);

  const vistaPrevia = useMemo(() => {
    const ahora = contarPropuestas(notas, perfil, cfg);
    const guardada = contarPropuestas(notas, perfil, guardadas[perfil]);
    const fabrica = contarPropuestas(notas, perfil, { ...FABRICA[perfil], recibe: cfg.recibe });
    return { ahora, guardada, fabrica };
  }, [notas, perfil, cfg, guardadas]);

  const alTeclado = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      cerrar({ animar: false });
      return;
    }
    if (e.key !== "Tab") return;
    const f = Array.from(hoja.current?.querySelectorAll<HTMLElement>("button, input, [tabindex]:not([tabindex='-1'])") ?? []).filter((x) => !x.hasAttribute("disabled") && x.offsetParent !== null);
    if (!f.length) return;
    const a = f[0];
    const z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) {
      e.preventDefault();
      z.focus();
    } else if (!e.shiftKey && document.activeElement === z) {
      e.preventDefault();
      a.focus();
    }
  };

  const alTecladoTabs = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex(([id]) => id === tab);
    const j = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    onTab(TABS[j][0]);
    tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[j]?.focus();
    e.preventDefault();
  };

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const v = nueva.trim().slice(0, 60);
    if (!v) return;
    if (cfg.palabras.some((p) => p.toLowerCase() === v.toLowerCase())) {
      setAviso(`«${v}» ya está en la lista.`);
      return;
    }
    if (cfg.palabras.length >= 60) {
      setAviso("Son 60 palabras como máximo.");
      return;
    }
    setAviso("");
    cambia(perfil, (c) => ({ ...c, palabras: [...c.palabras, v] }));
    setNueva("");
    campoNueva.current?.focus();
  };

  const alternarTema = (id: string) => {
    if (cat.fijos.includes(id)) {
      setAviso(`${temaInfo(id).corto} es obligatorio en ${cat.nombre}.`);
      return;
    }
    setAviso("");
    cambia(perfil, (c) => ({ ...c, capas: c.capas.includes(id) ? c.capas.filter((x) => x !== id) : [...c.capas, id] }));
  };

  const alternarFuente = (clave: string) => {
    if (cfg.fuentes.includes(clave) && cfg.fuentes.length === 1) {
      setAviso("Debe quedar al menos una fuente.");
      return;
    }
    setAviso("");
    cambia(perfil, (c) => ({ ...c, fuentes: c.fuentes.includes(clave) ? c.fuentes.filter((x) => x !== clave) : [...c.fuentes, clave] }));
  };

  const grupos = cat.temas.reduce<{ grupo: string; ids: string[] }[]>((acc, t) => {
    const g = acc.find((x) => x.grupo === t.grupo);
    if (g) g.ids.push(t.id);
    else acc.push({ grupo: t.grupo, ids: [t.id] });
    return acc;
  }, []);

  const guardar = () => {
    const cambios: Partial<Perfiles> = {};
    for (const id of cambiados) cambios[id] = borrador[id];
    onGuardar(cambios);
  };

  const hojaDom = (
    <>
      <button ref={velo} type="button" tabIndex={-1} className="rk-hoja-velo" aria-label="Cerrar la configuración" onClick={() => cerrar()} />
      <aside ref={hoja} className="rk-hoja" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1} onKeyDown={alTeclado}>
        <div className="rk-hoja__head">
          <div>
            <h2 id={idTitulo}>Perfil {cat.nombre}</h2>
            <p>{cat.descripcion}</p>
          </div>
          <button type="button" className="rk-iconbtn" onClick={() => cerrar()} aria-label="Cerrar la configuración" data-autofocus>
            <Icon name="close" size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="rk-hoja__tabs">
          <div ref={tabs} className="rk-seg" role="tablist" aria-label="Secciones del perfil" onKeyDown={alTecladoTabs}>
            <span data-indicador aria-hidden="true" />
            {TABS.map(([id, etiqueta]) => (
              <button key={id} type="button" role="tab" id={`rk-tab-${id}`} aria-selected={tab === id} aria-controls="rk-hoja-panel" tabIndex={tab === id ? 0 : -1} onClick={() => onTab(id)}>
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="rk-hoja__body" id="rk-hoja-panel" role="tabpanel" aria-labelledby={`rk-tab-${tab}`}>
          {!hay && (
            <p className="rk-hint rk-hoja__warn" role="status">
              Falta aplicar la migración 0242 (perfiles del recolector): puedes mirar los ajustes, pero todavía no se guardan.
            </p>
          )}

          {tab === "busca" && (
            <>
              {grupos.map((g) => (
                <section key={g.grupo} className="rk-hoja__sec" aria-label={g.grupo}>
                  <h3>{g.grupo}</h3>
                  <div className="rk-tchips">
                    {g.ids.map((id) => {
                      const t = temaInfo(id);
                      const on = cfg.capas.includes(id);
                      return (
                        <button key={id} type="button" className="rk-tchip" aria-pressed={on} title={t.nombre} onClick={() => alternarTema(id)}>
                          <span className="rk-odsmark" style={temaVars(id)}>
                            {t.cod}
                          </span>
                          {t.corto}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section className="rk-hoja__sec" aria-labelledby="rk-propias-h">
                <h3 id="rk-propias-h">Palabras propias de este perfil</h3>
                <form className="rk-addterm" onSubmit={agregar}>
                  <input ref={campoNueva} type="text" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Una palabra o frase, p. ej. «huella de carbono»" aria-label="Palabra o frase nueva" autoComplete="off" maxLength={60} />
                  <button className="button-primary rk-sm" type="submit">
                    Agregar
                  </button>
                </form>
                <ul className="rk-terms" aria-live="polite" aria-label="Palabras propias">
                  {cfg.palabras.length === 0 && <li className="rk-hint">Sin palabras propias: este perfil usa solo el léxico base.</li>}
                  {cfg.palabras.map((p) => (
                    <li key={p} className="rk-term">
                      {p}
                      <button type="button" className="rk-term__x" aria-label={`Quitar ${p}`} onClick={() => cambia(perfil, (c) => ({ ...c, palabras: c.palabras.filter((x) => x !== p) }))}>
                        <Icon name="close" size={10} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="rk-hint">Una frase cuenta más que una palabra suelta. Una palabra solo cuenta al inicio de una palabra del texto; se ignoran tildes y mayúsculas, igual que en el léxico base. Una nota que solo coincide con una palabra propia lo dice en su razón.</p>
              </section>

              <section className="rk-hoja__sec" aria-labelledby="rk-fuentes-h">
                <h3 id="rk-fuentes-h">De dónde lee</h3>
                <div className="rk-srcs">
                  {NEWS_SOURCES.map((f) => (
                    <button key={f.key} type="button" className="rk-src" aria-pressed={cfg.fuentes.includes(f.key)} onClick={() => alternarFuente(f.key)}>
                      <i aria-hidden="true" />
                      <span>
                        {f.label.replace("Sede ", "")}
                        <small>{SEDES.has(f.key) ? "sede" : "udes.edu.co"}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="rk-hint">Fuentes fijas de la lista: nunca una dirección libre. Una nota cada ~450 ms.</p>
              </section>
            </>
          )}

          {tab === "basta" && (
            <>
              <section className="rk-hoja__sec" aria-label="Reconocer una noticia">
                <h3>Reconocer una noticia</h3>
                {DIALES.map((d) => {
                  const id = `rk-d-${d.campo}`;
                  const valor = cfg[d.campo];
                  const apagado = d.campo === "umbral_pilo" && !cfg.pilo_aprueba;
                  const fabrica = FABRICA[perfil][d.campo];
                  return (
                    <div key={d.campo} className={`rk-dial${apagado ? " rk-dial--off" : ""}`}>
                      <label htmlFor={id}>
                        {d.etiqueta} <output htmlFor={id}>{d.valor(valor)}</output>
                      </label>
                      <input
                        id={id}
                        type="range"
                        min={d.min}
                        max={d.max}
                        step={1}
                        value={valor}
                        style={{ "--fill": `${((valor - d.min) / (d.max - d.min)) * 100}%` } as React.CSSProperties}
                        onChange={(e) => cambia(perfil, (c) => ({ ...c, [d.campo]: Number(e.target.value) }))}
                      />
                      <small>
                        {d.ayuda} De fábrica: {d.valor(fabrica)}.
                      </small>
                    </div>
                  );
                })}
              </section>
              <section className="rk-hoja__sec" aria-label="Qué se conserva">
                <h3>Qué se conserva</h3>
                <ul className="rk-same">
                  <li>
                    <Icon name="check" size={14} aria-hidden="true" />
                    El perfil ODS es el recolector de hoy: sin tocarlo, nada cambia.
                  </li>
                  <li>
                    <Icon name="check" size={14} aria-hidden="true" />
                    Lo aprobado, lo descartado y lo corregido a mano no se vuelve a tocar, en ningún perfil.
                  </li>
                  <li>
                    <Icon name="check" size={14} aria-hidden="true" />
                    Solo lo aprobado es público; el texto completo nunca sale al público.
                  </li>
                  <li>
                    <Icon name="check" size={14} aria-hidden="true" />
                    Una nota puede estar aprobada en un perfil y descartada en otro.
                  </li>
                </ul>
              </section>
            </>
          )}

          {tab === "pub" && (
            <div className="rk-pub">
              {PERFIL_IDS.map((id) => {
                const c = borrador[id];
                const pasos = pasosPublicacion(id, c.modo);
                const nombre = `rk-pub-${id}`;
                return (
                  <section key={id} className={`rk-pubrow${c.recibe ? "" : " rk-pubrow--off"}`} aria-labelledby={nombre}>
                    <div className="rk-pubrow__top">
                      <h3 id={nombre} className="rk-pubrow__name">
                        <i style={{ background: VISTA[id].color }} aria-hidden="true" />
                        {CATALOGO[id].nombre}
                      </h3>
                      <span className="rk-sw-row">
                        <span id={`${nombre}-r`}>Recibe noticias</span>
                        <button type="button" role="switch" className="rk-tg" aria-checked={c.recibe} aria-labelledby={`${nombre}-r`} onClick={() => cambia(id, (x) => ({ ...x, recibe: !x.recibe }))} />
                      </span>
                    </div>
                    <p className="rk-hint">{VISTA[id].donde}</p>
                    <div className="rk-seg rk-modo" role="group" aria-label={`Cómo se publica en ${CATALOGO[id].nombre}`}>
                      {MODOS.map((m) => (
                        <button key={m.id} type="button" aria-pressed={c.modo === m.id} onClick={() => cambia(id, (x) => conModo(x, m.id as ModoPerfil))}>
                          {m.etiqueta}
                        </button>
                      ))}
                    </div>
                    <ol className="rk-flow2" aria-label="Recorrido de una nota">
                      {pasos.map((p, i) => (
                        <li key={p} className={i === pasos.length - 1 && c.modo !== "cerrado" ? "rk-flow2__fin" : undefined}>
                          {p}
                        </li>
                      ))}
                    </ol>
                    <p className="rk-hint">
                      {id === perfil && (
                        <>
                          <b>{aprobadas}</b> {aprobadas === 1 ? "nota aprobada" : "notas aprobadas"} hoy en este perfil.{" "}
                        </>
                      )}
                      {VISTA[id].conexion}
                    </p>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="rk-hoja__foot">
          <p className="rk-hint" aria-live="polite">
            {error ? (
              <span className="rk-error" role="alert">
                {error}
              </span>
            ) : (
              aviso ||
              `Con estos ajustes el léxico propondría un tema en ${vistaPrevia.ahora} de ${notas.length} notas cargadas (guardado: ${vistaPrevia.guardada}; de fábrica: ${vistaPrevia.fabrica}). Se calcula con el título y el extracto.`
            )}
          </p>
          <span className="rk-hoja__btns">
            <button
              type="button"
              className="button-secondary rk-sm"
              onClick={() => {
                cambia(perfil, (c) => ({ ...FABRICA[perfil], recibe: c.recibe }));
                setAviso(`Perfil «${cat.nombre}» con valores de fábrica. Falta guardar.`);
              }}
            >
              Valores de fábrica
            </button>
            <button type="button" className="button-primary rk-sm" disabled={!hay || guardando || cambiados.length === 0} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar perfil"}
            </button>
          </span>
        </div>
      </aside>
    </>
  );
  return typeof document === "undefined" ? null : createPortal(hojaDom, document.body);
}
