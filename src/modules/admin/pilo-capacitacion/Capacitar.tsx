/* =============================================================================
   Capacitación de Pilo · Bandeja y capacitación.

   A la izquierda, «Lo que Pilo no supo» de a 10, paginada en el servidor y
   enlazable (?pagina=3; el filtro de capa va en ?capa=). A la derecha, para la
   pregunta elegida, el formulario para enseñar.

   El guardado no se duplica: «Enseñar a Pilo» abre CatalogModal, el mismo del
   catálogo, con la pregunta y la respuesta ya escritas. Al guardarse, la
   pregunta se cierra con la clave del catálogo (como «Responder» en
   Mr. Pilo en Enseñanza) y se guarda su capa y su público (0180).

   Si cambia de página o de capa y la pregunta elegida ya no está a la vista,
   la selección se limpia. La página se mueve con su salida (saleYLuego) y la
   nueva entra en cascada (entraPagina); el foco vuelve a la lista.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { CatalogModal } from "../pilo/CatalogModal";
import type { CatalogRol, CatalogRow } from "../pilo/catalog-sheet";
import { reasonLabel, useCloseInbox } from "../pilo/inbox";
import type { InboxItem } from "../pilo/inbox";
import { useIndexMemory } from "../pilo/memory";
import { SPACE_COPY } from "../pilo/space";
import type { PiloSpace } from "../pilo/space";
import { StatusMark, plural } from "../pilo/ui";
import { Skeleton, TextArea } from "../pilo-ensenanza/ui";
import { Pager } from "./Pager";
import { PAGE_SIZE, clampPagina, parsePagina, textoRango } from "./paginacion";
import { entraPagina, saleYLuego } from "./motion";
import {
  CAPA_DE_ESPACIO,
  ESPACIO_DE_CAPA,
  PUBLICOS,
  PUBLICO_DE_PARTIDA,
  sinMigracion,
  savePieza,
  useInboxPage,
} from "./store";
import type { Capa, CapaFiltro, Publico } from "./store";

const CAPAS: { id: CapaFiltro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "planeacion", label: "Institucional" },
  { id: "ensenanza", label: "Académica" },
];

const TIPOS = [
  { id: "respuesta", label: "Respuesta del catálogo" },
  { id: "documento", label: "Documento o norma" },
  { id: "cifra", label: "Cifra en vivo" },
] as const;
type Tipo = (typeof TIPOS)[number]["id"];

const CAPA_TEXTO: Record<Capa, { label: string; quien: string }> = {
  institucional: { label: "Institucional", quien: "Así respondería Pilo Institucional" },
  academica: { label: "Académica", quien: "Así respondería Pilo Académico" },
};

/** Lo que se aviso al terminar de enseñar: la pregunta que salió de la bandeja y, si algo falló, qué. */
export interface Enseñada {
  pregunta: string;
  aviso: string | null;
}

