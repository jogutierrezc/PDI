/* =============================================================================
   Mis Tableros · la intranet.

   El organigrama es el índice: la espina izquierda no es un panel entre
   paneles, es la estructura de la pantalla entera. Todo —tableros, personas,
   solicitudes— se lee como perteneciente a un sitio del árbol, porque la
   dificultad de esto es «quién ve qué y por qué» y eso tiene que estar
   contestándose todo el rato, no escondido en una pantalla de ajustes.

   La herencia se dibuja con el filete que recorre lo que cuelga, y cada fila
   dice de dónde le viene el papel a quien mira. Romperla es la excepción y se
   marca.

   Lo que se ve aquí no es lo que protege: las políticas RLS de la 0057 y la
   0058 conceden o niegan. Esta pantalla solo evita ofrecer botones que no van
   a funcionar.
   ========================================================================== */

import { useMemo, useState } from "react";
import type React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../lib/auth";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../admin/udes-en-cifras/ui";
import {
  UNIT_KIND,
  UNIT_ROLE,
  VISIBILITY,
  atLeast,
  canLead,
  canStaff,
  freeSlug,
  reachOf,
  roleAt,
  roleSource,
  unitChildren,
  unitDescendants,
} from "./model";
import type { Reach, Unit, UnitMember, UnitRole } from "./model";
import {
  useBoards,
  useProfiles,
  useRemoveMember,
  useReviews,
  useSaveBoard,
  useSaveMember,
  useSaveUnit,
  useUnits,
} from "./store";
import { ReviewQueue } from "./ReviewQueue";
import { UnitDelete, UnitForm } from "./UnitForm";
/* Lo prestado viaja con su hoja: Panel, SaveState, StageEmpty, ConfirmButton y
   los campos son de UDES en Cifras, y sus estilos viven en od-admin.css. Sin
   esto se dibujan desnudos. */
import "../admin/udes-en-cifras/od-admin.css";
import "./tableros.css";

type View = "tableros" | "personas" | "revision";

