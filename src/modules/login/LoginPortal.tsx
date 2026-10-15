import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import gsap from "gsap";
import { Icon } from "../../components/ui/Icon";
import { afterLoginPath, useAuth } from "../../lib/auth";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { ArrivalsBoard, FlowCanvas, prefersReducedMotion, useZoneParallax } from "./LoginBoard";
import type { BoardTone } from "./LoginBoard";
import "./login.css";
import "./login-microsoft.css";

type Field = "email" | "password" | null;

const FROM_KEY = "pdi:login-from";

/** El destino se guarda antes de salir a Microsoft: al volver, la dirección ya no lo trae. */
const remember = (path: string) => {
  try {
    sessionStorage.setItem(FROM_KEY, path);
  } catch {
    /* sin almacenamiento: se vuelve al panel */
  }
};
const recall = () => {
  try {
    return sessionStorage.getItem(FROM_KEY);
  } catch {
    return null;
  }
};

/** Microsoft devuelve el motivo del fallo en la dirección (#error_description=…). */
const returnedError = () => {
  const text = `${window.location.hash.replace(/^#/, "")}&${window.location.search.replace(/^\?/, "")}`;
  const message = new URLSearchParams(text).get("error_description");
  return message ? `Microsoft no completó el ingreso: ${message.replace(/\+/g, " ")}` : "";
};

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden="true">
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}
export function LoginPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(returnedError);
  const [msPending, setMsPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [focused, setFocused] = useState<Field>(null);

  const location = useLocation();
  const errorId = useId();
  const { profile, session, loading, signIn, signOut, requestPasswordReset } = useAuth();

  const root = useRef<HTMLElement>(null);
  const zone = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const pitch = useRef<HTMLDivElement>(null);

  // A dónde iba la persona antes de que la guarda la mandara aquí; si venía de
  // ninguna parte, al panel de la intranet (el lanzador de /admin).
  const from = afterLoginPath((location.state as { from?: unknown } | null)?.from ?? recall(), profile);

  useEffect(() => {
    document.title = "Iniciar sesión | PDI 2024-2028";
    return () => {
      document.title = "PDI 2024-2028 | Universidad de Santander";
    };
  }, []);

  useZoneParallax(zone, [
    { ref: canvas, pull: 28, invert: true },
    { ref: board, pull: 12 },
    { ref: pitch, pull: 5 },
  ]);

  // Entrada orquestada: una sola línea de tiempo, todo parte de un estado visible.
  useEffect(() => {
    if (!root.current || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(".lg-brand", { y: 10, opacity: 0, duration: 0.3 }, 0.05)
        .from(".lg-pitch", { y: 14, opacity: 0, duration: 0.3 }, 0.1)
        .from(".lg-board", { y: 16, opacity: 0, duration: 0.3 }, 0.18)
        .from(".lg-row", { y: 8, opacity: 0, duration: 0.26, stagger: 0.04 }, 0.24)
        .from(".lg-rise", { y: 12, opacity: 0, duration: 0.3, stagger: 0.045 }, 0.12);
      tl.eventCallback("onComplete", () => {
        gsap.set(".lg-brand, .lg-pitch, .lg-board, .lg-row, .lg-rise", { clearProps: "opacity,transform" });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  // Error: los campos tiemblan una vez (solo transform).
  useEffect(() => {
    if (!error || !form.current || prefersReducedMotion()) return;
    gsap.fromTo(
      form.current.querySelectorAll(".lg-field"),
      { x: 0 },
      {
        keyframes: [
          { x: -7, duration: 0.07 },
          { x: 5, duration: 0.08 },
          { x: -3, duration: 0.07 },
          { x: 0, duration: 0.1 },
        ],
        ease: "power2.out",
        stagger: 0.03,
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }, [error]);

  // Quien ya tiene sesión no debería ver un formulario de acceso.
  if (!loading && profile) {
    try {
      sessionStorage.removeItem(FROM_KEY);
    } catch {
      /* nada que olvidar */
    }
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    if (!email.trim() || !password) {
      setError("Ingresa tu correo institucional y tu contraseña para continuar.");
      return;
    }

    setPending(true);
    setError("");
    try {
      await signIn(email, password);
      // La redirección la resuelve el <Navigate> de arriba cuando el perfil
      // llega al contexto: así no se navega antes de conocer el rol.
      setDone(true);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "No se pudo iniciar sesión.");
    } finally {
      setPending(false);
    }
  }

  async function handleMicrosoft() {
    setError("");
    setNotice("");
    setMsPending(true);
    remember(from);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { scopes: "email", redirectTo: `${window.location.origin}/acceso-intranet` },
    });
    // Si no hay error el navegador ya va camino de Microsoft.
    if (oauthError) {
      setMsPending(false);
      setError(`No se pudo abrir Microsoft: ${oauthError.message}`);
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Escribe tu correo institucional para enviarte el enlace de recuperación.");
      return;
    }
    setError("");
    try {
      await requestPasswordReset(email);
      setNotice("Si el correo existe, recibirás un enlace para restablecer la contraseña.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "No se pudo enviar el enlace.");
    }
  }

  // Lo que dice el tablero depende de en qué punto del formulario está la persona.
  let boardText = "BIENVENIDO/A";
  let boardTone: BoardTone = "neutral";
  if (done) {
    boardText = "PUERTA ABIERTA";
    boardTone = "ok";
  } else if (pending || msPending) {
    boardText = "VERIFICANDO";
  } else if (error) {
    boardText = "REVISE DATOS";
    boardTone = "error";
  } else if (notice) {
    boardText = "ENLACE ENVIADO";
    boardTone = "ok";
  } else if (focused === "email") {
    boardText = "SU CORREO";
  } else if (focused === "password") {
    boardText = "SU CONTRASENA";
  }

  const buttonState = done ? "success" : pending ? "loading" : "idle";
  const buttonLabel = done ? "Acceso verificado" : pending ? "Verificando…" : "Iniciar sesión";

  return (
    <main className="lg" id="acceso" ref={root}>
      <a className="skip-link" href="#lg-form">
        Saltar al formulario
      </a>

      <section className="lg-zone" ref={zone} aria-label="Planeación Institucional UDES">
        <div className="lg-zone__clip" aria-hidden="true">
          <FlowCanvas canvasRef={canvas} />
          <div className="lg-zone__shade" />
        </div>

        <div className="lg-brand">
          <img src="/logo-udes.svg" alt="Universidad de Santander" width={116} height={42} />
        </div>

        <div className="lg-pitch" ref={pitch}>
          <h2>Todo el Plan de Desarrollo, en un solo tablero.</h2>
          <p>Seguimiento, cifras oficiales y alertas de la Oficina de Planeación Institucional, para quienes trabajan el plan cada día.</p>
        </div>

        <ArrivalsBoard text={boardText} tone={boardTone} boardRef={board} />
        <p className="lg-zone__foot">Oficina de Planeación Institucional · Universidad de Santander</p>
      </section>

      <section className="lg-pane" aria-labelledby="login-title" id="lg-form">
        <p className="lg-back lg-rise">
          <Link to="/">
            <Icon name="arrow-left" size={16} /> Volver al portal público
          </Link>
        </p>

        <div className="lg-wrap">
          <header className="lg-head lg-rise">
            <h1 id="login-title">Iniciar sesión</h1>
            <p>Intranet PDI · Oficina de Planeación Institucional</p>
          </header>

          {!isSupabaseConfigured && (
            <p className="lg-alert" role="alert">
              <Icon name="alert" size={16} />
              Falta configurar la conexión con Supabase. Revisa <code>.env.local</code>.
            </p>
          )}

          {session && !profile && !loading && (
            <div className="lg-pending lg-rise" role="status">
              <strong>Tu cuenta aún no está habilitada</strong>
              <p>
                Entraste como {session.user.email}, pero ese correo no tiene acceso a la intranet. Pide que te habiliten
                a la Oficina de Planeación Institucional; mientras tanto puedes ver el portal público.
              </p>
              <button type="button" className="lg-link" onClick={() => void signOut()}>
                Usar otra cuenta
              </button>
            </div>
          )}

          <button
            type="button"
            className="lg-ms lg-rise"
            onClick={() => void handleMicrosoft()}
            disabled={msPending || pending || loading || !isSupabaseConfigured}
            aria-busy={msPending}
          >
            <MicrosoftMark />
            {msPending ? "Abriendo Microsoft…" : "Continuar con Microsoft"}
          </button>
          <p className="lg-or lg-rise">o con correo y contraseña</p>

          <form onSubmit={handleSubmit} noValidate ref={form}>
            <div className="lg-field lg-rise">
              <label htmlFor="email">Correo institucional</label>
              <div className="lg-input" data-invalid={Boolean(error)}>
                <Icon name="user" size={17} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError("");
                  }}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  placeholder="nombre.apellido@udes.edu.co"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  readOnly={pending}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
                <i className="lg-scan" />
              </div>
            </div>

            <div className="lg-field lg-rise">
              <label htmlFor="password">Contraseña</label>
              <div className="lg-input" data-invalid={Boolean(error)}>
                <Icon name="lock" size={17} />
                <input
                  id="password"
                  name="password"
                  type={revealed ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  readOnly={pending}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
                <button
                  className="lg-reveal"
                  type="button"
                  onClick={() => setRevealed((value) => !value)}
                  aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={revealed}
                >
                  {revealed ? "Ocultar" : "Mostrar"}
                </button>
                <i className="lg-scan" />
              </div>
            </div>

            <div className="lg-options lg-rise">
              {/* Supabase ya mantiene la sesión y renueva el token: la antigua
                  casilla "recordarme" no tenía nada que hacer. */}
              <span className="lg-hint">La sesión permanece abierta en este dispositivo.</span>
              <button type="button" className="lg-link" onClick={handleReset}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && (
              <p className="lg-alert" id={errorId} role="alert">
                <Icon name="alert" size={16} />
                {error}
              </p>
            )}

            {notice && (
              <p className="lg-ok" role="status">
                <Icon name="check" size={16} />
                {notice}
              </p>
            )}

            <button className="lg-submit lg-rise" type="submit" disabled={pending || loading || done} data-state={buttonState} aria-busy={pending}>
              <span>{buttonLabel}</span>
              <span className="lg-submit__icon" aria-hidden="true">
                <svg className="i-arrow" viewBox="0 0 24 24" width="18" height="18">
                  <path d="M5 12h14m-6-6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <svg className="i-spin" viewBox="0 0 24 24" width="18" height="18">
                  <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="2.6" />
                  <path d="M12 3.5a8.5 8.5 0 018.5 8.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
                <svg className="i-check" viewBox="0 0 24 24" width="18" height="18">
                  <path d="M5 12.8l4.4 4.4L19 7.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <i className="lg-submit__bar" />
            </button>
          </form>

          <p className="lg-secure lg-rise">
            <Icon name="lock" size={14} />
            Acceso restringido a personal autorizado
          </p>
        </div>
      </section>
    </main>
  );
}
