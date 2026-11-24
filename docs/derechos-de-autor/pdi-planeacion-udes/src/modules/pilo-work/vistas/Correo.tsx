/* =============================================================================
   Correo · lector de SOLO LECTURA de Outlook, con «Resumir con Pilo».

   Carpetas (Bandeja de entrada, Elementos enviados, Archivo) y filtros (Sin leer, Hoy,
   Con adjuntos), lista paginada y panel de lectura con el cuerpo saneado (HTML con lista
   blanca; imágenes remotas bloqueadas hasta que la persona lo pida; enlaces en pestaña
   nueva). Los adjuntos se descargan solo con clic y hasta 8 MB. Nunca se envía ni se borra:
   la única escritura es un BORRADOR de respuesta que la persona aprueba con su clic.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callFn, callWork, hace } from "../api";
import { tamanoLegible } from "../archivos";
import { conectarMs, useMs } from "../ms";
import { sanearHtml } from "../sanear";
import { IC, MOOD, Seg, Tg, useEntra, useWork } from "../ui";

interface Msg {
  id: string;
  asunto: string;
  de: string;
  correo: string;
  para: string[];
  fecha: string;
  vista: string;
  leido: boolean;
  categorias: string[];
  adjuntos: boolean;
  conversacion: string;
}
interface Persona {
  nombre: string;
  correo: string;
}
interface Completo {
  id: string;
  asunto: string;
  de: Persona;
  para: Persona[];
  cc: Persona[];
  fecha: string;
  texto: string;
  html: string;
  adjuntos: { id: string; nombre: string; tamano: number; tipo: string }[];
  enlace: string;
  conversacion: string;
}
interface Resumen {
  resumen: string;
  acuerdos: { texto: string; responsable: string; fecha: string }[];
  responder: boolean;
  borrador: string;
}
type Carpeta = "inbox" | "sentitems" | "archive";
type Filtro = "todos" | "no_leidos" | "hoy" | "adjuntos";
const PAGINA = 20;

const fechaLarga = (f: string) => new Date(f).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Correo() {
  const { conCorreo, toast, setPedido, ir } = useWork();
  const ms = useMs();
  const [carpeta, setCarpeta] = useState<Carpeta>("inbox");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [lista, setLista] = useState<Msg[]>([]);
  const [mas, setMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [completo, setCompleto] = useState<Completo | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLeer, setErrorLeer] = useState("");
  const [imagenes, setImagenes] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resumiendo, setResumiendo] = useState(false);
  const [hilo, setHilo] = useState(false);
  const [errorResumen, setErrorResumen] = useState("");
  const [borrador, setBorrador] = useState<string | null>(null);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [deshacer, setDeshacer] = useState<unknown[] | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pw-deshacer-correo") ?? "null");
    } catch {
      return null;
    }
  });
  const [ocupado, setOcupado] = useState(false);
  const raiz = useEntra(".mail", `${carpeta}|${filtro}|${lista.length}`, 6);
  const seq = useRef(0);

  const cargar = useCallback(
    async (mas_ = false) => {
      const mi = ++seq.current;
      setCargando(true);
      setError("");
      try {
        const r = await callFn<{ mensajes: Msg[]; mas: boolean }>("pw-microsoft", { action: "correo_listar", carpeta, filtro: filtro === "todos" ? undefined : filtro, top: PAGINA, skip: mas_ ? lista.length : 0 });
        if (mi !== seq.current) return;
        setLista((l) => (mas_ ? [...l, ...r.mensajes.filter((m) => !l.some((x) => x.id === m.id))] : r.mensajes));
        setMas(r.mas);
      } catch (e) {
        if (mi !== seq.current) return;
        setError(e instanceof Error ? e.message : "No se pudo leer la bandeja.");
      }
      if (mi === seq.current) setCargando(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lista.length solo cuenta para «mostrar más»
    [carpeta, filtro],
  );
  useEffect(() => {
    setAbierto(null);
    if (ms.correoListo) void cargar();
  }, [ms.correoListo, cargar]);

  /* Abrir un mensaje: se lee entero (texto, HTML y adjuntos). */
  useEffect(() => {
    setCompleto(null);
    setResumen(null);
    setBorrador(null);
    setErrorLeer("");
    setErrorResumen("");
    setImagenes(false);
    setHilo(false);
    if (!abierto) return;
    let vivo = true;
    setLeyendo(true);
    callFn<Completo>("pw-microsoft", { action: "correo_leer", id: abierto })
      .then((r) => vivo && setCompleto(r))
      .catch((e) => vivo && setErrorLeer(e instanceof Error ? e.message : "No se pudo leer el mensaje."))
      .finally(() => vivo && setLeyendo(false));
    return () => {
      vivo = false;
    };
  }, [abierto]);

  const seguro = useMemo(() => (completo?.html ? sanearHtml(completo.html, { imagenes }) : null), [completo, imagenes]);

  const resumir = async () => {
    if (!completo) return;
    setResumiendo(true);
    setErrorResumen("");
    setResumen(null);
    setBorrador(null);
    try {
      let mensajes = [{ de: completo.de.nombre || completo.de.correo, fecha: completo.fecha, texto: completo.texto }];
      if (hilo) {
        const h = await callFn<{ mensajes: { de: string; fecha: string; texto: string }[] }>("pw-microsoft", { action: "correo_hilo", id: completo.id });
        if (h.mensajes.length) mensajes = h.mensajes;
      }
      setResumen(await callWork<Resumen>({ action: "resumir_correo", asunto: completo.asunto, mensajes }));
    } catch (e) {
      setErrorResumen(e instanceof Error ? e.message : "No se pudo resumir.");
    }
    setResumiendo(false);
  };
  const guardarBorrador = async () => {
    if (!completo || !borrador?.trim()) return;
    setGuardandoBorrador(true);
    try {
      await callFn("pw-microsoft", { action: "correo_borrador", responder_a: completo.id, cuerpo: borrador });
      toast("Borrador guardado en Outlook. No se envió.");
      setBorrador(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar el borrador.");
    }
    setGuardandoBorrador(false);
  };
  const descargar = async (a: Completo["adjuntos"][number]) => {
    if (!completo) return;
    if (a.tamano > 8 * 1024 * 1024) return toast("Ese adjunto pesa más de 8 MB. Ábralo en Outlook.");
    try {
      const r = await callFn<{ nombre: string; tipo: string; b64: string }>("pw-microsoft", { action: "correo_adjunto", id: completo.id, adjunto: a.id }, { timeoutMs: 60_000 });
      const bin = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin], { type: r.tipo || "application/octet-stream" }));
      const el = document.createElement("a");
      el.href = url;
      el.download = r.nombre;
      el.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo descargar.");
    }
  };
  const deshacerTodo = async () => {
    if (!deshacer) return;
    try {
      await callFn("pw-microsoft", { action: "correo_deshacer", deshacer });
      setDeshacer(null);
      sessionStorage.removeItem("pw-deshacer-correo");
      toast("Se deshizo la organización");
      void cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo deshacer.");
    }
  };

  if (!conCorreo)
    return (
      <div className="pad">
        <div className="box" style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2>Su rol no incluye el correo</h2>
          <p className="muted">El correo de Microsoft 365 lo activa la administración con el rol «Colaborador con correo». Pídalo si lo necesita.</p>
        </div>
      </div>
    );

  if (!ms.correoListo)
    return (
      <div className="pad">
        <div className="box" style={{ maxWidth: 640, margin: "0 auto" }}>
          <div className="pilo-big" style={{ width: 96, height: 96 }}>
            <img src={MOOD.idea} alt="" />
          </div>
          <h2>Conecte su correo de Microsoft 365</h2>
          <p className="muted">
            Podrá leer su bandeja y pedir resúmenes. Pilo puede dejar borradores y proponer etiquetas. <b>Nunca envía ni borra</b> mensajes por usted.
          </p>
          <ul className="flat">
            <li className="item"><span className="ico">{IC.mail}</span><div><b>Leer su correo</b><p>Mail.Read · para leer y resumir</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.plug}</span><div><b>Borradores y etiquetas</b><p>Mail.ReadWrite · usted aprueba cada cambio</p></div><Tg on={true} onChange={() => undefined} label="Permitir borradores y etiquetas" /></li>
            <li className="item"><span className="ico" style={{ background: "var(--risk-soft)", color: "var(--risk)" }}>{IC.lock}</span><div><b>Enviar o borrar</b><p>Mail.Send no se solicita. No es posible.</p></div><span className="badge">Nunca</span></li>
          </ul>
          {!ms.configurado && <p className="err">Microsoft 365 aún no está configurado por TIC.</p>}
          {ms.error && ms.configurado && <p className="err">{ms.error}</p>}
          <button
            type="button"
            className="btn navy"
            disabled={ocupado || !ms.configurado}
            onClick={async () => {
              setOcupado(true);
              try {
                await conectarMs(["correo", "agenda"], true);
              } catch (e) {
                toast(e instanceof Error ? e.message : "No se pudo abrir Microsoft.");
                setOcupado(false);
              }
            }}
          >
            {ocupado ? "Esperando a Microsoft…" : "Conectar con Microsoft"}
          </button>
        </div>
      </div>
    );

  const nombreCarpeta = { inbox: "Bandeja de entrada", sentitems: "Elementos enviados", archive: "Archivo" }[carpeta];
  return (
    <div className="cr" ref={raiz}>
      <section className="cr__l" aria-label="Mensajes">
        <div className="cr__bar">
          <Seg etiqueta="Carpeta" valor={carpeta} onChange={setCarpeta} opciones={[["inbox", "Entrada"], ["sentitems", "Enviados"], ["archive", "Archivo"]]} />
          <Seg etiqueta="Filtro" valor={filtro} onChange={setFiltro} opciones={[["todos", "Todos"], ["no_leidos", "Sin leer"], ["hoy", "Hoy"], ["adjuntos", "Con adjuntos"]]} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn sm" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? "Leyendo…" : "Actualizar"}
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setPedido("Cuente cuántos correos llegaron hoy y resuma los que piden una acción mía. No cree ni envíe nada.");
                ir("chat");
              }}
            >
              Pedir a Pilo el resumen del día
            </button>
            {deshacer && (
              <button type="button" className="btn sm" onClick={() => void deshacerTodo()}>
                Deshacer la última organización
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="err" role="alert">
            {error}{" "}
            <button type="button" className="btn sm" onClick={() => void cargar()}>Reintentar</button>
          </p>
        )}
        <h2 className="sr">{nombreCarpeta}</h2>
        <ul className="cr__lst">
          {lista.map((m) => (
            <li key={m.id}>
              <button type="button" className="mail" aria-current={abierto === m.id ? "true" : undefined} onClick={() => setAbierto(m.id)}>
                <span className="avatar" style={{ background: "var(--blue-soft)", color: "var(--blue-strong)" }} aria-hidden="true">
                  {(carpeta === "sentitems" ? (m.para[0] ?? "?") : m.de).charAt(0).toUpperCase()}
                </span>
                <span className="mail__c">
                  <b style={{ fontWeight: m.leido ? 600 : 800 }}>{m.asunto}</b>
                  <span className="small muted">
                    {carpeta === "sentitems" ? `Para ${m.para.join(", ") || "—"}` : m.de} · {hace(m.fecha)}
                    {m.adjuntos ? " · con adjuntos" : ""}
                  </span>
                  <span className="mail__v">{m.vista}</span>
                </span>
                {!m.leido && <span className="mail__dot" aria-label="Sin leer" />}
              </button>
            </li>
          ))}
        </ul>
        {!lista.length && !cargando && !error && <p className="muted small" style={{ padding: 12 }}>No hay mensajes para mostrar con este filtro.</p>}
        {mas && (
          <button type="button" className="btn sm" onClick={() => void cargar(true)} disabled={cargando} style={{ margin: 10 }}>
            {cargando ? "Leyendo…" : "Mostrar más"}
          </button>
        )}
      </section>

      <section className="cr__r" aria-label="Lectura">
        {!abierto && (
          <div className="cr__vacio">
            <img src={MOOD.bien} alt="" width={72} height={72} />
            <p className="muted">Elija un mensaje para leerlo. Todo es de solo lectura.</p>
          </div>
        )}
        {abierto && leyendo && <p className="muted pad" role="status">Leyendo el mensaje…</p>}
        {abierto && errorLeer && (
          <p className="err pad" role="alert">
            {errorLeer}{" "}
            <button type="button" className="btn sm" onClick={() => setAbierto(abierto + "")}>Reintentar</button>
          </p>
        )}
        {completo && (
          <article className="cr__msg">
            <header>
              <h2>{completo.asunto}</h2>
              <p className="small">
                <b>{completo.de.nombre || completo.de.correo}</b> <span className="muted">&lt;{completo.de.correo}&gt;</span>
              </p>
              <p className="small muted">
                Para {completo.para.map((p) => p.nombre || p.correo).slice(0, 4).join(", ")}
                {completo.para.length > 4 ? ` y ${completo.para.length - 4} más` : ""} · {fechaLarga(completo.fecha)}
              </p>
              <div className="cr__acts">
                <button type="button" className="btn sm primary" onClick={() => void resumir()} disabled={resumiendo}>
                  {resumiendo ? "Resumiendo…" : "Resumir con Pilo"}
                </button>
                <label className="chk" style={{ alignItems: "center" }}>
                  <input type="checkbox" checked={hilo} onChange={(e) => setHilo(e.target.checked)} />
                  <span>Incluir toda la conversación</span>
                </label>
                {completo.enlace && (
                  <a className="btn sm" href={completo.enlace} target="_blank" rel="noopener noreferrer">
                    Abrir en Outlook
                  </a>
                )}
              </div>
            </header>
            {errorResumen && (
              <p className="err" role="alert">
                {errorResumen}{" "}
                <button type="button" className="btn sm" onClick={() => void resumir()}>Reintentar</button>
              </p>
            )}
            {resumen && (
              <section className="cr__res" aria-label="Resumen de Pilo">
                <h3>Resumen</h3>
                <p>{resumen.resumen}</p>
                {resumen.acuerdos.length > 0 && (
                  <>
                    <h3>Acuerdos y pendientes</h3>
                    <ul>
                      {resumen.acuerdos.map((a, i) => (
                        <li key={i}>
                          {a.texto}
                          {(a.responsable || a.fecha) && <span className="muted"> · {[a.responsable, a.fecha].filter(Boolean).join(" · ")}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {resumen.responder && resumen.borrador && borrador === null && (
                  <button type="button" className="btn sm" onClick={() => setBorrador(resumen.borrador)}>
                    Preparar borrador de respuesta
                  </button>
                )}
                {borrador !== null && (
                  <div className="apr" role="group" aria-label="Borrador de respuesta">
                    <b>Borrador de respuesta</b>
                    <textarea className="inp" rows={6} value={borrador} onChange={(e) => setBorrador(e.target.value)} style={{ padding: 10 }} aria-label="Texto del borrador" />
                    <p className="small muted">Al aprobar, se guarda en la carpeta Borradores de su Outlook. No se envía: usted lo revisa y lo envía.</p>
                    <div className="acts">
                      <button type="button" className="btn sm primary" onClick={() => void guardarBorrador()} disabled={guardandoBorrador || !borrador.trim()}>
                        {guardandoBorrador ? "Guardando…" : "Crear borrador en Outlook"}
                      </button>
                      <button type="button" className="btn sm" onClick={() => setBorrador(null)}>
                        Descartar
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            {completo.adjuntos.length > 0 && (
              <section aria-label="Adjuntos">
                <h3 className="ag-h">Adjuntos ({completo.adjuntos.length})</h3>
                <ul className="cr__adj">
                  {completo.adjuntos.map((a) => (
                    <li key={a.id}>
                      <span className="ico">{IC.file}</span>
                      <span className="cr__an">{a.nombre}</span>
                      <span className="small muted num">{tamanoLegible(a.tamano)}</span>
                      <button type="button" className="btn sm" onClick={() => void descargar(a)}>
                        Descargar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {seguro && seguro.bloqueadas > 0 && !imagenes && (
              <p className="cr__img">
                Se bloquearon {seguro.bloqueadas} imagen{seguro.bloqueadas === 1 ? "" : "es"} remota{seguro.bloqueadas === 1 ? "" : "s"} para proteger su privacidad.{" "}
                <button type="button" className="btn sm" onClick={() => setImagenes(true)}>
                  Mostrar imágenes
                </button>
              </p>
            )}
            {seguro ? <div className="cr__cuerpo" dangerouslySetInnerHTML={{ __html: seguro.html }} /> : <pre className="cr__cuerpo cr__txt">{completo.texto}</pre>}
          </article>
        )}
      </section>
    </div>
  );
}
