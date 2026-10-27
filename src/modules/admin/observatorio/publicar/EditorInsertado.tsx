/* =============================================================================
   Observatorio · «Insertar en otra página» (O2): el panel donde se arma un
   insertado — qué mostrar, apariencia, filtros iniciales, seguridad— con la
   vista previa EN VIVO (el /obs-embed real, en modo de vista previa, que pide
   su contenido a obs_vista_previa, 0234), una página de ejemplo con selector
   de ancho y de estado, y el código para pegar.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { textoEmbed } from "../../../obs-embed/obs-embed";
import type { EstadoEmbed } from "../../../obs-embed/obs-embed";
import type { ConfigPrevia } from "../../../obs-embed/ObsEmbed";
import { SECTION_LABEL, SECTIONS } from "../model";
import type { ObsSection, ObsView } from "../model";
import { useGuardarInsertado, useProponerDominio } from "./api";
import type { Dominio, Insertado, Observatorio, Tema } from "./api";
import { OPCIONES_DEFECTO, PLATAFORMAS, escribirFiltros, generarCodigo, validarOpciones } from "./opciones";
import type { DatosCodigo, FormatoCodigo, Idioma, OpcionesInsertado, TipoInsertado } from "./opciones";
import { hostPermitido } from "./registro";
import { BotonCopiar, Chip, Dialogo, Ico, Seg } from "./ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPOS: { id: TipoInsertado; nombre: string; detalle: string }[] = [
  { id: "portada", nombre: "Portada", detalle: "Las líneas y temas publicados del observatorio" },
  { id: "tema", nombre: "Un tema", detalle: "La página completa de un tema" },
  { id: "seccion", nombre: "Una sección", detalle: "Un tema, solo una de sus secciones" },
  { id: "visor", nombre: "Un visor", detalle: "Una gráfica o tabla" },
];

/** Plataformas que el cargador no cubre en opciones.ts: siempre iframe o enlace, nunca script suelto. */
const EXTRAS: { id: string; nombre: string; pasos: string; formato: FormatoCodigo }[] = [
  { id: "sharepoint", nombre: "SharePoint", pasos: "Las páginas modernas no ejecutan scripts: edita la página, agrega la parte web «Insertar» y pega el iframe (o el enlace). Quien administra el sitio debe permitir este dominio en la seguridad de inserción.", formato: "iframe" },
  { id: "moodle", nombre: "Moodle", pasos: "En el editor de texto abre la vista HTML (<>) y pega el iframe. Moodle filtra los scripts y, según su configuración, también los iframes: si lo borra, pide a quien administra el sitio que lo permita.", formato: "iframe" },
  { id: "gsites", nombre: "Google Sites", pasos: "Insertar → «Incorporar» → pestaña «Código» y pega el iframe. No acepta el script suelto.", formato: "iframe" },
];
const POR_PLATAFORMA: Record<string, FormatoCodigo> = { wordpress: "script", joomla: "script", html: "script", iframe: "iframe", enlace: "enlace" };

const SIMULACIONES: [string, string][] = [["ok", "Normal (en vivo)"], ["cargando", "Cargando"], ["vacio", "Sin filas con los filtros"], ["error", "Error de red"], ["dominio", "Dominio no autorizado"], ["sin_publicar", "Sin publicar"], ["pausado", "Pausado"], ["revocado", "Revocado"], ["vencido", "Vencido"], ["clave", "Clave incorrecta"]];

interface Cfg {
  nombre: string;
  tipo: TipoInsertado;
  tema: string;
  seccion: ObsSection;
  visor: string;
  opciones: OpcionesInsertado;
  acceso: "publico" | "clave";
  clave: string;
  quitarClave: boolean;
  vence: string;
}

const claveNueva = () => `k${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 5)}`;

interface Props {
  obs: Observatorio;
  temas: Tema[];
  vistas: ObsView[];
  dominios: Dominio[];
  editar: Insertado | null;
  inicial?: { tipo?: TipoInsertado; tema?: string };
  puedeAprobar: boolean;
  onCerrar: () => void;
  onGuardado: (i: Insertado) => void;
  decir: (t: string, mala?: boolean) => void;
  irADominios: () => void;
}

