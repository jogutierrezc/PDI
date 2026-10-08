/* =============================================================================
   Alertas de emergencia · la capa de Mr. Pilo (0138).

   Vive montada en toda la aplicación y está dormida: lee la tabla pilo_alerts
   una vez al abrir y se queda escuchando sus cambios. Cuando Aluna declara una
   emergencia (sismo, incendio, seguridad), la función `pilo-alertas` la anota
   ahí y esta capa aparece, a pantalla completa, en cualquier página y para
   cualquier persona, con o sin sesión. Al cerrarse en Aluna, se retira sola.

   Tres formas:
     · completa   la emergencia sin leer: qué pasa, qué hacer, escuchar a Pilo.
     · franja     ya la leyó: queda arriba, porque la emergencia sigue.
     · despejado  Aluna dio por controlada la emergencia: un aviso que se cierra.

   Sin la migración 0138 la lectura falla y la capa queda dormida.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { speak, stopSpeaking } from "../pilo/voice";
import { COLUMNAS_ALERTA, GUIA, NOMBRE_KIND, estadoCapa, filasDe, haceCuanto, textoParaLeer } from "./logic";
import type { EstadoCapa, FilaAlerta } from "./logic";
import "./alertas.css";

const LEIDAS = "pilo-alertas-leidas";
const DESPEJADOS = "pilo-alertas-despejadas";

function leerSet(clave: string): Set<string> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(clave) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function guardarSet(clave: string, valor: Set<string>) {
  try {
    sessionStorage.setItem(clave, JSON.stringify([...valor].slice(-50)));
  } catch {
    /* sin almacenamiento: la capa funciona igual, solo olvida lo leído al recargar */
  }
}

/** Las alertas de la tabla, al abrir y en vivo. Sin la migración, la lista queda vacía. */
export function useAlertas(): FilaAlerta[] {
  const [filas, setFilas] = useState<FilaAlerta[]>([]);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const { data, error } = await supabase.from("pilo_alerts").select(COLUMNAS_ALERTA).order("emitted_at", { ascending: false }).limit(20);
      if (vivo && !error) setFilas(filasDe(data));
    };
    void cargar();
    const canal = supabase
      .channel("pilo-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "pilo_alerts" }, () => void cargar())
      .subscribe();
    // Si el canal en vivo se cae (red, móvil dormido), al volver a la pestaña se vuelve a preguntar.
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      void supabase.removeChannel(canal);
    };
  }, []);

  return filas;
}

const ICONO: Record<FilaAlerta["kind"], string> = { sismo: "〰", incendio: "▲", seguridad: "◆", general: "!" };

interface CapaProps {
  estado: EstadoCapa;
  onLeida: (id: string) => void;
  onReabrir: (id: string) => void;
  onDespejado: (id: string) => void;
  /** Vista previa de la administración: no es una emergencia, no vibra ni suena sola. */
  vistaPrevia?: boolean;
}

