/* =============================================================================
   Mr. Pilo · la app móvil · el menú (cajón lateral) y sus hojas.

   Nueva conversación · Conversaciones guardadas (en el teléfono, las de los
   dos Pilos, con su fecha; se reabren y se borran) · Con cuál Pilo · Tema ·
   Ver la bienvenida · la cuenta.

   La cuenta: hoy solo existen las cuentas de la intranet. «Ya tengo cuenta»
   lleva al inicio de sesión que ya existe; «Registrarme» es una hoja
   informativa, sin nada detrás.
   ========================================================================== */

import { useState } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { AskSource } from "../../components/pilo/ai/client";
import type { SpaceId, SpaceProfile } from "../pregunta/space";
import { APP_PILOS, APP_SPACES } from "./routes";
import { APP_THEMES } from "./themes";
import type { AppTheme } from "./themes";
import { dayLabel } from "./saved";
import type { SavedEntry } from "./saved";
import { Layer } from "./Layer";
import { Icon } from "./icons";

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
  onAccount,
  signedAs,
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
  onAccount: (event: MouseEvent) => void;
  /** El nombre de quien tiene sesión; null sin sesión. */
  signedAs: string | null;
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
        {signedAs ? (
          <>
            <strong>Sesión iniciada</strong>
            <p>{signedAs}. Sus conversaciones se guardan en este teléfono.</p>
          </>
        ) : (
          <>
            <strong>Regístrese para más de Pilo</strong>
            <p>Sin cuenta, sus conversaciones se guardan solo en este teléfono.</p>
            <button type="button" className="pa-btn pa-btn--line" onClick={onAccount}>
              Registrarme o entrar
            </button>
          </>
        )}
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

/* --- La hoja de la cuenta -------------------------------------------------------------------- */

export function AccountSheet({ open, quick, onClose, from }: { open: boolean; quick: boolean; onClose: (event?: MouseEvent) => void; from: string }) {
  const [info, setInfo] = useState(false);
  const close = (event?: MouseEvent) => {
    setInfo(false);
    onClose(event);
  };
  return (
    <Layer kind="sheet" open={open} quick={quick} label="Su cuenta de Pilo" onClose={close}>
      <div className="pa-sheet__in">
        <span className="pa-sheet__grip" aria-hidden="true" />
        <div className="pa-sheet__head">
          <h2>Su cuenta de Pilo</h2>
          <button type="button" className="pa-icon" onClick={close} aria-label="Cerrar">
            {Icon.close}
          </button>
        </div>
        <ul>
          <li>
            <strong>Contenidos reservados</strong>
            <small>Con sesión, Pilo también responde con lo reservado a quienes tienen cuenta, como el Portal de Impacto y los cursos.</small>
          </li>
          <li>
            <strong>Conversaciones en todos sus dispositivos</strong>
            <small>Próximamente: guardarlas y retomarlas donde las dejó. Hoy viven solo en este teléfono.</small>
          </li>
          <li>
            <strong>Pilo lo conoce</strong>
            <small>Próximamente: recordar si es estudiante o profesor y su tema preferido en cualquier dispositivo.</small>
          </li>
        </ul>
        {info ? (
          // PENDIENTE: registro de estudiantes y profesores (decisión del dueño).
          // Hoy solo existen las cuentas de la intranet: aquí no hay formulario ni nada detrás.
          <p role="status">El registro de estudiantes y profesores todavía no está abierto. Por ahora las cuentas son las de la intranet de la universidad; si ya tiene una, entre con ella.</p>
        ) : (
          <button type="button" className="pa-btn pa-btn--main" onClick={() => setInfo(true)}>
            Registrarme con mi correo
          </button>
        )}
        <Link className="pa-btn pa-btn--line" to="/acceso-intranet" state={{ from }}>
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
