/* =============================================================================
   Firma de convenios · la página del teléfono (/firma/movil/:token).

   Pantalla completa para firmar con el dedo (pointer events, touch-action: none). Sirve en vertical y
   en horizontal: el trazo se guarda normalizado y se redibuja si el recuadro cambia. El trazo viaja
   al computador por la acción movil_enviar; el computador lo recoge con estado_movil.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorFirma, publica } from "./api";
import { guardarLengua, Ic, lenguaInicial, usePaginaPrivada } from "./comunes";
import { Lienzo } from "./Lienzo";
import type { LienzoRef } from "./Lienzo";
import { TEXTOS } from "./textos";
import type { Lengua } from "./textos";
import "./firma.css";

type Fase = "cargando" | "listo" | "enviando" | "enviado" | "vencido" | "invalido" | "red";

export function Movil() {
  const { token = "" } = useParams();
  const [l, setL] = useState<Lengua>(() => lenguaInicial(navigator.language?.toLowerCase().startsWith("en") ? "en" : "es"));
  const t = TEXTOS[l];
  usePaginaPrivada(`${t.mTitulo} · UDES`);
  const [fase, setFase] = useState<Fase>("cargando");
  const [nombre, setNombre] = useState("");
  const [conTrazo, setConTrazo] = useState(false);
  const [falla, setFalla] = useState("");
  const lienzo = useRef<LienzoRef>(null);

  const abrir = useCallback(async () => {
    setFase("cargando");
    try {
      const r = await publica<{ valido: boolean; idioma: Lengua; nombre: string; vence_en: string }>("movil_abrir", { movil_token: token });
      if (!r.valido) {
        setFase(r.vence_en && new Date(r.vence_en).getTime() < Date.now() ? "vencido" : "invalido");
        return;
      }
      setNombre(r.nombre);
      try {
        if (!window.localStorage.getItem("conv-firma-lengua")) setL(r.idioma);
      } catch {
        setL(r.idioma);
      }
      setFase("listo");
    } catch (e) {
      const err = e instanceof ErrorFirma ? e : null;
      setFase(err?.code === "red" ? "red" : err && /venc/.test(err.code) ? "vencido" : "invalido");
    }
  }, [token]);

  useEffect(() => {
    void abrir();
  }, [abrir]);

  const enviar = async () => {
    const png = lienzo.current?.exportar();
    if (!png) return;
    setFase("enviando");
    setFalla("");
    try {
      await publica("movil_enviar", { movil_token: token, imagen: png });
      setFase("enviado");
    } catch (e) {
      const err = e instanceof ErrorFirma ? e : null;
      if (err && /venc/.test(err.code)) setFase("vencido");
      else {
        setFalla(err && err.code !== "red" && err.message ? err.message : t.mErrorEnvio);
        setFase("listo");
      }
    }
  };

  const cabecera = (
    <div className="fm-m__cab">
      <img src="/logo-udes.svg" alt="Universidad de Santander" width={105} height={30} />
      <div className="fm-seg" role="group" aria-label={t.idioma}>
        <button type="button" aria-pressed={l === "es"} onClick={() => { setL("es"); guardarLengua("es"); }}>ES</button>
        <button type="button" aria-pressed={l === "en"} onClick={() => { setL("en"); guardarLengua("en"); }}>EN</button>
      </div>
    </div>
  );

  if (fase === "cargando") return <div className="fm fm--movil"><div className="fm-m">{cabecera}<div className="fm-cargando" role="status"><i />{t.cargando}</div></div></div>;

  if (fase !== "listo" && fase !== "enviando") {
    const mapa = {
      enviado: ["ok", t.mEnviadoT, t.mEnviadoD],
      vencido: ["reloj", t.mVencidoT, t.mVencidoD],
      invalido: ["alerta", t.mInvalidoT, t.mInvalidoD],
      red: ["alerta", t.redT, t.redD],
    } as const;
    const [ic, titulo, texto] = mapa[fase];
    return (
      <div className="fm fm--movil">
        <div className="fm-m">
          {cabecera}
          <section className="fm-estado" style={{ margin: "auto", boxShadow: "none" }} aria-live="polite">
            <span className="fm-estado__ic"><Ic n={ic} /></span>
            <h1>{titulo}</h1>
            <p>{texto}</p>
            {fase === "red" ? <button type="button" className="fm-btn fm-btn--pri" onClick={() => void abrir()}>{t.reintentar}</button> : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="fm fm--movil">
      <div className="fm-m">
        {cabecera}
        <div>
          <h1>{t.mTitulo}</h1>
          {nombre ? <p className="fm-m__doc" style={{ margin: "2px 0 0" }}>{nombre}</p> : null}
        </div>
        <p className="fm-sub fm-m__ayuda" style={{ margin: 0 }}>{t.mAyuda}</p>
        <div className="fm-m__lienzo fm-pad">
          <Lienzo ref={lienzo} alto="100%" etiqueta={t.mFirmeAqui} grosor={3} onCambio={setConTrazo} />
          <div className="fm-pad__lin" />
          <span className="fm-pad__nom">{t.mFirmeAqui}</span>
        </div>
        <div aria-live="polite" role="status" style={{ minHeight: 20 }}>{falla ? <span className="fm-msg--mal">{falla}</span> : null}</div>
        <div className="fm-m__acciones">
          <button type="button" className="fm-btn" disabled={fase === "enviando"} onClick={() => lienzo.current?.borrar()}>{t.mBorrar}</button>
          <button type="button" className="fm-btn fm-btn--pri" disabled={!conTrazo || fase === "enviando"} onClick={() => void enviar()}>
            {fase === "enviando" ? t.mEnviando : falla ? t.mReintentar : t.mListo}
          </button>
        </div>
      </div>
    </div>
  );
}
