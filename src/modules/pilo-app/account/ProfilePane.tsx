/* =============================================================================
   Mr. Pilo · cuentas (0120) · /app/perfil.

   Con cuenta: sus datos (el usuario, el correo, el perfil y la sede no se
   cambian aquí, salvo la sede cuando el correo no la fija) y la manera en que
   Pilo le habla y le responde: cómo le dice, el tono, la extensión, su
   programa o dependencia y lo que Pilo debe saber de usted. Se guarda con
   `pilo_user_update_prefs`. Debajo, una muestra de cómo respondería Pilo.

   Sin cuenta: las dos preferencias de un visitante (cómo le dice y el tono),
   que quedan en este dispositivo, y lo que gana quien se registra.

   En los dos casos, el tema de la app.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Pilo } from "../../pregunta/Pilo";
import { APP_ACCOUNT, APP_LOGIN } from "../routes";
import type { AppTheme } from "../themes";
import { Icon } from "../icons";
import { CAMPUSES, LENGTHS, TONES, campusFixed, campusLabel, isCampus, prefsOf, prefsPatch, previewAnswer, rolLabel } from "./rules";
import type { Prefs, Tone } from "./rules";
import type { AccountState } from "./useAccount";
import { readVisitor, visitorNick, visitorNickProblem, writeVisitor } from "./visitor";
import { Benefits, Field, Msg, Seg, ThemePicker } from "./parts";

const TONE_OPTIONS = TONES.map((t) => ({ id: t.id, label: t.label }));

export function ProfilePane({
  state,
  theme,
  onTheme,
  intranetName,
  onWelcome,
}: {
  state: AccountState;
  theme: AppTheme;
  onTheme: (theme: AppTheme) => void;
  /** El nombre de quien entró con su cuenta de la intranet; null si no. */
  intranetName: string | null;
  onWelcome: () => void;
}) {
  const { account, member, pending } = state;

  const look = (
    <section className="pc-sheet" aria-labelledby="pc-p-tema">
      <div className="pc-sheet__in">
        <p className="pc-label" id="pc-p-tema">
          Tema de la app
        </p>
        <ThemePicker value={theme} onPick={onTheme} labelledBy="pc-p-tema" />
        <button type="button" className="pc-quiet" onClick={onWelcome}>
          Ver la bienvenida otra vez
        </button>
      </div>
    </section>
  );

  if (pending) {
    return (
      <p className="pc-wait" role="status">
        Pilo está buscando su cuenta…
      </p>
    );
  }

  if (!account) {
    return (
      <>
        {intranetName ? (
          <section className="pc-sheet">
            <div className="pc-sheet__in">
              <p className="pc-label">Sesión de la intranet</p>
              <p>Entró con su cuenta de la intranet ({intranetName}). Esa cuenta ya le sirve en Pilo; sus conversaciones quedan en este dispositivo.</p>
            </div>
          </section>
        ) : (
          <GuestPrefs />
        )}
        {look}
      </>
    );
  }

  if (!member) {
    return (
      <>
        <section className="pc-sheet">
          <div className="pc-sheet__in">
            <Msg tone="bad">Su cuenta de Pilo está suspendida. Escriba a la administración para reactivarla.</Msg>
            <p>Mientras tanto puede conversar con Pilo sin cuenta.</p>
            <div className="pc-actions">
              <span />
              <button type="button" className="pa-btn pa-btn--line" onClick={() => void state.signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </section>
        {look}
      </>
    );
  }

  return <MemberPrefs state={state} look={look} />;
}

/* --- Con cuenta ----------------------------------------------------------------------------- */

function MemberPrefs({ state, look }: { state: AccountState; look: React.ReactNode }) {
  const account = state.account!;
  const [prefs, setPrefs] = useState<Prefs>(() => prefsOf(account));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [talking, setTalking] = useState(false);
  const timer = useRef<number>();
  const fixed = campusFixed(account);
  const dirty = useMemo(() => Object.keys(prefsPatch(account, prefs)).length > 0, [account, prefs]);
  const sample = previewAnswer(prefs.nick, prefs.tone, prefs.length);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (patch: Partial<Prefs>, speak = false) => {
    setPrefs((p) => ({ ...p, ...patch }));
    setResult(null);
    if (!speak) return;
    // Pilo dice la muestra: mueve el pico un momento.
    setTalking(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTalking(false), 900);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setResult(null);
    try {
      const row = await state.save(prefs);
      setPrefs(prefsOf(row));
      setResult({ tone: "ok", text: "Guardado. Pilo ya le responde así." });
    } catch (err) {
      setResult({ tone: "bad", text: (err as Error).message || "No se pudieron guardar sus preferencias." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pc-profile" noValidate onSubmit={submit}>
      <section className="pc-sheet" aria-label="Su cuenta">
        <dl className="pc-rows pc-rows--wide">
          <div>
            <dt>Usuario</dt>
            <dd>
              <code>{account.username}</code>
            </dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>
              <span className="pc-break">{account.email}</span>{" "}
              <span className="pc-tag" data-t="ok">
                {Icon.check}
                Confirmado
              </span>
            </dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>
              <span className="pc-tag">{rolLabel(account.rol)}</span> <span className="pc-hint">Lo fija su correo; para cambiarlo, escriba a la administración.</span>
            </dd>
          </div>
          {fixed && (
            <div>
              <dt>Sede</dt>
              <dd>
                <span className="pc-tag">{campusLabel(account.campus) || "Sin sede"}</span> <span className="pc-hint">La fija su correo.</span>
              </dd>
            </div>
          )}
        </dl>
        <div className="pc-sheet__in">
          {!fixed && (
            <Field id="pc-p-sede" label="Sede">
              {(aria) => (
                <select {...aria} value={prefs.campus} onChange={(e) => isCampus(e.target.value) && change({ campus: e.target.value })}>
                  {!prefs.campus && <option value="">Elija su sede</option>}
                  {CAMPUSES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field id="pc-p-programa" label="Programa o dependencia" hint="Por ejemplo: Ingeniería de Software, o Bienestar Universitario.">
            {(aria) => <input {...aria} autoComplete="organization-title" value={prefs.program} maxLength={120} onChange={(e) => change({ program: e.target.value })} />}
          </Field>
        </div>
      </section>

      <section className="pc-sheet" aria-label="Cómo le habla Pilo">
        <div className="pc-sheet__in">
          <Field id="pc-p-trato" label="¿Cómo le dice Pilo?" hint="Su nombre o uno abreviado.">
            {(aria) => <input {...aria} autoComplete="nickname" value={prefs.nick} maxLength={40} onChange={(e) => change({ nick: e.target.value }, true)} />}
          </Field>
          <div>
            <p className="pc-label">Tono</p>
            <Seg label="Tono" value={prefs.tone} options={TONE_OPTIONS} onPick={(tone) => change({ tone }, true)} />
          </div>
          <div>
            <p className="pc-label">Extensión de las respuestas</p>
            <Seg label="Extensión de las respuestas" value={prefs.length} options={LENGTHS} onPick={(length) => change({ length }, true)} />
          </div>
          <Field id="pc-p-sobre" label="Lo que Pilo debe saber de usted" hint={`Opcional. Por ejemplo: «Estudio de noche y prefiero ejemplos de programación». ${prefs.about.length} de 400.`}>
            {(aria) => <textarea {...aria} rows={3} value={prefs.about} maxLength={400} onChange={(e) => change({ about: e.target.value })} />}
          </Field>
        </div>
        <div className="pc-preview">
          <div className="pc-preview__face">
            <Pilo size="100%" mood="feliz" talking={talking} label="Mr. Pilo" />
          </div>
          <div>
            <p className="pc-label">Así le respondería Pilo</p>
            <p aria-live="polite">{sample}</p>
            <p className="pc-hint">Es una muestra: cambia con el nombre, el tono y la extensión.</p>
          </div>
        </div>
      </section>

      {look}

      <div className="pc-save">
        <div className="pc-save__msg">{result && <Msg tone={result.tone} alert={result.tone === "bad"}>{result.text}</Msg>}</div>
        <button type="button" className="pa-btn pa-btn--line" onClick={() => void state.signOut()}>
          Cerrar sesión
        </button>
        <button type="submit" className="pa-btn pa-btn--main" disabled={saving || !dirty}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

/* --- Sin cuenta ------------------------------------------------------------------------------ */

function GuestPrefs() {
  const [guest, setGuest] = useState(() => readVisitor() ?? { nick: "", tone: "cercano" as Tone });
  const [problem, setProblem] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bad = visitorNickProblem(guest.nick);
    if (bad) {
      setProblem(bad);
      document.getElementById("pc-v-nombre")?.focus();
      return;
    }
    writeVisitor({ nick: visitorNick(guest.nick), tone: guest.tone });
    setSaved(true);
  };

  return (
    <>
      <form className="pc-sheet" noValidate onSubmit={submit} aria-label="Cómo le habla Pilo">
        <div className="pc-sheet__in">
          <p>Usa a Pilo sin cuenta. Estas dos preferencias quedan en este dispositivo.</p>
          <Field id="pc-v-nombre" label="¿Cómo quiere que le diga Pilo?" hint="Su nombre o uno abreviado. Si lo deja vacío, Pilo no usa nombre." error={problem || null}>
            {(aria) => (
              <input
                {...aria}
                autoComplete="nickname"
                value={guest.nick}
                maxLength={30}
                onChange={(e) => {
                  setGuest({ ...guest, nick: e.target.value });
                  setProblem("");
                  setSaved(false);
                }}
              />
            )}
          </Field>
          <div>
            <p className="pc-label">Tono</p>
            <Seg
              label="Tono"
              value={guest.tone}
              options={TONE_OPTIONS}
              onPick={(tone) => {
                setGuest({ ...guest, tone });
                setSaved(false);
              }}
            />
          </div>
          <div className="pc-save">
            <div className="pc-save__msg">{saved && <Msg tone="ok">Guardado en este dispositivo.</Msg>}</div>
            <button type="submit" className="pa-btn pa-btn--main">
              Guardar
            </button>
          </div>
        </div>
      </form>

      <section className="pc-sheet" aria-label="Crear una cuenta">
        <div className="pc-sheet__in">
          <Benefits title="Con una cuenta de Pilo" />
          <div className="pc-actions">
            <Link className="pa-btn pa-btn--line" to={APP_LOGIN}>
              Entrar
            </Link>
            <Link className="pa-btn pa-btn--main" to={APP_ACCOUNT}>
              Crear una cuenta
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
