/* =============================================================================
   Firma de convenios · la página pública del firmante (/firma/:token).

   Recorrido (el aprobado en el diseño): consentimiento → código de verificación que llegó en el
   correo de solicitud → documento (pdf.js) → «Su firma» (dibujar, certificado o móvil) → barra
   inferior «Finalizar y enviar» → un solo momento coreografiado: el trazo se asienta y el QR de
   validación se compone → ventana con el correo y el certificado de trazabilidad.
   Todo habla con la función conv-firma (CONTRATO.md); sin sesión del portal, solo el token del enlace.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import gsap from "gsap";
import { ErrorFirma, publica } from "./api";
import type { RespAbrir, RespFirmar, RespVerificarCodigo } from "./api";
import { BarraPortal, fechaHora, guardarLengua, Ic, lenguaInicial, mmss, movimientoReducido, Qr, usePaginaPrivada, Ventana } from "./comunes";
import { TEXTOS, NORMAS_CO, NORMAS_INT, NORMAS_PAIS } from "./textos";
import type { Lengua, Textos } from "./textos";
import { VentanaFirma } from "./VentanaFirma";
import type { Adopcion } from "./VentanaFirma";
import { VisorPdf } from "./VisorPdf";
import "./firma.css";

type Carga = { fase: "cargando" } | { fase: "error"; code: string; extra: Record<string, unknown> } | { fase: "ok" };

const clave = (token: string) => `conv-firma-ses-${token.slice(0, 16)}`;
const leerSesion = (token: string) => {
  try {
    return window.sessionStorage.getItem(clave(token));
  } catch {
    return null;
  }
};
const guardarSesion = (token: string, s: string | null) => {
  try {
    if (s) window.sessionStorage.setItem(clave(token), s);
    else window.sessionStorage.removeItem(clave(token));
  } catch {
    /* sin almacenamiento */
  }
};

function navegador() {
  const u = navigator.userAgent || "";
  const b = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Navegador";
  const s = /Windows/.test(u) ? "Windows" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Mac/.test(u) ? "macOS" : /Linux/.test(u) ? "Linux" : "";
  return s ? `${b} · ${s}` : b;
}

function EstadoPagina({ l, t, onLengua, icono, titulo, texto, extra, accion }: { l: Lengua; t: Textos; onLengua: (l: Lengua) => void; icono: string; titulo: string; texto: string; extra?: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="fm">
      <BarraPortal l={l} t={t} onLengua={onLengua} />
      <main className="fm-central">
        <section className="fm-estado" aria-live="polite">
          <span className="fm-estado__ic"><Ic n={icono} /></span>
          <h1>{titulo}</h1>
          <p>{texto}</p>
          {extra}
          {accion}
          <p className="fm-sub">{t.contacto}</p>
        </section>
      </main>
    </div>
  );
}

