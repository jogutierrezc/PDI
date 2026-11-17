/* =============================================================================
   Presentación con Pilo · las diapositivas, dibujadas sobre los seis fondos de la
   plantilla institucional «Bucaramanga 2026» en un lienzo de 1920×1080.

   Diseño aprobado (artifact de referencia): Montserrat, azules #0A47A1/#072B63/#1B7FD0,
   tarjetas, tablas, gráfica de cumplimiento con barras apiladas verde/amarillo/gris y
   leyenda; los estados siempre con su palabra. El logo de la plantilla ocupa la esquina
   inferior derecha: el contenido no pasa de y≈900. Los bloques animables llevan
   `data-a` (orden de entrada); la animación la pone el Visor con GSAP.
   ========================================================================== */

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { bandaCorta, fondoDe } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import type { Diapositiva } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import { IMAGEN_ANIMO, TEXTO_ANIMO, claseEstado, cuerpoCifra, cuerpoTitulo, filaTotal, fondoUrl, lineasDe, medidasTabla, partesBarra } from "./modelo";
import type { Ruta } from "./modelo";
import "./presentacion.css";

export const ANCHO = 1920;
export const ALTO = 1080;

interface Edicion {
  activa: boolean;
  editar?: (ruta: Ruta, valor: string) => void;
}
const EdicionCtx = createContext<Edicion>({ activa: false });
export const ProveedorEdicion = EdicionCtx.Provider;

/** Un texto de la diapositiva: en modo edición, un campo en línea (texto plano); si no, texto. */
function Ed({ r, v, as: Tag = "span", className, style, a }: { r: Ruta; v: string; as?: ElementType; className?: string; style?: CSSProperties; a?: number }) {
  const { activa, editar } = useContext(EdicionCtx);
  const extra = a === undefined ? {} : { "data-a": a };
  if (!activa || !editar) {
    return (
      <Tag className={className} style={style} {...extra}>
        {v}
      </Tag>
    );
  }
  return (
    <Tag
      className={`${className ?? ""} pr-ed`}
      style={style}
      {...extra}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label="Editar texto"
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = v;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const t = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t && t !== v) editar(r, t);
        else if (!t) e.currentTarget.textContent = v;
      }}
    >
      {v}
    </Tag>
  );
}

function Pilo({ d, x, y, w }: { d: Diapositiva; x: number; y: number; w: number }) {
  if (!d.animo) return null;
  return <img className="pr-pilo" data-a={20} src={IMAGEN_ANIMO[d.animo]} alt={TEXTO_ANIMO[d.animo]} style={{ left: x, top: y, width: w, height: w }} />;
}

const useLayoutIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Menor escala a la que se permite achicar un contenido que no cabe (más abajo ya no se lee). */
export const ESCALA_MIN = 0.6;

/**
 * El contenido en flujo de una diapositiva con márgenes (franja o banda). Si no cabe en la zona
 * segura (por encima del logo de la plantilla), se achica en pasos de 5 % hasta que quepa: el texto
 * nunca se corta ni invade el logo. El ancho se compensa para que la tabla o las tarjetas sigan
 * ocupando todo el ancho útil.
 */
function Flujo({ alto, d, children }: { alto: number; d: Diapositiva; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutIso(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => {
      let k = 1;
      el.style.transform = "";
      el.style.width = "";
      while (el.offsetHeight > alto + 1 && k > ESCALA_MIN) {
        k = Math.round((k - 0.05) * 100) / 100;
        el.style.width = `${100 / k}%`;
        el.style.transform = `scale(${k})`;
        el.style.transformOrigin = "0 0";
        // Con la escala, la caja ocupa lo mismo que antes: el alto que cuenta es el escalado.
        if (el.offsetHeight * k <= alto + 1) break;
      }
      el.dataset.escala = String(k);
    };
    ajustar();
    // Si la tipografía llega después, se vuelve a medir.
    void document.fonts?.ready.then(ajustar);
  }, [d, alto]);
  return (
    <div ref={ref} className="pr-flujo">
      {children}
    </div>
  );
}

/** Marco de una diapositiva: el fondo de la plantilla; lo absoluto (`fijos`) fuera del flujo, lo demás dentro. */
function Marco({ d, fondo, children, fijos, clase }: { d: Diapositiva; fondo: number; children: ReactNode; fijos?: ReactNode; clase?: string }) {
  const alto = clase === "pr-l2" ? 760 : clase === "pr-l3" ? 654 : 0;
  return (
    <section className={`pr-sl ${clase ?? ""}`} data-fondo={fondo} data-tipo={d.tipo} style={{ width: ANCHO, height: ALTO }}>
      <img className="pr-bg" src={fondoUrl(fondo)} alt="" draggable={false} />
      {fijos}
      {alto ? <Flujo alto={alto} d={d}>{children}</Flujo> : children}
    </section>
  );
}

