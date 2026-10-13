import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { PdiBar } from "./PdiBar";
import { SiteFooter } from "./SiteFooter";
import { useCurrentPeriod } from "../../data/queries";
import { formatDate } from "../../data/pdi";

interface PublicLayoutProps {
  children: ReactNode;
  /** Clase de la página, para los fondos propios de cada vista. */
  className?: string;
}

export function PublicLayout({ children, className = "" }: PublicLayoutProps) {
  return (
    <div className={`page ${className}`.trim()}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <TopBar />
      {/* Regresar, cambiar de vista y de pilar: en Implementación, Tablero, facultades y campus. */}
      <PdiBar />
      <main id="contenido">{children}</main>
      <PageFooter />
    </div>
  );
}

function PageFooter() {
  const period = useCurrentPeriod();
  // La fecha sale del corte vigente, no de una constante en el código: publicar un corte nuevo la actualiza en todo el portal.
  return <SiteFooter note={period.data ? `Datos actualizados al ${formatDate(period.data.cutoff_date)}` : undefined} />;
}
