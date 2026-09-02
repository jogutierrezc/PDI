import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { TopBar } from "../../components/layout/TopBar";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabase";
import "./login.css";

export function LoginPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  const location = useLocation();
  const errorId = useId();
  const { profile, loading, signIn, requestPasswordReset } = useAuth();

  // A dónde iba la persona antes de que la guarda la mandara aquí.
  const from = (location.state as { from?: string } | null)?.from ?? "/admin/pilares";

  useEffect(() => {
    document.title = "Acceso intranet | PDI 2024-2028";
    return () => {
      document.title = "PDI 2024-2028 | Universidad de Santander";
    };
  }, []);

  // Quien ya tiene sesión no debería ver un formulario de acceso.
  if (!loading && profile) return <Navigate to={from} replace />;

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
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "No se pudo iniciar sesión.");
    } finally {
      setPending(false);
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

  return (
    <div className="page login-page">
      <a className="skip-link" href="#acceso">
        Saltar al formulario
      </a>
      <TopBar />

      <main className="login-main" id="acceso">
        <section className="login-card" aria-labelledby="login-title">
          <header className="login-heading">
            <img src="/logo-udes.svg" alt="Universidad de Santander" width={145} height={52} />
            <h1 id="login-title">Intranet PDI</h1>
            <p>Oficina de Planeación Institucional · Universidad de Santander</p>
          </header>

          {!isSupabaseConfigured && (
            <p className="login-error" role="alert">
              <Icon name="alert" size={16} />
              Falta configurar la conexión con Supabase. Revisa <code>.env.local</code>.
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="email">Correo institucional</label>
              <div className="login-input">
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
                  placeholder="nombre.apellido@udes.edu.co"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">Contraseña</label>
              <div className="login-input">
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
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
                <button
                  className="login-reveal"
                  type="button"
                  onClick={() => setRevealed((value) => !value)}
                  aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={revealed}
                >
                  {revealed ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className="login-options">
              {/* Supabase ya mantiene la sesión y renueva el token: la antigua
                  casilla "recordarme" no tenía nada que hacer. */}
              <span className="login-hint">La sesión permanece abierta en este dispositivo.</span>
              <button type="button" className="login-link" onClick={handleReset}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && (
              <p className="login-error" id={errorId} role="alert">
                <Icon name="alert" size={16} />
                {error}
              </p>
            )}

            {notice && (
              <p className="login-notice-ok" role="status">
                <Icon name="check" size={16} />
                {notice}
              </p>
            )}

            <button className="button-primary login-submit" type="submit" disabled={pending || loading}>
              {pending ? "Verificando…" : "Iniciar sesión"}
              <span data-arrow aria-hidden="true">→</span>
            </button>
          </form>

          <p className="login-notice">
            <Icon name="lock" size={14} />
            Acceso restringido a personal autorizado
          </p>
        </section>

        <p className="login-back">
          <Link to="/">
            <span aria-hidden="true">←</span> Volver al portal público
          </Link>
        </p>
      </main>
    </div>
  );
}
