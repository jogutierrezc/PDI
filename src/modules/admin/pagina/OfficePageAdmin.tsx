/* =============================================================================
   Intranet · La página de la oficina.

   La portada de Planeación y la página del equipo se escriben aquí, no en el
   código. Cinco estaciones, y cada una es una banda de la página de verdad:

     1 Portada       el titular, la entradilla y el encabezado de los portales
     2 Galería       las fotografías de la oficina, con su pie
     3 Equipo        las personas: foto, cargo, área y su ficha ampliada
     4 La oficina    propósito, contacto, áreas y accesos
     5 Publicación   qué cambia desde la última publicación, y publicarlo

   El borrador se guarda solo mientras se escribe —nada de esto es público
   hasta pulsar «Publicar»—, y a la derecha va la banda real dibujada a escala,
   con los mismos componentes que ve cualquiera que entre al portal.

   La estación vive en la ruta: /admin/pagina/equipo
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { pageChanges } from "../../planeacion/page";
import type { OfficePage } from "../../planeacion/page";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Preview } from "./Preview";
import { useOfficeAdmin, useOfficePublish, useOfficeSave } from "./store";
import { GalleryStation } from "./stations/GalleryStation";
import { HomeStation } from "./stations/HomeStation";
import { OfficeStation } from "./stations/OfficeStation";
import { PublishStation } from "./stations/PublishStation";
import { TeamStation } from "./stations/TeamStation";
import "../udes-en-cifras/od-admin.css";
import "./office-admin.css";

export type OfficeStationId = "portada" | "galeria" | "equipo" | "oficina" | "publicacion";

export const OFFICE_STATIONS: {
  id: OfficeStationId;
  number: number;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  { id: "portada", number: 1, label: "Portada", hint: "El titular, la entradilla y el encabezado de los portales", icon: "grid" },
  { id: "galeria", number: 2, label: "Galería", hint: "Las fotografías de la oficina, con su pie y su texto alternativo", icon: "layers" },
  { id: "equipo", number: 3, label: "Equipo", hint: "Las personas de la oficina y su ficha ampliada", icon: "community" },
  { id: "oficina", number: 4, label: "La oficina", hint: "Propósito, contacto, áreas y accesos", icon: "compass" },
  { id: "publicacion", number: 5, label: "Publicación", hint: "Qué cambia desde la última publicación, y publicarlo", icon: "upload" },
];

/** Lo que recibe cada estación. `patch` escribe sobre el borrador en memoria. */
export interface OfficeStationProps {
  draft: OfficePage;
  patch: (change: (page: OfficePage) => OfficePage) => void;
  canEdit: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
}

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Largo cómodo de la entradilla de la portada: por encima, el encabezado pasa
 *  de cuatro líneas y el buscador —la acción principal— se va del primer
 *  vistazo. No lo impide nadie; se dice en el campo y en la barra. */
export const LEDE_COMFORT = 320;