export function EditorInsertado({ obs, temas, vistas, dominios, editar, inicial, puedeAprobar, onCerrar, onGuardado, decir, irADominios }: Props) {
  const guardar = useGuardarInsertado();
  const proponer = useProponerDominio();
  const [actual, setActual] = useState<Insertado | null>(editar);
  const vivos = temas.filter((t) => !t.archivado);
  const primero = vivos.find((t) => t.status === "publicado") ?? vivos[0];
  const [cfg, setCfg] = useState<Cfg>(() => {
    if (editar)
      return { nombre: editar.nombre, tipo: editar.tipo, tema: editar.tema_slug ?? primero?.slug ?? "", seccion: (editar.seccion as ObsSection) ?? "tendencia", visor: editar.visor_id ?? "", opciones: validarOpciones(editar.opciones).opciones, acceso: editar.con_clave ? "clave" : "publico", clave: "", quitarClave: false, vence: editar.vence_en ? editar.vence_en.slice(0, 10) : "" };
    const tema = inicial?.tema ?? primero?.slug ?? "";
    const tipo = inicial?.tipo ?? "portada";
    return { nombre: "", tipo, tema, seccion: "tendencia", visor: "", opciones: { ...OPCIONES_DEFECTO }, acceso: "publico", clave: "", quitarClave: false, vence: "" };
  });
  const [nombreTocado, setNombreTocado] = useState(Boolean(editar));
  const [pestana, setPestana] = useState<"contenido" | "apariencia" | "filtros" | "seguridad">("contenido");
  const [filtros, setFiltros] = useState<[string, string][]>(() => Object.entries(cfg.opciones.f));
  const [dominioNuevo, setDominioNuevo] = useState("");
  const [errorDominio, setErrorDominio] = useState("");
  const [error, setError] = useState("");
  const set = (c: Partial<Cfg>) => setCfg((x) => ({ ...x, ...c }));
  const setOp = (c: Partial<OpcionesInsertado>) => setCfg((x) => ({ ...x, opciones: { ...x.opciones, ...c } }));

  const tema = temas.find((t) => t.slug === cfg.tema);
  const visoresDelTema = vistas.filter((v) => v.topic === cfg.tema && UUID.test(v.id));
  const nombreAuto = cfg.tipo === "portada" ? `Portada de ${obs.nombre}` : `${tema?.nombre ?? cfg.tema}${cfg.tipo === "seccion" ? ` · ${SECTION_LABEL[cfg.seccion]}` : cfg.tipo === "visor" ? " · visor" : ""} en otra página`;
  const nombre = nombreTocado ? cfg.nombre : nombreAuto;

  // El visor elegido debe ser del tema elegido.
  useEffect(() => {
    if (cfg.tipo === "visor" && !visoresDelTema.some((v) => v.id === cfg.visor)) setCfg((x) => ({ ...x, visor: visoresDelTema[0]?.id ?? "" }));
  }, [cfg.tipo, cfg.tema, visoresDelTema, cfg.visor]);

  const { opciones, problemas } = useMemo(() => {
    const f: Record<string, string> = {};
    for (const [k, v] of filtros) if (k.trim() && v.trim()) f[k.trim().toLowerCase()] = v.trim();
    return validarOpciones({ ...cfg.opciones, f });
  }, [cfg.opciones, filtros]);

  const publicado = tema && tema.status === "publicado" && !tema.archivado && obs.estado === "publicado";
  const avisoContenido = obs.estado !== "publicado" ? `El observatorio está en ${obs.estado}: quien vea el insertado hoy encontrará un aviso.` : cfg.tipo !== "portada" && !publicado ? `El tema está ${tema?.archivado ? "archivado" : "en borrador"}: quien vea el insertado hoy encontrará un aviso.` : "";

  const clave = cfg.acceso === "clave" && cfg.clave ? cfg.clave : undefined;
  const datos: DatosCodigo = { codigo: actual?.codigo ?? "(se asigna al guardar)", tipo: cfg.tipo, temaSlug: cfg.tipo === "portada" ? null : cfg.tema, seccion: cfg.tipo === "seccion" ? cfg.seccion : null, visorId: cfg.tipo === "visor" ? cfg.visor : null, opciones, clave };

  const faltan: string[] = [];
  if (cfg.tipo !== "portada" && !cfg.tema) faltan.push("Elige un tema.");
  if (cfg.tipo === "visor" && !cfg.visor) faltan.push("Este tema no tiene visores con los que insertar.");
  if (!nombre.trim()) faltan.push("Ponle un nombre en el registro.");
  if (cfg.acceso === "clave" && !cfg.clave && !(actual?.con_clave && !cfg.quitarClave)) faltan.push("Escribe o genera una clave.");
  if (cfg.acceso === "clave" && cfg.clave && cfg.clave.length < 4) faltan.push("La clave lleva al menos 4 caracteres.");
  const bloqueos = [...faltan, ...problemas];

  const hacerGuardar = async () => {
    if (bloqueos.length) return setError(bloqueos[0]);
    setError("");
    try {
      const r = await guardar.mutateAsync({
        p_id: actual?.id ?? null, p_obs: obs.id, p_nombre: nombre.trim(), p_tipo: cfg.tipo,
        p_tema: cfg.tipo === "portada" ? null : cfg.tema, p_seccion: cfg.tipo === "seccion" ? cfg.seccion : null, p_visor: cfg.tipo === "visor" ? cfg.visor : null,
        p_opciones: opciones, p_clave: cfg.acceso === "clave" && cfg.clave ? cfg.clave : null, p_quitar_clave: cfg.acceso === "publico" && Boolean(actual?.con_clave),
        p_vence: cfg.vence ? new Date(`${cfg.vence}T23:59:59`).toISOString() : null,
      });
      setActual(r);
      onGuardado(r);
      decir(actual ? `Cambios guardados · v${r.version}` : "Insertado guardado: ya puedes copiar el código");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const proponerDominio = async () => {
    const v = dominioNuevo.trim();
    if (!v) return;
    setErrorDominio("");
    try {
      const r = await proponer.mutateAsync({ p_obs: obs.id, p_host: v });
      setDominioNuevo("");
      decir(r.estado === "aprobado" ? `«${r.host}» ya está autorizado` : `«${r.host}» quedó propuesto: lo aprueba quien administra`);
    } catch (e) {
      setErrorDominio(e instanceof Error ? e.message : "No se pudo proponer el dominio");
    }
  };

  const pestanas: ["contenido" | "apariencia" | "filtros" | "seguridad", string][] = [["contenido", "Contenido"], ["apariencia", "Apariencia"], ["filtros", "Filtros"], ["seguridad", "Seguridad"]];

  return (
    <Dialogo hoja titulo={actual ? "Editar insertado" : "Insertar en otra página"} sub={`Observatorio: ${obs.nombre}. Los cambios se ven al instante a la derecha.`} onCerrar={onCerrar}
      pie={(cerrar) => (
        <>
          <span className="obsx-pie__msg" role="status">
            {error ? <span className="obsx-error">{error}</span> : avisoContenido || (actual ? `Se guardará como v${actual.version + 1}. Las páginas que lo usan se actualizan solas (hasta una hora de caché).` : "Se registrará como v1 en el listado de insertados.")}
          </span>
          <button type="button" className="button-secondary" onClick={cerrar}>{actual ? "Cerrar" : "Cancelar"}</button>
          <button type="button" className="button-primary" onClick={() => void hacerGuardar()} disabled={guardar.isPending || bloqueos.length > 0}>{guardar.isPending ? "Guardando…" : actual ? "Guardar cambios" : "Guardar insertado"}</button>
        </>
      )}>
      <div className="obsx-editor">
        <div className="obsx-editor__opciones">
          <div className="obsx-pestanas" role="tablist" aria-label="Opciones del insertado">
            {pestanas.map(([id, t]) => <button key={id} type="button" role="tab" id={`obsx-op-${id}`} aria-selected={pestana === id} aria-controls="obsx-op-panel" tabIndex={pestana === id ? 0 : -1} onClick={() => setPestana(id)}>{t}</button>)}
          </div>
          <div id="obsx-op-panel" role="tabpanel" aria-labelledby={`obsx-op-${pestana}`} className="obsx-form">
            {pestana === "contenido" && (
              <>
                <div className="admin-field">
                  <span>Qué insertar</span>
                  <div className="obsx-radios" role="radiogroup" aria-label="Qué insertar">
                    {TIPOS.map((t) => <label key={t.id}><input type="radio" name="obsx-tipo" checked={cfg.tipo === t.id} onChange={() => set({ tipo: t.id })} /><b>{t.nombre}</b><span>{t.detalle}</span></label>)}
                  </div>
                  <small className="obsx-ayuda">Tableros (varios visores enlazados) llega en una fase posterior.</small>
                </div>
                {cfg.tipo !== "portada" && (
                  <label className="admin-field"><span>Tema</span>
                    <select value={cfg.tema} onChange={(e) => set({ tema: e.target.value })}>
                      {vivos.map((t) => <option key={t.slug} value={t.slug}>{t.nombre ?? t.slug}{t.status !== "publicado" ? " (borrador)" : ""}</option>)}
                    </select>
                  </label>
                )}
                {cfg.tipo === "seccion" && <label className="admin-field"><span>Sección</span><select value={cfg.seccion} onChange={(e) => set({ seccion: e.target.value as ObsSection })}>{SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}</select></label>}
                {cfg.tipo === "visor" && (
                  <label className="admin-field"><span>Visor</span>
                    <select value={cfg.visor} onChange={(e) => set({ visor: e.target.value })} disabled={visoresDelTema.length === 0}>
                      {visoresDelTema.length === 0 && <option value="">Este tema no tiene visores</option>}
                      {visoresDelTema.map((v) => <option key={v.id} value={v.id}>{v.title} · {v.type}</option>)}
                    </select>
                  </label>
                )}
                <label className="admin-field"><span>Nombre en el registro</span><input type="text" value={nombre} maxLength={120} onChange={(e) => { setNombreTocado(true); set({ nombre: e.target.value }); }} /><small className="obsx-ayuda">Solo lo ven quienes administran.</small></label>
              </>
            )}
            {pestana === "apariencia" && (
              <>
                <div className="admin-field"><span>Tamaño</span>
                  <Seg valor={opciones.altura === "auto" ? "auto" : "fijo"} opciones={[["auto", "Adaptable"], ["fijo", "Alto fijo"]] as const} etiqueta="Tamaño" onChange={(v) => setOp({ altura: v === "auto" ? "auto" : 480 })} />
                  {opciones.altura === "auto" ? <small className="obsx-ayuda">Ocupa el ancho disponible y el alto se ajusta solo con el script. Con iframe, el alto queda en 480 px.</small> : (
                    <label className="admin-field obsx-corto"><span>Alto (px)</span><input type="number" min={120} max={2000} value={opciones.altura} onChange={(e) => setOp({ altura: Number(e.target.value) || 120 })} /></label>
                  )}
                </div>
                <div className="admin-field"><span>Aspecto</span><Seg valor={opciones.aspecto} opciones={[["claro", "Claro"], ["oscuro", "Oscuro"], ["auto", "Automático"]] as const} etiqueta="Aspecto" onChange={(aspecto) => setOp({ aspecto })} /></div>
                <div className="admin-field"><span>Idioma</span><Seg<Idioma> valor={opciones.lang} opciones={[["es", "Español"], ["en", "English"], ["pt", "Português"]]} etiqueta="Idioma" onChange={(lang) => setOp({ lang })} /></div>
                <div className="admin-field"><span>Qué muestra</span>
                  <Interruptor texto="Título" valor={opciones.titulo} onChange={(titulo) => setOp({ titulo })} />
                  <Interruptor texto="Fuente y fecha del dato" valor={opciones.fuente} onChange={(fuente) => setOp({ fuente })} />
                  <Interruptor texto="Barra de herramientas" valor={opciones.barra} onChange={(barra) => setOp({ barra })} />
                  <Interruptor texto="Botón de descarga de datos (CSV)" valor={opciones.csv && opciones.barra} deshabilitado={!opciones.barra} onChange={(csv) => setOp({ csv })} />
                  <Interruptor texto="Enlace «Ver en el Observatorio»" valor={opciones.enlace} onChange={(enlace) => setOp({ enlace })} />
                  <small className="obsx-ayuda">Hoy título, fuente, barra y enlace se aplican en el marco; el CSV sigue a la barra.</small>
                </div>
              </>
            )}
            {pestana === "filtros" && (
              <>
                <p className="obsx-ayuda">Filtros con los que arranca el insertado. Se escriben en <code>data-filtros</code> (por ejemplo, <code>{escribirFiltros({ anio: "2025", campus: "Bucaramanga" })}</code>). El año y cualquier columna de texto de la tabla por su nombre.</p>
                <ul className="obsx-filtros">
                  {filtros.map(([k, v], i) => (
                    <li key={i}>
                      <input type="text" list="obsx-filtros-sug" value={k} placeholder="nombre (anio)" aria-label={`Nombre del filtro ${i + 1}`} onChange={(e) => setFiltros(filtros.map((f, j) => (j === i ? [e.target.value, f[1]] : f)))} />
                      <input type="text" value={v} placeholder="valor (2025)" aria-label={`Valor del filtro ${i + 1}`} maxLength={80} onChange={(e) => setFiltros(filtros.map((f, j) => (j === i ? [f[0], e.target.value] : f)))} />
                      <button type="button" className="icon-button" onClick={() => setFiltros(filtros.filter((_, j) => j !== i))} aria-label={`Quitar el filtro ${i + 1}`}><Ico name="x" /></button>
                    </li>
                  ))}
                </ul>
                <datalist id="obsx-filtros-sug"><option value="anio" /><option value="campus" /><option value="facultad" /><option value="programa" /></datalist>
                <button type="button" className="button-secondary obsx-pequeno" disabled={filtros.length >= 8} onClick={() => setFiltros([...filtros, ["", ""]])}><Icon name="plus" size={15} /> Agregar filtro</button>
                {problemas.map((p) => <p key={p} className="obsx-error" role="alert">{p}</p>)}
                <div className="admin-field"><span>Qué puede hacer quien visita</span>
                  <Interruptor texto="Cambiar los filtros" valor={false} deshabilitado onChange={() => undefined} />
                  <Interruptor texto="Resaltar al pasar el cursor" valor={false} deshabilitado onChange={() => undefined} />
                  <Interruptor texto="Filtrar entre visores (clic en una barra)" valor={false} deshabilitado onChange={() => undefined} />
                  <Interruptor texto="Mostrar detalle al pasar el cursor" valor={false} deshabilitado onChange={() => undefined} />
                  <small className="obsx-ayuda">Se activan con la fase de tableros; el marco de hoy muestra el contenido tal como está publicado.</small>
                </div>
              </>
            )}
            {pestana === "seguridad" && (
              <>
                <div className="obsx-regla"><Icon name="shield" size={20} /><p><b>Solo datos publicados y agregados.</b> Nunca borradores ni registros de personas. Los grupos de menos de 5 se muestran como «&lt; 5». Si el contenido se despublica, el insertado muestra un aviso.</p></div>
                <div className="admin-field"><span>Quién puede verlo</span>
                  <Seg valor={cfg.acceso} opciones={[["publico", "Cualquiera con la página"], ["clave", "Solo con la clave"]] as const} etiqueta="Quién puede verlo" onChange={(acceso) => set({ acceso, clave: acceso === "clave" && !cfg.clave ? claveNueva() : cfg.clave, quitarClave: acceso === "publico" && Boolean(actual?.con_clave) })} />
                  {cfg.acceso === "clave" && (
                    <>
                      <div className="obsx-agregar">
                        <label className="admin-field"><span>Clave</span><input type="text" value={cfg.clave} maxLength={64} placeholder={actual?.con_clave ? "Ya tiene clave: escribe otra para cambiarla" : ""} onChange={(e) => set({ clave: e.target.value })} /></label>
                        <button type="button" className="button-secondary" onClick={() => set({ clave: claveNueva() })}><Ico name="refresh" /> Otra</button>
                      </div>
                      <p className="obsx-aviso"><Icon name="alert" size={16} /> <span><b>La clave no es un secreto.</b> Va dentro del código que se pega: quien lo copie la tiene. Sirve para que el insertado no aparezca por descuido en otra página, no para proteger información sensible.</span></p>
                    </>
                  )}
                </div>
                <label className="admin-field"><span>Vencimiento</span>
                  <div className="obsx-agregar">
                    <input type="date" value={cfg.vence} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ vence: e.target.value })} />
                    <button type="button" className="button-secondary obsx-pequeno" onClick={() => set({ vence: dias(30) })}>30 días</button>
                    <button type="button" className="button-secondary obsx-pequeno" onClick={() => set({ vence: dias(90) })}>90 días</button>
                    <button type="button" className="button-secondary obsx-pequeno" onClick={() => set({ vence: "" })}>Sin vencimiento</button>
                  </div>
                </label>
                <div className="admin-field"><span>Dominios autorizados de «{obs.nombre}»</span>
                  <ul className="obsx-fichas">
                    <li>*.udes.edu.co · automático</li>
                    {dominios.filter((d) => !d.automatico).map((d) => <li key={d.id} data-estado={d.estado}>{d.host} · {d.estado}</li>)}
                  </ul>
                  <div className="obsx-agregar">
                    <input type="text" value={dominioNuevo} placeholder="www.ejemplo.edu.co o *.ejemplo.edu.co" aria-label="Dominio nuevo" onChange={(e) => setDominioNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void proponerDominio(); } }} />
                    <button type="button" className="button-secondary" onClick={() => void proponerDominio()} disabled={proponer.isPending}>Proponer</button>
                  </div>
                  {errorDominio && <small className="obsx-error" role="alert">{errorDominio}</small>}
                  <small className="obsx-ayuda">Vale para todos los insertados del observatorio. {puedeAprobar ? "Tú apruebas los externos en la pestaña Dominios." : "Quien administra aprueba los externos."} En otro dominio, el visitante ve un aviso en lugar del dato.</small>
                  {puedeAprobar && <button type="button" className="button-secondary obsx-pequeno" onClick={() => { irADominios(); }}>Gestionar dominios</button>}
                </div>
                <div className="admin-field"><span>Revocar</span><p className="obsx-ayuda">Se hace desde el registro de insertados: el código deja de mostrar datos al instante.</p></div>
              </>
            )}
          </div>
        </div>

        <div className="obsx-editor__derecha">
          <Previa obs={obs} cfg={cfg} nombre={nombre} opciones={opciones} dominios={dominios} />
          <Codigo datos={datos} actual={actual} clave={clave} />
        </div>
      </div>
    </Dialogo>
  );
}

