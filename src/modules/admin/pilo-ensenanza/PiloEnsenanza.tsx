/* =============================================================================
   Intranet · Mr. Pilo en Enseñanza (solo administración).

   El segundo Pilo: innovación educativa, políticas institucionales y mirada
   global. Es un espacio aparte del Pilo de Planeación, con cuatro pestañas en
   el riel de la cabecera, enlazables por la dirección (?seccion=memoria):

     Pregúntele a Pilo   su página, cómo se presenta, cómo le habla a cada rol,
                         sus cupos y el chat emergente en otros portales.
     Memoria             sus fuentes, su índice por significado, la prueba y sus
                         respuestas guardadas (documentos, mapa y Moodle llegan
                         en la próxima entrega).
     Catálogo            sus respuestas oficiales y capciosas, y su bandeja.
     Bitácora de uso     su uso de hoy, por rol, y sus pedidos.

   No hay pestañas de Conexión ni de Voz: el servicio, la clave, el modelo y la
   voz son los de «Mr. Pilo con IA», y se dice con un enlace.

   Su catálogo, sus respuestas guardadas, su bandeja y su bitácora son suyos:
   todo lo que esta pantalla lee o escribe lleva space = 'ensenanza'.

   La ficha (pilo_spaces) espera a «Guardar cambios»; el catálogo, la bandeja y
   el índice se aplican al momento. Sin la migración 0113 la pantalla se pinta
   con los valores de partida, lo dice arriba y deja los controles apagados.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { Icon } from "../../../components/ui/Icon";
import { PiloFace } from "../../../components/pilo/PiloFace";
import type { PiloFaceHandle } from "../../../components/pilo/PiloFace";
import { usePiloSettings } from "../pilo/store";
import { joinNames } from "../pilo/mesh-view";
import { StatusMark, Switch, plural } from "../pilo/ui";
import "../pilo/pilo-settings.css";
import { PreguntaPanel } from "./PreguntaPanel";
import type { SpaceEditor } from "./PreguntaPanel";
import { MemoriaPanel } from "./MemoriaPanel";
import { CatalogoPanel } from "./CatalogoPanel";
import { BitacoraPanel } from "./BitacoraPanel";
import { SPACE, TABS, dirtyTabs, parseTab, useSaveSpace, useSpace, useSpaceMemoryCounts, useSpaceUsage } from "./store";
import type { RolId, RoleSettings, SpaceLoad, SpaceSettings, TabId } from "./store";
import { confirmSave, fillBar, revealSection } from "./motion";
import "./pilo-ensenanza.css";

const SHELL = {
  section: "pilo_ensenanza" as const,
  kicker: "Sistema",
  title: "Mr. Pilo en Enseñanza",
  description: "El segundo Mr. Pilo: innovación educativa, políticas institucionales y mirada global. Con su propia memoria, catálogo y bitácora.",
};

const AUD_TEXT = { admin: "solo la administración", sesion: "quien tiene sesión", publico: "el público" } as const;

export function PiloEnsenanzaSettings() {
  const space = useSpace(SPACE);
  if (space.data) return <Editor load={space.data} />;
  return (
    <AdminShell {...SHELL}>
      {space.isPending ? <LoadingBlock rows={6} label="Cargando a Mr. Pilo en Enseñanza" /> : <ErrorBlock error={space.error} onRetry={() => space.refetch()} />}
    </AdminShell>
  );
}

/* --- Las pestañas ------------------------------------------------------------------------------ */

