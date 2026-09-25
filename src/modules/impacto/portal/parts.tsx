/* =============================================================================
   Portal de Impacto · el marco y las piezas comunes.

   - PortalLayout: la barra unificada, la barra del portal (vistas y el
     recorrido de Mr. Pilo) y el pie. El recorrido arranca solo la primera vez.
   - PortalGate: cargando, error y «falta la migración».
   - PiloExplain: la carita de Pilo junto a cada gráfica; al tocarla, lee la
     gráfica en dos o tres frases, calculadas con los mismos datos.
   - PiloBanner: un aviso de Pilo en línea, con su acción.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { Icon } from "../../../components/ui/Icon";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { useTour } from "../../../components/tour/TourProvider";
import { SpeakerIcon, VoiceToggle } from "../../../components/pilo/VoiceToggle";
import { speak, stopSpeaking, useVoice } from "../../../components/pilo/voice";
import { PortalMissingError, usePortalData } from "./data";
import type { PortalData } from "./data";
import type { PiloNote } from "./analysis";
import "./portal.css";

export const PORTAL_TOUR = "portal-impacto";

const VIEWS = [
  { to: "/impacto", label: "Institucional", match: (p: string) => p === "/impacto" },
  { to: "/impacto/vicerrectoria/investigacion", label: "Vicerrectorías", match: (p: string) => p.startsWith("/impacto/vicerrectoria") },
  { to: "/impacto/facultades", label: "Facultades", match: (p: string) => p.startsWith("/impacto/facultad") },
  { to: "/impacto/programas", label: "Programas", match: (p: string) => p.startsWith("/impacto/programa") },
];

export function PortalLayout({ title, children }: { title: string; children: ReactNode }) {
  const { start, isDone, active } = useTour();
  const pathname = useLocation().pathname.replace(/\/+$/, "") || "/";
  const started = useRef(false);

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Portal de Impacto · UDES`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  // La primera visita, Mr. Pilo muestra el portal. isDone es null mientras carga.
  useEffect(() => {
    if (started.current || active || isDone(PORTAL_TOUR) !== false) return;
    started.current = true;
    const timer = window.setTimeout(() => start(PORTAL_TOUR), 1100);
    return () => window.clearTimeout(timer);
  }, [isDone, active, start]);

  return (
    <div className="ipo">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader />
      <div className="ipo-bar">
        <div className="u-container ipo-bar__inner">
          <Link to="/impacto" className="ipo-bar__brand">
            <strong>Portal de Impacto</strong>
            <span>
              <Icon name="lock" size={12} /> Solo con sesión
            </span>
          </Link>
          <nav aria-label="Vistas del portal" className="ipo-bar__nav" data-tour="ipo-views">
            {VIEWS.map((v) => (
              <Link key={v.to} to={v.to} aria-current={v.match(pathname) ? "page" : undefined}>
                {v.label}
              </Link>
            ))}
          </nav>
          <button type="button" className="ipo-bar__tour" onClick={() => start(PORTAL_TOUR)} data-tour="ipo-tour">
            <PiloAvatar mood="feliz" size={32} />
            Recorrido con Mr. Pilo
          </button>
          <VoiceToggle className="ipo-bar__voice" />
        </div>
      </div>
      <main id="contenido">{children}</main>
      <footer className="ipo-footer">
        <div className="u-container ipo-footer__inner">
          <div>
            <strong>Universidad de Santander · Portal de Impacto</strong>
            <span>Fichas publicadas por las vicerrectorías y cifras registradas en la intranet. Un vacío no es un cero.</span>
          </div>
          <nav aria-label="Enlaces del pie">
            <Link to="/admin/impacto">Reportar en la intranet</Link>
            <Link to="/datos-abiertos">UDES en Cifras</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PortalGate({ title, children }: { title: string; children: (data: PortalData) => ReactNode }) {
  const portal = usePortalData();
  if (portal.isPending) {
    return (
      <PortalLayout title={title}>
        <div className="u-container ipo-state">
          <LoadingBlock rows={4} label="Cargando el Portal de Impacto" />
        </div>
      </PortalLayout>
    );
  }
  if (portal.isError) {
    return (
      <PortalLayout title={title}>
        <div className="u-container ipo-state">
          {portal.error instanceof PortalMissingError ? (
            <div className="ipo-missing">
              <PiloAvatar mood="duda" size={96} />
              <div>
                <h1>El portal aún no está listo</h1>
                <p>Falta aplicar la migración 0088 en la base. Cuando esté, aquí aparecerá la estructura de los indicadores.</p>
              </div>
            </div>
          ) : (
            <ErrorBlock error={portal.error} onRetry={() => portal.refetch()} title="No se pudo cargar el Portal de Impacto" />
          )}
        </div>
      </PortalLayout>
    );
  }
  return <>{children(portal.data)}</>;
}

/** La carita de Pilo junto a una gráfica: la explica con los datos que se ven. */
export function PiloExplain({ note, label = "Mr. Pilo explica esta gráfica" }: { note: PiloNote; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const { speaking } = useVoice();

  // Al abrirse, Pilo la lee en voz alta (si su voz está prendida); al cerrarse, calla.
  // Las notas se recalculan en cada pintada: se compara su texto, no el objeto.
  const said = `${note.title}. ${note.lines.join(" ")}`;
  useEffect(() => {
    if (!open) return;
    void speak(said);
    return () => stopSpeaking();
  }, [open, said]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="ipo-explain" ref={box}>
      <button
        type="button"
        className="ipo-explain__button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <PiloAvatar mood={open ? note.mood : "idea"} size={34} alive={open && speaking} />
      </button>
      {open && (
        <div className="ipo-explain__bubble" id={id} role="dialog" aria-label={note.title}>
          <strong>{note.title}</strong>
          {note.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Un aviso de Pilo en línea: la brecha más seria y qué hacer con ella. */
export function PiloBanner({ note, action }: { note: PiloNote; action?: ReactNode }) {
  const { supported } = useVoice();
  return (
    <aside className="ipo-pilo" data-mood={note.mood}>
      <PiloAvatar mood={note.mood} size={72} alive />
      <div>
        <strong>{note.title}</strong>
        {note.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {supported && (
        <button type="button" className="ipo-pilo__listen" onClick={() => void speak(`${note.title}. ${note.lines.join(" ")}`, { force: true })}>
          <SpeakerIcon size={16} />
          Escuchar
        </button>
      )}
      {action}
    </aside>
  );
}

/** Rótulo de una sección con la carita de Pilo a la derecha. */
export function SectionHead({ title, hint, note, id }: { title: string; hint?: string; note?: PiloNote; id?: string }) {
  return (
    <div className="ipo-head">
      <div>
        <h2 id={id}>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {note && <PiloExplain note={note} />}
    </div>
  );
}
