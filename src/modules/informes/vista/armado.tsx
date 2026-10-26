/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · las unidades del cuerpo.

   Cada sección del informe se parte en unidades que el paginado reparte en
   hojas: el encabezado, un párrafo, una tabla, una gráfica, una nota de
   fuente. Una unidad sabe dibujarse entera o en un trozo (un párrafo por
   líneas, una tabla por filas con su encabezado repetido). Las reglas de salto
   son las de UDrive (udrive/lib/paginado.ts): una figura con su pie no se
   parte, un título no queda solo al final, nunca menos de dos líneas arriba ni
   abajo.
   ========================================================================== */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { UD_CLAVES, pedirContenido } from "../../udrive/datos";
import { normalizarConfig } from "../../udrive/lib/graficas";
import { normalizarContenido } from "../../udrive/lib/tabla";
import { textoNumero } from "../../udrive/lib/valores";
import type { Trozo } from "../../udrive/lib/paginado";
import type { ConfigGrafica, ContenidoTabla } from "../../udrive/tipos";
import { GraficaVista } from "../../udrive/ui/GraficaVista";
import { DIMS } from "../plantillas";
import type { ElementoDrive } from "../types";
import { EncabezadoSeccion } from "./Hoja";
import { ETIQUETA_ESTADO_META, contarEstados } from "./estados";
import type { EstadoMeta } from "./estados";
import type { EntradaLibro, FilaIndicador, SeccionLibro } from "./entrada";

/* ---------- Unidad ----------------------------------------------------------------------------------- */

export interface Unidad {
  clave: string;
  /** Índice de la sección a la que pertenece (la franja de la hoja lleva su título). */
  seccion: number;
  nuevaPagina?: boolean;
  pegar?: boolean;
  /** Se puede partir: por líneas (párrafo) o por filas (tabla). */
  partible?: "p" | "t";
  /** Dibuja la unidad entera (t = null) o un trozo. `linea` es el alto medido de una línea de párrafo; `medida` es la copia fuera de pantalla (las gráficas no se dibujan, solo reservan su alto). */
  dibujar(t: Trozo | null, linea: number, medida: boolean): ReactNode;
}

/* ---------- Lo que se lee de UDrive -------------------------------------------------------------------- */

export interface RecursosDrive {
  tablas: ReadonlyMap<string, ContenidoTabla | null>;
  graficas: ReadonlyMap<string, { tabla_id: string | null; config: ConfigGrafica } | null>;
  listo: boolean;
  /** Cambia cuando llegan datos nuevos: obliga a medir otra vez. */
  firma: string;
}

const VACIOS: RecursosDrive = { tablas: new Map(), graficas: new Map(), listo: true, firma: "" };

