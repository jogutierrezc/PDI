// ─── Ejemplos de uso del PiloBot extendido ────────────────────────────────────

import { PiloBot } from "./PiloBot";
import type { PiloActor } from "./model";

// ── 1. En la cabecera de MI PROGRAMA ────────────────────────────────────────
// Igual que antes, pero ahora se pasa un PiloActor en lugar de ProgramSite.

export function ProgramHeader({ programId, campusId, programName, canEdit, base, catalog }) {
  const actor: PiloActor = {
    kind:     "programa",
    id:       programId,
    campusId: campusId,
    name:     programName,
  };

  return (
    <header>
      <h1>{programName}</h1>
      <PiloBot actor={actor} base={base} catalog={catalog} canEdit={canEdit} />
    </header>
  );
}

// ── 2. En el panel de VICERRECTORÍA ─────────────────────────────────────────
// Mr. Pilo aquí gestiona qué indicadores publica para sus programas.

export function VicerrectoriaPanel({ vice, canEdit, base, catalog }) {
  const actor: PiloActor = {
    kind: "vicerectoria",
    id:   vice.id,
    name: vice.name,
    // campusId omitido: las vices pueden operar multi-campus
  };

  return (
    <section>
      <h2>{vice.name}</h2>
      <p>Indicadores publicados para sus {vice.programCount} programas</p>
      {/* Mr. Pilo aparece con escena índigo y metas exclusivas de vice */}
      <PiloBot actor={actor} base={base} catalog={catalog} canEdit={canEdit} />
    </section>
  );
}

// ── 3. Rutas de API que el backend necesita implementar ───────────────────────
/*
  GET  /api/adaptations?vicerrectoriaId=:id
       → IndicatorAdaptation[]

  GET  /api/institutional-needs?actorId=:id
       → InstitutionalNeed[]
         Cálculo sugerido en el backend:
           coverageRate = programas_que_reportan / total_programas_vice
           severity:
             critica     → coverageRate < 0.30 && cnaLinked
             importante  → coverageRate < 0.55 || (coverageRate < 0.70 && cnaLinked)
             oportunidad → el resto con coverageRate < 0.80

  GET  /api/mandatory-indicators?actorKind=:kind&actorId=:id
       → { indicatorId: string }[]

  POST /api/adoptions
       body: { indicatorIds, actorId, actorKind, campusId? }
       → { count: number }   (cuántos se crearon nuevos)
*/
