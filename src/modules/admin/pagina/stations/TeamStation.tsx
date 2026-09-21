/* =============================================================================
   Estación 3 · Equipo.

   Las personas de la oficina, en el orden del carrusel. La lista se lee de un
   vistazo —foto, nombre, cargo y qué le falta a cada ficha— y solo se abre la
   persona que se va a editar: un formulario de once campos por cada una,
   todos abiertos a la vez, convierte la pantalla en un muro.

   La ficha ampliada es opcional y se nota: quien no tiene bio, formación,
   correo ni enlaces sale en el carrusel como tarjeta, sin prometer un detalle
   que no existe.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { initialsOf, officePhotoUrl, uid } from "../../../planeacion/page";
import type { TeamPerson } from "../../../planeacion/page";
import { ConfirmButton, Panel } from "../../udes-en-cifras/ui";
import { Lines, Text } from "../fields";
import { removeOfficePhoto, uploadOfficePhoto } from "../store";
import type { OfficeStationProps } from "../OfficePageAdmin";

const empty = (): TeamPerson => ({
  id: uid(),
  name: "",
  role: "",
  area: "",
  email: "",
  photo: "",
  focus: "",
  bio: "",
  education: [],
  links: [],
});

export function TeamStation({ draft, patch, canEdit, notify, fail }: OfficeStationProps) {
  const [open, setOpen] = useState<string | null>(null);
  const people = draft.team.people;

  const setPeople = (next: TeamPerson[]) =>
    patch((page) => ({ ...page, team: { ...page.team, people: next } }));

  const update = (id: string, change: Partial<TeamPerson>) =>
    setPeople(people.map((person) => (person.id === id ? { ...person, ...change } : person)));

  const move = (index: number, step: -1 | 1) => {
    const target = index + step;
    if (target < 0 || target >= people.length) return;
    const next = [...people];
    [next[index], next[target]] = [next[target], next[index]];
    setPeople(next);
  };

  function add() {
    const person = empty();
    setPeople([...people, person]);
    setOpen(person.id);
  }

  async function remove(person: TeamPerson) {
    setPeople(people.filter((item) => item.id !== person.id));
    if (open === person.id) setOpen(null);
    await removeOfficePhoto(person.photo);
  }

  return (
    <>
      <Panel
        title="La franja del equipo"
        description="Va en la portada antes del bloque de la oficina, y en /equipo con las mismas tarjetas en rejilla. Sin personas, no se dibuja."
      >
        <div className="oda-form-grid">
          <Text
            label="Título"
            comfortable={40}
            value={draft.team.title}
            disabled={!canEdit}
            placeholder="Quiénes lo hacen"
            onChange={(title) => patch((page) => ({ ...page, team: { ...page.team, title } }))}
          />
          <Text
            label="Bajada"
            wide
            rows={2}
            comfortable={140}
            value={draft.team.lede}
            disabled={!canEdit}
            placeholder="El equipo que planea, mide y acompaña a cada oficina de la universidad."
            onChange={(lede) => patch((page) => ({ ...page, team: { ...page.team, lede } }))}
          />
        </div>
      </Panel>

      <Panel
        title={people.length ? `${people.length} ${people.length === 1 ? "persona" : "personas"}` : "Personas"}
        description="El orden de la lista es el orden del carrusel. Una persona sin nombre no se publica."
        actions={
          canEdit && (
            <button type="button" className="button-primary" onClick={add}>
              <Icon name="plus" size={15} /> Añadir una persona
            </button>
          )
        }
      >
        {people.length === 0 ? (
          <p className="oda-muted">
            Todavía no hay nadie cargado. Mientras la lista esté vacía, la portada no muestra la franja del equipo
            y /equipo enseña solo las áreas y el contacto.
          </p>
        ) : (
          <ol className="ofa-people">
            {people.map((person, index) => (
              <PersonRow
                key={person.id}
                person={person}
                index={index}
                total={people.length}
                areas={draft.areas}
                open={open === person.id}
                canEdit={canEdit}
                onToggle={() => setOpen(open === person.id ? null : person.id)}
                onChange={(change) => update(person.id, change)}
                onMove={(step) => move(index, step)}
                onRemove={() => void remove(person)}
                notify={notify}
                fail={fail}
              />
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}

/* --- Una persona ----------------------------------------------------------------------- */

