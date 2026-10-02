/* =============================================================================
   Mr. Pilo · la app móvil · el menú (cajón lateral) y sus hojas.

   Nueva conversación · Conversaciones guardadas (en el teléfono, las de los
   dos Pilos, con su fecha; se reabren y se borran) · Respuestas guardadas ·
   Con cuál Pilo · Tema · Ver la bienvenida · la persona.

   La persona (0120): con cuenta de Pilo, su nombre, su perfil y su usuario,
   que llevan a su perfil; sin cuenta, «Crear cuenta / Entrar». En el
   escritorio este cajón no se usa: lo mismo vive en la barra lateral fija
   (AppSide).
   ========================================================================== */

import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { AskSource } from "../../components/pilo/ai/client";
import type { SpaceId, SpaceProfile } from "../pregunta/space";
import { APP_ACCOUNT, APP_LOGIN, APP_PILOS, APP_SAVED, APP_SPACES } from "./routes";
import { APP_THEMES } from "./themes";
import type { AppTheme } from "./themes";
import { dayLabel } from "./saved";
import type { SavedEntry } from "./saved";
import { Layer } from "./Layer";
import { Icon } from "./icons";
import { PersonBlock } from "./AppSide";
import type { Person } from "./AppSide";
import { ACCOUNT_BENEFITS } from "./account/rules";