/** El título de la banda azul (fondos 3 y 4), con el aviso de «parte n/de» de las tablas partidas. */
const Banda = ({ titulo, corta }: { titulo: string; corta: boolean }) => (
  <Ed r={["titulo"]} v={titulo} as="h2" className={`pr-band ${corta ? "pr-band--s" : ""}`} a={0} />
);

export const textoEstado = { ok: "Completadas", pr: "En proceso", pe: "Pendientes" };

/* ---------- Una por tipo ---------- */

function Portada({ d }: { d: Extract<Diapositiva, { tipo: "portada" }> }) {
  const cuerpo = cuerpoTitulo(d.titulo.length, [[28, 92], [48, 76]], 62);
  return (
    <Marco d={d} fondo={1}>
      <div className="pr-portada">
        {d.etiqueta && <Ed r={["etiqueta"]} v={d.etiqueta} as="p" className="pr-pill" a={0} />}
        <Ed r={["titulo"]} v={d.titulo} as="h1" className="pr-h1" style={{ fontSize: cuerpo }} a={1} />
        <Ed r={["subtitulo"]} v={d.subtitulo} as="p" className="pr-sub" a={2} />
      </div>
      <Pilo d={d} x={1500} y={250} w={300} />
    </Marco>
  );
}

function Agenda({ d }: { d: Extract<Diapositiva, { tipo: "agenda" }> }) {
  const n = d.items.length;
  const cuerpo = n <= 5 ? 36 : n === 6 ? 32 : 29;
  const hueco = n <= 4 ? 38 : n === 5 ? 30 : n === 6 ? 20 : 14;
  return (
    <Marco d={d} fondo={2} clase="pr-l2" fijos={<Pilo d={d} x={1500} y={300} w={260} />}>
      <p className="pr-eye" data-a={0}>Recorrido</p>
      <Ed r={["titulo"]} v={d.titulo} as="h2" className="pr-t" a={1} />
      <div className="pr-agenda" style={{ gap: hueco }}>
        {d.items.map((it, i) => (
          <div className="pr-ag" data-a={2 + i} key={i}>
            <p className="pr-num">{String(i + 1).padStart(2, "0")}</p>
            <div>
              <Ed r={["items", i, "titulo"]} v={it.titulo} as="h3" style={{ fontSize: cuerpo }} />
              {it.detalle && <Ed r={["items", i, "detalle"]} v={it.detalle} as="p" style={{ fontSize: Math.round(cuerpo * 0.72) }} />}
            </div>
          </div>
        ))}
      </div>
    </Marco>
  );
}

function Seccion({ d }: { d: Extract<Diapositiva, { tipo: "seccion" }> }) {
  const cuerpo = cuerpoTitulo(d.titulo.length, [[36, 104], [60, 84]], 68);
  return (
    <Marco d={d} fondo={5}>
      <div className="pr-seccion">
        {(d.kicker || d.numero) && <Ed r={["kicker"]} v={d.kicker ?? d.numero ?? ""} as="p" className="pr-kick" a={0} />}
        <Ed r={["titulo"]} v={d.titulo} as="h1" className="pr-h1 pr-h1--sec" style={{ fontSize: cuerpo }} a={1} />
        {d.bajada && <Ed r={["bajada"]} v={d.bajada} as="p" className="pr-baj" a={2} />}
      </div>
      <Pilo d={d} x={1400} y={300} w={340} />
    </Marco>
  );
}

