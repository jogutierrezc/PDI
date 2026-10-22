/* =============================================================================
   UDrive · imprimir / guardar como PDF.

   Motor elegido: la hoja de impresión del navegador (@page Carta, márgenes en
   cero), igual que el boletín (BulletinViewer abre el diálogo con
   window.print()). Es el único camino que deja el texto y las gráficas SVG
   como vectores y respeta los hipervínculos del índice, sin añadir una
   librería de PDF ni descargar fuentes. salida.css esconde todo lo que no sea
   la vista previa mientras `body` lleva la clase ud-imprimiendo.
   ========================================================================== */

/** Abre el diálogo de impresión con el nombre del archivo como título (Chrome lo propone como nombre del PDF). */
export function imprimirPdf(nombre: string): void {
  const antes = document.title;
  document.title = nombre.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Documento";
  document.body.classList.add("ud-imprimiendo");
  const limpiar = () => {
    document.body.classList.remove("ud-imprimiendo");
    document.title = antes;
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
  // Un respiro para que el navegador aplique la clase antes de armar la hoja.
  window.setTimeout(() => window.print(), 80);
}
