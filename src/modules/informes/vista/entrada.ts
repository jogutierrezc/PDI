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
import { cifraDef, DIMS } from "../plantillas";
import { resolverTexto } from "../tokens";
import type { ElementoDrive, Logro, Meta, PilarRef, TipoSeccion } from "../types";
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
}

export interface GrupoDimension {
  id: string;
  titulo: string;
  funcion: string;
  filas: FilaIndicador[];
}

export interface FilaMeta {
  nombre: string;
  donde: string;
  meta: string;
  alcanzado: string;
  estado: EstadoMeta | null;
  analisis: string;
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
  drive: ElementoDrive[];
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
  const resolver = resolverDe(m.incluidas);
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
        ? enSeccion.filter((x) => !dePlantilla.has(x.clave)).map(filaIndicador)
        : [];

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
      matriz: def.tipo === "matriz" ? m.incluidas.map(filaIndicador) : [],
      drive: c.drive ?? [],
      fuente: fuenteDe(cifrasFuente),
    };
  });

  return { anio, secciones };
}