/** Las tablas y gráficas de UDrive que usa el informe, con la misma caché de los editores de UDrive. */
export function useRecursosDrive(elementos: ElementoDrive[]): RecursosDrive {
  const ids1 = useMemo(() => [...new Set(elementos.map((e) => e.archivoId))], [elementos]);
  const q1 = useQueries({
    queries: ids1.map((id) => ({ queryKey: UD_CLAVES.contenido(id), retry: false, staleTime: 15_000, queryFn: () => pedirContenido(id) })),
  });
  const marca1 = q1.map((q) => `${q.dataUpdatedAt}${q.fetchStatus}`).join(",");

  const ids2 = useMemo(() => {
    const salida: string[] = [];
    for (const e of elementos) {
      if (e.tipo !== "grafica") continue;
      const c = q1[ids1.indexOf(e.archivoId)]?.data?.contenido as { tabla_id?: unknown } | undefined;
      if (c && typeof c.tabla_id === "string" && !ids1.includes(c.tabla_id) && !salida.includes(c.tabla_id)) salida.push(c.tabla_id);
    }
    return salida;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q1 cambia de identidad en cada render; basta con su marca
  }, [elementos, ids1, marca1]);
  const q2 = useQueries({
    queries: ids2.map((id) => ({ queryKey: UD_CLAVES.contenido(id), retry: false, staleTime: 15_000, queryFn: () => pedirContenido(id) })),
  });
  const marca2 = q2.map((q) => `${q.dataUpdatedAt}${q.fetchStatus}`).join(",");

  return useMemo(() => {
    if (!elementos.length) return VACIOS;
    const tablas = new Map<string, ContenidoTabla | null>();
    const graficas = new Map<string, { tabla_id: string | null; config: ConfigGrafica } | null>();
    const leerTabla = (id: string, crudo: unknown) => tablas.set(id, crudo && typeof crudo === "object" ? normalizarContenido(crudo) : null);
    for (const e of elementos) {
      const crudo = q1[ids1.indexOf(e.archivoId)]?.data?.contenido;
      if (e.tipo === "tabla") leerTabla(e.archivoId, crudo);
      else {
        const c = crudo as { tabla_id?: unknown; config?: unknown } | undefined;
        graficas.set(e.archivoId, c && typeof c === "object" ? { tabla_id: typeof c.tabla_id === "string" ? c.tabla_id : null, config: normalizarConfig(c.config, null) } : null);
      }
    }
    for (const g of graficas.values()) {
      if (g?.tabla_id && !tablas.has(g.tabla_id)) {
        const en1 = ids1.indexOf(g.tabla_id);
        const en2 = ids2.indexOf(g.tabla_id);
        leerTabla(g.tabla_id, en1 >= 0 ? q1[en1]?.data?.contenido : q2[en2]?.data?.contenido);
      }
    }
    const pendiente = (qs: { isPending: boolean; fetchStatus: string }[]) => qs.some((q) => q.isPending && q.fetchStatus !== "idle");
    return { tablas, graficas, listo: !pendiente(q1) && !pendiente(q2), firma: `${marca1}|${marca2}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las consultas se resumen en sus marcas
  }, [elementos, ids1, ids2, marca1, marca2]);
}

/* ---------- Piezas ------------------------------------------------------------------------------------- */

export function Estado({ e }: { e: EstadoMeta | null }) {
  if (!e) {
    return (
      <span className="vi-st vi-st-sin">
        <i aria-hidden="true" />
        Sin meta
      </span>
    );
  }
  return (
    <span className={`vi-st vi-st-${e}`}>
      <i aria-hidden="true" />
      {ETIQUETA_ESTADO_META[e]}
    </span>
  );
}

interface ColT {
  etiqueta: string;
  num?: boolean;
  ancho?: string;
}
interface FilaT {
  celdas: ReactNode[];
  total?: boolean;
}
interface TablaDef {
  titulo?: string;
  columnas: ColT[];
  filas: FilaT[];
  nota?: string;
}

function TablaVi({ def, t }: { def: TablaDef; t: Trozo | null }) {
  const desde = t?.desde ?? 0;
  const hasta = t?.hasta ?? def.filas.length;
  const primero = t?.primero ?? true;
  const ultimo = t?.ultimo ?? true;
  return (
    <div className="vi-fig">
      {primero && def.titulo ? <p className="vi-cap">{def.titulo}</p> : null}
      <table className="vi-t">
        <thead>
          <tr>
            {def.columnas.map((c, i) => (
              <th key={i} scope="col" data-num={c.num ? "true" : undefined} style={c.ancho ? { width: c.ancho } : undefined}>
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {def.filas.slice(desde, hasta).map((f, i) => (
            <tr key={desde + i} data-total={f.total ? "true" : undefined}>
              {f.celdas.map((c, k) => (
                <td key={k} data-num={def.columnas[k]?.num ? "true" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ultimo && def.nota ? (
        <p className="vi-nota">
          <b>Nota.</b> {def.nota}
        </p>
      ) : null}
    </div>
  );
}

/** Una tabla de filas: se parte por filas a partir de 5, repitiendo el encabezado. */
function unidadTabla(clave: string, seccion: number, def: TablaDef, extra: Partial<Unidad> = {}): Unidad {
  return {
    clave,
    seccion,
    partible: def.filas.length >= 5 ? "t" : undefined,
    dibujar: (t) => (
      <div className="vi-u">
        <TablaVi def={def} t={t} />
      </div>
    ),
    ...extra,
  };
}

/** Un párrafo: se parte por líneas cuando tiene cuatro o más. */
function unidadParrafo(clave: string, seccion: number, contenido: ReactNode): Unidad {
  return {
    clave,
    seccion,
    partible: "p",
    dibujar: (t, linea) => {
      if (!t || (t.primero && t.ultimo) || !linea) {
        return (
          <div className="vi-u">
            <p className="vi-p">{contenido}</p>
          </div>
        );
      }
      return (
        <div className="vi-u" style={t.ultimo ? undefined : { paddingBottom: 0 }}>
          <div style={{ height: (t.hasta - t.desde) * linea, overflow: "hidden" }}>
            <p className="vi-p" style={{ marginTop: -t.desde * linea }}>
              {contenido}
            </p>
          </div>
        </div>
      );
    },
  };
}

const unidadFija = (clave: string, seccion: number, nodo: ReactNode, extra: Partial<Unidad> = {}): Unidad => ({ clave, seccion, dibujar: () => nodo, ...extra });

const parrafosDe = (t: string): string[] => t.split(/\n+/).map((x) => x.trim()).filter(Boolean);

/** Barras de avance frente a la meta: la línea marca el 100 % (meta cumplida). Un solo color de serie. */
function GraficaAvance({ filas, titulo }: { filas: FilaIndicador[]; titulo: string }) {
  const conAvance = filas.filter((f) => f.avance !== null);
  const tope = Math.max(1.25, ...conAvance.map((f) => Math.min(f.avance ?? 0, 2)));
  const x0 = 62;
  const x1 = 150;
  const alto = 6.4;
  const H = conAvance.length * alto + 9;
  const X = (v: number) => x0 + ((x1 - x0) * Math.min(v, tope)) / tope;
  return (
    <figure className="vi-fig">
      <p className="vi-cap">{titulo}</p>
      <svg className="vi-svg" viewBox={`0 0 180 ${H}`} role="img" aria-label={`${titulo}: ${conAvance.map((f) => `${f.etiqueta} ${Math.round((f.avance ?? 0) * 100)} %`).join("; ")}`}>
        {conAvance.map((f, i) => {
          const y = 2 + i * alto;
          const v = f.avance ?? 0;
          const etiqueta = f.etiqueta.length > 34 ? `${f.etiqueta.slice(0, 33)}…` : f.etiqueta;
          return (
            <g key={f.clave}>
              <text x={0} y={y + 3.9} fontSize="2.8" fill="#16243a" fontWeight="600">
                {etiqueta}
              </text>
              <rect x={x0} y={y + 0.8} width={x1 - x0} height={3.6} fill="#eef3f9" />
              <rect x={x0} y={y + 0.8} width={Math.max(0.4, X(v) - x0)} height={3.6} fill="#1f5fbf" />
              <text x={x1 + 2} y={y + 3.9} fontSize="2.8" fill="#072b58" fontWeight="800">
                {Math.round(v * 100)} %
              </text>
            </g>
          );
        })}
        <line x1={X(1)} x2={X(1)} y1={0.5} y2={H - 6} stroke="#072b58" strokeWidth="0.35" strokeDasharray="1.2 0.8" />
        <text x={X(1)} y={H - 2.2} fontSize="2.5" fill="#072b58" fontWeight="700" textAnchor="middle">
          Meta (100 %)
        </text>
      </svg>
    </figure>
  );
}

const COLUMNAS_INDICADOR: ColT[] = [
  { etiqueta: "Indicador" },
  { etiqueta: "Valor", num: true, ancho: "19mm" },
  { etiqueta: "Meta", num: true, ancho: "19mm" },
  { etiqueta: "Anterior", num: true, ancho: "19mm" },
  { etiqueta: "Cambio", num: true, ancho: "17mm" },
  { etiqueta: "Estado", ancho: "27mm" },
];

const filaIndicadorT = (f: FilaIndicador): FilaT => ({
  celdas: [
    <>
      {f.etiqueta}
      {f.origen ? <small>{f.origen}</small> : null}
    </>,
    f.valor,
    f.meta,
    f.anterior,
    f.variacion,
    <Estado key="e" e={f.estado} />,
  ],
});

const Leyenda = () => (
  <p className="vi-leyenda">
    {(["superada", "cumplida", "parcial", "rezagada"] as EstadoMeta[]).map((e) => (
      <Estado key={e} e={e} />
    ))}
    <span>Parcial: entre 70 % y la meta. Rezagada: menos de 70 %.</span>
  </p>
);

/* ---------- Elementos de UDrive ------------------------------------------------------------------------- */

function celda(c: { tipo: string }, v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return "";
  return typeof v === "number" ? textoNumero(v) : String(v);
}

function unidadesDrive(s: SeccionLibro, i: number, r: RecursosDrive): Unidad[] {
  return s.drive.flatMap((e, k): Unidad[] => {
    const clave = `${s.clave}:drive:${k}`;
    if (e.tipo === "tabla") {
      const t = r.tablas.get(e.archivoId);
      if (!t) return [unidadFija(clave, i, <p className="vi-vacio">{r.listo ? "No se pudo leer la tabla de UDrive: ya no existe o no tiene permiso para verla." : "Cargando la tabla…"}</p>)];
      return [
        unidadTabla(clave, i, {
          titulo: e.titulo.trim() || t.presentacion.titulo,
          columnas: t.columnas.map((c) => ({ etiqueta: c.etiqueta, num: c.tipo === "numero" || c.tipo === "porcentaje" })),
          filas: t.filas.map((f) => ({ celdas: t.columnas.map((c) => celda(c, f.datos[c.clave] ?? null)) })),
          nota: e.nota.trim() || t.presentacion.nota,
        }),
      ];
    }
    const g = r.graficas.get(e.archivoId);
    const datos = g?.tabla_id ? r.tablas.get(g.tabla_id) : null;
    if (!g || !datos) return [unidadFija(clave, i, <p className="vi-vacio">{r.listo ? "No se pudo leer la gráfica de UDrive: ya no existe, no tiene permiso para verla o no tiene tabla de datos." : "Cargando la gráfica…"}</p>)];
    const titulo = e.titulo.trim() || g.config.titulo;
    const nota = e.nota.trim() || g.config.nota;
    return [
      {
        clave,
        seccion: i,
        dibujar: (_t, _l, medida) => (
          <div className="vi-u">
            <figure className="vi-fig">
              {titulo ? <p className="vi-cap">{titulo}</p> : null}
              <div className="vi-graf" style={{ height: "72mm" }} data-graf="true">
                {medida ? null : <GraficaVista tabla={{ columnas: datos.columnas, filas: datos.filas }} config={g.config} altura={272} />}
              </div>
              {nota ? (
                <p className="vi-nota">
                  <b>Nota.</b> {nota}
                </p>
              ) : null}
            </figure>
          </div>
        ),
      },
    ];
  });
}

/* ---------- Las unidades de una sección ---------------------------------------------------------------------- */

function unidadesSeccion(s: SeccionLibro, i: number, r: RecursosDrive): Unidad[] {
  const u: Unidad[] = [];
  const k = (x: string) => `${s.clave}:${x}`;
  u.push({
    clave: `sec:${i}`,
    seccion: i,
    nuevaPagina: true,
    pegar: true,
    dibujar: () => (
      <div className="vi-u">
        <EncabezadoSeccion codigo={String(s.numero).padStart(2, "0")} titulo={s.titulo} linea={s.funcion ? `Función sustantiva: ${s.funcion}` : undefined} />
      </div>
    ),
  });

  const texto = (clave: string, t: string, eyebrow?: string) => {
    const ps = parrafosDe(t);
    ps.forEach((p, n) => {
      if (n === 0 && eyebrow) u.push(unidadFija(k(`${clave}:e`), i, <div className="vi-u" style={{ paddingBottom: "1.5mm" }}><span className="vi-eyebrow" style={{ marginBottom: 0 }}>{eyebrow}</span></div>, { pegar: true }));
      u.push(unidadParrafo(k(`${clave}:${n}`), i, p));
    });
  };
  const sinContenido = (t = "Esta sección no tiene contenido.") => u.push(unidadFija(k("vacio"), i, <div className="vi-u"><p className="vi-vacio">{t}</p></div>));

  switch (s.tipo) {
    case "narr":
      if (s.texto) texto("t", s.texto);
      else sinContenido();
      break;
    case "pdi":
      if (s.pilares.length) {
        u.push(unidadTabla(k("pilares"), i, { titulo: "Pilares del Plan de Desarrollo con los que se articula", columnas: [{ etiqueta: "Pilar" }, { etiqueta: "Avance del pilar", num: true, ancho: "34mm" }], filas: s.pilares.map((p) => ({ celdas: [p.nombre, p.avance] })) }));
      } else if (!s.texto) sinContenido("No se marcaron pilares del Plan de Desarrollo.");
      if (s.texto) texto("t", s.texto, "Lectura de la unidad");
      break;
    case "metas":
      if (s.metas.length) {
        const conAnalisis = s.metas.some((m) => m.analisis);
        u.push(
          unidadTabla(k("metas"), i, {
            columnas: [{ etiqueta: "Objetivo" }, { etiqueta: "Meta", num: true, ancho: "22mm" }, { etiqueta: "Alcanzado", num: true, ancho: "22mm" }, { etiqueta: "Estado", ancho: "27mm" }, ...(conAnalisis ? [{ etiqueta: "Análisis", ancho: "52mm" }] : [])],
            filas: s.metas.map((m) => ({
              celdas: [
                <>
                  {m.nombre}
                  {m.donde ? <small>{m.donde}</small> : null}
                </>,
                m.meta,
                m.alcanzado,
                <Estado key="e" e={m.estado} />,
                ...(conAnalisis ? [m.analisis] : []),
              ],
            })),
          }),
        );
        u.push(unidadFija(k("ley"), i, <div className="vi-u"><Leyenda /></div>));
      } else sinContenido("No se registraron metas.");
      break;
    case "dim": {
      s.dimensiones.forEach((d, n) => {
        if (!d.filas.length) return;
        u.push(
          unidadFija(
            k(`d${n}:h`),
            i,
            <div className="vi-u">
              <div className="vi-sub-h">
                <h3>{d.titulo}</h3>
                <span>{d.funcion}</span>
              </div>
            </div>,
            { pegar: true, nuevaPagina: n > 0 && s.dimensiones.length > 1 },
          ),
        );
        u.push(unidadTabla(k(`d${n}:t`), i, { columnas: COLUMNAS_INDICADOR, filas: d.filas.map(filaIndicadorT) }));
        if (d.filas.filter((f) => f.avance !== null).length >= 2) {
          u.push(unidadFija(k(`d${n}:g`), i, <div className="vi-u"><GraficaAvance filas={d.filas} titulo="Avance frente a la meta (porcentaje de la meta alcanzado)" /></div>));
        }
        const just = d.filas.filter((f) => f.justificacion);
        just.forEach((f, m) =>
          u.push(
            unidadParrafo(
              k(`d${n}:j${m}`),
              i,
              <>
                <b>{f.etiqueta}.</b> {f.justificacion}
              </>,
            ),
          ),
        );
      });
      if (s.otros.length) {
        u.push(unidadFija(k("o:h"), i, <div className="vi-u"><div className="vi-sub-h"><h3>Otros datos de la unidad</h3></div></div>, { pegar: true }));
        u.push(unidadTabla(k("o:t"), i, { columnas: COLUMNAS_INDICADOR, filas: s.otros.map(filaIndicadorT) }));
        s.otros.filter((f) => f.justificacion).forEach((f, m) => u.push(unidadParrafo(k(`o:j${m}`), i, <><b>{f.etiqueta}.</b> {f.justificacion}</>)));
      }
      const hayFilas = s.dimensiones.some((d) => d.filas.length) || s.otros.length;
      if (hayFilas) u.push(unidadFija(k("ley"), i, <div className="vi-u"><Leyenda /></div>));
      if (s.texto) texto("t", s.texto, "Lectura de la unidad");
      else if (!hayFilas) sinContenido("Todavía no hay cifras conectadas en esta sección.");
      break;
    }
    case "matriz": {
      const grupos = new Map<string, FilaIndicador[]>();
      for (const f of s.matriz) grupos.set(f.dim, [...(grupos.get(f.dim) ?? []), f]);
      if (s.matriz.length) {
        const nombreDim = (id: string) => (id ? (Object.values(DIMS_TITULOS).find((d) => d.id === id)?.titulo ?? id) : "Datos de la unidad");
        const filas: FilaT[] = [...grupos.entries()].map(([id, fs]) => {
          const c = contarEstados(fs.map((f) => f.estado));
          const seg = (cls: string, n: number) => (n ? <span key={cls} className={cls} style={{ flex: n }}>{n}</span> : null);
          return {
            celdas: [
              nombreDim(id),
              String(c.superada),
              String(c.cumplida),
              String(c.parcial),
              String(c.rezagada),
              String(c.sinMeta),
              <div key="b" className="vi-stk" role="img" aria-label={`${c.superada} superadas, ${c.cumplida} cumplidas, ${c.parcial} parciales, ${c.rezagada} rezagadas, ${c.sinMeta} sin meta`}>
                {seg("s", c.superada)}
                {seg("c", c.cumplida)}
                {seg("p", c.parcial)}
                {seg("r", c.rezagada)}
                {seg("n", c.sinMeta)}
              </div>,
            ],
          };
        });
        const t = contarEstados(s.matriz.map((f) => f.estado));
        filas.push({ total: true, celdas: ["Total", String(t.superada), String(t.cumplida), String(t.parcial), String(t.rezagada), String(t.sinMeta), String(s.matriz.length)] });
        u.push(
          unidadTabla(k("resumen"), i, {
            titulo: "Estado de los indicadores por dimensión",
            columnas: [{ etiqueta: "Dimensión" }, { etiqueta: "Superada", num: true, ancho: "17mm" }, { etiqueta: "Cumplida", num: true, ancho: "17mm" }, { etiqueta: "Parcial", num: true, ancho: "15mm" }, { etiqueta: "Rezagada", num: true, ancho: "17mm" }, { etiqueta: "Sin meta", num: true, ancho: "16mm" }, { etiqueta: "Distribución", ancho: "38mm" }],
            filas,
          }),
        );
        u.push(unidadFija(k("ley"), i, <div className="vi-u"><Leyenda /></div>));
        u.push(unidadTabla(k("todas"), i, { titulo: "Indicadores del informe", columnas: COLUMNAS_INDICADOR, filas: s.matriz.map(filaIndicadorT) }));
      } else if (!s.texto) sinContenido("Todavía no hay cifras incluidas en el informe.");
      if (s.texto) texto("t", s.texto, "Lectura de la unidad");
      break;
    }
    case "filas":
      if (s.filas.length) {
        u.push(
          unidadTabla(k("filas"), i, {
            columnas: s.columnas.map((c) => ({ etiqueta: c })),
            filas: s.filas.map((f) => ({ celdas: s.columnas.map((_, n) => f[n] ?? "") })),
          }),
        );
      } else sinContenido();
      break;
    case "logros":
      if (s.logros.length) {
        u.push(
          unidadFija(
            k("logros"),
            i,
            <div className="vi-u">
              <div className="vi-logros">
                {s.logros.map((l, n) => (
                  <div key={n}>
                    <b className="big">{String(n + 1).padStart(2, "0")}</b>
                    <h3>{l.titulo}</h3>
                    {l.resultado ? <p>{l.resultado}</p> : null}
                    {l.anexo !== null ? <small>Evidencia: Anexo {l.anexo}</small> : null}
                  </div>
                ))}
              </div>
            </div>,
          ),
        );
      } else sinContenido();
      break;
    case "evid":
    case "anexos":
      if (s.anexos.length) {
        u.push(
          unidadTabla(k("anexos"), i, {
            columnas: [{ etiqueta: "N.º", ancho: "14mm" }, { etiqueta: "Documento" }, { etiqueta: "Descripción", ancho: "70mm" }],
            filas: s.anexos.map((a) => ({
              celdas: [
                String(a.n),
                <>
                  {a.nombre}
                  {a.enlace ? <small>{a.enlace}</small> : null}
                </>,
                a.descripcion,
              ],
            })),
            nota: "Los archivos se entregan aparte, en la carpeta del informe.",
          }),
        );
      } else sinContenido("No se cargaron anexos.");
      break;
  }

  u.push(...unidadesDrive(s, i, r));

  if (s.fuente) {
    u.push(
      unidadFija(
        k("fuente"),
        i,
        <div className="vi-u vi-u--pie">
          <p className="vi-src">
            <b>Fuente:</b> {s.fuente}
          </p>
        </div>,
      ),
    );
  }
  return u;
}

const DIMS_TITULOS = Object.values(DIMS);

export function unidadesDelLibro(e: EntradaLibro, r: RecursosDrive): Unidad[] {
  return e.secciones.flatMap((s, i) => unidadesSeccion(s, i, r));
}
