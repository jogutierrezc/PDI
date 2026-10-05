/* =============================================================================
   Navegador de Mr. Pilo · un pedido a la vez.

   Un navegador abierto pesa: el servicio atiende UN pedido a la vez y deja
   unos pocos esperando en memoria. Si la cola está llena, el pedido se rechaza
   de una (el que llama lee la página sin navegador). Nada se guarda en disco.
   ========================================================================== */

export class Ocupado extends Error {
  constructor() {
    super("El navegador está ocupado.");
    this.code = "ocupado";
  }
}

/** Una cola de `espera` puestos. `correr(trabajo)` lo corre cuando le toca, o falla con Ocupado si no hay puesto. */
export function crearCola(espera = 3) {
  let corriendo = false;
  const fila = [];
  const siguiente = () => {
    const next = fila.shift();
    if (!next) {
      corriendo = false;
      return;
    }
    next();
  };
  return {
    get esperando() {
      return fila.length;
    },
    get ocupada() {
      return corriendo;
    },
    correr(trabajo) {
      return new Promise((resolve, reject) => {
        const run = () => {
          corriendo = true;
          // El puesto se suelta antes de avisar: quien espera la respuesta ya puede mandar otro pedido.
          Promise.resolve()
            .then(trabajo)
            .then(
              (value) => {
                siguiente();
                resolve(value);
              },
              (error) => {
                siguiente();
                reject(error);
              },
            );
        };
        if (!corriendo) return run();
        if (fila.length >= espera) return reject(new Ocupado());
        fila.push(run);
      });
    },
  };
}
