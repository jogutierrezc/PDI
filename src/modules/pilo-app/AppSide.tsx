/* =============================================================================
   Mr. Pilo · la app · la barra lateral del escritorio y el marco de una página.

   Desde 960 px de ancho la app deja de ser una pantalla de teléfono: la barra
   lateral queda fija con «Nueva conversación», con cuál Pilo, las
   conversaciones de este dispositivo, las respuestas guardadas y la persona
   (o «Crear cuenta / Entrar»). Por debajo de ese ancho, lo mismo vive en el
   cajón del menú (AppMenu).

   AppPage es el marco de las pantallas que no son la conversación (el perfil
   y las guardadas): en el teléfono, una cabecera con «volver»; en el
   escritorio, la barra lateral y la página al centro.
   ========================================================================== */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SpaceId } from "../pregunta/space";
import { APP_ACCOUNT, APP_LOGIN, APP_PILOS, APP_PROFILE, APP_SAVED, APP_SPACES } from "./routes";
import { dayLabel } from "./saved";
import type { SavedEntry } from "./saved";
import { Icon } from "./icons";

/** Desde este ancho la app usa la disposición de escritorio. */
export const WIDE_QUERY = "(min-width: 960px)";

export function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(WIDE_QUERY).matches));
  useEffect(() => {
    const media = window.matchMedia?.(WIDE_QUERY);
    if (!media) return;
    const on = () => setWide(media.matches);
    on();
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Quién usa la app, como se muestra en el menú y en la barra lateral. */
export interface Person {
  /** Con cuenta de Pilo: su nombre, su perfil y su usuario. */
  card: { name: string; under: string; initial: string } | null;
  /** Con cuenta de la intranet: su nombre. */
  intranet: string | null;
  /** Cuántas respuestas tiene guardadas; null si no tiene cuenta o aún no se sabe. */
  saved: number | null;
}

/** El bloque de la persona: con cuenta lleva a su perfil; sin ella, a crearla o a entrar. */
export function PersonBlock({ person, current = false, onGo }: { person: Person; current?: boolean; onGo?: () => void }) {
  if (person.card) {
    return (
      <Link className="pa-me" to={APP_PROFILE} aria-current={current ? "page" : undefined} onClick={onGo}>
        <span className="pa-avatar" aria-hidden="true">
          {person.card.initial}
        </span>
        <span>
          <b>{person.card.name}</b>
          <small>{person.card.under}</small>
        </span>
      </Link>
    );
  }
  if (person.intranet) {
    return (
      <Link className="pa-me" to={APP_PROFILE} aria-current={current ? "page" : undefined} onClick={onGo}>
        <span className="pa-avatar" aria-hidden="true">
          {person.intranet.trim().charAt(0).toUpperCase() || "P"}
        </span>
        <span>
          <b>{person.intranet}</b>
          <small>Cuenta de la intranet</small>
        </span>
      </Link>
    );
  }
  return (
    <div className="pa-join">
      <p>
        <b>Sin cuenta.</b> Con una, Pilo le responde a su medida, guarda respuestas y le da más cupo.
      </p>
      <div className="pa-join__go">
        <Link className="pa-btn pa-join__main" to={APP_ACCOUNT} onClick={onGo}>
          Crear cuenta
        </Link>
        <Link className="pa-btn pa-join__line" to={APP_LOGIN} onClick={onGo}>
          Entrar
        </Link>
      </div>
      <Link className="pa-join__prefs" to={APP_PROFILE} aria-current={current ? "page" : undefined} onClick={onGo}>
        Mis preferencias y el tema
      </Link>
    </div>
  );
}

export function AppSide({
  space,
  saved,
  currentId,
  active,
  person,
  onOpen,
  onDelete,
  onNew,
  onSwitch,
}: {
  /** El Pilo abierto. */
  space: SpaceId;
  saved: SavedEntry[];
  currentId: string | null;
  /** La pantalla que se está viendo. */
  active: "chat" | "guardadas" | "perfil";
  person: Person;
  onOpen: (entry: SavedEntry) => void;
  onDelete: (entry: SavedEntry) => void;
  onNew: () => void;
  onSwitch: (space: SpaceId) => void;
}) {
  return (
    <aside className="pa-side" aria-label="Mr. Pilo">
      <div className="pa-side__top">
        <p className="pa-side__brand">
          Mr. Pilo
          <small>Universidad de Santander</small>
        </p>
        <button type="button" className="pa-sl pa-sl--new" onClick={onNew}>
          {Icon.plus}
          <span>Nueva conversación</span>
        </button>
        <div className="pa-side__two" role="group" aria-label="Con cuál Pilo">
          {APP_SPACES.map((id) => (
            <button key={id} type="button" aria-pressed={active === "chat" && id === space} onClick={() => onSwitch(id)}>
              {APP_PILOS[id].short}
            </button>
          ))}
        </div>
      </div>

      <nav className="pa-side__nav" aria-label="Secciones de la app">
        <p className="pa-side__label" id="pa-s-convs">
          Conversaciones
        </p>
        {saved.length === 0 && <p className="pa-side__empty">Sus conversaciones quedan aquí, solo en este dispositivo.</p>}
        <ul aria-labelledby="pa-s-convs">
          {saved.map((entry) => {
            const on = active === "chat" && entry.space === space && entry.id === currentId;
            return (
              <li key={`${entry.space}:${entry.id}`} className="pa-side__row">
                <button type="button" className="pa-sl" aria-current={on ? "true" : undefined} title={entry.title} onClick={() => onOpen(entry)}>
                  {Icon.chat}
                  <span>
                    {entry.title}
                    <small>
                      {APP_PILOS[entry.space].short} · {dayLabel(entry.at)}
                    </small>
                  </span>
                </button>
                <button type="button" className="pa-icon" onClick={() => onDelete(entry)} aria-label={`Borrar la conversación «${entry.title}»`}>
                  {Icon.trash}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="pa-side__label">Mi Pilo</p>
        <Link className="pa-sl" to={APP_SAVED} aria-current={active === "guardadas" ? "page" : undefined}>
          {Icon.mark}
          <span>Guardadas</span>
          {person.saved !== null && <em aria-label={`${person.saved} guardadas`}>{person.saved}</em>}
        </Link>
      </nav>

      <div className="pa-side__me">
        <PersonBlock person={person} current={active === "perfil"} />
      </div>
    </aside>
  );
}

/** El marco de una pantalla que no es la conversación. */
export function AppPage({ title, lead, home, side, children }: { title: string; lead: string; home: string; side: ReactNode; children: ReactNode }) {
  return (
    <div className="pa-frame pa-frame--page">
      {side}
      <header className="pa-bar pa-bar--page">
        <div className="pa-bar__in">
          <Link className="pa-icon" to={home} aria-label="Volver a conversar con Pilo">
            {Icon.back}
          </Link>
          <div className="pa-bar-id">
            <strong>{title}</strong>
            <span>Mr. Pilo</span>
          </div>
        </div>
      </header>
      <main className="pa-msgs pc-page">
        <div className="pc-pane">
          <header className="pc-pane__head">
            <h1>{title}</h1>
            <p>{lead}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