const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function Interruptor({ texto, valor, onChange, deshabilitado }: { texto: string; valor: boolean; onChange: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <label className="obsx-interruptor">
      <input type="checkbox" checked={valor} disabled={deshabilitado} onChange={(e) => onChange(e.target.checked)} />
      <span className="obsx-pista" /> <span>{texto}</span>
    </label>
  );
}

/* --- Vista previa -------------------------------------------------------------------- */

function Previa({ obs, cfg, nombre, opciones, dominios }: { obs: Observatorio; cfg: Cfg; nombre: string; opciones: OpcionesInsertado; dominios: Dominio[] }) {
  const [modo, setModo] = useState<"iso" | "pagina">("iso");
  const [aparato, setAparato] = useState<"escritorio" | "tableta" | "telefono">("escritorio");
  const [sim, setSim] = useState("ok");
  const hosts = useMemo(() => ["ingenieria.udes.edu.co", ...dominios.filter((d) => d.estado === "aprobado" && !d.automatico && !d.host.startsWith("*")).map((d) => d.host), "sitio-no-autorizado.org"], [dominios]);
  const [host, setHost] = useState(hosts[0]);
  const ancho = { escritorio: null, tableta: 768, telefono: 375 }[aparato];
  const lang = opciones.lang;
  const config = useMemo<ConfigPrevia>(
    () => ({ obs: obs.id, nombre, tipo: cfg.tipo, tema: cfg.tipo === "portada" ? null : cfg.tema, seccion: cfg.tipo === "seccion" ? cfg.seccion : null, visor: cfg.tipo === "visor" ? cfg.visor : null, opciones }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opciones cambia de identidad en cada letra; la clave de texto la estabiliza
    [obs.id, nombre, cfg.tipo, cfg.tema, cfg.seccion, cfg.visor, JSON.stringify(opciones)],
  );
  const noAutorizado = modo === "pagina" && sim === "ok" && !hostPermitido(host, dominios);
  const estado = noAutorizado ? "dominio" : sim;
  const cuerpo = estado === "ok" ? <MarcoReal config={config} ancho={ancho} aspecto={opciones.aspecto} /> : <Simulado estado={estado} lang={lang} ancho={ancho} aspecto={opciones.aspecto} />;
  return (
    <section className="obsx-previa" aria-label="Vista previa">
      <div className="obsx-previa__barra">
        <Seg valor={modo} opciones={[["iso", "Insertado"], ["pagina", "En una página de ejemplo"]] as const} etiqueta="Modo de vista previa" onChange={setModo} />
        <Seg valor={aparato} opciones={[["escritorio", "Escritorio"], ["tableta", "Tableta"], ["telefono", "Teléfono"]] as const} etiqueta="Ancho del dispositivo" onChange={setAparato} />
        {modo === "pagina" && <select value={host} onChange={(e) => setHost(e.target.value)} aria-label="Dominio de la página de ejemplo">{hosts.map((h) => <option key={h}>{h}</option>)}</select>}
        <select value={sim} onChange={(e) => setSim(e.target.value)} aria-label="Simular un estado">{SIMULACIONES.map(([v, t]) => <option key={v} value={v}>{v === "ok" ? t : `Simular: ${t.toLowerCase()}`}</option>)}</select>
      </div>
      <div className="obsx-previa__escena">
        {modo === "iso" ? cuerpo : (
          <div className="obsx-navegador">
            <div className="obsx-navegador__barra"><Icon name="lock" size={13} /><span>https://{host}/facultad/cifras</span></div>
            <div className="obsx-navegador__pagina">
              <h3>Cifras de la facultad</h3>
              <p>Aquí va el texto que escribe la dependencia: una introducción breve sobre los datos que siguen y cómo leerlos.</p>
              <div className="obsx-navegador__bloque">{cuerpo}</div>
              <p>El resto de la página sigue su curso. El insertado ocupa solo su bloque y no cambia los estilos de la página.</p>
            </div>
          </div>
        )}
      </div>
      <p className="obsx-ayuda">
        {sim === "ok" ? (noAutorizado ? `«${host}» no está autorizado: así lo verían allí.` : "Es el marco real en modo de vista previa: no cuenta vistas y muestra solo lo publicado.") : "Estado simulado: así se vería el aviso. El tamaño y el aspecto son los de tus opciones."}
      </p>
    </section>
  );
}

function MarcoReal({ config, ancho, aspecto }: { config: ConfigPrevia; ancho: number | null; aspecto: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [listo, setListo] = useState(false);
  const [alto, setAlto] = useState(300);
  const texto = JSON.stringify(config);
  useEffect(() => {
    const alRecibir = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.origin !== window.location.origin) return;
      const m = e.data as { fuente?: string; tipo?: string; alto?: number } | null;
      if (m?.fuente === "obs-previa" && m.tipo === "listo") setListo(true);
      if (m?.fuente === "obs-embed" && m.tipo === "alto" && Number.isFinite(m.alto)) setAlto(Math.max(120, Math.min(2000, Number(m.alto))));
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, []);
  useEffect(() => {
    if (!listo) return;
    const t = window.setTimeout(() => ref.current?.contentWindow?.postMessage({ fuente: "obs-previa", tipo: "config", config: JSON.parse(texto) }, window.location.origin), 200);
    return () => window.clearTimeout(t);
  }, [listo, texto]);
  return (
    <div className="obsx-caja-embed" data-aspecto={aspecto} style={{ width: ancho ?? "100%" }}>
      <iframe ref={ref} title="Vista previa del insertado" src="/obs-embed?previa=1&origen=%40vista-previa" style={{ height: typeof config.opciones.altura === "number" ? config.opciones.altura : alto }} />
    </div>
  );
}

function Simulado({ estado, lang, ancho, aspecto }: { estado: string; lang: Idioma; ancho: number | null; aspecto: string }) {
  const texto = estado === "cargando" ? textoEmbed(lang, "cargando") : estado === "vacio" ? "Los filtros no dejan ninguna fila para mostrar." : textoEmbed(lang, estado as EstadoEmbed);
  return (
    <div className="obsx-caja-embed" data-aspecto={aspecto} style={{ width: ancho ?? "100%" }}>
      <p className="obsx-simulado" role={estado === "cargando" ? "status" : "alert"} data-estado={estado}>{estado === "cargando" && <span className="obsx-giro" aria-hidden="true" />}{texto}</p>
    </div>
  );
}

/* --- Código para pegar ------------------------------------------------------------------ */

function Codigo({ datos, actual, clave }: { datos: DatosCodigo; actual: Insertado | null; clave?: string }) {
  const [pestana, setPestana] = useState<"script" | "iframe" | "enlace" | "plataformas">("script");
  const [plataforma, setPlataforma] = useState("wordpress");
  const portal = window.location.origin;
  const todas = [...PLATAFORMAS.map((p) => ({ ...p, formato: POR_PLATAFORMA[p.id] ?? ("script" as FormatoCodigo) })), ...EXTRAS];
  const p = todas.find((x) => x.id === plataforma) ?? todas[0];
  const formato: FormatoCodigo = pestana === "plataformas" ? p.formato : pestana;
  const codigo = generarCodigo(portal, datos, formato);
  const pestanas: ["script" | "iframe" | "enlace" | "plataformas", string][] = [["script", "Script de una línea"], ["iframe", "Iframe"], ["enlace", "Enlace"], ["plataformas", "WordPress, SharePoint, Moodle…"]];
  return (
    <section className="obsx-codigo-caja" aria-label="Código para pegar">
      <div className="obsx-pestanas" role="tablist" aria-label="Formato del código">
        {pestanas.map(([id, t]) => <button key={id} type="button" role="tab" aria-selected={pestana === id} tabIndex={pestana === id ? 0 : -1} onClick={() => setPestana(id)}>{t}</button>)}
      </div>
      <div role="tabpanel" className="obsx-codigo-cuerpo">
        {pestana === "plataformas" && (
          <>
            <div className="obsx-fichas obsx-fichas--botones" role="group" aria-label="Plataforma">
              {todas.map((x) => <button key={x.id} type="button" aria-pressed={plataforma === x.id} onClick={() => setPlataforma(x.id)}>{x.nombre}</button>)}
            </div>
            <p className="obsx-texto">{p.pasos}</p>
            <p className="obsx-ayuda">Cada sitio puede tener reglas propias: prueba en una página de borrador.</p>
          </>
        )}
        {pestana === "script" && <p className="obsx-ayuda">Pégalo donde quieras que aparezca. El cargador crea un marco aislado y ajusta su alto.</p>}
        {pestana === "iframe" && <p className="obsx-ayuda">Sin script. {datos.opciones.altura === "auto" ? "El alto queda fijo en 480 px; para alto automático usa el script." : `Alto fijo de ${datos.opciones.altura} px.`}</p>}
        {pestana === "enlace" && <p className="obsx-ayuda">Para correos, redes o documentos: se abre solo el contenido, sin menú del portal. Respeta vencimiento y clave.</p>}
        <div className="obsx-linea-codigo">
          <pre tabIndex={0} aria-label="Código generado">{codigo}</pre>
          <BotonCopiar texto={codigo} pequeno deshabilitado={!actual} />
        </div>
        {!actual && <p className="obsx-ayuda">El código definitivo se asigna al guardar; copiarlo antes daría uno de relleno.</p>}
        {actual?.con_clave && !clave && <p className="obsx-aviso"><Icon name="alert" size={16} /> <span>Este insertado tiene clave y no se puede leer de nuevo. Añade <code>data-clave="…"</code> (o <code>&amp;clave=…</code> en el enlace) con la que definiste.</span></p>}
        {clave && <Chip tono="warn" icono={<Icon name="key" size={13} />}>La clave va dentro del código</Chip>}
      </div>
    </section>
  );
}

export type { ObsView };
