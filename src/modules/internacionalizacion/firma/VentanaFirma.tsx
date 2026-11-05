/* =============================================================================
   Firma de convenios · ventana «Adopte su firma» con tres caminos:
     Dibujar              trazo con el ratón, el dedo o un lápiz (se recorta y va como PNG)
     Certificado digital  .p12/.pfx leído y usado solo en el navegador; viaja la firma y la cadena PÚBLICA
     Desde mi móvil       solo en computador: QR, cuenta de 5 minutos y sondeo cada 2 s a estado_movil
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { publica, ErrorFirma } from "./api";
import type { MetodoFirma } from "./api";
import { abrirP12, ErrorP12, nombreCorto } from "./certificado";
import type { CertificadoAbierto, FirmaCertificado, InfoCertificado } from "./certificado";
import { fechaCorta, Ic, mmss, Qr, Ventana } from "./comunes";
import { Lienzo } from "./Lienzo";
import type { LienzoRef } from "./Lienzo";
import type { Lengua, Textos } from "./textos";

export interface Adopcion {
  metodo: MetodoFirma;
  /** PNG en data URL (dibujo y móvil). */
  imagen?: string;
  certificado?: FirmaCertificado;
  /** Imagen para mostrar la firma en la página. */
  previa: string;
  tipo: string;
}

type Pestana = "dibujo" | "certificado" | "movil";

interface Props {
  t: Textos;
  l: Lengua;
  nombre: string;
  token: string;
  sesion: string;
  mensajeFirma: string;
  onAdoptar: (a: Adopcion) => void;
  onCerrar: () => void;
}

/** Dibuja el nombre del certificado como una «firma» legible para la vista previa. */
function previaDeTexto(texto: string, sub: string): string {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 160;
  const x = c.getContext("2d");
  if (!x) return "";
  x.fillStyle = "#12253A";
  x.font = 'italic 56px Georgia, "Times New Roman", serif';
  x.textBaseline = "alphabetic";
  let t = texto;
  while (x.measureText(t).width > 610 && t.length > 4) t = t.slice(0, -2);
  x.fillText(t, 12, 84);
  x.fillStyle = "#4A5663";
  x.font = "22px system-ui, sans-serif";
  x.fillText(sub, 12, 128);
  return c.toDataURL("image/png");
}

