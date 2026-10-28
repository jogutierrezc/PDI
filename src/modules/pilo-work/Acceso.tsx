/* =============================================================================
   Pilo at Work · acceso.

   Entrar, crear cuenta, código de seis dígitos, verificación, rol. Reutiliza las
   cuentas de Pilo (función pilo-cuentas, 0120/0175): el código llega por correo y
   «Continuar con Microsoft» ya existen. Pilo at Work solo añade el ROL: sin fila en
   pw_roles la cuenta queda verificada y sin acceso.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { supabase } from "../../lib/supabase";
import { movimientoReducido } from "../rankings/movimiento";
import { asCuentaError, createMicrosoftAccount, loginAccount, prepareMicrosoft, registerAccount, sendRegisterCode, verifyRegisterCode } from "../pilo-app/account/api";
import { CAMPUSES, EMPTY_REG, cleanUsername, emailRule } from "../pilo-app/account/rules";
import type { Campus } from "../pilo-app/account/rules";
import { miRol, ROL_ETIQUETA } from "./api";
import type { Rol } from "./api";
import { IC, Logo, MOOD } from "./ui";

type Paso = "entrar" | "crear" | "otp" | "verif" | "ok" | "norol" | "ms";
const DEPENDENCIAS = ["Planeación Institucional", "Talento Humano", "Bienestar Institucional", "Investigación", "Extensión y Proyección Social", "Secretaría General", "Otra dependencia"];
const GUARDA = "pilo-work-dependencia";

const Microsoft = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
    <rect x="1" y="1" width="8.5" height="8.5" fill="#f25022" />
    <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7fba00" />
    <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00a4ef" />
    <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#ffb900" />
  </svg>
);

export function Acceso({ onListo, aviso, tema, onTema, inicial }: { onListo: (rol: Rol) => void; aviso: (m: string) => void; tema: string; onTema: () => void; inicial?: "verif" | "ms" }) {
  const [paso, setPaso] = useState<Paso>(inicial ?? "entrar");
  const [rol, setRol] = useState<Rol | null>(null);
  const [nombre, setNombre] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const primera = useRef(true);

  // Reg: lo que se pide al crear.
  const [f, setF] = useState({ nombre: "", correo: "", usuario: "", dependencia: DEPENDENCIAS[0], campus: "bucaramanga" as Campus, clave: "", ok: false });
  const [u, setU] = useState({ usuario: "", clave: "" });
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ticket = useRef("");

  /* El cambio de panel: sale el viejo (corto), entra el nuevo (con escalón). */
  useEffect(() => {
    const el = panel.current;
    if (!el || movimientoReducido()) return;
    if (primera.current) {
      primera.current = false;
      gsap.from(el.children, { opacity: 0, y: 12, duration: 0.4, ease: "expo.out", stagger: 0.05, clearProps: "opacity,transform" });
      return;
    }
    gsap.fromTo(el, { opacity: 0, x: 18 }, { opacity: 1, x: 0, duration: 0.3, ease: "expo.out", clearProps: "opacity,transform" });
    gsap.from(el.children, { opacity: 0, y: 8, duration: 0.34, ease: "expo.out", stagger: 0.035, delay: 0.05, clearProps: "opacity,transform" });
  }, [paso]);

  const ir = (p: Paso) => {
    setError("");
    setPaso(p);
  };

  /* --- Verificación y rol --------------------------------------------------------------- */
  const [marcas, setMarcas] = useState<number>(0);
  const verificar = useCallback(async () => {
    setPaso("verif");
    setMarcas(0);
    const pausa = (ms: number) => new Promise((r) => setTimeout(r, movimientoReducido() ? 0 : ms));
    const { data } = await supabase.auth.getSession();
    setNombre(String(data.session?.user.user_metadata?.full_name ?? data.session?.user.email ?? "").split(" ")[0]);
    setMarcas(1);
    await pausa(550);
    const r = await miRol();
    setMarcas(2);
    await pausa(700);
    setMarcas(3);
    await pausa(450);
    if (r) {
      setRol(r);
      const { data: p } = await supabase.from("pilo_users").select("full_name").eq("id", data.session?.user.id ?? "").maybeSingle();
      if (p?.full_name) setNombre(String(p.full_name).split(" ")[0]);
      setPaso("ok");
    } else {
      let dep = "";
      try {
        dep = sessionStorage.getItem(GUARDA) ?? "";
      } catch {
        /* sin almacenamiento */
      }
      await supabase.rpc("pw_solicitar_rol", { p_dependencia: dep });
      setPaso("norol");
    }
  }, []);

  useEffect(() => {
    if (inicial === "verif") void verificar();
    if (inicial === "ms") void preparar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  /* --- Microsoft ------------------------------------------------------------------------- */
  async function preparar() {
    try {
      const p = await prepareMicrosoft();
      if (p.kind === "nuevo") {
        setF((x) => ({ ...x, correo: p.email, nombre: p.fullName, campus: p.campus || x.campus }));
        setPaso("ms");
      } else await verificar();
    } catch (e) {
      setError(asCuentaError(e).message);
      setPaso("entrar");
    }
  }
  async function conMicrosoft() {
    setOcupado(true);
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: `${window.location.origin}/work?ms=1` } });
    if (e) {
      setError("No se pudo abrir Microsoft. Intente con su cuenta de Pilo.");
      setOcupado(false);
    }
  }
  async function crearMs() {
    setError("");
    setOcupado(true);
    try {
      guardarDep();
      await createMicrosoftAccount({ ...EMPTY_REG, email: f.correo, rol: "administrativo", campus: f.campus, fullName: f.nombre, username: f.usuario, nick: f.nombre.split(" ")[0], terms: true, ms: true });
      await verificar();
    } catch (e) {
      setError(asCuentaError(e).message);
    }
    setOcupado(false);
  }
  const guardarDep = () => {
    try {
      sessionStorage.setItem(GUARDA, f.dependencia);
    } catch {
      /* sin almacenamiento */
    }
  };

  /* --- Entrar ------------------------------------------------------------------------------ */
  async function entrar() {
    setError("");
    if (!u.usuario.trim() || !u.clave) return setError("Escriba su usuario y su contraseña.");
    setOcupado(true);
    try {
      if (u.usuario.includes("@")) {
        const { error: e } = await supabase.auth.signInWithPassword({ email: u.usuario.trim(), password: u.clave });
        if (e) throw new Error("Usuario o contraseña incorrectos.");
      } else await loginAccount(cleanUsername(u.usuario), u.clave);
      await verificar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entrar.");
    }
    setOcupado(false);
  }

  /* --- Crear ---------------------------------------------------------------------------------- */
  const dominio = f.correo ? emailRule(f.correo) : undefined;
  const fuerza = (() => {
    const v = f.clave;
    return Number(v.length >= 8) + Number(/[A-Z]/.test(v) && /[a-z]/.test(v)) + Number(/\d/.test(v)) + Number(/[^A-Za-z0-9]/.test(v));
  })();
  async function pedirCodigo() {
    setError("");
    if (!f.nombre.trim()) return setError("Escriba su nombre.");
    if (!dominio) return setError("Use un correo de la UDES.");
    if (!f.usuario.trim()) return setError("Elija un nombre de usuario.");
    if (f.clave.length < 8) return setError("La contraseña lleva mínimo 8 caracteres.");
    if (!f.ok) return setError("Confirme lo de los archivos locales.");
    setOcupado(true);
    try {
      guardarDep();
      const r = await sendRegisterCode(f.correo);
      setEspera(r.wait);
      setPaso("otp");
    } catch (e) {
      setError(asCuentaError(e).message);
    }
    setOcupado(false);
  }

  /* --- Código ---------------------------------------------------------------------------------- */
  const [espera, setEspera] = useState(30);
  const [resta, setResta] = useState(30);
  const dig = useRef<HTMLInputElement[]>([]);
  const [estado, setEstado] = useState<"" | "ok" | "mal">("");
  const [msgOtp, setMsgOtp] = useState("");
  useEffect(() => {
    if (paso !== "otp") return;
    setResta(espera);
    setEstado("");
    setMsgOtp("");
    dig.current.forEach((d) => d && (d.value = ""));
    const t = setTimeout(() => dig.current[0]?.focus(), 350);
    const iv = setInterval(() => setResta((r) => Math.max(0, r - 1)), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [paso, espera]);

  async function comprobar() {
    const code = dig.current.map((d) => d.value).join("");
    if (code.length < 6) return;
    dig.current.forEach((d) => (d.disabled = true));
    try {
      ticket.current = await verifyRegisterCode(f.correo, code);
      setEstado("ok");
      setMsgOtp("Código correcto");
      if (!movimientoReducido()) {
        const tl = gsap.timeline();
        dig.current.forEach((d, i) => tl.to(d, { y: -8, duration: 0.12, ease: "power2.out" }, i * 0.05).to(d, { y: 0, duration: 0.22, ease: "back.out(2.6)" }, i * 0.05 + 0.12));
        await tl.then();
      }
      const salida = await registerAccount({ ...EMPTY_REG, email: f.correo, rol: "administrativo", campus: f.campus, fullName: f.nombre, username: f.usuario, password: f.clave, nick: f.nombre.split(" ")[0], terms: true, ticket: ticket.current });
      if (salida === "ingresar") await loginAccount(cleanUsername(f.usuario), f.clave);
      if (salida === "confirmar") {
        setPaso("entrar");
        setError("Le enviamos un correo para confirmar la cuenta. Ábralo y luego entre aquí.");
        return;
      }
      await verificar();
    } catch (e) {
      setEstado("mal");
      setMsgOtp(asCuentaError(e).message || "Ese código no coincide. Revise el correo e intente de nuevo.");
      if (!movimientoReducido()) gsap.to(".pw .otp", { keyframes: { x: [-10, 9, -6, 4, 0] }, duration: 0.4, ease: "power2.out" });
      setTimeout(() => {
        dig.current.forEach((d) => {
          d.value = "";
          d.disabled = false;
        });
        setEstado("");
        dig.current[0]?.focus();
      }, 700);
    }
  }
  async function reenviar() {
    try {
      const r = await sendRegisterCode(f.correo);
      setEspera(r.wait);
      setResta(r.wait);
      aviso("Código reenviado");
    } catch (e) {
      aviso(asCuentaError(e).message);
    }
  }

  const n = ({ crear: 1, otp: 2, verif: 3, ok: 3, norol: 3 } as Partial<Record<Paso, number>>)[paso] ?? 0;
  const pasos = ["Cuenta", "Código", "Rol"];

  return (
    <section className="screen" id="auth" aria-label="Acceso a Pilo at Work">
      <div className="hero">
        <Logo alto={34} />
        <div className="hero__mid">
          <div className="hero__grid" aria-hidden="true" />
          <h1>
            Pilo <span>at Work</span>
          </h1>
          <p className="lead">El agente de IA para el trabajo dentro de la Universidad de Santander.</p>
          <ul className="caps">
            <li>{IC.doc}Redacta y revisa documentos con su estilo</li>
            <li>{IC.mail}Ordena su correo sin enviar nada por usted</li>
            <li>{IC.lock}Lee sus archivos en su equipo, no en la nube</li>
          </ul>
        </div>
        <p className="hero__foot">Acceso solo para personas con rol asignado por la administración de la universidad.</p>
        <div className="hero__pilo" aria-hidden="true">
          <img src={MOOD.feliz} alt="" />
        </div>
      </div>
      <div className="access">
        <div className="access__top">
          {n > 0 && (
            <div className="steps" aria-label="Progreso de la cuenta">
              {pasos.map((p, i) => (
                <span key={p} style={{ display: "contents" }}>
                  <span className={`st${n === i + 1 ? " on" : ""}${i + 1 < n ? " done" : ""}`}>
                    <i>{i + 1}</i>
                    {p}
                  </span>
                  {i < 2 && (
                    <span className="ln">
                      <b style={{ transform: `scaleX(${i + 1 < n ? 1 : 0})`, transition: "transform .45s cubic-bezier(.23,1,.32,1)" }} />
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
          <span className="sp" />
          <span className="hint">
            ¿Problemas para entrar? <a className="link" href="mailto:planeacion@udes.edu.co">Escriba a soporte</a>
          </span>
        </div>
        <div className="stage">
          <div className="panel" ref={panel} key={paso}>
            {paso === "entrar" && (
              <>
                <h2>Bienvenido a su espacio de trabajo</h2>
                <p className="sub">Entre con su cuenta de Pilo o con Microsoft. Pilo recordará cómo trabaja usted y su oficina.</p>
                <button type="button" className="btn navy ms" onClick={conMicrosoft} disabled={ocupado}>
                  <Microsoft />
                  Continuar con Microsoft
                </button>
                <div className="sep">o con su cuenta de Pilo</div>
                <div className="field">
                  <label htmlFor="e-user">Usuario (o correo institucional)</label>
                  <input className="inp" id="e-user" value={u.usuario} onChange={(e) => setU({ ...u, usuario: e.target.value })} placeholder="ana.rojas" autoComplete="username" />
                </div>
                <div className="field">
                  <label htmlFor="e-pass">Contraseña</label>
                  <input className="inp" id="e-pass" type="password" value={u.clave} onChange={(e) => setU({ ...u, clave: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void entrar()} autoComplete="current-password" />
                </div>
                {error && <p className="err" role="alert">{error}</p>}
                <button type="button" className="btn primary" onClick={() => void entrar()} disabled={ocupado}>
                  Entrar
                </button>
                <p className="hint">
                  ¿Primera vez? <button type="button" className="link" onClick={() => ir("crear")}>Cree su cuenta</button>
                </p>
              </>
            )}
            {paso === "crear" && (
              <>
                <h2>Cree su cuenta de trabajo</h2>
                <p className="sub">Le enviaremos un código de seis dígitos para comprobar su correo.</p>
                <div className="field">
                  <label htmlFor="c-nom">Nombre completo</label>
                  <input className="inp" id="c-nom" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ana María Rojas" />
                </div>
                <div className="field">
                  <label htmlFor="c-mail">Correo institucional</label>
                  <input className="inp" id="c-mail" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} placeholder="nombre@udes.edu.co" autoComplete="email" />
                  <span className={`dom${f.correo ? (dominio ? " ok" : " bad") : ""}`} aria-live="polite">
                    {!f.correo ? "Use su correo de la UDES" : dominio ? "✓ Dominio de la UDES reconocido" : "Este correo no es de la UDES"}
                  </span>
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="c-us">Usuario</label>
                    <input className="inp" id="c-us" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value.toLowerCase() })} placeholder="ana.rojas" autoComplete="username" />
                  </div>
                  <div className="field">
                    <label htmlFor="c-camp">Sede</label>
                    <select className="inp" id="c-camp" value={f.campus} onChange={(e) => setF({ ...f, campus: e.target.value as Campus })}>
                      {CAMPUSES.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="c-dep">Dependencia</label>
                    <select className="inp" id="c-dep" value={f.dependencia} onChange={(e) => setF({ ...f, dependencia: e.target.value })}>
                      {DEPENDENCIAS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="c-pass">Contraseña</label>
                    <input className="inp" id="c-pass" type="password" value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} placeholder="Mínimo 8" autoComplete="new-password" />
                    <div className="meter" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <i key={i} style={{ ["--f" as string]: i < fuerza ? 1 : 0, ["--c" as string]: ["var(--risk)", "var(--warn)", "var(--blue)", "var(--ok)"][Math.max(0, fuerza - 1)] }} />
                      ))}
                    </div>
                  </div>
                </div>
                <label className="chk">
                  <input type="checkbox" checked={f.ok} onChange={(e) => setF({ ...f, ok: e.target.checked })} />
                  <span>Entiendo que los archivos que Pilo revise en mi equipo no se suben a la nube ni a la IA, salvo lo que yo apruebe.</span>
                </label>
                {error && <p className="err" role="alert">{error}</p>}
                <button type="button" className="btn primary" onClick={() => void pedirCodigo()} disabled={ocupado}>
                  Crear cuenta y enviar código
                </button>
                <p className="hint">
                  ¿Ya tiene cuenta? <button type="button" className="link" onClick={() => ir("entrar")}>Entre aquí</button>
                </p>
              </>
            )}
            {paso === "ms" && (
              <>
                <h2>Complete su cuenta de Pilo</h2>
                <p className="sub">Su correo de Microsoft ya está comprobado. Falta elegir un usuario.</p>
                <div className="field">
                  <label htmlFor="m-nom">Nombre completo</label>
                  <input className="inp" id="m-nom" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="m-us">Usuario</label>
                    <input className="inp" id="m-us" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value.toLowerCase() })} placeholder="ana.rojas" />
                  </div>
                  <div className="field">
                    <label htmlFor="m-dep">Dependencia</label>
                    <select className="inp" id="m-dep" value={f.dependencia} onChange={(e) => setF({ ...f, dependencia: e.target.value })}>
                      {DEPENDENCIAS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {error && <p className="err" role="alert">{error}</p>}
                <button type="button" className="btn primary" onClick={() => void crearMs()} disabled={ocupado}>
                  Continuar
                </button>
              </>
            )}
            {paso === "otp" && (
              <>
                <h2>Escriba el código que le enviamos</h2>
                <p className="sub">Se envió a {f.correo}. Llegó a su correo institucional.</p>
                <div className="otp" role="group" aria-label="Código de seis dígitos">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        if (el) dig.current[i] = el;
                      }}
                      className={estado}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      autoComplete="one-time-code"
                      aria-label={`Dígito ${i + 1}`}
                      onInput={(e) => {
                        const x = e.currentTarget;
                        x.value = x.value.replace(/\D/g, "").slice(-1);
                        x.classList.toggle("filled", !!x.value);
                        if (!x.value) return;
                        if (!movimientoReducido()) gsap.fromTo(x, { scale: 0.88 }, { scale: 1, duration: 0.3, ease: "back.out(2.4)", clearProps: "transform" });
                        if (i < 5) dig.current[i + 1].focus();
                        else void comprobar();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !e.currentTarget.value && i > 0) {
                          dig.current[i - 1].focus();
                          dig.current[i - 1].value = "";
                        }
                        if (e.key === "ArrowLeft" && i > 0) dig.current[i - 1].focus();
                        if (e.key === "ArrowRight" && i < 5) dig.current[i + 1].focus();
                      }}
                      onPaste={(e) => {
                        const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                        if (!t) return;
                        e.preventDefault();
                        t.split("").forEach((c, k) => {
                          dig.current[k].value = c;
                          dig.current[k].classList.add("filled");
                        });
                        if (t.length === 6) void comprobar();
                        else dig.current[t.length].focus();
                      }}
                    />
                  ))}
                </div>
                <p className={`msg ${estado === "mal" ? "bad" : estado === "ok" ? "ok" : ""}`} role="status" aria-live="polite">{msgOtp}</p>
                <div className="timer">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="tr" cx="12" cy="12" r="10" />
                    <circle className="fg" cx="12" cy="12" r="10" strokeDasharray="62.8" style={{ strokeDashoffset: 62.8 * (1 - resta / Math.max(1, espera)), transition: "stroke-dashoffset 1s linear" }} />
                  </svg>
                  {resta > 0 ? <span>Puede pedir otro en {resta} s</span> : <button type="button" className="link" onClick={() => void reenviar()}>Reenviar código</button>}
                </div>
                <button type="button" className="link" onClick={() => ir("crear")}>Cambiar el correo</button>
              </>
            )}
            {paso === "verif" && (
              <div className="verify">
                <div className="pilo-big">
                  <img src={MOOD.piensa} alt="" />
                </div>
                <h2>Preparando su acceso</h2>
                <ul className="checks">
                  {["Correo comprobado", "Buscando su rol en Pilo at Work", "Abriendo su memoria de trabajo"].map((t, i) => (
                    <li key={t} className={marcas > i + 1 ? "ok" : marcas === i + 1 ? "run" : ""}>
                      <span className="ic" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {paso === "ok" && rol && (
              <>
                <div className="pilo-big">
                  <img src={MOOD.excelente} alt="" />
                </div>
                <h2>Listo, {nombre || "bienvenido"}. Ya tiene acceso</h2>
                <p className="sub">Su administración le asignó este rol. Cambia lo que Pilo puede hacer por usted.</p>
                <span className="role">{ROL_ETIQUETA[rol]}</span>
                <button type="button" className="btn primary" onClick={() => onListo(rol)} autoFocus>
                  Entrar al espacio de trabajo
                </button>
              </>
            )}
            {paso === "norol" && (
              <>
                <div className="pilo-big">
                  <img src={MOOD.idea} alt="" />
                </div>
                <h2>Su cuenta está verificada, falta su rol</h2>
                <p className="sub">Pilo at Work es solo para personas con un rol asignado. Avisamos a la administración y le escribiremos a su correo cuando lo tenga.</p>
                <span className="badge warn">Solicitud enviada · en espera</span>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    ir("entrar");
                  }}
                >
                  Salir
                </button>
              </>
            )}
          </div>
        </div>
        <div className="access__foot">
          <span>Pilo at Work · Universidad de Santander</span>
          <button type="button" className="tbtn" onClick={onTema} aria-label="Cambiar entre tema claro y oscuro">
            Tema {tema === "dark" ? "oscuro" : "claro"}
          </button>
        </div>
      </div>
    </section>
  );
}
