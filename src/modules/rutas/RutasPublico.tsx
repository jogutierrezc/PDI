/* =============================================================================
   Ruta del bus UDES · página pública (/rutas).

   Sin iniciar sesión. Muestra la ruta, las paradas, el trazado y el horario, y
   una simulación de los buses según ese horario (no es un GPS, y la pantalla lo
   dice). Pensada para celulares y plegables Samsung; el diseño y el movimiento
   viven en mapaPublico.ts y rutasPublico.css. Los datos salen de datosPublico.ts,
   que solo consulta lo que abre la migración 0140.
   ========================================================================== */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import { cargarRutaPublica } from "./datosPublico";
import { montarPublico } from "./mapaPublico";
import "./rutasPublico.css";

export function RutasPublico() {
  const navegar = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const datos = useQuery({ queryKey: ["rutas", "publico"], queryFn: cargarRutaPublica, staleTime: 10 * 60_000, retry: 1 });

  useEffect(() => {
    const previo = document.title;
    document.title = "Ruta del bus UDES · Universidad de Santander";
    return () => {
      document.title = previo;
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    const d = datos.data;
    if (!el || !d) return;
    const api = montarPublico(el, d, {
      teselas: true,
      logoSrc: "/logo-udes.svg",
      logoOscuroSrc: "/boletin/logo-udes-blanco.png",
      inicioHref: "/",
      alIr: () => navegar("/"),
      gsap,
    });
    return () => api.destruir();
    // El mapa se monta una vez por ruta: plegar o girar el equipo no lo reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.data]);

  return (
    <main className="rpub-pagina" aria-label="Ruta del bus UDES">
      <div className="rpub-host" ref={host} hidden={!datos.data} />
      {datos.isLoading && (
        <p className="rpub-estado" role="status">
          Cargando la ruta…
        </p>
      )}
      {datos.isError && (
        <div className="rpub-estado" role="alert">
          <p>{datos.error instanceof Error ? datos.error.message : "No se pudo cargar la ruta."}</p>
          <p className="rpub-estado-nota">
            {typeof navigator !== "undefined" && navigator.onLine === false ? "Parece que no hay conexión. Revise la red e intente de nuevo." : "Intente de nuevo en un momento."}
          </p>
          <button type="button" className="rpub-reintentar" onClick={() => void datos.refetch()}>
            Reintentar
          </button>
        </div>
      )}
    </main>
  );
}