function PersonRow({
  person,
  index,
  total,
  areas,
  open,
  canEdit,
  onToggle,
  onChange,
  onMove,
  onRemove,
  notify,
  fail,
}: {
  person: TeamPerson;
  index: number;
  total: number;
  areas: { id: string; name: string }[];
  open: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onChange: (change: Partial<TeamPerson>) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
  notify: (message: string) => void;
  fail: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const photo = officePhotoUrl(person.photo);
  const hasFile = Boolean(person.bio || person.education.length || person.links.length || person.email);
  const panelId = `ofa-persona-${person.id}`;

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const previous = person.photo;
      const path = await uploadOfficePhoto("equipo", file);
      onChange({ photo: path });
      // La anterior se borra al reemplazarla: una foto que ya no enseña nadie
      // sigue ocupando la cuota del bucket.
      await removeOfficePhoto(previous);
      notify(`Fotografía actualizada${person.name ? ` para ${person.name}` : ""}.`);
    } catch (error) {
      fail(error instanceof Error ? error.message : "No se pudo subir la fotografía.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <li className="ofa-person" data-open={open || undefined}>
      <div className="ofa-person__row">
        <span className="ofa-person__avatar">
          {photo ? <img src={photo} alt="" /> : <span aria-hidden="true">{initialsOf(person.name) || "—"}</span>}
        </span>

        <span className="ofa-person__id">
          <b>{person.name || "Persona sin nombre"}</b>
          <small>{person.role || "Sin cargo"}</small>
        </span>

        <span className="ofa-person__marks">
          {!person.name.trim() && (
            <span className="oda-badge" data-tone="warn">
              <Icon name="alert" size={12} /> Sin nombre · no se publica
            </span>
          )}
          <span className="oda-badge" data-tone={photo ? "ok" : "warn"}>
            <Icon name={photo ? "check" : "alert"} size={12} /> {photo ? "Con foto" : "Sin foto"}
          </span>
          <span className="oda-badge" data-tone={hasFile ? "ok" : undefined}>
            <Icon name={hasFile ? "check" : "document"} size={12} /> {hasFile ? "Con ficha" : "Solo tarjeta"}
          </span>
        </span>

        <span className="ofa-person__actions">
          {canEdit && (
            <>
              <button
                type="button"
                className="icon-button"
                disabled={index === 0}
                onClick={() => onMove(-1)}
                aria-label={`Mover a ${person.name || "esta persona"} antes`}
                title="Mover antes"
              >
                <Icon name="arrow-left" size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={index === total - 1}
                onClick={() => onMove(1)}
                aria-label={`Mover a ${person.name || "esta persona"} después`}
                title="Mover después"
              >
                <Icon name="arrow-right" size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            className="oda-link-button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            {open ? "Cerrar" : canEdit ? "Editar" : "Ver"}
          </button>
          {canEdit && (
            <ConfirmButton
              label="Quitar"
              confirmLabel={`${person.name || "Esta persona"} sale del portal${photo ? " y se borra su fotografía" : ""}.`}
              onConfirm={onRemove}
            />
          )}
        </span>
      </div>

      {open && (
        <div className="ofa-person__form" id={panelId}>
          <div className="ofa-person__photo">
            <span className="ofa-person__preview">
              {photo ? (
                <img src={photo} alt={`Fotografía de ${person.name || "la persona"}`} />
              ) : (
                <span aria-hidden="true">{initialsOf(person.name) || "?"}</span>
              )}
            </span>
            {canEdit && (
              <>
                <input
                  ref={picker}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  onChange={(event) => void pick(event.target.files?.[0])}
                />
                <button
                  type="button"
                  className="button-secondary"
                  disabled={uploading}
                  onClick={() => picker.current?.click()}
                >
                  {uploading ? "Subiendo…" : photo ? "Cambiar la foto" : "Subir una foto"}
                </button>
                {photo && (
                  <ConfirmButton
                    label="Quitar la foto"
                    confirmLabel="La tarjeta pasará a mostrar las iniciales."
                    onConfirm={() => {
                      const previous = person.photo;
                      onChange({ photo: "" });
                      void removeOfficePhoto(previous);
                    }}
                  />
                )}
                <small className="ofa-hint">Se recorta en vertical (4:5). Mejor de la cintura para arriba.</small>
              </>
            )}
          </div>

          <div className="oda-form-grid ofa-person__fields">
            <Text
              label="Nombre"
              value={person.name}
              disabled={!canEdit}
              placeholder="Nombre y apellidos"
              onChange={(name) => onChange({ name })}
            />
            <Text
              label="Cargo"
              value={person.role}
              disabled={!canEdit}
              placeholder="Profesional de estadística institucional"
              onChange={(role) => onChange({ role })}
            />

            <label className="admin-field">
              <span>Área</span>
              <select
                value={person.area}
                disabled={!canEdit}
                onChange={(event) => onChange({ area: event.target.value })}
              >
                <option value="">Sin área</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>

            <Text
              label="Correo"
              type="email"
              value={person.email}
              disabled={!canEdit}
              placeholder="nombre@udes.edu.co"
              onChange={(email) => onChange({ email })}
            />

            <Text
              label="En qué anda"
              wide
              rows={2}
              comfortable={120}
              value={person.focus}
              disabled={!canEdit}
              placeholder="Coordina el cierre del corte y el boletín estadístico."
              onChange={(focus) => onChange({ focus })}
              hint="Se lee en la tarjeta, sin abrir la ficha. Una frase en presente."
            />

            <Text
              label="Sobre la persona"
              wide
              rows={6}
              comfortable={520}
              value={person.bio}
              disabled={!canEdit}
              placeholder="Su trayectoria en la oficina y en la universidad, en un párrafo."
              onChange={(bio) => onChange({ bio })}
            />

            <Lines
              label="Formación"
              value={person.education}
              disabled={!canEdit}
              placeholder={"Magíster en Estadística Aplicada, UDES\nIngeniera de Sistemas, UIS"}
              hint="Un título por renglón."
              onChange={(education) => onChange({ education })}
            />

            <LinkRows
              links={person.links}
              canEdit={canEdit}
              onChange={(links) => onChange({ links })}
            />
          </div>
        </div>
      )}
    </li>
  );
}

/* --- Los enlaces de la ficha ------------------------------------------------------------ */

function LinkRows({
  links,
  canEdit,
  onChange,
}: {
  links: { label: string; url: string }[];
  canEdit: boolean;
  onChange: (links: { label: string; url: string }[]) => void;
}) {
  return (
    <div className="admin-field admin-field--wide">
      <span>Perfiles públicos</span>
      {links.length > 0 && (
        <ul className="ofa-links">
          {links.map((item, index) => (
            <li key={index}>
              <input
                type="text"
                value={item.label}
                disabled={!canEdit}
                placeholder="ORCID"
                aria-label={`Nombre del enlace ${index + 1}`}
                onChange={(event) =>
                  onChange(links.map((link, i) => (i === index ? { ...link, label: event.target.value } : link)))
                }
              />
              <input
                type="url"
                value={item.url}
                disabled={!canEdit}
                placeholder="https://orcid.org/0000-0000-0000-0000"
                aria-label={`Dirección del enlace ${index + 1}`}
                onChange={(event) =>
                  onChange(links.map((link, i) => (i === index ? { ...link, url: event.target.value } : link)))
                }
              />
              {canEdit && (
                <button
                  type="button"
                  className="icon-button icon-button--danger"
                  onClick={() => onChange(links.filter((_link, i) => i !== index))}
                  aria-label={`Quitar el enlace ${index + 1}`}
                  title="Quitar"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <button
          type="button"
          className="oda-link-button"
          onClick={() => onChange([...links, { label: "", url: "" }])}
        >
          <Icon name="plus" size={13} /> Añadir un enlace
        </button>
      )}
      <small className="ofa-hint">ORCID, CvLAC, LinkedIn o el perfil que la persona quiera publicar.</small>
    </div>
  );
}
