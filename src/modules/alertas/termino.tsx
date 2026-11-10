/* Portal de alertas · un término que se explica al tocarlo (sin salir de la página). */

import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { sinMovimiento } from "../monitor/piezas";

export const GLOSARIO = {
  NE: ["Nivel esperado", "Promedio de 3,5 o más y ninguna materia perdida."],
  ED: ["En desarrollo", "Promedio entre 3,0 y 3,49, o una materia perdida."],
  RS: ["Requiere seguimiento", "Promedio menor de 3,0, dos o más materias perdidas, o una caída de 0,5 o más frente al periodo anterior."],
  prueba: ["Periodo de prueba", "Quien cierra el periodo con promedio menor de 3,2 entra en prueba académica."],
  rr: ["Riesgo relativo", "Cuántas veces más probable es desertar frente a un grupo de referencia. Con promedio bajo (menor de 3,3) es 16,7 veces, según las cohortes 2017 a 2020."],
  banda: ["Banda del 80 %", "Si el cálculo se repitiera muchas veces, el promedio del próximo periodo caería dentro de esta banda 8 de cada 10 veces. No es una garantía."],
  modelo: ["Modelo del estudio", "Regresión logística con 4.900 casos de las cohortes 2017 a 2020 (Pérez et al., 2023, Tabla 2). Aquí se usan facultad, promedio, grupo de edad y origen."],
  estimado: ["Estimación", "Cuando un corte aún no tiene notas, se proyecta con las notas previas. Se marca con trama y se reemplaza cuando llegan las notas reales."],
  reprobar: ["Reprobar", "Nota menor de 3,0 (en Medicina, menor de 3,5). Los cursos con menos de 5 matrículas con nota no se detallan."],
} as const;

export function Termino({ k, children }: { k: keyof typeof GLOSARIO; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [titulo, texto] = GLOSARIO[k];
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  useEffect(() => {
    if (abierto && pop.current && !sinMovimiento()) gsap.fromTo(pop.current, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.16, ease: "power3.out", clearProps: "transform,opacity" });
  }, [abierto]);
  return (
    <span ref={raiz} className="al-termino">
      <button type="button" className="al-termino__b" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {children}
      </button>
      {abierto && (
        <span ref={pop} className="al-termino__pop" role="tooltip">
          <b>{titulo}</b>
          {texto}
        </span>
      )}
    </span>
  );
}
