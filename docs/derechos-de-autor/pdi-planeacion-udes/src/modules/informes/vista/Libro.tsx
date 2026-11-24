/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · el libro paginado.

   Paginado de dos pasadas, el mismo de UDrive (udrive/salida/PaginasPdf.tsx):
     1. Las unidades del cuerpo se dibujan fuera de pantalla al ancho exacto
        del cuerpo, se miden cuando ya están las fuentes y las imágenes, y
        udrive/lib/paginado.ts las reparte en hojas. Eso dice en qué página
        empieza cada sección.
     2. Se dibujan las hojas con el índice ya con esos números. El índice
        ocupa una hoja con el número real o con el provisional, así la segunda
        pasada no mueve nada.
   La medición espera a las fuentes y se hace una vez por cambio de contenido
   (la firma es el JSON de los datos), no a cada render.
   ========================================================================== */

import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { loadBulletinFont } from "../../boletin/fonts";
import { paginar } from "../../udrive/lib/paginado";
import type { ItemPaginado, Trozo } from "../../udrive/lib/paginado";
import type { Unidad } from "./armado";
import type { EntradaLibro } from "./entrada";
import { HojaContenido, PaginaCierre, PaginaContenido, PaginaContraportada, PaginaPortada, varsHoja } from "./Hoja";
import type { ContextoHoja, EntradaContenido } from "./Hoja";
import { ACENTO_BASE, PAPELES, PX_POR_MM, evaluarAcento } from "./perfil";
import type { DisenoInforme, Papel } from "./perfil";

export interface ResultadoLibro {
  paginas: Trozo[][];
  paginaDe: ReadonlyMap<string, number>;
  /** Alto medido de una línea de párrafo, por unidad. */
  lineas: ReadonlyMap<string, number>;
  /** Las fuentes y las imágenes estaban listas al medir: los números son los del PDF. */
  exacto: boolean;
}

/** Cuerpo de la primera hoja numerada: la portada es la 1 y el contenido, la 2. */
const PRIMERA_HOJA_DE_CUERPO = 3;
/** Aire que cada unidad lleva debajo (vista.css .vi-u): la última de la hoja no lo necesita. */
const AIRE_MM = 4;

const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function esperarListo(raiz: HTMLElement): Promise<boolean> {
  let exacto = true;
  try {
    await Promise.race([loadBulletinFont("Montserrat"), esperar(5000)]);
    if ("fonts" in document) await Promise.race([document.fonts.ready.then(() => undefined), esperar(4000)]);
  } catch {
    exacto = false;
  }
  const imgs = Array.from(raiz.querySelectorAll("img"));
  const cargadas = await Promise.race([
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve(true) : new Promise<boolean>((r) => { i.onload = () => r(true); i.onerror = () => r(false); })))).then((x) => x.every(Boolean)),
    esperar(6000).then(() => false),
  ]);
  if (!cargadas) exacto = false;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return exacto;
}

function medirUnidades(raiz: HTMLElement, unidades: readonly Unidad[]): { items: ItemPaginado[]; lineas: Map<string, number> } {
  const lineas = new Map<string, number>();
  const items = unidades.map((u, n): ItemPaginado => {
    const el = raiz.children[n] as HTMLElement | undefined;
    const alto = el ? el.getBoundingClientRect().height : 0;
    const base: ItemPaginado = { clave: u.clave, alto, nuevaPagina: u.nuevaPagina, pegar: u.pegar };
    if (!el || !u.partible) return base;
    if (u.partible === "p") {
      const p = el.querySelector<HTMLElement>(".vi-p");
      const linea = p ? parseFloat(getComputedStyle(p).lineHeight) : NaN;
      if (!Number.isFinite(linea) || linea <= 0) return base;
      const aire = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const n = Math.max(1, Math.round((alto - aire) / linea));
      if (n < 4) return base;
      lineas.set(u.clave, linea);
      return { ...base, partes: Array.from({ length: n }, () => linea), cabeza: 0, cabezaSiguientes: 0, pie: Math.max(0, alto - n * linea), minPrimero: 2, minUltimo: 2 };
    }
    const filas = Array.from(el.querySelectorAll<HTMLElement>("tbody tr"));
    if (filas.length < 5) return base;
    const top = el.getBoundingClientRect().top;
    const alturas = filas.map((f) => f.getBoundingClientRect().height);
    const cabeza = filas[0].getBoundingClientRect().top - top;
    const enc = el.querySelector<HTMLElement>("thead")?.getBoundingClientRect().height ?? 0;
    const suma = alturas.reduce((t, h) => t + h, 0);
    return { ...base, partes: alturas, cabeza, cabezaSiguientes: enc, pie: Math.max(0, alto - cabeza - suma), minPrimero: 2, minUltimo: 2, pegar: undefined };
  });
  return { items, lineas };
}

