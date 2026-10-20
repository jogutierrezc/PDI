/* =============================================================================
   Portal público · una página publicada del CMS.

   Lee la última versión publicada con cms_leer_publicada. Sin iniciar sesión.
   Lo que está en borrador no sale de aquí: la base solo devuelve lo publicado.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
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

export function PaginaPublica() {
  const { portal = "", "*": resto = "" } = useParams();
  const ruta = resto.replace(/\/+$/, "");
  const consulta = useQuery({
    queryKey: ["cms", "publica", portal, ruta],
    queryFn: () => leerPublicada(portal, ruta),
    staleTime: 60_000,
  });

  if (consulta.isPending) return <main className="cms-publico"><p>Cargando…</p></main>;
  if (consulta.isError) return <main className="cms-publico"><p>No se pudo cargar la página.</p></main>;
  if (!consulta.data) {
    return (
      <main className="cms-publico">
        <h1>Página no encontrada</h1>
        <p>Esta página no existe o todavía no tiene una versión publicada.</p>
      </main>
    );
  }

  // Los bloques ocultos ya vienen filtrados: RenderBloques no los muestra salvo que se pida.
  const bloques: BloqueRender[] = consulta.data.bloques.map((b) => ({ tipo: b.tipo, ancho: b.ancho, props: b.props }));
  return (
    <main className="cms-publico">
      <RenderBloques bloques={bloques} navegable />
    </main>
  );
}
