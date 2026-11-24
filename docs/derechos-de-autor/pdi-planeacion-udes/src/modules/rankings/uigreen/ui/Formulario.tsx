/* =============================================================================
   UI GreenMetric · el formulario de un indicador, generado del esquema de campos
   del catálogo: números (con «cuál manda» frente a Datos de Sostenibilidad),
   textos, enlaces, fechas, opciones, ODS y tablas; la razón se calcula en vivo.
   ========================================================================== */

import type { ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { aNumero, formatearNumero, puntosEstimados, quienManda, textoDelCalculo } from "../lib/calculo";
import type { ResultadoCalculo } from "../lib/calculo";
import type { CampoEsquema, FilaTabla, PreguntaCiclo, TablaEsquema, ValorCampo, VinculoDato } from "../lib/tipos";
import { Alerta, Campo } from "./comunes";

export interface Borrador {
  valores: Record<string, ValorCampo>;
  textos_es: Record<string, string>;
  textos_en: Record<string, string>;
  tablas: Record<string, FilaTabla[]>;
  tablas_en: Record<string, FilaTabla[]>;
  opcion: number | null;
}

export type Cambiar = (f: (b: Borrador) => Borrador) => void;

interface Props {
  p: PreguntaCiclo;
  b: Borrador;
  cambiar: Cambiar;
  editable: boolean;
  vinculos: VinculoDato[];
  calculo: ResultadoCalculo | null;
  esAdmin: boolean;
  anioDatos: number;
  /** Las claves de los campos a mostrar en este bloque (los de texto traducible van en su pestaña). */
  soloNoTexto?: boolean;
}

export function textoPeriodo(periodo: PreguntaCiclo["periodo"], anio: number): string {
  if (periodo === "actual") return `Datos del año ${anio}`;
  if (periodo === "anterior") return `Datos del año ${anio - 1}`;
  if (periodo === "tres_anios") return `Tres años: ${anio - 2}, ${anio - 1} y ${anio}`;
  if (periodo === "serie") return "Serie de años";
  return "Sin periodo definido por la guía";
}

const esTexto = (c: CampoEsquema) => c.tipo === "texto" || c.tipo === "texto_largo";

export function Formulario({ p, b, cambiar, editable, vinculos, calculo, esAdmin, anioDatos }: Props) {
  const campos = p.esquema.campos.filter((c) => !esTexto(c));
  const poner = (k: string, v: ValorCampo) => cambiar((x) => ({ ...x, valores: { ...x.valores, [k]: v } }));

  return (
    <div className="ugm-form">
      <p className="ugm-periodo">
        <Icon name="clock" size={16} /> {textoPeriodo(p.periodo, anioDatos)}
        {p.unidad ? <span className="ugm-muted"> · unidad: {p.unidad}</span> : null}
      </p>
      {campos.map((c) => {
        const id = `cp-${c.k}`;
        const rotulo = c.es + (c.obligatorio ? " *" : "");
        if (c.tipo === "numero") {
          const v = vinculos.find((x) => x.campo === c.k);
          const dec = quienManda(v, aNumero(b.valores[c.k]));
          return (
            <Campo key={c.k} id={id} etiqueta={rotulo} ayuda={c.unidad ? `En ${c.unidad}.` : undefined}>
              <div className="ugm-numero">
                <input
                  id={id}
                  className="ugm-input ugm-num"
                  inputMode="decimal"
                  value={dec.soloLectura ? formatearNumero(dec.valor, 4) : String(b.valores[c.k] ?? "")}
                  readOnly={dec.soloLectura || !editable}
                  aria-describedby={v ? `${id}-manda` : undefined}
                  onChange={(e) => poner(c.k, e.target.value)}
                />
                {c.unidad && <span className="ugm-unidad">{c.unidad}</span>}
              </div>
              {v && (
                <div id={`${id}-manda`} className="ugm-manda">
                  {dec.manda === "tabla" ? (
                    <span className="ugm-etq ugm-etq--tabla"><Icon name="table" size={14} /> Manda la tabla: el campo se recalcula si la tabla cambia</span>
                  ) : (
                    <span className="ugm-etq"><Icon name="pen" size={14} /> Manda lo escrito a mano</span>
                  )}
                  {dec.ofrecerTabla && editable && (
                    <button type="button" className="ugm-link" onClick={() => poner(c.k, dec.valorTabla)}>
                      La tabla daría {formatearNumero(dec.valorTabla, 4)}. Usar la de la tabla
                    </button>
                  )}
                  {dec.sinDatoEnTabla && <span className="ugm-falta">La tabla no da dato para ese periodo.</span>}
                  {dec.tablaSinPublicar && <span className="ugm-falta">La tabla no está publicada: el indicador no podrá salir en la web.</span>}
                </div>
              )}
            </Campo>
          );
        }
        if (c.tipo === "url") {
          return (
            <Campo key={c.k} id={id} etiqueta={rotulo} ayuda="Debe ser de acceso público (https://).">
              <input id={id} className="ugm-input" type="url" inputMode="url" value={String(b.valores[c.k] ?? "")} readOnly={!editable} onChange={(e) => poner(c.k, e.target.value)} placeholder="https://" />
            </Campo>
          );
        }
        if (c.tipo === "fecha") {
          return (
            <Campo key={c.k} id={id} etiqueta={rotulo}>
              <input id={id} className="ugm-input" type="date" value={String(b.valores[c.k] ?? "")} readOnly={!editable} onChange={(e) => poner(c.k, e.target.value)} />
            </Campo>
          );
        }
        if (c.tipo === "ods") {
          const lista = Array.isArray(b.valores[c.k]) ? (b.valores[c.k] as number[]) : [];
          return (
            <fieldset key={c.k} className="ugm-fs">
              <legend>{rotulo}</legend>
              <div className="ugm-chips">
                {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className="ugm-chip ugm-chip--num" aria-pressed={lista.includes(n)} disabled={!editable} onClick={() => poner(c.k, lista.includes(n) ? lista.filter((x) => x !== n) : [...lista, n].sort((a, z) => a - z))}>
                    {n}
                  </button>
                ))}
              </div>
              <small className="ugm-muted">{lista.length} {lista.length === 1 ? "ODS marcado" : "ODS marcados"}.</small>
            </fieldset>
          );
        }
        if (c.tipo === "opcion") {
          return <Opciones key={c.k} p={p} c={c} b={b} cambiar={cambiar} editable={editable} calculo={calculo} esAdmin={esAdmin} />;
        }
        return null;
      })}

      {p.esquema.tablas.map((t) => (
        <TablaEditor key={t.k} t={t} filas={b.tablas[t.k] ?? []} editable={editable} onChange={(f) => cambiar((x) => ({ ...x, tablas: { ...x.tablas, [t.k]: f } }))} />
      ))}

      {(p.esquema.calculo || p.calculada) && <CajaCalculo p={p} calculo={calculo} esAdmin={esAdmin} />}
    </div>
  );
}

