/* Ayudas pequeñas del compilador que no son ni lógica de datos ni pantalla. */

/** Los criterios aprobados que `aplicar` espera: una lista con id y nombre, sin repetir ni vacíos. */
export function aprobadosParaSeguro(a: { id: string; nombre: string }[] | undefined): { id: string; nombre: string }[] {
  const vistos = new Set<string>();
  return (a ?? []).filter((x) => x?.id && x?.nombre && !vistos.has(x.id) && vistos.add(x.id));
}