export function AppMenu({
  open,
  quick,
  onClose,
  space,
  saved,
  currentId,
  onOpen,
  onDelete,
  onNew,
  onSwitch,
  theme,
  onTheme,
  onWelcome,
  person,
}: {
  open: boolean;
  quick: boolean;
  /** Con el evento del toque (o sin él, si fue Escape): así se sabe si cerrar deslizando o en seco. */
  onClose: (event?: MouseEvent) => void;
  space: SpaceId;
  saved: SavedEntry[];
  currentId: string | null;
  onOpen: (entry: SavedEntry) => void;
  onDelete: (entry: SavedEntry) => void;
  onNew: () => void;
  onSwitch: (space: SpaceId) => void;
  theme: AppTheme;
  onTheme: (theme: AppTheme, event: MouseEvent) => void;
  onWelcome: () => void;
  /** Quién usa la app: su cuenta de Pilo, la de la intranet, o nadie. */
  person: Person;
}) {
  return (
    <Layer kind="menu" open={open} quick={quick} label="Menú de Mr. Pilo" onClose={onClose}>
      <div className="pa-menu-head">
        <div className="pa-menu-head__top">
          <h2>Mr. Pilo</h2>
          <button type="button" className="pa-icon" onClick={onClose} aria-label="Cerrar el menú">
            {Icon.close}
          </button>
        </div>
        <button type="button" className="pa-btn pa-btn--main" onClick={onNew}>
          {Icon.plus}
          Nueva conversación
        </button>
      </div>

      <div className="pa-menu-body">
        <section aria-labelledby="pa-m-saved">
          <p className="pa-label" id="pa-m-saved">
            Conversaciones guardadas
          </p>
          {saved.length === 0 && <p className="pa-empty">Sus conversaciones quedan aquí, solo en este teléfono.</p>}
          {saved.map((entry) => (
            <div key={`${entry.space}:${entry.id}`} className="pa-row" aria-current={entry.space === space && entry.id === currentId}>
              <button type="button" className="pa-mi" onClick={() => onOpen(entry)}>
                <strong>{entry.title}</strong>
                <small>
                  {APP_PILOS[entry.space].short} · {dayLabel(entry.at)}
                </small>
              </button>
              <button type="button" className="pa-icon" onClick={() => onDelete(entry)} aria-label={`Borrar la conversación «${entry.title}»`}>
                {Icon.trash}
              </button>
            </div>
          ))}
        </section>

        <Link className="pa-mi pa-mi--line pa-mi--go" to={APP_SAVED} onClick={() => onClose()}>
          <strong>
            {Icon.mark}
            Respuestas guardadas
            {person.saved !== null && <em aria-label={`${person.saved} guardadas`}>{person.saved}</em>}
          </strong>
          <small>{person.card ? "Lo que guardó de Pilo, en su cuenta" : "Con cuenta, las encuentra en cualquier dispositivo"}</small>
        </Link>

        <section aria-labelledby="pa-m-pilo">
          <p className="pa-label" id="pa-m-pilo">
            Con cuál Pilo
          </p>
          <div className="pa-two" role="group" aria-labelledby="pa-m-pilo">
            {APP_SPACES.map((id) => (
              <button key={id} type="button" aria-pressed={id === space} onClick={() => onSwitch(id)}>
                {APP_PILOS[id].short}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="pa-m-tema">
          <p className="pa-label" id="pa-m-tema">
            Tema
          </p>
          <div className="pa-temas" role="group" aria-labelledby="pa-m-tema">
            {APP_THEMES.map((t) => (
              <button key={t.id} type="button" className="pa-tema" aria-pressed={t.id === theme} onClick={(e) => onTheme(t.id, e)}>
                <span className="pa-tema__ring">
                  <i className="pa-swatch" data-tema={t.id} aria-hidden="true" />
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="pa-mi pa-mi--line" onClick={onWelcome}>
          <strong>Ver la bienvenida</strong>
          <small>Pilo se presenta otra vez</small>
        </button>
      </div>

      <div className="pa-account">
        <PersonBlock person={person} onGo={() => onClose()} />
      </div>
    </Layer>
  );
}

/* --- La hoja de fuentes --------------------------------------------------------------------- */

export function SourcesSheet({
  open,
  quick,
  onClose,
  sources,
  focus,
  space,
}: {
  open: boolean;
  quick: boolean;
  onClose: (event?: MouseEvent) => void;
  sources: AskSource[];
  /** La cita que se tocó en el texto, para marcarla. */
  focus: number | null;
  space: SpaceProfile;
}) {
  const nameOf = (id: string) => space.sources.find((x) => x.id === id)?.name ?? space.office;
  return (
    <Layer kind="sheet" open={open} quick={quick} label="Fuentes de la respuesta" onClose={onClose}>
      <div className="pa-sheet__in">
        <span className="pa-sheet__grip" aria-hidden="true" />
        <div className="pa-sheet__head">
          <h2>De dónde sale</h2>
          <button type="button" className="pa-icon" onClick={onClose} aria-label="Cerrar las fuentes">
            {Icon.close}
          </button>
        </div>
        <ul>
          {sources.map((s) => {
            const external = /^https?:/i.test(s.path);
            return (
              <li key={s.n} className="pa-src-li" data-on={focus === s.n || undefined}>
                <strong>
                  {s.n}. {s.title}
                </strong>
                <small>{[nameOf(s.source), s.section, s.cut ? `Corte ${s.cut}` : "", s.office].filter(Boolean).join(" · ")}</small>
                {s.excerpt && <small className="pa-excerpt">{s.excerpt}</small>}
                {s.path &&
                  (external ? (
                    <a href={s.path} target="_blank" rel="noopener noreferrer">
                      Abrir el documento
                    </a>
                  ) : (
                    <Link to={s.path}>Abrir en {nameOf(s.source)}</Link>
                  ))}
              </li>
            );
          })}
        </ul>
      </div>
    </Layer>
  );
}

/* --- La invitación a tener cuenta --------------------------------------------------------------- */

/** Lo que se abre al tocar «Guardar» sin cuenta: qué gana quien se registra, y los dos caminos. */
export function AccountSheet({ open, quick, onClose }: { open: boolean; quick: boolean; onClose: (event?: MouseEvent) => void }) {
  return (
    <Layer kind="sheet" open={open} quick={quick} label="Su cuenta de Pilo" onClose={onClose}>
      <div className="pa-sheet__in">
        <span className="pa-sheet__grip" aria-hidden="true" />
        <div className="pa-sheet__head">
          <h2>Guardar es de quienes tienen cuenta</h2>
          <button type="button" className="pa-icon" onClick={onClose} aria-label="Cerrar">
            {Icon.close}
          </button>
        </div>
        <p>Con una cuenta de Pilo, sus respuestas guardadas quedan en su cuenta y las encuentra en cualquier dispositivo. Además:</p>
        <ul>
          {ACCOUNT_BENEFITS.filter((b) => b.title !== "Guardar respuestas").map((b) => (
            <li key={b.title}>
              <strong>{b.title}</strong>
              <small>{b.text}</small>
            </li>
          ))}
        </ul>
        <Link className="pa-btn pa-btn--main" to={APP_ACCOUNT}>
          Crear una cuenta
        </Link>
        <Link className="pa-btn pa-btn--line" to={APP_LOGIN}>
          Ya tengo cuenta
        </Link>
      </div>
    </Layer>
  );
}

/* --- La guía para iPhone ---------------------------------------------------------------------- */

export function IphoneSheet({ open, quick, onClose }: { open: boolean; quick: boolean; onClose: (event?: MouseEvent) => void }) {
  return (
    <Layer kind="sheet" open={open} quick={quick} label="Instalar a Pilo en el iPhone" onClose={onClose}>
      <div className="pa-sheet__in">
        <span className="pa-sheet__grip" aria-hidden="true" />
        <div className="pa-sheet__head">
          <h2>Instalar a Pilo</h2>
          <button type="button" className="pa-icon" onClick={onClose} aria-label="Cerrar">
            {Icon.close}
          </button>
        </div>
        <p>En el iPhone se instala desde Safari, en tres pasos:</p>
        <ul className="pa-steps-list">
          <li>Toque «Compartir»: el cuadrado con la flecha hacia arriba.</li>
          <li>Elija «Añadir a pantalla de inicio».</li>
          <li>Toque «Añadir». Pilo queda con su icono, como una app.</li>
        </ul>
      </div>
    </Layer>
  );
}
