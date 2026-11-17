/* La elección de modelo («Pilo» o «Astra») se recuerda en este navegador. Lo que el servidor no ofrece, no se usa. */
import type { CatalogoModelos, ModeloId } from "./client";

const LLAVE = "pilo-modelo";

export function leerModelo(): ModeloId | null {
  try {
    const v = localStorage.getItem(LLAVE);
    return v === "pilo" || v === "astra" ? v : null;
  } catch {
    return null;
  }
}

export function guardarModelo(id: ModeloId): void {
  try {
    localStorage.setItem(LLAVE, id);
  } catch {
    /* sin almacenamiento: vale solo esta visita */
  }
}

/** El modelo vigente: el recordado si el servidor lo ofrece; si no, el defecto del servidor. */
export function modeloVigente(catalogo: CatalogoModelos, recordado: ModeloId | null): ModeloId {
  return recordado && catalogo.modelos.some((m) => m.id === recordado) ? recordado : catalogo.defecto;
}
