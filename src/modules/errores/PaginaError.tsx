/* =============================================================================
   Páginas de error · /error/:codigo

   Muestra la escena de cualquier código conocido (401, 402, 403, 404, 408, 429,
   500, 502, 503). Sirve para enlazar desde el servidor (por ejemplo, un
   `error_page 502 /error/502`) y para revisar cómo se ve cada una. Un código
   desconocido cae en el 404.

   Es una página de aviso, no un portal: se pide a los buscadores que no la
   indexen.
   ========================================================================== */

import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { esCodigo } from "./datos";
import { EscenaError } from "./EscenaError";

export function PaginaError() {
  const { codigo } = useParams();
  const [consulta] = useSearchParams();
  const valido = esCodigo(codigo) ? codigo : "404";
  const espera = valido === "429" ? Math.min(600, Math.max(0, Number(consulta.get("espera")) || 30)) : 0;
  const traza = valido === "500" ? (consulta.get("traza") ?? undefined) : undefined;

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <PublicLayout className="notfound-page">
      <section className="u-container notfound-escena">
        <EscenaError codigo={valido} espera={espera} traza={traza?.slice(0, 40)} />
      </section>
    </PublicLayout>
  );
}
