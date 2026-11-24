/* =============================================================================
   CMS Portales · bloques vivos de la portada de Planeación.

   Mosaico de portales, galería, «Lo más reciente» y equipo. Son los mismos
   componentes de PlaneacionHome (las teselas y Recent se exportan de allí), de
   modo que el bloque no copia ni deriva: lo que cambie en la portada real
   cambia aquí. Los datos salen de la página publicada de la oficina
   (useOfficePage), igual que en la portada.

   Los estilos de planeacion.css cuelgan de `.pl-page` (sus variables --pl-*).
   Por eso cada bloque va dentro de ese contenedor; `.cms-pl` (cms.css) le quita
   la altura mínima de página completa.
   ========================================================================== */

import { useId, type ReactNode } from "react";
import { OfficeGallery } from "../../../planeacion/OfficeGallery";
import { useOfficePage } from "../../../planeacion/page";
import { BulletinsTile, CifrasTile, ObservatoryTile, PdiTile, Recent, TeamTile } from "../../../planeacion/PlaneacionHome";
import { TeamCarousel } from "../../../planeacion/TeamCarousel";
import "../../../planeacion/planeacion.css";

/** El contenedor del que dependen las variables y los estilos de la portada de Planeación. */
export function EnvolturaPlaneacion({ children }: { children: ReactNode }) {
  return <div className="pl-page cms-pl">{children}</div>;
}

/** Las cinco teselas reales de la portada; el título y la bajada de la sección son del bloque. */
export function MosaicoPortales({ titulo, texto }: { titulo: string; texto: string }) {
  const { page } = useOfficePage();
  const idTitulo = useId();
  return (
    <EnvolturaPlaneacion>
      <section className="pl-section pl-portals" aria-labelledby={titulo ? idTitulo : undefined}>
        <div className="pl-container">
          <div className="pl-section__head">
            {titulo && <h2 id={idTitulo}>{titulo}</h2>}
            {texto && <p>{texto}</p>}
          </div>
          <div className="pl-mosaic">
            <CifrasTile />
            <PdiTile />
            <BulletinsTile />
            <TeamTile areas={page.areas} people={page.team.people} />
            <ObservatoryTile />
          </div>
        </div>
      </section>
    </EnvolturaPlaneacion>
  );
}

/** La galería de la oficina, con el título y la bajada publicados. */
export function GaleriaOficina() {
  const { page } = useOfficePage();
  return (
    <EnvolturaPlaneacion>
      <OfficeGallery title={page.gallery.title} lede={page.gallery.lede} slides={page.gallery.slides} />
    </EnvolturaPlaneacion>
  );
}

/** El carril del equipo, con las personas y las áreas publicadas. */
export function EquipoOficina() {
  const { page } = useOfficePage();
  return (
    <EnvolturaPlaneacion>
      <TeamCarousel title={page.team.title} lede={page.team.lede} people={page.team.people} areas={page.areas} />
    </EnvolturaPlaneacion>
  );
}

/** «Lo más reciente», el mismo componente de la portada. */
export function RecientesOficina() {
  return (
    <EnvolturaPlaneacion>
      <Recent />
    </EnvolturaPlaneacion>
  );
}
