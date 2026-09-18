/* =============================================================================
   Menú ampliado de la barra unificada (propuesta B · plano de navegación).

   Tres columnas:
   · Portales: Plan de Desarrollo, UDES en Cifras y Observatorio. Pasar el
     cursor o el foco por uno cambia el contenido sin cerrar el menú.
   · Destinos del portal: pictograma, nombre, una línea de qué contiene y su
     código o color. Nunca solo el color.
   · Destacado: al pasar el cursor (o el foco) por un destino, su cifra real
     —la titular del informe, el avance del pilar, la cifra publicada del
     tema— con su año y su alcance.

   Se carga al abrir el menú por primera vez: las páginas no pagan estas
   consultas si nadie lo abre. En móvil el mismo contenido va en acordeón,
   sin la columna de destacado.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { usePillars, useSummary } from "../../data/queries";
import { formatValue, keyIndicators, useOpenDataCatalog } from "../../modules/datos-abiertos/data/open-data";
import type { OpenDataCatalog, Report } from "../../modules/datos-abiertos/data/types";
import { OBS_TOPICS } from "../../modules/datos-abiertos/observatorio/data";
import { summarize, useObservatoryLive } from "../../modules/datos-abiertos/observatorio/live";
import { latestFigure } from "../../modules/planeacion/search-index";
import { Pictogram, REPORT_PICTOGRAM, TOPIC_PICTOGRAM } from "./pictograms";
import type { PictogramName } from "./pictograms";

export type PortalId = "pdi" | "cifras" | "observatorio";

export const PORTAL_INFO: Record<PortalId, { label: string; pictogram: PictogramName; all: { label: string; to: string } }> = {
  pdi: { label: "Plan de Desarrollo", pictogram: "flag", all: { label: "Ir al Portal PDI", to: "/pdi" } },
  cifras: { label: "UDES en Cifras", pictogram: "bars", all: { label: "Ver el tablero de informes", to: "/datos-abiertos" } },
  observatorio: { label: "Observatorio", pictogram: "trend", all: { label: "Ver las 14 páginas", to: "/datos-abiertos/observatorio" } },
};

interface Detail {
  title: string;
  eyebrow: string;
  figure?: { value: string; unit: string; label: string; when: string };
  progress?: number;
  text?: string;
  sample?: boolean;
  cta: string;
}

export interface MenuItem {
  id: string;
  to: string;
  name: string;
  hint: string;
  pictogram: PictogramName;
  /** Color del distintivo (variable CSS). */
  tone: string;
  code?: string;
  detail: Detail;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MONEY = /dinero|peso|\$|millones|presupuest/i;

/** El ícono de cada pilar (tabla pillars) en la señalética del menú. */
const PILLAR_PICTOGRAM: Record<string, PictogramName> = {
  person: "people",
  chip: "grid",
  spark: "rays",
  columns: "building",
  leaf: "leaf",
  community: "circles",
};
const PDI_PAGES: { to: string; name: string; hint: string; pictogram: PictogramName; progress?: boolean }[] = [
  { to: "/pdi", name: "Inicio del PDI", hint: "El plan de un vistazo", pictogram: "home", progress: true },
  { to: "/implementacion", name: "Implementación", hint: "Avance de pilares, áreas y proyectos", pictogram: "bars", progress: true },
  { to: "/tablero", name: "Tablero PDI", hint: "Cumplimiento global y por pilar", pictogram: "grid", progress: true },
  { to: "/facultades", name: "PDI por facultad", hint: "Propuestas y alineación con el plan", pictogram: "cap" },
  { to: "/campus", name: "PDI por campus", hint: "Bucaramanga, Cúcuta y Valledupar", pictogram: "pin" },
  { to: "/ods", name: "PDI y los ODS", hint: "Aporte a la Agenda 2030", pictogram: "globe" },
  { to: "/desarrollo-tecnologico", name: "Desarrollo tecnológico", hint: "Aplicativos de la oficina", pictogram: "code" },
];

