/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · imprimir o guardar como PDF.

   Motor: la ventana de impresión del navegador, como el boletín y UDrive. Es
   el camino que deja el texto y las gráficas SVG como vectores, sin librería
   de PDF ni nada en el servidor. vista.css esconde todo lo que no sea la
   previsualización (#vi-raiz) mientras `body` lleva la clase vi-imprimiendo, y
   aquí se fija el tamaño de la hoja con @page.
   ========================================================================== */

import { PAPELES } from "./perfil";
import type { Papel } from "./perfil";

const ID_PAGINA = "vi-pagina";

/** Abre el diálogo de impresión con el nombre del archivo como título (Chrome lo propone como nombre del PDF). */
export function imprimirInforme(nombre: string, papel: Papel): void {
  const antes = document.title;
  document.title = nombre.replace(/[\/:*?"<>|]+/g, "-").slice(0, 120) || "Informe de gestión";
  const m = PAPELES[papel];
  const estilo = document.createElement("style");
  estilo.id = ID_PAGINA;
  estilo.textContent = `@page { size: ${m.ancho}mm ${m.alto}mm; margin: 0; }`;
  document.head.appendChild(estilo);
  document.body.classList.add("vi-imprimiendo");
  const limpiar = () => {
    document.body.classList.remove("vi-imprimiendo");
    document.getElementById(ID_PAGINA)?.remove();
    document.title = antes;
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
  // Un respiro para que el navegador aplique la clase y el tamaño antes de armar la hoja.
  window.setTimeout(() => window.print(), 120);
}
