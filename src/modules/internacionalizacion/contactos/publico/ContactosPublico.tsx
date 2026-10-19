/* =============================================================================
   Contactos · la página pública del enlace de invitación (/contactos/i/:token).

   Una persona invitada, sin cuenta: se identifica (nombre, cargo en la UDES y
   correo institucional), elige Académicos o Empleadores y aporta uno a uno o
   importando un archivo. Lo que envía cae en la carpeta «Contactos» de Tablas,
   con su nombre, cargo y correo en cada fila. Migración 0167; función int-contactos.

   El correo no se confirma todavía (no se envían correos): se comprueba el
   dominio permitido por la invitación.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { esTipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import type { TipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import { useEntrada, usePresion } from "../../ui/movimiento";
import { ErrorContactos, guardarSesion, identificar, infoInvitacion, leerSesion, misContactos, olvidarSesion } from "../api";
import type { InvitacionPublica, Sesion } from "../api";
import { ImportarArchivo } from "./ImportarArchivo";
import { MisAportes } from "./MisAportes";
import { TEXTO_AUTORIZACION, TEXTO_SUS_DATOS } from "./texto-legal";
import { UnoAUno } from "./UnoAUno";
import "./publico.css";

type Vista = "camino" | "uno" | "importar" | "mis";

const MOTIVO_CERRADA: Record<Exclude<InvitacionPublica["estado"], "activa">, string> = {
  pausada: "La invitación está en pausa. Pida a la Oficina de Internacionalización que la reactive.",
  vencida: "La invitación ya venció. Si todavía tiene contactos por compartir, pida a la Oficina que le envíe una nueva.",
  periodo_cerrado: "El periodo de esta invitación ya cerró y no se reciben más contactos.",
};

export function ContactosPublico() {
  const { token = "" } = useParams();
  const info = useQuery({ queryKey: ["int-contactos", "info", token], queryFn: () => infoInvitacion(token), retry: false, staleTime: 60_000 });
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion(token));
  const [vista, setVista] = useState<Vista>("camino");
  const [tipo, setTipo] = useState<TipoContacto>("academico");
  const [aviso, setAviso] = useState("");
  const [vencida, setVencida] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previo = document.title;
    document.title = "Compartir contactos · Internacionalización UDES";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = previo;
      meta.remove();
    };
  }, []);

  // El primer tipo que la invitación recibe.
  useEffect(() => {
    if (info.data && !info.data.tipos.includes(tipo)) setTipo(info.data.tipos[0] ?? "academico");
  }, [info.data, tipo]);

  useEntrada(raiz, "[data-entra]", `${vista}|${sesion ? "con" : "sin"}|${info.data?.estado ?? ""}`);
  usePresion(raiz, ".cp-btn, .cp-camino");

  const salir = () => {
    olvidarSesion(token);
    setSesion(null);
    setVista("camino");
  };
  const sesionVencida = () => {
    olvidarSesion(token);
    setSesion(null);
    setVencida(true);
  };

  const invitacion = info.data;
  const campusNombre = invitacion ? (invitacion.campus?.name ?? invitacion.campuses.find((c) => c.id === sesion?.campus_id)?.name ?? "") : "";

  let cuerpo;
  if (info.isPending) cuerpo = <p className="cp-ayuda" role="status">Abriendo la invitación…</p>;
  else if (info.error || !invitacion) {
    const e = info.error;
    cuerpo = (
      <section className="cp-card cp-cerrada" data-entra>
        <h1>{e instanceof ErrorContactos && e.estado === 404 ? "Este enlace no es válido" : "No se pudo abrir la invitación"}</h1>
        <p>{e instanceof ErrorContactos && e.estado === 404 ? "Revise que haya copiado el enlace completo o pida uno nuevo a la Oficina de Internacionalización." : e instanceof Error ? e.message : "Intente de nuevo en un momento."}</p>
      </section>
    );
  } else if (invitacion.estado !== "activa") {
    cuerpo = (
      <section className="cp-card cp-cerrada" data-entra>
        <span className="cp-eyebrow">{invitacion.nombre}</span>
        <h1>Esta invitación no recibe contactos</h1>
        <p>{MOTIVO_CERRADA[invitacion.estado]}</p>
      </section>
    );
  } else if (!sesion) {
    cuerpo = <Identificacion token={token} invitacion={invitacion} vencida={vencida} onListo={(s) => { guardarSesion(token, s); setSesion(s); setVencida(false); setVista("camino"); }} />;
  } else if (vista === "uno") {
    cuerpo = (
      <UnoAUno
        token={token}
        sesion={sesion}
        tipo={tipo}
        onVolver={() => setVista("camino")}
        onSesionVencida={sesionVencida}
        onListo={(texto, otro) => {
          setAviso(otro ? "" : texto);
          if (!otro) setVista("camino");
        }}
      />
    );
  } else if (vista === "importar") cuerpo = <ImportarArchivo token={token} sesion={sesion} tipo={tipo} onVolver={() => setVista("camino")} onSesionVencida={sesionVencida} />;
  else if (vista === "mis") cuerpo = <MisAportes token={token} sesion={sesion} onVolver={() => setVista("camino")} onSesionVencida={sesionVencida} />;
  else cuerpo = <Camino token={token} sesion={sesion} invitacion={invitacion} tipo={tipo} onTipo={setTipo} aviso={aviso} onVista={(v) => { setAviso(""); setVista(v); }} onSesionVencida={sesionVencida} />;

  return (
    <div className="cp" ref={raiz}>
      <header className="cp-top">
        <div className="cp-marca">
          <span className="cp-sigla" aria-hidden="true">IN</span>
          <span>Internacionalización UDES</span>
        </div>
        <span className="cp-quien">
          {sesion ? (
            <>
              {sesion.nombre}
              {campusNombre ? ` · Campus ${campusNombre}` : ""}
              <button type="button" onClick={salir}>No soy yo</button>
            </>
          ) : (
            "Invitación para compartir contactos"
          )}
        </span>
      </header>
      <main className="cp-main">{cuerpo}</main>
      <footer className="cp-pie">Universidad de Santander · Oficina de Internacionalización</footer>
    </div>
  );
}

/* ---------- Paso 1: quién es -------------------------------------------------------------- */

