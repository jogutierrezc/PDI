/* =============================================================================
   Boletín UDES en Cifras · el documento A4.

   Orden fijo del documento:
   1. Portada: la imagen de la plantilla y, encima, la edición (periodo, y el
      informe si el boletín es de uno). Con una portada propia sin texto, el
      título, el subtítulo y la dependencia se escriben en vivo.
   2. Presentación y contenido: el resumen ejecutivo (si lo hay), cada capítulo
      con sus hojas y el número de página de cada una. Si el contenido no cabe
      bajo la presentación, sigue en páginas propias y todo lo demás se corre.
   3. Páginas de contenido: la cabecera de la plantilla, las unidades que caben,
      las pestañas de capítulo en el borde derecho y el pie.
   4. Contraportada: la imagen de la plantilla y las oficinas que reportan.

   Paginación por medición: las unidades se dibujan una vez fuera de pantalla,
   al ancho exacto del cuerpo, se miden cuando las fuentes ya cargaron (y las
   tablas anchas ya se ajustaron al margen) y se reparten en páginas sin partir
   ninguna. Un capítulo siempre abre página. Si una hoja no cabe en lo que queda
   pero su variante compacta sí, entra la compacta. Las continuaciones de una
   tabla larga son unidades propias pegadas a la anterior: así una tabla llena
   el final de una página y sigue en la siguiente.

   Navegación: cada entrada del contenido y cada pestaña de capítulo son
   enlaces internos (#cap-…, #u-…). Chrome los conserva al guardar como PDF, y
   en la web llevan a la página. Los títulos van en h2 (capítulos) y h3 (hojas)
   para que el PDF pueda armar sus marcadores.

   Pantalla o papel da igual: las páginas miden 210×297 mm. En pantalla se
   escalan con transform dentro de un marco del alto ya escalado; al imprimir,
   el marco desaparece y cada página es una hoja con la cabecera a sangre.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ALL_YEARS, cutLabel } from "../datos-abiertos/data/terms";
import type { OpenDataCatalog, Report } from "../datos-abiertos/data/types";
import { compose } from "./compose";
import type { Unit } from "./compose";
import { fitTables } from "./figures";
import { DEFAULT_IMAGES } from "./model";
import type { BulletinSettings } from "./model";
import { loadBulletinFont } from "./fonts";
import "./boletin.css";

interface BulletinDocumentProps {
  catalog: OpenDataCatalog;
  settings: BulletinSettings;
  /** Informe del boletín; sin él, es el boletín global. */
  report?: Report | null;
  /** Ancho disponible en pantalla, en px: las páginas se escalan para caber. */
  fitWidth?: number;
  /** Se llama cuando la paginación terminó (para imprimir). */
  onReady?: (pages: number) => void;
}

/** Un px CSS mide 1/96 de pulgada; un mm, 96/25.4 px. */
const MM = 96 / 25.4;
const PAGE_W = 210;
/** Alto útil del cuerpo de una página de contenido, en mm (ver boletin.css). */
const BODY_H = 297 - 27.5 - 10 - 16;
/** Separación entre unidades; una continuación de tabla va pegada. */
const GAP = 7;
const TIGHT_GAP = 2;

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => <p key={i}>{p}</p>);
}

/** Ancla de una unidad: el capítulo por su informe, el resto por su posición. */
const anchorOf = (unit: Unit, i: number) =>
  unit.kind === "capitulo" && unit.report ? `cap-${unit.report.slug}` : unit.kind === "resumen" ? "resumen" : `u-${i}`;

type TocEntry = {
  key: string;
  kind: "capitulo" | "seccion" | "hoja" | "resumen" | "cierre";
  label: string;
  unit?: number;
  report?: Report;
  href: string;
  /** Hoja dentro de una sección: va un escalón más adentro. */
  inSection?: boolean;
};