/** La cifra que representa un informe: la titular, si no la primera clave, si no la primera con dato. */
function reportFigure(report: Report, catalog: OpenDataCatalog) {
  const candidates = [...report.indicators.filter((i) => i.isHeadline), ...keyIndicators(report), ...report.indicators].filter(
    (i) => !MONEY.test(i.unit) && !MONEY.test(i.label),
  );
  for (const indicator of candidates) {
    const f = latestFigure(indicator, catalog);
    if (f) return { ...f, label: indicator.label };
  }
  return undefined;
}

/** Los grupos de cada portal, con su detalle ya calculado. */
function useMenu(portal: PortalId): { groups: MenuGroup[]; loading: boolean } {
  const pillars = usePillars();
  const summary = useSummary();
  const catalog = useOpenDataCatalog();
  const live = useObservatoryLive();

  return useMemo(() => {
    if (portal === "pdi") {
      const progress = summary.data?.progress;
      const pages: MenuItem[] = PDI_PAGES.map((p) => ({
        id: p.to,
        to: p.to,
        name: p.name,
        hint: p.hint,
        pictogram: p.pictogram,
        tone: "var(--brand-blue)",
        detail: {
          title: p.name,
          eyebrow: "Plan de Desarrollo 2024–2028",
          figure: p.progress && progress !== undefined ? { value: `${formatValue(progress, "decimal")} %`, unit: "", label: "Avance del plan", when: "todos los pilares" } : undefined,
          progress: p.progress ? progress : undefined,
          text: p.hint,
          cta: `Abrir ${p.name.toLowerCase()}`,
        },
      }));
      const pillarItems: MenuItem[] = (pillars.data ?? []).map((pl) => ({
        id: pl.id,
        to: `/implementacion/pilar/${pl.slug}`,
        name: pl.name,
        hint: pl.management_owner || `Pilar ${pl.numeral}`,
        pictogram: PILLAR_PICTOGRAM[pl.icon] ?? "flag",
        tone: `var(--pillar-${pl.accent_slot})`,
        code: `P${pl.position || pl.numeral}`,
        detail: {
          title: pl.name,
          eyebrow: `Pilar ${pl.numeral}`,
          figure: { value: `${formatValue(pl.progress.progress, "decimal")} %`, unit: "", label: "Avance del pilar", when: `${pl.progress.total} indicadores` },
          progress: pl.progress.progress,
          text: pl.focus || pl.description,
          cta: "Abrir el pilar",
        },
      }));
      return {
        groups: [
          { title: "Accesos rápidos", items: pages },
          { title: "Pilares", items: pillarItems },
        ],
        loading: pillars.isPending,
      };
    }

    if (portal === "cifras") {
      const cat = catalog.data;
      const items: MenuItem[] = (cat?.reports ?? []).map((r) => {
        const f = cat ? reportFigure(r, cat) : undefined;
        return {
          id: r.slug,
          to: `/datos-abiertos/${r.slug}`,
          name: r.name,
          hint: r.summary,
          pictogram: REPORT_PICTOGRAM[r.slug] ?? "bars",
          tone: `var(--od-line-${r.line})`,
          code: r.code,
          detail: { title: r.name, eyebrow: "UDES en Cifras", figure: f, text: r.summary, cta: "Abrir el informe" },
        };
      });
      return { groups: [{ title: "Informes", items }], loading: catalog.isPending };
    }

    const items: MenuItem[] = OBS_TOPICS.map((t) => {
      const published = live.data?.get(t.slug);
      const s = published ? summarize(published) : null;
      return {
        id: t.slug,
        to: `/datos-abiertos/observatorio/${t.slug}`,
        name: t.name,
        hint: t.summary,
        pictogram: TOPIC_PICTOGRAM[t.slug] ?? "trend",
        tone: `var(--od-line-${t.line})`,
        code: t.code,
        detail: {
          title: t.name,
          eyebrow: "Observatorio de Analítica",
          figure: s
            ? { value: `${formatValue(s.value, s.format)}${s.format === "porcentaje" ? " %" : ""}`, unit: s.format === "porcentaje" ? "" : s.unit, label: s.label, when: "datos publicados" }
            : undefined,
          text: t.question,
          sample: !published,
          cta: "Abrir la página",
        },
      };
    });
    return { groups: [{ title: "Temas", items }], loading: live.isPending };
  }, [portal, pillars.data, pillars.isPending, summary.data, catalog.data, catalog.isPending, live.data, live.isPending]);
}

