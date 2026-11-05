/* =============================================================================
   Pilo at Work · acceso · paso «Perfil».

   Tras verificar el correo UDES, la persona dice quién es y dónde trabaja. Se guarda en
   dos sitios: pw_guardar_perfil (0261: la solicitud que revisa Planeación, con la unidad
   del organigrama) y pilo_user_perfil (los datos del carnet; se reutiliza carnet/rules.ts
   y carnet/api.ts, sin duplicar). Quien lo completa entra como invitado.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { CAMPUSES, campusLabel, emailRule } from "../pilo-app/account/rules";
import type { Campus, PiloRol } from "../pilo-app/account/rules";
import { loadPerfil, savePerfil } from "../pilo-app/carnet/api";
import { RH_OPTIONS, codeTail, emptyPerfil, problems, rhLabel } from "../pilo-app/carnet/rules";
import type { PerfilForm } from "../pilo-app/carnet/rules";
import { leerUnidades } from "./api";
import type { Unidad } from "./api";

type Tipo = Exclude<PiloRol, "estudiante">;
const GRUPOS: { kind: string; nombre: string }[] = [
  { kind: "oficina", nombre: "Oficinas" },
  { kind: "vicerrectoria", nombre: "Vicerrectorías" },
  { kind: "facultad", nombre: "Facultades" },
  { kind: "programa", nombre: "Programas" },
  { kind: "otra", nombre: "Otras" },
];
const VINCULACIONES = [
  { id: "planta", label: "Planta" },
  { id: "ocasional", label: "Ocasional" },
  { id: "catedra", label: "Cátedra" },
];
const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const palabras = (n: string) => n.trim().split(/\s+/).filter(Boolean);

export function PerfilPaso({ userId, correo, nombreInicial, sedeInicial, via, aviso, onListo }: { userId: string; correo: string; nombreInicial: string; sedeInicial: string; via: string; aviso: (m: string) => void; onListo: (nombre: string) => void }) {
  const regla = emailRule(correo);
  const tipos = (regla?.roles ?? ["administrativo", "profesor"]).filter((r): r is Tipo => r !== "estudiante");
  const [nombre, setNombre] = useState(nombreInicial);
  const [sede, setSede] = useState<Campus>((regla?.campus || (CAMPUSES.some((c) => c.id === sedeInicial) ? sedeInicial : "bucaramanga")) as Campus);
  const [tipo, setTipo] = useState<Tipo>(tipos[0] ?? "administrativo");
  const [cargo, setCargo] = useState("");
  const [unidad, setUnidad] = useState<Unidad | null>(null);
  const [form, setForm] = useState<PerfilForm>(emptyPerfil);
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [unidades, setUnidades] = useState<Unidad[]>([]);

  useEffect(() => {
    void leerUnidades().then(setUnidades);
    // Lo que ya tenía en su carnet (si lo había).
    void loadPerfil(userId)
      .then(({ form: f }) => {
        setForm(f);
        if (f.cargo) setCargo(f.cargo);
        if (f.vinculacion && tipos.includes("profesor")) setTipo("profesor");
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [userId]);

  const poner = (k: keyof PerfilForm, v: string | boolean) => setForm((x) => ({ ...x, [k]: v }));
  const falta = useMemo(() => {
    const out: Record<string, string> = {};
    if (palabras(nombre).length < 2) out.nombre = "Escriba nombre y apellido.";
    if (!unidad) out.dep = "Elija su dependencia de la lista.";
    if (cargo.trim().length < 2) out.cargo = "Escriba su cargo.";
    if (tipo === "profesor" && !form.vinculacion) out.vinc = "Elija su vinculación.";
    // Código y contacto: los mismos avisos del carnet (los datos obligatorios se validan arriba).
    const c = problems(tipo, { ...form, dependencia: unidad?.name ?? "", facultad: unidad?.name ?? "", cargo: cargo || "xx" });
    if (c.codigo) out.codigo = c.codigo;
    if (c.contacto) out.contacto = c.contacto;
    return out;
  }, [nombre, unidad, cargo, tipo, form]);
  const total = tipo === "profesor" ? 4 : 3;
  const hechos = (["nombre", "dep", "cargo"] as const).filter((k) => !falta[k]).length + (tipo === "profesor" && !falta.vinc ? 1 : 0);
  const completo = hechos === total && !falta.codigo && !falta.contacto;
  const ver = (k: string) => (tocado[k] ? falta[k] : "");
  const toc = (k: string) => setTocado((t) => ({ ...t, [k]: true }));

  async function guardar() {
    setTocado({ nombre: true, dep: true, cargo: true, vinc: true, codigo: true, contacto: true });
    if (!completo || !unidad) return;
    setError("");
    setOcupado(true);
    const nom = palabras(nombre).join(" ");
    const { error: e } = await supabase.rpc("pw_guardar_perfil", { p_nombre: nom, p_sede: sede, p_unit_id: unidad.id, p_cargo: cargo.trim(), p_via: via, p_tipo: tipo });
    if (e) {
      setError(e.message || "No se pudo guardar su perfil. Intente de nuevo.");
      setOcupado(false);
      return;
    }
    try {
      await savePerfil(userId, tipo, { ...form, dependencia: tipo === "administrativo" ? unidad.name : "", cargo: tipo === "administrativo" ? cargo : "", facultad: tipo === "profesor" ? unidad.name : "", vinculacion: tipo === "profesor" ? form.vinculacion : "" });
    } catch {
      aviso("El perfil quedó guardado, pero los datos del carnet no. Puede completarlos en Pilo.");
    }
    setOcupado(false);
    onListo(nom);
  }

  const ini = palabras(nombre).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
  const linea = [cargo.trim(), unidad?.name].filter(Boolean).join(" · ");
  const pie = [form.show_codigo && form.codigo ? codeTail(form.codigo) : "", form.show_rh && form.rh ? `RH ${rhLabel(form.rh)}` : "", campusLabel(sede)].filter(Boolean);
  const circ = 2 * Math.PI * 16;

  return (
    <>
      <div className="form">
        <div>
          <h2>Cuenta verificada. Ahora su perfil</h2>
          <p className="sub">
            Con esto Planeación sabe quién es usted y en qué unidad trabaja. <span className="badge ok">{correo}</span>
          </p>
        </div>
        <div className="grp">
          <h3>Quién es usted</h3>
          <div className="field">
            <label htmlFor="p-nom">Nombre completo</label>
            <input className={`inp${ver("nombre") ? " bad" : ""}`} id="p-nom" autoComplete="name" placeholder="Ana María Rojas" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => toc("nombre")} />
            <span className="err" role={ver("nombre") ? "alert" : undefined}>{ver("nombre")}</span>
          </div>
          <div className="row2">
            <div className="field">
              <span className="lbl" id="p-tipo">Es</span>
              <div className="seg" role="group" aria-labelledby="p-tipo">
                {tipos.map((t) => (
                  <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                    {t === "profesor" ? "Profesor" : "Administrativo"}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="p-sede">Sede</label>
              <select className="inp" id="p-sede" value={sede} onChange={(e) => setSede(e.target.value as Campus)}>
                {CAMPUSES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="grp">
          <h3>Dónde trabaja</h3>
          <Dependencia unidades={unidades} valor={unidad} onElegir={setUnidad} error={ver("dep")} onTocar={() => toc("dep")} />
          <div className="field">
            <label htmlFor="p-car">Cargo</label>
            <input className={`inp${ver("cargo") ? " bad" : ""}`} id="p-car" placeholder="Profesional, Director, Docente de planta…" value={cargo} onChange={(e) => setCargo(e.target.value)} onBlur={() => toc("cargo")} />
            <span className="err" role={ver("cargo") ? "alert" : undefined}>{ver("cargo")}</span>
          </div>
          {tipo === "profesor" && (
            <div className="field">
              <span className="lbl" id="p-vinc">Vinculación</span>
              <div className="seg" role="group" aria-labelledby="p-vinc">
                {VINCULACIONES.map((v) => (
                  <button key={v.id} type="button" aria-pressed={form.vinculacion === v.id} onClick={() => { poner("vinculacion", v.id); toc("vinc"); }}>
                    {v.label}
                  </button>
                ))}
              </div>
              <span className="err">{ver("vinc")}</span>
            </div>
          )}
        </div>
        <div className="grp">
          <h3>
            Para su carnet <span className="badge">Opcional</span>
          </h3>
          <div className="field">
            <label htmlFor="p-cod">{tipo === "profesor" ? "Código de docente" : "Código de funcionario"}</label>
            <input className={`inp${ver("codigo") ? " bad" : ""}`} id="p-cod" placeholder="3040" value={form.codigo} onChange={(e) => setForm((x) => ({ ...x, codigo: e.target.value.trim(), show_codigo: e.target.value.trim() ? x.show_codigo : false }))} onBlur={() => toc("codigo")} />
            <span className="err">{ver("codigo")}</span>
          </div>
          <Interruptor activo={form.show_codigo} deshabilitado={!form.codigo} etiqueta="Mostrar el código en el carnet" onCambio={() => poner("show_codigo", !form.show_codigo)} />
          <div className="field">
            <span className="lbl" id="p-rh">Tipo de sangre (RH)</span>
            <div className="rh" role="group" aria-labelledby="p-rh">
              {RH_OPTIONS.map((r) => (
                <button key={r.id} type="button" aria-pressed={form.rh === r.id} onClick={() => setForm((x) => ({ ...x, rh: x.rh === r.id ? "" : r.id, show_rh: x.rh === r.id ? false : x.show_rh }))}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Interruptor activo={form.show_rh} deshabilitado={!form.rh} etiqueta="Mostrar el RH en el carnet" onCambio={() => poner("show_rh", !form.show_rh)} />
          <div className="field">
            <label htmlFor="p-con">Contacto de emergencia</label>
            <input className={`inp${ver("contacto") ? " bad" : ""}`} id="p-con" placeholder="Nombre y teléfono" value={form.contacto} onChange={(e) => poner("contacto", e.target.value)} onBlur={() => toc("contacto")} />
            <span className="err">{ver("contacto")}</span>
          </div>
          <p className="hint">El código y el RH solo salen en el carnet si usted lo permite. Nunca viajan en el QR.</p>
        </div>
      </div>
      <aside className="pv" aria-label="Vista previa del carnet">
        <div className="card">
          <div className="h">
            <span>Carnet · Pilo</span>
            <span className="av">{ini}</span>
          </div>
          <div>
            <div className={`nm${nombre ? "" : " ph"}`}>{nombre.trim() || "Su nombre"}</div>
            <div className={`dt${linea ? "" : " ph"}`}>{linea || "Cargo · Dependencia"}</div>
          </div>
          <div className="ft">
            {pie.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
        </div>
        <div className="prog">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle className="tr" cx="20" cy="20" r="16" />
            <circle className="fg" cx="20" cy="20" r="16" strokeDasharray={circ.toFixed(1)} strokeDashoffset={(circ * (1 - hechos / total)).toFixed(1)} />
          </svg>
          <div>
            <b>
              {hechos} de {total} datos obligatorios
            </b>
            <span className="hint">{hechos === total ? "Listo para guardar" : "Faltan nombre, dependencia o cargo"}</span>
          </div>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="button" className="btn primary" disabled={!completo || ocupado} onClick={() => void guardar()}>
          Guardar perfil y entrar
        </button>
      </aside>
    </>
  );
}

function Interruptor({ activo, deshabilitado, etiqueta, onCambio }: { activo: boolean; deshabilitado: boolean; etiqueta: string; onCambio: () => void }) {
  return (
    <div className="sw">
      <button type="button" aria-pressed={activo} aria-label={etiqueta} disabled={deshabilitado} onClick={onCambio} />
      {etiqueta}
    </div>
  );
}

/* Selector con búsqueda y teclado (combobox con lista agrupada por tipo de unidad). */
function Dependencia({ unidades, valor, onElegir, error, onTocar }: { unidades: Unidad[]; valor: Unidad | null; onElegir: (u: Unidad | null) => void; error: string; onTocar: () => void }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const caja = useRef<HTMLInputElement>(null);
  const q = plano(texto);
  const grupos = GRUPOS.map((g) => ({ ...g, items: unidades.filter((u) => (GRUPOS.some((x) => x.kind === u.kind) ? u.kind : "otra") === g.kind && (!q || plano(u.name).includes(q) || plano(u.code) === q)) })).filter((g) => g.items.length);
  const planas = grupos.flatMap((g) => g.items);
  const elegir = (u: Unidad) => {
    onElegir(u);
    setTexto(u.name);
    setAbierto(false);
    onTocar();
  };
  const cerrar = () => {
    setAbierto(false);
    // Si lo escrito es exactamente una unidad, vale como elegida.
    const igual = unidades.find((u) => plano(u.name) === q);
    if (igual && !valor) onElegir(igual);
    onTocar();
  };
  return (
    <div className="field">
      <label htmlFor="p-dep">Dependencia</label>
      <div className="combo">
        <input
          ref={caja}
          id="p-dep"
          className={`inp${error ? " bad" : ""}`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls="p-list"
          aria-autocomplete="list"
          aria-activedescendant={abierto && activo >= 0 ? `p-o${activo}` : undefined}
          autoComplete="off"
          placeholder="Busque su oficina, facultad o programa"
          value={texto}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(cerrar, 120)}
          onChange={(e) => {
            setTexto(e.target.value);
            onElegir(null);
            setActivo(-1);
            setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAbierto(true);
              setActivo((a) => Math.min(planas.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(0, a - 1));
            } else if (e.key === "Home" && abierto) setActivo(0);
            else if (e.key === "End" && abierto) setActivo(planas.length - 1);
            else if (e.key === "Enter" && abierto && activo >= 0) {
              e.preventDefault();
              elegir(planas[activo]);
            } else if (e.key === "Escape") setAbierto(false);
          }}
        />
        <div className="list" id="p-list" role="listbox" aria-label="Dependencias" hidden={!abierto}>
          {(() => {
            let n = 0;
            return grupos.map((g) => (
              <div key={g.kind} role="group" aria-label={g.nombre}>
                <div className="gh" aria-hidden="true">{g.nombre}</div>
                {g.items.map((u) => {
                  const i = n++;
                  return (
                    <div
                      key={u.id}
                      id={`p-o${i}`}
                      role="option"
                      aria-selected={i === activo}
                      ref={(el) => {
                        if (el && i === activo) el.scrollIntoView({ block: "nearest" });
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        elegir(u);
                      }}
                    >
                      {u.name}
                      <em>{u.code}</em>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
          {!planas.length && <div className="none">{unidades.length ? "Ninguna unidad coincide. Escriba a Planeación para que la agreguen." : "Cargando el organigrama…"}</div>}
        </div>
      </div>
      <span className="hint">Salen del organigrama de la universidad. Si no encuentra la suya, escriba a Planeación.</span>
      <span className="err" role={error ? "alert" : undefined}>{error}</span>
    </div>
  );
}
