/* =============================================================================
   Portal de Planeación · el contenido de la página, como documento.

   La portada y la página del equipo son una sola pieza editorial: titular,
   galería, equipo, áreas, accesos y contacto. Aquí vive su forma, su valor por
   defecto y la lectura de lo publicado.

   Dos fuentes, en este orden:
     1. La base (`office_page`, migración 0050), fila «publicado».
     2. `content.ts`, el archivo de siempre.
   La segunda no es un apaño: mientras la oficina no haya publicado nada —o si
   la base no responde— el portal sigue mostrando exactamente lo que mostraba
   antes. Una página institucional no puede quedarse en blanco porque falle una
   consulta.

   Todo lo que llega de la base pasa por `normalizePage`: un documento jsonb no
   tiene esquema, así que se comprueba campo a campo. Un texto que no es texto
   se descarta; una persona sin nombre no se publica; una foto sin texto
   alternativo se admite, pero la intranet lo señala.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { AREAS, OFFICE, OFFICE_LINKS, TEAM } from "./content";

export const OFFICE_BUCKET = "oficina";

/** Caché de lo publicado. La intranet la invalida al publicar. */
export const officePageKey = ["office-page", "publicado"] as const;

/* --- El documento ------------------------------------------------------------------- */

export interface OfficeIdentity {
  name: string;
  university: string;
  email: string;
  phone: string;
  address: string;
  purpose: string;
}

export interface OfficeAreaItem {
  id: string;
  name: string;
  does: string;
  to: string;
  toLabel: string;
}

export interface OfficeLinkItem {
  id: string;
  label: string;
  hint: string;
  to: string;
}

export interface GallerySlide {
  id: string;
  /** Ruta dentro del bucket «oficina», o una ruta de /public, o una URL. */
  photo: string;
  /** Qué se ve, para quien no ve la foto. Obligatorio antes de publicar. */
  alt: string;
  title: string;
  caption: string;
  to: string;
  toLabel: string;
}

export interface TeamLink {
  label: string;
  url: string;
}

export interface TeamPerson {
  id: string;
  name: string;
  role: string;
  /** Id de un área de `areas`. Vacío: la persona va al final, sin área. */
  area: string;
  email: string;
  photo: string;
  /** Una línea: en qué anda ahora. Se ve en la tarjeta, sin abrir la ficha. */
  focus: string;
  /** El párrafo de la ficha. */
  bio: string;
  /** Formación, una por línea. */
  education: string[];
  links: TeamLink[];
}

export interface OfficePage {
  version: 1;
  office: OfficeIdentity;
  home: { title: string; lede: string; portalsTitle: string; portalsLede: string; closingTitle: string };
  gallery: { title: string; lede: string; slides: GallerySlide[] };
  team: { title: string; lede: string; people: TeamPerson[] };
  areas: OfficeAreaItem[];
  links: OfficeLinkItem[];
  teamPage: { title: string; lede: string; contactTitle: string; contactBody: string };
}

/* --- Valores por defecto: el archivo de siempre --------------------------------------- */

export const DEFAULT_PAGE: OfficePage = {
  version: 1,
  office: {
    name: OFFICE.name,
    university: OFFICE.university,
    email: OFFICE.email,
    phone: "",
    address: OFFICE.address,
    purpose: OFFICE.purpose,
  },
  home: {
    title: "La universidad, medida y planeada a la vista de todos.",
    lede: "Planeación Institucional reúne el Plan de Desarrollo, las cifras oficiales de la UDES, el Observatorio de Analítica y los boletines en un solo lugar.",
    portalsTitle: "Nuestros portales",
    portalsLede:
      "Cada portal responde una pregunta distinta sobre la universidad. Todos se alimentan desde la intranet de Planeación.",
    closingTitle: "Planear con datos, rendir cuentas con ellos.",
  },
  gallery: {
    title: "La oficina por dentro",
    lede: "Mesas de trabajo, cierres de corte y jornadas con las facultades y los campus.",
    slides: [],
  },
  team: {
    title: "Quiénes lo hacen",
    lede: "El equipo que planea, mide y acompaña a cada oficina de la universidad.",
    people: TEAM.map((person, index) => ({
      id: `p${index + 1}`,
      name: person.name,
      role: person.role,
      area: person.area,
      email: person.email ?? "",
      photo: person.photo ?? "",
      focus: person.focus ?? "",
      bio: person.bio ?? "",
      education: person.education ?? [],
      links: person.links ?? [],
    })),
  },
  areas: AREAS.map((area) => ({
    id: area.id,
    name: area.name,
    does: area.does,
    to: area.to ?? "",
    toLabel: area.toLabel ?? "",
  })),
  links: OFFICE_LINKS.map((link, index) => ({ id: `l${index + 1}`, label: link.label, hint: link.hint, to: link.to })),
  teamPage: {
    title: "La oficina",
    lede: OFFICE.purpose,
    contactTitle: "Escríbenos",
    contactBody:
      "¿Necesitas una cifra que no está publicada, un soporte del plan o acompañamiento para tu oficina? Escribe a la oficina y te respondemos con la fuente.",
  },
};

