/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · lo que el papel necesita del
   informe, como datos planos.

   `entradaLibro` toma el modelo del editor (cifras en vivo o foto, textos con
   sus cifras resueltas, anexos, pilares) y lo vuelve JSON: sin funciones ni
   React. Así el paginado se recalcula solo cuando cambia el contenido de
   verdad (la firma es el JSON), no cada vez que React vuelve a dibujar.
   ========================================================================== */

import { formatoCifra, variacion } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import type { ModeloInforme } from "../ui/modelo";
import { resolverDe } from "../ui/Texto";
import { esClaveIndicador } from "../indicadores-manual";
import { hayDatosDeSintesis } from "../sintesis";
import type { Sintesis } from "../sintesis";
import type { IndicadorManual } from "../indicadores-manual";
import { cifraDef, DIMS } from "../plantillas";
import { driveDeAlineacion, normalizarAlineacion, tieneAlineacion } from "../alineacion";
import { driveLibre } from "../secciones-config";
import { resolverTexto } from "../tokens";
import type { Resolver } from "../tokens";
import type { BloqueLibre, ContenidoSeccion, ElementoDrive, Logro, Meta, PilarRef, TipoSeccion } from "../types";
import { avanceFrenteAMeta, estadoMeta } from "./estados";
import type { EstadoMeta } from "./estados";

export interface FilaIndicador {
  clave: string;
  etiqueta: string;
  /** Valor ya formateado («2.840», «7,8 %») o «—». */
  valor: string;
  meta: string;
  anterior: string;
  variacion: string;
  estado: EstadoMeta | null;
  /** Fracción de la meta alcanzada, para las barras. */
  avance: number | null;
  /** «Dato propio · fuente X» cuando lo escribió la unidad. */
  origen: string;
  dim: string;
  justificacion: string;
  /** Nombre del criterio o dimensión cuando no es una de las base. */
  dimNombre?: string;
}

/** Una acción descrita por la unidad (Resultados y evidencias): texto, sin aritmética. */
export interface FilaAccion {
  nombre: string;
  descripcion: string;
  hecho: string;
  finalizacion: string;
  /** «Texto · 120 estudiantes» ya unido, o vacío. */
  proyeccion: string;
}

export interface GrupoDimension {
  id: string;
  titulo: string;
  funcion: string;
  filas: FilaIndicador[];
  acciones?: FilaAccion[];
}

export interface FilaMeta {
  nombre: string;
  donde: string;
  meta: string;
  alcanzado: string;
  estado: EstadoMeta | null;
  analisis: string;
}

/** Un bloque de una sección libre, ya resuelto. */
export type BloqueEntrada = { tipo: "texto"; texto: string } | { tipo: "drive"; drive: ElementoDrive[] } | { tipo: "tabla"; titulo: string; nota: string; encabezados: string[]; filas: string[][] };

/** Alineación estratégica ya resuelta: un aporte por pilar con sus acciones y bloques. */
export interface AporteEntrada {
  pilar: string;
  avance: string;
  aporte: string;
  acciones: { titulo: string; descripcion: string; bloques: BloqueEntrada[] }[];
}

export interface SeccionLibro {
  clave: string;
  numero: number;
  titulo: string;
  tipo: TipoSeccion;
  funcion: string;
  /** Texto de la sección con las cifras ya puestas. */
  texto: string;
  dimensiones: GrupoDimension[];
  /** Cifras agregadas o propias que la unidad puso en esta sección. */
  otros: FilaIndicador[];
  pilares: { nombre: string; avance: string }[];
  metas: FilaMeta[];
  columnas: string[];
  filas: string[][];
  logros: Logro[];
  anexos: { n: number; nombre: string; descripcion: string; enlace: string }[];
  /** Todas las cifras incluidas del informe (matriz). */
  matriz: FilaIndicador[];
  /** Todos los elementos de UDrive de la sección (en las libres, los de sus bloques). */
  drive: ElementoDrive[];
  /** Solo en la alineación estratégica (pdi) con aportes por pilar. */
  alineacion?: AporteEntrada[];
  /** Solo en las secciones libres: sus bloques en orden. */
  bloques: BloqueEntrada[];
  /** Síntesis armada con lo reportado (solo en secciones de tipo matriz y si hay datos). */
  sintesis: Sintesis | null;
  /** Fuente al pie: «UDES en Cifras · corte 31 dic 2025». */
  fuente: string;
}

export interface EntradaLibro {
  anio: string;
  secciones: SeccionLibro[];
}

const fecha = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

