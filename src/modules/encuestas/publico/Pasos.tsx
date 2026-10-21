/* =============================================================================
   Encuestas con Pilo · los pasos del formulario (la «hoja» de la derecha).

     1 Identificación   dependencia + «Continuar con Microsoft»
     2 Qué enviar       logro o reto, y la lista de lo que lleva registrado
     3 Detalle          título, descripción y cifras de un aporte

   Cada paso habla con Pilo por `decir`. Lo escrito no se pierde: la lista vive en
   el borrador del navegador (lib/borrador.ts).
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { TIPOS_CIFRA, textoTipoAporte } from "../tipos";
import type { AporteEnvio, CuentaMicrosoft, TipoAporte } from "../tipos";
import { caben, formatearValor, leerNumero, LIMITES, validarCifras, validarDependencia, validarDescripcion, validarTitulo } from "../lib/validacion";
import type { CifraBorrador } from "../lib/validacion";
import { DOMINIOS_VISIBLES, GUIA, guiaDetalle } from "./frases";
import type { DecirGuia } from "./tipos-pub";

export type EstadoMicrosoft = { fase: "inactivo" } | { fase: "verificando" } | { fase: "error"; mensaje: string };

export const IconoMicrosoft = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

const IconoQuitar = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 5h12M7.5 5V3.5h3V5M5 5l.7 9.5h6.6L13 5" />
  </svg>
);

const IconoLogro = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 5h12v6a6 6 0 01-12 0V5z" />
    <path d="M8 7H4.5v1.5A3.5 3.5 0 008 12M20 7h3.5v1.5A3.5 3.5 0 0120 12M14 17v4M9.5 23h9" />
  </svg>
);

const IconoReto = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 23l7.5-12 5 7 3-4.5L25 23H3z" />
    <path d="M10.5 11V4.5l5 2-5 2" />
  </svg>
);

/* ---------- 1. Identificación ---------- */

export function Identificacion({
  dependencia,
  onDependencia,
  cuenta,
  microsoft,
  onMicrosoft,
  onSeguir,
  decir,
}: {
  dependencia: string;
  onDependencia: (v: string) => void;
  cuenta: CuentaMicrosoft | null;
  microsoft: EstadoMicrosoft;
  onMicrosoft: () => Promise<void>;
  onSeguir: () => void;
  decir: DecirGuia;
}) {
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const ocupado = yendo || microsoft.fase === "verificando";

  const revisar = (): boolean => {
    const e = validarDependencia(dependencia);
    setError(e);
    if (e) {
      decir(GUIA.revisar, "neutral");
      campo.current?.focus();
    }
    return !e;
  };

  const alEnviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (ocupado || !revisar()) return;
    if (cuenta) return onSeguir();
    setYendo(true);
    try {
      await onMicrosoft();
    } catch (e) {
      setYendo(false);
      const m = `No se pudo abrir Microsoft${e instanceof Error && e.message ? `: ${e.message}` : "."} Pruebe de nuevo.`;
      setError(m);
      decir(m, "neutral");
    }
  };

  return (
    <form className="ep-panel" onSubmit={(e) => void alEnviar(e)} noValidate aria-label="Identificación">
      <h2>Identifíquese con su correo institucional</h2>
      <p className="ep-lede">Solo ingresan los correos de la UDES. Verificamos su cuenta con Microsoft y no guardamos su contraseña.</p>

      {cuenta ? (
        <div className="ep-verificado" role="status">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="9" />
            <path d="M6.8 11.4l3 3 5.6-6" />
          </svg>
          <span>
            Correo confirmado por Microsoft: <b>{cuenta.correo}</b>
          </span>
        </div>
      ) : null}

      <div className="ep-campo">
        <label htmlFor="ep-dep">Dependencia</label>
        <input
          ref={campo}
          id="ep-dep"
          className="ep-input"
          type="text"
          autoComplete="organization"
          placeholder="Por ejemplo, Facultad de Ingenierías"
          maxLength={LIMITES.dependencia.max}
          value={dependencia}
          aria-invalid={error ? true : undefined}
          aria-describedby="ep-dep-e"
          onChange={(e) => {
            onDependencia(e.target.value);
            setError(null);
          }}
          onFocus={() => decir("Escriba el nombre de su dependencia, como la conoce la comunidad. Por ejemplo: Facultad de Ingenierías o Bienestar Universitario.", "feliz")}
        />
        <div id="ep-dep-e" className="ep-error" role="alert">
          {error}
        </div>
      </div>

      {microsoft.fase === "error" && (
        <p className="ep-error ep-error--bloque" role="alert">
          {microsoft.mensaje}
        </p>
      )}

      <div className="ep-acciones">
        <button type="submit" className="ep-btn ep-btn--pri" disabled={ocupado}>
          {cuenta ? (
            "Continuar"
          ) : (
            <>
              <IconoMicrosoft />
              <span>{yendo ? "Abriendo Microsoft…" : microsoft.fase === "verificando" ? "Confirmando con Microsoft…" : "Continuar con Microsoft"}</span>
            </>
          )}
        </button>
      </div>
      <p className="ep-fino">Correos admitidos: {DOMINIOS_VISIBLES.map((d) => `@${d}`).join(", ")}.</p>
    </form>
  );
}

