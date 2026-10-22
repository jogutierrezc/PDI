/* =============================================================================
   Encuestas con Pilo · propiedades de la pregunta y «Capa de Pilo».

   Validaciones según el tipo, la lógica «mostrar si» y la explicación que Pilo da
   de ese dato. El botón «Que Pilo la sugiera» pide un borrador a la IA ya integrada
   (pilo-ia); el borrador aparece aparte, anunciado por aria-live, y solo entra al
   texto si la persona lo acepta: nunca pisa lo que escribió. Sin IA, un mensaje
   claro y un texto de respaldo hecho con la propia pregunta.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sugerirExplicacion, SinSugerencia } from "../api";
import { mensajeSinIA, ofrecerBorrador, respaldoExplicacion } from "../lib/capaPilo";
import { OPERADORES } from "../lib/estructura";
import type { Condicion, Operador, Pregunta, Validaciones } from "../lib/estructura";
import { draftIn, kill, thinkingDots } from "../motion";
import type { CambioPregunta } from "./Lienzo";

const num = (s: string): number | undefined => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

export function PropiedadesCol({
  pregunta: p,
  anteriores,
  tituloEncuesta,
  puedeEditar,
  iaEncendida,
  onCambiar,
}: {
  pregunta: Pregunta | null;
  /** Las preguntas que están antes de esta: las únicas de las que puede depender. */
  anteriores: Pregunta[];
  tituloEncuesta: string;
  puedeEditar: boolean;
  /** La configuración de Pilo dice que la IA está encendida. */
  iaEncendida: boolean;
  onCambiar: CambioPregunta;
}) {
  const [borrador, setBorrador] = useState<{ para: string; texto: string; respaldo: boolean } | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const puntos = useRef<HTMLSpanElement>(null);

  // El borrador es de una pregunta: al cambiar de pregunta se descarta.
  useEffect(() => {
    setBorrador(null);
    setAviso("");
  }, [p?.id]);
  useLayoutEffect(() => {
    if (borrador) draftIn(caja.current);
  }, [borrador]);
  useEffect(() => {
    if (!pidiendo || !puntos.current) return;
    return thinkingDots(Array.from(puntos.current.children));
  }, [pidiendo]);
  useEffect(() => () => kill(caja.current), []);

  if (!p) return <aside className="ed-col ed-props" aria-label="Propiedades" />;
  const v: Validaciones = p.validaciones ?? {};
  const ponerV = (c: Partial<Validaciones>) => onCambiar({ validaciones: { ...v, ...c } }, `val:${p.id}:${Object.keys(c).join(",")}`);
  const explicacion = p.pilo?.explicacion ?? "";
  const ponerPilo = (c: Partial<NonNullable<Pregunta["pilo"]>>) => onCambiar({ pilo: { explicacion, ...p.pilo, ...c } }, `pilo:${p.id}:${Object.keys(c).join(",")}`);

  const sugerir = async () => {
    setPidiendo(true);
    setAviso("Pilo está pensando una explicación…");
    try {
      const t = await sugerirExplicacion({ tipo: p.tipo, enunciado: p.enunciado, apoyo: p.apoyo, opciones: p.opciones?.map((o) => o.texto), unidad: v.unidad, encuesta: tituloEncuesta });
      const o = ofrecerBorrador(explicacion, t);
      if (!o) throw new SinSugerencia("", "error");
      setBorrador({ para: p.id, texto: o.borrador, respaldo: false });
      setAviso(o.pisa ? "Pilo dejó un borrador aparte. Su texto sigue igual hasta que usted decida." : "Pilo dejó un borrador. Revíselo y úselo si le sirve.");
    } catch (e) {
      const motivo = e instanceof SinSugerencia ? e.motivo : "error";
      setBorrador({ para: p.id, texto: respaldoExplicacion(p), respaldo: true });
      setAviso(`${mensajeSinIA(motivo, e instanceof SinSugerencia ? e.message : "")} Dejé un texto de respaldo como borrador.`);
    } finally {
      setPidiendo(false);
    }
  };

  const usarBorrador = () => {
    if (!borrador) return;
    ponerPilo({ explicacion: borrador.texto });
    setBorrador(null);
    setAviso("Borrador aplicado. Puede seguir editándolo.");
  };

  const cond = p.mostrarSi;
  const ponerCond = (c: Condicion | undefined) => onCambiar({ mostrarSi: c }, c ? `cond:${p.id}` : undefined);
  const op = OPERADORES.find((o) => o.id === cond?.op);
  const origen = anteriores.find((a) => a.id === cond?.pregunta);

  return (
    <aside className="ed-col ed-props" aria-label="Propiedades de la pregunta">
      <fieldset className="ed-cerrado" disabled={!puedeEditar}>
        <section className="ed-card ed-pad">
          <h3 className="ed-h3">Validaciones</h3>
          {(p.tipo === "texto_corto" || p.tipo === "parrafo") && (
            <div className="ed-dos">
              <div className="ed-field">
                <label htmlFor="v-lmin">Largo mínimo</label>
                <input id="v-lmin" className="ed-in" type="number" min={0} value={v.largoMin ?? ""} onChange={(e) => ponerV({ largoMin: num(e.target.value) })} />
              </div>
              <div className="ed-field">
                <label htmlFor="v-lmax">Largo máximo</label>
                <input id="v-lmax" className="ed-in" type="number" min={1} value={v.largoMax ?? ""} onChange={(e) => ponerV({ largoMax: num(e.target.value) })} />
              </div>
            </div>
          )}
          {p.tipo === "cifra" && (
            <>
              <div className="ed-field">
                <label htmlFor="v-unidad">Unidad</label>
                <input id="v-unidad" className="ed-in" list="ed-unidades" maxLength={30} value={v.unidad ?? ""} onChange={(e) => ponerV({ unidad: e.target.value || undefined })} />
                <datalist id="ed-unidades">
                  {["estudiantes", "programas", "porcentaje", "dinero", "personas", "horas"].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              <div className="ed-dos">
                <div className="ed-field">
                  <label htmlFor="v-min">Mínimo</label>
                  <input id="v-min" className="ed-in" type="number" value={v.min ?? ""} onChange={(e) => ponerV({ min: num(e.target.value) })} />
                </div>
                <div className="ed-field">
                  <label htmlFor="v-max">Máximo</label>
                  <input id="v-max" className="ed-in" type="number" value={v.max ?? ""} onChange={(e) => ponerV({ max: num(e.target.value) })} />
                </div>
              </div>
              <button type="button" className="ed-sw" role="switch" aria-checked={v.decimales !== false} onClick={() => ponerV({ decimales: v.decimales === false })}>
                <span className="ed-sw__tr" />
                Admite decimales
              </button>
            </>
          )}
          {p.tipo === "escala" && (
            <>
              <div className="ed-dos">
                <div className="ed-field">
                  <label htmlFor="v-emin">Desde</label>
                  <input id="v-emin" className="ed-in" type="number" min={0} max={9} value={v.escalaMin ?? 1} onChange={(e) => ponerV({ escalaMin: num(e.target.value) })} />
                </div>
                <div className="ed-field">
                  <label htmlFor="v-emax">Hasta</label>
                  <input id="v-emax" className="ed-in" type="number" min={1} max={10} value={v.escalaMax ?? 5} onChange={(e) => ponerV({ escalaMax: num(e.target.value) })} />
                </div>
              </div>
              <div className="ed-dos">
                <div className="ed-field">
                  <label htmlFor="v-etmin">Extremo menor</label>
                  <input id="v-etmin" className="ed-in" maxLength={40} value={v.etiquetaMin ?? ""} onChange={(e) => ponerV({ etiquetaMin: e.target.value || undefined })} />
                </div>
                <div className="ed-field">
                  <label htmlFor="v-etmax">Extremo mayor</label>
                  <input id="v-etmax" className="ed-in" maxLength={40} value={v.etiquetaMax ?? ""} onChange={(e) => ponerV({ etiquetaMax: e.target.value || undefined })} />
                </div>
              </div>
            </>
          )}
          {p.tipo === "contacto" && (
            <div className="ed-field">
              <label htmlFor="v-fmt">Formato</label>
              <select id="v-fmt" className="ed-in" value={v.formato ?? "correo"} onChange={(e) => ponerV({ formato: e.target.value as "correo" | "telefono" })}>
                <option value="correo">Correo electrónico</option>
                <option value="telefono">Teléfono</option>
              </select>
            </div>
          )}
          {p.tipo === "fecha" && (
            <div className="ed-field">
              <label htmlFor="v-rango">Rango permitido</label>
              <select id="v-rango" className="ed-in" value={v.rango ?? ""} onChange={(e) => ponerV({ rango: (e.target.value || undefined) as Validaciones["rango"] })}>
                <option value="">Cualquier fecha</option>
                <option value="pasado">Hoy o antes</option>
                <option value="futuro">Hoy o después</option>
              </select>
            </div>
          )}
          {p.tipo === "archivo" && (
            <>
              <div className="ed-field">
                <label htmlFor="v-ext">Extensiones (separadas por coma)</label>
                <input id="v-ext" className="ed-in" value={(v.extensiones ?? []).join(", ")} onChange={(e) => ponerV({ extensiones: e.target.value.split(",").map((x) => x.trim().replace(/^\./, "")).filter(Boolean) })} />
              </div>
              <div className="ed-field">
                <label htmlFor="v-mb">Tamaño máximo (MB)</label>
                <input id="v-mb" className="ed-in" type="number" min={1} max={25} value={v.tamanoMaxMb ?? 10} onChange={(e) => ponerV({ tamanoMaxMb: num(e.target.value) })} />
              </div>
              <p className="ed-aviso-nota">La carga de archivos aún no está disponible para quien responde: la encuesta no se podrá publicar con esta pregunta.</p>
            </>
          )}
          {p.tipo === "bloque_logro_reto" && (
            <div className="ed-field">
              <label htmlFor="v-items">Aportes por envío (máximo)</label>
              <input id="v-items" className="ed-in" type="number" min={1} max={30} value={v.maxItems ?? 30} onChange={(e) => ponerV({ maxItems: num(e.target.value) })} />
            </div>
          )}
          {(p.tipo === "opcion_unica" || p.tipo === "opcion_multiple" || p.tipo === "lista") && <p className="ed-fino">Las opciones se editan en el lienzo.</p>}
        </section>

        <section className="ed-card ed-pad">
          <h3 className="ed-h3">Mostrar si…</h3>
          {anteriores.length === 0 ? (
            <p className="ed-fino">Esta pregunta es la primera: no hay una anterior de la que pueda depender.</p>
          ) : (
            <>
              <div className="ed-field">
                <label htmlFor="c-preg">Pregunta anterior</label>
                <select id="c-preg" className="ed-in" value={cond?.pregunta ?? ""} onChange={(e) => ponerCond(e.target.value ? { pregunta: e.target.value, op: cond?.op ?? "responde" } : undefined)}>
                  <option value="">Siempre se muestra</option>
                  {anteriores.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.enunciado}
                    </option>
                  ))}
                </select>
              </div>
              {cond && (
                <>
                  <div className="ed-field">
                    <label htmlFor="c-op">Condición</label>
                    <select id="c-op" className="ed-in" value={cond.op} onChange={(e) => ponerCond({ pregunta: cond.pregunta, op: e.target.value as Operador, valor: cond.valor })}>
                      {OPERADORES.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.texto}
                        </option>
                      ))}
                    </select>
                  </div>
                  {op?.conValor &&
                    (origen?.opciones?.length ? (
                      <div className="ed-field">
                        <label htmlFor="c-val">Valor</label>
                        <select id="c-val" className="ed-in" value={String(cond.valor ?? "")} onChange={(e) => ponerCond({ ...cond, valor: e.target.value })}>
                          <option value="">Elegir…</option>
                          {origen.opciones.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.texto}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="ed-field">
                        <label htmlFor="c-val">Valor</label>
                        <input id="c-val" className="ed-in" value={String(cond.valor ?? "")} onChange={(e) => ponerCond({ ...cond, valor: e.target.value })} />
                      </div>
                    ))}
                </>
              )}
            </>
          )}
        </section>

        <section className="ed-pilo" aria-labelledby="ed-pilo-h">
          <h3 id="ed-pilo-h" className="ed-h3">
            Capa de Pilo
          </h3>
          <p className="ed-fino ed-fino--claro">Lo que Pilo le explica a quien responde cuando llega a este dato.</p>
          <label className="ed-sr" htmlFor="ed-expl">
            Explicación de Pilo para esta pregunta
          </label>
          <textarea id="ed-expl" className="ed-in" rows={4} maxLength={600} placeholder="Escriba la explicación, o pídale una sugerencia a Pilo." value={explicacion} onChange={(e) => ponerPilo({ explicacion: e.target.value })} />
          <div className="ed-fila ed-fila--sep">
            <button type="button" className="ed-btn ed-btn--claro ed-btn--sm" onClick={() => void sugerir()} disabled={pidiendo || !puedeEditar}>
              {pidiendo ? (
                <>
                  Pensando
                  <span ref={puntos} className="ed-puntos" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </>
              ) : (
                "Que Pilo la sugiera"
              )}
            </button>
            <span className="ed-fino ed-fino--claro">{explicacion.length}/600</span>
          </div>
          {!iaEncendida && !borrador && <p className="ed-fino ed-fino--claro">Mr. Pilo con IA parece apagado: si lo está, la sugerencia será un texto de respaldo.</p>}
          <p className="ed-sr" role="status" aria-live="polite">
            {aviso}
          </p>
          {borrador && borrador.para === p.id && (
            <div ref={caja} className="ed-borrador" role="group" aria-label="Borrador de Pilo">
              <span className="ed-h ed-h--claro">{borrador.respaldo ? "Texto de respaldo (borrador)" : "Borrador de Pilo"}</span>
              <p>{borrador.texto}</p>
              {borrador.respaldo && <p className="ed-fino ed-fino--claro">{aviso}</p>}
              <div className="ed-fila">
                <button type="button" className="ed-btn ed-btn--claro ed-btn--sm" onClick={usarBorrador}>
                  {explicacion.trim() ? "Reemplazar mi texto" : "Usar este texto"}
                </button>
                <button type="button" className="ed-btn ed-btn--sm ed-btn--fantasma-claro" onClick={() => setBorrador(null)}>
                  Descartar
                </button>
              </div>
            </div>
          )}
          {p.tipo === "cifra" && (
            <div className="ed-confirmar">
              <span className="ed-h ed-h--claro">Pilo pide confirmar si…</span>
              <div className="ed-dos">
                <div className="ed-field">
                  <label htmlFor="cf-may">Es mayor a</label>
                  <input id="cf-may" className="ed-in ed-in--claro" type="number" value={p.pilo?.confirmarSi?.mayorA ?? ""} onChange={(e) => ponerPilo({ confirmarSi: { ...p.pilo?.confirmarSi, mayorA: num(e.target.value) } })} />
                </div>
                <div className="ed-field">
                  <label htmlFor="cf-men">Es menor a</label>
                  <input id="cf-men" className="ed-in ed-in--claro" type="number" value={p.pilo?.confirmarSi?.menorA ?? ""} onChange={(e) => ponerPilo({ confirmarSi: { ...p.pilo?.confirmarSi, menorA: num(e.target.value) } })} />
                </div>
              </div>
            </div>
          )}
        </section>
      </fieldset>
    </aside>
  );
}
