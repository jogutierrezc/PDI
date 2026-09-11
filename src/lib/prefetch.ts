/* =============================================================================
   Precarga de rutas.
   Las pantallas se cargan bajo demanda, así que la primera visita a /tablero
   espera a que llegue su fragmento. Pasar el cursor por encima del enlace —o
   enfocarlo con el teclado— da entre 200 y 300 ms de ventaja: suficiente para
   que el fragmento ya esté en caché cuando se hace clic.

   El navegador deduplica los import() dinámicos, así que llamar varias veces
   no descarga nada dos veces.
   ========================================================================== */

const loaders: Record<string, () => Promise<unknown>> = {
  "/tablero": () => import("../routes/Dashboard"),
  "/implementacion": () => import("../modules/implementation/ImplementationPortal"),
  "/campus": () => import("../modules/campus/CampusPortal"),
  "/facultades": () => import("../modules/facultades/FacultyPortal"),
  "/acceso-intranet": () => import("../modules/login/LoginPortal"),
};

const done = new Set<string>();

export function prefetchRoute(to: string): void {
  const [path] = to.split("#");
  const loader = loaders[path];
  if (!loader || done.has(path)) return;
  done.add(path);
  void loader().catch(() => done.delete(path));
}

/** Props listos para pegar en un <Link>. */
export function prefetchProps(to: string) {
  const start = () => prefetchRoute(to);
  return { onPointerEnter: start, onFocus: start, onTouchStart: start };
}