/* --- Normalización -------------------------------------------------------------------- */

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Identificador corto y estable para una fila nueva del editor. */
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function area(raw: unknown, index: number): OfficeAreaItem | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name);
  if (!name) return null;
  return {
    id: text(raw.id) || `a${index + 1}`,
    name,
    does: text(raw.does),
    to: text(raw.to),
    toLabel: text(raw.toLabel),
  };
}

function link(raw: unknown, index: number): OfficeLinkItem | null {
  if (!isObject(raw)) return null;
  const label = text(raw.label);
  if (!label) return null;
  return { id: text(raw.id) || `l${index + 1}`, label, hint: text(raw.hint), to: text(raw.to) };
}

function slide(raw: unknown, index: number): GallerySlide | null {
  if (!isObject(raw)) return null;
  const photo = text(raw.photo);
  if (!photo) return null;
  return {
    id: text(raw.id) || `g${index + 1}`,
    photo,
    alt: text(raw.alt),
    title: text(raw.title),
    caption: text(raw.caption),
    to: text(raw.to),
    toLabel: text(raw.toLabel),
  };
}

function person(raw: unknown, index: number): TeamPerson | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name);
  // Sin nombre no hay persona: el marcador de una fila a medio llenar no se publica.
  if (!name) return null;
  return {
    id: text(raw.id) || `p${index + 1}`,
    name,
    role: text(raw.role),
    area: text(raw.area),
    email: text(raw.email),
    photo: text(raw.photo),
    focus: text(raw.focus),
    bio: text(raw.bio),
    education: list(raw.education).map((line) => text(line)).filter(Boolean),
    links: list(raw.links)
      .map((item) => (isObject(item) ? { label: text(item.label), url: text(item.url) } : null))
      .filter((item): item is TeamLink => Boolean(item && item.label && item.url)),
  };
}

/**
 * Un documento de la base convertido en `OfficePage`.
 *
 * Cada rama cae al valor por defecto, no a una cadena vacía: si mañana se
 * añade un campo al modelo, los documentos ya guardados siguen dibujando la
 * página completa en lugar de dejar un hueco.
 */
