/* =============================================================================
   Portal de agentes · ingreso (/agentes/ingreso).

   Sin contraseñas: «Continuar con Microsoft UDES» o un código de 6 dígitos al
   correo. El código lo emite y verifica la función `soporte` (mismo mecanismo
   de códigos de las cuentas de Pilo, 0175); quien no está en el equipo recibe la
   misma respuesta, para que nadie averigüe quién es agente.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { asSoporteError, soporte } from "../soporte/llamada";
import { enterBlock, enterList, useMotion } from "./motion";
import { LOGIN_PATH, useAgentSession } from "./sesion";
import "./agentes.css";

export function Ingreso() {
  const { state, refresh } = useAgentSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"correo" | "codigo">("correo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const root = useRef<HTMLElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const from = (location.state as { from?: string } | null)?.from;

  useMotion(root, () => enterList(Array.from(root.current?.querySelectorAll("[data-enter]") ?? [])), []);
  useMotion(root, () => step === "codigo" && enterBlock(root.current?.querySelector("[data-code]") ?? null), [step]);

  useEffect(() => {
    if (step === "codigo") codeRef.current?.focus();
  }, [step]);

  // La cuenta atrás para pedir otro código.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (state.kind === "ready") return <Navigate to={from && from.startsWith("/agentes") ? from : "/agentes"} replace />;

  const microsoft = async () => {
    setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: `${window.location.origin}/agentes` } });
    if (e) setError("No pudimos abrir Microsoft. Intente de nuevo o use un código por correo.");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (step === "correo") {
        const out = await soporte<{ wait?: number }>({ action: "ingreso_enviar", correo: email.trim().toLowerCase() });
        setWait(Number(out.wait) || 60);
        setStep("codigo");
      } else {
        const out = await soporte<{ session: { access_token: string; refresh_token: string } }>({ action: "ingreso_verificar", correo: email.trim().toLowerCase(), codigo: code.replace(/\s/g, "") });
        const { error: e } = await supabase.auth.setSession(out.session);
        if (e) throw e;
        await refresh();
        navigate(from && from.startsWith("/agentes") ? from : "/agentes", { replace: true });
      }
    } catch (e) {
      setError(asSoporteError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const again = async () => {
    setCode("");
    setStep("correo");
    setError("");
  };

  return (
    <main className="ag ag-login" ref={root}>
      <section className="ag-login-brand">
        <div data-enter className="ag-login-logo">
          <img src="/boletin/logo-udes-blanco.png" alt="Universidad de Santander, UDES" height={52} />
          <span>Portal de agentes</span>
        </div>
        <div data-enter className="ag-login-pitch">
          <h1>Atienda a quien le escribe a Pilo.</h1>
          <p>Cuando Pilo no basta, el estudiante llega aquí con sus datos y el resumen de lo que ya conversó. Usted solo tiene que responder.</p>
        </div>
        <div data-enter className="ag-login-note">
          <i aria-hidden="true" />
          Acceso solo para el equipo autorizado de la UDES
        </div>
      </section>

      <section className="ag-login-form">
        <form data-enter onSubmit={submit} noValidate>
          <div className="ag-login-head">
            <h2>Ingresar</h2>
            <p>Use su cuenta institucional. Si es la primera vez, su director debe haberle creado el acceso.</p>
          </div>

          <button type="button" className="ag-ms ag-press" onClick={() => void microsoft()}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <rect x="1" y="1" width="7.5" height="7.5" fill="#f25022" />
              <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7fba00" />
              <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00a4ef" />
              <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#ffb900" />
            </svg>
            Continuar con Microsoft UDES
          </button>

          <div className="ag-or" aria-hidden="true">
            <span />o con su correo<span />
          </div>

          <div className="ag-fields">
            <label className="ag-label">
              Correo institucional
              <input className="ag-in" type="email" inputMode="email" autoComplete="username" placeholder="nombre@mail.udes.edu.co" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === "codigo"} required />
            </label>
            {step === "codigo" ? (
              <label className="ag-label" data-code>
                Código de 6 dígitos
                <input ref={codeRef} className="ag-in" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
                <span className="ag-hint">
                  Se envió a su correo. Vence en 10 minutos.{" "}
                  <button type="button" className="ag-link" onClick={() => void again()} disabled={wait > 0}>
                    {wait > 0 ? `Pedir otro código en ${wait} s` : "Pedir otro código"}
                  </button>
                </span>
              </label>
            ) : null}
          </div>

          <p className="ag-error" role="alert" hidden={!error}>
            {error}
          </p>

          <button type="submit" className="ag-go ag-press" disabled={busy || !email.includes("@") || (step === "codigo" && code.replace(/\s/g, "").length !== 6)}>
            {busy ? "Un momento…" : step === "codigo" ? "Entrar al portal" : "Enviarme un código"}
          </button>
          <p className="ag-fine">¿No tiene acceso? Escriba a su director de agentes. Sin contraseñas que recordar: ingresa con Microsoft o con un código por correo.</p>
        </form>
      </section>
    </main>
  );
}

export { LOGIN_PATH };
