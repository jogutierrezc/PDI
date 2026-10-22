/* =============================================================================
   UDrive · el paginado del PDF, sin React ni DOM.

   El navegador mide cada unidad (un párrafo, una figura, una fila de tabla…) y
   esta función las reparte en páginas Carta. Reglas, las del informe de
   referencia:

     · una figura con su pie (imagen, gráfica) nunca se parte entre páginas;
     · un párrafo largo sí se parte, por líneas, sin dejar menos de dos líneas
       solas arriba ni abajo (viudas y huérfanas);
     · una tabla larga se parte por filas: el título va con las primeras filas,
       el encabezado se repite en cada página si así se pidió y la nota va al
       final del último trozo;
     · un título nunca queda solo al final de una página (va con lo que sigue);
     · un capítulo de nivel 1, un índice o un salto de página abren hoja.

   El resultado dice qué trozo de qué unidad cae en cada página; con eso se
   sabe en qué página está cada título y cada figura. Es la primera pasada del
   paginado de dos pasadas: la segunda imprime los índices con esos números.
   ========================================================================== */

/** Carta en píxeles CSS (96 por pulgada): 8,5 × 11 pulgadas. */
export const PAGINA = { ancho: 816, alto: 1056, margenX: 72, arriba: 76, abajo: 76 } as const;
export const ALTO_CUERPO = PAGINA.alto - PAGINA.arriba - PAGINA.abajo;
export const ANCHO_CUERPO = PAGINA.ancho - PAGINA.margenX * 2;

export interface ItemPaginado {
  clave: string;
  /** Alto total medido, con su margen inferior. */
  alto: number;
  /** Empieza en hoja nueva. */
  nuevaPagina?: boolean;
  /** No puede quedar al final de una página: se pega a lo que sigue. */
  pegar?: boolean;
  /** Si se puede partir: el alto de cada parte (línea de párrafo o fila de tabla). */
  partes?: readonly number[];
  /** Alto fijo antes de las partes en el primer trozo (título de tabla + encabezado). */
  cabeza?: number;
  /** Alto fijo antes de las partes en los trozos siguientes (el encabezado repetido, o 0). */
  cabezaSiguientes?: number;
  /** Alto fijo después de la última parte (nota, margen inferior). */
  pie?: number;
  /** Partes mínimas en el primer trozo y en el último. */
  minPrimero?: number;
  minUltimo?: number;
}

export interface Trozo {
  clave: string;
  /** Partes [desde, hasta) de este trozo; sin partes, 0 y 1. */
  desde: number;
  hasta: number;
  primero: boolean;
  ultimo: boolean;
  /** Alto que ocupa en la página. */
  alto: number;
}

export interface ResultadoPaginado {
  paginas: Trozo[][];
  /** Página (1 = la primera) donde empieza cada unidad. */
  paginaDe: Map<string, number>;
}

const dividible = (it: ItemPaginado): it is ItemPaginado & { partes: readonly number[] } => Boolean(it.partes && it.partes.length > 1);

/** El alto mínimo con que la unidad puede empezar en una página (para pegar un título con lo que sigue). */
function altoMinimoInicial(it: ItemPaginado): number {
  if (!dividible(it)) return it.alto;
  const k = Math.min(it.partes.length, it.minPrimero ?? 1);
  return (it.cabeza ?? 0) + it.partes.slice(0, k).reduce((t, p) => t + p, 0) + (k === it.partes.length ? (it.pie ?? 0) : 0);
}

export function paginar(items: readonly ItemPaginado[], altoCuerpo: number = ALTO_CUERPO, primeraPagina: number = 1): ResultadoPaginado {
  const paginas: Trozo[][] = [[]];
  const paginaDe = new Map<string, number>();
  let usado = 0;

  const nueva = () => {
    if (paginas[paginas.length - 1].length) paginas.push([]);
    usado = 0;
  };
  const poner = (t: Trozo, marcar: boolean) => {
    paginas[paginas.length - 1].push(t);
    usado += t.alto;
    if (marcar) paginaDe.set(t.clave, primeraPagina + paginas.length - 1);
  };

  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    if (it.nuevaPagina) nueva();

    // Un título pegado: si él y el comienzo de lo que sigue no caben, se va a la hoja siguiente.
    if (it.pegar && n + 1 < items.length && usado > 0) {
      const sig = items[n + 1];
      const sigNueva = sig.nuevaPagina;
      if (!sigNueva && usado + it.alto + altoMinimoInicial(sig) > altoCuerpo) nueva();
    }

    if (!dividible(it)) {
      if (usado > 0 && usado + it.alto > altoCuerpo) nueva();
      poner({ clave: it.clave, desde: 0, hasta: 1, primero: true, ultimo: true, alto: it.alto }, true);
      continue;
    }

    const partes = it.partes;
    const total = partes.length;
    const pie = it.pie ?? 0;
    let hecho = 0;
    while (hecho < total) {
      const primero = hecho === 0;
      const cabeza = primero ? (it.cabeza ?? 0) : (it.cabezaSiguientes ?? 0);
      const libre = altoCuerpo - usado;
      // Cuántas partes caben (y si caben todas, con el pie).
      let k = 0;
      let suma = cabeza;
      while (hecho + k < total && suma + partes[hecho + k] <= libre) {
        suma += partes[hecho + k];
        k++;
      }
      let cabeTodo = hecho + k === total && suma + pie <= libre;
      if (hecho + k === total && !cabeTodo) {
        // Todas las partes caben pero no el pie: se deja la última para el trozo siguiente.
        k = Math.max(0, k - 1);
        suma -= partes[hecho + k] ?? 0;
        cabeTodo = false;
      }
      const resto = total - (hecho + k);
      // Viudas y huérfanas: ni menos del mínimo arriba ni menos del mínimo abajo.
      const minArriba = primero ? (it.minPrimero ?? 1) : 1;
      const minAbajo = it.minUltimo ?? 1;
      if (!cabeTodo && resto > 0 && resto < minAbajo) {
        const quitar = minAbajo - resto;
        for (let q = 0; q < quitar && k > 0; q++) {
          k--;
          suma -= partes[hecho + k];
        }
      }
      if (k < minArriba && !cabeTodo) {
        if (usado > 0) {
          nueva();
          continue;
        }
        // En hoja limpia y aun así no cabe el mínimo: se fuerza para no ciclar.
        k = Math.max(1, Math.min(minArriba, total - hecho));
        suma = cabeza + partes.slice(hecho, hecho + k).reduce((t, p) => t + p, 0);
      }
      const ultimo = hecho + k >= total;
      const alto = suma + (ultimo ? pie : 0);
      poner({ clave: it.clave, desde: hecho, hasta: hecho + k, primero, ultimo, alto }, primero);
      hecho += k;
      if (!ultimo) nueva();
    }
  }
  if (!paginas[paginas.length - 1].length && paginas.length > 1) paginas.pop();
  return { paginas, paginaDe };
}
