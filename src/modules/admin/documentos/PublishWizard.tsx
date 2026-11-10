/* =============================================================================
   Panel de Documentos · asistente «Subir y publicar» (y editar un documento).

   Tres pasos, y nada se publica hasta el último:
     1 · Archivo      subir un archivo, escribir en Markdown o pegar un enlace.
     2 · Revisión     comprobaciones que aparecen una tras otra y la miniatura.
     3 · Ficha        título, resumen, miniatura, visibilidad y publicar.

   La misma ficha (paso 3) sirve para editar un documento que ya existe: se
   abre directamente ahí, con sus datos.

   El archivo se sube en cuanto se elige, como siempre en este panel, para que
   la ficha nazca con su peso y su tipo medidos. Por eso el asistente lleva la
   cuenta de lo que subió en esta sesión: si la persona cancela antes de
   guardar, se borra; si guarda, se borra lo que quedó sin uso (un archivo
   reemplazado, una miniatura anterior). Lo que ya estaba guardado no se toca
   hasta que la ficha nueva esté en la base.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import gsap from "gsap";
import { Icon } from "../../../components/ui/Icon";
import { ThumbCover, DocThumb } from "../../documentos/DocThumb";
import { TipoDoc } from "../../documentos/TipoDoc";
import { documentFileUrl } from "../../documentos/data";
import { FORMAT_LABEL, REPO_HOST, THUMB_NOTE, formatOf, hostOf, isPreviewableFormat, shortDescription } from "../../documentos/tipos";
import type { DocFormat } from "../../documentos/tipos";
import type { DocCollection, DocFlavor, DocItem, DocStatus } from "../../documentos/data";
import { markdownToHtml } from "../../documentos/visor/resaltar";
import { Modal, ModalClose } from "./Modal";
import { PreviewModal } from "./PreviewModal";
import { enterList, reducedMotion, sleep } from "./motion";
import { autoThumbnail, thumbFromImage } from "./miniatura";
import {
  MAX_DOC_BYTES,
  MAX_PORTAL_ZIP_BYTES,
  extensionOf,
  formatBytes,
  removeDocFiles,
  checkPortalServed,
  removePortalDir,
  uploadDocFile,
  uploadPortalZip,
  uploadSourceFile,
  uploadThumb,
  useSaveItem,
} from "./store";

export type Draft = Omit<DocItem, "updatedAt">;
type Mode = "file" | "md" | "link" | "portal";
type CheckState = "wait" | "ok" | "warn";

interface Check {
  title: string;
  detail: string;
  state: CheckState;
}

interface Thumb {
  blob: Blob | null;
  url: string | null;
}

const NO_THUMB: Thumb = { blob: null, url: null };

const ACCEPT = ".pdf,.docx,.doc,.html,.htm,.md,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp";
const SUMMARY_SOFT = 180;
/** El tope que impone la base (check de doc_items.summary). */
const SUMMARY_HARD = 400;

export const blankItem = (collectionId: string, position: number): Draft => ({
  id: crypto.randomUUID(),
  collectionId,
  title: "",
  description: "",
  summary: "",
  kind: "enlace",
  url: "",
  path: null,
  fileName: "",
  fileType: "",
  sizeBytes: null,
  year: new Date().getFullYear(),
  yearTo: null,
  issuedOn: null,
  version: "",
  supersedes: null,
  status: "borrador",
  visibility: "publico",
  flavor: "",
  sourcePath: null,
  sourceName: "",
  thumbPath: null,
  siteDir: null,
  position,
});

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** «informe_matricula-2025.pdf» → «Informe matricula 2025». */
export function cleanTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
}

/* --- Qué clase de HTML es ------------------------------------------------------------------ */

/** Lee los primeros ~200 KB de un .html y decide si viene de Quarto o de R Markdown. */
export async function detectFlavor(file: File): Promise<DocFlavor> {
  const extension = extensionOf(file.name);
  if (extension !== ".html" && extension !== ".htm") return "";
  try {
    const text = (await file.slice(0, 200 * 1024).text()).toLowerCase();
    const headEnd = text.indexOf("</head>");
    const head = headEnd > 0 ? text.slice(0, headEnd) : text;
    const generator = /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*>/i.exec(text)?.[0] ?? "";
    if (head.includes("quarto") || generator.includes("quarto")) return "quarto";
    if (generator.includes("pandoc") && /rmarkdown|knitr|title toc-ignore|tocify/.test(text)) return "rmarkdown";
  } catch {
    /* un archivo ilegible se sube como HTML común */
  }
  return "";
}

