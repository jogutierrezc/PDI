/* =============================================================================
   UDrive · imprimir / guardar como PDF.

   Motor elegido: la hoja de impresión del navegador (@page Carta, márgenes en
   cero), igual que el boletín (BulletinViewer abre el diálogo con
   window.print()). Es el único camino que deja el texto y las gráficas SVG
   como vectores y respeta los hipervínculos del índice, sin añadir una
   librería de PDF ni descargar fuentes. salida.css esconde todo lo que no sea
   la vista previa mientras `body` lleva la clase ud-imprimiendo.
   ========================================================================== */

import { PAPEL_PX } from "../lib/estilo";
import type { Papel } from "../lib/estilo";

const ID_PAGINA = "ud-pagina";

/**
 * Abre el diálogo de impresión con el nombre del archivo como título (Chrome lo propone como nombre del PDF).
 * El tamaño de la hoja (Carta o A4) se fija aquí, según el papel del informe; las secciones horizontales
 * usan la página con nombre «ud-horizontal», que lleva el mismo papel girado.
 */
export function imprimirPdf(nombre: string, papel: Papel = "carta"): void {
  const antes = document.title;
  document.title = nombre.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Documento";
  const [ancho, alto] = PAPEL_PX[papel].mm;
  const hoja = document.createElement("style");
  hoja.id = ID_PAGINA;
  hoja.textContent = `@page { size: ${ancho}mm ${alto}mm; margin: 0; } @page ud-horizontal { size: ${alto}mm ${ancho}mm; margin: 0; }`;
  document.head.appendChild(hoja);
  document.body.classList.add("ud-imprimiendo");
  const limpiar = () => {
    document.body.classList.remove("ud-imprimiendo");
    document.getElementById(ID_PAGINA)?.remove();
    document.title = antes;
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
  // Un respiro para que el navegador aplique la clase y el tamaño antes de armar la hoja.
  window.setTimeout(() => window.print(), 80);
}