export function AlertaCapa({ estado, onLeida, onReabrir, onDespejado, vistaPrevia = false }: CapaProps) {
  const { modo, alerta } = estado;
  const [ahora, setAhora] = useState(() => Date.now());
  const [leyendo, setLeyendo] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modo === "dormida") return;
    const t = window.setInterval(() => setAhora(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, [modo]);

  // La capa completa se lleva el foco; al aparecer, el teléfono vibra una vez.
  const idCompleta = modo === "completa" ? alerta?.id : null;
  useEffect(() => {
    if (!idCompleta) return;
    boton.current?.focus();
    if (!vistaPrevia) {
      try {
        navigator.vibrate?.([300, 150, 300, 150, 600]);
      } catch {
        /* no todos los dispositivos vibran */
      }
    }
    return () => {
      stopSpeaking();
      setLeyendo(false);
    };
  }, [idCompleta, vistaPrevia]);

  const escuchar = useCallback(() => {
    if (!alerta) return;
    if (leyendo) {
      stopSpeaking();
      setLeyendo(false);
      return;
    }
    setLeyendo(true);
    void speak(textoParaLeer(alerta), { force: true }).finally(() => setLeyendo(false));
  }, [alerta, leyendo]);

  if (modo === "dormida" || !alerta) return null;
  const simulacro = alerta.source === "simulacro";

  if (modo === "franja") {
    return (
      <div className="alerta-franja" data-kind={alerta.kind} role="alert">
        <span className="alerta-franja__icono" aria-hidden="true">{ICONO[alerta.kind]}</span>
        <span className="alerta-franja__texto">
          <strong>{simulacro ? "Simulacro · " : ""}{alerta.title}</strong>
          {estado.activas > 1 && <small> · {estado.activas} emergencias activas</small>}
        </span>
        <button type="button" onClick={() => onReabrir(alerta.id)}>
          Ver indicaciones
        </button>
      </div>
    );
  }

  if (modo === "despejado") {
    return (
      <div className="alerta-despejado" role="status" aria-live="polite">
        <span className="alerta-despejado__marca" aria-hidden="true">✓</span>
        <span>
          <strong>Todo despejado.</strong> {alerta.close_note ?? "La emergencia fue dada por controlada."} <small>Siga las indicaciones de su sede para regresar.</small>
        </span>
        <button type="button" onClick={() => onDespejado(alerta.id)}>
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div className="alerta-capa" data-kind={alerta.kind} data-simulacro={simulacro || undefined} role="alertdialog" aria-modal="true" aria-labelledby="alerta-titulo" aria-describedby="alerta-cuerpo">
      <div className="alerta-capa__tarjeta">
        <p className="alerta-capa__etiqueta">
          <span aria-hidden="true">{ICONO[alerta.kind]}</span>
          {simulacro ? "Simulacro" : "Emergencia"} · {NOMBRE_KIND[alerta.kind]}
          {estado.activas > 1 && <em> · {estado.activas} activas</em>}
        </p>
        <h2 id="alerta-titulo">{alerta.title}</h2>
        {alerta.body && (
          <p id="alerta-cuerpo" className="alerta-capa__cuerpo">
            {alerta.body}
          </p>
        )}
        <p className="alerta-capa__hora">
          {alerta.code ? `${alerta.code} · ` : ""}
          {haceCuanto(alerta.emitted_at, ahora)}
        </p>
        <h3>Qué hacer</h3>
        <ol className="alerta-capa__guia">
          {GUIA[alerta.kind].map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
        <p className="alerta-capa__nota">Siga siempre las instrucciones de las brigadas y de la seguridad de su sede.</p>
        <div className="alerta-capa__acciones">
          <button ref={boton} type="button" className="alerta-capa__principal" onClick={() => onLeida(alerta.id)}>
            Entendido
          </button>
          <button type="button" className="alerta-capa__secundario" onClick={escuchar} aria-pressed={leyendo}>
            {leyendo ? "Detener" : "Escuchar a Pilo"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** El contenedor: lee las alertas, recuerda lo que la persona ya leyó y pinta la capa. */
export function AlertaEmergencia() {
  const filas = useAlertas();
  const [leidas, setLeidas] = useState<Set<string>>(() => leerSet(LEIDAS));
  const [despejados, setDespejados] = useState<Set<string>>(() => leerSet(DESPEJADOS));

  const estado = useMemo(() => estadoCapa(filas, leidas, despejados, Date.now()), [filas, leidas, despejados]);

  const marcar = useCallback((clave: string, set: Set<string>, cambiar: (s: Set<string>) => void, id: string, poner: boolean) => {
    const next = new Set(set);
    if (poner) next.add(id);
    else next.delete(id);
    guardarSet(clave, next);
    cambiar(next);
  }, []);

  return (
    <AlertaCapa
      estado={estado}
      onLeida={(id) => marcar(LEIDAS, leidas, setLeidas, id, true)}
      onReabrir={(id) => marcar(LEIDAS, leidas, setLeidas, id, false)}
      onDespejado={(id) => marcar(DESPEJADOS, despejados, setDespejados, id, true)}
    />
  );
}

/** Para la administración: cómo se ve la capa, sin tocar la base ni avisar a nadie. */
export function AlertaVistaPrevia({ kind, onClose }: { kind: FilaAlerta["kind"]; onClose: () => void }) {
  const [leida, setLeida] = useState(false);
  const alerta: FilaAlerta = useMemo(
    () => ({
      id: "vista-previa", source: "simulacro", code: "VISTA PREVIA", kind,
      title: kind === "sismo" ? "Sismo en la ciudad" : kind === "incendio" ? "Incendio en un bloque del campus" : kind === "seguridad" ? "Alerta de seguridad en el campus" : "Emergencia en el campus",
      body: "Así se ve la alerta. Es solo una vista previa: nadie más la está viendo.", state: "activa", emitted_at: new Date().toISOString(), closed_at: null, close_note: null,
    }),
    [kind],
  );
  const estado: EstadoCapa = { modo: leida ? "franja" : "completa", alerta, activas: 1 };
  return (
    <>
      <AlertaCapa estado={estado} vistaPrevia onLeida={() => setLeida(true)} onReabrir={() => setLeida(false)} onDespejado={onClose} />
      <button type="button" className="alerta-cerrar-previa" onClick={onClose}>
        Cerrar la vista previa
      </button>
    </>
  );
}