/* --- Escritorio ------------------------------------------------------------------------ */

export default function MegaPanel({
  portal,
  setPortal,
  onNavigate,
  mode,
}: {
  portal: PortalId;
  setPortal: (p: PortalId) => void;
  onNavigate: () => void;
  mode: "desktop" | "mobile";
}) {
  if (mode === "mobile") return <MobileMenu onNavigate={onNavigate} />;
  return <DesktopPanel portal={portal} setPortal={setPortal} onNavigate={onNavigate} />;
}

function DesktopPanel({ portal, setPortal, onNavigate }: { portal: PortalId; setPortal: (p: PortalId) => void; onNavigate: () => void }) {
  const { groups, loading } = useMenu(portal);
  const [hovered, setHovered] = useState<string | null>(null);
  const items = groups.flatMap((g) => g.items);
  const active = items.find((i) => i.id === hovered) ?? items[0];
  const info = PORTAL_INFO[portal];
  const [pictos, setPictos] = useState(() => readPictos());

  return (
    <div className="sh-panel__grid" data-pictos={pictos ? "on" : "off"} data-portal={portal}>
      <nav className="sh-rail" aria-label="Portales">
        <span className="sh-rail__label">Portales</span>
        {(Object.keys(PORTAL_INFO) as PortalId[]).map((id) => (
          <button
            key={id}
            type="button"
            className="sh-rail__item"
            aria-pressed={portal === id}
            onPointerEnter={() => {
              setPortal(id);
              setHovered(null);
            }}
            onFocus={() => {
              setPortal(id);
              setHovered(null);
            }}
            onClick={() => setPortal(id)}
          >
            <span className="sh-rail__icon" data-portal={id}>
              <Pictogram name={PORTAL_INFO[id].pictogram} size={22} />
            </span>
            <span>
              <b>{PORTAL_INFO[id].label}</b>
              <small>{id === "pdi" ? "Pilares y páginas del plan" : id === "cifras" ? "Informes oficiales" : "Temas para explorar"}</small>
            </span>
          </button>
        ))}
        <div className="sh-rail__aids">
          <button
            type="button"
            aria-pressed={pictos}
            onClick={() => {
              setPictos(!pictos);
              writePictos(!pictos);
            }}
          >
            <Pictogram name="grid" size={18} strokeWidth={2} /> Pictogramas
          </button>
        </div>
      </nav>

      <div className="sh-list">
        <div className="sh-list__head">
          <h2>{info.label}</h2>
          <Link to={info.all.to} onClick={onNavigate}>
            {info.all.label} <Icon name="arrow-right" size={15} />
          </Link>
        </div>
        {loading && !items.length ? (
          <p className="sh-list__loading">Cargando…</p>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="sh-list__group">
              {groups.length > 1 && <span className="sh-list__title">{group.title}</span>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      className="sh-item"
                      data-active={item.id === active?.id || undefined}
                      style={{ "--tone": item.tone } as CSSProperties}
                      onPointerEnter={() => setHovered(item.id)}
                      onFocus={() => setHovered(item.id)}
                      onClick={onNavigate}
                    >
                      <span className="sh-item__picto">
                        <Pictogram name={item.pictogram} size={22} />
                      </span>
                      <span className="sh-item__text">
                        <b>{item.name}</b>
                        <small>{item.hint}</small>
                      </span>
                      {item.code && <span className="sh-item__code">{item.code}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <aside className="sh-detail" aria-live="polite" aria-label="Detalle destacado">
        <span className="sh-detail__label">{portal === "pdi" ? "Avance" : "Cifra destacada"}</span>
        {active && <DetailCard key={active.id} item={active} onNavigate={onNavigate} />}
      </aside>

      <footer className="sh-panel__foot">
        <span>Pasa el cursor por un destino para ver su cifra · Tab para moverte · Esc para cerrar</span>
        <span>Pictograma, color y código siempre juntos</span>
      </footer>
    </div>
  );
}

function DetailCard({ item, onNavigate }: { item: MenuItem; onNavigate: () => void }) {
  const d = item.detail;
  return (
    <Link to={item.to} className="sh-card" style={{ "--tone": item.tone } as CSSProperties} onClick={onNavigate}>
      <span className="sh-card__top">
        {item.code ? <span className="sh-card__code">{item.code}</span> : <span className="sh-card__picto"><Pictogram name={item.pictogram} size={18} /></span>}
        <span>{d.eyebrow}</span>
      </span>
      <b className="sh-card__title">{d.title}</b>
      {d.figure ? (
        <span className="sh-card__figure">
          <b>
            {d.figure.value}
            {d.figure.unit && <small> {d.figure.unit}</small>}
          </b>
          <span>{d.figure.label}</span>
          <small>{d.figure.when}</small>
        </span>
      ) : (
        <span className="sh-card__figure sh-card__figure--none">
          <Pictogram name={item.pictogram} size={40} strokeWidth={1.4} />
        </span>
      )}
      {d.progress !== undefined && (
        <span className="sh-card__bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, Math.max(2, d.progress))}%` }} />
        </span>
      )}
      {d.text && <span className="sh-card__text">{d.text}</span>}
      {d.sample && <span className="sh-card__sample">Aún con datos de ejemplo</span>}
      <span className="sh-card__cta">
        {d.cta} <Icon name="arrow-right" size={15} />
      </span>
    </Link>
  );
}

/* --- Móvil: acordeón ------------------------------------------------------------------------ */

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const [openPortal, setOpenPortal] = useState<PortalId | null>(null);
  return (
    <div className="sh-mobile__portals">
      {(Object.keys(PORTAL_INFO) as PortalId[]).map((id) => (
        <div key={id} className="sh-acc">
          <button type="button" className="sh-acc__head" aria-expanded={openPortal === id} onClick={() => setOpenPortal(openPortal === id ? null : id)}>
            <span className="sh-rail__icon" data-portal={id}>
              <Pictogram name={PORTAL_INFO[id].pictogram} size={20} />
            </span>
            {PORTAL_INFO[id].label}
            <Icon name="chevron-down" size={16} />
          </button>
          {openPortal === id && <MobileList portal={id} onNavigate={onNavigate} />}
        </div>
      ))}
    </div>
  );
}

function MobileList({ portal, onNavigate }: { portal: PortalId; onNavigate: () => void }) {
  const { groups, loading } = useMenu(portal);
  const info = PORTAL_INFO[portal];
  return (
    <ul className="sh-acc__list">
      {loading && !groups.some((g) => g.items.length) && <li className="sh-list__loading">Cargando…</li>}
      {groups.flatMap((g) => g.items).map((item) => (
        <li key={item.id}>
          <Link to={item.to} className="sh-acc__item" style={{ "--tone": item.tone } as CSSProperties} onClick={onNavigate}>
            <span className="sh-item__picto">
              <Pictogram name={item.pictogram} size={18} />
            </span>
            <span>{item.name}</span>
            {/* Siempre presente: así los códigos quedan en columna aunque falte la cifra. */}
            <small>{item.detail.figure?.value ?? ""}</small>
            {item.code && <span className="sh-item__code">{item.code}</span>}
          </Link>
        </li>
      ))}
      <li>
        <Link to={info.all.to} className="sh-acc__all" onClick={onNavigate}>
          {info.all.label}
        </Link>
      </li>
    </ul>
  );
}

/* --- Preferencia de pictogramas ---------------------------------------------------------------- */

const PICTOS_KEY = "menu:pictogramas";
function readPictos() {
  try {
    return window.localStorage.getItem(PICTOS_KEY) !== "no";
  } catch {
    return true;
  }
}
function writePictos(on: boolean) {
  try {
    window.localStorage.setItem(PICTOS_KEY, on ? "si" : "no");
  } catch {
    /* Sin almacenamiento, la preferencia dura la visita. */
  }
}
