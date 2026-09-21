/* =============================================================================
   La persona, en la barra de los portales públicos.

   Sin sesión, la barra termina en un candado y la palabra «Intranet»: una
   puerta. Con sesión, ese mismo sitio pasa a ser quien eres, y al abrirlo
   aparece lo único que tú puedes abrir.

   Los tableros van primero, antes que la intranet y antes que cerrar sesión,
   porque quien pulsa aquí desde una página pública viene a ver sus cifras, no
   a administrar nada. Y se piden solo al abrir el panel: quien nunca lo abre
   —la inmensa mayoría de las visitas— no paga ni una consulta.

   Lo que se lista es lo que la base entrega: un tablero de una unidad ajena no
   llega hasta aquí, así que no hay nada que recortar en la pantalla.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { useAuth } from "../../lib/auth";
import type { Profile } from "../../types/database";

/** Las iniciales con las que se reconoce a alguien de un vistazo. */
function initials(profile: Profile): string {
  const name = profile.full_name?.trim();
  if (!name) return (profile.email[0] ?? "?").toUpperCase();
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

/** El nombre corto: el de pila basta para reconocerse en una barra. */
const shortName = (profile: Profile) => profile.full_name?.trim().split(/\s+/)[0] || profile.email.split("@")[0];

export function SessionMenu() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Cambiar de página cierra el panel: si no, queda abierto sobre otra cosa.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!profile) {
    return (
      <Link className="sh-intranet" to="/acceso-intranet">
        <Icon name="lock" size={15} /> Intranet
      </Link>
    );
  }

  return (
    <div className="sh-me" ref={box}>
      <button
        ref={trigger}
        type="button"
        className="sh-me__trigger"
        aria-expanded={open}
        aria-controls="sh-me-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sh-me__initials" aria-hidden="true">
          {initials(profile)}
        </span>
        <span className="sh-me__name">{shortName(profile)}</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {open && (
        <div id="sh-me-panel" className="sh-me__panel" role="region" aria-label="Tu cuenta">
          <div className="sh-me__who">
            <strong>{profile.full_name?.trim() || profile.email}</strong>
            <small>{profile.email}</small>
          </div>

          <MyBoards />

          <div className="sh-me__links">
            <Link to="/admin/tableros" onClick={() => setOpen(false)}>
              <Icon name="layers" size={16} /> Mis Tableros
            </Link>
            <Link to="/admin" onClick={() => setOpen(false)}>
              <Icon name="settings" size={16} /> Intranet
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              <Icon name="arrow-left" size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Los tableros que esta persona puede abrir.
 *
 * Vive en su propio componente para que las consultas salgan al abrir el
 * panel y no al pintar la barra. Se importa en caliente por la misma razón:
 * una visita anónima no descarga el módulo de Mis Tableros.
 */
function MyBoards() {
  const [mod, setMod] = useState<typeof import("../../modules/tableros/store") | null>(null);
  useEffect(() => {
    let alive = true;
    void import("../../modules/tableros/store").then((m) => {
      if (alive) setMod(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!mod) return <p className="sh-me__loading">Buscando tus tableros…</p>;
  return <BoardList store={mod} />;
}

function BoardList({ store }: { store: typeof import("../../modules/tableros/store") }) {
  const units = store.useUnits();
  const boards = store.useBoards();

  const groups = useMemo(() => {
    const byUnit = new Map((units.data?.units ?? []).map((u) => [u.id, u]));
    const out = new Map<string, { name: string; slug: string; boards: { id: string; slug: string; title: string }[] }>();
    for (const board of (boards.data ?? []).slice().sort((a, b) => a.position - b.position)) {
      const unit = byUnit.get(board.unitId);
      if (!unit) continue;
      const group = out.get(unit.id) ?? { name: unit.name, slug: unit.slug, boards: [] };
      group.boards.push({ id: board.id, slug: board.slug, title: board.title });
      out.set(unit.id, group);
    }
    return [...out.values()];
  }, [units.data, boards.data]);

  if (units.isPending || boards.isPending) return <p className="sh-me__loading">Buscando tus tableros…</p>;

  if (groups.length === 0) {
    return (
      <p className="sh-me__empty">
        Todavía no tienes tableros. Los abre quien pertenece a una unidad: pídele acceso a su jefatura.
      </p>
    );
  }

  return (
    <div className="sh-me__boards">
      <p className="sh-me__label">Tus tableros</p>
      {groups.map((group) => (
        <div key={group.slug} className="sh-me__group">
          <p>{group.name}</p>
          <ul>
            {group.boards.map((board) => (
              <li key={board.id}>
                <Link to={`/tableros/${group.slug}/${board.slug}`}>
                  <Icon name="chart" size={15} />
                  {board.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
