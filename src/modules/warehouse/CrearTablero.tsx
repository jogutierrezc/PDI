/* Warehouse UDES · Crear tablero: la pregunta, las fuentes (todo el catálogo), el análisis de relaciones de Pilo,
   las medidas y el diseño.

   Cualquier reporte del catálogo puede ser fuente. Sus medidas salen del perfil de columnas de la carga más reciente
   (filas, promedios, sumas, personas distintas) y las del catálogo aparecen cuando las fuentes que necesitan están elegidas.
   Pilo Tableros primero analiza cómo se relacionan las fuentes (solo nombres, tipos y conteos de columnas, nunca filas) y
   después propone el diseño; lo que invente se descarta. Sin IA hay un diseño básico. Antes de guardar se muestra la
   revisión de calidad: lo que es error bloquea, lo que es aviso no. */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useContenido, useCrearItem, useGuardarContenido } from "../udrive/datos";
import { CONJUNTOS, GRUPOS, agrupar } from "./conjuntos";
import {
  detectarHallazgos,
  fuentePorId,
  fuentesDe,
  hayErrores,
  MEDIDAS,
  medidaPorId,
  medidasAutomaticas,
  medidasRecomendadas,
  modeloVacio,
  noDisponible,
  PLANTILLAS,
  PUBLICOS,
  registrarMedidas,
  revisarModelo,
  type MedidaBI,
  type ModeloBI,
  type PaginaBI,
  type PublicoId,
  type TipoRegla,
  type TipoVisual,
  type VisualBI,
} from "./modelo";
import { mensajeDe, type Cobertura } from "./store";
import {
  analizarRelacionesPilo,
  armarPedidoRelaciones,
  dimensionesDeMedida,
  disenarPaleta,
  estiloPaleta,
  leerModelo,
  modeloParaGuardar,
  nombreDimension,
  proponerTablero,
  useDatosFuentes,
  useEstadoPiloTableros,
} from "./tablerosDatos";
import type { Contexto } from "./Warehouse";

const nuevoId = () => crypto.randomUUID().slice(0, 8);
const MAX_FUENTES = 12;
const TIPOS_VISUAL: { id: TipoVisual; nombre: string }[] = [
  { id: "kpi", nombre: "Cifras clave" },
  { id: "barras", nombre: "Barras" },
  { id: "lineas", nombre: "Evolución por periodo" },
  { id: "calor", nombre: "Mapa de calor" },
  { id: "tabla", nombre: "Tabla" },
  { id: "narrativa", nombre: "Lectura de Pilo" },
];
const DIM_PREFERIDAS = ["programa", "departamento", "materia", "jornada", "docente"];
const nombreMedida = (id: string) => medidaPorId(id)?.nombre ?? id;
const nombreFuente = (id: string) => fuentePorId(id)?.nombre ?? id;

/** El diseño que no necesita IA: cifras clave, barras de las dos primeras medidas y su evolución. */
export function disenoBasico(medidas: string[]): PaginaBI[] {
  const lista = medidas.map((id) => medidaPorId(id)).filter((x): x is MedidaBI => Boolean(x));
  if (!lista.length) return [];
  const visuales: VisualBI[] = [{ id: nuevoId(), tipo: "kpi", titulo: "Cifras clave", medidas: lista.slice(0, 3).map((m) => m.id), dimensiones: [] }];
  for (const m of lista.slice(0, 2)) {
    const dims = dimensionesDeMedida(m.id);
    const dim = DIM_PREFERIDAS.find((d) => dims.includes(d)) ?? dims[0];
    if (dim) visuales.push({ id: nuevoId(), tipo: "barras", titulo: `${m.nombre} por ${nombreDimension(dim).toLowerCase()}`, medidas: [m.id], dimensiones: [dim] });
  }
  visuales.push({ id: nuevoId(), tipo: "lineas", titulo: "Cómo ha cambiado", medidas: lista.filter((m) => m.calculo.tipo !== "cambio").slice(0, 2).map((m) => m.id), dimensiones: [] });
  visuales.push({ id: nuevoId(), tipo: "narrativa", titulo: "Qué dicen las cifras", medidas: [], dimensiones: [] });
  return [{ id: nuevoId(), nombre: "Resumen", plantilla: "ejecutivo", visuales: visuales.filter((v) => v.tipo === "narrativa" || v.medidas.length) }];
}