/** Cuántos recursos externos pide un HTML y cuántos scripts trae. */
async function inspectHtml(file: File): Promise<{ external: number; scripts: number; partial: boolean }> {
  const LIMIT = 8 * 1024 * 1024;
  const text = await file.slice(0, LIMIT).text();
  const tags = text.match(/<(?:script|img|link|iframe|source|video|audio|embed|object)\b[^>]*>/gi) ?? [];
  let external = 0;
  let scripts = 0;
  for (const tag of tags) {
    const name = /^<(\w+)/.exec(tag)?.[1].toLowerCase() ?? "";
    if (name === "script") scripts += 1;
    // En un <link> solo cuenta lo que se descarga para pintar la página.
    if (name === "link" && !/\brel\s*=\s*["']?(?:stylesheet|preload|modulepreload|icon)/i.test(tag)) continue;
    const attribute = name === "link" ? "href" : "src";
    if (new RegExp(`\\b${attribute}\\s*=\\s*["']?\\s*(?:https?:)?//`, "i").test(tag)) external += 1;
  }
  return { external, scripts, partial: file.size > LIMIT };
}

async function pdfPages(file: File): Promise<number> {
  const { openPdfBytes } = await import("../../documentos/visor/pdf");
  const pdf = await openPdfBytes(new Uint8Array(await file.arrayBuffer()));
  try {
    return pdf.numPages;
  } finally {
    await pdf.destroy();
  }
}

/** .docx es un zip («PK»); .doc antiguo empieza con D0 CF 11 E0. */
async function wordKind(file: File): Promise<"docx" | "doc" | "unknown"> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) return "docx";
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "doc";
  return "unknown";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* --- El asistente ---------------------------------------------------------------------------- */

export function PublishWizard({
  mode: startMode,
  item,
  root,
  sections,
  initialCollectionId,
  itemsOf,
  onClose,
  onSaved,
}: {
  /** Cómo empieza un documento nuevo; se ignora al editar. */
  mode: Mode;
  /** El documento que se edita, o nulo para uno nuevo. */
  item: DocItem | null;
  root: DocCollection;
  sections: DocCollection[];
  initialCollectionId: string;
  itemsOf: (collectionId: string) => DocItem[];
  onClose: () => void;
  onSaved: (item: Draft, message: string) => void;
}) {
  const editing = item !== null;
  const save = useSaveItem();

  const [step, setStep] = useState<1 | 2 | 3>(editing ? 3 : 1);
  const [mode, setMode] = useState<Mode>(item ? (item.kind === "enlace" ? "link" : "file") : startMode);
  const [form, setForm] = useState<Draft>(() => {
    if (item) {
      const { updatedAt: _ignored, ...rest } = item;
      void _ignored;
      return rest;
    }
    return blankItem(initialCollectionId, 0);
  });
  const [file, setFile] = useState<File | null>(null);
  const [mdText, setMdText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Lo que trajo el .zip de esta sesión (para las comprobaciones). */
  const [portalInfo, setPortalInfo] = useState<{ files: number; bytes: number; warning?: string | null } | null>(null);

  const [checks, setChecks] = useState<Check[]>([]);
  const [checksDone, setChecksDone] = useState(false);

  const [auto, setAuto] = useState<Thumb>(NO_THUMB);
  const [custom, setCustom] = useState<Thumb>(NO_THUMB);
  const [thumbMode, setThumbMode] = useState<"auto" | "up">("auto");
  const [thumbCleared, setThumbCleared] = useState(false);
  const [thumbNote, setThumbNote] = useState("");
  const [thumbBusy, setThumbBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  /** Lo subido en esta sesión: se borra si se cancela, y lo que sobre, al guardar. */
  const uploaded = useRef<string[]>([]);
  /** Carpetas de microportales subidas en esta sesión. */
  const portalDirs = useRef<string[]>([]);
  const originalDir = useRef<string | null>(item?.siteDir ?? null);
  const originals = useRef<(string | null)[]>([item?.path ?? null, item?.sourcePath ?? null, item?.thumbPath ?? null]);
  const savedRef = useRef(false);
  const titleEdited = useRef(Boolean(item));
  const closeRef = useRef<() => void>(() => undefined);
  const stepHead = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const filePicker = useRef<HTMLInputElement>(null);
  const portalPicker = useRef<HTMLInputElement>(null);
  const sourcePicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const checksList = useRef<HTMLUListElement>(null);

  const format: DocFormat = formatOf(form);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((current) => ({ ...current, [key]: value }));

  /* Los avisos se leen: el foco se lleva al título del paso nuevo. */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepHead.current?.focus({ preventScroll: true });
  }, [step]);

  /* Las URL de objeto se sueltan al terminar. */
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const makeThumb = (blob: Blob | null): Thumb => {
    if (!blob) return NO_THUMB;
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return { blob, url };
  };

  /* --- Subir --------------------------------------------------------------------------------- */

  async function dropSession(path: string | null) {
    if (path && uploaded.current.includes(path)) {
      uploaded.current = uploaded.current.filter((own) => own !== path);
      await removeDocFiles([path]);
    }
  }

  /** Suelta la carpeta de un microportal subida en esta sesión (la original se borra al guardar). */
  async function dropPortalSession(dir: string | null) {
    if (dir && portalDirs.current.includes(dir)) {
      portalDirs.current = portalDirs.current.filter((own) => own !== dir);
      await removePortalDir(dir);
    }
  }

  async function pickPortal(picked: File | undefined) {
    if (!picked) return;
    setError("");
    setBusy("Abriendo el .zip…");
    try {
      const up = await uploadPortalZip(form.id, picked, (done, total) => setBusy(`Subiendo el sitio… ${done} de ${total} archivos`));
      await dropPortalSession(form.siteDir);
      await dropSession(form.path);
      portalDirs.current.push(up.dir);
      const flavor = await detectFlavor(up.entryFile);
      setFile(up.entryFile);
      setPortalInfo({ files: up.fileCount, bytes: up.totalBytes, warning: await checkPortalServed(up.entryPath) });
      setForm((current) => ({
        ...current,
        kind: "archivo",
        url: null,
        path: up.entryPath,
        fileName: "index.html",
        fileType: "HTML",
        sizeBytes: up.totalBytes,
        flavor,
        siteDir: up.dir,
        title: titleEdited.current ? current.title : cleanTitle(picked.name),
      }));
      setAuto(NO_THUMB);
      setThumbCleared(false);
      setThumbNote("");
      if (step === 3) {
        const blob = await autoThumbnail(up.entryFile, "portal");
        setAuto(makeThumb(blob));
        if (!blob) setThumbNote("Se usará una portada con el tipo y el título.");
      }
    } catch (failure) {
      setError(message(failure, "No se pudo subir el sitio. Revisa tu conexión e inténtalo de nuevo."));
    } finally {
      setBusy("");
      if (portalPicker.current) portalPicker.current.value = "";
    }
  }

  async function pickFile(picked: File | undefined) {
    if (!picked) return;
    setError("");
    setBusy("Subiendo el archivo…");
    try {
      const up = await uploadDocFile(form.collectionId, picked);
      await dropSession(form.path);
      await dropPortalSession(form.siteDir);
      uploaded.current.push(up.path);
      const flavor = await detectFlavor(picked);
      setFile(picked);
      setPortalInfo(null);
      setForm((current) => ({
        ...current,
        kind: "archivo",
        url: null,
        path: up.path,
        fileName: up.fileName,
        fileType: up.fileType,
        sizeBytes: up.sizeBytes,
        flavor,
        siteDir: null,
        title: titleEdited.current ? current.title : cleanTitle(up.fileName),
      }));
      // Una miniatura de otro archivo ya no sirve.
      setAuto(NO_THUMB);
      setThumbCleared(false);
      setThumbNote("");
      if (step === 3) {
        const next = formatOf({ kind: "archivo", url: null, path: up.path, fileName: up.fileName, flavor });
        const blob = await autoThumbnail(picked, next);
        setAuto(makeThumb(blob));
        if (!blob) setThumbNote("Se usará una portada con el tipo y el título.");
      }
    } catch (failure) {
      setError(message(failure, "No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo."));
    } finally {
      setBusy("");
      if (filePicker.current) filePicker.current.value = "";
    }
  }

  async function pickSource(picked: File | undefined) {
    if (!picked) return;
    setError("");
    setBusy("Subiendo el código fuente…");
    try {
      const up = await uploadSourceFile(form.collectionId, picked);
      await dropSession(form.sourcePath);
      uploaded.current.push(up.path);
      setForm((current) => ({ ...current, sourcePath: up.path, sourceName: up.name }));
    } catch (failure) {
      setError(message(failure, "No se pudo subir el código fuente."));
    } finally {
      setBusy("");
      if (sourcePicker.current) sourcePicker.current.value = "";
    }
  }

  async function clearSource() {
    await dropSession(form.sourcePath);
    setForm((current) => ({ ...current, sourcePath: null, sourceName: "" }));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void pickFile(event.dataTransfer.files?.[0]);
  }

  /* --- Paso 1 → 2 ------------------------------------------------------------------------------- */

  async function review() {
    setError("");
    if (mode === "file") {
      if (!form.path || !file) {
        setError("Elige un archivo para continuar.");
        return;
      }
    } else if (mode === "portal") {
      if (!form.siteDir || !file) {
        setError("Elige el .zip del sitio para continuar.");
        return;
      }
    } else if (mode === "md") {
      if (!mdText.trim()) {
        setError("Escribe algo de texto antes de continuar.");
        return;
      }
      setBusy("Preparando el documento…");
      try {
        const written = new File([mdText], "documento.md", { type: "text/markdown" });
        const up = await uploadDocFile(form.collectionId, written);
        await dropSession(form.path);
        await dropPortalSession(form.siteDir);
        uploaded.current.push(up.path);
        setPortalInfo(null);
        const heading = /^#{1,4}\s+(.+)$/m.exec(mdText)?.[1].trim() ?? "";
        setFile(written);
        setForm((current) => ({
          ...current,
          kind: "archivo",
          url: null,
          path: up.path,
          fileName: up.fileName,
          fileType: up.fileType,
          sizeBytes: up.sizeBytes,
          flavor: "",
          siteDir: null,
          title: titleEdited.current ? current.title : heading,
        }));
      } catch (failure) {
        setError(message(failure, "No se pudo preparar el documento."));
        setBusy("");
        return;
      }
      setBusy("");
    } else {
      const url = (form.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) {
        setError("El enlace tiene que empezar por http:// o https://");
        return;
      }
      setFile(null);
      await dropPortalSession(form.siteDir);
      setPortalInfo(null);
      setForm((current) => ({ ...current, kind: "enlace", url, path: null, fileName: "", fileType: "", sizeBytes: null, flavor: "", siteDir: null }));
    }
    setChecks([]);
    setChecksDone(false);
    setStep(2);
  }

  /* --- Paso 2: las comprobaciones ------------------------------------------------------------------ */

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    const isLink = form.kind === "enlace";
    const kind: DocFormat = formatOf(form);
    type Result = { state: CheckState; title: string; detail: string };
    const jobs: { pending: string; run: () => Promise<Result> }[] = [];
    // El HTML se lee una sola vez para las dos comprobaciones.
    let html: ReturnType<typeof inspectHtml> | null = null;
    const htmlReport = () => (html ??= inspectHtml(file as File));

    jobs.push({
      pending: "Detectando el tipo",
      run: async () => ({
        state: kind === "file" ? "warn" : "ok",
        title: `Tipo detectado: ${FORMAT_LABEL[kind]}${form.flavor === "quarto" ? " (informe de Quarto)" : form.flavor === "rmarkdown" ? " (informe de R Markdown)" : ""}`,
        detail:
          kind === "file"
            ? "El portal no sabe mostrar este tipo dentro de su visor: se ofrecerá para abrir o descargar."
            : isLink
              ? kind === "repo"
                ? "Es un enlace al Repositorio Digital de la universidad."
                : "Es un enlace a otro sitio; el portal solo lo abre en una pestaña nueva."
              : isPreviewableFormat(kind)
                ? "El portal lo muestra dentro de su propio visor."
                : "Se ofrecerá para abrir o descargar.",
      }),
    });

    if (isLink) {
      jobs.push({
        pending: "Revisando el enlace",
        run: async () => ({
          state: "ok",
          title: `Dirección válida (${hostOf(form.url)})`,
          detail: "El portal no puede comprobar que la página exista: si el sitio de destino la mueve, el enlace se rompe sin avisar.",
        }),
      });
    } else if (kind === "portal") {
      jobs.push({
        pending: "Contando los archivos del sitio",
        run: async () => ({
          state: "ok",
          title: portalInfo ? `${plural(portalInfo.files, "archivo", "archivos")} · ${formatBytes(portalInfo.bytes)}` : "Sitio ya publicado",
          detail: "Entrada: index.html. Los enlaces entre páginas, las imágenes y los estilos del sitio funcionan tal cual, porque se sirven desde su propia carpeta.",
        }),
      });
      jobs.push({
        pending: "Comprobando que el servidor lo entrega bien",
        run: async () => {
          const warning = portalInfo?.warning ?? (portalInfo ? null : await checkPortalServed(form.path ?? ""));
          return warning
            ? { state: "warn", title: "El servidor no entrega bien el sitio", detail: `${warning} Se puede guardar, pero el sitio no se verá bien hasta que se corrija en el servidor de archivos.` }
            : { state: "ok", title: "El servidor entrega la página como página web", detail: "Tipo de contenido correcto y sin políticas que bloqueen el sitio." };
        },
      });
      jobs.push({
        pending: "Revisando el aislamiento",
        run: async () => {
          const { scripts } = await htmlReport();
          return {
            state: "ok",
            title: scripts > 0 ? `La entrada trae ${plural(scripts, "script", "scripts")}` : "La entrada no trae scripts",
            detail: "El sitio se ejecuta en un marco aislado: no ve la sesión del portal ni puede usar el almacenamiento del navegador (localStorage). Si algo del sitio guarda preferencias, no las recordará.",
          };
        },
      });
    } else if (file) {
      jobs.push({
        pending: "Midiendo el archivo",
        run: async () => ({
          state: file.size > MAX_DOC_BYTES ? "warn" : "ok",
          title: `${formatBytes(file.size)} de ${formatBytes(MAX_DOC_BYTES)} permitidos`,
          detail: file.size > MAX_DOC_BYTES ? "Pasa del límite: súbelo a otro sitio y añádelo como enlace." : "Dentro del límite.",
        }),
      });

      if (kind === "pdf") {
        jobs.push({
          pending: "Contando las páginas",
          run: async () => {
            try {
              const pages = await pdfPages(file);
              return { state: "ok", title: plural(pages, "página", "páginas"), detail: "El visor lo abre con pdf.js, sin pedir que lo descargues." };
            } catch {
              return {
                state: "warn",
                title: "No se pudo leer el PDF",
                detail: "Puede estar dañado o protegido con contraseña. Guárdalo de nuevo sin contraseña y vuelve a subirlo.",
              };
            }
          },
        });
      } else if (kind === "html" || kind === "qmd" || kind === "r") {
        jobs.push({
          pending: "Revisando los recursos externos",
          run: async () => {
            const { external, partial } = await htmlReport();
            return {
              state: external > 0 ? "warn" : "ok",
              title: external > 0 ? `Pide ${plural(external, "recurso externo", "recursos externos")}` : "Archivo autocontenido",
              detail:
                (external > 0
                  ? "Se verá bien solo con internet y mientras esos sitios respondan. Para evitarlo, genera el archivo autocontenido (en Quarto, embed-resources: true; en R Markdown, self_contained)."
                  : "No pide hojas de estilo, imágenes ni scripts de otros sitios.") +
                (partial ? " Se revisaron los primeros 8 MB." : ""),
            };
          },
        });
        jobs.push({
          pending: "Buscando scripts",
          run: async () => {
            const { scripts } = await htmlReport();
            return {
              state: scripts > 0 ? "warn" : "ok",
              title: scripts > 0 ? `Trae ${plural(scripts, "script", "scripts")}` : "No trae scripts",
              detail: scripts > 0 ? "Se ejecuta en un marco aislado, sin acceso a tu sesión." : "Es contenido estático.",
            };
          },
        });
      } else if (kind === "doc") {
        jobs.push({
          pending: "Leyendo el documento Word",
          run: async () => {
            const type = await wordKind(file);
            if (type === "docx") return { state: "ok", title: "Documento Word legible", detail: "El visor lo convierte a páginas en el navegador." };
            if (type === "doc")
              return {
                state: "warn",
                title: "Es un .doc antiguo",
                detail: "El visor convierte mejor los .docx. Si no se ve bien, guárdalo como .docx y vuelve a subirlo.",
              };
            return { state: "warn", title: "No se pudo leer el archivo Word", detail: "Puede estar dañado. Ábrelo en Word, guárdalo como .docx y vuelve a subirlo." };
          },
        });
      } else if (kind === "md") {
        jobs.push({
          pending: "Leyendo el Markdown",
          run: async () => ({ state: "ok", title: "Documento Markdown", detail: "El visor lo muestra con títulos, listas y enlaces." }),
        });
      }
    }

    jobs.push({
      pending: "Generando la miniatura",
      run: async () => {
        if (!file) {
          setAuto(NO_THUMB);
          return { state: "warn", title: "Miniatura: portada generada", detail: "Se usará una portada con el tipo y el título." };
        }
        const blob = await autoThumbnail(file, kind);
        if (cancelled) return { state: "ok", title: "", detail: "" };
        setAuto(makeThumb(blob));
        return blob
          ? { state: "ok", title: "Miniatura generada", detail: THUMB_NOTE[kind] }
          : { state: "warn", title: "No se pudo generar una imagen", detail: "Se usará una portada con el tipo y el título." };
      },
    });

    setChecks(jobs.map((job) => ({ title: job.pending, detail: "", state: "wait" })));
    setChecksDone(false);

    void (async () => {
      await sleep(reducedMotion() ? 0 : 120);
      for (let index = 0; index < jobs.length; index += 1) {
        if (cancelled) return;
        const started = performance.now();
        let result: Result;
        try {
          result = await jobs[index].run();
        } catch {
          result = { state: "warn", title: jobs[index].pending, detail: "No se pudo comprobar. Puedes continuar." };
        }
        if (cancelled) return;
        const wait = reducedMotion() ? 0 : Math.max(0, 240 - (performance.now() - started));
        await sleep(wait);
        if (cancelled) return;
        setChecks((current) => current.map((check, i) => (i === index ? result : check)));
      }
      if (!cancelled) setChecksDone(true);
    })();

    return () => {
      cancelled = true;
    };
    // El paso es el único disparador: los datos que lee ya están fijos al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step === 2 && checks.length && checksList.current) enterList(checksList.current.children, 8);
    // Solo cuando aparece la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checks.length]);

  /* --- Paso 3: la ficha ------------------------------------------------------------------------------ */

  const replaceable = useMemo(() => {
    const siblings = itemsOf(form.collectionId);
    const byId = new Map(siblings.map((row) => [row.id, row] as const));
    // Reemplazar a un documento que ya depende de este cerraría el círculo.
    const descends = (from: string | null): boolean => {
      const seen = new Set<string>();
      let cursor = from;
      while (cursor && !seen.has(cursor)) {
        if (cursor === form.id) return true;
        seen.add(cursor);
        cursor = byId.get(cursor)?.supersedes ?? null;
      }
      return false;
    };
    return siblings.filter((row) => row.id !== form.id && !descends(row.supersedes));
  }, [itemsOf, form.collectionId, form.id]);

  const problem = !form.title.trim()
    ? "Escribe un título para el documento."
    : form.summary.length > SUMMARY_HARD
      ? `El resumen pasa de ${SUMMARY_HARD} caracteres: acórtalo.`
      : form.kind === "enlace" && !/^https?:\/\//i.test(form.url ?? "")
        ? "El enlace tiene que empezar por http:// o https://"
        : form.yearTo !== null && form.year !== null && form.yearTo < form.year
          ? "El año final no puede ser anterior al inicial."
          : "";

  const current = thumbMode === "up" && custom.url ? custom : auto;
  const shownUrl = thumbCleared ? null : current.url;
  const hasThumb = Boolean(shownUrl) || (!thumbCleared && Boolean(form.thumbPath));
  const previewItem = {
    ...form,
    thumbPath: thumbCleared ? null : form.thumbPath,
    updatedAt: "",
  } as DocItem;
  const canPreview = form.kind === "archivo" && isPreviewableFormat(format) && Boolean(form.path);

  async function pickImage(picked: File | undefined) {
    if (!picked) return;
    setError("");
    setThumbBusy(true);
    const blob = await thumbFromImage(picked);
    setThumbBusy(false);
    if (imagePicker.current) imagePicker.current.value = "";
    if (!blob) {
      setError(`No se pudo leer «${picked.name}» como imagen. Prueba con un PNG, JPG o WebP.`);
      return;
    }
    setCustom(makeThumb(blob));
    setThumbMode("up");
    setThumbCleared(false);
    setThumbNote("");
  }

  async function regenerate() {
    const url = documentFileUrl(form.path);
    if (!url) return;
    setError("");
    setThumbNote("");
    setThumbBusy(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("fetch");
      const blob = await response.blob();
      const original = new File([blob], form.fileName || "documento", { type: blob.type });
      const out = await autoThumbnail(original, format);
      if (out) {
        setAuto(makeThumb(out));
        setThumbMode("auto");
        setThumbCleared(false);
        setThumbNote("Miniatura generada de nuevo. Se guarda con la ficha.");
      } else {
        setThumbNote("No se pudo sacar una imagen de este documento. Se conserva la miniatura anterior; si no hay, el portal dibuja una portada con el tipo y el título.");
      }
    } catch {
      setThumbNote("No se pudo descargar el archivo original para regenerar la miniatura. Revisa tu conexión e inténtalo de nuevo, o sube una imagen.");
    } finally {
      setThumbBusy(false);
    }
  }

  function removeThumb() {
    setThumbCleared(true);
    setAuto(NO_THUMB);
    setCustom(NO_THUMB);
    setThumbMode("auto");
    setThumbNote("Sin miniatura: el portal dibujará una portada con el tipo y el título.");
  }

  async function finish(status: DocStatus) {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      let thumbPath = thumbCleared ? null : form.thumbPath;
      const chosen = thumbMode === "up" && custom.blob ? custom.blob : auto.blob;
      if (!thumbCleared && chosen) {
        thumbPath = await uploadThumb(form.collectionId, chosen);
        uploaded.current.push(thumbPath);
      }
      const moved = item !== null && item.collectionId !== form.collectionId;
      const position =
        item && !moved ? item.position : Math.max(0, ...itemsOf(form.collectionId).map((row) => row.position)) + 1;
      const final: Draft = {
        ...form,
        title: form.title.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        url: form.kind === "enlace" ? (form.url ?? "").trim() : null,
        thumbPath,
        status,
        position,
      };
      await save.mutateAsync(final);

      const used = new Set([final.path, final.sourcePath, final.thumbPath]);
      const stale = [...uploaded.current, ...originals.current].filter((path): path is string => Boolean(path) && !used.has(path));
      savedRef.current = true;
      void removeDocFiles(stale);
      // Los sitios que quedaron atrás (uno reemplazado, o el de un documento que dejó de serlo).
      for (const dir of [...portalDirs.current, originalDir.current]) {
        if (dir && dir !== final.siteDir) void removePortalDir(dir);
      }
      onSaved(
        final,
        status === "publicado"
          ? `Publicado. «${final.title}» ya se ve en el portal.`
          : `Guardado como borrador. «${final.title}» no se ve en el portal.`,
      );
      closeRef.current();
    } catch (failure) {
      setError(message(failure, "No se pudo guardar el documento. Inténtalo de nuevo."));
    } finally {
      setSaving(false);
    }
  }

  function handleClosed() {
    // Cancelar antes de guardar: lo subido en esta sesión no queda huérfano.
    if (!savedRef.current) {
      void removeDocFiles(uploaded.current);
      for (const dir of portalDirs.current) void removePortalDir(dir);
    }
    onClose();
  }

  const modeTitle = editing ? "Editar el documento" : mode === "link" ? "Añadir enlace" : mode === "md" ? "Escribir documento" : mode === "portal" ? "Publicar un microportal" : "Subir y publicar";
  const sectionOptions = [root, ...sections];
  const isWeb = format === "html" || format === "qmd" || format === "r";
  const wasPublished = item?.status === "publicado";

  return (
    <Modal label={modeTitle} size="xl" onClose={handleClosed}>
      {({ close, titleId }) => {
        closeRef.current = close;
        return (
          <>
            <header className="da-modal__head da-wiz__head">
              <div className="da-wiz__title">
                <h2 id={titleId}>{modeTitle}</h2>
                {!editing && (
                  <ol className="da-steps" aria-label="Pasos">
                    {["Archivo", "Revisión", "Ficha y publicación"].map((name, index) => (
                      <li key={name} data-state={step === index + 1 ? "on" : step > index + 1 ? "done" : undefined} aria-current={step === index + 1 ? "step" : undefined}>
                        <b aria-hidden="true">{step > index + 1 ? <Icon name="check" size={11} /> : index + 1}</b>
                        {name}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <ModalClose onClick={close} />
            </header>

            <div className="da-wiz__body">
              <div className="da-wiz__alerts" aria-live="polite">
                {busy && (
                  <p className="da-wiz__busy" role="status">
                    <span className="oda-save__spinner" aria-hidden="true" /> {busy}
                  </p>
                )}
                {error && (
                  <p className="admin-error da-wiz__error" role="alert">
                    <Icon name="alert" size={16} />
                    {error}
                  </p>
                )}
              </div>

              {step === 1 && (
                <section aria-labelledby="da-s1">
                  <h3 id="da-s1" ref={stepHead} tabIndex={-1} className="da-wiz__h">
                    Paso 1 · ¿Qué vas a publicar?
                  </h3>
                  <ModeTabs mode={mode} onChange={(next) => { setMode(next); setError(""); }} />

                  {mode === "file" && (
                    <div role="tabpanel" id="da-panel-file" aria-labelledby="da-tab-file">
                      <div
                        className="da-drop"
                        data-over={dragging || undefined}
                        data-filled={form.path ? "" : undefined}
                        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                      >
                        <Icon name="upload" size={22} />
                        <strong>Suelta aquí tu documento</strong>
                        <p>
                          PDF, Word, HTML, Markdown, o un informe de <b>Quarto</b> o <b>R Markdown</b> ya renderizado a HTML. Hasta {formatBytes(MAX_DOC_BYTES)}.
                        </p>
                        <input ref={filePicker} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Elegir el archivo del documento" onChange={(event) => void pickFile(event.target.files?.[0])} />
                        <button type="button" className="button-secondary" data-autofocus disabled={Boolean(busy)} onClick={() => filePicker.current?.click()}>
                          {form.path ? "Elegir otro archivo" : "Elegir un archivo"}
                        </button>
                      </div>

                      <div className="da-slots">
                        <div className="da-slot" data-filled={form.path ? "" : undefined}>
                          <b>Documento</b>
                          <span>
                            {form.path ? `${form.fileName} · ${form.sizeBytes ? formatBytes(form.sizeBytes) : ""}` : "Obligatorio"}
                          </span>
                          {form.path && <TipoDoc format={format} />}
                        </div>
                        <div className="da-slot" data-filled={form.sourcePath ? "" : undefined}>
                          <b>Código fuente (opcional)</b>
                          <span>{form.sourcePath ? form.sourceName : ".qmd, .Rmd o .R"}</span>
                          <input ref={sourcePicker} type="file" accept=".qmd,.rmd,.r" className="sr-only" tabIndex={-1} aria-label="Elegir el código fuente (.qmd, .Rmd o .R)" onChange={(event) => void pickSource(event.target.files?.[0])} />
                          <span className="da-slot__acts">
                            <button type="button" className="oda-link-button" disabled={Boolean(busy)} onClick={() => sourcePicker.current?.click()}>
                              {form.sourcePath ? "Cambiar" : "Añadir"}
                            </button>
                            {form.sourcePath && (
                              <button type="button" className="oda-link-button" data-tone="danger" onClick={() => void clearSource()}>
                                Quitar
                              </button>
                            )}
                          </span>
                          <small className="doc-hint">Para un informe de Quarto o R: el lector podrá alternar entre el resultado y el código.</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === "portal" && (
                    <div role="tabpanel" id="da-panel-portal" aria-labelledby="da-tab-portal">
                      <div
                        className="da-drop"
                        data-over={dragging || undefined}
                        data-filled={form.siteDir ? "" : undefined}
                        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(event) => { event.preventDefault(); setDragging(false); void pickPortal(event.dataTransfer.files?.[0]); }}
                      >
                        <Icon name="upload" size={22} />
                        <strong>Suelta aquí el .zip del sitio</strong>
                        <p>
                          La carpeta que deja <b>Quarto</b> (<code>docs/</code> o <code>_site/</code>), R Markdown, Jupyter Book, MkDocs o Vite, ya renderizada y comprimida. Tiene que traer un <code>index.html</code>. Hasta {formatBytes(MAX_PORTAL_ZIP_BYTES)}.
                        </p>
                        <input ref={portalPicker} type="file" accept=".zip,application/zip" className="sr-only" tabIndex={-1} aria-label="Elegir el .zip del sitio" onChange={(event) => void pickPortal(event.target.files?.[0])} />
                        <button type="button" className="button-secondary" data-autofocus disabled={Boolean(busy)} onClick={() => portalPicker.current?.click()}>
                          {form.siteDir ? "Elegir otro .zip" : "Elegir el .zip"}
                        </button>
                      </div>
                      {form.siteDir && portalInfo && (
                        <p className="doc-hint">
                          Listo: {plural(portalInfo.files, "archivo", "archivos")} · {formatBytes(portalInfo.bytes)}. Todavía no es público: se publica en el último paso.
                        </p>
                      )}
                      <p className="doc-hint">
                        Los nombres de archivo no pueden llevar acentos ni «ñ». El sitio se muestra en un marco aislado, sin acceso a la sesión del portal.
                      </p>
                    </div>
                  )}

                  {mode === "md" && (
                    <div role="tabpanel" id="da-panel-md" aria-labelledby="da-tab-md" className="da-md">
                      <label className="admin-field">
                        <span>Escribe el documento</span>
                        <textarea
                          rows={12}
                          value={mdText}
                          data-autofocus
                          placeholder={"## Resumen\n\nEscribe aquí. Admite títulos con #, **negrita**, *cursiva*, listas con - y enlaces [texto](https://…)."}
                          onChange={(event) => setMdText(event.target.value)}
                        />
                      </label>
                      <div className="da-md__prev">
                        <span className="da-label">Así se verá</span>
                        {mdText.trim() ? (
                          <article className="dv-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(mdText) }} />
                        ) : (
                          <p className="oda-muted">La vista previa aparece mientras escribes.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {mode === "link" && (
                    <div role="tabpanel" id="da-panel-link" aria-labelledby="da-tab-link">
                      <label className="admin-field">
                        <span>Enlace al documento</span>
                        <input
                          type="url"
                          inputMode="url"
                          value={form.url ?? ""}
                          data-autofocus
                          placeholder="https://repositorio.udes.edu.co/…"
                          onChange={(event) => set("url", event.target.value)}
                        />
                        <small className="doc-hint">
                          {hostOf(form.url) === REPO_HOST ? (
                            <b>Reconocido como un documento del Repositorio Digital.</b>
                          ) : (
                            "Se abre en una pestaña nueva. Sin vista previa: el sitio de destino decide cómo se ve, y si lo mueve el enlace se rompe sin avisar."
                          )}
                        </small>
                      </label>
                    </div>
                  )}
                </section>
              )}

              {step === 2 && (
                <section aria-labelledby="da-s2">
                  <h3 id="da-s2" ref={stepHead} tabIndex={-1} className="da-wiz__h">
                    Paso 2 · Revisión de {form.kind === "enlace" ? (form.url ?? "") : form.fileName}
                  </h3>
                  <div className="da-review">
                    <ul className="da-checks" ref={checksList} aria-live="polite" aria-label="Comprobaciones">
                      {checks.map((check, index) => (
                        <CheckRow key={index} check={check} />
                      ))}
                    </ul>
                    <figure className="da-review__thumb">
                      <PreviewThumb item={previewItem} url={auto.url} size="lg" />
                      <figcaption>
                        {checksDone ? (auto.url ? "Miniatura generada" : "Portada con el tipo y el título") : "Preparando…"}
                      </figcaption>
                    </figure>
                  </div>
                </section>
              )}

              {step === 3 && (
                <section aria-labelledby="da-s3">
                  <h3 id="da-s3" ref={stepHead} tabIndex={-1} className="da-wiz__h">
                    {editing ? "Ficha del documento" : "Paso 3 · Ficha y publicación"}
                  </h3>
                  <div className="da-ficha">
                    <div className="da-ficha__form">
                      <label className="admin-field">
                        <span>Título</span>
                        <input
                          type="text"
                          value={form.title}
                          data-autofocus
                          placeholder="Acta 014 de noviembre"
                          onChange={(event) => { titleEdited.current = true; set("title", event.target.value); }}
                        />
                      </label>

                      {form.kind === "enlace" && (
                        <label className="admin-field">
                          <span>Enlace</span>
                          <input type="url" inputMode="url" value={form.url ?? ""} placeholder="https://udes.edu.co/documento.pdf" onChange={(event) => set("url", event.target.value)} />
                          <small className="doc-hint">Apunta a algo que vive fuera del portal: si la página de destino cambia, el enlace se rompe sin avisar.</small>
                        </label>
                      )}

                      <div className="da-two">
                        <label className="admin-field">
                          <span>Año</span>
                          <input type="number" min={1970} max={2200} value={form.year ?? ""} onChange={(event) => set("year", event.target.value ? Number(event.target.value) : null)} />
                        </label>
                        <label className="admin-field">
                          <span>Hasta el año <small>opcional</small></span>
                          <input type="number" min={1970} max={2200} value={form.yearTo ?? ""} disabled={form.year === null} placeholder="si cubre un rango" onChange={(event) => set("yearTo", event.target.value ? Number(event.target.value) : null)} />
                        </label>
                        <label className="admin-field">
                          <span>Versión <small>opcional</small></span>
                          <input type="text" value={form.version} placeholder="v3" onChange={(event) => set("version", event.target.value)} />
                        </label>
                      </div>

                      <div className="da-two da-two--wide">
                        <label className="admin-field">
                          <span>Sección</span>
                          <select
                            value={form.collectionId}
                            onChange={(event) => setForm((c) => ({ ...c, collectionId: event.target.value, supersedes: null }))}
                          >
                            {sectionOptions.map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.id === root.id ? (sections.length ? `${root.title} (sin sección)` : root.title) : node.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-field">
                          <span>Reemplaza a</span>
                          <select value={form.supersedes ?? ""} disabled={replaceable.length === 0} onChange={(event) => set("supersedes", event.target.value || null)}>
                            <option value="">No reemplaza a ninguno</option>
                            {replaceable.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.title}
                                {row.version ? ` · ${row.version}` : ""}
                              </option>
                            ))}
                          </select>
                          <small className="doc-hint">La edición que este documento deja atrás; en el portal se pliega debajo.</small>
                        </label>
                      </div>

                      <label className="admin-field">
                        <span>
                          Resumen corto
                          <small>Es lo que se ve en el índice, en 2 líneas.</small>
                        </span>
                        <textarea
                          rows={2}
                          maxLength={SUMMARY_HARD}
                          value={form.summary}
                          aria-describedby="da-count"
                          placeholder="Qué contiene, para quien no lo va a abrir."
                          onChange={(event) => set("summary", event.target.value)}
                        />
                        <small id="da-count" className="da-count" data-bad={form.summary.length > SUMMARY_SOFT || undefined}>
                          {form.summary.length} / {SUMMARY_SOFT} recomendado · tope {SUMMARY_HARD}
                        </small>
                      </label>

                      <label className="admin-field">
                        <span>
                          Descripción completa <small>opcional · se abre con «Leer más»</small>
                        </span>
                        <textarea rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} />
                      </label>

                      {form.kind === "archivo" && (
                        <div className="admin-field">
                          <span>Archivo</span>
                          <p className="doc-file">
                            <Icon name="document" size={15} />
                            <b>{form.fileName || "Archivo del repositorio"}</b>
                            <span>
                              {FORMAT_LABEL[format]}
                              {form.sizeBytes ? ` · ${formatBytes(form.sizeBytes)}` : ""}
                            </span>
                          </p>
                          {form.siteDir ? (
                            <span className="da-inline">
                              <input ref={portalPicker} type="file" accept=".zip,application/zip" className="sr-only" tabIndex={-1} aria-label="Elegir el .zip que reemplaza al sitio actual" onChange={(event) => void pickPortal(event.target.files?.[0])} />
                              <button type="button" className="oda-link-button" disabled={Boolean(busy)} onClick={() => portalPicker.current?.click()}>
                                Reemplazar el sitio (.zip)
                              </button>
                              <small className="doc-hint">Hasta {formatBytes(MAX_PORTAL_ZIP_BYTES)}. El sitio anterior se borra al guardar.</small>
                            </span>
                          ) : (
                            <span className="da-inline">
                              <input ref={filePicker} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Elegir el archivo que reemplaza al actual" onChange={(event) => void pickFile(event.target.files?.[0])} />
                              <button type="button" className="oda-link-button" disabled={Boolean(busy)} onClick={() => filePicker.current?.click()}>
                                Reemplazar el archivo
                              </button>
                              <small className="doc-hint">Hasta {formatBytes(MAX_DOC_BYTES)}. El anterior se borra al guardar.</small>
                            </span>
                          )}
                        </div>
                      )}

                      {isWeb && (
                        <>
                          <label className="admin-field">
                            <span>Tipo de HTML</span>
                            <select value={form.flavor} onChange={(event) => set("flavor", event.target.value as DocFlavor)}>
                              <option value="">Común</option>
                              <option value="quarto">Quarto</option>
                              <option value="rmarkdown">R Markdown</option>
                            </select>
                            <small className="doc-hint">Se detectó leyendo el archivo; corrígelo si no acertó.</small>
                          </label>
                          <div className="admin-field">
                            <span>Código fuente <small>opcional</small></span>
                            <input ref={sourcePicker} type="file" accept=".qmd,.rmd,.r" className="sr-only" tabIndex={-1} aria-label="Elegir el código fuente (.qmd, .Rmd o .R)" onChange={(event) => void pickSource(event.target.files?.[0])} />
                            <span className="da-inline">
                              {form.sourcePath && <b className="da-inline__name">{form.sourceName || "Código fuente"}</b>}
                              <button type="button" className="oda-link-button" disabled={Boolean(busy)} onClick={() => sourcePicker.current?.click()}>
                                {form.sourcePath ? "Cambiar el código" : "Añadir código (.qmd, .Rmd, .R)"}
                              </button>
                              {form.sourcePath && (
                                <button type="button" className="oda-link-button" data-tone="danger" onClick={() => void clearSource()}>
                                  Quitar
                                </button>
                              )}
                            </span>
                          </div>
                        </>
                      )}

                      <fieldset className="da-fieldset">
                        <legend>Miniatura</legend>
                        <div className="da-thumbrow">
                          <PreviewThumb item={previewItem} url={shownUrl} size="lg" />
                          <div className="da-choices" role="radiogroup" aria-label="Origen de la miniatura">
                            <label className="da-choice" data-on={thumbMode === "auto" || undefined}>
                              <input type="radio" name="da-tmode" checked={thumbMode === "auto"} onChange={() => setThumbMode("auto")} />
                              <b>Automática</b>
                              <small>{THUMB_NOTE[format]}</small>
                            </label>
                            <label className="da-choice" data-on={thumbMode === "up" || undefined}>
                              <input type="radio" name="da-tmode" checked={thumbMode === "up"} onChange={() => { setThumbMode("up"); if (!custom.blob) imagePicker.current?.click(); }} />
                              <b>Subir una imagen</b>
                              <small>PNG, JPG o WebP; se recorta a 3:4.</small>
                            </label>
                          </div>
                        </div>
                        <input ref={imagePicker} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Elegir la imagen de la miniatura" onChange={(event) => void pickImage(event.target.files?.[0])} />
                        <span className="da-inline">
                          {thumbMode === "up" && (
                            <button type="button" className="oda-link-button" disabled={thumbBusy} onClick={() => imagePicker.current?.click()}>
                              {custom.blob ? "Elegir otra imagen" : "Elegir la imagen"}
                            </button>
                          )}
                          {editing && form.kind === "archivo" && (
                            <button type="button" className="oda-link-button" disabled={thumbBusy} onClick={() => void regenerate()}>
                              {thumbBusy ? "Generando…" : "Regenerar la miniatura"}
                            </button>
                          )}
                          {hasThumb && (
                            <button type="button" className="oda-link-button" data-tone="danger" onClick={removeThumb}>
                              Quitar la miniatura
                            </button>
                          )}
                        </span>
                        {thumbNote && <small className="doc-hint" role="status">{thumbNote}</small>}
                      </fieldset>

                      <fieldset className="da-fieldset">
                        <legend>Visibilidad</legend>
                        <div className="da-choices da-choices--row" role="radiogroup" aria-label="Quién ve el documento en el portal">
                          <label className="da-choice" data-on={form.visibility === "publico" || undefined}>
                            <input type="radio" name="da-vis" checked={form.visibility === "publico"} onChange={() => set("visibility", "publico")} />
                            <b>Público</b>
                            <small>Cualquier persona lo ve en el portal, sin iniciar sesión.</small>
                          </label>
                          <label className="da-choice" data-on={form.visibility === "intranet" || undefined}>
                            <input type="radio" name="da-vis" checked={form.visibility === "intranet"} onChange={() => set("visibility", "intranet")} />
                            <b>Solo intranet</b>
                            <small>Se oculta del portal público. El archivo no se protege: quien tenga su dirección exacta podría abrirlo.</small>
                          </label>
                        </div>
                      </fieldset>
                    </div>

                    <aside className="da-ficha__side" aria-label="Vista previa">
                      <div className="da-box">
                        <h4>Cómo se verá en el portal</h4>
                        <div className="da-prow">
                          <PreviewThumb item={previewItem} url={shownUrl} size="md" />
                          <div className="da-prow__text">
                            <span className="da-prow__meta">
                              <TipoDoc format={format} />
                              {form.year !== null && <span>{form.yearTo && form.yearTo !== form.year ? `${form.year}-${form.yearTo}` : form.year}</span>}
                              {form.version && <span>{form.version}</span>}
                              {form.visibility === "intranet" && <span className="oda-badge" data-tone="warn">Intranet</span>}
                            </span>
                            <b>{form.title.trim() || "Título del documento"}</b>
                            <p>{shortDescription(form) || "Sin resumen: el índice solo mostrará el título."}</p>
                          </div>
                        </div>
                      </div>
                      <div className="da-box">
                        <h4>Vista previa del documento</h4>
                        {canPreview ? (
                          <button type="button" className="button-secondary" onClick={() => setPreviewing(true)}>
                            <Icon name="eye" size={15} /> Abrir la vista previa del documento
                          </button>
                        ) : (
                          <p className="oda-muted">
                            {form.kind === "enlace" ? "Los enlaces no tienen vista previa: el sitio de destino decide cómo se ve." : "Este tipo de archivo no tiene vista previa en el portal."}
                          </p>
                        )}
                      </div>
                    </aside>
                  </div>
                </section>
              )}
            </div>

            <footer className="da-wiz__foot">
              {step === 1 && (
                <>
                  <span className="da-wiz__note">Nada se publica hasta el último paso.</span>
                  <span className="da-wiz__btns">
                    <button type="button" className="button-secondary" onClick={close}>Cancelar</button>
                    <button type="button" className="button-primary" disabled={Boolean(busy) || (mode === "file" && !form.path)} onClick={() => void review()}>
                      Revisar
                    </button>
                  </span>
                </>
              )}
              {step === 2 && (
                <>
                  <button type="button" className="button-secondary" onClick={() => { setStep(1); setError(""); }}>Atrás</button>
                  <button type="button" className="button-primary" disabled={!checksDone} onClick={() => { setStep(3); setError(""); }}>
                    Continuar
                  </button>
                </>
              )}
              {step === 3 && (
                <>
                  {editing ? (
                    <button type="button" className="button-secondary" onClick={close}>Cancelar</button>
                  ) : (
                    <button type="button" className="button-secondary" disabled={saving} onClick={() => { setStep(2); setError(""); }}>Atrás</button>
                  )}
                  <span className="da-wiz__btns">
                    {problem && <span className="admin-field-error da-wiz__problem"><Icon name="alert" size={14} /> {problem}</span>}
                    {editing ? (
                      <>
                        {wasPublished && (
                          <button type="button" className="button-secondary" disabled={saving || Boolean(busy)} onClick={() => void finish("borrador")}>
                            Pasar a borrador
                          </button>
                        )}
                        <button type="button" className="button-primary" disabled={saving || Boolean(busy)} onClick={() => void finish(wasPublished ? "publicado" : "borrador")}>
                          {saving ? "Guardando…" : "Guardar cambios"}
                        </button>
                        {!wasPublished && (
                          <button type="button" className="button-primary" disabled={saving || Boolean(busy)} onClick={() => void finish("publicado")}>
                            <Icon name="check" size={15} /> Publicar ahora
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button type="button" className="button-secondary" disabled={saving || Boolean(busy)} onClick={() => void finish("borrador")}>
                          Guardar como borrador
                        </button>
                        <button type="button" className="button-primary" disabled={saving || Boolean(busy)} onClick={() => void finish("publicado")}>
                          {saving ? "Guardando…" : (<><Icon name="check" size={15} /> Publicar ahora</>)}
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </footer>

            {previewing && <PreviewModal item={previewItem} nested onClose={() => setPreviewing(false)} />}
          </>
        );
      }}
    </Modal>
  );
}

/* --- Piezas ---------------------------------------------------------------------------------- */

/** La miniatura de la imagen recién generada, o la portada/imagen guardada. */
function PreviewThumb({ item, url, size }: { item: DocItem; url: string | null; size: "sm" | "md" | "lg" }) {
  if (url) {
    return (
      <span className={`dv-tn dv-tn--${size} dv-tn--img`} aria-hidden="true">
        <img src={url} alt="" />
      </span>
    );
  }
  if (item.thumbPath) return <DocThumb item={item} size={size} />;
  return <ThumbCover format={formatOf(item)} size={size} />;
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const tabs: { id: Mode; label: string; icon: "upload" | "pen" | "link" }[] = [
    { id: "file", label: "Subir archivo", icon: "upload" },
    { id: "portal", label: "Subir sitio (.zip)", icon: "upload" },
    { id: "md", label: "Escribir en Markdown", icon: "pen" },
    { id: "link", label: "Pegar enlace", icon: "link" },
  ];
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === mode);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`da-tab-${next.id}`)?.focus());
  }
  return (
    <div className="da-tabs" role="tablist" aria-label="Cómo añadir el documento" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`da-tab-${tab.id}`}
          aria-selected={mode === tab.id}
          aria-controls={`da-panel-${tab.id}`}
          tabIndex={mode === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          <Icon name={tab.icon} size={14} /> {tab.label}
        </button>
      ))}
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  const icon = useRef<HTMLSpanElement>(null);
  const previous = useRef<CheckState>(check.state);
  useEffect(() => {
    if (previous.current !== check.state && check.state !== "wait" && icon.current && !reducedMotion()) {
      gsap.fromTo(icon.current, { scale: 0.6, opacity: 0.2 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power3.out", clearProps: "opacity,transform" });
    }
    previous.current = check.state;
  }, [check.state]);
  return (
    <li data-state={check.state}>
      <span ref={icon} className="da-checks__st" aria-hidden="true">
        {check.state === "wait" ? <span className="oda-save__spinner" /> : <Icon name={check.state === "ok" ? "check" : "alert"} size={13} />}
      </span>
      <div>
        <b>{check.title}</b>
        {check.detail && <span>{check.detail}</span>}
        <span className="sr-only">{check.state === "ok" ? "Correcto" : check.state === "warn" ? "Con aviso" : "Revisando"}</span>
      </div>
    </li>
  );
}
