/* =============================================================================
   Pilo at Work · acceso.

   Cuenta (Microsoft, o correo UDES y contraseña) · Código · Perfil · Listo. Reutiliza las
   cuentas de Pilo (función pilo-cuentas, 0120/0175): el código llega por correo y
   «Continuar con Microsoft» ya existen; el usuario se deriva del correo, sin pedirlo.
   Con la cuenta verificada y el perfil completo (PerfilPaso, 0261) la persona entra como
   INVITADA aunque no tenga fila en pw_roles; Planeación revisa el perfil y le da el rol.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { supabase } from "../../lib/supabase";
import { movimientoReducido } from "../rankings/movimiento";
import { asCuentaError, createMicrosoftAccount, loginAccount, prepareMicrosoft, registerAccount, sendRegisterCode, verifyRegisterCode } from "../pilo-app/account/api";
import { EMPTY_REG, cleanUsername, emailRule, passwordProblem, usernameProblem } from "../pilo-app/account/rules";
import type { PiloRol } from "../pilo-app/account/rules";
import { miRol, ROL_ETIQUETA } from "./api";
import type { Rol } from "./api";
import { PerfilPaso } from "./PerfilPaso";
import { IC, Logo, MOOD } from "./ui";

type Paso = "entrar" | "crear" | "otp" | "verif" | "perfil" | "listo";

/* El usuario, el nombre provisional y el tipo salen del correo: no se piden (el nombre real se pide en el Perfil). */
const local = (correo: string) => correo.trim().toLowerCase().split("@")[0] ?? "";
function usuarioDe(correo: string): string {
  let u = local(correo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._]/g, "").replace(/^[._]+|[._]+$/g, "").replace(/[._]{2,}/g, ".").slice(0, 20).replace(/[._]+$/, "");
  if (u.length < 4) u = `${u}udes`.slice(0, 20);
  return usernameProblem(u) ? `${u.slice(0, 14)}.udes` : u;
}
const nombreDe = (correo: string): string => {
  const n = local(correo).split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return n.length >= 3 ? n : "Persona UDES";
};
const tipoDe = (correo: string): PiloRol => (emailRule(correo)?.roles.includes("administrativo") ? "administrativo" : "profesor");

const Microsoft = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
    <rect x="1" y="1" width="8.5" height="8.5" fill="#f25022" />
    <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7fba00" />
    <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00a4ef" />
    <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#ffb900" />
  </svg>
);