export function OfficePageAdmin() {
  const { station: stationParam } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const query = useOfficeAdmin();
  const save = useOfficeSave();
  const publish = useOfficePublish();

  const station = (OFFICE_STATIONS.find((item) => item.id === stationParam)?.id ?? "portada") as OfficeStationId;
  const current = OFFICE_STATIONS.find((item) => item.id === station)!;

  const [draft, setDraft] = useState<OfficePage | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  /** El último borrador que llegó a la base, en texto: con qué comparar. */
  const saved = useRef("");

  const state = query.data;
  const canEdit = hasRole("planeacion") && !state?.missing;

  // El borrador de la base se copia una sola vez a memoria. Releerlo después
  // borraría lo que se esté escribiendo.
  useEffect(() => {
    if (!state || draft !== null) return;
    setDraft(state.draft);
    saved.current = JSON.stringify(state.draft);
  }, [state, draft]);

  const pending = draft !== null && JSON.stringify(draft) !== saved.current;

  // Guardado automático del borrador. Es seguro porque el borrador no es
  // público: lo que decide qué ve la gente es «Publicar», nunca esto.
  useEffect(() => {
    if (!draft || !canEdit || !pending) return;
    const json = JSON.stringify(draft);
    const timer = window.setTimeout(() => {
      save.mutate(draft, {
        onSuccess: () => {
          saved.current = json;
          setError("");
        },
        onError: (saveError) =>
          setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el borrador."),
      });
    }, 900);
    return () => window.clearTimeout(timer);
    // `save` es estable entre renders; incluirlo reiniciaría el temporizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, canEdit, pending]);

  // Cerrar la pestaña con algo sin guardar cuesta el trabajo de un rato.
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changes = useMemo(
    () => (draft && state?.published ? pageChanges(state.published, draft) : []),
    [draft, state?.published],
  );

  const patch = (change: (page: OfficePage) => OfficePage) =>
    setDraft((currentDraft) => (currentDraft ? change(currentDraft) : currentDraft));

  const stationProps: OfficeStationProps | null = draft
    ? { draft, patch, canEdit, notify: setNotice, fail: setError }
    : null;

  return (
    <AdminShell
      section="office"
      kicker="Página de la oficina"
      title={current.label}
      description={current.hint}
      actions={
        <>
          <SaveState pending={pending} saving={save.isPending} missing={state?.missing} canEdit={canEdit} />
          <a className="button-secondary" href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={15} /> Ver la portada
          </a>
          {canEdit && station !== "publicacion" && (
            <button className="button-primary" type="button" onClick={() => navigate("/admin/pagina/publicacion")}>
              Revisar y publicar
              {state?.published && changes.length > 0 && <b className="ofa-count">{changes.length}</b>}
            </button>
          )}
        </>
      }
    >
      {!hasRole("planeacion") && (
        <ReadOnlyNotice>
          Tu rol consulta la página de la oficina; para escribirla hace falta capacidad de Planeación.
        </ReadOnlyNotice>
      )}

      {state?.missing && (
        <p className="oda-banner" role="note">
          <Icon name="alert" size={16} />
          <span>
            <strong>La base todavía no guarda esta página.</strong> Falta la migración{" "}
            <code>0050_pagina_de_la_oficina.sql</code>. Mientras tanto se puede mirar el contenido de origen, pero
            no guardar ni publicar, y el portal sigue mostrando lo que trae el código.
          </span>
        </p>
      )}

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      )}

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      {query.isPending ? (
        <LoadingBlock rows={6} label="Cargando la página de la oficina" />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : !stationProps || !state ? null : (
        <>
          <StationBar station={station} draft={stationProps.draft} published={state.published} changes={changes} />

          <div className="oda-workspace ofa-workspace" data-station={station}>
            <section className="oda-stage" aria-label={current.label}>
              {station === "portada" && <HomeStation {...stationProps} />}
              {station === "galeria" && <GalleryStation {...stationProps} />}
              {station === "equipo" && <TeamStation {...stationProps} />}
              {station === "oficina" && <OfficeStation {...stationProps} />}
              {station === "publicacion" && (
                <PublishStation
                  {...stationProps}
                  changes={changes}
                  published={state.published}
                  publishedAt={state.publishedAt}
                  pending={pending || save.isPending}
                  publishing={publish.isPending}
                  onPublish={() =>
                    publish.mutate(stationProps.draft, {
                      onSuccess: () => {
                        saved.current = JSON.stringify(stationProps.draft);
                        setError("");
                        setNotice("La página está publicada. El portal ya muestra estos cambios.");
                      },
                      onError: (publishError) =>
                        setError(
                          publishError instanceof Error ? publishError.message : "No se pudo publicar la página.",
                        ),
                    })
                  }
                />
              )}
            </section>

            {station !== "publicacion" && <Preview station={station} page={stationProps.draft} />}
          </div>
        </>
      )}
    </AdminShell>
  );
}

/* --- El estado del guardado ------------------------------------------------------------ */

function SaveState({
  pending,
  saving,
  missing,
  canEdit,
}: {
  pending: boolean;
  saving: boolean;
  missing?: boolean;
  canEdit: boolean;
}) {
  if (missing || !canEdit) return null;
  if (saving) {
    return (
      <span className="oda-save" data-state="saving">
        <span className="oda-save__spinner" aria-hidden="true" />
        Guardando el borrador…
      </span>
    );
  }
  if (pending) {
    return (
      <span className="oda-save">
        <Icon name="clock" size={14} />
        Cambios sin guardar
      </span>
    );
  }
  return (
    <span className="oda-save" data-state="ok">
      <Icon name="check" size={14} />
      Borrador guardado
    </span>
  );
}

/* --- La barra de estaciones ------------------------------------------------------------ */

function StationBar({
  station,
  draft,
  published,
  changes,
}: {
  station: OfficeStationId;
  draft: OfficePage;
  published: OfficePage | null;
  changes: ReturnType<typeof pageChanges>;
}) {
  const slides = draft.gallery.slides;
  const withoutAlt = slides.filter((item) => !item.alt).length;
  const people = draft.team.people;
  const withPhoto = people.filter((person) => person.photo).length;
  const withFile = people.filter(
    (person) => person.bio || person.education.length || person.links.length || person.email,
  ).length;

  const summary: Record<OfficeStationId, { value: string; detail: string; state: "ok" | "pendiente" | "vacio" }> = {
    portada: {
      value: draft.home.title ? "Escrita" : "Sin titular",
      detail: !draft.home.lede
        ? "falta la entradilla"
        : draft.home.lede.length > LEDE_COMFORT
          ? `entradilla larga: ${draft.home.lede.length} caracteres`
          : "titular, entradilla y portales",
      state: draft.home.title && draft.home.lede ? "ok" : "pendiente",
    },
    galeria: {
      value: slides.length ? plural(slides.length, "fotografía", "fotografías") : "Sin fotos",
      detail: slides.length
        ? withoutAlt
          ? `${plural(withoutAlt, "sin texto alternativo", "sin texto alternativo")}`
          : "todas con texto alternativo"
        : "la franja no aparece en la portada",
      state: !slides.length ? "vacio" : withoutAlt ? "pendiente" : "ok",
    },
    equipo: {
      value: people.length ? plural(people.length, "persona", "personas") : "Sin equipo",
      detail: people.length
        ? `${withPhoto} con foto · ${withFile} con ficha`
        : "la franja no aparece en la portada",
      state: !people.length ? "vacio" : withPhoto === people.length && withFile === people.length ? "ok" : "pendiente",
    },
    oficina: {
      value: `${plural(draft.areas.length, "área", "áreas")} · ${plural(draft.links.length, "acceso", "accesos")}`,
      detail: draft.office.email || "falta el correo de contacto",
      state: draft.office.purpose && draft.office.email ? "ok" : "pendiente",
    },
    publicacion: {
      value: !published ? "Sin publicar" : changes.length ? plural(changes.length, "cambio", "cambios") : "Al día",
      detail: !published ? "el portal muestra el contenido de origen" : "desde la última publicación",
      state: !published ? "vacio" : changes.length ? "pendiente" : "ok",
    },
  };

  return (
    <nav className="oda-stations ofa-stations" aria-label="Estaciones de la página de la oficina">
      <ol>
        {OFFICE_STATIONS.map((item) => {
          const info = summary[item.id];
          return (
            <li key={item.id}>
              <NavLink
                to={`/admin/pagina/${item.id}`}
                className="oda-station"
                aria-current={item.id === station ? "step" : undefined}
                data-state={info.state}
              >
                <span className="oda-station__number" aria-hidden="true">
                  {info.state === "ok" ? <Icon name="check" size={14} /> : item.number}
                </span>
                <span className="oda-station__text">
                  <span className="oda-station__label">{item.label}</span>
                  <span className="oda-station__value">{info.value}</span>
                  <span className="oda-station__detail">{info.detail}</span>
                </span>
              </NavLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
