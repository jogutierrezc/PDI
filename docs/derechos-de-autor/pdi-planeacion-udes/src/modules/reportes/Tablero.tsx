/* =============================================================================
   Tablero del periodo: las plantillas SNIES en su orden de cargue, agrupadas
   por módulo, cada una con su marca de estado y su próxima fecha. Si la fecha
   cae en tres días o menos, el aviso va en ámbar. Las que aún no se capturan
   salen igual, con sus fechas y la nota «Próximamente».
   ========================================================================== */

import { PLANTILLAS } from "./snies/plantillas";
import type { Entrega, Estado, PeriodoCodigo, PlantillaId } from "./tipos";
import { Marca } from "./Marca";
import { ETIQUETA_ESTADO, proximaFecha, textoFecha } from "./util";

interface TableroProps {
  periodo: PeriodoCodigo;
  entregas: Entrega[] | undefined;
  actual: PlantillaId | null;
  onElegir: (id: PlantillaId) => void;
}

export function Tablero({ periodo, entregas, actual, onElegir }: TableroProps) {
  const hoy = new Date();
  let modulo = "";
  return (
    <nav className="ri-tablero" aria-label={`Plantillas del periodo ${periodo}`}>
      <h2 className="ri-side-title">Plantillas · {periodo}</h2>
      <ul className="ri-tpl-list">
        {PLANTILLAS.flatMap((spec) => {
          const out = [];
          if (spec.modulo !== modulo) {
            modulo = spec.modulo;
            out.push(
              <li key={`g-${spec.modulo}`} className="ri-tpl-group" aria-hidden="true">
                {spec.modulo}
              </li>,
            );
          }
          const entrega = entregas?.find((e) => e.plantilla === spec.id);
          const estado: Estado = entrega?.estado ?? "pendiente";
          const pf = proximaFecha(spec, periodo, hoy);
          const cerca = Boolean(pf && pf.dias >= 0 && pf.dias <= 3 && estado !== "enviada");
          const detalle = !spec.disponible
            ? `Próximamente${pf ? ` · ${textoFecha(pf, hoy)}` : ""}`
            : estado === "enviada"
              ? "Enviada"
              : pf
                ? textoFecha(pf, hoy)
                : "Sin fecha en este semestre";
          out.push(
            <li key={spec.id}>
              <button
                type="button"
                aria-current={spec.id === actual ? "page" : undefined}
                data-soon={!spec.disponible || undefined}
                title={`${spec.nombre} · ${ETIQUETA_ESTADO[estado]}`}
                onClick={() => onElegir(spec.id)}
              >
                <Marca estado={estado} />
                <span className="ri-tpl-n">{spec.nombre}</span>
                <span className={`ri-tpl-d${cerca ? " is-warn" : ""}`}>{detalle}</span>
              </button>
            </li>,
          );
          return out;
        })}
      </ul>
    </nav>
  );
}
