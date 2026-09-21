/* =============================================================================
   Estación 1 · Portada.

   Lo primero que se lee del portal: el titular, la entradilla que lo explica y
   el encabezado del mosaico de portales. Cuatro textos y nada más; el buscador,
   el plano del fondo y las fichas de cada portal no se escriben, se calculan.
   ========================================================================== */

import { Panel } from "../../udes-en-cifras/ui";
import { Text } from "../fields";
import { LEDE_COMFORT } from "../OfficePageAdmin";
import type { OfficeStationProps } from "../OfficePageAdmin";

export function HomeStation({ draft, patch, canEdit }: OfficeStationProps) {
  return (
    <>
      <Panel
        title="El encabezado"
        description="Lo primero que se lee al entrar. El titular ocupa toda la franja marina; la entradilla va justo debajo, sobre el buscador."
      >
        <div className="oda-form-grid">
          <Text
            label="Titular"
            wide
            rows={2}
            comfortable={90}
            value={draft.home.title}
            disabled={!canEdit}
            placeholder="La universidad, medida y planeada a la vista de todos."
            onChange={(title) => patch((page) => ({ ...page, home: { ...page.home, title } }))}
            hint="Una afirmación, no un saludo. Es el titular de la oficina, no el de la universidad."
          />
          <Text
            label="Entradilla"
            wide
            rows={5}
            comfortable={LEDE_COMFORT}
            value={draft.home.lede}
            disabled={!canEdit}
            placeholder="Planeación Institucional reúne el Plan de Desarrollo, las cifras oficiales…"
            onChange={(lede) => patch((page) => ({ ...page, home: { ...page.home, lede } }))}
            hint="Qué encuentra aquí quien llega. Nombra los portales por su nombre."
          />
        </div>
      </Panel>

      <Panel
        title="El mosaico de portales"
        description="El rótulo que va sobre los bloques de UDES en Cifras, el PDI, los boletines, el equipo y el Observatorio. Los bloques en sí se alimentan solos."
      >
        <div className="oda-form-grid">
          <Text
            label="Título"
            comfortable={40}
            value={draft.home.portalsTitle}
            disabled={!canEdit}
            placeholder="Nuestros portales"
            onChange={(portalsTitle) => patch((page) => ({ ...page, home: { ...page.home, portalsTitle } }))}
          />
          <Text
            label="Bajada"
            wide
            rows={2}
            comfortable={160}
            value={draft.home.portalsLede}
            disabled={!canEdit}
            placeholder="Cada portal responde una pregunta distinta sobre la universidad…"
            onChange={(portalsLede) => patch((page) => ({ ...page, home: { ...page.home, portalsLede } }))}
          />
        </div>
      </Panel>
    </>
  );
}
