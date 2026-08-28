import { useState, type FormEvent } from "react";
import { TopBar } from "../../components/layout/TopBar";
import "./login.css";

export function LoginPortal() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Ingresa tu usuario institucional y contraseña para continuar.");
      return;
    }
    if (username.trim().toLowerCase() !== "demo" || password !== "demo") {
      setError("Usuario o contraseña incorrectos. Para la demostración usa demo / demo.");
      return;
    }
    setError("");
    localStorage.setItem("pdi-admin-session", "demo");
    window.location.href = "/admin/pilares";
  }

  return (
    <div className="login-portal">
      <TopBar activeSection="implementation" />
      <div className="login-ambient" aria-hidden="true"><span /><span /><span /></div>
      <main className="login-main">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-accent" />
          <div className="login-heading"><img src="/logo-udes.svg" alt="Universidad de Santander" /><h1 id="login-title">Avant PDI</h1><p>Bienvenido a la Intranet de la Oficina de Planeación Institucional</p><small className="login-demo">Demo administrativa: demo / demo</small></div>
          <form onSubmit={handleSubmit} noValidate>
            <div className="login-field"><label htmlFor="username">Usuario institucional</label><div className="login-input-wrap"><span aria-hidden="true">●</span><input id="username" name="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ej. j.perez" autoComplete="username" /></div></div>
            <div className="login-field"><label htmlFor="password">Contraseña</label><div className="login-input-wrap"><span aria-hidden="true">◆</span><input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" /></div></div>
            <div className="login-options"><label><input type="checkbox" /> <span>Recordarme</span></label><a href="mailto:soporte@udes.edu.co?subject=Recuperación%20de%20acceso">¿Olvidaste tu contraseña?</a></div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit">Iniciar sesión <span aria-hidden="true">→</span></button>
          </form>
          <div className="login-notice"><span aria-hidden="true">◇</span> Acceso restringido a personal autorizado</div>
        </section>
      </main>
      <footer className="login-footer"><span>© 2024 PDI Intranet · Universidad de Santander</span><nav><a href="/#inicio">Privacidad</a><a href="/#inicio">Soporte</a></nav></footer>
    </div>
  );
}