export function BoardsAdmin() {
  const { unidad, vista } = useParams<{ unidad?: string; vista?: View }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const units = useUnits();
  const boards = useBoards();
  const reviews = useReviews();

  const all = units.data?.units ?? [];
  const members = units.data?.members ?? [];
  const isPlaneacion = hasRole("planeacion");
  // El organigrama es estructura institucional: lo mantiene la administración.
  // `planeacion` es «edita pilares y publica», y lo tiene demasiada gente para
  // que además signifique «manda en toda la universidad».
  const isAdmin = hasRole("admin");

  /** Qué parte del organigrama le toca: lo suyo, lo que cuelga y el camino. */
  const reach = useMemo(
    () => reachOf(all, members, profile?.id ?? "", isAdmin),
    [all, members, profile, isAdmin],
  );
  /** Las que puede abrir de verdad. El «contexto» se dibuja pero no se abre. */
  const mine = useMemo(
    () => all.filter((u) => reach.get(u.id) === "propia" || reach.get(u.id) === "heredada"),
    [all, reach],
  );

  // Una unidad puesta en la dirección que no le toca no se abre: la base no le
  // daría nada y la pantalla no debe fingir que sí.
  const asked = all.find((u) => u.slug === unidad) ?? null;
  const current = asked && mine.some((u) => u.id === asked.id) ? asked : (mine[0] ?? null);
  const view: View = vista ?? "tableros";
  const myRole = profile && current ? roleAt(all, members, profile.id, current.id) : null;
  const pending = (reviews.data ?? []).filter((r) => r.state === "pendiente");

  const go = (unit: Unit | null, next: View = "tableros") =>
    navigate(unit ? `/admin/tableros/${unit.slug}/${next}` : "/admin/tableros");

  return (
    <AdminShell
      section="tableros"
      kicker="Mis Tableros"
      title={current ? current.name : "Mis Tableros"}
      description={
        current
          ? `${UNIT_KIND[current.kind].label} · ${describeRole(myRole, isPlaneacion)}`
          : "Cada unidad arma sus propios tableros con sus propios datos."
      }
      rail={
        current ? (
          <AdminRail label="Qué ver de esta unidad">
            <AdminRailTab current={view === "tableros"} onSelect={() => go(current, "tableros")}>
              Tableros
            </AdminRailTab>
            <AdminRailTab current={view === "personas"} onSelect={() => go(current, "personas")}>
              Personas
            </AdminRailTab>
            {isPlaneacion && (
              <AdminRailTab current={view === "revision"} count={pending.length} onSelect={() => go(current, "revision")}>
                Revisión
              </AdminRailTab>
            )}
          </AdminRail>
        ) : undefined
      }
      actions={
        isPlaneacion && pending.length > 0 ? (
          <Link
            to={current ? `/admin/tableros/${current.slug}/revision` : "/admin/tableros"}
            className="button-secondary tb-pending"
            onClick={(e) => {
              if (!current) return;
              e.preventDefault();
              go(current, "revision");
            }}
          >
            <Icon name="clock" size={15} />
            {pending.length} {pending.length === 1 ? "solicitud" : "solicitudes"}
          </Link>
        ) : undefined
      }
    >
      {units.isPending ? (
        <p className="admin-loading">Cargando el organigrama…</p>
      ) : all.length === 0 ? (
        <FirstUnit canCreate={isAdmin} units={all} />
      ) : mine.length === 0 ? (
        isPlaneacion ? (
          // Planeación no ve las unidades ajenas, pero sí lo que le mandan a
          // revisar. Sin esta salida, quien revisa se quedaría en la puerta.
          <div className="oda-stack">
            <p className="oda-banner" role="note">
              <Icon name="eye" size={16} />
              No perteneces a ninguna unidad, así que no ves sus tableros. Lo que sí ves es lo que te mandan a
              revisar: entras a un tablero mientras su solicitud esté abierta.
            </p>
            <ReviewQueue units={all} boards={boards.data ?? []} />
          </div>
        ) : (
          <StageEmpty title="No perteneces a ninguna unidad">
            Pídele a la jefatura de tu unidad que te dé acceso, o a Planeación que te ubique en el organigrama.
          </StageEmpty>
        )
      ) : (
        <div className="tb">
          <UnitTree
            units={all}
            members={members}
            reach={reach}
            profileId={profile?.id ?? ""}
            current={current}
            canManage={isAdmin}
            onPick={(u) => go(u, view === "revision" ? "tableros" : view)}
          />

          <div className="tb__work">

            {!current ? (
              <StageEmpty title="Elige una unidad">El árbol de la izquierda lleva a los tableros de cada una.</StageEmpty>
            ) : view === "personas" ? (
              <UnitPeople
                unit={current}
                units={all}
                members={members}
                myRole={myRole}
                isPlaneacion={isPlaneacion}
                isAdminHere={isAdmin}
              />
            ) : view === "revision" ? (
              <ReviewQueue units={all} boards={boards.data ?? []} />
            ) : (
              <UnitBoards
                unit={current}
                units={all}
                boards={boards.data ?? []}
                myRole={myRole}
                isPlaneacion={isPlaneacion}
                isAdmin={isAdmin}
                loading={boards.isPending}
                onOpenPeople={() => go(current, "personas")}
              />
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

const describeRole = (role: UnitRole | null, isPlaneacion: boolean) =>
  role ? `Eres ${UNIT_ROLE[role].label.toLowerCase()} aquí` : isPlaneacion ? "Planeación: lees todo, escribe la unidad" : "Sin papel en esta unidad";

/**
 * Lo primero que ve Planeación cuando no hay nada.
 *
 * No manda a otra pantalla: la unidad se crea aquí mismo, porque quien está
 * mirando el organigrama vacío es justo quien sabe qué falta.
 */
function FirstUnit({ canCreate, units }: { canCreate: boolean; units: Unit[] }) {
  const [open, setOpen] = useState(false);

  if (!canCreate) {
    return (
      <StageEmpty title="Todavía no hay unidades">
        La estructura la arma Planeación: vicerrectorías, facultades, programas y oficinas. Sin ella no hay a quién
        colgarle un tablero.
      </StageEmpty>
    );
  }

  return (
    <Panel
      title="Empieza por el organigrama"
      description="Una unidad es a quien pertenecen los tableros y las personas. Se puede empezar por una facultad y colgarle después sus programas, o al revés: el árbol se recoloca cuando haga falta."
      actions={
        !open && (
          <button type="button" className="button-primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={15} /> Crear la primera unidad
          </button>
        )
      }
    >
      {open ? (
        <UnitForm units={units} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
      ) : (
        <p className="tb-prose">
          Lo corriente es empezar por las vicerrectorías, colgarles las facultades y de cada facultad sus
          programas. Las oficinas que no cuelgan de nadie —Bienestar, Planeación misma— se crean de primer nivel.
        </p>
      )}
    </Panel>
  );
}

/* --- El árbol ----------------------------------------------------------------- */

function UnitTree({
  units,
  members,
  reach,
  profileId,
  current,
  canManage,
  onPick,
}: {
  units: Unit[];
  members: UnitMember[];
  reach: Map<string, Reach>;
  profileId: string;
  current: Unit | null;
  canManage: boolean;
  onPick: (unit: Unit) => void;
}) {
  /** Qué se está editando: una unidad por su id, o una nueva bajo un padre. */
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);

  const branch = (parentId: string | null, depth: number) => {
    // Solo lo que le toca. El resto de la universidad no se dibuja: un árbol
    // lleno de unidades ajenas parece un acceso que no se tiene.
    const children = unitChildren(units, parentId).filter((u) => reach.has(u.id));
    if (!children.length) return null;
    return (
      <ul className="tb-tree__list" data-depth={depth}>
        {children.map((unit) => {
          const role = profileId ? roleAt(units, members, profileId, unit.id) : null;
          const from = profileId ? roleSource(units, members, profileId, unit.id) : null;
          const inherited = Boolean(role && from && from.id !== unit.id);
          const own = members.some((m) => m.unitId === unit.id && m.profileId === profileId);
          // «Herencia rota»: hay pertenencia propia y además una heredable que
          // decía otra cosa. Se marca porque si no, nadie entiende por qué esta
          // unidad no dice lo mismo que su madre.
          const broken = own && Boolean(profileId) && from?.id === unit.id && unit.parentId
            ? roleAt(units, members, profileId, unit.parentId) !== null && roleAt(units, members, profileId, unit.parentId) !== role
            : false;
          return (
            <li key={unit.id}>
              <span className="tb-tree__row">
              {/* Lo que no se abre no es un botón: detrás no hay nada, y el
                  tabulador no debe pararse en una promesa vacía. */}
              <Cell
                open={reach.get(unit.id) !== "contexto"}
                current={current?.id === unit.id}
                onPick={() => onPick(unit)}
              >
                <span className="tb-tree__code">{unit.code}</span>
                <span className="tb-tree__name">{unit.name}</span>
                {/* Solo si tiene papel propio o heredado. Repetir «Planeación»
                    en las siete filas no dice nada: eso ya lo dice la cabecera. */}
                {role && (
                  <span className="tb-tree__role">
                    {broken ? (
                      <span className="tb-tree__broken">
                        <Icon name="alert" size={13} /> {UNIT_ROLE[role].label}
                      </span>
                    ) : inherited ? (
                      `hereda ${UNIT_ROLE[role].label}`
                    ) : (
                      UNIT_ROLE[role].label
                    )}
                  </span>
                )}
              </Cell>
                {canManage && (
                  <span className="tb-tree__tools">
                    <button
                      type="button"
                      className="tb-tree__tool"
                      aria-label={`Colgar una unidad de ${unit.name}`}
                      title="Colgar una unidad de esta"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(null);
                        setAdding({ parentId: unit.id });
                      }}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                    <button
                      type="button"
                      className="tb-tree__tool"
                      aria-label={`Corregir ${unit.name}`}
                      title="Corregir esta unidad"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdding(null);
                        setEditing(unit.id);
                      }}
                    >
                      <Icon name="settings" size={14} />
                    </button>
                  </span>
                )}
              </span>
              {editing === unit.id && (
                <div className="tb-tree__form">
                  <UnitForm units={units} initial={unit} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
                  <div className="tb-tree__danger">
                    <UnitDelete unit={unit} units={units} onDone={() => setEditing(null)} />
                  </div>
                </div>
              )}
              {adding?.parentId === unit.id && (
                <div className="tb-tree__form">
                  <UnitForm units={units} parentId={unit.id} onDone={() => setAdding(null)} onCancel={() => setAdding(null)} />
                </div>
              )}
              {branch(unit.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <nav className="tb-tree" aria-label="Unidades de la universidad">
      <h2>La universidad</h2>
      <p>Cada unidad lleva sus propios tableros. Lo que eres en una, lo eres en las que cuelgan de ella.</p>
      {branch(null, 0)}
      {canManage && (
        <div className="tb-tree__add">
          {adding && adding.parentId === null ? (
            <UnitForm units={units} parentId={null} onDone={() => setAdding(null)} onCancel={() => setAdding(null)} />
          ) : (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setEditing(null);
                setAdding({ parentId: null });
              }}
            >
              <Icon name="plus" size={15} /> Unidad de primer nivel
            </button>
          )}
        </div>
      )}
      <p className="tb-tree__foot">
        {canManage
          ? "Ves el organigrama entero porque lo mantienes. Los demás solo ven su unidad y lo que cuelga de ella."
          : "Solo tus unidades y las que cuelgan de ellas. Las de arriba se dibujan para situarte y no se abren: no hay nada tuyo detrás."}
      </p>
    </nav>
  );
}

/** Una fila del árbol: botón cuando lleva a algún sitio, texto cuando no. */
function Cell({
  open,
  current,
  onPick,
  children,
}: {
  open: boolean;
  current: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <span className="tb-tree__unit" data-context="true">
        {children}
      </span>
    );
  }
  return (
    <button type="button" className="tb-tree__unit" data-reachable="true" aria-current={current || undefined} onClick={onPick}>
      {children}
    </button>
  );
}

/* --- Los tableros de una unidad ------------------------------------------------ */

function UnitBoards({
  unit,
  units,
  boards,
  myRole,
  isPlaneacion,
  isAdmin,
  loading,
  onOpenPeople,
}: {
  unit: Unit;
  units: Unit[];
  boards: ReturnType<typeof useBoards>["data"] extends (infer T)[] | undefined ? T[] : never;
  myRole: UnitRole | null;
  isPlaneacion: boolean;
  isAdmin: boolean;
  loading: boolean;
  onOpenPeople: () => void;
}) {
  const save = useSaveBoard();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [into, setInto] = useState(unit.id);

  const own = boards.filter((b) => b.unitId === unit.id).sort((a, b) => a.position - b.position);
  const kids = unitDescendants(units, unit.id);
  const leads = canLead(myRole, isAdmin);
  // A qué oficina se cuelga. Planeación puede colgarlo de cualquiera; una
  // jefatura, de la suya y de las que cuelgan de ella.
  // Solo donde de verdad manda: la base rechazaría el resto.
  const targets = isAdmin ? units : [unit, ...kids];
  const target = units.find((u) => u.id === into) ?? unit;
  const taken = boards.filter((b) => b.unitId === target.id).map((b) => b.slug);

  const create = () => {
    const name = title.trim();
    if (!name) return;
    save.mutate(
      {
        unit_id: target.id,
        title: name,
        slug: freeSlug(name, taken),
        position: boards.filter((b) => b.unitId === target.id).length + 1,
      },
      {
        onSuccess: () => {
          setCreating(false);
          setTitle("");
          setInto(unit.id);
        },
      },
    );
  };

  return (
    <div className="oda-stack">
      <Panel
        title="Tableros de la unidad"
        description={
          !leads && isPlaneacion && !atLeast(myRole, "editor")
            ? "Entras como Planeación: lees y repartes los papeles de la unidad, pero sus tableros los crea y los borra su jefatura."
            : leads
              ? "Eres jefe aquí: puedes crear tableros, repartir accesos y pedir que se publiquen."
              : atLeast(myRole, "editor")
                ? "Eres editor: subes tablas y armas visores. Crear y publicar es del jefe."
                : "Puedes abrirlos y descargar sus datos."
        }
        actions={
          <>
            <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
            {leads && !creating && (
              <button type="button" className="button-primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={15} /> Nuevo tablero
              </button>
            )}
          </>
        }
      >
        {creating && (
          <form
            className="oda-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="oda-form-grid">
              <label className="admin-field admin-field--wide">
                <span>Cómo se llama</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Matrícula y permanencia" autoFocus required />
              </label>
              {targets.length > 1 && (
                <label className="admin-field admin-field--wide">
                  <span>De qué oficina es</span>
                  <select value={target.id} onChange={(e) => setInto(e.target.value)}>
                    {targets.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} · {u.name}
                      </option>
                    ))}
                  </select>
                  <small className="oda-field-hint">
                    La unidad a la que pertenece: es quien lo edita y de quien cuelga su dirección.
                  </small>
                </label>
              )}
            </div>
            <p className="oda-field-hint">
              Vivirá en <code>/tableros/{target.slug}/{freeSlug(title || "tablero", taken)}</code> y esa dirección no
              cambiará aunque después se publique.
            </p>
            <div className="oda-inline-form__actions">
              <button type="button" className="button-secondary" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button type="submit" className="button-primary" disabled={!title.trim() || save.isPending}>
                Crear
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="admin-loading">Cargando los tableros…</p>
        ) : own.length === 0 ? (
          <StageEmpty title={`${unit.name} todavía no tiene tableros`}>
            {leads
              ? "Crea el primero: se empieza subiendo una tabla de datos y dibujándola."
              : "Los crea la jefatura de la unidad."}
          </StageEmpty>
        ) : (
          <ul className="tb-list">
            {own.map((board) => (
              <li key={board.id}>
                <Link to={`/admin/tableros/${unit.slug}/tablero/${board.slug}`} className="tb-list__row">
                  <span className="tb-list__main">
                    <strong>{board.title}</strong>
                    {board.description && <small>{board.description}</small>}
                  </span>
                  <span className="tb-list__see" data-level={board.visibility}>
                    <Icon name={board.visibility === "publico" ? "compass" : board.visibility === "universidad" ? "user" : "lock"} size={14} />
                    {VISIBILITY[board.visibility].short}
                  </span>
                  <span className="tb-list__meta">{board.pages.length} {board.pages.length === 1 ? "página" : "páginas"}</span>
                  <span className="tb-list__meta tb-list__when">{whenText(board.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {kids.length > 0 && (
        <Panel
          title="En las unidades que cuelgan de esta"
          description="Sus tableros son suyos; aquí se ven porque tu papel baja hasta ellas."
          actions={
            <button type="button" className="button-secondary" onClick={onOpenPeople}>
              Ver accesos
            </button>
          }
        >
          <ul className="tb-list">
            {kids.map((kid) => {
              const count = boards.filter((b) => b.unitId === kid.id).length;
              return (
                <li key={kid.id}>
                  <Link to={`/admin/tableros/${kid.slug}/tableros`} className="tb-list__row">
                    <span className="tb-list__main">
                      <strong>{kid.name}</strong>
                      <small>{UNIT_KIND[kid.kind].label}</small>
                    </span>
                    <span className="tb-list__meta">
                      {count} {count === 1 ? "tablero" : "tableros"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

const whenText = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
};

/* --- Personas ------------------------------------------------------------------ */

function UnitPeople({
  unit,
  units,
  members,
  myRole,
  isPlaneacion,
  isAdminHere,
}: {
  unit: Unit;
  units: Unit[];
  members: UnitMember[];
  myRole: UnitRole | null;
  isPlaneacion: boolean;
  isAdminHere: boolean;
}) {
  const save = useSaveMember();
  const remove = useRemoveMember();
  const saveUnit = useSaveUnit();
  const profiles = useProfiles();
  const [adding, setAdding] = useState("");
  const [role, setRole] = useState<UnitRole>("visor");

  void saveUnit;
  const leads = canStaff(myRole, isPlaneacion);
  const own = members.filter((m) => m.unitId === unit.id);
  const inherited = unit.parentId
    ? members.filter((m) => m.unitId !== unit.id && unitAncestors(units, unit).some((a) => a.id === m.unitId))
    : [];
  const takenIds = new Set(own.map((m) => m.profileId));
  const invitable = (profiles.data ?? []).filter((p) => !takenIds.has(p.id));

  return (
    <div className="oda-stack">
      <Panel
        title={`Personas de ${unit.name}`}
        description={
          leads
            ? "Puedes invitar y cambiar papeles aquí. Quien queda como jefe pasa a repartir accesos por su cuenta."
            : "Reparten accesos la jefatura de la unidad y Planeación."
        }
        actions={<SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} />}
      >
        {leads && (
          <form
            className="tb-invite"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding) save.mutate({ unitId: unit.id, profileId: adding, role }, { onSuccess: () => setAdding("") });
            }}
          >
            <label className="admin-field">
              <span>Quién</span>
              <select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Elige a alguien…</option>
                {invitable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.unit ? ` · ${p.unit}` : ""} · {p.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Con qué papel</span>
              <select value={role} onChange={(e) => setRole(e.target.value as UnitRole)}>
                {(Object.keys(UNIT_ROLE) as UnitRole[]).map((r) => (
                  <option key={r} value={r}>
                    {UNIT_ROLE[r].label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button-primary" disabled={!adding}>
              Invitar
            </button>
            <p className="tb-invite__hint">
              {UNIT_ROLE[role].hint}{" "}
              {profiles.isPending
                ? "Cargando el directorio…"
                : invitable.length === 0
                  ? "No queda nadie por invitar: todo el directorio ya está en esta unidad."
                  : `Salen las ${invitable.length} personas con cuenta activa en la intranet que aún no están aquí.`}
            </p>
          </form>
        )}

        {own.length === 0 ? (
          <StageEmpty title="Nadie puesto aquí a propósito">
            {inherited.length > 0
              ? "Quienes trabajan en esta unidad lo hacen con el papel que les baja de más arriba."
              : "Ni siquiera hereda de otra unidad: hoy solo entra Planeación."}
          </StageEmpty>
        ) : (
          <ul className="tb-people">
            {own.map((m) => (
              <li key={m.id}>
                <span className="tb-people__who">
                  <strong>{m.name}</strong>
                  <small>{m.email}</small>
                </span>
                {leads ? (
                  <select
                    className="tb-people__role"
                    value={m.role}
                    onChange={(e) => save.mutate({ unitId: unit.id, profileId: m.profileId, role: e.target.value as UnitRole })}
                    aria-label={`Papel de ${m.name}`}
                  >
                    {(Object.keys(UNIT_ROLE) as UnitRole[]).map((r) => (
                      <option key={r} value={r}>
                        {UNIT_ROLE[r].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="tb-people__role tb-people__role--flat">{UNIT_ROLE[m.role].label}</span>
                )}
                {leads && (
                  <ConfirmButton
                    label="Quitar"
                    confirmLabel={`Quitar a ${m.name}`}
                    onConfirm={() => remove.mutate(m.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {inherited.length > 0 && (
        <Panel
          title="Lo que baja de más arriba"
          description="Estas personas no están puestas en esta unidad: trabajan aquí porque su papel viene de una de la que cuelga."
        >
          <ul className="tb-people">
            {inherited.map((m) => {
              const from = units.find((u) => u.id === m.unitId);
              const overridden = own.some((o) => o.profileId === m.profileId);
              return (
                <li key={m.id} data-muted={overridden || undefined}>
                  <span className="tb-people__who">
                    <strong>{m.name}</strong>
                    <small>desde {from?.name ?? "otra unidad"}</small>
                  </span>
                  <span className="tb-people__role tb-people__role--flat">{UNIT_ROLE[m.role].label}</span>
                  {overridden && <span className="tb-people__note">reemplazado aquí</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title="Quién más puede entrar aquí" description="La respuesta corta es: nadie a quien no se lo hayan dado.">
        <p className="tb-prose">
          Un tablero de esta unidad lo abre quien pertenece a ella o a una de la que cuelga. Nadie más, ni con el
          enlace en la mano. Si se comparte con toda la universidad lo abre cualquiera con sesión, y si se publica
          lo abre cualquiera: esos dos peldaños los decide la jefatura, y el último lo aprueba Planeación.
        </p>
        <p className="tb-prose">
          <strong>Planeación no lee estos tableros por tener ese rol.</strong> Entra a uno solo mientras haya una
          solicitud de publicación abierta sobre él —cuando la unidad la llama— y deja de entrar al resolverla.
          Lo que sí hace en cualquier momento es repartir los papeles de la unidad, porque alguien tiene que poder
          nombrar al primer jefe de una recién creada.
        </p>
        {isAdminHere && (
          <p className="tb-prose tb-prose--aside">
            Tú entras como administración, que conserva la lectura de todo: alguien tiene que poder reparar un
            desperfecto.
          </p>
        )}
      </Panel>
    </div>
  );
}

/** Los ancestros de una unidad, sin incluirla. */
const unitAncestors = (units: Unit[], unit: Unit): Unit[] => {
  const out: Unit[] = [];
  let walker = unit.parentId ? units.find((u) => u.id === unit.parentId) : undefined;
  while (walker && out.length < 64) {
    out.push(walker);
    walker = walker.parentId ? units.find((u) => u.id === walker!.parentId) : undefined;
  }
  return out;
};
