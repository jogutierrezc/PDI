/* Warehouse UDES · Crear tablero: la pregunta, las fuentes, las reconstrucciones que se aprueban, las medidas y el diseño.

   Pilo Tableros propone el diseño con las medidas del catálogo (lo que invente se descarta); sin IA hay un diseño básico
   que se arma solo. Antes de guardar se muestra la revisión de calidad: lo que es error bloquea, lo que es aviso no. */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useContenido, useCrearItem, useGuardarContenido } from "../udrive/datos";
import {
  DIMENSIONES,
  detectarHallazgos,
  fuentePorId,
  fuentesDe,
  hayErrores,
  MEDIDAS,
  medidasRecomendadas,
  modeloVacio,
  noDisponible,
  PLANTILLAS,
  PUBLICOS,
  revisarModelo,
  type DimensionId,
  type ModeloBI,
  type PaginaBI,
  type PublicoId,
  type TipoRegla,
  type TipoVisual,
  type VisualBI,
} from "./modelo";
import { mensajeDe, type Cobertura } from "./store";
import { dimensionesDeMedida, leerModelo, modeloParaGuardar, nombreDimension, proponerTablero, useEstadoPiloTableros } from "./tablerosDatos";
import type { Contexto } from "./Warehouse";

const nuevoId = () => crypto.randomUUID().slice(0, 8);
const TIPOS_VISUAL: { id: TipoVisual; nombre: string }[] = [
  { id: "kpi", nombre: "Cifras clave" },
  { id: "barras", nombre: "Barras" },
  { id: "lineas", nombre: "Evolución por periodo" },
  { id: "calor", nombre: "Mapa de calor" },
  { id: "tabla", nombre: "Tabla" },
  { id: "narrativa", nombre: "Lectura de Pilo" },
];
const DIM_PREFERIDAS: DimensionId[] = ["programa", "departamento", "materia", "jornada", "docente"];

