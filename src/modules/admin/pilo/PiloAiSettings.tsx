/* =============================================================================
   Intranet · Mr. Pilo con IA (solo administración).

   1. Conexión de texto: Mistral, Free.ai u otro compatible; su clave.
   2. La voz: avanzada (Free.ai u otro con /audio/speech) o la del navegador.
   3. Qué puede hacer: Escuchar, Resumir, Sintetizar, Explicar.
   4. Dónde aparece y para quién, portal por portal.
   5. Límites y cuidado; uso de hoy.
   6. Últimos pedidos.
   Nada se guarda hasta «Guardar cambios», salvo las claves, que se guardan
   aparte y nunca vuelven completas.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AdminShell } from "../components/AdminShell";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { SpeakerIcon } from "../../../components/pilo/VoiceToggle";
import { speak } from "../../../components/pilo/voice";
import { testPilo } from "../../../components/pilo/ai/client";
import { PORTAL_LABEL } from "../../../components/pilo/ai/config";
import type { Fn, Portal } from "../../../components/pilo/ai/config";
import { PROVIDERS, useKeyStatus, usePiloLog, usePiloSettings, useSavePiloSettings, useSetKey } from "./store";
import type { KeySlot, PiloSettings, Provider } from "./store";
import "./pilo-settings.css";

const FNS: { id: Fn; name: string; short: string; desc: string }[] = [
  { id: "leer", name: "Escuchar", short: "Voz", desc: "Lee en voz alta la página, un resumen o una explicación, con voz masculina." },
  { id: "resumir", name: "Resumir", short: "Re", desc: "Lo esencial de una página o tabla en tres a cinco frases, con su fuente." },
  { id: "sintetizar", name: "Sintetizar", short: "Si", desc: "Cruza las tablas y gráficas y saca hallazgos y preguntas para decidir." },
  { id: "explicar", name: "Explicar gráficas", short: "?", desc: "Cuenta cómo se lee una gráfica o tabla y qué muestra." },
];
const PORTALS: { id: Portal; where: string }[] = [
  { id: "cifras", where: "Informes y tablas por sede" },
  { id: "pdi", where: "Pilares, proyectos y tablero" },
  { id: "observatorio", where: "Temas y boletines" },
  { id: "impacto", where: "Matriz, lazos y resultados" },
];
const AUDIENCES = [
  ["admin", "Solo administración"],
  ["sesion", "Con sesión"],
  ["publico", "Público"],
] as const;

export function PiloAiSettings() {
  const settings = usePiloSettings();
  return (
    <AdminShell
      section="pilo"
      kicker="Sistema"
      title="Mr. Pilo con IA"
      description="Voz avanzada para leer en voz alta, y resúmenes y síntesis de tablas e informes. Usted decide en qué portal aparece y para quién."
    >
      {settings.isPending ? (
        <LoadingBlock rows={6} label="Cargando la configuración de Mr. Pilo" />
      ) : settings.isError ? (
        <ErrorBlock error={settings.error} onRetry={() => settings.refetch()} />
      ) : !settings.data ? (
        <div className="pis-missing">
          <PiloAvatar mood="duda" size={88} />
          <p>Falta aplicar la migración 0089 en la base para configurar a Mr. Pilo con IA.</p>
        </div>
      ) : (
        <Editor initial={settings.data} />
      )}
    </AdminShell>
  );
}

function Switch({ on, onChange, label, big = false }: { on: boolean; onChange: (v: boolean) => void; label: string; big?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="pis-switch" data-big={big || undefined} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Card({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="pis-card" aria-labelledby={`pis-${n}`}>
      <header>
        <h2 id={`pis-${n}`}>
          {n} · {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Editor({ initial }: { initial: PiloSettings }) {
  const [s, setS] = useState<PiloSettings>(initial);
  const [saved, setSaved] = useState(initial);
  const save = useSavePiloSettings();
  const keys = useKeyStatus();
  const log = usePiloLog();
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; text: string }>({ state: "idle", text: "" });

  useEffect(() => {
    setS(initial);
    setSaved(initial);
  }, [initial]);

  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);
  const set = <K extends keyof PiloSettings>(key: K, value: PiloSettings[K]) => setS((prev) => ({ ...prev, [key]: value }));
  const setPortal = (id: Portal, patch: Partial<PiloSettings["portals"][Portal]>) =>
    setS((prev) => ({ ...prev, portals: { ...prev.portals, [id]: { ...prev.portals[id], ...patch } } }));

  const pickProvider = (p: Provider) =>
    setS((prev) => {
      const before = PROVIDERS[prev.provider];
      const next = PROVIDERS[p];
      return {
        ...prev,
        provider: p,
        // Si la dirección o el modelo eran los del proveedor anterior, se cambian por los del nuevo.
        base_url: !prev.base_url || prev.base_url === before.base ? next.base : prev.base_url,
        text_model: !prev.text_model || prev.text_model === before.model ? next.model : prev.text_model,
      };
    });

  const active = PORTALS.filter((p) => s.portals[p.id]?.on).length;
  const connected = Boolean(keys.data?.has_key && s.base_url);
  const status = !s.enabled
    ? "Apagado en toda la intranet"
    : !connected
      ? "Encendido, pero falta la conexión"
      : test.state === "ok"
        ? "Conectado · respondió bien"
        : `Encendido en ${active} ${active === 1 ? "portal" : "portales"}`;

  const runTest = async () => {
    if (dirty) {
      setTest({ state: "fail", text: "Guarde los cambios antes de probar." });
      return;
    }
    setTest({ state: "busy", text: "Probando…" });
    try {
      const r = await testPilo();
      setTest(r.ok ? { state: "ok", text: `Respondió en ${r.ms} ms` } : { state: "fail", text: r.error ?? "No respondió." });
    } catch (e) {
      setTest({ state: "fail", text: (e as Error).message });
    }
  };

  const today = keys.data?.today ?? 0;

  return (
    <div className="pis">
      {s.needs0090 && (
        <p className="pis-warn" role="status">
          Falta aplicar la migración 0090 en la base. Mientras tanto se puede configurar lo básico, pero Mistral y la conexión de voz aparte no se guardan.
        </p>
      )}
      <section className="pis-hero">
        <PiloAvatar mood={s.enabled ? "feliz" : "duda"} size={104} alive={s.enabled} />
        <div>
          <span>Configuración · solo administración</span>
          <h2>Mr. Pilo con IA</h2>
          <p>Resume y sintetiza con {PROVIDERS[s.provider].label}; lee en voz alta con {s.voice_engine === "proveedor" ? "la voz avanzada" : "la voz del navegador"}.</p>
        </div>
        <div className="pis-hero__state">
          <Switch big on={s.enabled} onChange={(v) => set("enabled", v)} label="Mr. Pilo con IA encendido" />
          <em data-on={(s.enabled && connected) || undefined}>{status}</em>
        </div>
      </section>

      <Card n={1} title="Conexión para resumir y sintetizar" aside={<small>{PROVIDERS[s.provider].hint}</small>}>
        <div className="pis-seg" role="group" aria-label="Proveedor de texto">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button key={p} type="button" aria-pressed={s.provider === p} onClick={() => pickProvider(p)}>
              {PROVIDERS[p].label}
            </button>
          ))}
        </div>
        <div className="pis-grid pis-grid--3">
          <label>
            Dirección del servicio
            <input type="url" value={s.base_url} placeholder="https://…" onChange={(e) => set("base_url", e.target.value.trim())} />
          </label>
          <label>
            Modelo
            <input value={s.text_model} placeholder="mistral-small-latest" onChange={(e) => set("text_model", e.target.value.trim())} />
          </label>
          <label>
            Ruta
            <input value={s.chat_path} onChange={(e) => set("chat_path", e.target.value.trim())} />
          </label>
        </div>
        {keys.data?.keys ? (
          <div className="pis-keys">
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
              <KeyField
                key={p}
                which={p}
                label={`Clave de ${PROVIDERS[p].label}`}
                inUse={s.provider === p}
                has={keys.data?.keys?.[p]?.has ?? false}
                last4={keys.data?.keys?.[p]?.last4 ?? ""}
              />
            ))}
          </div>
        ) : (
          <>
            <p className="pis-warn">Falta aplicar la migración 0091 para guardar una clave por proveedor. Mientras tanto hay una sola clave, la del proveedor elegido.</p>
            <KeyField which="texto" label={`Clave de ${PROVIDERS[s.provider].label}`} inUse has={keys.data?.has_key ?? false} last4={keys.data?.last4 ?? ""} />
          </>
        )}
        <div className="pis-row">
          <p className="pis-note">Las claves nunca llegan al navegador: cada pedido pasa por la función del servidor, que revisa quién pregunta, en qué portal y cuánto se ha usado hoy.</p>
          <button type="button" className="button-primary" onClick={runTest} disabled={test.state === "busy" || !connected}>
            {test.state === "busy" ? "Probando…" : "Probar conexión"}
          </button>
        </div>
        {test.state !== "idle" && test.state !== "busy" && (
          <p className="pis-test" data-ok={test.state === "ok" || undefined} role="status">
            {test.text}
          </p>
        )}
      </Card>

      <Card n={2} title="La voz de Mr. Pilo">
        <div className="pis-choice" role="group" aria-label="Motor de voz">
          <button type="button" aria-pressed={s.voice_engine === "proveedor"} onClick={() => set("voice_engine", "proveedor")}>
            <strong>Voz avanzada</strong>
            <span>Natural y expresiva, con Free.ai u otro servicio de voz. Usa cupo.</span>
          </button>
          <button type="button" aria-pressed={s.voice_engine === "navegador"} onClick={() => set("voice_engine", "navegador")}>
            <strong>Voz del navegador</strong>
            <span>Gratis. Siempre es el respaldo si la avanzada no responde.</span>
          </button>
        </div>
        {s.voice_engine === "proveedor" && (
          <>
            <div className="pis-seg" role="group" aria-label="Servicio de voz">
              {(
                [
                  ["freeai", "Free.ai"],
                  ["otro", "Otro compatible"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={s.speech_provider === id} onClick={() => set("speech_provider", id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="pis-grid pis-grid--3">
              <label>
                Dirección del servicio de voz
                <input type="url" value={s.speech_base_url} placeholder="Igual que la de texto" onChange={(e) => set("speech_base_url", e.target.value.trim())} />
              </label>
              <label>
                Modelo de voz
                <input value={s.speech_model} placeholder="[modelo de voz]" onChange={(e) => set("speech_model", e.target.value.trim())} />
              </label>
              <label>
                Voz (masculina)
                <input value={s.speech_voice} placeholder="[nombre de la voz]" onChange={(e) => set("speech_voice", e.target.value.trim())} />
              </label>
            </div>
            <KeyField
              which="voz"
              label={`Clave propia para la voz (opcional; vacía: se usa la de ${s.speech_provider === "otro" ? "«Otro compatible»" : "Free.ai"})`}
              has={keys.data?.keys?.voz?.has ?? keys.data?.has_speech_key ?? false}
              last4={keys.data?.keys?.voz?.last4 ?? keys.data?.speech_last4 ?? ""}
            />
          </>
        )}
        <div className="pis-grid pis-grid--3">
          <label>
            Velocidad · {s.voice_rate.toLocaleString("es-CO", { minimumFractionDigits: 1 })}×
            <input type="range" min={0.7} max={1.3} step={0.1} value={s.voice_rate} onChange={(e) => set("voice_rate", Number(e.target.value))} />
          </label>
          <label>
            Tono · {s.voice_pitch < 0.95 ? "más grave" : s.voice_pitch > 1.05 ? "más agudo" : "natural"}
            <input type="range" min={0.8} max={1.2} step={0.1} value={s.voice_pitch} onChange={(e) => set("voice_pitch", Number(e.target.value))} />
          </label>
          <div className="pis-sample">
            <button
              type="button"
              aria-label="Escuchar muestra con la voz del navegador"
              onClick={() => void speak("Hola, soy Mr. Pilo. Le leo las cifras de la universidad.", { force: true, rate: s.voice_rate, pitch: s.voice_pitch })}
            >
              <SpeakerIcon size={18} />
            </button>
            <span>Muestra con la voz del navegador. La avanzada se oye en los portales.</span>
          </div>
        </div>
      </Card>

      <Card n={3} title="Qué puede hacer">
        <div className="pis-fns">
          {FNS.map((f) => (
            <div key={f.id} className="pis-fn" data-on={s.functions[f.id] || undefined}>
              <div>
                <span className="pis-fn__icon">{f.short}</span>
                <strong>{f.name}</strong>
                <Switch on={s.functions[f.id]} onChange={(v) => set("functions", { ...s.functions, [f.id]: v })} label={f.name} />
              </div>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card n={4} title="Dónde aparece y para quién" aside={<small>Por defecto, solo la administración lo ve</small>}>
        <div className="pis-table" role="table" aria-label="Portales">
          <div role="row" className="pis-table__head">
            <span role="columnheader">Portal</span>
            <span role="columnheader">Activo</span>
            {FNS.map((f) => (
              <span role="columnheader" key={f.id}>
                {f.name.split(" ")[0]}
              </span>
            ))}
            <span role="columnheader">Para quién</span>
          </div>
          {PORTALS.map((p) => {
            const rule = s.portals[p.id] ?? { on: false, aud: "admin", fns: [] };
            return (
              <div role="row" key={p.id} className="pis-table__row" data-off={!rule.on || undefined}>
                <span role="rowheader">
                  <strong>{PORTAL_LABEL[p.id]}</strong>
                  <small>{p.where}</small>
                </span>
                <span role="cell">
                  <Switch on={rule.on} onChange={(v) => setPortal(p.id, { on: v })} label={`Activar en ${PORTAL_LABEL[p.id]}`} />
                </span>
                {FNS.map((f) => {
                  const has = rule.fns.includes(f.id);
                  return (
                    <span role="cell" key={f.id}>
                      <button
                        type="button"
                        className="pis-check"
                        aria-pressed={has}
                        aria-label={`${f.name} en ${PORTAL_LABEL[p.id]}`}
                        data-off={(has && !s.functions[f.id]) || undefined}
                        onClick={() => setPortal(p.id, { fns: has ? rule.fns.filter((x) => x !== f.id) : [...rule.fns, f.id] })}
                      >
                        {has ? "✓" : "—"}
                      </button>
                    </span>
                  );
                })}
                <span role="cell">
                  <span className="pis-aud" role="group" aria-label={`Para quién en ${PORTAL_LABEL[p.id]}`}>
                    {AUDIENCES.map(([id, label]) => (
                      <button key={id} type="button" aria-pressed={rule.aud === id} data-public={id === "publico" || undefined} onClick={() => setPortal(p.id, { aud: id })}>
                        {label}
                      </button>
                    ))}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="pis-warn">«Público» gasta cupo con cada visitante. Conviene empezar con «Solo administración», revisar la bitácora una semana y abrir portal por portal.</p>
      </Card>

      <div className="pis-two">
        <Card n={5} title="Límites y cuidado">
          <div className="pis-grid pis-grid--3">
            <label>
              Pedidos por día
              <input type="number" min={0} value={s.daily_limit} onChange={(e) => set("daily_limit", Math.max(0, Number(e.target.value)))} />
            </label>
            <label>
              Filas máx. por pedido
              <input type="number" min={10} max={5000} value={s.max_rows} onChange={(e) => set("max_rows", Number(e.target.value))} />
            </label>
            <label>
              Guardar resúmenes (días)
              <input type="number" min={0} max={365} value={s.cache_days} onChange={(e) => set("cache_days", Number(e.target.value))} />
            </label>
          </div>
          <ul className="pis-list">
            <li>Solo se envía lo que está publicado en la página: nunca nombres, códigos ni datos personales.</li>
            <li>Cada resumen dice «hecho con IA» y de qué tabla o gráfica sale.</li>
            <li>Mr. Pilo revisa que cada número del resumen esté en la página; si no, lo advierte.</li>
            <li>Si el servicio no responde, lee con la voz del navegador y lo dice.</li>
          </ul>
          <div className="pis-usage">
            <div>
              <span>Uso de hoy</span>
              <strong>
                {today} de {s.daily_limit} pedidos
              </strong>
            </div>
            <i>
              <span style={{ width: `${Math.min(100, (today / Math.max(1, s.daily_limit)) * 100)}%` }} />
            </i>
          </div>
        </Card>

        <Card n={6} title="Últimos pedidos">
          {(log.data ?? []).length === 0 ? (
            <p className="pis-note">Todavía no hay pedidos.</p>
          ) : (
            <ul className="pis-log">
              {(log.data ?? []).map((r) => (
                <li key={r.id}>
                  <span>{new Date(r.created_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span>
                    <strong>{r.action}</strong> · {PORTAL_LABEL[r.portal as Portal] ?? r.portal}
                    <small>{r.subject}</small>
                  </span>
                  <em data-state={r.status === "listo" ? "ok" : r.status === "revisar" || r.status === "limite" ? "warn" : "fail"}>
                    {r.cached ? "guardado" : r.status}
                  </em>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="pis-save" role="region" aria-label="Guardar">
        <PiloAvatar mood={dirty ? "piensa" : "bien"} size={44} />
        <span>
          {save.isError
            ? `No se guardó: ${(save.error as Error).message}`
            : dirty
              ? `Hay cambios sin guardar. Mr. Pilo quedará activo en ${active} ${active === 1 ? "portal" : "portales"}.`
              : `Todo guardado. Mr. Pilo está ${s.enabled ? `activo en ${active} ${active === 1 ? "portal" : "portales"}` : "apagado"}.`}
        </span>
        <button type="button" className="button-secondary" disabled={!dirty || save.isPending} onClick={() => setS(saved)}>
          Descartar
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(s, { onSuccess: () => setSaved(s) })}
        >
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

/** Una clave: se ve si hay y cómo termina; se cambia escribiéndola de nuevo. */
function KeyField({ which, label, has, last4, inUse = false }: { which: KeySlot | "texto"; label: string; has: boolean; last4: string; inUse?: boolean }) {
  const setKey = useSetKey();
  const [editing, setEditing] = useState(!has);
  const [value, setValue] = useState("");
  useEffect(() => setEditing(!has), [has]);

  return (
    <div className="pis-key" data-in-use={inUse || undefined}>
      <span className="pis-key__label">
        {label}
        {inUse && <em>En uso</em>}
      </span>
      {editing ? (
        <form
          className="pis-key__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            setKey.mutate({ key: value, which }, { onSuccess: () => { setValue(""); setEditing(false); } });
          }}
        >
          <input type="password" autoComplete="off" spellCheck={false} value={value} placeholder="Pegue aquí la clave" onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="button-primary" disabled={!value.trim() || setKey.isPending}>
            {setKey.isPending ? "Guardando…" : "Guardar clave"}
          </button>
          {has && (
            <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          )}
        </form>
      ) : (
        <div className="pis-key__saved">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>Guardada en el servidor · termina en ••••{last4}</span>
          <button type="button" className="button-secondary" onClick={() => setEditing(true)}>
            Cambiar clave
          </button>
          <button type="button" className="button-secondary" onClick={() => setKey.mutate({ key: "", which })}>
            Quitar
          </button>
        </div>
      )}
      {setKey.isError && <p className="pis-test">No se guardó la clave: {(setKey.error as Error).message}</p>}
    </div>
  );
}