function Tabs({ current, dirty, onPick }: { current: TabId; dirty: TabId[]; onPick: (id: TabId, via: "pointer" | "keyboard") => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === current);
    const to =
      e.key === "ArrowRight" ? (at + 1) % TABS.length
      : e.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    onPick(TABS[to].id, "keyboard");
    refs.current[TABS[to].id]?.focus();
  };
  return (
    <div className="admin-rail pis-tabs" role="tablist" aria-label="Secciones de Mr. Pilo en Enseñanza" onKeyDown={onKey}>
      {TABS.map((t) => {
        const on = t.id === current;
        return (
          <button
            key={t.id}
            ref={(el) => (refs.current[t.id] = el)}
            type="button"
            role="tab"
            id={`pen-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`pen-panel-${t.id}`}
            aria-current={on ? "page" : undefined}
            tabIndex={on ? 0 : -1}
            className="admin-rail__tab"
            onClick={() => onPick(t.id, "pointer")}
          >
            {t.label}
            {dirty.includes(t.id) && (
              <span className="pis-tabs__dot" title="Cambios sin guardar">
                <span className="sr-only">(cambios sin guardar)</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --- La franja de estado ------------------------------------------------------------------------ */

function Fact({ label, children, detail, onClick }: { label: string; children: ReactNode; detail?: ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="pis-fact" onClick={onClick}>
        <span className="pis-fact__label">{label}</span>
        {children}
        {detail && <small>{detail}</small>}
      </button>
    </li>
  );
}

function UsageBar({ share }: { share: number }) {
  const bar = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useLayoutEffect(() => {
    fillBar(bar.current, share, started.current ? undefined : 0);
    started.current = true;
  }, [share]);
  return (
    <i className="pis-fact__meter" aria-hidden="true">
      <span ref={bar} />
    </i>
  );
}

/* --- El editor ------------------------------------------------------------------------------------ */

function Editor({ load }: { load: SpaceLoad }) {
  const { settings: initial, missing } = load;
  const [s, setS] = useState<SpaceSettings>(initial);
  const [saved, setSaved] = useState(initial);
  const save = useSaveSpace(initial.id);
  const shared = usePiloSettings();
  const usage = useSpaceUsage(initial.id, !missing);
  const counts = useSpaceMemoryCounts(initial.id, !missing);
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("seccion"));
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set([tab]));
  const via = useRef<"pointer" | "keyboard" | null>(null);
  const panels = useRef<Record<string, HTMLDivElement | null>>({});
  const face = useRef<PiloFaceHandle>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const [justSaved, setJustSaved] = useState(0);

  useEffect(() => {
    setS(initial);
    setSaved(initial);
  }, [initial]);

  useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])));
  }, [tab]);

  // Cambiar de pestaña con el puntero se ve; con el teclado, no.
  useLayoutEffect(() => {
    if (via.current === "pointer") revealSection(panels.current[tab]);
    via.current = null;
  }, [tab]);

  // El guardado se confirma una vez: la marca del pie y un asentimiento de Pilo.
  useLayoutEffect(() => {
    if (!justSaved) return;
    confirmSave(mark.current);
    face.current?.nod();
  }, [justSaved]);

  const go = (id: TabId, how: "pointer" | "keyboard" = "pointer") => {
    if (id === tab) return;
    via.current = how;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("seccion", id);
        return next;
      },
      { replace: true },
    );
  };

  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);
  const changed = useMemo(() => dirtyTabs(s, saved), [s, saved]);
  const set: SpaceEditor["set"] = (key, value) => setS((prev) => ({ ...prev, [key]: value }));
  const setRole = (rol: RolId, patch: Partial<RoleSettings>) => setS((prev) => ({ ...prev, roles: { ...prev.roles, [rol]: { ...prev.roles[rol], ...patch } } }));
  const ed: SpaceEditor = { s, saved, set, setRole, missing, shared: shared.data ?? null };

  // Lo que dice la franja de estado.
  const aiReady = Boolean(shared.data?.enabled) && shared.data?.functions.preguntar !== false;
  const status = missing ? "Falta aplicar la migración 0113" : !s.on ? "Cerrado: nadie puede preguntarle" : `Abierto para ${AUD_TEXT[s.aud]}`;
  const today = usage.data?.today ?? 0;
  const share = saved.daily_limit > 0 ? Math.min(1, today / saved.daily_limit) : 0;
  const passages = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : null;
  const names = changed.map((id) => TABS.find((t) => t.id === id)!.label);
  const after = s.on ? `abierto para ${AUD_TEXT[s.aud]}` : "cerrado";

  const footer = (
    <div className="pis-save" role="region" aria-label="Guardar">
      <span className="pis-save__msg" role="status">
        {missing ? (
          <StatusMark tone="warn">Falta aplicar la migración 0113: no hay dónde guardar todavía.</StatusMark>
        ) : save.isError ? (
          <StatusMark tone="fail">No se guardó: {(save.error as Error).message}</StatusMark>
        ) : dirty ? (
          <StatusMark tone="warn">
            Cambios sin guardar{names.length ? ` en ${joinNames(names)}` : ""}. Al guardar, este Pilo queda {after}.
          </StatusMark>
        ) : (
          <span ref={mark} className="pen-saved">
            <StatusMark tone={s.on ? "ok" : "off"}>Todo guardado. Mr. Pilo en Enseñanza está {after}.</StatusMark>
          </span>
        )}
      </span>
      <span className="pis-save__actions">
        <button type="button" className="button-secondary" disabled={missing || !dirty || save.isPending} onClick={() => setS(saved)}>
          Descartar
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={missing || !dirty || save.isPending}
          onClick={() =>
            save.mutate(s, {
              onSuccess: () => {
                setSaved(s);
                setJustSaved((n) => n + 1);
              },
            })
          }
        >
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </span>
    </div>
  );

  const body: Record<TabId, () => ReactNode> = {
    pregunta: () => <PreguntaPanel ed={ed} />,
    memoria: () => <MemoriaPanel ed={ed} />,
    catalogo: () => <CatalogoPanel ed={ed} />,
    bitacora: () => <BitacoraPanel ed={ed} onQuotas={() => go("pregunta")} />,
  };

  return (
    <AdminShell {...SHELL} rail={<Tabs current={tab} dirty={changed} onPick={go} />} footer={footer}>
      <div className="pis pen">
        {missing && (
          <p className="pis-warn" role="status">
            <strong>Falta aplicar la migración 0113</strong> en la base. Hasta entonces este Pilo no existe: lo de abajo son sus valores de partida y los controles están
            apagados. «Mr. Pilo con IA» sigue funcionando como siempre.
          </p>
        )}

        <section className="pis-status pen-status" aria-label="Estado de Mr. Pilo en Enseñanza">
          <div className="pis-status__main">
            <span className="pen-status__face">
              <PiloFace ref={face} size={56} expression="graduado" alive label="Mr. Pilo en Enseñanza" />
            </span>
            <p>
              <strong>{status}</strong>
              <span>
                Comparte la conexión y la voz con{" "}
                <Link className="pis-link" to="/admin/mr-pilo">
                  Mr. Pilo con IA <Icon name="arrow-right" size={13} />
                </Link>
              </span>
            </p>
            <label className="pis-status__switch">
              <span>{s.on ? "Abierto" : "Cerrado"}</span>
              <Switch big on={s.on} disabled={missing} onChange={(v) => set("on", v)} label="Mr. Pilo en Enseñanza abierto" />
            </label>
          </div>
          <ul className="pis-facts pen-facts">
            <Fact label="Redacta con IA" detail={aiReady ? (s.ai ? "Con el servicio de Mr. Pilo con IA" : "Apagado en este Pilo") : "Mr. Pilo con IA está apagado"} onClick={() => go("pregunta")}>
              <StatusMark tone={!shared.data ? "off" : aiReady && s.ai ? "ok" : "warn"}>{!shared.data ? "Revisando" : aiReady && s.ai ? "Sí" : "No: responde con lo publicado"}</StatusMark>
            </Fact>
            <Fact label="Uso de hoy" detail={<UsageBar share={share} />} onClick={() => go("bitacora")}>
              <StatusMark tone={missing || !usage.data ? "off" : share >= 0.9 ? "warn" : "ok"}>
                {missing || !usage.data ? "Sin contar" : `${today.toLocaleString("es-CO")} de ${saved.daily_limit.toLocaleString("es-CO")}`}
              </StatusMark>
            </Fact>
            <Fact label="Memoria" detail={passages === 0 ? "Se llena con documentos y Moodle" : "Solo de este Pilo"} onClick={() => go("memoria")}>
              <StatusMark tone={passages === null ? "off" : passages === 0 ? "warn" : "ok"}>{passages === null ? "Sin contar" : plural(passages, "pasaje", "pasajes")}</StatusMark>
            </Fact>
          </ul>
        </section>

        {TABS.map((t) =>
          visited.has(t.id) || t.id === tab ? (
            <div key={t.id} id={`pen-panel-${t.id}`} role="tabpanel" aria-labelledby={`pen-tab-${t.id}`} hidden={t.id !== tab} className="pis-panel" ref={(el) => (panels.current[t.id] = el)}>
              <header className="pis-panel__head">
                <h2>{t.title}</h2>
                <p>{t.lead}</p>
              </header>
              {/* Sin 0113 nada se puede guardar: un solo interruptor apaga todos los controles de la hoja. */}
              <fieldset className="pen-sheet" disabled={missing}>
                <div className="pis-sheet">{body[t.id]()}</div>
              </fieldset>
            </div>
          ) : null,
        )}
      </div>
    </AdminShell>
  );
}