export function CrearTablero({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const id = ctx.params.get("tablero");
  const existente = useContenido(id ?? undefined);
  if (id && existente.isPending) return <LoadingBlock rows={4} label="Abriendo el tablero" />;
  if (id && existente.error) return <ErrorBlock error={existente.error} title="No se pudo abrir el tablero para editarlo" />;
  const previo = id && existente.data ? leerModelo(existente.data.contenido) : null;
  return <Asistente key={id ?? "nuevo"} ctx={ctx} cobertura={cobertura} id={id} inicial={previo ?? modeloVacio()} />;
}

function Asistente({ ctx, cobertura, id, inicial }: { ctx: Contexto; cobertura: Cobertura[]; id: string | null; inicial: ModeloBI }) {
  const [m, setM] = useState<ModeloBI>(inicial);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [falloAnalisis, setFalloAnalisis] = useState("");
  const [notasPilo, setNotasPilo] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [temaColor, setTemaColor] = useState("");
  const [coloreando, setColoreando] = useState(false);
  const [avisosPaleta, setAvisosPaleta] = useState<string[]>([]);
  const pilo = useEstadoPiloTableros();
  const crear = useCrearItem();
  const guardar = useGuardarContenido();

  const cambiar = (c: Partial<ModeloBI>) => setM((x) => ({ ...x, ...c }));
  const hayCarga = (f: string) => cobertura.some((c) => c.conjunto === f && c.sede === ctx.sede);
  const datos = useDatosFuentes(m.fuentes, cobertura, ctx.sede);

  // Las medidas automáticas salen del perfil de cada fuente; las que el tablero ya guardó se conservan aunque falte la carga.
  const propias = useMemo(() => {
    const salida = new Map<string, MedidaBI>();
    for (const x of m.medidasPropias ?? []) if (m.fuentes.includes(fuentesDe(x.calculo)[0] ?? "")) salida.set(x.id, x);
    for (const f of m.fuentes) {
      const perfil = datos.perfiles[f];
      if (perfil) for (const x of medidasAutomaticas(f, nombreFuente(f), perfil)) salida.set(x.id, x);
    }
    return [...salida.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.fuentes, m.medidasPropias, datos.perfiles]);
  useMemo(() => registrarMedidas(propias), [propias]);
  const modelo: ModeloBI = useMemo(() => ({ ...m, medidasPropias: propias }), [m, propias]);

  const hallazgos = useMemo(() => detectarHallazgos(m.fuentes, datos.perfiles).filter((h) => h.requiereAprobacion), [m.fuentes, datos.perfiles]);
  const calidad = useMemo(() => revisarModelo(modelo, datos.perfiles), [modelo, datos.perfiles]);
  const bloqueado = hayErrores(calidad) || !m.nombre.trim() || !m.pregunta.trim();

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return agrupar(CONJUNTOS.filter((c) => !q || `${c.nombre} ${c.id}`.toLowerCase().includes(q)));
  }, [busca]);

  // Quitar una fuente deja sin efecto lo que dependía de ella, y el análisis de relaciones ya no vale.
  const alternarFuente = (f: string) => {
    if (!m.fuentes.includes(f) && m.fuentes.length >= MAX_FUENTES) {
      setAviso({ tipo: "error", texto: `Se pueden cruzar hasta ${MAX_FUENTES} fuentes en un tablero.` });
      return;
    }
    setAviso(null);
    const fuentes = m.fuentes.includes(f) ? m.fuentes.filter((x) => x !== f) : [...m.fuentes, f];
    const sigue = (mid: string) => {
      const med = medidaPorId(mid);
      return Boolean(med) && fuentesDe(med!.calculo).every((x) => fuentes.includes(x));
    };
    setM((x) => {
      const medidas = x.medidas.filter(sigue);
      return { ...x, fuentes, medidas, analisis: undefined, paginas: x.paginas.map((p) => ({ ...p, visuales: p.visuales.filter((v) => v.medidas.every((mid) => medidas.includes(mid))) })) };
    });
  };
  const alternarRegla = (r: TipoRegla) => cambiar({ reglas: m.reglas.includes(r) ? m.reglas.filter((x) => x !== r) : [...m.reglas, r] });
  const alternarMedida = (mid: string) => cambiar({ medidas: m.medidas.includes(mid) ? m.medidas.filter((x) => x !== mid) : [...m.medidas, mid] });

  const catalogo = MEDIDAS.filter((x) => fuentesDe(x.calculo).every((f) => m.fuentes.includes(f)));
  const usables = [...catalogo.filter((x) => noDisponible(x, m.fuentes, m.reglas) === null), ...propias];

  const analizar = async () => {
    setAnalizando(true);
    setFalloAnalisis("");
    try {
      const r = await analizarRelacionesPilo(armarPedidoRelaciones(m.pregunta, m.fuentes, datos.perfiles));
      cambiar({ analisis: r.analisis });
    } catch (e) {
      setFalloAnalisis(mensajeDe(e));
    } finally {
      setAnalizando(false);
    }
  };

  const pedirAPilo = async () => {
    setPensando(true);
    setAviso(null);
    try {
      const r = await proponerTablero({
        pregunta: m.pregunta,
        publico: PUBLICOS[m.publico],
        fuentes: m.fuentes.map(nombreFuente),
        contexto: m.analisis?.resumen,
        medidas: usables.slice(0, 90).map((x) => ({ id: x.id, nombre: x.nombre, descripcion: x.descripcion, dimensiones: dimensionesDeMedida(x.id) })),
      });
      const p = r.propuesta;
      setM((x) => ({
        ...x,
        nombre: x.nombre.trim() ? x.nombre : p.nombre,
        medidas: [...new Set([...x.medidas, ...p.medidas])],
        paginas: p.paginas.map((pg) => ({ id: nuevoId(), nombre: pg.nombre, plantilla: pg.plantilla, visuales: pg.visuales.map((v) => ({ ...v, id: nuevoId() })) })),
      }));
      setNotasPilo(p.notas);
      setAviso({ tipo: "ok", texto: "Pilo armó el diseño. Revíselo y ajústelo antes de guardar." });
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setPensando(false);
    }
  };

  const pedirPaleta = async () => {
    setColoreando(true);
    setAviso(null);
    try {
      const r = await disenarPaleta({ tema: temaColor, pregunta: m.pregunta, nombre: m.nombre });
      const { avisos, ...paleta } = r.paleta;
      cambiar({ paleta });
      setAvisosPaleta(avisos ?? []);
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setColoreando(false);
    }
  };

  const guardarTablero = async () => {
    setAviso(null);
    const contenido = modeloParaGuardar(modelo);
    try {
      if (id) {
        await guardar.mutateAsync({ id, contenido });
        ctx.ir("tableros", { tablero: id });
      } else {
        const nuevo = await crear.mutateAsync({ tipo: "tablero" as never, nombre: contenido.nombre, carpeta: null, contenido });
        ctx.ir("tableros", { tablero: nuevo });
      }
    } catch (e) {
      const texto = mensajeDe(e);
      setAviso({ tipo: "error", texto: /duplicate|unique|ya existe/i.test(texto) ? "Ya tiene un archivo con ese nombre en UDrive. Cámbiele el nombre." : texto });
    }
  };

  // El diseño sigue las medidas: si ya no existe una medida en un visual, se quita.
  useEffect(() => {
    setM((x) => {
      const limpias = x.paginas.map((p) => ({ ...p, visuales: p.visuales.filter((v) => v.medidas.every((mid) => x.medidas.includes(mid))) }));
      return JSON.stringify(limpias) === JSON.stringify(x.paginas) ? x : { ...x, paginas: limpias };
    });
  }, [m.medidas]);

  const piloListo = pilo.data?.ai !== false && !pilo.error;
  const a = m.analisis;

  return (
    <div className="wh-pila">
      <section className="wh-panel" aria-labelledby="ct-1">
        <div className="wh-panel__cabeza">
          <h2 id="ct-1">1. La pregunta</h2>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          <label className="wh-pila">
            <span>¿Qué debe responder el tablero?</span>
            <textarea className="wh-texto" rows={2} value={m.pregunta} maxLength={400} onChange={(e) => cambiar({ pregunta: e.target.value })} placeholder="Por ejemplo: ¿en qué programas está subiendo la reprobación y qué tanto pesa en la deserción?" />
          </label>
          <div className="wh-fila">
            <label className="wh-pila">
              <span>Nombre del tablero</span>
              <input className="wh-texto" value={m.nombre} maxLength={80} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Riesgo académico por programa" />
            </label>
            <label className="wh-pila">
              <span>Para quién</span>
              <select className="wh-select" value={m.publico} onChange={(e) => cambiar({ publico: e.target.value as PublicoId })}>
                {Object.entries(PUBLICOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="ct-2">
        <div className="wh-panel__cabeza">
          <h2 id="ct-2">2. Las fuentes</h2>
          <span className="wh-muted">
            {m.fuentes.length} de {MAX_FUENTES} elegidas. Todo el catálogo sirve: se cruzan por periodo, programa, materia… no fila contra fila.
          </span>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          <div className="wh-fila">
            <label className="wh-campo">
              <span className="sr-only">Buscar un reporte</span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un reporte del catálogo…" aria-label="Buscar un reporte del catálogo" />
            </label>
            {m.fuentes.length > 0 && (
              <button type="button" className="button-secondary" onClick={() => setM((x) => ({ ...x, fuentes: [], medidas: [], analisis: undefined, paginas: [] }))}>
                Quitar todas
              </button>
            )}
          </div>
          {grupos.map((g) => (
            <div key={g.grupo}>
              <h3 className="wh-grupo">
                {GRUPOS[g.grupo].nombre}
                <small> · {GRUPOS[g.grupo].detalle}</small>
              </h3>
              <div className="wh-fila" role="group" aria-label={GRUPOS[g.grupo].nombre}>
                {g.conjuntos.map((c) => (
                  <button key={c.id} type="button" className="wh-chip" aria-pressed={m.fuentes.includes(c.id)} onClick={() => alternarFuente(c.id)} title={fuentePorId(c.id)?.grano}>
                    {c.nombre}
                    {!hayCarga(c.id) ? " · sin carga aquí" : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grupos.length === 0 && <p className="wh-muted">Ningún reporte coincide con la búsqueda.</p>}
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="ct-3">
        <div className="wh-panel__cabeza">
          <h2 id="ct-3">3. Cómo se relacionan</h2>
          <button type="button" className="button-primary" disabled={analizando || datos.cargando || m.fuentes.length < 2 || !piloListo} onClick={() => void analizar()}>
            {analizando ? "Pilo está analizando…" : a ? "Analizar de nuevo" : "Que Pilo analice las relaciones"}
          </button>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          {m.fuentes.length === 0 && <p className="wh-muted">Elija las fuentes y Pilo revisará cómo se unen entre sí.</p>}
          {m.fuentes.length === 1 && <p className="wh-muted">Con una sola fuente no hay relaciones que revisar. Pase a las medidas.</p>}
          {m.fuentes.length >= 2 && (
            <p className="wh-nota-chica wh-muted">Pilo solo recibe los nombres, tipos y conteos de las columnas de cada fuente. Nunca recibe filas ni valores.</p>
          )}
          {datos.sinCarga.length > 0 && (
            <p className="wh-aviso wh-aviso--ambar">
              No hay carga en esta sede de: {datos.sinCarga.map(nombreFuente).join(", ")}. De ellas Pilo solo conoce las columnas confirmadas y no se arman medidas automáticas. Cárguelas en la sección Cargas.
            </p>
          )}
          {datos.errores.length > 0 && <p className="wh-aviso wh-aviso--ambar">No se pudo leer el perfil de alguna fuente: {datos.errores[0]}</p>}
          {!piloListo && m.fuentes.length >= 2 && <p className="wh-aviso wh-aviso--ambar">Pilo no está disponible ahora ({pilo.data?.motivo ?? (pilo.error ? mensajeDe(pilo.error) : "sin IA configurada")}). Puede seguir: las reconstrucciones que detecta la aplicación están abajo.</p>}
          {falloAnalisis && (
            <p className="wh-aviso wh-aviso--rojo" role="alert">
              {falloAnalisis}
            </p>
          )}
          {datos.cargando && <p className="wh-muted">Leyendo el perfil de las fuentes…</p>}

          {a && (
            <>
              <p>{a.resumen}</p>
              {a.relaciones.length > 0 && (
                <div className="wh-tabla-envuelta">
                  <table className="wh-tabla">
                    <thead>
                      <tr>
                        <th scope="col">Desde</th>
                        <th scope="col">Hacia</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Calidad</th>
                        <th scope="col">Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.relaciones.map((r, i) => (
                        <tr key={i}>
                          <td>
                            {nombreFuente(r.desde.fuente)} <span className="wh-mono">{r.desde.columna}</span>
                          </td>
                          <td>
                            {nombreFuente(r.hacia.fuente)} <span className="wh-mono">{r.hacia.columna}</span>
                          </td>
                          <td>{r.tipo}</td>
                          <td>
                            <span className="wh-etiqueta" data-t={r.calidad === "alta" ? "listo" : r.calidad === "media" ? "sin_politica" : "sin_har"}>
                              {r.calidad}
                            </span>
                          </td>
                          <td>{r.nota}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {a.aisladas.length > 0 && <p className="wh-aviso wh-aviso--ambar">Sin relación con las demás: {a.aisladas.map(nombreFuente).join(", ")}. Se pueden usar, pero no se cruzan con el resto.</p>}
              {a.riesgos.length > 0 && (
                <div>
                  <h3 className="wh-grupo">Cuidado con</h3>
                  <ul>
                    {a.riesgos.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {a.avisos.map((x, i) => (
                <p key={i} className="wh-aviso wh-aviso--ambar">
                  {x}
                </p>
              ))}
            </>
          )}

          {hallazgos.length > 0 && (
            <div>
              <h3 className="wh-grupo">
                Reconstrucciones por aprobar<small> · cambian cómo se leen los datos: las aprueba una persona</small>
              </h3>
              <div className="wh-reglas">
                {hallazgos.map((h) => {
                  const sugerida = a?.reglas.find((r) => r.regla === h.id);
                  return (
                    <div key={h.id} className="wh-regla">
                      <label>
                        <input type="checkbox" checked={m.reglas.includes(h.id)} onChange={() => alternarRegla(h.id)} /> {h.titulo}
                      </label>
                      <small>{h.detalle}</small>
                      {sugerida && <small>Pilo la recomienda: {sugerida.motivo}</small>}
                      <small>{h.accion}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="ct-4">
        <div className="wh-panel__cabeza">
          <h2 id="ct-4">4. Las medidas</h2>
          <button type="button" className="button-secondary" disabled={!m.fuentes.length} onClick={() => cambiar({ medidas: [...new Set([...medidasRecomendadas(m.fuentes, m.reglas), ...(m.medidas.filter((x) => x.startsWith("auto:")))])] })}>
            Marcar las recomendadas
          </button>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          {m.fuentes.length === 0 && <p className="wh-muted">Elija al menos una fuente para ver qué se puede medir.</p>}
          {[...new Set(catalogo.map((x) => x.carpeta))].map((carpeta) => (
            <div key={carpeta}>
              <h3 className="wh-grupo">{carpeta}</h3>
              <div className="wh-reglas">
                {catalogo
                  .filter((x) => x.carpeta === carpeta)
                  .map((x) => {
                    const razon = noDisponible(x, m.fuentes, m.reglas);
                    return (
                      <div key={x.id} className={razon ? "wh-regla wh-regla--bloqueada" : "wh-regla"}>
                        <label>
                          <input type="checkbox" disabled={razon !== null} checked={m.medidas.includes(x.id)} onChange={() => alternarMedida(x.id)} /> {x.nombre}
                        </label>
                        <small>{razon ?? x.descripcion}</small>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
          {m.fuentes.map((f) => {
            const lista = propias.filter((x) => fuentesDe(x.calculo)[0] === f);
            if (!lista.length) return null;
            const elegidas = lista.filter((x) => m.medidas.includes(x.id)).length;
            return (
              <details key={f} open={elegidas > 0}>
                <summary>
                  Automáticas de {nombreFuente(f)} ({lista.length}
                  {elegidas ? `, ${elegidas} elegidas` : ""})
                </summary>
                <div className="wh-reglas" style={{ marginTop: 10 }}>
                  {lista.map((x) => (
                    <div key={x.id} className="wh-regla">
                      <label>
                        <input type="checkbox" checked={m.medidas.includes(x.id)} onChange={() => alternarMedida(x.id)} /> {x.nombre}
                      </label>
                      <small>{x.descripcion}</small>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="ct-5">
        <div className="wh-panel__cabeza">
          <h2 id="ct-5">5. El diseño</h2>
          <div className="wh-fila">
            <button type="button" className="button-primary" disabled={pensando || m.pregunta.trim().length < 8 || usables.length === 0 || !piloListo} onClick={() => void pedirAPilo()}>
              {pensando ? "Pilo está diseñando…" : "Que Pilo lo proponga"}
            </button>
            <button type="button" className="button-secondary" disabled={m.medidas.length === 0} onClick={() => cambiar({ paginas: disenoBasico(m.medidas) })}>
              Diseño básico
            </button>
          </div>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          {!piloListo && <p className="wh-aviso wh-aviso--ambar">Pilo no está disponible ahora ({pilo.data?.motivo ?? (pilo.error ? mensajeDe(pilo.error) : "sin IA configurada")}). Use el diseño básico y ajústelo a mano.</p>}
          {notasPilo.map((n, i) => (
            <p key={i} className="wh-aviso">
              {n}
            </p>
          ))}
          <details open={Boolean(m.paleta)}>
            <summary>Colores del tablero (opcional)</summary>
            <div className="wh-pila" style={{ marginTop: 10 }}>
              <p className="wh-nota-chica wh-muted">Sin paleta, el tablero usa los colores UDES del tema. Pilo propone una y la revisa por contraste, distinción y daltonismo.</p>
              <div className="wh-fila">
                <label className="wh-campo">
                  <span className="sr-only">Ambiente de color</span>
                  <input value={temaColor} onChange={(e) => setTemaColor(e.target.value)} maxLength={200} placeholder="Ej.: sostenibilidad, sobrio institucional…" />
                </label>
                <button type="button" className="button-secondary" disabled={coloreando || !piloListo || (temaColor.trim().length < 3 && m.pregunta.trim().length < 8)} onClick={() => void pedirPaleta()}>
                  {coloreando ? "Pilo está eligiendo colores…" : "Que Pilo proponga colores"}
                </button>
                {m.paleta && (
                  <button type="button" className="button-secondary" onClick={() => { cambiar({ paleta: undefined }); setAvisosPaleta([]); }}>
                    Usar colores UDES
                  </button>
                )}
              </div>
              {m.paleta && (
                <div className="wh-pila" style={estiloPaleta(m.paleta)}>
                  <p>
                    <strong>{m.paleta.nombre}</strong>
                    {m.paleta.descripcion && <span className="wh-muted"> · {m.paleta.descripcion}</span>}
                  </p>
                  <div className="wh-fila" aria-label="Colores de series">
                    {m.paleta.categorica.map((c) => (
                      <span key={c} title={c} style={{ background: c, width: 30, height: 30, borderRadius: 6, display: "inline-block" }} />
                    ))}
                  </div>
                  <div className="wh-fila" aria-label="Escala de calor">
                    {m.paleta.secuencial.map((c) => (
                      <span key={c} title={c} style={{ background: c, width: 30, height: 30, borderRadius: 6, display: "inline-block" }} />
                    ))}
                  </div>
                  <small className="wh-muted">{[...m.paleta.categorica, ...m.paleta.secuencial].join(" · ")}</small>
                  {avisosPaleta.map((a, i) => (
                    <p key={i} className="wh-aviso wh-aviso--ambar">
                      {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </details>
          {m.paginas.length === 0 && <p className="wh-muted">Todavía no hay páginas. Pida el diseño a Pilo o arme el básico.</p>}
          {m.paginas.map((p, pi) => (
            <Pagina key={p.id} pagina={p} medidas={m.medidas} onChange={(np) => cambiar({ paginas: m.paginas.map((x, i) => (i === pi ? np : x)) })} onQuitar={() => cambiar({ paginas: m.paginas.filter((_, i) => i !== pi) })} />
          ))}
          {m.medidas.length > 0 && (
            <button type="button" className="button-secondary" onClick={() => cambiar({ paginas: [...m.paginas, { id: nuevoId(), nombre: `Página ${m.paginas.length + 1}`, plantilla: "diagnostico", visuales: [] }] })}>
              <Icon name="plus" size={15} /> Agregar página
            </button>
          )}
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="ct-6">
        <div className="wh-panel__cabeza">
          <h2 id="ct-6">6. Revisión antes de guardar</h2>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          <ul className="wh-pila">
            {calidad.map((r) => (
              <li key={r.id} className={r.ok ? "" : r.severidad === "error" ? "wh-aviso wh-aviso--rojo" : "wh-aviso wh-aviso--ambar"}>
                {r.ok ? "✓" : r.severidad === "error" ? "✗" : "!"} {r.texto}
              </li>
            ))}
          </ul>
          {!m.nombre.trim() && <p className="wh-aviso wh-aviso--rojo">Falta el nombre del tablero.</p>}
          {!m.pregunta.trim() && <p className="wh-aviso wh-aviso--rojo">Falta la pregunta que responde.</p>}
          {aviso && (
            <p className={aviso.tipo === "ok" ? "wh-aviso wh-aviso--verde" : "wh-aviso wh-aviso--rojo"} role={aviso.tipo === "error" ? "alert" : "status"}>
              {aviso.texto}
            </p>
          )}
          <div className="wh-fila">
            <button type="button" className="button-primary" disabled={bloqueado || crear.isPending || guardar.isPending} onClick={() => void guardarTablero()}>
              {crear.isPending || guardar.isPending ? "Guardando…" : id ? "Guardar cambios" : "Guardar en UDrive"}
            </button>
            <button type="button" className="button-secondary" onClick={() => (id ? ctx.ir("tableros", { tablero: id }) : ctx.ir("tableros"))}>
              Cancelar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* --- Una página del diseño, editable ------------------------------------------------------------- */

function Pagina({ pagina, medidas, onChange, onQuitar }: { pagina: PaginaBI; medidas: string[]; onChange: (p: PaginaBI) => void; onQuitar: () => void }) {
  const [nuevo, setNuevo] = useState<{ tipo: TipoVisual; medida: string; dim1: string; dim2: string }>({ tipo: "barras", medida: medidas[0] ?? "", dim1: "", dim2: "" });
  const medidaActual = medidas.includes(nuevo.medida) ? nuevo.medida : (medidas[0] ?? "");
  const dimsDe = dimensionesDeMedida(medidaActual);
  const necesita = nuevo.tipo === "barras" || nuevo.tipo === "tabla" ? 1 : nuevo.tipo === "calor" ? 2 : 0;
  const puede = nuevo.tipo === "narrativa" || (Boolean(medidaActual) && (necesita < 1 || Boolean(nuevo.dim1)) && (necesita < 2 || (Boolean(nuevo.dim2) && nuevo.dim2 !== nuevo.dim1)));

  const agregar = () => {
    const dims = [nuevo.dim1, nuevo.dim2].slice(0, necesita).filter(Boolean);
    const nombre = nombreMedida(medidaActual);
    const titulo = nuevo.tipo === "narrativa" ? "Qué dicen las cifras" : nuevo.tipo === "kpi" ? nombre : nuevo.tipo === "lineas" ? `${nombre} por periodo` : `${nombre} por ${dims.map((d) => nombreDimension(d).toLowerCase()).join(" y ")}`;
    onChange({ ...pagina, visuales: [...pagina.visuales, { id: nuevoId(), tipo: nuevo.tipo, titulo, medidas: nuevo.tipo === "narrativa" ? [] : [medidaActual], dimensiones: nuevo.tipo === "narrativa" ? [] : dims }] });
  };
  const max = PLANTILLAS[pagina.plantilla].maxVisuales;

  return (
    <div className="wh-regla">
      <div className="wh-fila">
        <input className="wh-texto" aria-label="Nombre de la página" value={pagina.nombre} maxLength={60} onChange={(e) => onChange({ ...pagina, nombre: e.target.value })} />
        <select className="wh-select" aria-label="Plantilla" value={pagina.plantilla} onChange={(e) => onChange({ ...pagina, plantilla: e.target.value as PaginaBI["plantilla"] })}>
          {Object.entries(PLANTILLAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.nombre}
            </option>
          ))}
        </select>
        <button type="button" className="button-secondary" onClick={onQuitar}>
          Quitar página
        </button>
      </div>
      <small>
        {PLANTILLAS[pagina.plantilla].descripcion} Hasta {max} visuales; hay {pagina.visuales.length}.
      </small>
      {pagina.visuales.map((v, i) => (
        <div key={v.id} className="wh-fila">
          <span className="wh-etiqueta">{TIPOS_VISUAL.find((t) => t.id === v.tipo)?.nombre}</span>
          <input className="wh-texto" aria-label="Título del visual" value={v.titulo} maxLength={120} onChange={(e) => onChange({ ...pagina, visuales: pagina.visuales.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)) })} />
          <small className="wh-muted">{[...v.medidas.map(nombreMedida), ...v.dimensiones.map(nombreDimension)].join(" · ")}</small>
          <button type="button" className="button-secondary" aria-label={`Quitar «${v.titulo}»`} onClick={() => onChange({ ...pagina, visuales: pagina.visuales.filter((_, j) => j !== i) })}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <div className="wh-fila">
        <select className="wh-select" aria-label="Tipo de visual" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoVisual, dim1: "", dim2: "" })}>
          {TIPOS_VISUAL.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        {nuevo.tipo !== "narrativa" && (
          <select className="wh-select" aria-label="Medida" value={medidaActual} onChange={(e) => setNuevo({ ...nuevo, medida: e.target.value, dim1: "", dim2: "" })}>
            {medidas.map((mid) => (
              <option key={mid} value={mid}>
                {nombreMedida(mid)}
              </option>
            ))}
          </select>
        )}
        {necesita >= 1 && (
          <select className="wh-select" aria-label="Agrupar por" value={nuevo.dim1} onChange={(e) => setNuevo({ ...nuevo, dim1: e.target.value })}>
            <option value="">Agrupar por…</option>
            {dimsDe.map((d) => (
              <option key={d} value={d}>
                {nombreDimension(d)}
              </option>
            ))}
          </select>
        )}
        {necesita >= 2 && (
          <select className="wh-select" aria-label="Y por" value={nuevo.dim2} onChange={(e) => setNuevo({ ...nuevo, dim2: e.target.value })}>
            <option value="">Y por…</option>
            {dimsDe
              .filter((d) => d !== nuevo.dim1)
              .map((d) => (
                <option key={d} value={d}>
                  {nombreDimension(d)}
                </option>
              ))}
          </select>
        )}
        <button type="button" className="button-secondary" disabled={!puede} onClick={agregar}>
          <Icon name="plus" size={14} /> Agregar visual
        </button>
      </div>
      {nuevo.tipo !== "narrativa" && dimsDe.length === 0 && necesita > 0 && <small className="wh-muted">Esa medida no se puede desglosar por ninguna dimensión con las fuentes que usa.</small>}
    </div>
  );
}