function Tabla({ d }: { d: Extract<Diapositiva, { tipo: "tabla" }> }) {
  const corta = bandaCorta(d.titulo);
  const { cuerpo, relleno, anchos } = medidasTabla(d.columnas, d.filas, 1630, d.intro ? 520 : 590);
  const nota = [d.nota, d.parte ? `Parte ${d.parte.n} de ${d.parte.de}` : ""].filter(Boolean).join(" · ");
  return (
    <Marco d={d} fondo={corta ? 4 : 3} clase="pr-l3" fijos={<><Banda titulo={d.titulo} corta={corta} /><Pilo d={d} x={1560} y={64} w={150} /></>}>
      {d.intro && <Ed r={["intro"]} v={d.intro} as="p" className="pr-lead" a={1} />}
      <table className="pr-tab" data-a={2} style={{ fontSize: cuerpo }}>
        <thead>
          <tr>
            {d.columnas.map((c, i) => (
              <th key={i} style={{ width: `${anchos[i]}%`, padding: `${relleno}px 24px` }}>
                <Ed r={["columnas", i]} v={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.filas.map((f, i) => (
            <tr key={i}>
              {f.map((c, j) => (
                <td key={j} className={claseEstado(c) ? `pr-${claseEstado(c)}` : ""} style={{ padding: `${relleno}px 24px` }}>
                  <Ed r={["filas", i, j]} v={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {nota && (d.nota ? <Ed r={["nota"]} v={nota} as="p" className="pr-note" a={3} /> : <p className="pr-note" data-a={3}>{nota}</p>)}
    </Marco>
  );
}

function Tarjetas({ d }: { d: Extract<Diapositiva, { tipo: "tarjetas" }> }) {
  const corta = bandaCorta(d.titulo);
  const n = d.tarjetas.length;
  const ancho = (1630 - (n - 1) * 32) / n - 88;
  const conCifra = d.tarjetas.some((t) => t.cifra);
  // Una sola medida para todas las cifras (la menor), y dos líneas de título si alguna lo necesita: así las tarjetas se alinean.
  const cuerpoGrande = Math.min(...d.tarjetas.filter((t) => t.cifra).map((t) => cuerpoCifra(t.cifra!, ancho)), 104);
  const tituloLargo = d.tarjetas.some((t) => lineasDe(t.titulo.length, 38, ancho) > 1);
  return (
    <Marco d={d} fondo={corta ? 4 : 3} clase="pr-l3" fijos={<><Banda titulo={d.titulo} corta={corta} /><Pilo d={d} x={1560} y={64} w={150} /></>}>
      {d.intro && <Ed r={["intro"]} v={d.intro} as="p" className="pr-lead" a={1} />}
      <div className="pr-row">
        {d.tarjetas.map((t, i) => (
          <div className="pr-card" data-a={2 + i} key={i}>
            <Ed r={["tarjetas", i, "titulo"]} v={t.titulo} as="h3" style={tituloLargo && conCifra ? { minHeight: "2.4em" } : undefined} />
            {t.cifra && <Ed r={["tarjetas", i, "cifra"]} v={t.cifra} as="p" className="pr-big" style={{ fontSize: cuerpoGrande }} />}
            <Ed r={["tarjetas", i, "texto"]} v={t.texto} as="p" style={conCifra ? undefined : { fontSize: 32 }} />
            {t.pie && <Ed r={["tarjetas", i, "pie"]} v={t.pie} as="p" className="pr-ph" />}
          </div>
        ))}
      </div>
      {d.destacado && (
        <div className="pr-dest" data-a={2 + n}>
          <Ed r={["destacado", "etiqueta"]} v={d.destacado.etiqueta} as="p" />
          <Ed r={["destacado", "valor"]} v={d.destacado.valor} as="p" className="pr-dest__v" />
        </div>
      )}
    </Marco>
  );
}

function Cifras({ d }: { d: Extract<Diapositiva, { tipo: "cifras" }> }) {
  const corta = bandaCorta(d.titulo);
  const n = d.cifras.length;
  const ancho = (1630 - (n - 1) * 32) / n - 88;
  const cuerpoGrande = Math.min(...d.cifras.map((c) => cuerpoCifra(c.valor, ancho)));
  const etiquetaLarga = d.cifras.some((c) => lineasDe(c.etiqueta.length, 34, ancho) > 1);
  return (
    <Marco d={d} fondo={corta ? 4 : 3} clase="pr-l3" fijos={<><Banda titulo={d.titulo} corta={corta} /><Pilo d={d} x={1560} y={64} w={150} /></>}>
      {d.intro && <Ed r={["intro"]} v={d.intro} as="p" className="pr-lead" a={1} />}
      <div className="pr-row">
        {d.cifras.map((c, i) => (
          <div className="pr-card pr-card--cifra" data-a={2 + i} key={i}>
            <Ed r={["cifras", i, "valor"]} v={c.valor} as="p" className="pr-big" style={{ fontSize: cuerpoGrande }} />
            <Ed r={["cifras", i, "etiqueta"]} v={c.etiqueta} as="h3" style={etiquetaLarga ? { minHeight: "3.6em" } : undefined} />
            {c.detalle && <Ed r={["cifras", i, "detalle"]} v={c.detalle} as="p" />}
          </div>
        ))}
      </div>
      {d.nota && <Ed r={["nota"]} v={d.nota} as="p" className="pr-note" a={3 + n} />}
    </Marco>
  );
}

function Cumplimiento({ d }: { d: Extract<Diapositiva, { tipo: "cumplimiento" }> }) {
  const corta = bandaCorta(d.titulo);
  const total = filaTotal(d.filas);
  const filas = total ? [...d.filas, total] : d.filas;
  const resumen = d.resumen ?? [];
  const hueco = filas.length > 5 ? 18 : 30;
  return (
    <Marco d={d} fondo={corta ? 4 : 3} clase="pr-l3" fijos={<><Banda titulo={d.titulo} corta={corta} /><Pilo d={d} x={1560} y={64} w={150} /></>}>
      <div className="pr-split">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="pr-eye" data-a={1}>Cumplimiento por dimensión</p>
          <div className="pr-gr" data-a={2} style={{ gap: hueco }} role="img" aria-label={`Cumplimiento: ${filas.map((f) => `${f.dimension}, ${f.completadas} completadas, ${f.en_proceso} en proceso, ${f.pendientes} pendientes`).join("; ")}`}>
            {filas.map((f, i) => {
              const b = partesBarra(f);
              const esTotal = total && i === filas.length - 1;
              return (
                <div className={`pr-gr-r ${esTotal ? "pr-gr-r--t" : ""}`} key={i}>
                  {esTotal ? <p className="pr-gr-n">{f.dimension}</p> : <Ed r={["filas", i, "dimension"]} v={f.dimension} as="p" className="pr-gr-n" />}
                  <div className="pr-gr-b">
                    {b.ok > 0 && <div className="pr-s-ok" style={{ flex: f.completadas }}><span>{f.completadas}</span></div>}
                    {b.pr > 0 && <div className="pr-s-pr" style={{ flex: f.en_proceso }}><span>{f.en_proceso}</span></div>}
                    {b.pe > 0 && <div className="pr-s-pe" style={{ flex: f.pendientes }}><span>{f.pendientes}</span></div>}
                    {b.total === 0 && <div className="pr-s-pe" style={{ flex: 1 }} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pr-lg" data-a={3}>
            <div><i className="pr-s-ok" /><p>{textoEstado.ok}</p></div>
            <div><i className="pr-s-pr" /><p>{textoEstado.pr}</p></div>
            <div><i className="pr-s-pe" /><p>{textoEstado.pe}</p></div>
          </div>
          {d.nota && <Ed r={["nota"]} v={d.nota} as="p" className="pr-note" a={4} />}
        </div>
        {resumen.length > 0 && (
          <div className="pr-minis">
            {resumen.map((r, i) => (
              <div className="pr-card pr-card--mini" data-a={3 + i} key={i}>
                <Ed r={["resumen", i, "valor"]} v={r.valor} as="p" className="pr-big" style={{ fontSize: cuerpoCifra(r.valor, 330, 68) }} />
                <Ed r={["resumen", i, "etiqueta"]} v={r.etiqueta} as="p" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Marco>
  );
}

function Logros({ d }: { d: Extract<Diapositiva, { tipo: "logros" }> }) {
  const corta = bandaCorta(d.titulo);
  return (
    <Marco d={d} fondo={corta ? 4 : 3} clase="pr-l3" fijos={<><Banda titulo={d.titulo} corta={corta} /><Pilo d={d} x={1560} y={64} w={150} /></>}>
      {d.intro && <Ed r={["intro"]} v={d.intro} as="p" className="pr-lead" a={1} />}
      <div className="pr-row">
        {d.logros.map((l, i) => (
          <div className="pr-card" data-a={2 + i} key={i}>
            <p className="pr-num">{String(i + 1).padStart(2, "0")}</p>
            <Ed r={["logros", i, "titulo"]} v={l.titulo} as="h3" />
            <Ed r={["logros", i, "resultado"]} v={l.resultado} as="p" />
            {l.evidencia && <Ed r={["logros", i, "evidencia"]} v={l.evidencia} as="p" className="pr-ph" />}
          </div>
        ))}
      </div>
    </Marco>
  );
}

function Evidencias({ d }: { d: Extract<Diapositiva, { tipo: "evidencias" }> }) {
  const corta = bandaCorta(d.titulo);
  const hayTabla = d.anexos.length > 0;
  const hayLado = d.fuentes.length > 0 || (d.enlaces?.length ?? 0) > 0;
  const cuerpo = d.anexos.length > 5 ? 26 : 28;
  return (
    <Marco d={d} fondo={corta ? 4 : 3} clase="pr-l3" fijos={<><Banda titulo={d.titulo} corta={corta} /><Pilo d={d} x={1560} y={64} w={150} /></>}>
      <div className="pr-split" style={{ marginTop: 8 }}>
        {hayTabla && (
          <div style={{ flex: 3, minWidth: 0 }}>
            <p className="pr-eye" data-a={1}>Anexos del informe</p>
            <table className="pr-tab" data-a={2} style={{ fontSize: cuerpo }}>
              <thead>
                <tr>
                  <th style={{ width: "12%" }}>N.º</th>
                  <th style={{ width: "46%" }}>Documento</th>
                  <th style={{ width: "42%" }}>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {d.anexos.map((a, i) => (
                  <tr key={i}>
                    <td><Ed r={["anexos", i, "n"]} v={a.n} /></td>
                    <td><Ed r={["anexos", i, "documento"]} v={a.documento} /></td>
                    <td>{a.descripcion ? <Ed r={["anexos", i, "descripcion"]} v={a.descripcion} /> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hayLado && (
          <div style={{ flex: 2, minWidth: 0 }}>
            <p className="pr-eye" data-a={3}>Fuentes de los datos</p>
            <div className="pr-card" data-a={4}>
              {d.fuentes.map((f, i) => (
                <Ed r={["fuentes", i]} v={f} as="p" key={i} />
              ))}
              {(d.enlaces ?? []).map((l, i) => (
                <p className="pr-enl" key={`e${i}`}>
                  <Ed r={["enlaces", i, "texto"]} v={l.texto} />
                  <span className="pr-url">{l.url}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </Marco>
  );
}

function Texto({ d }: { d: Extract<Diapositiva, { tipo: "texto" }> }) {
  const ancho = d.animo ? 1130 : 1300;
  const lineas = (d.parrafos ?? []).reduce((a, p) => a + lineasDe(p.length, 32, ancho), 0) + (d.puntos ?? []).reduce((a, p) => a + lineasDe(p.length, 34, ancho - 60), 0);
  const cuerpo = lineas > 9 ? 28 : 32;
  return (
    <Marco d={d} fondo={2} clase="pr-l2" fijos={<Pilo d={d} x={1500} y={300} w={260} />}>
      {d.eyebrow && <Ed r={["eyebrow"]} v={d.eyebrow} as="p" className="pr-eye" a={0} />}
      <Ed r={["titulo"]} v={d.titulo} as="h2" className="pr-t" a={1} />
      <div className={`pr-texto ${d.animo ? "pr-texto--pilo" : ""}`} style={{ fontSize: cuerpo }}>
        {(d.parrafos ?? []).map((p, i) => (
          <Ed r={["parrafos", i]} v={p} as="p" className="pr-par" a={2 + i} key={`p${i}`} />
        ))}
        {(d.puntos ?? []).length > 0 && (
          <ul className="pr-pts" data-a={3}>
            {(d.puntos ?? []).map((p, i) => (
              <li key={i}>
                <Ed r={["puntos", i]} v={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Marco>
  );
}

function Cierre({ d }: { d: Extract<Diapositiva, { tipo: "cierre" }> }) {
  return (
    <Marco d={d} fondo={6}>
      <Ed r={["titulo"]} v={d.titulo} as="h1" className="pr-cierre" a={0} />
      {d.contacto && <Ed r={["contacto"]} v={d.contacto} as="p" className="pr-contacto" a={1} />}
    </Marco>
  );
}

/** Una diapositiva, dibujada a 1920×1080. */
export function Lamina({ d, editable = false, onEditar }: { d: Diapositiva; editable?: boolean; onEditar?: (ruta: Ruta, valor: string) => void }) {
  const cuerpo = (() => {
    switch (d.tipo) {
      case "portada": return <Portada d={d} />;
      case "agenda": return <Agenda d={d} />;
      case "seccion": return <Seccion d={d} />;
      case "tabla": return <Tabla d={d} />;
      case "tarjetas": return <Tarjetas d={d} />;
      case "cifras": return <Cifras d={d} />;
      case "cumplimiento": return <Cumplimiento d={d} />;
      case "logros": return <Logros d={d} />;
      case "evidencias": return <Evidencias d={d} />;
      case "texto": return <Texto d={d} />;
      case "cierre": return <Cierre d={d} />;
    }
  })();
  return <ProveedorEdicion value={{ activa: editable, editar: onEditar }}>{cuerpo}</ProveedorEdicion>;
}

export { fondoDe };