function Identificacion({ token, invitacion, vencida, onListo }: { token: string; invitacion: InvitacionPublica; vencida: boolean; onListo: (s: Sesion) => void }) {
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [correo, setCorreo] = useState("");
  const [campus, setCampus] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [trampa, setTrampa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const dominios = invitacion.dominios.map((d) => `@${d.replace(/^@/, "")}`).join(" o ");

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (trampa) return;
    if (!invitacion.campus && !campus) return setError("Elija su campus.");
    if (!acepta) return setError("Para continuar, acepte el tratamiento de los datos.");
    setEnviando(true);
    try {
      onListo(await identificar(token, { nombre, cargo, correo, campus_id: invitacion.campus ? null : campus }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo continuar. Intente de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="cp-card" onSubmit={alEnviar} data-entra noValidate aria-label="Sus datos">
      <div data-entra>
        <span className="cp-eyebrow">Paso 1 de 2 · Sus datos</span>
        <h1 style={{ marginTop: 8 }}>Comparta los contactos que ya conoce</h1>
        <p style={{ marginTop: 8 }}>Primero necesitamos saber quién es usted. Son tres datos y menos de un minuto.</p>
      </div>
      <p className="cp-aviso" data-entra>
        <b>{invitacion.nombre}</b> · Periodo {invitacion.periodo}
        {invitacion.campus ? ` · Campus ${invitacion.campus.name}` : ""} · vigente hasta el {new Date(`${invitacion.vence}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      {vencida && (
        <p className="cp-aviso is-mal" role="alert">
          Su sesión venció. Vuelva a identificarse con el mismo correo.
        </p>
      )}
      <div className="cp-campos" data-entra>
        <label className="cp-campo">
          <span>Nombre completo</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={160} required />
        </label>
        <label className="cp-campo">
          <span>Cargo en la UDES</span>
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} autoComplete="organization-title" maxLength={120} required />
        </label>
        <label className="cp-campo">
          <span>Correo institucional</span>
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" inputMode="email" maxLength={254} required />
          {dominios && <span className="cp-ayuda">Debe terminar en {dominios}.</span>}
        </label>
        {!invitacion.campus && (
          <label className="cp-campo">
            <span>Su campus</span>
            <select value={campus} onChange={(e) => setCampus(e.target.value)} required>
              <option value="">Elija…</option>
              {invitacion.campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="cp-honey" aria-hidden="true">
          <label>
            No llenar este campo
            <input tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
          </label>
        </div>
      </div>
      <label style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", color: "var(--ink-secondary)" }} data-entra>
        <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} style={{ marginTop: 3 }} />
        <span>{TEXTO_AUTORIZACION}</span>
      </label>
      {error && (
        <p className="cp-aviso is-mal" role="alert">
          {error}
        </p>
      )}
      <div className="cp-acciones" data-entra>
        <span className="cp-ayuda">{TEXTO_SUS_DATOS}</span>
        <button type="submit" className="cp-btn cp-btn--pri" disabled={enviando}>
          {enviando ? "Un momento…" : "Continuar"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Paso 2: cómo aportar ----------------------------------------------------------- */

function Camino({
  token,
  sesion,
  invitacion,
  tipo,
  onTipo,
  aviso,
  onVista,
  onSesionVencida,
}: {
  token: string;
  sesion: Sesion;
  invitacion: InvitacionPublica;
  tipo: TipoContacto;
  onTipo: (t: TipoContacto) => void;
  aviso: string;
  onVista: (v: Vista) => void;
  onSesionVencida: () => void;
}) {
  const mis = useQuery({ queryKey: ["int-contactos", "mis", token, sesion.aportante_id], queryFn: () => misContactos(token, sesion), retry: false });
  useEffect(() => {
    if (mis.error && mis.error instanceof ErrorContactos && mis.error.estado === 401) onSesionVencida();
  }, [mis.error]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega el error
  const enviados = mis.data?.filas.length ?? sesion.enviados;
  const primerNombre = sesion.nombre.split(" ")[0];

  return (
    <section className="cp-paso" aria-label="Cómo aportar">
      <div className="cp-acciones" data-entra>
        <div>
          <span className="cp-eyebrow">Paso 2 de 2 · Cómo aportar</span>
          <h1 style={{ marginTop: 8 }}>Hola, {primerNombre}. ¿Qué contactos va a compartir?</h1>
        </div>
        {enviados > 0 && (
          <button type="button" className="cp-btn" onClick={() => onVista("mis")}>
            Ya envió {enviados} · Ver mis aportes
          </button>
        )}
      </div>

      {aviso && (
        <p className="cp-aviso is-ok" role="status" data-entra>
          {aviso}
        </p>
      )}

      {invitacion.tipos.length > 1 && (
        <div className="cp-seg" role="radiogroup" aria-label="Tipo de contacto" data-entra>
          {invitacion.tipos.filter(esTipoContacto).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => onTipo(t)}>
              {t === "academico" ? "Académicos" : "Empleadores"}
              <small>{t === "academico" ? "docentes e investigadores" : "empresas que contratan egresados"}</small>
            </button>
          ))}
        </div>
      )}

      <div className="cp-caminos" data-entra>
        <button type="button" className="cp-camino" onClick={() => onVista("uno")}>
          <b>Uno a uno</b>
          <span>Escriba los datos de cada persona en un formulario corto. Ideal para unos pocos contactos.</span>
          <em>Empezar →</em>
        </button>
        <button type="button" className="cp-camino" onClick={() => onVista("importar")}>
          <b>Importar un archivo</b>
          <span>Suba un Excel o CSV con la plantilla. Antes de enviar verá qué filas están bien y cuáles hay que corregir.</span>
          <em>Descargar plantilla o subir →</em>
        </button>
      </div>
    </section>
  );
}
