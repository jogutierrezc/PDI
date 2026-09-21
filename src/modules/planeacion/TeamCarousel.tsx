/* =============================================================================
   Portal de Planeación · el equipo.

   Dos presentaciones de lo mismo, con la misma tarjeta y la misma ficha:
   · en la portada, un carril que se desplaza (`TeamCarousel`);
   · en /equipo, una rejilla con todo el equipo a la vista (`TeamGrid`).

   La ficha se abre en la página y no en una ventana emergente a propósito: no
   es una tarea que haya que interrumpir, y así el resto del equipo sigue a la
   vista, se pasa de una persona a la siguiente sin cerrar nada, y en el móvil
   el detalle aparece bajo la tarjeta que se tocó en lugar de tapar la
   pantalla.

   Quien no tiene nada más que contar (ni bio, ni formación, ni correo, ni
   enlaces) no se dibuja como si se pudiera abrir: su tarjeta es una tarjeta,
   no un botón que no lleva a ninguna parte.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { initialsOf, officePhotoUrl } from "./page";
import type { OfficeAreaItem, TeamPerson } from "./page";
import { useRail } from "./rail";
import { RailArrows, RailPosition } from "./RailControls";

const hasFile = (person: TeamPerson) =>
  Boolean(person.bio || person.education.length || person.links.length || person.email);

interface DirectoryProps {
  people: TeamPerson[];
  areas: OfficeAreaItem[];
}

/* --- La portada: un carril ------------------------------------------------------------ */

export function TeamCarousel({
  title,
  lede,
  people,
  areas,
}: DirectoryProps & { title: string; lede: string }) {
  const rail = useRail<HTMLUListElement>(people.length);
  const directory = useDirectory();
  const headingId = useId();

  if (!people.length) return null;

  return (
    <section className="pl-section pl-team" aria-labelledby={headingId}>
      <div className="pl-container">
        <div className="pl-section__head pl-team__head">
          <h2 id={headingId}>{title}</h2>
          {lede && <p>{lede}</p>}
          <div className="pl-rail-controls">
            <RailPosition
              rail={rail}
              count={people.length}
              goToLabel={(position) => `Ir a la persona ${position + 1}`}
            />
            <RailArrows
              rail={rail}
              count={people.length}
              previousLabel="Personas anteriores"
              nextLabel="Personas siguientes"
            />
          </div>
        </div>

        <ul
          className="pl-team__rail"
          ref={rail.ref}
          data-more={!rail.atEnd || undefined}
          data-less={!rail.atStart || undefined}
          aria-label={`${people.length} personas de la oficina`}
        >
          {people.map((person) => (
            <li key={person.id}>{directory.card(person, areas)}</li>
          ))}
        </ul>

        {directory.file(people, areas)}
      </div>
    </section>
  );
}

/* --- /equipo: una rejilla -------------------------------------------------------------- */

export function TeamGrid({ people, areas, label }: DirectoryProps & { label: string }) {
  const directory = useDirectory();
  if (!people.length) return null;
  return (
    <>
      <ul className="pl-team__grid" aria-label={label}>
        {people.map((person) => (
          <li key={person.id}>{directory.card(person, areas)}</li>
        ))}
      </ul>
      {directory.file(people, areas)}
    </>
  );
}

/* --- Lo que comparten ------------------------------------------------------------------ */

/** La persona abierta, el foco que vuelve a su tarjeta y el Escape. */
function useDirectory() {
  const [open, setOpen] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const fileId = useId();

  const close = () => {
    const id = open;
    setOpen(null);
    // Cerrar devuelve el foco a la tarjeta: quien abrió con el teclado no se
    // queda al principio de la página.
    if (id) cards.current.get(id)?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return {
    card: (person: TeamPerson, areas: OfficeAreaItem[]) => (
      <PersonCard
        person={person}
        area={areas.find((item) => item.id === person.area)}
        open={open === person.id}
        fileId={fileId}
        onOpen={() => setOpen(open === person.id ? null : person.id)}
        register={(node) => {
          if (node) cards.current.set(person.id, node);
          else cards.current.delete(person.id);
        }}
      />
    ),
    file: (people: TeamPerson[], areas: OfficeAreaItem[]) => {
      const active = people.find((person) => person.id === open);
      if (!active) return null;
      return (
        <PersonFile
          id={fileId}
          person={active}
          area={areas.find((item) => item.id === active.area)}
          onClose={close}
        />
      );
    },
  };
}

function PersonCard({
  person,
  area,
  open,
  fileId,
  onOpen,
  register,
}: {
  person: TeamPerson;
  area?: OfficeAreaItem;
  open: boolean;
  fileId: string;
  onOpen: () => void;
  register: (node: HTMLButtonElement | null) => void;
}) {
  const photo = officePhotoUrl(person.photo);
  const body = (
    <>
      <span className="pl-person__photo">
        {photo ? (
          <img src={photo} alt="" loading="lazy" decoding="async" />
        ) : (
          <span aria-hidden="true">{initialsOf(person.name)}</span>
        )}
      </span>
      <span className="pl-person__text">
        <b>{person.name}</b>
        <small>{person.role}</small>
        {area && <span className="pl-person__area">{area.name}</span>}
        {person.focus && <span className="pl-person__focus">{person.focus}</span>}
      </span>
    </>
  );

  if (!hasFile(person)) {
    return <div className="pl-person pl-person--plain">{body}</div>;
  }

  return (
    <button
      type="button"
      ref={register}
      className="pl-person"
      aria-expanded={open}
      aria-controls={fileId}
      data-open={open || undefined}
      onClick={onOpen}
    >
      {body}
      <span className="pl-person__more">
        {open ? "Cerrar la ficha" : "Ver la ficha"}
        <Icon name="chevron-down" size={15} />
      </span>
    </button>
  );
}

function PersonFile({
  id,
  person,
  area,
  onClose,
}: {
  id: string;
  person: TeamPerson;
  area?: OfficeAreaItem;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const photo = officePhotoUrl(person.photo);

  // Al abrir, el foco entra en la ficha: lo siguiente que anuncia el lector de
  // pantalla es de quién es, no el resto de la lista.
  useEffect(() => {
    heading.current?.focus();
  }, [person.id]);

  return (
    <article className="pl-file" id={id} aria-labelledby={`${id}-nombre`}>
      <div className="pl-file__portrait">
        {photo ? (
          <img src={photo} alt={`Fotografía de ${person.name}`} decoding="async" />
        ) : (
          <span aria-hidden="true">{initialsOf(person.name)}</span>
        )}
      </div>

      <div className="pl-file__body">
        <h3 id={`${id}-nombre`} ref={heading} tabIndex={-1}>
          {person.name}
        </h3>
        <p className="pl-file__role">
          {person.role}
          {area && <span className="pl-file__area">{area.name}</span>}
        </p>

        {person.focus && <p className="pl-file__focus">{person.focus}</p>}
        {person.bio && <p className="pl-file__bio">{person.bio}</p>}

        {person.education.length > 0 && (
          <div className="pl-file__block">
            <h4>Formación</h4>
            <ul>
              {person.education.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {(person.email || person.links.length > 0) && (
          <div className="pl-file__contact">
            {person.email && (
              <a className="pl-link" href={`mailto:${person.email}`}>
                {person.email}
              </a>
            )}
            {person.links.map((item) => (
              <a key={item.url} className="pl-link" href={item.url} target="_blank" rel="noopener noreferrer">
                {item.label} <Icon name="external" size={14} />
              </a>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="pl-file__close" onClick={onClose} aria-label="Cerrar la ficha">
        <Icon name="close" size={18} />
      </button>
    </article>
  );
}
