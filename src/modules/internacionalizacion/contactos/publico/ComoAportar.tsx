/* =============================================================================
   Contactos · público · paso 2, «Cómo aportar».

   Académicos o empleadores (si la invitación recibe los dos) y dos caminos: uno a
   uno o importar un archivo. Pilo explica cuándo conviene cada uno.
   ========================================================================== */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { esTipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import type { TipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import { ErrorContactos, misContactos } from "../api";
import type { InvitacionPublica, Sesion } from "../api";
import { useDecir } from "./GuiaPilo";

const IconoUno = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </svg>
);
const IconoArchivo = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

export function ComoAportar({
  token,
  sesion,
  invitacion,
  campusNombre,
  tipo,
  onTipo,
  onUno,
  onImportar,
  onMis,
  onSalir,
  onSesionVencida,
}: {
  token: string;
  sesion: Sesion;
  invitacion: InvitacionPublica;
  campusNombre: string;
  tipo: TipoContacto;
  onTipo: (t: TipoContacto) => void;
  onUno: () => void;
  onImportar: () => void;
  onMis: () => void;
  onSalir: () => void;
  onSesionVencida: () => void;
}) {
  const decir = useDecir();
  const mis = useQuery({ queryKey: ["int-contactos", "mis", token, sesion.aportante_id], queryFn: () => misContactos(token, sesion), retry: false });
  useEffect(() => {
    if (mis.error && mis.error instanceof ErrorContactos && mis.error.estado === 401) onSesionVencida();
  }, [mis.error]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega el error
  const enviados = mis.data?.filas.length ?? sesion.enviados;
  const primerNombre = sesion.nombre.split(" ")[0];

  useEffect(() => {
    decir("Gracias, ya sé quién es. Con pocos contactos le conviene uno a uno; con varios, un archivo ahorra tiempo. Yo lo guío en cualquiera de los dos.", "idea");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar
  }, []);

  const elegirTipo = (t: TipoContacto) => {
    onTipo(t);
    decir(
      t === "academico"
        ? "Académicos: profesores o investigadores de otras universidades con quienes la UDES podría colaborar."
        : "Empleadores: empresas o instituciones que contratan o reciben a nuestros egresados.",
      "idea",
    );
  };

  return (
    <section className="cp-panel" aria-label="Cómo aportar">
      <div data-entra>
        <h2>Hola, {primerNombre}</h2>
        <p className="cp-sub">
          {campusNombre ? `Está ayudando al campus ${campusNombre}. ` : ""}Lo que envíe llega a Planeación Institucional.
        </p>
      </div>

      {enviados > 0 && (
        <div data-entra>
          <button type="button" className="cp-btn cp-btn--suave" onClick={onMis}>
            Ya envió {enviados} · Ver mis aportes
          </button>
        </div>
      )}

      {invitacion.tipos.length > 1 && (
        <div className="cp-seg" role="radiogroup" aria-label="Tipo de contacto" data-entra>
          {invitacion.tipos.filter(esTipoContacto).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => elegirTipo(t)}>
              {t === "academico" ? "Académicos" : "Empleadores"}
              <small>{t === "academico" ? "docentes e investigadores" : "empresas que contratan egresados"}</small>
            </button>
          ))}
        </div>
      )}

      <div className="cp-caminos" data-entra>
        <button type="button" className="cp-camino" onClick={onUno}>
          <IconoUno />
          <span className="cp-etiqueta">Pocos contactos</span>
          <b>Uno a uno</b>
          <span>Un formulario corto por contacto. Unos 40 segundos cada uno.</span>
        </button>
        <button type="button" className="cp-camino" onClick={onImportar}>
          <IconoArchivo />
          <span className="cp-etiqueta">Una lista completa</span>
          <b>Importar un archivo</b>
          <span>Excel o CSV con la plantilla de la UDES. Yo lo reviso antes de enviarlo.</span>
        </button>
      </div>

      <div className="cp-acciones" data-entra>
        <button type="button" className="cp-btn cp-btn--suave" onClick={onSalir}>
          Volver
        </button>
      </div>
    </section>
  );
}
