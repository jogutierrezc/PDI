/* =============================================================================
   Firma de convenios · verificación pública (/verificar/:codigo?h=<huella>&f=<identidad>).

   Usa la acción pública `verificar`. El QR de cada firma trae la huella y la identidad del firmante;
   también se puede pegar la huella de un PDF o soltar el archivo: el SHA-256 se calcula en el
   navegador y el archivo no se sube a ningún servidor.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorFirma, publica } from "./api";
import type { RespVerificar } from "./api";
import { BarraPortal, fechaHora, guardarLengua, Ic, lenguaInicial, sha256Hex, usePaginaPrivada } from "./comunes";
import { TEXTOS } from "./textos";
import type { Lengua } from "./textos";
import "./firma.css";

const HEX64 = /^[0-9a-fA-F]{64}$/;

export function Verificar() {
  const { codigo = "" } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [l, setL] = useState<Lengua>(() => lenguaInicial(navigator.language?.toLowerCase().startsWith("en") ? "en" : "es"));
  const t = TEXTOS[l];
  usePaginaPrivada(`${t.vTitulo} · UDES`);

  const hUrl = params.get("h") ?? "";
  const f = params.get("f") ?? "";
  const [res, setRes] = useState<RespVerificar | null>(null);
  const [cargando, setCargando] = useState(false);
  const [falla, setFalla] = useState("");
  const [campo, setCampo] = useState(codigo);
  const [pegada, setPegada] = useState("");
  const [calc, setCalc] = useState(false);
  const [miHuella, setMiHuella] = useState("");
  const [sobre, setSobre] = useState(false);
  const [msgLocal, setMsgLocal] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  const consultar = useCallback(
    async (huella: string) => {
      if (!codigo) return;
      setCargando(true);
      setFalla("");
      try {
        const r = await publica<RespVerificar>("verificar", { codigo, ...(huella ? { h: huella } : {}), ...(f ? { f } : {}) });
        setRes(r);
      } catch (e) {
        setRes(null);
        setFalla(e instanceof ErrorFirma && e.code !== "red" && e.message ? e.message : t.vRed);
      } finally {
        setCargando(false);
      }
    },
    [codigo, f, t],
  );

  useEffect(() => {
    setMiHuella("");
    setMsgLocal("");
    setCampo(codigo);
    void consultar(hUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se consulta al cambiar el código o el enlace
  }, [codigo, hUrl]);

  const alArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    setCalc(true);
    setMsgLocal("");
    try {
      const huella = await sha256Hex(await archivo.arrayBuffer());
      setMiHuella(huella);
      await consultar(huella);
    } finally {
      setCalc(false);
    }
  };

  const comparar = async () => {
    const v = pegada.trim().toLowerCase();
    if (!HEX64.test(v)) {
      setMsgLocal(t.vHuellaMal);
      return;
    }
    setMsgLocal("");
    setMiHuella(v);
    await consultar(v);
  };

  const encontrado = res?.encontrado === true;
  const coincide = res?.huella_coincide;
  const veredicto = !encontrado ? null : coincide === true ? "ok" : coincide === false ? "mal" : "neutro";

  return (
    <div className="fm">
      <BarraPortal l={l} t={t} onLengua={(n) => { setL(n); guardarLengua(n); }} />
      <main className="fm-v">
        <div>
          <h1>{t.vTitulo}</h1>
          <p className="fm-sub" style={{ margin: "4px 0 0" }}>{t.vSub}</p>
        </div>

        <form
          className="fm-v__form"
          onSubmit={(e) => {
            e.preventDefault();
            const c = campo.trim();
            if (c) navegar(`/verificar/${encodeURIComponent(c)}`);
          }}
        >
          <label className="fm-label" htmlFor="fm-v-cod" style={{ flexBasis: "100%", margin: 0 }}>{t.vCodigo}</label>
          <input id="fm-v-cod" className="fm-input" value={campo} placeholder="UDES-CV-2026-000184" autoComplete="off" onChange={(e) => setCampo(e.target.value)} />
          <button type="submit" className="fm-btn fm-btn--pri">{t.vConsulta}</button>
        </form>

        <div aria-live="polite">
          {cargando ? <div className="fm-cargando" role="status"><i />{t.vBuscando}</div> : null}
          {falla ? <p className="fm-msg fm-msg--mal" role="alert">{falla}</p> : null}

          {res && !cargando && !encontrado ? (
            <section className="fm-resultado fm-resultado--mal">
              <div className="fm-veredicto">
                <span className="fm-veredicto__ic fm-veredicto__ic--mal"><Ic n="x" /></span>
                <div>
                  <h2>{t.vNoEncontrado}</h2>
                  <p className="fm-sub" style={{ margin: "2px 0 0" }}>{t.vNoEncontradoD}</p>
                </div>
              </div>
            </section>
          ) : null}

          {res && !cargando && encontrado ? (
            <section className={`fm-resultado${veredicto === "ok" ? " fm-resultado--ok" : veredicto === "mal" ? " fm-resultado--mal" : ""}`}>
              <div className="fm-veredicto">
                <span className={`fm-veredicto__ic${veredicto === "mal" ? " fm-veredicto__ic--mal" : veredicto === "neutro" ? " fm-veredicto__ic--neutro" : ""}`}>
                  <Ic n={veredicto === "mal" ? "x" : veredicto === "ok" ? "escudo" : "archivo"} />
                </span>
                <div>
                  <h2>{veredicto === "ok" ? t.vIntegro : veredicto === "mal" ? t.vNoCoincide : t.vSinHuella}</h2>
                  <p className="fm-sub" style={{ margin: "2px 0 0" }}>{veredicto === "mal" ? t.vNoCoincideD : veredicto === "neutro" ? t.vSinHuellaD : res.codigo}</p>
                </div>
              </div>

              <dl className="fm-ficha">
                <dt>{t.vEstado}</dt>
                <dd>{res.estado === "firmada" || res.firmada_en ? <span className="fm-pill fm-pill--ok"><Ic n="ok" />{t.vFirmada}</span> : res.estado}</dd>
                {res.firmada_en ? (<><dt>{t.vFirmadaEn}</dt><dd>{fechaHora(res.firmada_en, l)}</dd></>) : null}
                {res.documento ? (
                  <>
                    <dt>{t.vDocumento}</dt><dd>{res.documento.nombre}</dd>
                    <dt>{t.vInstitucion}</dt><dd>{res.documento.institucion}</dd>
                    {res.documento.convenio ? (<><dt>{t.vConvenio}</dt><dd>{res.documento.convenio}</dd></>) : null}
                  </>
                ) : null}
                {res.huella_documento ? (<><dt>{t.vHuellaDoc}</dt><dd className="fm-mono">{res.huella_documento}</dd></>) : null}
                {res.huella_pdf_firmado ? (<><dt>{t.vHuellaFirmado}</dt><dd className="fm-mono">{res.huella_pdf_firmado}</dd></>) : null}
              </dl>

              {res.sello && (res.sello.sujeto || res.sello.hora_utc) ? (
                <dl className="fm-ficha">
                  {res.sello.sujeto ? (<><dt>{t.vSelloSujeto}</dt><dd>{res.sello.sujeto}</dd></>) : null}
                  {res.sello.emisor ? (<><dt>{t.vCertEmisor}</dt><dd>{res.sello.emisor}</dd></>) : null}
                  {res.sello.hora_utc ? (<><dt>{t.vSelloHora}</dt><dd>{fechaHora(res.sello.hora_utc, l, true)}</dd></>) : null}
                </dl>
              ) : null}

              {res.firmantes?.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <h3 style={{ fontSize: "0.95rem" }}>{t.vFirmantes}{res.firmantes_total ? ` (${res.firmantes.length}/${res.firmantes_total})` : ""}</h3>
                  {res.firmantes.map((p) => (
                    <div key={`${p.orden}-${p.codigo_identidad}`} className={`fm-firma-item${p.es_el_consultado ? " fm-firma-item--sel" : ""}`}>
                      <div className="fm-row">
                        <b>{p.nombre}</b>
                        <span className="fm-sub">{p.rol_texto || p.rol}</span>
                        {p.es_el_consultado ? <span className="fm-pill fm-pill--ok">{t.vConsultado}</span> : null}
                      </div>
                      <dl className="fm-ficha">
                        <dt>{t.etiquetaCorreo}</dt><dd>{p.correo_enmascarado}</dd>
                        <dt>{t.vIdentidad}</dt><dd className="fm-mono">{p.codigo_identidad}</dd>
                        <dt>{t.vMetodo}</dt><dd>{p.metodo ? t.vMetodos[p.metodo] ?? p.metodo : "—"}</dd>
                        <dt>{t.etiquetaFecha}</dt><dd>{fechaHora(p.firmado_en, l)}</dd>
                        {p.pais ? (<><dt>{t.vPais}</dt><dd>{p.pais}</dd></>) : null}
                        {p.cert ? (
                          <>
                            <dt>{t.vCert}</dt>
                            <dd>
                              {p.cert.sujeto}
                              {p.cert.emisor ? <div className="fm-sub">{t.vCertEmisor}: {p.cert.emisor}</div> : null}
                              {p.cert.desde ? <div className="fm-sub">{t.vCertVigencia}: {fechaHora(p.cert.desde, l)} – {fechaHora(p.cert.hasta, l)}</div> : null}
                              {p.cert.cadena ? <div className="fm-sub">{t.vCertCadena}: {t.vCadenas[p.cert.cadena] ?? p.cert.cadena}</div> : null}
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {codigo ? (
          <section className="fm-resultado" aria-label={t.vComprobarT}>
            <h2 style={{ fontSize: "1rem" }}>{t.vComprobarT}</h2>
            <p className="fm-sub" style={{ margin: 0 }}>{t.vComprobarD}</p>
            <div
              className={`fm-soltar${sobre ? " fm-soltar--sobre" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
              onDragLeave={() => setSobre(false)}
              onDrop={(e) => { e.preventDefault(); setSobre(false); void alArchivo(e.dataTransfer.files[0]); }}
            >
              <Ic n="archivo" />
              <span>{calc ? t.vCalculando : t.vSoltar}</span>
              <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void alArchivo(e.target.files?.[0])} />
              <button type="button" className="fm-btn fm-btn--sm" disabled={calc} onClick={() => entrada.current?.click()}>{t.vElegir}</button>
            </div>
            <div>
              <label className="fm-label" htmlFor="fm-v-h">{t.vPegar}</label>
              <div className="fm-v__form">
                <input id="fm-v-h" className="fm-input fm-mono" value={pegada} onChange={(e) => setPegada(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void comparar(); }} spellCheck={false} />
                <button type="button" className="fm-btn" onClick={() => void comparar()}>{t.vComparar}</button>
              </div>
            </div>
            <div aria-live="polite">
              {msgLocal ? <p className="fm-msg fm-msg--mal">{msgLocal}</p> : null}
              {miHuella && res ? (
                <p className={`fm-msg ${res.huella_coincide ? "fm-msg--bien" : "fm-msg--mal"}`}>
                  {res.huella_coincide ? t.vCoincideLocal : t.vNoCoincideLocal}
                  <span className="fm-mono" style={{ display: "block", color: "var(--ink-muted)" }}>{t.vHuellaTuya}: {miHuella}</span>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
