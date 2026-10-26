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

/**
 * Reparte las unidades en páginas. `altoCuerpo` puede ser un número o una función
 * del índice de página (0 = la primera de esta llamada): sirve para que la primera
 * hoja tenga menos espacio, o para tratar cada columna como una página angosta.
 * `usadoInicial` es lo que ya ocupa lo anterior en la primera hoja; si la primera
 * unidad no cabe en lo que queda, esa hoja se devuelve vacía y todo pasa a la siguiente.
 */
export function paginar(items: readonly ItemPaginado[], altoCuerpo: number | ((pagina: number) => number) = ALTO_CUERPO, primeraPagina: number = 1, usadoInicial: number = 0): ResultadoPaginado {
  const paginas: Trozo[][] = [[]];
  const paginaDe = new Map<string, number>();
  let usado = usadoInicial;
  let ocupada = usadoInicial > 0;
  const tope = (): number => (typeof altoCuerpo === "function" ? altoCuerpo(paginas.length - 1) : altoCuerpo);

  const nueva = () => {
    if (paginas[paginas.length - 1].length || ocupada) paginas.push([]);
    ocupada = false;
    usado = 0;
  };
  const poner = (t: Trozo, marcar: boolean) => {
    paginas[paginas.length - 1].push(t);
    ocupada = false;
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
      if (!sigNueva && usado + it.alto + altoMinimoInicial(sig) > tope()) nueva();
    }

    if (!dividible(it)) {
      if (usado > 0 && usado + it.alto > tope()) nueva();
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
      const libre = tope() - usado;
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

/* ---------- Dos columnas ---------------------------------------------------------------- */

export interface ItemColumna extends ItemPaginado {
  /** Va en columna (texto corrido). Lo demás (figuras, tablas, capítulos de nivel 1, índices) ocupa el ancho completo. */
  col?: boolean;
}

/** Una franja de la hoja: una columna (ancho completo) o dos. `alto` es la de la más larga. */
export interface Banda {
  columnas: Trozo[][];
  alto: number;
}

export interface ResultadoColumnas {
  paginas: Banda[][];
  paginaDe: Map<string, number>;
}

const suma = (t: readonly Trozo[]): number => t.reduce((a, x) => a + x.alto, 0);

/**
 * Como `paginar`, pero con un tramo de texto en dos columnas. Cada columna se
 * trata como una página angosta (con las mismas reglas de viudas, huérfanas y
 * títulos pegados) y se juntan de dos en dos. Lo que va a ancho completo corta
 * el tramo: el texto que sigue empieza en el espacio que queda de la hoja. La
 * última hoja del tramo no equilibra las columnas: llena primero la izquierda.
 */
export function paginarColumnas(items: readonly ItemColumna[], altoCuerpo: number, primeraPagina: number = 1, minimoColumnas: number = 160): ResultadoColumnas {
  const paginas: Banda[][] = [[]];
  const paginaDe = new Map<string, number>();
  let usado = 0;
  const actual = () => paginas[paginas.length - 1];
  const numero = () => primeraPagina + paginas.length - 1;
  const nueva = () => {
    if (actual().length) paginas.push([]);
    usado = 0;
  };

  let i = 0;
  while (i < items.length) {
    const col = Boolean(items[i].col);
    let j = i;
    while (j < items.length && Boolean(items[j].col) === col) j++;
    const tramo = items.slice(i, j);
    i = j;
    if (tramo[0].nuevaPagina && actual().length) nueva();
    if (col && usado > 0 && (altoCuerpo - usado < minimoColumnas || altoMinimoInicial(tramo[0]) > altoCuerpo - usado)) nueva();

    if (!col) {
      const r = paginar(tramo, altoCuerpo, numero(), usado);
      r.paginas.forEach((trozos, n) => {
        if (n > 0) {
          paginas.push([]);
          usado = 0;
        }
        if (!trozos.length) return;
        const alto = suma(trozos);
        actual().push({ columnas: [trozos], alto });
        usado += alto;
      });
      r.paginaDe.forEach((v, k) => paginaDe.set(k, v));
      // Un título que quedó al final, justo antes del texto en columnas, no se queda solo.
      const ultimo = tramo[tramo.length - 1];
      if (i < items.length && items[i].col && ultimo.pegar && altoCuerpo - usado < minimoColumnas * 1.6) {
        const banda = actual()[actual().length - 1];
        const trozos = banda?.columnas[0];
        const t = trozos?.[trozos.length - 1];
        if (banda && trozos && t && t.clave === ultimo.clave && t.ultimo && (actual().length > 1 || trozos.length > 1)) {
          trozos.pop();
          banda.alto = suma(trozos);
          if (!trozos.length) actual().pop();
          paginas.push([{ columnas: [[t]], alto: t.alto }]);
          usado = t.alto;
          paginaDe.set(t.clave, numero());
        }
      }
      continue;
    }

    const resto = altoCuerpo - usado;
    const base = numero();
    const r = paginar(tramo, (n) => (n < 2 ? resto : altoCuerpo), 0, 0);
    for (let q = 0; q * 2 < r.paginas.length; q++) {
      const izq = r.paginas[q * 2] ?? [];
      const der = r.paginas[q * 2 + 1] ?? [];
      if (q > 0) {
        paginas.push([]);
        usado = 0;
      }
      if (!izq.length && !der.length) continue;
      const alto = Math.max(suma(izq), suma(der));
      actual().push({ columnas: [izq, der], alto });
      usado += alto;
    }
    r.paginaDe.forEach((pseudo, k) => paginaDe.set(k, base + Math.floor(pseudo / 2)));
  }
  if (!actual().length && paginas.length > 1) paginas.pop();
  return { paginas, paginaDe };
}