export function VentanaFirma({ t, l, nombre, token, sesion, mensajeFirma, onAdoptar, onCerrar }: Props) {
  const fino = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
  const [pestana, setPestana] = useState<Pestana>("dibujo");
  const [listo, setListo] = useState<Adopcion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (p: Pestana) => {
    setPestana(p);
    setListo(null);
    setError("");
  };

  // ----- dibujo -----
  const lienzo = useRef<LienzoRef>(null);
  const [conTrazo, setConTrazo] = useState(false);

  // ----- certificado -----
  const [archivo, setArchivo] = useState<File | null>(null);
  const [clave, setClave] = useState("");
  const [certInfo, setCertInfo] = useState<InfoCertificado | null>(null);
  const cert = useRef<CertificadoAbierto | null>(null);
  useEffect(() => () => cert.current?.descartar(), []);

  const leerCertificado = async () => {
    if (!archivo || clave.length < 1) {
      setError(t.certArchivoFalta);
      return;
    }
    setOcupado(true);
    setError("");
    cert.current?.descartar();
    cert.current = null;
    setCertInfo(null);
    setListo(null);
    try {
      const abierto = await abrirP12(await archivo.arrayBuffer(), clave);
      cert.current = abierto;
      setCertInfo(abierto.info);
      setClave("");
      setListo({ metodo: "certificado", previa: previaDeTexto(nombreCorto(abierto.info.sujeto), archivo.name), tipo: t.tipoCert });
    } catch (e) {
      const causa = e instanceof ErrorP12 ? e.causa : "formato";
      setError({ clave: t.certClaveMal, formato: t.certFormato, sin_clave: t.certSinClave, no_rsa: t.certNoRsa, debil: t.certDebil, vencido: t.certVencido }[causa]);
    } finally {
      setOcupado(false);
    }
  };

  // ----- móvil -----
  const [movil, setMovil] = useState<{ url: string; vence: number } | null>(null);
  const [resto, setResto] = useState(0);
  const [recibido, setRecibido] = useState<string | null>(null);
  const [movilMsg, setMovilMsg] = useState("");
  const generacion = useRef(0);

  const iniciarMovil = useCallback(async () => {
    const mia = ++generacion.current;
    setMovil(null);
    setRecibido(null);
    setMovilMsg("");
    setListo(null);
    try {
      const r = await publica<{ url: string; vence_en: string }>("iniciar_movil", { token, sesion });
      if (mia !== generacion.current) return;
      const vence = new Date(r.vence_en).getTime();
      setMovil({ url: r.url, vence });
      setResto(Math.max(0, Math.round((vence - Date.now()) / 1000)));
    } catch (e) {
      if (mia === generacion.current) setMovilMsg(e instanceof ErrorFirma && e.code !== "red" ? e.message : t.movError);
    }
  }, [token, sesion, t]);

  useEffect(() => {
    if (pestana !== "movil") {
      generacion.current++;
      return;
    }
    void iniciarMovil();
    return () => {
      generacion.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar a la pestaña
  }, [pestana]);

  useEffect(() => {
    if (pestana !== "movil" || !movil || recibido) return;
    const mia = generacion.current;
    const cuenta = window.setInterval(() => {
      const r = Math.max(0, Math.round((movil.vence - Date.now()) / 1000));
      setResto(r);
      if (!r) {
        window.clearInterval(cuenta);
        window.clearInterval(sondeo);
        setMovilMsg(t.movVencido);
      }
    }, 1000);
    const sondeo = window.setInterval(async () => {
      try {
        const r = await publica<{ estado: string; imagen?: string }>("estado_movil", { token, sesion });
        if (mia !== generacion.current) return;
        if (r.estado === "recibido" && r.imagen) {
          window.clearInterval(sondeo);
          window.clearInterval(cuenta);
          setRecibido(r.imagen);
          setListo({ metodo: "movil", imagen: r.imagen, previa: r.imagen, tipo: t.tipoMovil });
        } else if (r.estado === "vencido" || r.estado === "usado") {
          window.clearInterval(sondeo);
          window.clearInterval(cuenta);
          setMovilMsg(t.movVencido);
        }
      } catch {
        /* un fallo suelto de red no corta el sondeo */
      }
    }, 2000);
    return () => {
      window.clearInterval(cuenta);
      window.clearInterval(sondeo);
    };
  }, [pestana, movil, recibido, token, sesion, t]);

  // ----- adoptar -----
  const puedeAdoptar = pestana === "dibujo" ? conTrazo : Boolean(listo);

  const adoptar = async () => {
    setError("");
    if (pestana === "dibujo") {
      const png = lienzo.current?.exportar();
      if (!png) return;
      onAdoptar({ metodo: "dibujo", imagen: png, previa: png, tipo: t.tipoDibujo });
      return;
    }
    if (pestana === "movil" && listo) {
      onAdoptar(listo);
      return;
    }
    if (pestana === "certificado" && cert.current && listo) {
      setOcupado(true);
      try {
        const firma = await cert.current.firmar(mensajeFirma);
        onAdoptar({ ...listo, certificado: firma });
      } catch {
        setError(t.certFirmaFalla);
      } finally {
        cert.current?.descartar();
        cert.current = null;
        setOcupado(false);
      }
    }
  };

  const pestanas: [Pestana, string, string][] = [
    ["dibujo", t.tDibujar, "pluma"],
    ["certificado", t.tCertificado, "candado"],
    ...(fino ? ([["movil", t.tMovil, "movil"]] as [Pestana, string, string][]) : []),
  ];

  return (
    <Ventana
      titulo={t.adT}
      onCerrar={onCerrar}
      ancho={pestana === "movil"}
      etiquetaCerrar={t.cerrar}
      pie={
        <>
          <span className="fm-legal">{t.legal}</span>
          <button type="button" className="fm-btn" onClick={onCerrar}>{t.cancelar}</button>
          <button type="button" className="fm-btn fm-btn--pri" disabled={!puedeAdoptar || ocupado} onClick={() => void adoptar()}>{t.adoptar}</button>
        </>
      }
    >
      <div className="fm-tabs" role="tablist">
        {pestanas.map(([k, n, i]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => cambiar(k)}>
            <Ic n={i} />
            {n}
          </button>
        ))}
      </div>

      {pestana === "dibujo" ? (
        <div>
          <p className="fm-sub" style={{ margin: "0 0 8px" }}>{t.dibujeAqui}</p>
          <div className="fm-pad">
            <Lienzo ref={lienzo} alto={170} etiqueta={t.adT} onCambio={setConTrazo} />
            <div className="fm-pad__lin" />
            <span className="fm-pad__nom">{nombre}</span>
          </div>
          <div className="fm-row" style={{ marginTop: 8 }}>
            <span className="fm-grow" />
            <button type="button" className="fm-btn fm-btn--sm" onClick={() => lienzo.current?.borrar()}>{t.borrar}</button>
          </div>
          <p className="fm-garantia"><Ic n="ok" /><span>{t.garantiaDibujo}</span></p>
        </div>
      ) : null}

      {pestana === "certificado" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="fm-label" htmlFor="fm-pfx">{t.certArchivo}</label>
            <input
              id="fm-pfx"
              className="fm-input"
              type="file"
              accept=".p12,.pfx,application/x-pkcs12"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setCertInfo(null);
                setListo(null);
                setError("");
              }}
            />
          </div>
          <div>
            <label className="fm-label" htmlFor="fm-pw">{t.certClave}</label>
            <input id="fm-pw" className="fm-input" type="password" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void leerCertificado(); }} />
          </div>
          <div>
            <button type="button" className="fm-btn" disabled={ocupado} onClick={() => void leerCertificado()}>{t.certLeer}</button>
          </div>
          <div aria-live="polite">
            {certInfo ? (
              <div className="fm-cert">
                <dl>
                  <dt>{t.certSujeto}</dt><dd>{certInfo.sujeto}</dd>
                  <dt>{t.certEmisor}</dt><dd>{certInfo.emisor}</dd>
                  <dt>{t.certVigencia}</dt><dd>{fechaCorta(certInfo.desde, l)} – {fechaCorta(certInfo.hasta, l)} <span className="fm-pill fm-pill--ok">{t.certVigente}</span></dd>
                </dl>
                <p className="fm-sub" style={{ margin: "8px 0 0" }}>{t.certListo}</p>
              </div>
            ) : null}
            {error ? <p className="fm-msg fm-msg--mal" role="alert">{error}</p> : null}
          </div>
          <p className="fm-garantia"><Ic n="candado" /><span>{t.certGarantia}</span></p>
        </div>
      ) : null}

      {pestana === "movil" ? (
        <div className="fm-movil">
          <div>
            <div className="fm-qrg">{movil ? <Qr texto={movil.url} etiqueta={t.movT} /> : null}</div>
          </div>
          <div style={{ display: "grid", gap: 10, width: "100%" }}>
            <h3 style={{ fontSize: "1rem" }}>{t.movT}</h3>
            <p className="fm-sub" style={{ margin: 0, maxWidth: 400 }}>{t.movD}</p>
            <div className="fm-sub">
              {t.movVence} <b className="fm-mono">{mmss(resto)}</b>{" "}
              <button type="button" className="fm-btn fm-btn--sm" style={{ marginLeft: 6 }} onClick={() => void iniciarMovil()}>{t.movOtro}</button>
            </div>
            <div aria-live="polite">
              {recibido ? (
                <>
                  <div className="fm-est fm-est--ok"><span className="fm-est__pt" /><span>{t.movRecibida}</span></div>
                  <div className="fm-prev" style={{ marginTop: 10 }}><img src={recibido} alt="" /></div>
                </>
              ) : movilMsg ? (
                <div className="fm-est fm-est--mal"><span className="fm-est__pt" /><span>{movilMsg}</span></div>
              ) : (
                <div className="fm-est"><span className="fm-est__pt" /><span>{t.movEspera}</span></div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Ventana>
  );
}
