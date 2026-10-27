/* =============================================================================
   UDES Sostenible · la página real con el CMS por delante.

   /sostenible, /sostenible/:ranking y /sostenible/:ranking/:categoria piden
   primero la versión publicada de su página en el CMS (portal «sostenible»,
   ruta «», «ranking» o «ranking/categoria»). Si existe, se pinta con los
   bloques; si no hay versión publicada o el CMS no responde, se pinta la página
   de siempre (los hijos), para que el portal nunca quede vacío.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { leerPublicada, Marco } from "./PaginaPublica";
import { RenderBloques, type BloqueRender } from "./render";
import "./cms.css";

const PORTAL = "sostenible";

export function SostenibleCms({ children }: { children: ReactNode }) {
  const { ranking, categoria } = useParams();
  const ruta = [ranking, categoria].filter(Boolean).join("/");
  const consulta = useQuery({
    queryKey: ["cms", "publica", PORTAL, ruta],
    queryFn: () => leerPublicada(PORTAL, ruta),
    staleTime: 60_000,
    retry: false,
  });

  if (consulta.isPending) {
    return (
      <Marco portal={PORTAL} titulo="">
        <div className="cms-publico">
          <p>Cargando…</p>
        </div>
      </Marco>
    );
  }
  // Sin publicar, o el CMS aún no está en la base: la página de siempre.
  if (consulta.isError || !consulta.data || consulta.data.bloques.length === 0) return <>{children}</>;

  const bloques: BloqueRender[] = consulta.data.bloques.map((b) => ({ tipo: b.tipo, ancho: b.ancho, props: b.props }));
  return (
    <Marco portal={PORTAL} titulo={consulta.data.titulo}>
      <div className="cms-publico">
        <RenderBloques bloques={bloques} navegable />
      </div>
    </Marco>
  );
}