export function BulletinDocument({ catalog, settings, report, fitWidth, onReady }: BulletinDocumentProps) {
  const { units, chapters, offices } = useMemo(() => compose(catalog, settings), [catalog, settings]);
  const measure = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  /** Páginas: índices de unidad y si entran en su variante compacta. */
  /**
   * Paginación medida, con la firma del contenido para el que se midió. Si el
   * contenido cambia (otro formato, otro informe), la anterior se descarta hasta
   * volver a medir: sus índices apuntarían a unidades que ya no existen.
   */
  const [layout, setLayout] = useState<{
    signature: string;
    pages: { i: number; compact: boolean }[][];
    tocPages: number[][];
    tocDense: boolean;
  } | null>(null);


  // Entradas del contenido: resumen, capítulos, sus hojas (una vez cada una,
  // sin las continuaciones de una tabla larga) y la contraportada.
  const toc = useMemo(() => {
    const list: TocEntry[] = [];
    const seen = new Set<string>();
    units.forEach((unit, i) => {
      if (unit.kind === "resumen") {
        list.push({ key: unit.key, kind: "resumen", label: unit.title, unit: i, href: "#resumen" });
      } else if (unit.kind === "capitulo" && unit.report) {
        list.push({ key: unit.key, kind: "capitulo", label: unit.report.name, unit: i, report: unit.report, href: `#${anchorOf(unit, i)}` });
      } else if (unit.kind === "seccion") {
        list.push({ key: unit.key, kind: "seccion", label: unit.title, unit: i, report: unit.report, href: `#${anchorOf(unit, i)}` });
      } else if (!unit.tight) {
        const id = `${unit.report?.slug}|${unit.title}`;
        if (seen.has(id)) return;
        seen.add(id);
        list.push({ key: unit.key, kind: "hoja", label: unit.title, unit: i, href: `#${anchorOf(unit, i)}`, inSection: Boolean(unit.section) });
      }
    });
    list.push({ key: "contraportada", kind: "cierre", label: settings.texts.backTitle, href: "#contraportada" });
    return list;
  }, [units, settings.texts.backTitle]);

  const [fontReady, setFontReady] = useState(false);
  const signature = `${settings.theme.font}|${units.map((u) => u.key).join(",")}|${JSON.stringify(settings)}`;

  useEffect(() => {
    let alive = true;
    setFontReady(false);
    loadBulletinFont(settings.theme.font).finally(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, [settings.theme.font]);

  useLayoutEffect(() => {
    if (!fontReady || !measure.current) return;
    fitTables(measure.current);
    const heightOf = (i: number, variant: "full" | "compact") => {
      const node = measure.current!.querySelector<HTMLElement>(`:scope > [data-unit="${i}"][data-variant="${variant}"]`);
      return node ? node.getBoundingClientRect().height / MM : null;
    };
    const next: { i: number; compact: boolean }[][] = [];
    let current: { i: number; compact: boolean }[] = [];
    let used = 0;
    units.forEach((unit, i) => {
      const gap = current.length ? (unit.tight ? TIGHT_GAP : GAP) : 0;
      const full = heightOf(i, "full") ?? 0;
      const small = heightOf(i, "compact");
      const room = BODY_H - used - gap;
      let compact = false;
      if (current.length && !unit.breakBefore && full > room && small !== null && small <= room) compact = true;
      const h = compact ? small! : full;
      if (current.length && (unit.breakBefore || h > room)) {
        next.push(current);
        current = [];
        used = 0;
      }
      used += (current.length ? gap : 0) + h;
      current.push({ i, compact });
    });
    if (current.length) next.push(current);

    // Contenido: bajo la presentación caben las filas que deje libres; el resto
    // sigue en páginas con su propio encabezado.
    const introH = (measure.current.querySelector<HTMLElement>(":scope > [data-intro]")?.getBoundingClientRect().height ?? 0) / MM;
    const headH = (measure.current.querySelector<HTMLElement>(":scope > [data-toc-head]")?.getBoundingClientRect().height ?? 0) / MM;
    // El alto de una fila cuenta su margen superior: capítulos, resumen y cierre
    // se separan del anterior, y once filas de margen ya pisan el pie.
    const rowsOf = (selector: string) =>
      Array.from(measure.current!.querySelectorAll<HTMLElement>(`:scope > ${selector} > [data-toc]`)).map(
        (row) => (row.getBoundingClientRect().height + (parseFloat(getComputedStyle(row).marginTop) || 0)) / MM,
      );
    // 5 mm: la separación entre el encabezado y la lista dentro de la sección.
    const LIST_GAP = 5;
    const packToc = (rowH: number[]) => {
      const groups: number[][] = [];
      let group: number[] = [];
      let room = BODY_H - introH - LIST_GAP;
      rowH.forEach((h, index) => {
        if (group.length && h > room) {
          groups.push(group);
          group = [];
          room = BODY_H - headH - LIST_GAP;
        }
        group.push(index);
        room -= h;
      });
      groups.push(group);
      return groups;
    };
    const normalToc = packToc(rowsOf(".bol-toc:not([data-dense])"));
    // Si a la última página solo pasarían unas filas, se aprieta el índice para
    // ahorrar esa página, siempre que apretado sí quepa en menos.
    const denseToc = normalToc.length > 1 && normalToc[normalToc.length - 1].length <= 4 ? packToc(rowsOf(".bol-toc[data-dense]")) : null;
    const useDense = Boolean(denseToc && denseToc.length < normalToc.length);
    setLayout({ signature, pages: next, tocPages: useDense ? denseToc! : normalToc, tocDense: useDense });
    // La firma resume todo lo que cambia la medida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady, signature]);

  // Portada, presentación y contenido, hojas (o el aviso de vacío) y contraportada.
  const current = layout?.signature === signature ? layout : null;
  /** Páginas de hojas: índices de unidad y si entran en su variante compacta. */
  const pages = current?.pages ?? null;
  /** Páginas del contenido: índices de entrada del índice. La primera va bajo la presentación. */
  const tocPages = current?.tocPages ?? null;
  const tocDense = current?.tocDense ?? false;
  const tocCount = tocPages?.length ?? 1;
  const firstSheetPage = 2 + tocCount;
  const total = pages ? 1 + tocCount + Math.max(1, pages.length) + 1 : 0;

  // Las copias de las unidades en las páginas también ajustan sus tablas.
  useLayoutEffect(() => {
    fitTables(pagesRef.current);
  }, [pages]);
  useEffect(() => {
    if (pages && onReady) onReady(total);
  }, [pages, total, onReady]);

  // Página de cada unidad: portada, presentación y contenido van antes.
  const unitPage = new Map<number, number>();
  pages?.forEach((list, index) => {
    for (const { i } of list) unitPage.set(i, index + firstSheetPage);
  });
  const pageOf = (entry: TocEntry) =>
    entry.kind === "cierre" ? total || "…" : entry.unit !== undefined ? unitPage.get(entry.unit) ?? "…" : "…";
  const tocRow = (entry: TocEntry, index: number, measuring = false) => (
    <li
      key={entry.key}
      data-toc={measuring ? index : undefined}
      data-kind={entry.kind}
      data-in-section={entry.inSection || undefined}
      style={entry.report ? ({ "--line": `var(--bol-line-${entry.report.line})` } as CSSProperties) : undefined}
    >
      <a href={measuring ? undefined : entry.href}>
        {entry.kind === "capitulo" ? (
          <span className="bol-toc__code">{entry.report!.code}</span>
        ) : entry.kind === "hoja" || entry.kind === "seccion" ? (
          <span aria-hidden="true" />
        ) : null}
        <span className="bol-toc__name">{entry.label}</span>
        <span className="bol-toc__dots" aria-hidden="true" />
        <span className="bol-toc__page">{measuring ? "00" : pageOf(entry)}</span>
      </a>
    </li>
  );

  // Pestañas de capítulo: una por informe incluido, en su color.
  const tabs = settings.tabs ? chapters : [];

  const theme = settings.theme;
  const style = {
    "--bol-navy": theme.navy,
    "--bol-band": theme.band,
    "--bol-accent": theme.accent,
    "--bol-font": `"${theme.font}", "Montserrat", "Manrope", system-ui, sans-serif`,
  } as CSSProperties;

  // Escala de pantalla: la página con un margen de 8 px a cada lado.
  const pageCount = total || 3;
  const scale = fitWidth ? Math.min(1, (fitWidth - 16) / (PAGE_W * MM)) : 1;
  const stackHeight = pageCount * 297 * MM + (pageCount - 1) * 8 * MM + 12 * MM;
  const frame = fitWidth
    ? ({ height: stackHeight * scale, "--bol-scale": scale, "--bol-shift": `${Math.max(0, (fitWidth - PAGE_W * MM * scale) / 2)}px` } as CSSProperties)
    : undefined;

  const cut = settings.cut === ALL_YEARS ? `Periodo ${cutLabel(ALL_YEARS, null)}` : `Corte ${settings.cut}`;
  const campusName = catalog.campuses.find((c) => c.id === settings.campus)?.name;
  const edition = [
    settings.format === "ejecutivo" ? "Resumen ejecutivo" : null,
    report ? report.name : null,
    catalog.period?.label ? `Periodo ${catalog.period.label}` : null,
    settings.cut === ALL_YEARS ? null : `Corte ${settings.cut}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const texts = settings.texts;

  // La copia de medida no lleva el ancla: un id repetido rompería el enlace.
  const renderIntro = (anchored: boolean) => (
    <>
      <h2>{texts.presentationTitle}</h2>
      <div className="bol-intro__text">{paragraphs(texts.presentation)}</div>
      <dl className="bol-intro__facts">
        <div>
          <dt>Periodo</dt>
          <dd>{catalog.period?.label ?? cutLabel(ALL_YEARS, null)}</dd>
        </div>
        <div>
          <dt>Corte</dt>
          <dd>{settings.cut === ALL_YEARS ? "Todos los años (promedio anual o último dato)" : settings.cut}</dd>
        </div>
        <div>
          <dt>Campus</dt>
          <dd>{campusName ?? "Todos los campus"}</dd>
        </div>
      </dl>
      <p className="bol-intro__reading">
        <b>Cómo leer las cifras.</b> Un guion (—) es un dato sin reportar, nunca un cero. Lo que se reporta por periodo académico se
        muestra por periodo (2024-1, 2024-2) junto a la cifra del año, que sale de su regla: suma, promedio o último periodo. Con todo el
        periodo, cada indicador muestra el promedio anual de los años con dato; las existencias, como la matrícula, su último dato.
      </p>
      <h2 id={anchored ? "contenido" : undefined}>Contenido</h2>
    </>
  );
  const tocGroups = tocPages ?? [toc.map((_, index) => index)];

  return (
    <div className="bol-doc" style={style} lang="es">
      {/* Medida: fuera de pantalla, al ancho exacto del cuerpo. Sin ids: no se enlaza. */}
      <div ref={measure} className="bol-measure" aria-hidden="true">
        {units.map((unit, i) => (
          <div key={unit.key} data-unit={i} data-variant="full">
            {unit.node}
          </div>
        ))}
        {units.map((unit, i) =>
          unit.compact ? (
            <div key={`${unit.key}-compacta`} data-unit={i} data-variant="compact">
              {unit.compact}
            </div>
          ) : null,
        )}
        <section data-intro className="bol-intro">
          {renderIntro(false)}
        </section>
        <h2 data-toc-head className="bol-intro__continued">Contenido (continuación)</h2>
        <ol className="bol-toc">{toc.map((entry, index) => tocRow(entry, index, true))}</ol>
        <ol className="bol-toc" data-dense>
          {toc.map((entry, index) => tocRow(entry, index, true))}
        </ol>
      </div>

      <div className="bol-frame" style={frame} data-fit={fitWidth ? true : undefined}>
        <div ref={pagesRef} className="bol-pages">
          <section className="bol-page bol-cover" aria-label="Portada">
            <img className="bol-page__art" src={settings.images.cover ?? DEFAULT_IMAGES.cover} alt="" />
            {settings.images.coverText && (
              <div className="bol-cover__text">
                <h1>{texts.coverTitle}</h1>
                <p>{texts.coverSubtitle}</p>
                <strong>{texts.coverOffice}</strong>
              </div>
            )}
            {edition && (
              <p className="bol-cover__edition" data-align={settings.edition.align} style={{ "--edition-color": settings.edition.color } as CSSProperties}>
                {edition}
              </p>
            )}
          </section>

          {tocGroups.map((group, g) => (
            <ContentPage key={`contenido-${g}`} texts={texts} images={settings.images} tabs={tabs} number={2 + g} total={total} chapter="" cut={cut}>
              <section className="bol-intro">
                {g === 0 ? renderIntro(true) : <h2 className="bol-intro__continued">Contenido (continuación)</h2>}
                <ol className="bol-toc" data-dense={tocDense || undefined}>
                  {group.map((index) => tocRow(toc[index], index))}
                </ol>
              </section>
            </ContentPage>
          ))}

          {chapters.length === 0 && (
            <ContentPage texts={texts} images={settings.images} tabs={[]} number={firstSheetPage} total={total} chapter="" cut={cut}>
              <p className="bol-empty">No hay cifras que mostrar con este contenido. Revisa qué informes e indicadores están incluidos.</p>
            </ContentPage>
          )}

          {pages?.map((list, index) => {
            const pageReport = units[list[0]?.i]?.report;
            const pageSection = units[list[0]?.i]?.section;
            return (
              <ContentPage
                key={index}
                texts={texts}
                images={settings.images}
                tabs={tabs}
                current={pageReport?.slug}
                number={index + firstSheetPage}
                total={total}
                chapter={pageReport ? `${pageReport.name}${pageSection ? ` · ${pageSection}` : ""}` : ""}
                report={pageReport}
                badge={settings.headerBadge}
                cut={cut}
              >
                {list.map(({ i, compact }) => (
                  <div key={units[i].key} id={anchorOf(units[i], i)} className="bol-unit" data-tight={units[i].tight || undefined}>
                    {compact ? units[i].compact : units[i].node}
                  </div>
                ))}
              </ContentPage>
            );
          })}

          <section
            id="contraportada"
            className="bol-page bol-back"
            aria-label="Contraportada"
            data-density={offices.length > 36 ? "extrema" : offices.length > 20 ? "max" : offices.length > 14 ? "alta" : undefined}
          >
            <img className="bol-page__art" src={settings.images.back ?? DEFAULT_IMAGES.back} alt="" />
            <div className="bol-back__body">
              <h2>{texts.backTitle}</h2>
              <ul>
                {offices.map((office) => (
                  <li key={office.name}>
                    <strong>{office.name}</strong>
                    <span>{office.reports.join(" · ")}</span>
                  </li>
                ))}
              </ul>
              <p>{texts.backNote}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ContentPage({
  texts,
  images,
  tabs,
  current,
  report,
  badge = "ninguna",
  number,
  total,
  chapter,
  cut,
  children,
}: {
  texts: BulletinSettings["texts"];
  images: BulletinSettings["images"];
  /** Capítulos del boletín: pestañas enlazadas en el borde derecho. */
  tabs: Report[];
  /** Capítulo de la página: su pestaña sale más ancha, con el código. */
  current?: string;
  /** Informe de la página: su insignia va sobre el dibujo de la franja. */
  report?: Report;
  badge?: BulletinSettings["headerBadge"];
  number: number;
  total: number;
  chapter: string;
  cut: string;
  children: ReactNode;
}) {
  // Con un fondo que ya trae la cabecera dibujada, no se pinta otra encima.
  const drawnHeader = Boolean(images.content && images.contentHasHeader);
  // Las pestañas reparten el alto del cuerpo; nunca más altas que 26 mm.
  const tabH = tabs.length ? Math.min(26, (BODY_H - (tabs.length - 1) * 1.5) / tabs.length) : 0;
  return (
    <section className="bol-page bol-content" aria-label={`Página ${number}`}>
      {images.content && <img className="bol-page__art" src={images.content} alt="" />}
      {!drawnHeader && (
        <header className="bol-header">
          <div className="bol-header__bar">
            <img src={images.headerLogo ?? DEFAULT_IMAGES.headerLogo} alt="Universidad de Santander" />
            <span>{texts.headerOffice}</span>
          </div>
          <div className="bol-header__band">
            <strong>{texts.headerTitle}</strong>
            <img src={images.headerArt ?? DEFAULT_IMAGES.headerArt} alt="" />
            {report && badge !== "ninguna" && (
              <span className="bol-header__report" data-badge={badge}>
                <span className="bol-header__code">{report.code}</span>
                <span className="bol-header__name">{report.name}</span>
              </span>
            )}
          </div>
        </header>
      )}
      <div className="bol-content__body">{children}</div>
      {tabs.length > 0 && (
        <nav className="bol-tabs" aria-label="Capítulos">
          {tabs.map((tab, index) => (
            <a
              key={tab.slug}
              href={`#cap-${tab.slug}`}
              className="bol-tab"
              data-current={tab.slug === current || undefined}
              title={tab.name}
              style={{ "--line": `var(--bol-line-${tab.line})`, top: `${35.5 + index * (tabH + 1.5)}mm`, height: `${tabH}mm` } as CSSProperties}
            >
              <span>{tab.code}</span>
            </a>
          ))}
        </nav>
      )}
      <footer className="bol-footer">
        <span>
          {texts.footer}
          {chapter ? ` · ${chapter}` : ""}
        </span>
        <span>{cut}</span>
        <a href="#contenido" title="Ir al contenido">
          {number}
          {total ? ` de ${total}` : ""}
        </a>
      </footer>
    </section>
  );
}