/**
 * Mide las unidades fuera de pantalla y las reparte en hojas. `listo` es falso
 * mientras faltan datos (cifras, tablas de UDrive): no se mide hasta que estén.
 * Devuelve el nodo de medida, que debe ir en el árbol, y el resultado.
 */
export function useLibro(unidades: Unidad[], papel: Papel, listo: boolean): { medida: ReactNode; resultado: ResultadoLibro | null; midiendo: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [resultado, setResultado] = useState<ResultadoLibro | null>(null);
  const [midiendo, setMidiendo] = useState(true);

  useEffect(() => {
    if (!listo) {
      setMidiendo(true);
      return;
    }
    let vigente = true;
    setMidiendo(true);
    // Un respiro para agrupar los cambios seguidos (escribir, cambiar de papel) en una sola medición.
    const espera = window.setTimeout(() => {
      void (async () => {
        const raiz = ref.current;
        if (!raiz) return;
        const exacto = await esperarListo(raiz);
        if (!vigente) return;
        const { items, lineas } = medirUnidades(raiz, unidades);
        const medidas = PAPELES[papel];
        const alto = (medidas.cuerpoAlto + AIRE_MM) * PX_POR_MM - 1;
        const r = paginar(items, alto, PRIMERA_HOJA_DE_CUERPO);
        setResultado({ paginas: r.paginas, paginaDe: r.paginaDe, lineas, exacto });
        setMidiendo(false);
      })();
    }, 80);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [unidades, papel, listo]);

  const medida = (
    <div ref={ref} className="vi vi-pg vi-medida" style={varsHoja(papel, evaluarAcento(ACENTO_BASE))} aria-hidden="true">
      {unidades.map((u) => (
        <Fragment key={u.clave}>{u.dibujar(null, 0, true)}</Fragment>
      ))}
    </div>
  );
  return { medida, resultado, midiendo };
}

/* ---------- El libro ---------- */

export interface PropsLibro {
  ctx: ContextoHoja;
  diseno: DisenoInforme;
  /** La imagen propia de la portada, ya firmada. */
  fotoUrl: string | null;
  entrada: EntradaLibro;
  unidades: Unidad[];
  resultado: ResultadoLibro | null;
}

/** Título de la franja de una hoja de cuerpo: el de su sección, y «continuación» si no es la primera hoja de ella. */
function tituloDeHoja(trozos: Trozo[], unidades: ReadonlyMap<string, Unidad>, e: EntradaLibro): string {
  const primero = trozos[0];
  const u = primero ? unidades.get(primero.clave) : undefined;
  if (!u) return "Informe";
  const titulo = e.secciones[u.seccion]?.titulo ?? "Informe";
  const abre = trozos.some((t) => t.clave === `sec:${u.seccion}`);
  return abre ? titulo : `${titulo} (continuación)`;
}

export function Libro({ ctx, diseno, fotoUrl, entrada, unidades, resultado }: PropsLibro) {
  const porClave = new Map(unidades.map((u) => [u.clave, u]));
  const paginasCuerpo = resultado?.paginas ?? [];
  const folioCierre = PRIMERA_HOJA_DE_CUERPO + paginasCuerpo.length;

  const indice: EntradaContenido[] = [
    ...entrada.secciones.map((s, i) => ({ titulo: s.titulo, numero: String(s.numero).padStart(2, "0"), pagina: resultado?.paginaDe.get(`sec:${i}`) ?? null })),
    { titulo: "Cierre del informe", pagina: resultado ? folioCierre : null },
  ];

  return (
    <div className="vi-libro">
      <PaginaPortada ctx={ctx} portada={diseno.portada} fotoUrl={fotoUrl} />
      <PaginaContenido ctx={ctx} entradas={indice} />
      {paginasCuerpo.map((trozos, n) => (
        <HojaContenido key={n} ctx={ctx} titulo={tituloDeHoja(trozos, porClave, entrada)} folio={PRIMERA_HOJA_DE_CUERPO + n}>
          {trozos.map((t) => {
            const u = porClave.get(t.clave);
            return u ? <Fragment key={`${t.clave}:${t.desde}`}>{u.dibujar(u.partible ? t : null, resultado?.lineas.get(t.clave) ?? 0, false)}</Fragment> : null;
          })}
        </HojaContenido>
      ))}
      {resultado ? <PaginaCierre ctx={ctx} cierre={diseno.cierre} folio={folioCierre} anioTexto={`Año de gestión ${entrada.anio}`} /> : null}
      {resultado ? <PaginaContraportada ctx={ctx} contra={diseno.contraportada} anio={entrada.anio} /> : null}
    </div>
  );
}