export function Firmante() {
  const { token = "" } = useParams();
  const [l, setL] = useState<Lengua>(() => lenguaInicial(navigator.language?.toLowerCase().startsWith("en") ? "en" : "es"));
  const t = TEXTOS[l];
  const cambiarLengua = (n: Lengua) => {
    setL(n);
    guardarLengua(n);
  };
  usePaginaPrivada(`${t.servicio} · UDES`);

  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [info, setInfo] = useState<RespAbrir | null>(null);
  const [consent, setConsent] = useState(false);
  const [sesion, setSesion] = useState<string | null>(null);
  const [huella, setHuella] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [leido, setLeido] = useState(false);
  const [adopcion, setAdopcion] = useState<Adopcion | null>(null);
  const [modal, setModal] = useState<null | "codigo" | "firma" | "exito">(null);
  const [exitoTab, setExitoTab] = useState<"correo" | "traza">("correo");
  const [firmando, setFirmando] = useState(false);
  const [errorFirma, setErrorFirma] = useState("");
  const [resultado, setResultado] = useState<RespFirmar | null>(null);
  const [aviso, setAviso] = useState("");
  const [pais, setPais] = useState("CO");
  const [esperaSello, setEsperaSello] = useState(false);

  const marcado = useRef(false);
  const eventos = useRef<{ abierto: Date; codigo?: Date; leido?: Date; adoptada?: Date }>({ abierto: new Date() });
  const refImg = useRef<HTMLImageElement>(null);
  const refBarra = useRef<HTMLDivElement>(null);
  const refQr = useRef<HTMLDivElement>(null);
  const refDatos = useRef<HTMLDListElement>(null);
  const refCampo = useRef<HTMLDivElement>(null);

  const mostrarAviso = useCallback((x: string) => {
    setAviso(x);
    window.setTimeout(() => setAviso((a) => (a === x ? "" : a)), 3600);
  }, []);

  /* ---------- abrir ---------- */
  const abrir = useCallback(async () => {
    setCarga({ fase: "cargando" });
    try {
      const r = await publica<RespAbrir>("abrir", { token });
      setInfo(r);
      setCarga({ fase: "ok" });
      if (r.falta === "firma") {
        setLeido(true);
        marcado.current = true;
      }
      // Reanuda la sesión si el navegador la guardó y el servidor la sigue dando por vigente.
      const guardada = leerSesion(token);
      if (r.sesion_vigente && guardada && r.estado_firmante !== "firmado") {
        try {
          const d = await publica<{ mensaje_firma: string; huella: string }>("documento", { token, sesion: guardada });
          setMensaje(d.mensaje_firma);
          setHuella(d.huella);
          setSesion(guardada);
          setConsent(true);
        } catch {
          guardarSesion(token, null);
        }
      }
    } catch (e) {
      const err = e instanceof ErrorFirma ? e : new ErrorFirma("error_interno", "", 500);
      setCarga({ fase: "error", code: err.code, extra: err.extra });
    }
  }, [token]);

  useEffect(() => {
    void abrir();
  }, [abrir]);

  // El idioma del correo manda la primera vez, salvo que la persona ya haya elegido.
  useEffect(() => {
    if (!info) return;
    try {
      if (!window.localStorage.getItem("conv-firma-lengua")) setL(info.idioma);
    } catch {
      setL(info.idioma);
    }
  }, [info]);

  /* ---------- documento ---------- */
  const pedirUrl = useCallback(async () => {
    if (!sesion) throw new ErrorFirma("sesion_invalida", "", 401);
    try {
      const d = await publica<{ url: string; mensaje_firma: string; huella: string }>("documento", { token, sesion });
      setMensaje(d.mensaje_firma);
      setHuella(d.huella);
      return d.url;
    } catch (e) {
      if (e instanceof ErrorFirma && (e.code === "sesion_vencida" || e.code === "sesion_invalida")) {
        guardarSesion(token, null);
        setSesion(null);
        setModal("codigo");
      }
      throw e;
    }
  }, [token, sesion]);

  const alFinLectura = useCallback(() => {
    setLeido(true);
    eventos.current.leido = new Date();
    if (marcado.current || !sesion) return;
    marcado.current = true;
    publica("marcar_leido", { token, sesion }).catch(() => {
      marcado.current = false;
    });
  }, [token, sesion]);

  /* ---------- animaciones ---------- */
  useLayoutEffect(() => {
    if (!adopcion || movimientoReducido()) return;
    if (refImg.current) gsap.fromTo(refImg.current, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.8, ease: "power2.inOut" });
    if (refBarra.current) gsap.from(refBarra.current, { y: 90, duration: 0.55, ease: "expo.out" });
  }, [adopcion]);

  // El único momento coreografiado: el trazo se asienta y el QR de validación se compone.
  useLayoutEffect(() => {
    if (!resultado) return;
    const abrirExito = () => setModal("exito");
    if (movimientoReducido() || !refQr.current) {
      abrirExito();
      return;
    }
    const dl = refDatos.current ? [...refDatos.current.children] : [];
    gsap.set([refQr.current, ...dl], { opacity: 0 });
    refCampo.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const tl = gsap.timeline({ delay: 0.15 });
    if (refImg.current) tl.fromTo(refImg.current, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.8, ease: "power2.inOut" });
    tl.fromTo(refQr.current, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.45, ease: "expo.out" }, "+=0.05");
    tl.to(dl, { opacity: 1, duration: 0.3, ease: "power2.out", stagger: 0.035 }, "-=0.3");
    tl.add(abrirExito, "+=0.25");
    return () => {
      tl.kill();
      gsap.set([refQr.current, ...dl], { clearProps: "opacity,transform" });
    };
  }, [resultado]);

  /* ---------- sellado: sondeo suave mientras faltan archivos ---------- */
  useEffect(() => {
    if (!resultado || resultado.pendientes > 0 || resultado.finalizado) return;
    let n = 0;
    const id = window.setInterval(async () => {
      n++;
      if (n === 12) setEsperaSello(true);
      try {
        const r = await publica<RespAbrir>("abrir", { token });
        setInfo(r);
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
      if (n >= 40) window.clearInterval(id);
    }, 5000);
    return () => window.clearInterval(id);
  }, [resultado, token]);

  /* ---------- finalizar ---------- */
  const finalizar = async () => {
    if (!adopcion || !sesion) return;
    if (!leido) {
      mostrarAviso(t.leerHasta);
      document.getElementById("fm-fin")?.scrollIntoView({ behavior: movimientoReducido() ? "auto" : "smooth", block: "end" });
      return;
    }
    setErrorFirma("");
    setFirmando(true);
    try {
      if (!marcado.current) {
        await publica("marcar_leido", { token, sesion });
        marcado.current = true;
      }
      const cuerpo: Record<string, unknown> = { token, sesion, metodo: adopcion.metodo, acepta: true, zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (adopcion.metodo === "dibujo") cuerpo.imagen = adopcion.imagen;
      if (adopcion.metodo === "certificado") cuerpo.certificado = adopcion.certificado;
      const r = await publica<RespFirmar>("firmar", cuerpo);
      guardarSesion(token, null);
      setResultado(r);
    } catch (e) {
      const err = e instanceof ErrorFirma ? e : new ErrorFirma("error_interno", "", 500);
      if (err.code === "sesion_vencida" || err.code === "sesion_invalida") {
        guardarSesion(token, null);
        setSesion(null);
        setModal("codigo");
      } else if (err.code === "ya_firmado") {
        void abrir();
      } else {
        setErrorFirma(err.code === "red" ? t.redD : err.message || t.errorGeneral);
      }
    } finally {
      setFirmando(false);
    }
  };

  /* ---------- pantallas de estado ---------- */
  if (carga.fase === "cargando") {
    return (
      <div className="fm">
        <BarraPortal l={l} t={t} onLengua={cambiarLengua} />
        <main className="fm-central"><div className="fm-cargando" role="status"><i />{t.cargando}</div></main>
      </div>
    );
  }
  if (carga.fase === "error") {
    const c = carga.code;
    const cod = typeof carga.extra.codigo_verificacion === "string" ? carga.extra.codigo_verificacion : "";
    const mapa: Record<string, [string, string, string]> = {
      enlace_vencido: ["reloj", t.vencidoT, t.vencidoD],
      solicitud_cancelada: ["alerta", t.canceladoT, t.canceladoD],
      ya_finalizada: ["ok", t.finalizadaT, t.finalizadaD],
      red: ["alerta", t.redT, t.redD],
    };
    const [ic, titulo, texto] = mapa[c] ?? ["alerta", t.invalidoT, t.invalidoD];
    return (
      <EstadoPagina
        l={l}
        t={t}
        onLengua={cambiarLengua}
        icono={ic}
        titulo={titulo}
        texto={texto}
        extra={cod ? <p className="fm-mono">{t.codigoVerificacion}: {cod}</p> : null}
        accion={
          c === "red" ? (
            <button type="button" className="fm-btn fm-btn--pri" onClick={() => void abrir()}>{t.reintentar}</button>
          ) : cod ? (
            <a className="fm-btn" href={`/verificar/${encodeURIComponent(cod)}`}>{t.verificarAqui}</a>
          ) : null
        }
      />
    );
  }
  if (!info) return null;

  const cod = info.codigo_verificacion;
  const acabado = !resultado && (info.estado_firma === "firmada" || info.estado_firmante === "firmado" || info.falta === "esperar_turno");
  if (acabado) {
    const [ic, titulo, texto] =
      info.estado_firma === "firmada" ? ["ok", t.finalizadaT, t.finalizadaD] : info.estado_firmante === "firmado" ? ["ok", t.yaFirmoT, t.yaFirmoD] : ["reloj", t.turnoT, t.turnoD];
    return (
      <EstadoPagina
        l={l}
        t={t}
        onLengua={cambiarLengua}
        icono={ic}
        titulo={titulo}
        texto={texto}
        extra={cod && info.estado_firmante === "firmado" ? <p className="fm-mono">{t.codigoVerificacion}: {cod}</p> : null}
        accion={cod && info.estado_firmante === "firmado" ? <a className="fm-btn" href={`/verificar/${encodeURIComponent(cod)}`}>{t.verificarAqui}</a> : null}
      />
    );
  }

  /* ---------- la página ---------- */
  const activo = Boolean(sesion);
  const final = Boolean(resultado);
  const idFirmante = resultado?.codigo_identidad ?? info.firmante.codigo_identidad;
  const urlVal = `${window.location.origin}/verificar/${encodeURIComponent(resultado?.codigo_verificacion ?? cod)}?h=${huella}&f=${idFirmante}`;
  const otros = info.firmantes.filter((p) => !(p.rol === info.firmante.rol && p.nombre === info.firmante.nombre));
  const faltan = otros.filter((p) => !p.firmado).map((p) => p.nombre);
  const nombreFirma = info.firmante.rol === "UDES" ? t.universidad : info.documento.institucion;

  const datos = (
    <dl className="fm-dl" ref={refDatos}>
      <dt>{t.etiquetaFirmante}</dt><dd>{info.firmante.nombre}</dd>
      <dt>{t.etiquetaCorreo}</dt><dd>{info.firmante.correo_enmascarado}</dd>
      <dt>{t.etiquetaIdentidad}</dt><dd className="fm-mono">{idFirmante}</dd>
      <dt>{t.etiquetaTipo}</dt><dd>{adopcion?.tipo}</dd>
      <dt>{t.etiquetaFecha}</dt><dd>{fechaHora(resultado?.firmado_en, l)}</dd>
      <dt>{t.etiquetaHuella}</dt><dd className="fm-mono">{huella.slice(0, 8)}…{huella.slice(-7)}</dd>
    </dl>
  );

  return (
    <div className="fm">
      <BarraPortal l={l} t={t} onLengua={cambiarLengua} contraparte={info.documento.institucion} vence={info.vence_en} />

      <div className="fm-accion">
        {!activo ? (
          <>
            <strong>{t.accion0}</strong>
            <span className="fm-grow" />
            <label className="fm-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              {t.consentimiento}
            </label>
            <button type="button" className="fm-btn fm-btn--pri" disabled={!consent} onClick={() => setModal("codigo")}>{t.continuar}</button>
          </>
        ) : final ? (
          <>
            <span className="fm-pill fm-pill--ok"><Ic n="ok" />{resultado!.pendientes === 0 ? t.gracias : t.graciasFalta}</span>
            <span className="fm-grow" />
            <button type="button" className="fm-btn fm-btn--sm" onClick={() => { setExitoTab("traza"); setModal("exito"); }}>{t.verTraza}</button>
            <span className="fm-sub">{fechaHora(resultado!.firmado_en, l)}</span>
          </>
        ) : (
          <>
            <span className="fm-cuenta" aria-live="polite">{adopcion ? t.pendiente0 : t.pendiente}</span>
            {!leido && !adopcion ? <span className="fm-hint"><Ic n="flecha" />{t.leerHasta.split(" antes")[0]}</span> : leido ? <span className="fm-hint"><Ic n="ok" />{t.leido}</span> : null}
            <span className="fm-grow" />
            {!adopcion ? (
              <button type="button" className="fm-btn fm-btn--tag" onClick={() => { refCampo.current?.scrollIntoView({ block: "center", behavior: movimientoReducido() ? "auto" : "smooth" }); window.setTimeout(() => setModal("firma"), movimientoReducido() ? 0 : 350); }}>
                {t.comenzar}
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className={`fm-escena${adopcion && !final ? " fm-escena--barra" : ""}`}>
        <div className="fm-hojas" style={{ position: "relative" }}>
          {l === "en" ? <p className="fm-nota"><Ic n="archivo" /><span><b>{t.traduccionT}.</b> {t.traduccionD}</span></p> : null}
          {activo ? (
            <VisorPdf pedirUrl={pedirUrl} t={t} onFin={alFinLectura} />
          ) : (
            <div style={{ position: "relative", minHeight: 520 }}>
              <div className="fm-hoja" style={{ minHeight: 520 }} aria-hidden="true" />
              <div className="fm-bloq">
                <div><Ic n="candado" /><p style={{ margin: "6px 0 0" }}>{t.bloqueo}</p></div>
              </div>
            </div>
          )}
          <div id="fm-fin" />
        </div>

        <aside className="fm-lateral" aria-label={t.suFirma}>
          <section className="fm-tarjeta">
            <h2>{t.suFirma}</h2>
            <span className="fm-quien">{t.firmaDe} {nombreFirma}</span>
            <div ref={refCampo}>
              {adopcion ? (
                <div className="fm-campo">
                  <img ref={refImg} src={adopcion.previa} alt={t.firmaAdoptada} />
                </div>
              ) : (
                <button type="button" className={`fm-tag${activo ? "" : " fm-tag--dis"}`} disabled={!activo} onClick={() => setModal("firma")}>
                  <Ic n="pluma" />
                  <span>{activo ? t.firmarAqui : t.disponibleAlContinuar}</span>
                  <span className="fm-grow" />
                  {activo ? <Ic n="flecha" /> : null}
                </button>
              )}
            </div>
            {adopcion && !final ? (
              <button type="button" className="fm-btn fm-btn--sm" style={{ justifySelf: "start" }} onClick={() => setModal("firma")}>{t.cambiarFirma}</button>
            ) : null}
            {final ? (
              <div className="fm-val">
                <div className="fm-qr" ref={refQr}><Qr texto={urlVal} etiqueta={t.verificaEscaneando} /></div>
                {datos}
              </div>
            ) : (
              <div className="fm-val">
                <div className="fm-qr fm-qr--vacio">QR</div>
                <p className="fm-sub" style={{ margin: 0, alignSelf: "center" }}>{t.seCompleta}</p>
              </div>
            )}
            {final ? <p className="fm-ver">{t.verificaEscaneando} · {resultado!.codigo_verificacion}</p> : null}
          </section>

          <section className="fm-tarjeta">
            <h3>{t.partes}</h3>
            <ul className="fm-partes">
              {info.firmantes.map((p) => {
                const yo = p.rol === info.firmante.rol && p.nombre === info.firmante.nombre;
                const firmo = p.firmado || (yo && final);
                return (
                  <li key={`${p.orden}-${p.nombre}`}>
                    <span>
                      <b>{p.nombre}{yo ? ` (${t.usted})` : ""}</b>
                      <small>{p.rol_texto || p.rol}</small>
                    </span>
                    <span className={`fm-pill ${firmo ? "fm-pill--ok" : "fm-pill--idle"}`}>{firmo ? t.firmo : t.falta}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      {adopcion && !final ? (
        <div className="fm-barra" ref={refBarra}>
          <span className="fm-barra__chk"><Ic n="ok" /></span>
          <div className="fm-grow" style={{ minWidth: 200 }} aria-live="polite">
            <b>{t.listo}</b>
            <div className="fm-sub">{errorFirma ? <span className="fm-msg--mal" role="alert">{t.fallaFirma}: {errorFirma}</span> : t.listoD}</div>
          </div>
          <button type="button" className={`fm-btn fm-btn--tag fm-btn--gran${firmando ? "" : " fm-titila"}`} disabled={firmando} onClick={() => void finalizar()}>
            <Ic n="pluma" />
            {firmando ? t.firmando : t.finalizar}
          </button>
        </div>
      ) : null}

      {modal === "codigo" ? (
        <VentanaCodigo
          t={t}
          token={token}
          info={info}
          onCerrar={() => setModal(null)}
          onVerificado={(r: RespVerificarCodigo) => {
            guardarSesion(token, r.sesion);
            setSesion(r.sesion);
            setMensaje(r.mensaje_firma);
            setHuella(r.huella);
            eventos.current.codigo = new Date();
            setModal(null);
            if (!movimientoReducido() && refCampo.current) gsap.from(refCampo.current, { y: 6, opacity: 0, duration: 0.5, ease: "expo.out", delay: 0.1 });
          }}
        />
      ) : null}

      {modal === "firma" && sesion ? (
        <VentanaFirma
          t={t}
          l={l}
          nombre={info.firmante.nombre}
          token={token}
          sesion={sesion}
          mensajeFirma={mensaje}
          onCerrar={() => setModal(null)}
          onAdoptar={(a) => {
            eventos.current.adoptada = new Date();
            setAdopcion(a);
            setModal(null);
          }}
        />
      ) : null}

      {modal === "exito" && resultado ? (
        <Exito
          t={t}
          l={l}
          tab={exitoTab}
          onTab={setExitoTab}
          onCerrar={() => setModal(null)}
          info={info}
          resultado={resultado}
          faltan={faltan}
          huella={huella}
          adopcion={adopcion}
          eventos={eventos.current}
          pais={pais}
          onPais={setPais}
          espera={esperaSello}
          urlVal={urlVal}
        />
      ) : null}

      <div className="fm-toast" role="status" aria-live="polite" hidden={!aviso}>{aviso}</div>
    </div>
  );
}

/* ---------- ventana del código de verificación ---------- */

function VentanaCodigo({ t, token, info, onVerificado, onCerrar }: { t: Textos; token: string; info: RespAbrir; onVerificado: (r: RespVerificarCodigo) => void; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState<{ texto: string; mal: boolean }>({ texto: info.codigo_vigente ? "" : t.otpSinCodigo, mal: !info.codigo_vigente });
  const [vence, setVence] = useState<number | null>(null);
  const [espera, setEspera] = useState(info.espera_codigo_s || 0);
  const [ocupado, setOcupado] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [, tic] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setEspera((e) => Math.max(0, e - 1));
      tic((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const resto = vence ? Math.max(0, Math.round((vence - Date.now()) / 1000)) : null;

  const sacudir = () => {
    if (campo.current && !movimientoReducido()) gsap.fromTo(campo.current, { x: -5 }, { x: 0, duration: 0.4, ease: "elastic.out(1,.4)" });
  };

  const verificar = async () => {
    const c = codigo.replace(/\D/g, "");
    if (c.length !== 6) {
      setMsg({ texto: t.otpSeis, mal: true });
      return;
    }
    setOcupado(true);
    try {
      const r = await publica<RespVerificarCodigo>("verificar_codigo", { token, codigo: c });
      onVerificado(r);
    } catch (e) {
      const err = e instanceof ErrorFirma ? e : new ErrorFirma("error_interno", "", 500);
      if (err.code === "codigo_incorrecto") {
        const n = err.intentosRestantes;
        setMsg({ texto: n === 0 ? t.otpBloqueado : `${t.otpMal} ${n ?? ""}`.trim(), mal: true });
        if (n === 0) setBloqueado(true);
        sacudir();
        campo.current?.select();
      } else if (err.code === "codigo_bloqueado") {
        setMsg({ texto: t.otpBloqueado, mal: true });
        setBloqueado(true);
      } else if (err.code === "codigo_vencido") setMsg({ texto: t.otpVencido, mal: true });
      else if (err.code === "sin_codigo") setMsg({ texto: t.otpSinCodigo, mal: true });
      else if (err.code === "bloqueado") setMsg({ texto: t.otpBloqueo, mal: true });
      else setMsg({ texto: err.code === "red" ? t.redD : err.message || t.errorGeneral, mal: true });
    } finally {
      setOcupado(false);
    }
  };

  const pedirNuevo = async () => {
    setOcupado(true);
    try {
      const r = await publica<{ correo_enmascarado: string; espera_s: number; vence_en: string }>("solicitar_codigo", { token });
      setEspera(r.espera_s ?? 60);
      setVence(new Date(r.vence_en).getTime());
      setBloqueado(false);
      setCodigo("");
      setMsg({ texto: `${t.otpEnviado} ${r.correo_enmascarado}. ${t.otpAnterior}`, mal: false });
      campo.current?.focus();
    } catch (e) {
      const err = e instanceof ErrorFirma ? e : new ErrorFirma("error_interno", "", 500);
      if (err.code === "espera_codigo") setEspera(err.retryAfter ?? 60);
      if (err.code === "limite_diario") setMsg({ texto: t.otpDiario, mal: true });
      else if (err.code === "bloqueado") setMsg({ texto: t.otpBloqueo, mal: true });
      else setMsg({ texto: err.code === "red" ? t.redD : err.message || t.errorGeneral, mal: true });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Ventana
      titulo={t.otpT}
      onCerrar={onCerrar}
      etiquetaCerrar={t.cerrar}
      pie={
        <>
          <span className="fm-grow" />
          <button type="button" className="fm-btn" onClick={onCerrar}>{t.cancelar}</button>
          <button type="button" className="fm-btn fm-btn--pri" disabled={ocupado || bloqueado} onClick={() => void verificar()}>{t.otpVerificar}</button>
        </>
      }
    >
      <p style={{ margin: "0 0 12px" }}>{t.otpD} <b>{info.firmante.correo_enmascarado}</b>.</p>
      <label className="fm-label" htmlFor="fm-otp">{t.otpL}</label>
      <input
        id="fm-otp"
        data-foco
        ref={campo}
        className="fm-input fm-otp"
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        autoComplete="one-time-code"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => { if (e.key === "Enter") void verificar(); }}
      />
      <div className={`fm-msg ${msg.mal ? "fm-msg--mal" : "fm-msg--bien"}`} role="alert" aria-live="assertive">{msg.texto}</div>
      {resto !== null ? <div className="fm-sub" style={{ color: resto ? undefined : "#a02c2c" }}>{resto ? `${t.otpVence} ${mmss(resto)}` : t.otpVencido}</div> : null}
      <div className="fm-reenv">
        <span className="fm-sub">{t.otpNo}</span>
        <button type="button" className="fm-btn fm-btn--sm" disabled={espera > 0 || ocupado} onClick={() => void pedirNuevo()}>{t.otpNuevo}</button>
        <span className="fm-sub" aria-live="off">{espera > 0 ? `${t.otpEspera} ${espera} s` : ""}</span>
      </div>
    </Ventana>
  );
}

/* ---------- ventana de éxito: correo y certificado de trazabilidad ---------- */

interface ExitoProps {
  t: Textos;
  l: Lengua;
  tab: "correo" | "traza";
  onTab: (x: "correo" | "traza") => void;
  onCerrar: () => void;
  info: RespAbrir;
  resultado: RespFirmar;
  faltan: string[];
  huella: string;
  adopcion: Adopcion | null;
  eventos: { abierto: Date; codigo?: Date; leido?: Date; adoptada?: Date };
  pais: string;
  onPais: (p: string) => void;
  espera: boolean;
  urlVal: string;
}

function Exito({ t, l, tab, onTab, onCerrar, info, resultado, faltan, huella, adopcion, eventos, pais, onPais, espera, urlVal }: ExitoProps) {
  const completo = resultado.pendientes === 0;
  const k = l === "en" ? 2 : 1;
  const p = NORMAS_PAIS[pais] ?? NORMAS_PAIS.XX;
  const ley = (x: [string, string, string]) => (
    <li key={x[0]}>
      <b>{x[0]}</b>
      <span className="fm-sub">{x[k]}</span>
    </li>
  );
  const utc = (d?: Date | string | null) => (d ? fechaHora(d, l, true) : "—");
  const evs: [Date | undefined, string][] = [
    [eventos.abierto, t.ev.abierto],
    [eventos.codigo, t.ev.codigo],
    [eventos.leido, t.ev.leido],
    [eventos.adoptada, `${t.ev.adoptada}${adopcion ? ` (${adopcion.tipo})` : ""}`],
    [new Date(resultado.firmado_en), t.ev.firmada],
  ];
  return (
    <Ventana
      titulo={completo ? t.gracias : t.graciasFalta}
      onCerrar={onCerrar}
      ancho
      etiquetaCerrar={t.cerrar}
      pie={
        <>
          <span className="fm-sub fm-grow">{t.descargaNota}</span>
          <a className="fm-btn" href={`/verificar/${encodeURIComponent(resultado.codigo_verificacion)}?h=${huella}&f=${resultado.codigo_identidad}`} target="_blank" rel="noreferrer">{t.verificarAqui}</a>
          <button type="button" className="fm-btn fm-btn--pri" onClick={onCerrar}>{t.verDocumento}</button>
        </>
      }
    >
      <div className="fm-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "correo"} onClick={() => onTab("correo")}><Ic n="correo" />{t.tCorreo}</button>
        <button type="button" role="tab" aria-selected={tab === "traza"} onClick={() => onTab("traza")}><Ic n="escudo" />{t.tCertificadoTraza}</button>
      </div>

      {tab === "correo" ? (
        <div>
          <div className="fm-exito">
            <span className="fm-exito__chk"><Ic n="ok" /></span>
            <h3 style={{ fontSize: "1.2rem" }}>{completo ? t.gracias : t.graciasFalta}</h3>
            <p style={{ margin: "2px 0 0" }}>{completo ? t.graciasD(info.firmante.correo_enmascarado) : t.graciasFaltaD(faltan.join(", ") || "—")}</p>
          </div>
          {completo ? (
            <div className="fm-sello" role="status" aria-live="polite">
              <Ic n="escudo" />
              <span>{resultado.finalizado ? t.sellado : resultado.finalizacion_pendiente || espera ? t.sellandoDemora : t.sellando}</span>
            </div>
          ) : null}
          <h3 style={{ margin: "18px 0 0", fontSize: "0.85rem" }}>{t.asi}</h3>
          <div className="fm-correo">
            <div className="fm-correo__cab">
              <span>{t.de}</span><span>Universidad de Santander · {t.servicio}</span>
              <span>{t.para}</span><span>{info.firmante.correo_enmascarado}</span>
              <span>{t.asunto}</span><span><b>{t.asuntoCorreo(info.documento.nombre)}</b></span>
            </div>
            <div className="fm-correo__cu">
              <img src="/logo-udes.svg" alt="" style={{ height: 28, display: "block", marginBottom: 10 }} />
              <p style={{ margin: "0 0 8px" }}>{l === "es" ? `Estimado(a) ${info.firmante.nombre},` : `Dear ${info.firmante.nombre},`}</p>
              <p style={{ margin: 0 }}>{completo ? t.cuerpoCorreo : t.cuerpoCorreoFalta}</p>
              {completo ? <div className="fm-adj">{t.adjuntos.map((a) => <span key={a}>{a}</span>)}</div> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="fm-traza">
          <div className="fm-traza__cab">
            <img src="/logo-udes.svg" alt="Universidad de Santander" />
            <div style={{ textAlign: "right" }}>
              <b>{t.cT}</b>
              <div className="fm-mono">{t.cCodigo} {resultado.codigo_verificacion}</div>
              <div className="fm-sub">{t.cEmitido}: {utc(resultado.firmado_en)}</div>
            </div>
          </div>
          <h3>1 · {t.cDocumento}</h3>
          <table className="fm-tc"><tbody>
            <tr><td className="fm-sub" style={{ width: 160 }}>{t.cNombre}</td><td>{info.documento.nombre} · UDES – {info.documento.institucion}</td></tr>
            <tr><td className="fm-sub">{t.cPaginas}</td><td>{info.documento.paginas}</td></tr>
            <tr><td className="fm-sub">{t.cHuella}</td><td className="fm-mono">{huella}</td></tr>
          </tbody></table>
          <h3>2 · {t.cFirmantes}</h3>
          <div className="fm-tc__scroll">
            <table className="fm-tc">
              <thead><tr><th>{t.etiquetaFirmante}</th><th>{t.cRol}</th><th>{t.cMetodo}</th><th>{t.cFecha}</th></tr></thead>
              <tbody>
                {info.firmantes.map((x) => {
                  const yo = x.rol === info.firmante.rol && x.nombre === info.firmante.nombre;
                  return (
                    <tr key={`${x.orden}-${x.nombre}`}>
                      <td><b>{x.nombre}</b>{yo ? <div className="fm-mono">{resultado.codigo_identidad}</div> : null}</td>
                      <td>{x.rol_texto || x.rol}</td>
                      <td>{yo ? <>{adopcion?.tipo}<div className="fm-sub">{t.cDispositivo}: {navegador()}</div></> : x.firmado ? t.firmo : t.falta}</td>
                      <td className="fm-mono">{yo ? utc(resultado.firmado_en) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h3>3 · {t.cEventos}</h3>
          <ul className="fm-eventos">
            {evs.filter(([d]) => d).map(([d, x]) => (
              <li key={x}><time className="fm-mono">{utc(d)}</time><span>{x}</span></li>
            ))}
          </ul>
          <h3>4 · {t.cIntegridad}</h3>
          <p className="fm-sub" style={{ margin: 0 }}>{t.cIntegridadD}</p>
          <h3>5 · {t.cNormas}</h3>
          <div className="fm-row" style={{ margin: "2px 0 8px" }}>
            <label htmlFor="fm-pais" className="fm-sub">{t.cNormaPais}</label>
            <select id="fm-pais" className="fm-select" value={pais} onChange={(e) => onPais(e.target.value)}>
              {Object.entries(NORMAS_PAIS).map(([c, x]) => <option key={c} value={c}>{x.n}</option>)}
            </select>
          </div>
          <h4 className="fm-nh">{t.cNormaCo}</h4>
          <ul className="fm-nl">{NORMAS_CO.map(ley)}</ul>
          {p.l.length ? (<><h4 className="fm-nh">{t.cNormaPais}: {p.n}</h4><ul className="fm-nl">{p.l.map(ley)}</ul></>) : null}
          <h4 className="fm-nh">{t.cNormaInt}</h4>
          <ul className="fm-nl">{NORMAS_INT.map(ley)}</ul>
          <p className="fm-sub" style={{ margin: "8px 0 0" }}>{t.cAviso}</p>
          <h3>6 · {t.cVerificacion}</h3>
          <div className="fm-val" style={{ gridTemplateColumns: "96px 1fr" }}>
            <div className="fm-qr" style={{ width: 96, height: 96 }}><Qr texto={urlVal} etiqueta={t.cVerificacion} /></div>
            <div className="fm-sub">{t.cVer} <b>planeacion.udes.edu.co/verificar</b>.<div className="fm-mono" style={{ marginTop: 6 }}>{resultado.codigo_verificacion}</div></div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: "0.72rem", color: "var(--ink-muted)", textAlign: "center" }}>{t.cEmitidoPor}</div>
        </div>
      )}
    </Ventana>
  );
}

