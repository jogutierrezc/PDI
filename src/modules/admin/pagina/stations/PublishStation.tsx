/* =============================================================================
   Estación 5 · Publicación.

   La única pantalla desde la que algo llega al público. Antes del botón, dos
   cosas: lo que hay que revisar (una foto sin texto alternativo, una persona
   sin nombre, la oficina sin correo) y qué cambia exactamente respecto de lo
   que hoy ve la gente, agrupado por la estación donde se arregla.

   Publicar se confirma aquí mismo, diciendo lo que va a pasar. Un modal para
   esto solo añadiría una capa entre la lista de cambios y el botón que los
   aplica, que es justo lo que conviene tener a la vista.
   ========================================================================== */

import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { formatDate } from "../../../../data/pdi";
import type { OfficePage, PageChange } from "../../../planeacion/page";
import { Panel } from "../../udes-en-cifras/ui";
import { OFFICE_STATIONS, plural } from "../OfficePageAdmin";
import type { OfficeStationProps } from "../OfficePageAdmin";
import { useState } from "react";

interface PublishProps extends OfficeStationProps {
  changes: PageChange[];
  published: OfficePage | null;
  publishedAt: string | null;
  /** Queda borrador por guardar (o se está guardando ahora). */
  pending: boolean;
  publishing: boolean;
  onPublish: () => void;
}

interface Check {
  tone: "warn" | "risk";
  text: string;
  station: PageChange["station"];
}

function checksOf(draft: OfficePage): Check[] {
  const out: Check[] = [];

  const withoutAlt = draft.gallery.slides.filter((slide) => !slide.alt).length;
  if (withoutAlt) {
    out.push({
      tone: "risk",
      station: "galeria",
      text: `${plural(withoutAlt, "fotografía", "fotografías")} sin texto alternativo: no existen para quien usa lector de pantalla.`,
    });
  }

  // Sin nombre la persona no llega al portal: se descarta al normalizar, y con
  // ella su foto y su ficha. Decirlo aquí evita perder un rato de trabajo.
  const nameless = draft.team.people.filter((person) => !person.name.trim()).length;
  if (nameless) {
    out.push({
      tone: "risk",
      station: "equipo",
      text: `${plural(nameless, "persona sin nombre", "personas sin nombre")}: no se publican, y al recargar se pierden con su foto y su ficha.`,
    });
  }

  const withoutRole = draft.team.people.filter((person) => person.name.trim() && !person.role).length;
  if (withoutRole) {
    out.push({
      tone: "warn",
      station: "equipo",
      text: `${plural(withoutRole, "persona", "personas")} sin cargo. La tarjeta saldrá solo con el nombre.`,
    });
  }

  const withoutPhoto = draft.team.people.filter((person) => person.name.trim() && !person.photo).length;
  if (withoutPhoto) {
    out.push({
      tone: "warn",
      station: "equipo",
      text: `${plural(withoutPhoto, "persona", "personas")} sin fotografía. Saldrán con sus iniciales.`,
    });
  }

  if (!draft.office.email) {
    out.push({ tone: "risk", station: "oficina", text: "La oficina no tiene correo de contacto." });
  }
  if (!draft.home.title || !draft.home.lede) {
    out.push({ tone: "risk", station: "portada", text: "Falta el titular o la entradilla de la portada." });
  }

  return out;
}

