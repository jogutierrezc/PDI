/* =============================================================================
   UDrive · arma lo que el editor y el PDF necesitan para dibujar un documento:
   los datos de las tablas y gráficas, el número de cada figura, el valor de
   cada cifra viva y el contexto con que se resuelven citas y referencias.
   ========================================================================== */

import { useMemo } from "react";
import { aNumero } from "../../informes/cifras-vivas";
import { useLecturasCifras } from "../datosDocumento";
import { clavesDelDocumento, resolverCifra } from "../lib/cifras";
import type { LecturaCifra } from "../lib/cifras";
import type { Documento, Fuente } from "../lib/documento";
import { contextoDe, numerarFiguras } from "../lib/numeracion";
import { fuentesDeBibliografia } from "../lib/plan";
import { esFigura } from "../lib/documento";
import { notaGrafica, notaTabla, tituloGrafica, tituloTabla } from "./Piezas";
import type { EntradaPdf } from "./PaginasPdf";
import { useRecursos } from "./recursos";

export interface OpcionesEntrada {
  /** Aprobado: mandan las cifras congeladas, no las vivas. */
  aprobado: boolean;
  /** Los datos de una versión guardada, en lugar de los archivos vivos. */
  instantanea?: Record<string, unknown>;
  titulo: string;
}

export interface EntradaConLecturas extends EntradaPdf {
  lecturas: ReadonlyMap<string, LecturaCifra>;
  claves: string[];
  cargandoCifras: boolean;
}

export function useEntrada(doc: Documento, o: OpcionesEntrada): EntradaConLecturas {
  const recursos = useRecursos(doc, o.instantanea);
  const claves = useMemo(() => clavesDelDocumento(doc), [doc]);
  const vivas = useLecturasCifras(claves, !o.aprobado && !o.instantanea);

  const lecturas = useMemo(() => {
    const m = new Map<string, LecturaCifra>();
    for (const f of vivas.data ?? []) m.set(f.clave.toLowerCase(), { clave: f.clave.toLowerCase(), valor: aNumero(f.valor), fuente: f.fuente ?? "", corte: f.corte });
    return m;
  }, [vivas.data]);

  const congelado = o.aprobado || Boolean(o.instantanea);
  const cifra = useMemo(() => (k: string) => resolverCifra({ vistas: doc.vistas, congeladas: doc.congeladas }, k, lecturas, congelado), [doc.vistas, doc.congeladas, lecturas, congelado]);

  // Las figuras solo se vuelven a numerar si cambia algo que las afecta (no a cada letra escrita).
  const titulos = (b: Documento["bloques"][number]): string => {
    if (b.tipo === "tabla") return tituloTabla(b, recursos.tablas.get(b.archivoId));
    if (b.tipo === "grafica") return tituloGrafica(b, recursos.graficas.get(b.archivoId));
    return b.tipo === "imagen" ? b.titulo : "";
  };
  const firmaFiguras = doc.bloques.filter(esFigura).map((b) => `${b.id}|${b.tipo}|${b.enIndice ? 1 : 0}|${titulos(b)}`).join("¦");
  const figuras = useMemo(() => numerarFiguras(doc, titulos), [firmaFiguras]); // eslint-disable-line react-hooks/exhaustive-deps -- firmaFiguras resume lo que importa

  const fuentes = doc.fuentes;
  const texto = useMemo(
    () =>
      contextoDe({ fuentes }, figuras, (k) => {
        const c = cifra(k);
        return c ? { texto: c.texto, cambio: c.cambio ?? undefined } : null;
      }),
    [fuentes, figuras, cifra],
  );

  const firmaBib = JSON.stringify(fuentesDeBibliografia(doc));
  const bibliografia = useMemo(() => JSON.parse(firmaBib) as Fuente[], [firmaBib]);

  const firmaCifras = useMemo(() => claves.map((k) => `${k}=${cifra(k)?.texto ?? ""}`).join("|"), [claves, cifra]);

  return { doc, titulo: o.titulo, recursos, figuras, bibliografia, texto, cifra, firmaCifras, borrador: !o.aprobado, lecturas, claves, cargandoCifras: vivas.isPending && claves.length > 0 && !congelado };
}

/** Título y nota que el bloque muestra (los suyos o, vacíos, los del archivo que usa). */
export function textoDeFigura(doc: Documento, bloqueId: string, recursos: EntradaPdf["recursos"]): { titulo: string; nota: string } {
  const b = doc.bloques.find((x) => x.id === bloqueId);
  if (!b) return { titulo: "", nota: "" };
  if (b.tipo === "tabla") {
    const t = recursos.tablas.get(b.archivoId);
    return { titulo: tituloTabla(b, t), nota: notaTabla(b, t) };
  }
  if (b.tipo === "grafica") {
    const g = recursos.graficas.get(b.archivoId);
    return { titulo: tituloGrafica(b, g), nota: notaGrafica(b, g) };
  }
  if (b.tipo === "imagen") return { titulo: b.titulo, nota: b.nota };
  return { titulo: "", nota: "" };
}
