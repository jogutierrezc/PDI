/* «¿Primera vez aquí?»: la invitación a la guía, arriba de Mi informe. Se descarta y se recuerda en el navegador. */

import { useState } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { recordado, recordar, useGuia } from "./contexto";

export function BannerGuia() {
  const { abierta, abrir } = useGuia();
  const [cerrado, setCerrado] = useState(() => recordado("banner"));
  if (cerrado || abierta) return null;
  const cerrar = () => {
    recordar("banner", true);
    setCerrado(true);
  };
  return (
    <div className="guia-banner" role="region" aria-label="Invitación a la guía">
      <PiloFace size={40} expression="feliz" />
      <p>
        <b>¿Primera vez aquí?</b> Pilo le explica el informe paso a paso, con texto y voz. También puede pulsar el <b>?</b> de cualquier zona.
      </p>
      <button type="button" className="inf-btn inf-btn--pri inf-btn--sm" onClick={() => abrir()}>
        Empezar la guía
      </button>
      <button type="button" className="inf-btn inf-btn--sm" onClick={cerrar}>
        Ahora no
      </button>
    </div>
  );
}