export function PublishStation({
  draft,
  canEdit,
  changes,
  published,
  publishedAt,
  pending,
  publishing,
  onPublish,
}: PublishProps) {
  const [asking, setAsking] = useState(false);
  const checks = checksOf(draft);
  const blocking = checks.filter((check) => check.tone === "risk");
  const first = published === null;
  const nothing = !first && changes.length === 0;

  const grouped = OFFICE_STATIONS.filter((station) => station.id !== "publicacion").map((station) => ({
    station,
    items: changes.filter((change) => change.station === station.id),
  }));

  return (
    <>
      <Panel
        title="Qué ve el público ahora mismo"
        description={
          first
            ? "La oficina no ha publicado nunca desde aquí: el portal está mostrando el contenido que trae el código."
            : `Publicada el ${formatDate((publishedAt ?? "").slice(0, 10))}.`
        }
        actions={
          <a className="button-secondary" href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={15} /> Abrir la portada
          </a>
        }
      >
        <dl className="ofa-facts">
          <div>
            <dt>Fotografías</dt>
            <dd>{published ? published.gallery.slides.length : "—"}</dd>
          </div>
          <div>
            <dt>Personas</dt>
            <dd>{published ? published.team.people.length : "—"}</dd>
          </div>
          <div>
            <dt>Áreas</dt>
            <dd>{published ? published.areas.length : "—"}</dd>
          </div>
          <div>
            <dt>Accesos</dt>
            <dd>{published ? published.links.length : "—"}</dd>
          </div>
        </dl>
      </Panel>

      {checks.length > 0 && (
        <Panel
          title="Antes de publicar"
          description="Nada de esto impide publicar. Lo marcado en rojo se verá, o se perderá."
        >
          <ul className="ofa-checks">
            {checks.map((check, index) => (
              <li key={index} data-tone={check.tone}>
                <Icon name="alert" size={15} />
                <span>{check.text}</span>
                <Link className="oda-link-button" to={`/admin/pagina/${check.station}`}>
                  Ir a {OFFICE_STATIONS.find((station) => station.id === check.station)?.label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title={first ? "La primera publicación" : nothing ? "Sin cambios" : `Qué cambia (${changes.length})`}
        description={
          first
            ? "Todo lo que hay en el borrador pasa a la portada y a /equipo."
            : nothing
              ? "El borrador y lo publicado dicen lo mismo."
              : "Cada línea señala la estación donde se editó."
        }
        actions={
          canEdit && (
            <>
              {!asking ? (
                <button
                  type="button"
                  className="button-primary"
                  disabled={publishing || (nothing && !pending)}
                  onClick={() => setAsking(true)}
                >
                  {first ? "Publicar la página" : "Publicar los cambios"}
                </button>
              ) : (
                <span className="ofa-confirm" role="group" aria-label="Confirmar la publicación">
                  <span>
                    {first
                      ? "La portada pasará a mostrar este borrador."
                      : `${plural(changes.length, "cambio entra", "cambios entran")} al portal ahora.`}
                  </span>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={publishing}
                    onClick={() => {
                      setAsking(false);
                      onPublish();
                    }}
                  >
                    {publishing ? "Publicando…" : "Sí, publicar"}
                  </button>
                  <button type="button" className="button-ghost" onClick={() => setAsking(false)}>
                    Cancelar
                  </button>
                </span>
              )}
            </>
          )
        }
      >
        {blocking.length > 0 && (
          <p className="oda-banner" role="note">
            <Icon name="alert" size={16} />
            <span>
              Quedan {plural(blocking.length, "asunto", "asuntos")} por resolver arriba. Se puede publicar igual;
              lo verá cualquiera que entre.
            </span>
          </p>
        )}

        {first ? (
          <dl className="ofa-facts">
            <div>
              <dt>Fotografías</dt>
              <dd>{draft.gallery.slides.length}</dd>
            </div>
            <div>
              <dt>Personas</dt>
              <dd>{draft.team.people.length}</dd>
            </div>
            <div>
              <dt>Áreas</dt>
              <dd>{draft.areas.length}</dd>
            </div>
            <div>
              <dt>Accesos</dt>
              <dd>{draft.links.length}</dd>
            </div>
          </dl>
        ) : nothing ? (
          <p className="oda-muted">
            No hay nada pendiente. Vuelve a cualquier estación para cambiar algo y esta lista se llenará sola.
          </p>
        ) : (
          <div className="ofa-diff">
            {grouped
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <section key={group.station.id}>
                  <h3>
                    <Link to={`/admin/pagina/${group.station.id}`}>
                      {group.station.label}
                      <Icon name="arrow-right" size={14} />
                    </Link>
                  </h3>
                  <ul>
                    {group.items.map((item, index) => (
                      <li key={index}>
                        <span>{item.what}</span>
                        <b data-detail={item.detail}>{item.detail}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        )}
      </Panel>
    </>
  );
}