export function Capacitar() {
  const [params, setParams] = useSearchParams();
  const capa = parseCapa(params.get("capa"));
  const pedida = parsePagina(params.get("pagina"));
  const q = useInboxPage(pedida, capa);
  const total = q.data?.total ?? 0;
  const page = clampPagina(pedida, total);
  const rows = q.data?.rows ?? [];
  const [sel, setSel] = useState<number | null>(null);
  const [hecha, setHecha] = useState<Enseñada | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const llevaFoco = useRef(false);
  const cur = rows.find((r) => r.id === sel) ?? null;

  // Lo que ya no está a la vista se suelta: la selección no sobrevive a la página.
  useEffect(() => {
    if (sel !== null && q.data && !rows.some((r) => r.id === sel)) setSel(null);
  }, [q.data, rows, sel]);

  // La página pedida no existe (se atendieron preguntas): va a la última, sin dejar la dirección rota.
  useEffect(() => {
    if (q.data && !q.isPlaceholderData && pedida !== page) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (page <= 1) next.delete("pagina");
          else next.set("pagina", String(page));
          return next;
        },
        { replace: true },
      );
    }
  }, [q.data, q.isPlaceholderData, pedida, page, setParams]);

  // Una página nueva entra una vez; la de antes ya salió.
  const entradaClave = `${capa}:${page}:${q.dataUpdatedAt}`;
  useLayoutEffect(() => {
    if (!q.data || q.isPlaceholderData || !list.current) return;
    entraPagina([...list.current.children]);
    if (llevaFoco.current) {
      llevaFoco.current = false;
      list.current.focus();
    }
  }, [entradaClave]);

  const irA = (to: number) => {
    if (to === page || to < 1) return;
    llevaFoco.current = true;
    const filas = list.current ? [...list.current.children] : [];
    saleYLuego(filas, () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (to <= 1) next.delete("pagina");
        else next.set("pagina", String(to));
        return next;
      }),
    );
  };

  const elegirCapa = (c: CapaFiltro) => {
    if (c === capa) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("pagina");
      if (c === "todas") next.delete("capa");
      else next.set("capa", c);
      return next;
    });
  };

  return (
    <div className="pis-sheet">
      <div className="pis-group">
        <div className="pis-group__head">
          <h3 id="pcap-bandeja">Lo que Pilo no supo</h3>
          <small>{q.data ? (total > 0 ? plural(total, "pregunta abierta", "preguntas abiertas") : "Nada pendiente") : "Leyendo la bandeja"}</small>
        </div>

        <div className="pis-seg pcap-capas" role="radiogroup" aria-label="Espacio de la bandeja">
          {CAPAS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={capa === c.id} onClick={() => elegirCapa(c.id)}>
              {c.label}
            </button>
          ))}
        </div>

        {q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : q.isPending ? (
          <Skeleton rows={4} label="Leyendo la bandeja" />
        ) : total === 0 ? (
          <p className="pis-small">Nada pendiente en esta vista. Las preguntas que Pilo no sepa responder llegan aquí.</p>
        ) : (
          <>
            <p className="pcap-range" role="status" aria-live="polite">
              {textoRango(page, total)}
              <span className="sr-only">
                {" "}
                · Página {page} de {Math.ceil(total / PAGE_SIZE)}
              </span>
            </p>
            <ul className="pcap-list" ref={list} tabIndex={-1} aria-labelledby="pcap-bandeja">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" className="pcap-q press" aria-pressed={r.id === sel} onClick={() => setSel(r.id)}>
                    <span className="pcap-q__text">
                      <strong>{r.question}</strong>
                      <small>
                        {reasonLabel(r.reason)} · {r.times === 1 ? "1 vez" : `${r.times.toLocaleString("es-CO")} veces`}
                      </small>
                    </span>
                    <CapaTag espacio={r.space} />
                  </button>
                </li>
              ))}
            </ul>
            <Pager page={page} total={total} size={PAGE_SIZE} onGo={irA} />
          </>
        )}
      </div>

      <div className="pis-group">
        <div className="pis-group__head">
          <h3>Capacitar a Pilo</h3>
          {cur && <small>{SPACE_COPY[cur.space ?? "planeacion"].screen}</small>}
        </div>
        {cur ? (
          <EnsenarForm key={cur.id} item={cur} onDone={setHecha} />
        ) : (
          <p className="pis-small">Elija una pregunta de la bandeja para enseñarle la respuesta. Lo que enseñe lo usa en su próxima respuesta.</p>
        )}
        {hecha && (
          <p className="pcap-hecha" role="status">
            <StatusMark tone="ok">Enseñada: «{hecha.pregunta}». Ya no está en la bandeja.</StatusMark>
            {hecha.aviso && <span className="pis-error">{hecha.aviso}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/** Una etiqueta de capa: con su palabra y su glifo, no solo con el color. */
function CapaTag({ espacio }: { espacio?: PiloSpace }) {
  const capa = CAPA_DE_ESPACIO[espacio ?? "planeacion"];
  return (
    <span className="pcap-tag" data-capa={capa}>
      <i aria-hidden="true" />
      {CAPA_TEXTO[capa].label}
    </span>
  );
}

function parseCapa(raw: string | null): CapaFiltro {
  return raw === "planeacion" || raw === "ensenanza" ? raw : "todas";
}

/* --- El formulario para enseñar ----------------------------------------------------------- */

function EnsenarForm({ item, onDone }: { item: InboxItem; onDone: (hecha: Enseñada) => void }) {
  const capaInicial = CAPA_DE_ESPACIO[item.space ?? "planeacion"];
  const [tipo, setTipo] = useState<Tipo>("respuesta");
  const [capa, setCapa] = useState<Capa>(capaInicial);
  const [publico, setPublico] = useState<Publico[]>(PUBLICO_DE_PARTIDA[capaInicial]);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const close = useCloseInbox();
  const indexer = useIndexMemory(ESPACIO_DE_CAPA[capa]);

  const space = ESPACIO_DE_CAPA[capa];
  const listo = tipo === "respuesta" && texto.trim().length > 0 && publico.length > 0;

  const elegirCapa = (c: Capa) => {
    setCapa(c);
    setPublico(PUBLICO_DE_PARTIDA[c]);
  };

  const togglePublico = (id: Publico) => setPublico((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Un público «solo estudiantes» o «solo profesores» es el rol de la respuesta; lo demás es para todos.
  const rol: CatalogRol = publico.includes("est") && !publico.includes("prof") ? "estudiante" : publico.includes("prof") && !publico.includes("est") ? "profesor" : "";

  // Estable entre pintadas: CatalogModal reinicia sus campos cada vez que cambia esta entrada.
  const entry = useMemo<Partial<CatalogRow>>(
    () => ({
      kind: "respuesta",
      question: item.question,
      answer: texto.trim(),
      source_title: SPACE_COPY[space].sourceTitle,
      source_path: SPACE_COPY[space].sourcePath,
      rol,
    }),
    [item.question, texto, space, rol],
  );

  return (
    <div className="pcap-form">
      <div className="pcap-field">
        <span className="pen-field__label">Qué le enseña</span>
        <div className="pis-seg" role="radiogroup" aria-label="Tipo de conocimiento">
          {TIPOS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} onClick={() => setTipo(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tipo === "respuesta" && (
        <TextArea
          label="La respuesta"
          value={texto}
          max={4000}
          rows={5}
          placeholder="Escriba la respuesta oficial."
          hint="Es la respuesta que Pilo dará primero, sin IA, cada vez que alguien pregunte algo parecido."
          onChange={setTexto}
        />
      )}
      {tipo === "documento" && (
        <p className="pis-small">
          Un documento se carga en la memoria del Mr. Pilo que corresponda. Desde esta pantalla se enseña con una respuesta del catálogo.
        </p>
      )}
      {tipo === "cifra" && <p className="pis-small">Las cifras en vivo llegan de UDES en Cifras. Esta pantalla todavía no las enseña.</p>}

      <div className="pcap-field">
        <span className="pen-field__label">Capa que piensa</span>
        <div className="pis-seg" role="radiogroup" aria-label="Capa que piensa">
          {(["institucional", "academica"] as Capa[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={capa === c} onClick={() => elegirCapa(c)}>
              {CAPA_TEXTO[c].label}
            </button>
          ))}
        </div>
      </div>

      <div className="pcap-field">
        <span className="pen-field__label">Público que puede oírla</span>
        <div className="pis-seg pcap-publico" role="group" aria-label="Público que puede oírla">
          {PUBLICOS.map((p) => {
            const on = publico.includes(p.id);
            return (
              <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={() => togglePublico(p.id)}>
                {p.label}
              </button>
            );
          })}
        </div>
        <small className="pcap-hint">La capa decide cómo razona Pilo. El público decide quién recibe la respuesta: lo del Consejo Directivo nunca llega a un estudiante.</small>
      </div>

      <div className="pcap-prev" aria-live="polite">
        <span className="pcap-tag" data-capa={capa}>
          <i aria-hidden="true" />
          {CAPA_TEXTO[capa].quien}
        </span>
        <p>{texto.trim() || "Escriba la respuesta para ver cómo la diría Pilo."}</p>
      </div>

      <div className="pcap-actions">
        <button type="button" className="button-primary press" disabled={!listo || close.isPending} onClick={() => setAbierto(true)}>
          Enseñar a Pilo
        </button>
        {!listo && <small className="pcap-hint">{tipo === "respuesta" ? "Escriba la respuesta y elija al menos un público." : "Esta forma de enseñar llega en la próxima entrega."}</small>}
      </div>
      {close.isError && (
        <p className="pis-error" role="alert">
          No se pudo cerrar la pregunta: {(close.error as Error).message}
        </p>
      )}

      <CatalogModal
        open={abierto}
        onClose={() => setAbierto(false)}
        defaultKind="respuesta"
        initialEntry={entry}
        isEditing={false}
        space={space}
        onSaved={(saved) => {
          setAbierto(false);
          // La pregunta sale de la bandeja con la clave de la respuesta nueva.
          close.mutate({ id: item.id, status: "resuelta", key: saved.key });
          if (!indexer.isPending) indexer.mutate(undefined);
          const pregunta = item.question;
          savePieza(space, saved.key, capa, publico).then(
            () => onDone({ pregunta, aviso: null }),
            (e: unknown) =>
              onDone({
                pregunta,
                aviso: sinMigracion(e as { code?: string; message?: string })
                  ? "Falta aplicar la migración 0180: la respuesta entró al catálogo, pero no se guardó su capa ni su público."
                  : `La respuesta entró al catálogo, pero no se guardó su capa ni su público: ${(e as Error).message}`,
              }),
          );
        }}
      />
    </div>
  );
}