function Opciones({ p, c, b, cambiar, editable, calculo, esAdmin }: { p: PreguntaCiclo; c: CampoEsquema; b: Borrador; cambiar: Cambiar; editable: boolean; calculo: ResultadoCalculo | null; esAdmin: boolean }) {
  const derivada = !!c.derivada || !!calculo;
  const valor = derivada ? (calculo?.opcion ?? null) : b.opcion;
  const opciones = p.opciones ?? [];
  return (
    <fieldset className="ugm-fs">
      <legend>
        {c.es}
        {c.obligatorio ? " *" : ""}
      </legend>
      {derivada && <p className="ugm-muted ugm-peq">La opción sale sola de la razón calculada; no se elige.</p>}
      <div className="ugm-radios" role="radiogroup" aria-label={c.es}>
        {opciones.map((o) => (
          <label key={o.valor} className={`ugm-radio${valor === o.valor ? " ugm-radio--on" : ""}`}>
            <input type="radio" name={`op-${p.q}`} checked={valor === o.valor} disabled={!editable || derivada} onChange={() => cambiar((x) => ({ ...x, opcion: o.valor }))} />
            <span>
              {esAdmin && <b className="ugm-num ugm-cod">{o.valor}</b>} {o.es}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CajaCalculo({ p, calculo, esAdmin }: { p: PreguntaCiclo; calculo: ResultadoCalculo | null; esAdmin: boolean }) {
  const pts = esAdmin ? puntosEstimados(p, calculo?.opcion ?? null) : null;
  return (
    <section className="ugm-calculo" aria-live="polite">
      <h3>Razón calculada</h3>
      {calculo && calculo.valor !== null ? (
        <>
          <p className="ugm-calculo__valor ugm-num">
            {formatearNumero(calculo.valor, calculo.unidad === "%" ? 2 : 4)} <span>{calculo.unidad}</span>
          </p>
          <p className="ugm-muted">{textoDelCalculo(calculo)}</p>
          {esAdmin && calculo.opcion !== null && (
            <p className="ugm-peq">
              Opción {calculo.opcion}
              {pts !== null ? ` · estimación ${formatearNumero(pts, 0)} de ${p.puntos} puntos (interna, no es el puntaje oficial)` : ""}.
            </p>
          )}
        </>
      ) : (
        <p className="ugm-muted">
          Se calcula cuando estén los datos: {p.esquema.calculo?.entradas.map((e) => e.desde).join(", ") ?? "las preguntas que la alimentan"}.
          {calculo?.faltan.length ? <> Falta: {calculo.faltan.join(", ")}.</> : null}
        </p>
      )}
    </section>
  );
}

export function TablaEditor({ t, filas, editable, onChange, en = false }: { t: TablaEsquema; filas: FilaTabla[]; editable: boolean; onChange: (f: FilaTabla[]) => void; en?: boolean }) {
  const columnas = en ? t.columnas.filter((c) => c.tipo === "texto") : t.columnas;
  const vacia = (): FilaTabla => Object.fromEntries(t.columnas.map((c) => [c.k, c.tipo === "numero" ? null : ""]));
  const poner = (i: number, k: string, v: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const sugerir = () => {
    const primera = t.columnas[0]?.k;
    if (!primera || !t.filas?.length) return;
    const ya = new Set(filas.map((f) => String(f[primera] ?? "")));
    onChange([...filas, ...t.filas.filter((x) => !ya.has(x)).map((x) => ({ ...vacia(), [primera]: x }))]);
  };
  return (
    <section className="ugm-sec ugm-sec--tabla">
      <h3>{en ? t.en : t.es}</h3>
      {t.min ? <p className="ugm-muted ugm-peq">Mínimo {t.min} {t.min === 1 ? "fila" : "filas"} para enviar.</p> : null}
      {filas.length === 0 ? (
        <p className="ugm-muted">Sin filas todavía.</p>
      ) : (
        <div className="ugm-tabla-marco">
          <table className="ugm-tabla ugm-tabla--edit">
            <thead>
              <tr>
                {columnas.map((c) => (
                  <th key={c.k} scope="col" className={c.tipo === "numero" ? "ugm-der" : undefined}>
                    {en ? c.en : c.es}
                    {c.unidad ? <small> ({c.unidad})</small> : null}
                  </th>
                ))}
                {editable && !en && <th scope="col"><span className="ugm-sr">Quitar</span></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  {columnas.map((c) => (
                    <td key={c.k}>
                      <input
                        className={`ugm-input ugm-input--celda${c.tipo === "numero" ? " ugm-num ugm-der" : ""}`}
                        aria-label={`${en ? c.en : c.es}, fila ${i + 1}`}
                        type={c.tipo === "fecha" ? "date" : "text"}
                        inputMode={c.tipo === "numero" ? "decimal" : undefined}
                        value={String(f[c.k] ?? "")}
                        readOnly={!editable}
                        onChange={(e) => poner(i, c.k, e.target.value)}
                      />
                    </td>
                  ))}
                  {editable && !en && (
                    <td>
                      <button type="button" className="ugm-btn ugm-btn--icono" aria-label={`Quitar la fila ${i + 1}`} onClick={() => onChange(filas.filter((_, j) => j !== i))}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && !en && (
        <div className="ugm-acciones">
          <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => onChange([...filas, vacia()])}>
            <Icon name="plus" size={16} /> Agregar fila
          </button>
          {t.filas?.length ? (
            <button type="button" className="ugm-btn ugm-btn--sm" onClick={sugerir}>
              Agregar las filas sugeridas
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Pestaña de texto en español: los campos de texto del esquema. */
export function TextosEs({ p, b, cambiar, editable }: { p: PreguntaCiclo; b: Borrador; cambiar: Cambiar; editable: boolean }): ReactNode {
  const campos = p.esquema.campos.filter(esTexto);
  if (!campos.length) return <Alerta>Este indicador no lleva descripción: solo datos y evidencias.</Alerta>;
  return (
    <>
      {campos.map((c) => {
        const id = `tx-${c.k}`;
        const largo = c.tipo === "texto_largo";
        const v = b.textos_es[c.k] ?? "";
        return (
          <Campo key={c.k} id={id} etiqueta={c.es + (c.obligatorio ? " *" : "")} ayuda={largo ? "Con cifras, fechas y lugares. Los mapas y fotos van en Evidencias." : undefined}>
            {largo ? (
              <textarea id={id} className="ugm-input ugm-area" rows={5} value={v} readOnly={!editable} onChange={(e) => cambiar((x) => ({ ...x, textos_es: { ...x.textos_es, [c.k]: e.target.value } }))} />
            ) : (
              <input id={id} className="ugm-input" value={v} readOnly={!editable} onChange={(e) => cambiar((x) => ({ ...x, textos_es: { ...x.textos_es, [c.k]: e.target.value } }))} />
            )}
            <span className="ugm-contador ugm-num">{v.length} caracteres</span>
          </Campo>
        );
      })}
    </>
  );
}