/** Los aportes por pilar de la alineación estratégica, en el orden del Plan y sin pilares vacíos. */
function alineacionEntrada(c: ContenidoSeccion, resolver: Resolver, pilares: PilarRef[]): AporteEntrada[] {
  const bloques = (bs: BloqueLibre[]): BloqueEntrada[] =>
    bs
      .map((b): BloqueEntrada => (b.tipo === "texto" ? { tipo: "texto", texto: resolverTexto(b.texto, resolver).trim() } : b.tipo === "drive" ? { tipo: "drive", drive: b.drive } : { tipo: "tabla", titulo: b.titulo, nota: b.nota, encabezados: b.encabezados, filas: b.filas }))
      .filter((b) => (b.tipo === "texto" ? b.texto : b.tipo === "drive" ? b.drive.length : b.filas.some((f) => f.some((x) => x.trim()))));
  const orden = (id: string) => {
    const i = pilares.findIndex((p) => p.id === id);
    return i < 0 ? 999 : i;
  };
  return normalizarAlineacion(c)
    .sort((a, b) => orden(a.pilar) - orden(b.pilar))
    .map((a) => {
      const p = pilares.find((x) => x.id === a.pilar);
      return {
        pilar: p ? `${p.numeral}. ${p.name}` : "Pilar del Plan de Desarrollo",
        avance: !p || p.progress === null ? "—" : `${p.progress} %`,
        aporte: resolverTexto(a.aporte, resolver).trim(),
        acciones: a.acciones.map((x) => ({ titulo: x.titulo.trim(), descripcion: x.descripcion.trim(), bloques: bloques(x.bloques) })).filter((x) => x.titulo || x.descripcion || x.bloques.length),
      };
    })
    .filter((a) => a.aporte || a.acciones.length);
}

/** Un indicador escrito a mano, agrupado por su criterio. */
function filaManual(c: CifraVista, ind: IndicadorManual): FilaIndicador {
  const id = ind.criterio || "otros";
  return { ...filaIndicador(c), dim: id, dimNombre: (id in DIMS ? DIMS[id as keyof typeof DIMS].titulo : ind.criterio_nombre) || "Otros indicadores" };
}

function filaIndicador(c: CifraVista): FilaIndicador {
  return {
    clave: c.clave,
    etiqueta: c.etiqueta,
    valor: formatoCifra(c.valor, c.unidad),
    meta: c.meta === null ? "—" : formatoCifra(c.meta, c.unidad),
    anterior: c.anterior === null ? "—" : formatoCifra(c.anterior, c.unidad),
    variacion: variacion(c.valor, c.anterior, c.unidad) ?? "—",
    estado: estadoMeta(c.valor, c.meta, c.mayorMejor),
    avance: avanceFrenteAMeta(c.valor, c.meta, c.mayorMejor),
    origen: c.propia && c.fuente ? `Dato propio · ${c.fuente}` : c.propia ? "Dato propio" : "",
    dim: cifraDef(c.clave)?.dim ?? "",
    justificacion: c.justificacion.trim(),
  };
}

/** «UDES en Cifras · Matrícula · Permanencia · corte 31 dic 2025»: las fuentes que usan las cifras, sin repetir. */
function fuenteDe(cifras: CifraVista[]): string {
  const fuentes = [...new Set(cifras.map((c) => c.fuente.trim()).filter(Boolean))];
  if (!fuentes.length) return "";
  const cortes = cifras.map((c) => c.corte).filter((x): x is string => Boolean(x)).sort();
  const corte = fecha(cortes[cortes.length - 1] ?? null);
  const lista = fuentes.length > 3 ? `${fuentes.slice(0, 3).join("; ")} y ${fuentes.length - 3} más` : fuentes.join("; ");
  return `${lista}${corte ? ` · corte ${corte}` : ""}`;
}