export function normalizePage(raw: unknown): OfficePage {
  if (!isObject(raw)) return DEFAULT_PAGE;
  const office = isObject(raw.office) ? raw.office : {};
  const home = isObject(raw.home) ? raw.home : {};
  const gallery = isObject(raw.gallery) ? raw.gallery : {};
  const team = isObject(raw.team) ? raw.team : {};
  const teamPage = isObject(raw.teamPage) ? raw.teamPage : {};

  const areas = list(raw.areas)
    .map(area)
    .filter((item): item is OfficeAreaItem => item !== null);
  const links = list(raw.links)
    .map(link)
    .filter((item): item is OfficeLinkItem => item !== null);

  return {
    version: 1,
    office: {
      name: text(office.name, DEFAULT_PAGE.office.name) || DEFAULT_PAGE.office.name,
      university: text(office.university, DEFAULT_PAGE.office.university) || DEFAULT_PAGE.office.university,
      email: text(office.email, DEFAULT_PAGE.office.email) || DEFAULT_PAGE.office.email,
      phone: text(office.phone),
      address: text(office.address),
      purpose: text(office.purpose, DEFAULT_PAGE.office.purpose) || DEFAULT_PAGE.office.purpose,
    },
    home: {
      title: text(home.title, DEFAULT_PAGE.home.title) || DEFAULT_PAGE.home.title,
      lede: text(home.lede, DEFAULT_PAGE.home.lede) || DEFAULT_PAGE.home.lede,
      portalsTitle: text(home.portalsTitle, DEFAULT_PAGE.home.portalsTitle) || DEFAULT_PAGE.home.portalsTitle,
      portalsLede: text(home.portalsLede, DEFAULT_PAGE.home.portalsLede) || DEFAULT_PAGE.home.portalsLede,
      closingTitle: text(home.closingTitle, DEFAULT_PAGE.home.closingTitle) || DEFAULT_PAGE.home.closingTitle,
    },
    gallery: {
      title: text(gallery.title, DEFAULT_PAGE.gallery.title) || DEFAULT_PAGE.gallery.title,
      lede: text(gallery.lede),
      slides: list(gallery.slides)
        .map(slide)
        .filter((item): item is GallerySlide => item !== null),
    },
    team: {
      title: text(team.title, DEFAULT_PAGE.team.title) || DEFAULT_PAGE.team.title,
      lede: text(team.lede),
      people: list(team.people)
        .map(person)
        .filter((item): item is TeamPerson => item !== null),
    },
    areas,
    links,
    teamPage: {
      title: text(teamPage.title, DEFAULT_PAGE.teamPage.title) || DEFAULT_PAGE.teamPage.title,
      lede: text(teamPage.lede, DEFAULT_PAGE.teamPage.lede) || DEFAULT_PAGE.teamPage.lede,
      contactTitle: text(teamPage.contactTitle, DEFAULT_PAGE.teamPage.contactTitle) || DEFAULT_PAGE.teamPage.contactTitle,
      contactBody: text(teamPage.contactBody, DEFAULT_PAGE.teamPage.contactBody) || DEFAULT_PAGE.teamPage.contactBody,
    },
  };
}

/* --- Fotos ---------------------------------------------------------------------------- */

/**
 * La dirección de una foto.
 *
 * El campo guarda una ruta del bucket («equipo/1699-ana.webp»), pero también
 * admite una ruta de `/public` o una URL completa: así una foto que ya estaba
 * en el repositorio sigue funcionando sin migrarla al bucket.
 */
