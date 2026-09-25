/** Cada piedra con sus propios radios: ninguna igual a la de al lado (del primer portal). */
const SHAPES = ["2.4rem 1.2rem 2.6rem 1.1rem", "1.3rem 2.6rem 1.2rem 2.4rem", "2.8rem 1.4rem 1.6rem 2.2rem", "1.6rem 2.2rem 2.8rem 1.2rem"];

export const pebbleShape = (seed: string) => SHAPES[[...seed].reduce((t, c) => t + c.charCodeAt(0), 0) % SHAPES.length];