export function entradaLibro(m: ModeloInforme, pilares: PilarRef[], anio: string): EntradaLibro {
  const resolver = resolverDe(m.citables);
  const marcados = (ids: string[] | undefined) => pilares.filter((p) => ids?.includes(p.id));

  const secciones = m.plantilla.secciones.map((def, i): SeccionLibro => {
    const c = m.contenidoGuardado(def.clave);
    const ctx = m.contexto(def);
    const enSeccion = [...ctx.cifras.filter((x) => x.incluida && m.conectada(x)), ...ctx.propias];

    const dimensiones: GrupoDimension[] =
      def.tipo === "dim"
        ? (def.dims ?? []).map((d) => ({
            id: d,
            titulo: DIMS[d].titulo,
            funcion: DIMS[d].funcion,
            filas: DIMS[d].cifras
              .map(m.vista)
              .filter((x) => x.condicion !== "no" && x.incluida && m.conectada(x))
              .map(filaIndicador),
          }))
        : [];
    const dePlantilla = new Set((def.dims ?? []).flatMap((d) => DIMS[d].cifras));
    const otros =
      def.tipo === "dim"
        ? enSeccion.filter((x) => !dePlantilla.has(x.clave) && !esClaveIndicador(x.clave)).map(filaIndicador)
        : [];
    // Los indicadores escritos a mano se agrupan por criterio, junto a las dimensiones base.
    if (def.tipo === "dim") {
      for (const a of m.accionesManuales.filter((x) => x.seccion === def.clave && x.completa)) {
        const id = a.ind.criterio || "otros";
        const proy = [a.ind.proyeccion_texto?.trim() ?? "", a.ind.proyeccion_num != null ? formatoCifra(a.ind.proyeccion_num, a.ind.unidad) : ""].filter(Boolean).join(" · ");
        const fila: FilaAccion = { nombre: a.ind.nombre.trim(), descripcion: (a.ind.descripcion ?? "").trim(), hecho: (a.ind.avance_texto ?? "").trim(), finalizacion: (a.ind.finalizacion ?? "").trim(), proyeccion: proy };
        const grupo = dimensiones.find((g) => g.id === id);
        if (grupo) (grupo.acciones ??= []).push(fila);
        else dimensiones.push({ id, titulo: a.ind.criterio_nombre || "Datos de la unidad", funcion: "Indicadores de la unidad", filas: [], acciones: [fila] });
      }
      for (const ind of m.manuales.filter((x) => x.seccion === def.clave)) {
        const fila = filaManual(ind.vista, ind.ind);
        const id = fila.dim;
        const nombre = fila.dimNombre ?? "";
        const grupo = dimensiones.find((g) => g.id === id);
        if (grupo) grupo.filas.push(fila);
        else dimensiones.push({ id, titulo: nombre, funcion: "Indicadores de la unidad", filas: [fila] });
      }
    }

    const metasPrograma = def.tipo === "metas" ? m.metasPrograma : [];
    const metas = [
      ...metasPrograma.map(
        (f): FilaMeta => ({
          nombre: f.nombre,
          donde: f.donde,
          meta: f.meta !== null ? formatoCifra(f.meta, f.unidad) : f.metaTexto || "—",
          alcanzado: formatoCifra(f.alcanzado, f.unidad),
          estado: estadoMeta(f.alcanzado, f.meta, !f.baja),
          analisis: (c.observaciones?.[f.clave] ?? "").trim(),
        }),
      ),
      ...((def.tipo === "metas" ? c.metas : undefined) ?? []).filter((x: Meta) => x.meta.trim()).map(
        (x: Meta): FilaMeta => ({
          nombre: x.meta.trim(),
          donde: "Meta adicional",
          meta: formatoCifra(x.programado),
          alcanzado: formatoCifra(x.alcanzado),
          estado: estadoMeta(x.alcanzado, x.programado, true),
          analisis: "",
        }),
      ),
    ];

    const anexos = def.tipo === "anexos" || def.tipo === "evid" ? (m.anexos.data ?? []) : [];
    const cifrasFuente = def.tipo === "matriz" ? m.incluidas : enSeccion;

    return {
      clave: def.clave,
      numero: i + 1,
      titulo: def.titulo,
      tipo: def.tipo,
      funcion: def.funcion ?? "",
      texto: resolverTexto(c.texto ?? "", resolver).trim(),
      dimensiones,
      otros,
      pilares: def.tipo === "pdi" ? marcados(c.pilares).map((p) => ({ nombre: `${p.numeral}. ${p.name}`, avance: p.progress === null ? "—" : `${p.progress} %` })) : [],
      metas,
      columnas: def.columnas ?? [],
      filas: def.tipo === "filas" ? (c.filas ?? []).filter((f) => f.some((v) => String(v ?? "").trim())).map((f) => f.map((v) => String(v ?? "").trim())) : [],
      logros: def.tipo === "logros" ? (c.logros ?? []).filter((l) => l.titulo.trim() || l.resultado.trim()) : [],
      anexos: anexos.map((a) => ({ n: a.n, nombre: a.nombre, descripcion: a.descripcion, enlace: a.tipo === "url" ? a.ruta : "" })),
      matriz:
        def.tipo === "matriz"
          ? m.incluidas.map((x) => {
              const man = m.manuales.find((y) => y.vista.clave === x.clave);
              return man ? filaManual(x, man.ind) : filaIndicador(x);
            })
          : [],
      drive: def.tipo === "libre" ? driveLibre(c) : def.tipo === "pdi" ? [...(c.drive ?? []), ...driveDeAlineacion(c)] : (c.drive ?? []),
      alineacion: def.tipo === "pdi" && tieneAlineacion(c) ? alineacionEntrada(c, resolver, pilares) : undefined,
      bloques: def.tipo === "libre" ? (c.bloques ?? []).map((b): BloqueEntrada => (b.tipo === "texto" ? { tipo: "texto", texto: resolverTexto(b.texto, resolver).trim() } : b.tipo === "drive" ? { tipo: "drive", drive: b.drive } : { tipo: "tabla", titulo: b.titulo, nota: b.nota, encabezados: b.encabezados, filas: b.filas })).filter((b) => b.tipo !== "tabla" || b.filas.some((f) => f.some((x) => x.trim()))) : [],
      sintesis: def.tipo === "matriz" && hayDatosDeSintesis(m.sintesis) ? m.sintesis : null,
      fuente: fuenteDe(cifrasFuente),
    };
  });

  return { anio, secciones };
}