/* ---------- 2. Qué enviar ---------- */

export function Elegir({
  cuenta,
  dependencia,
  aportes,
  enviando,
  error,
  onElegir,
  onQuitar,
  onEnviar,
}: {
  cuenta: CuentaMicrosoft;
  dependencia: string;
  aportes: readonly AporteEnvio[];
  enviando: boolean;
  /** El error del último intento de envío, con su reintento. */
  error: string | null;
  onElegir: (t: TipoAporte) => void;
  onQuitar: (i: number) => void;
  onEnviar: () => void;
}) {
  const hay = aportes.length > 0;
  return (
    <div className="ep-panel">
      <div className="ep-verificado" role="status">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="9" />
          <path d="M6.8 11.4l3 3 5.6-6" />
        </svg>
        <span>
          {cuenta.correo} · {dependencia}
        </span>
      </div>
      <h2>¿Qué quiere contar?</h2>
      <p className="ep-lede">Elija uno. Al guardarlo podrá registrar otro logro, otro reto o enviar todo.</p>
      <div className="ep-elegir">
        <button type="button" className="ep-opcion" data-k="logro" onClick={() => onElegir("logro")} disabled={!caben(aportes.length) || enviando}>
          <span className="ep-opcion__ic">
            <IconoLogro />
          </span>
          <b>Logro</b>
          <span className="ep-opcion__d">Algo que su dependencia consiguió y merece destacarse.</span>
        </button>
        <button type="button" className="ep-opcion" data-k="reto" onClick={() => onElegir("reto")} disabled={!caben(aportes.length) || enviando}>
          <span className="ep-opcion__ic">
            <IconoReto />
          </span>
          <b>Reto</b>
          <span className="ep-opcion__d">Lo que falta por lograr o lo que exige más esfuerzo.</span>
        </button>
      </div>
      {!caben(aportes.length) && <p className="ep-fino">Llegó al máximo de {LIMITES.aportes} aportes por envío. Envíe estos y vuelva a empezar.</p>}

      <div className="ep-cola">
        <h3 id="ep-cola-h">Lo que lleva registrado</h3>
        {hay ? (
          <ul aria-labelledby="ep-cola-h">
            {aportes.map((a, i) => (
              <li key={`${i}:${a.titulo}`}>
                <span className={`ep-tag ep-tag--${a.tipo}`}>{textoTipoAporte(a.tipo)}</span>
                <div>
                  <div className="ep-cola__t">{a.titulo}</div>
                  <div className="ep-cola__m">{a.cifras.length === 1 ? "1 cifra" : `${a.cifras.length} cifras`}</div>
                </div>
                <button type="button" className="ep-quitar" aria-label={`Quitar: ${a.titulo}`} onClick={() => onQuitar(i)} disabled={enviando}>
                  <IconoQuitar />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ep-vacio">Aún no hay nada. Lo que guarde aparece aquí antes de enviarlo.</div>
        )}
      </div>

      {error && (
        <p className="ep-error ep-error--bloque" role="alert">
          {error}
        </p>
      )}
      <div className="ep-acciones">
        <button type="button" className="ep-btn ep-btn--pri" disabled={!hay || enviando} onClick={onEnviar}>
          {enviando ? "Enviando…" : error ? `Reintentar el envío (${aportes.length})` : hay ? `Enviar todo (${aportes.length})` : "Enviar todo"}
        </button>
        <span className="ep-fino">{hay ? "Cuando envíe, me despido." : "Registre al menos uno para poder enviar."}</span>
      </div>
    </div>
  );
}

/* ---------- 3. Detalle de un aporte ---------- */

let contadorCifras = 0;
const cifraNueva = (): CifraBorrador => ({ id: ++contadorCifras, que: "", tipo: "", otro: "", valor: "" });

export function Detalle({
  tipo,
  onGuardar,
  onVolver,
  decir,
}: {
  tipo: TipoAporte;
  onGuardar: (a: AporteEnvio) => void;
  onVolver: () => void;
  decir: DecirGuia;
}) {
  const [sub, setSub] = useState<1 | 2 | 3>(1);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cifras, setCifras] = useState<CifraBorrador[]>(() => [cifraNueva()]);
  const [errorTexto, setErrorTexto] = useState<string | null>(null);
  const [erroresCifra, setErroresCifra] = useState<Map<number, { campo: string; mensaje: string }>>(new Map());
  const [errorCifras, setErrorCifras] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const primera = useRef(true);

  // Cada subpaso: Pilo lo explica y el foco va al primer campo.
  useEffect(() => {
    const [texto, gesto] = guiaDetalle(sub, tipo);
    decir(texto, gesto, true);
    const t = window.setTimeout(() => {
      const el = raiz.current?.querySelector<HTMLElement>(sub === 1 ? "#ep-titulo" : sub === 2 ? "#ep-desc" : ".ep-cifra input");
      el?.focus({ preventScroll: primera.current });
      primera.current = false;
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el subpaso
  }, [sub]);

  const cambiarCifra = (id: number, cambio: Partial<CifraBorrador>) => {
    setCifras((l) => l.map((c) => (c.id === id ? { ...c, ...cambio } : c)));
    setErroresCifra((m) => {
      if (!m.has(id)) return m;
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    setErrorCifras(null);
  };

  const siguiente = () => {
    if (sub === 1) {
      const e = validarTitulo(titulo, tipo);
      setErrorTexto(e);
      if (e) {
        decir(GUIA.faltaAlgo, "neutral");
        raiz.current?.querySelector<HTMLElement>("#ep-titulo")?.focus();
        return;
      }
      return setSub(2);
    }
    if (sub === 2) {
      const e = validarDescripcion(descripcion);
      setErrorTexto(e);
      if (e) {
        decir(GUIA.faltaAlgo, "neutral");
        raiz.current?.querySelector<HTMLElement>("#ep-desc")?.focus();
        return;
      }
      return setSub(3);
    }
    const r = validarCifras(cifras);
    setErroresCifra(new Map([...r.errores].map(([k, v]) => [k, v])));
    setErrorCifras(r.general);
    if (r.general || r.errores.size) {
      decir(GUIA.faltaAlgo, "neutral");
      const primero = [...r.errores.entries()][0];
      if (primero) raiz.current?.querySelector<HTMLElement>(`#ep-c${primero[0]}-${primero[1].campo}`)?.focus();
      return;
    }
    onGuardar({ tipo, titulo: titulo.trim(), descripcion: descripcion.trim(), cifras: r.listas });
  };

  const atras = () => {
    setErrorTexto(null);
    if (sub > 1) setSub((sub - 1) as 1 | 2);
    else onVolver();
  };

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).matches("input[type=text]")) {
      e.preventDefault();
      siguiente();
    }
  };

  return (
    <div className="ep-panel" ref={raiz} onKeyDown={alTeclear}>
      <span className={`ep-chip ep-tag--${tipo}`}>{tipo === "logro" ? "Registrando un logro" : "Registrando un reto"}</span>

      {sub === 1 && (
        <div>
          <h2 id="ep-sub1-h">{tipo === "logro" ? "¿Cuál es el logro que quiere destacar?" : "¿Cuál es el reto que enfrenta?"}</h2>
          <p className="ep-lede">Una frase corta, como el título que verá en el video.</p>
          <input
            id="ep-titulo"
            className="ep-input ep-input--sep"
            type="text"
            maxLength={LIMITES.titulo.max}
            autoComplete="off"
            placeholder={tipo === "logro" ? "Por ejemplo, Acreditación de alta calidad del programa" : "Por ejemplo, Aumentar la permanencia en primer semestre"}
            value={titulo}
            aria-labelledby="ep-sub1-h"
            aria-describedby="ep-texto-e ep-titulo-c"
            aria-invalid={errorTexto ? true : undefined}
            onChange={(e) => {
              setTitulo(e.target.value);
              setErrorTexto(null);
            }}
          />
          <div id="ep-texto-e" className="ep-error" role="alert">
            {errorTexto}
          </div>
          <div id="ep-titulo-c" className="ep-cuenta">
            {titulo.length}/{LIMITES.titulo.max}
          </div>
        </div>
      )}

      {sub === 2 && (
        <div>
          <h2>Descríbalo en pocas líneas</h2>
          <p className="ep-lede">Qué se hizo, para quién y qué cambió. Máximo {LIMITES.descripcion.max} caracteres.</p>
          <label className="ep-sr" htmlFor="ep-desc">
            Descripción
          </label>
          <textarea
            id="ep-desc"
            className="ep-input ep-input--sep ep-input--area"
            maxLength={LIMITES.descripcion.max}
            value={descripcion}
            aria-describedby="ep-texto-e ep-desc-c"
            aria-invalid={errorTexto ? true : undefined}
            onChange={(e) => {
              setDescripcion(e.target.value);
              setErrorTexto(null);
            }}
          />
          <div id="ep-texto-e" className="ep-error" role="alert">
            {errorTexto}
          </div>
          <div id="ep-desc-c" className="ep-cuenta" data-cerca={descripcion.length >= 450 ? "1" : undefined}>
            {descripcion.length}/{LIMITES.descripcion.max}
          </div>
        </div>
      )}

      {sub === 3 && (
        <div>
          <h2>¿Qué cifras lo respaldan?</h2>
          <p className="ep-lede">Cada cifra dice qué es, de qué tipo es y cuánto vale. Agregue las que quiera (hasta {LIMITES.cifras}).</p>
          <div className="ep-cifras">
            {cifras.map((c) => {
              const err = erroresCifra.get(c.id);
              const n = leerNumero(c.valor);
              return (
                <fieldset key={c.id} className="ep-cifra">
                  <legend className="ep-sr">Cifra {cifras.indexOf(c) + 1}</legend>
                  <div className="ep-campo">
                    <label htmlFor={`ep-c${c.id}-que`}>Qué es la cifra</label>
                    <input id={`ep-c${c.id}-que`} className="ep-input" type="text" maxLength={LIMITES.que.max} placeholder="Por ejemplo, Graduados en 2025" value={c.que} aria-invalid={err?.campo === "que" ? true : undefined} onChange={(e) => cambiarCifra(c.id, { que: e.target.value })} />
                  </div>
                  <div className="ep-campo">
                    <label htmlFor={`ep-c${c.id}-tipo`}>Tipo de cifra</label>
                    <select id={`ep-c${c.id}-tipo`} className="ep-input" value={c.tipo} aria-invalid={err?.campo === "tipo" ? true : undefined} onChange={(e) => cambiarCifra(c.id, { tipo: e.target.value as CifraBorrador["tipo"] })}>
                      <option value="">Elegir…</option>
                      {TIPOS_CIFRA.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.texto}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ep-campo">
                    <label htmlFor={`ep-c${c.id}-valor`}>Valor numérico</label>
                    <div className="ep-valor">
                      {c.tipo === "dinero" && <span className="ep-unidad ep-unidad--i">$</span>}
                      <input
                        id={`ep-c${c.id}-valor`}
                        className={`ep-input${c.tipo === "dinero" ? " ep-input--pi" : ""}${c.tipo === "porcentaje" ? " ep-input--pd" : ""}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={c.valor}
                        aria-invalid={err?.campo === "valor" ? true : undefined}
                        onChange={(e) => cambiarCifra(c.id, { valor: e.target.value })}
                      />
                      {c.tipo === "porcentaje" && <span className="ep-unidad ep-unidad--d">%</span>}
                    </div>
                    <div className="ep-eco" aria-live="polite">
                      {c.valor && n !== null && c.tipo ? `Se leerá como ${formatearValor(n, c.tipo)}` : ""}
                    </div>
                  </div>
                  {cifras.length > 1 && (
                    <button type="button" className="ep-quitar ep-quitar--cifra" aria-label={`Quitar la cifra ${cifras.indexOf(c) + 1}`} onClick={() => setCifras((l) => l.filter((x) => x.id !== c.id))}>
                      <IconoQuitar />
                    </button>
                  )}
                  {c.tipo === "otro" && (
                    <div className="ep-campo ep-cifra__otro">
                      <label htmlFor={`ep-c${c.id}-otro`}>¿Qué tipo es? Defínalo en una palabra</label>
                      <input id={`ep-c${c.id}-otro`} className="ep-input" type="text" maxLength={LIMITES.otro.max} placeholder="Por ejemplo, Convenios" value={c.otro} aria-invalid={err?.campo === "otro" ? true : undefined} onChange={(e) => cambiarCifra(c.id, { otro: e.target.value })} />
                    </div>
                  )}
                  <div className="ep-error ep-cifra__e" role="alert">
                    {err?.mensaje}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="ep-error" role="alert">
            {errorCifras}
          </div>
          <div className="ep-acciones ep-acciones--sep">
            <button
              type="button"
              className="ep-btn"
              disabled={cifras.length >= LIMITES.cifras}
              onClick={() => {
                const nueva = cifraNueva();
                setCifras((l) => [...l, nueva]);
                decir(GUIA.otraCifra, "atrevido");
                window.setTimeout(() => raiz.current?.querySelector<HTMLElement>(`#ep-c${nueva.id}-que`)?.focus(), 30);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M9 3v12M3 9h12" />
              </svg>
              Agregar otra cifra
            </button>
          </div>
        </div>
      )}

      <div className="ep-acciones ep-nav">
        <button type="button" className="ep-btn ep-btn--suave" onClick={atras}>
          {sub === 1 ? "Cambiar" : "Atrás"}
        </button>
        <span className="ep-espacio" />
        <div className="ep-puntos" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= sub ? "on" : undefined} />
          ))}
        </div>
        <button type="button" className="ep-btn ep-btn--pri" onClick={siguiente}>
          {sub === 3 ? `Guardar ${tipo}` : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
