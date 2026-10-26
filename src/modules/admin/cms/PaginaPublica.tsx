/* =============================================================================
   Portal público · una página publicada del CMS.

   Lee la última versión publicada con cms_leer_publicada. Sin iniciar sesión.
   Lo que está en borrador no sale de aquí: la base solo devuelve lo publicado.

   Va dentro del marco de su portal: la barra unificada y el pie de Planeación
   y, en UDES Sostenible, también su barra de rankings.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { PlanLayout } from "../../planeacion/PlanLayout";
import { SostenibleLayout } from "../../sostenible/SostenibleLayout";
import { RenderBloques, type BloqueRender } from "./render";
import type { Ancho, Props } from "./tipos";
import "./cms.css";

interface Contenido {
  titulo: string;
  ruta: string;
  bloques: { tipo: string; ancho: Ancho; props: Props }[];
}

async function leerPublicada(portal: string, ruta: string): Promise<Contenido | null> {
  const { data, error } = await supabase.rpc("cms_leer_publicada", { p_portal: portal, p_ruta: ruta });
  if (error) throw new Error(error.message);
  return (data as Contenido | null) ?? null;
}

/** El marco del portal: sostenible suma su barra de rankings a la de Planeación. */
function Marco({ portal, titulo, children }: { portal: string; titulo: string; children: ReactNode }) {
  if (portal === "sostenible") return <SostenibleLayout title={titulo}>{children}</SostenibleLayout>;
  return <PlanLayout title={titulo ? `${titulo} | Planeación Institucional` : "Planeación Institucional"}>{children}</PlanLayout>;
}

export function PaginaPublica() {
  const { portal = "", "*": resto = "" } = useParams();
  const ruta = resto.replace(/\/+$/, "");
  const consulta = useQuery({
    queryKey: ["cms", "publica", portal, ruta],
    queryFn: () => leerPublicada(portal, ruta),
    staleTime: 60_000,
  });

  if (consulta.isPending) return <Marco portal={portal} titulo=""><div className="cms-publico"><p>Cargando…</p></div></Marco>;
  if (consulta.isError) return <Marco portal={portal} titulo=""><div className="cms-publico"><p>No se pudo cargar la página.</p></div></Marco>;
  if (!consulta.data) {
    return (
      <Marco portal={portal} titulo="Página no encontrada">
        <div className="cms-publico">
          <h1>Página no encontrada</h1>
          <p>Esta página no existe o todavía no tiene una versión publicada.</p>
        </div>
      </Marco>
    );
  }

  // Los bloques ocultos ya vienen filtrados: RenderBloques no los muestra salvo que se pida.
  const bloques: BloqueRender[] = consulta.data.bloques.map((b) => ({ tipo: b.tipo, ancho: b.ancho, props: b.props }));
  return (
    <Marco portal={portal} titulo={consulta.data.titulo}>
      <div className="cms-publico">
        <RenderBloques bloques={bloques} navegable />
      </div>
    </Marco>
  );
}