/** El diseño que no necesita IA: cifras clave, barras de las dos primeras medidas y su evolución. */
export function disenoBasico(medidas: string[]): PaginaBI[] {
  const lista = MEDIDAS.filter((m) => medidas.includes(m.id));
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
  const [notasPilo, setNotasPilo] = useState<string[]>([]);
  const pilo = useEstadoPiloTableros();
  const crear = useCrearItem();
  const guardar = useGuardarContenido();

  const cambiar = (c: Partial<ModeloBI>) => setM((x) => ({ ...x, ...c }));
  const fuentesPosibles = useMemo(() => {
    const ids = new Set<string>();
    for (const med of MEDIDAS) fuentesDe(med.calculo).forEach((f) => ids.add(f));
    return [...ids].map((f) => fuentePorId(f)).filter((f): f is NonNullable<typeof f> => Boolean(f));
  }, []);
  const hayCarga = (f: string) => cobertura.some((c) => c.conjunto === f && c.sede === ctx.sede);
  const hallazgos = useMemo(() => detectarHallazgos(m.fuentes, {}).filter((h) => h.requiereAprobacion), [m.fuentes]);
  const calidad = useMemo(() => revisarModelo(m), [m]);
  const bloqueado = hayErrores(calidad) || !m.nombre.trim() || !m.pregunta.trim();

  // Quitar una fuente deja sin efecto lo que dependía de ella.
  const alternarFuente = (f: string) => {
    const fuentes = m.fuentes.includes(f) ? m.fuentes.filter((x) => x !== f) : [...m.fuentes, f];
    const medidas = m.medidas.filter((mid) => {
      const med = MEDIDAS.find((x) => x.id === mid);
      return med && fuentesDe(med.calculo).every((x) => fuentes.includes(x));
    });
    setM((x) => ({ ...x, fuentes, medidas, paginas: x.paginas.map((p) => ({ ...p, visuales: p.visuales.filter((v) => v.medidas.every((mid) => medidas.includes(mid))) })) }));
  };
  const alternarRegla = (r: TipoRegla) => cambiar({ reglas: m.reglas.includes(r) ? m.reglas.filter((x) => x !== r) : [...m.reglas, r] });
  const alternarMedida = (mid: string) => cambiar({ medidas: m.medidas.includes(mid) ? m.medidas.filter((x) => x !== mid) : [...m.medidas, mid] });

  const usables = MEDIDAS.filter((x) => noDisponible(x, m.fuentes, m.reglas) === null);

  const pedirAPilo = async () => {
    setPensando(true);
    setAviso(null);
    try {
      const r = await proponerTablero({
        pregunta: m.pregunta,
        publico: PUBLICOS[m.publico],
        fuentes: m.fuentes.map((f) => fuentePorId(f)?.nombre ?? f),
        medidas: usables.map((x) => ({ id: x.id, nombre: x.nombre, descripcion: x.descripcion, dimensiones: dimensionesDeMedida(x.id) })),
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

  const guardarTablero = async () => {
    setAviso(null);
    const contenido = modeloParaGuardar(m);
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
          <span className="wh-muted">Se cruzan por periodo, programa, materia… no fila contra fila.</span>
        </div>
        <div className="wh-panel__cuerpo wh-fila" role="group" aria-label="Fuentes del Warehouse">
          {fuentesPosibles.map((f) => (
            <button key={f.id} type="button" className="wh-chip" aria-pressed={m.fuentes.includes(f.id)} onClick={() => alternarFuente(f.id)} title={f.grano}>
              {f.nombre}
              {!hayCarga(f.id) ? " · sin carga en esta sede" : ""}
            </button>
          ))}
        </div>
      </section>

      {hallazgos.length > 0 && (
        <section className="wh-panel" aria-labelledby="ct-3">
          <div className="wh-panel__cabeza">
            <h2 id="ct-3">3. Reconstrucciones por aprobar</h2>
            <span className="wh-muted">Cambian cómo se leen los datos: las aprueba una persona.</span>
          </div>
          <div className="wh-panel__cuerpo wh-reglas">
            {hallazgos.map((h) => (
              <div key={h.id} className="wh-regla">
                <label>
                  <input type="checkbox" checked={m.reglas.includes(h.id)} onChange={() => alternarRegla(h.id)} /> {h.titulo}
                </label>
                <small>{h.detalle}</small>
                <small>{h.accion}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="wh-panel" aria-labelledby="ct-4">
        <div className="wh-panel__cabeza">
          <h2 id="ct-4">4. Las medidas</h2>
          <button type="button" className="button-secondary" disabled={!m.fuentes.length} onClick={() => cambiar({ medidas: medidasRecomendadas(m.fuentes, m.reglas) })}>
            Marcar las recomendadas
          </button>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          {m.fuentes.length === 0 && <p className="wh-muted">Elija al menos una fuente para ver qué se puede medir.</p>}
          {[...new Set(MEDIDAS.map((x) => x.carpeta))].map((carpeta) => (
            <div key={carpeta}>
              <h3 className="wh-grupo">{carpeta}</h3>
              <div className="wh-reglas">
                {MEDIDAS.filter((x) => x.carpeta === carpeta).map((x) => {
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
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="ct-5">
        <div className="wh-panel__cabeza">
          <h2 id="ct-5">5. El diseño</h2>
          <div className="wh-fila">
            <button type="button" className="button-primary" disabled={pensando || m.pregunta.trim().length < 8 || usables.length === 0 || pilo.data?.ai === false} onClick={() => void pedirAPilo()}>
              {pensando ? "Pilo está diseñando…" : "Que Pilo lo proponga"}
            </button>
            <button type="button" className="button-secondary" disabled={m.medidas.length === 0} onClick={() => cambiar({ paginas: disenoBasico(m.medidas) })}>
              Diseño básico
            </button>
          </div>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          {pilo.data?.ai === false && <p className="wh-aviso wh-aviso--ambar">Pilo no está disponible ahora ({pilo.data.motivo ?? "sin IA configurada"}). Use el diseño básico y ajústelo a mano.</p>}
          {pilo.error && <p className="wh-aviso wh-aviso--ambar">{mensajeDe(pilo.error)} El diseño básico sigue disponible.</p>}
          {notasPilo.map((n, i) => (
            <p key={i} className="wh-aviso">
              {n}
            </p>
          ))}
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
  const dimsDe = dimensionesDeMedida(nuevo.medida);
  const necesita = nuevo.tipo === "barras" || nuevo.tipo === "tabla" ? 1 : nuevo.tipo === "calor" ? 2 : 0;
  const puede = nuevo.tipo === "narrativa" || (Boolean(nuevo.medida) && (necesita < 1 || Boolean(nuevo.dim1)) && (necesita < 2 || (Boolean(nuevo.dim2) && nuevo.dim2 !== nuevo.dim1)));

  const agregar = () => {
    const dims = [nuevo.dim1, nuevo.dim2].slice(0, necesita).filter(Boolean) as DimensionId[];
    const nombre = MEDIDAS.find((x) => x.id === nuevo.medida)?.nombre ?? "";
    const titulo = nuevo.tipo === "narrativa" ? "Qué dicen las cifras" : nuevo.tipo === "kpi" ? nombre : nuevo.tipo === "lineas" ? `${nombre} por periodo` : `${nombre} por ${dims.map((d) => nombreDimension(d).toLowerCase()).join(" y ")}`;
    onChange({ ...pagina, visuales: [...pagina.visuales, { id: nuevoId(), tipo: nuevo.tipo, titulo, medidas: nuevo.tipo === "narrativa" ? [] : [nuevo.medida], dimensiones: nuevo.tipo === "narrativa" ? [] : dims }] });
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
      <small>{PLANTILLAS[pagina.plantilla].descripcion} Hasta {max} visuales; hay {pagina.visuales.length}.</small>
      {pagina.visuales.map((v, i) => (
        <div key={v.id} className="wh-fila">
          <span className="wh-etiqueta">{TIPOS_VISUAL.find((t) => t.id === v.tipo)?.nombre}</span>
          <input className="wh-texto" aria-label="Título del visual" value={v.titulo} maxLength={120} onChange={(e) => onChange({ ...pagina, visuales: pagina.visuales.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)) })} />
          <small className="wh-muted">{[...v.medidas.map((id) => MEDIDAS.find((x) => x.id === id)?.nombre ?? id), ...v.dimensiones.map((d) => DIMENSIONES[d].nombre)].join(" · ")}</small>
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
          <select className="wh-select" aria-label="Medida" value={nuevo.medida} onChange={(e) => setNuevo({ ...nuevo, medida: e.target.value, dim1: "", dim2: "" })}>
            {medidas.map((id) => (
              <option key={id} value={id}>
                {MEDIDAS.find((x) => x.id === id)?.nombre ?? id}
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
            {dimsDe.filter((d) => d !== nuevo.dim1).map((d) => (
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