export function officePhotoUrl(photo: string | null | undefined): string | null {
  const value = (photo ?? "").trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:")) return value;
  return supabase.storage.from(OFFICE_BUCKET).getPublicUrl(value).data.publicUrl;
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

/* --- Lectura pública ------------------------------------------------------------------ */

/** La base todavía sin la migración 0050, o sin red: no es un error que mostrar. */
const MISSING = new Set(["PGRST205", "42P01"]);

export interface PublishedPage {
  page: OfficePage;
  /** De dónde salió lo que se está viendo. */
  source: "publicado" | "defecto";
  publishedAt: string | null;
}

async function fetchPublished(): Promise<PublishedPage> {
  const { data, error } = await supabase
    .from("office_page")
    .select("content,updated_at")
    .eq("state", "publicado")
    .maybeSingle();

  if (error) {
    if (!MISSING.has(error.code ?? "")) console.warn("Página de la oficina: no se pudo leer lo publicado", error);
    return { page: DEFAULT_PAGE, source: "defecto", publishedAt: null };
  }
  if (!data) return { page: DEFAULT_PAGE, source: "defecto", publishedAt: null };

  return {
    page: normalizePage((data as { content: unknown }).content),
    source: "publicado",
    publishedAt: (data as { updated_at: string | null }).updated_at,
  };
}

/** El respaldo es una constante y no un objeto nuevo en cada render: el índice
 *  del buscador depende de esta identidad para no recalcularse sin motivo. */
const FALLBACK: PublishedPage = { page: DEFAULT_PAGE, source: "defecto", publishedAt: null };

/** Lo que ve el público. Nunca falla: cae al contenido del archivo. */
export function useOfficePage(): PublishedPage {
  const query = useQuery({ queryKey: officePageKey, queryFn: fetchPublished, staleTime: 60_000 });
  return query.data ?? FALLBACK;
}

/* --- Comparar borrador y publicado ---------------------------------------------------- */

export interface PageChange {
  /** La estación donde se edita, para poder ir allí. */
  station: "portada" | "galeria" | "equipo" | "oficina";
  what: string;
  detail: string;
}

const countLabel = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function compareText(
  out: PageChange[],
  station: PageChange["station"],
  what: string,
  before: string,
  after: string,
) {
  if (before === after) return;
  if (!before) out.push({ station, what, detail: "se añade" });
  else if (!after) out.push({ station, what, detail: "se deja en blanco" });
  else out.push({ station, what, detail: "cambia" });
}

function compareRows<T extends { id: string }>(
  out: PageChange[],
  station: PageChange["station"],
  one: string,
  many: string,
  before: T[],
  after: T[],
) {
  const seen = new Map(before.map((row) => [row.id, row] as const));
  const added = after.filter((row) => !seen.has(row.id));
  const removed = before.filter((row) => !after.some((other) => other.id === row.id));
  const edited = after.filter((row) => {
    const old = seen.get(row.id);
    return old && JSON.stringify(old) !== JSON.stringify(row);
  });
  const orderChanged =
    added.length === 0 &&
    removed.length === 0 &&
    before.map((row) => row.id).join("|") !== after.map((row) => row.id).join("|");

  if (added.length) out.push({ station, what: `${countLabel(added.length, one, many)}`, detail: "se añade" });
  if (removed.length) out.push({ station, what: `${countLabel(removed.length, one, many)}`, detail: "se quita" });
  if (edited.length) out.push({ station, what: `${countLabel(edited.length, one, many)}`, detail: "cambia" });
  if (orderChanged) out.push({ station, what: `El orden de ${many}`, detail: "cambia" });
}

/** Qué cambiaría al publicar. Vacía si el borrador y lo publicado coinciden. */
export function pageChanges(published: OfficePage, draft: OfficePage): PageChange[] {
  const out: PageChange[] = [];

  compareText(out, "portada", "El titular de la portada", published.home.title, draft.home.title);
  compareText(out, "portada", "La entradilla de la portada", published.home.lede, draft.home.lede);
  compareText(out, "portada", "El encabezado de los portales", published.home.portalsTitle, draft.home.portalsTitle);
  compareText(out, "portada", "La bajada de los portales", published.home.portalsLede, draft.home.portalsLede);
  compareText(out, "oficina", "El titular del cierre", published.home.closingTitle, draft.home.closingTitle);

  compareText(out, "galeria", "El título de la galería", published.gallery.title, draft.gallery.title);
  compareText(out, "galeria", "La bajada de la galería", published.gallery.lede, draft.gallery.lede);
  compareRows(out, "galeria", "fotografía", "fotografías", published.gallery.slides, draft.gallery.slides);

  compareText(out, "equipo", "El título del equipo", published.team.title, draft.team.title);
  compareText(out, "equipo", "La bajada del equipo", published.team.lede, draft.team.lede);
  compareRows(out, "equipo", "persona", "personas", published.team.people, draft.team.people);

  compareText(out, "oficina", "El propósito de la oficina", published.office.purpose, draft.office.purpose);
  compareText(out, "oficina", "El correo de contacto", published.office.email, draft.office.email);
  compareText(out, "oficina", "El teléfono", published.office.phone, draft.office.phone);
  compareText(out, "oficina", "La dirección", published.office.address, draft.office.address);
  compareRows(out, "oficina", "área", "áreas", published.areas, draft.areas);
  compareRows(out, "oficina", "acceso", "accesos", published.links, draft.links);
  compareText(out, "oficina", "El título de la página del equipo", published.teamPage.title, draft.teamPage.title);
  compareText(out, "oficina", "La entradilla de la página del equipo", published.teamPage.lede, draft.teamPage.lede);
  compareText(out, "oficina", "El título del contacto", published.teamPage.contactTitle, draft.teamPage.contactTitle);
  compareText(out, "oficina", "El texto del contacto", published.teamPage.contactBody, draft.teamPage.contactBody);

  return out;
}
