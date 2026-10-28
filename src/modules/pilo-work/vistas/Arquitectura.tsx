/* Cómo está construido · solo administración (la ruta no abre para otros roles y no lleva datos). */

import type { ReactNode } from "react";
import { useEntra } from "../ui";

const Capa = ({ n, items, pilo }: { n: string; items: string[]; pilo?: RegExp }) => (
  <div className="layer">
    <b>{n}</b>
    <ul>
      {items.map((i) => (
        <li key={i} className={pilo?.test(i) ? "es-pilo" : ""}>
          {i}
        </li>
      ))}
    </ul>
  </div>
);
const Flecha = () => (
  <div className="arrow" aria-hidden="true">
    <svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 2v14M3 11l5 5 5-5" />
    </svg>
  </div>
);
const Fila = ({ a, b, c }: { a: string; b: string; c: ReactNode }) => (
  <div className="tl">
    <b>{a}</b>
    <span>{b}</span>
    <span>{c}</span>
  </div>
);

export function Arquitectura() {
  const raiz = useEntra(".box", 0, 10);
  return (
    <div className="pad arch" style={{ maxWidth: 1000, margin: "0 auto" }} ref={raiz}>
      <div className="box">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>Cómo está construido</h2>
          <span className="badge role-adm">Solo administración</span>
        </div>
        <p className="muted" style={{ maxWidth: "68ch" }}>
          Una PWA de escritorio instalable, con cuatro capas. Lo que se lee en el equipo no pasa a la nube; la IA solo recibe lo que la persona aprueba.
        </p>
        <div className="layers">
          <Capa n="En este equipo (PWA /work)" items={["React + Vite · instalable", "TanStack AI · useChat + herramientas de cliente", "Web Worker · lectura de Excel/CSV", "docx · exportar documentos", "Service Worker propio · Web Push (VAPID)", "Avisos dentro de la app"]} />
          <Flecha />
          <Capa n="Funciones de servidor" items={["pilo-work · chat en streaming (SSE, protocolo TanStack AI)", "Mismo modelo de Pilo: Mistral, con NVIDIA de apoyo", "Herramientas de servidor: buscar_memoria, aplicar_skill, crear_documento", "pw-microsoft · OAuth + PKCE, tokens AES-GCM", "pw-avisos · recordatorios por Web Push"]} pilo={/Mistral/} />
          <Flecha />
          <Capa n="Datos (Supabase)" items={["Cuentas de Pilo · código de seis dígitos · Microsoft", "pw_roles · pw_mi_rol() (security definer)", "pw_memoria · pw_memoria_colectiva · pw_propuestas", "pw_skills · pw_documentos · pw_bitacora sin contenidos", "pw_equipos · aportes con consentimiento · Realtime", "RLS en todas las tablas pw_*"]} />
          <Flecha />
          <Capa n="Conectores" items={["Microsoft Graph · Mail.Read / Mail.ReadWrite", "Calendars.ReadWrite · OnlineMeetings.ReadWrite (Teams)", "Sin Mail.Send: no envía ni borra", "Tokens cifrados en pw_ms_tokens (solo service_role)"]} />
        </div>
      </div>
      <div className="grid2">
        <div className="box">
          <h2>Herramientas del agente</h2>
          <div className="table-lite">
            <div className="tl">
              <span>Herramienta</span>
              <span>Dónde corre</span>
              <span>Para qué</span>
            </div>
            <Fila a="buscar_memoria" b="Servidor" c="Trae reglas de la persona, del equipo y de la oficina" />
            <Fila a="aplicar_skill" b="Servidor" c="Carga las instrucciones de una skill y cuenta su uso" />
            <Fila a="crear_documento" b="Servidor" c="Redacta un borrador y lo deja en Cowork" />
            <Fila a="leer_datos_locales" b="Equipo (cliente)" c="Calcula sobre el archivo local; el agregado sale solo si la persona lo aprueba" />
            <Fila a="leer_correo" b="Equipo → Graph" c="Solo lectura de la bandeja" />
            <Fila a="organizar_correo" b="Equipo → Graph" c="Etiquetas y carpetas, con aprobación y deshacer" />
            <Fila a="crear_borrador" b="Equipo → Graph" c="Deja el texto en Borradores; no envía" />
            <Fila a="crear_reunion" b="Equipo → Graph" c="Evento con reunión de Teams, con aprobación" />
          </div>
        </div>
        <div className="box">
          <h2>Qué impone el servidor</h2>
          <ul className="flat">
            <li className="item"><span className="badge ok">Rol</span><div><p>Sin fila en pw_roles no se lee ni se escribe ninguna tabla pw_*, ni se llama a las funciones.</p></div><span /></li>
            <li className="item"><span className="badge ok">Administración</span><div><p>Roles, memoria colectiva y esta sección dependen de pw_es_admin(); la interfaz solo las oculta.</p></div><span /></li>
            <li className="item"><span className="badge ok">Datos locales</span><div><p>Las filas viven en un Web Worker; a la IA solo viaja esquema y agregados aprobados.</p></div><span /></li>
            <li className="item"><span className="badge ok">Instrucciones</span><div><p>Lo que dice un correo o un archivo es dato: el modelo no ejecuta órdenes escritas allí.</p></div><span /></li>
            <li className="item"><span className="badge blue">Bitácora</span><div><p>Quién usó qué y cuándo; nunca el texto ni los archivos.</p></div><span /></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