export function Acceso({ onListo, aviso, tema, onTema, inicial }: { onListo: (rol: Rol) => void; aviso: (m: string) => void; tema: string; onTema: () => void; inicial?: "verif" | "ms" }) {
  const [paso, setPaso] = useState<Paso>(inicial === "verif" ? "verif" : "entrar");
  const [rol, setRol] = useState<Rol | null>(null);
  const [nombre, setNombre] = useState("");
  const [ses, setSes] = useState({ id: "", correo: "", nombre: "", sede: "" });
  const via = useRef("");
  const panel = useRef<HTMLDivElement>(null);
  const primera = useRef(true);

  // Lo que se pide al crear la cuenta: correo y contraseña.
  const [f, setF] = useState({ correo: "", clave: "", ok: false });
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

  /* --- Verificación y perfil ----------------------------------------------------------- */
  const [marcas, setMarcas] = useState<number>(0);
  const verificar = useCallback(async () => {
    setPaso("verif");
    setMarcas(0);
    const pausa = (ms: number) => new Promise((r) => setTimeout(r, movimientoReducido() ? 0 : ms));
    const { data } = await supabase.auth.getSession();
    const usuario = data.session?.user;
    const correo = (usuario?.email ?? "").toLowerCase();
    if (!emailRule(correo)) {
      await supabase.auth.signOut();
      setError("Pilo at Work es para cuentas de la UDES. Entre con su correo institucional.");
      return setPaso("entrar");
    }
    setNombre(String(usuario?.user_metadata?.full_name ?? correo).split(" ")[0]);
    setMarcas(1);
    await pausa(550);
    const r = await miRol();
    setMarcas(2);
    const { data: p } = await supabase.from("pilo_users").select("full_name, campus").eq("id", usuario?.id ?? "").maybeSingle();
    await pausa(700);
    setMarcas(3);
    await pausa(450);
    if (p?.full_name) setNombre(String(p.full_name).split(" ")[0]);
    if (r) {
      setRol(r);
      setPaso("listo");
    } else {
      setSes({ id: usuario?.id ?? "", correo, nombre: String(p?.full_name ?? usuario?.user_metadata?.full_name ?? ""), sede: String(p?.campus ?? "") });
      setPaso("perfil");
    }
  }, []);

  useEffect(() => {
    if (inicial === "verif") void verificar();
    if (inicial === "ms") void preparar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  /* --- Microsoft: el correo ya viene comprobado; se crea la cuenta sin pedir nada más ---- */
  async function preparar() {
    try {
      const p = await prepareMicrosoft();
      via.current = "Microsoft";
      if (p.kind === "nuevo") {
        const roles = p.roles.filter((r) => r !== "estudiante");
        await createMicrosoftAccount({ ...EMPTY_REG, email: p.email, rol: roles[0] ?? tipoDe(p.email), campus: p.campus || "bucaramanga", fullName: p.fullName || nombreDe(p.email), username: usuarioDe(p.email), nick: (p.fullName || nombreDe(p.email)).split(" ")[0], terms: true, ms: true });
      }
      await verificar();
    } catch (e) {
      setError(asCuentaError(e).message);
      setPaso("entrar");
    }
  }
  async function conMicrosoft() {
    setOcupado(true);
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: `${window.location.origin}/work?ms=1` } });
    if (e) {
      setError("No se pudo abrir Microsoft. Intente con su correo de la UDES.");
      setOcupado(false);
    }
  }

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
    if (!dominio) return setError("Use un correo de la UDES.");
    const mala = passwordProblem(f.clave);
    if (mala) return setError(mala);
    if (!f.ok) return setError("Confirme lo de los archivos locales.");
    setOcupado(true);
    try {
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
      // El usuario sale del correo; si ya existe, se prueba con un número al final.
      const base = usuarioDe(f.correo);
      let usuario = base;
      let salida: Awaited<ReturnType<typeof registerAccount>>;
      for (let intento = 0; ; intento++) {
        try {
          salida = await registerAccount({ ...EMPTY_REG, email: f.correo, rol: tipoDe(f.correo), campus: emailRule(f.correo)?.campus || "bucaramanga", fullName: nombreDe(f.correo), username: usuario, password: f.clave, nick: nombreDe(f.correo).split(" ")[0], terms: true, ticket: ticket.current });
          break;
        } catch (e) {
          if (intento >= 2 || asCuentaError(e).code !== "usuario") throw e;
          usuario = `${base.slice(0, 16)}${Math.floor(1000 + Math.random() * 9000)}`;
        }
      }
      via.current = "Código al correo";
      if (salida === "ingresar") await loginAccount(cleanUsername(usuario), f.clave);
      if (salida === "confirmar") {
        setPaso("entrar");
        setError("Le enviamos un correo para confirmar la cuenta. Ábralo y luego entre aquí.");
        return;
      }
      await verificar();
    } catch (e) {
      setEstado("mal");
      setMsgOtp(asCuentaError(e).message || "Ese código no coincide. Revise el correo e intente de nuevo.");
      if (!movimientoReducido()) gsap.to(".pwk .otp", { keyframes: { x: [-10, 9, -6, 4, 0] }, duration: 0.4, ease: "power2.out" });
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

  const n = ({ entrar: 1, crear: 1, otp: 2, verif: 3, perfil: 3, listo: 4 } as Record<Paso, number>)[paso];
  const pasos = ["Cuenta", "Código", "Perfil", "Listo"];

  return (
    <section className={`screen${paso === "perfil" ? " wide" : ""}`} id="auth" aria-label="Acceso a Pilo at Work">
      <div className="hero">
        <Logo alto={34} variante="blanco" />
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
        <p className="hero__foot">Entra con correo de la UDES o con Microsoft. Si aún no tiene rol, entra como invitado.</p>
        <div className="hero__pilo" aria-hidden="true">
          <img src={MOOD.feliz} alt="" />
        </div>
      </div>
      <div className="access">
        <div className="access__top">
          {(
            <div className="steps" aria-label="Progreso de la cuenta">
              {pasos.map((p, i) => (
                <span key={p} style={{ display: "contents" }}>
                  <span className={`st${n === i + 1 ? " on" : ""}${i + 1 < n ? " done" : ""}`}>
                    <i>{i + 1}</i>
                    {p}
                  </span>
                  {i < 3 && (
                    <span className="sln">
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
          <div className={paso === "perfil" ? "perfil" : "panel"} ref={panel} key={paso}>
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
                <p className="sub">Le enviaremos un código de seis dígitos para comprobar su correo. Después le pedimos su perfil.</p>
                <div className="field">
                  <label htmlFor="c-mail">Correo institucional</label>
                  <input className="inp" id="c-mail" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} placeholder="nombre@udes.edu.co" autoComplete="email" />
                  <span className={`dom${f.correo ? (dominio ? " ok" : " bad") : ""}`} aria-live="polite">
                    {!f.correo ? "Use su correo de la UDES" : dominio ? `Dominio de la UDES reconocido${dominio.campus ? ` · sede ${dominio.campus}` : ""}` : "Este correo no es de la UDES"}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="c-pass">Contraseña</label>
                  <input className="inp" id="c-pass" type="password" value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} placeholder="Mínimo 8 caracteres, con letra y número" autoComplete="new-password" />
                  <div className="meter" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <i key={i} style={{ ["--f" as string]: i < fuerza ? 1 : 0, ["--c" as string]: ["var(--risk)", "var(--warn)", "var(--blue)", "var(--ok)"][Math.max(0, fuerza - 1)] }} />
                    ))}
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
                <h2>Comprobando que es de la UDES</h2>
                <ul className="checks">
                  {["Correo de la UDES comprobado", "Buscando si ya tiene perfil", "Preparando su formulario"].map((t, i) => (
                    <li key={t} className={marcas > i + 1 ? "ok" : marcas === i + 1 ? "run" : ""}>
                      <span className="ic" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {paso === "perfil" && <PerfilPaso userId={ses.id} correo={ses.correo} nombreInicial={ses.nombre} sedeInicial={ses.sede} via={via.current} aviso={aviso} onListo={(n) => { setNombre(n.split(" ")[0]); setRol("invitado"); setPaso("listo"); }} />}
            {paso === "listo" && rol === "invitado" && (
              <>
                <span className="badge blue" style={{ justifySelf: "start" }}>Perfil guardado</span>
                <h2>Listo, {nombre || "bienvenido"}. Entra como invitado</h2>
                <p className="sub">Su cuenta es de la UDES y su perfil ya está con Planeación. Mientras le asignan rol puede usar esto:</p>
                <ul className="tier">
                  {["Redactar, resumir y revisar textos", "Leer archivos en su equipo, sin subirlos a la nube", "Hablar con Pilo con un límite diario básico"].map((t) => (
                    <li key={t} className="yes">{IC.check}<span>{t}</span></li>
                  ))}
                </ul>
                <ul className="tier">
                  {["Correo y calendario de Microsoft 365", "Memoria compartida de su oficina", "Pantallas de la intranet de su unidad"].map((t) => (
                    <li key={t} className="no">{IC.close}<span>{t} <span className="hint">(con rol)</span></span></li>
                  ))}
                </ul>
                <div className="note">
                  {IC.warn}
                  <span>Planeación revisa su perfil. Cuando le dé un rol le escribimos a su correo y se abre el resto, sin repetir nada.</span>
                </div>
                <button type="button" className="btn primary" onClick={() => onListo("invitado")} autoFocus>
                  Entrar a Pilo at Work
                </button>
              </>
            )}
            {paso === "listo" && rol && rol !== "invitado" && (
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
