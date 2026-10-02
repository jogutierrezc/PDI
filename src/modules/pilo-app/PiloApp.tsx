/* =============================================================================
   Mr. Pilo · la app (/app), en el teléfono y en el computador.

   Una app instalable para las dos versiones de Mr. Pilo: el de la Universidad
   (el espacio «planeacion», el de /pregunta) y Pilo en Enseñanza (el espacio
   «ensenanza», el de /pilo-ensenanza). No es otro Pilo: usa los mismos
   perfiles (space.ts), el mismo pedido y la misma voz (client.ts), las mismas
   conversaciones guardadas (store.ts) y los mismos permisos de cada espacio.

     /app              la bienvenida la primera vez; después, la última conversación
     /app/universidad  Pilo de la Universidad
     /app/ensenanza    Pilo en Enseñanza
     /app/cuenta       crear la cuenta de Pilo, entrar, o seguir sin cuenta (0120)
     /app/perfil       los datos de la cuenta y cómo le habla Pilo
     /app/guardadas    las respuestas guardadas en la cuenta

   Aquí se decide qué se ve: la bienvenida, cuál Pilo, con qué tema, quién usa
   la app y si hay conexión. La conversación es AppShell; la bienvenida,
   AppWelcome; la cuenta, lo de account/.

   Un usuario de Pilo tiene sesión pero no perfil de intranet: aquí cuenta
   como sesión («miembro»); en la intranet no abre nada.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { usePiloAiConfig } from "../../components/pilo/ai/config";
import type { Role } from "../../components/pilo/ai/logic";
import { preloadPiloFace } from "../../components/pilo/PiloFace";
import { markWelcome, readRol, readStored, seenWelcome, storageKey, writeRol, writeStored } from "../pregunta/store";
import { ASK_SPACES, asksRol } from "../pregunta/space";
import type { Rol, SpaceId } from "../pregunta/space";
import { spaceDoor } from "./access";
import { APP_BASE, APP_PATHS, readAppPath, startTarget } from "./routes";
import { AppPage, AppSide, useWide } from "./AppSide";
import type { Person } from "./AppSide";
import { loadSaved, readLast, removeSaved, savedEntries } from "./saved";
import type { SavedEntry } from "./saved";
import { usePiloAccount } from "./account/useAccount";
import { useSavedAnswers } from "./account/answers";
import { memberAskRol, personCard } from "./account/rules";
import { AccountGate } from "./account/AccountGate";
import { ProfilePane } from "./account/ProfilePane";
import { SavedPane } from "./account/SavedPane";
import { APP_PREFIX, readTheme, writeTheme } from "./themes";
import type { AppTheme } from "./themes";
import { welcomeVoice } from "./welcome-script";
import { registerAppWorker, useInstall, useKeyboardViewport, useOnline } from "./pwa";
import { AppShell } from "./AppShell";
import { AppWelcome } from "./AppWelcome";
import "../pregunta/ask-pilo.css";
import "./pilo-app-themes.css";
import "./pilo-app.css";
import "./account/account.css";

const KEY_VOICE = storageKey(APP_PREFIX, "voz");
const KEY_INSTALL = storageKey(APP_PREFIX, "instalar");
const ENSENANZA = ASK_SPACES.ensenanza;

export function PiloApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const place = readAppPath(location.pathname);
  const config = usePiloAiConfig();
  const { profile, loading, session } = useAuth();
  const role = (profile?.is_active ? profile.role : null) as Role | null;
  // La cuenta de Pilo de esta sesión (0120): activa, cuenta como sesión en los dos Pilos.
  const cuenta = usePiloAccount();
  const { account, member } = cuenta;
  const wide = useWide();
  const online = useOnline();
  const install = useInstall();
  const root = useRef<HTMLDivElement>(null);
  const faceSlot = useRef<HTMLDivElement>(null);
  useKeyboardViewport(root);

  const [theme, setTheme] = useState<AppTheme>(readTheme);
  // La voz: encendida mientras no se apague. Vale para la bienvenida y para leer las respuestas.
  const [voiceOn, setVoiceOn] = useState(() => readStored(KEY_VOICE) !== "0");
  const [installDismissed, setInstallDismissed] = useState(() => readStored(KEY_INSTALL) === "0");
  // Quién pregunta en Enseñanza: lo mismo que recuerda su página.
  const [storedRol, setRol] = useState<Rol | null>(() => readRol(ENSENANZA.storagePrefix));
  // Con cuenta, el rol es el de la cuenta: no se pregunta ni se cambia aquí.
  const rol: Rol | null = member && account ? memberAskRol(account) : storedRol;
  const [welcoming, setWelcoming] = useState(() => place.kind === "inicio" && !seenWelcome(APP_PREFIX));
  // El Pilo que queda debajo de la bienvenida mientras se elige.
  const [home] = useState<SpaceId>(() => startTarget({ seen: true, last: readLast().space }) as SpaceId);

  useEffect(() => {
    registerAppWorker();
    preloadPiloFace();
    // Las poses también, y sobre todo «en obra»: sin conexión ya no se podría descargar.
    for (const pose of ["obra", "pensar", "graduado"]) new Image().src = `/pilo-face/${pose}.png`;
  }, []);

  /* El nombre de la pestaña y el color de la barra del teléfono son los de la app mientras está abierta. */
  useEffect(() => {
    const before = document.title;
    document.title = "Mr. Pilo";
    return () => {
      document.title = before;
    };
  }, []);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const color = getComputedStyle(el).getPropertyValue(welcoming ? "--s2" : "--c-bar").trim();
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const before = metas.map((m) => m.content);
    if (color) metas.forEach((m) => (m.content = color));
    return () => metas.forEach((m, i) => (m.content = before[i]));
    // También al cambiar de ruta: en /app a secas aún no hay pantalla que medir.
  }, [theme, welcoming, location.pathname]);

  const rules = config.data ?? null;
  // También mientras se lee la cuenta: así un Pilo «con sesión» no parpadea como cerrado.
  const waking = online && (config.isPending || loading || cuenta.pending);
  const doors = useMemo(() => ({ planeacion: spaceDoor(rules, ASK_SPACES.planeacion, role, member), ensenanza: spaceDoor(rules, ENSENANZA, role, member) }), [rules, role, member]);
  const person: Person = useMemo(
    () => ({ card: account ? personCard(account) : null, intranet: role ? profile?.full_name || profile?.email || "Su cuenta" : null, saved: null }),
    [account, role, profile?.full_name, profile?.email],
  );
  const greeting = useMemo(() => (online ? welcomeVoice(doors) : null), [doors, online]);

  const pickTheme = (next: AppTheme) => {
    setTheme(next);
    writeTheme(next);
  };
  const pickVoice = (on: boolean) => {
    setVoiceOn(on);
    writeStored(KEY_VOICE, on ? "1" : "0");
  };
  const pickRol = (chosen: Rol) => {
    writeRol(ENSENANZA.storagePrefix, chosen);
    setRol(chosen);
  };
  /** ¿Ese Pilo va a preguntar quién habla? Solo Enseñanza, si su ficha no lo apagó y aún no se sabe. */
  const willAskRol = useCallback((space: SpaceId) => space === "ensenanza" && rol === null && asksRol(ENSENANZA, doors.ensenanza.cfg), [rol, doors.ensenanza.cfg]);

  if (place.kind === "otra") return <Navigate to={APP_BASE} replace />;
  // /app, ya vista la bienvenida: al Pilo de la última conversación.
  if (place.kind === "inicio" && !welcoming) return <Navigate to={APP_PATHS[home]} replace />;

  /* --- La cuenta: registro e ingreso, perfil y guardadas ------------------------------------- */

  if (place.kind === "cuenta") {
    return (
      <div className="pa" ref={root} data-tema={theme}>
        <AccountGate
          voice={greeting}
          voiceOn={voiceOn}
          onVoice={pickVoice}
          theme={theme}
          onTheme={pickTheme}
          account={account}
          pending={cuenta.pending}
          hasSession={Boolean(session)}
          intranetName={person.intranet}
          home={APP_PATHS[home]}
        />
      </div>
    );
  }

  if (place.kind === "perfil" || place.kind === "guardadas") {
    const profilePage = place.kind === "perfil";
    return (
      <div className="pa" ref={root} data-tema={theme}>
        <AppPage
          title={profilePage ? (account ? "Mi perfil" : "Mis preferencias") : "Respuestas guardadas"}
          lead={
            profilePage
              ? account
                ? "Sus datos y la manera en que Pilo le habla y le responde."
                : "Cómo le habla Pilo y con qué tema se ve la app."
              : "Lo que guarda queda en su cuenta y lo encuentra en cualquier dispositivo."
          }
          home={APP_PATHS[home]}
          side={wide ? <PageSide home={home} active={profilePage ? "perfil" : "guardadas"} person={person} userId={session?.user.id} member={member} /> : null}
        >
          {profilePage ? (
            <ProfilePane
              state={cuenta}
              theme={theme}
              onTheme={pickTheme}
              intranetName={person.intranet}
              onWelcome={() => {
                setWelcoming(true);
                navigate(APP_PATHS[home]);
              }}
            />
          ) : (
            <SavedPane userId={session?.user.id} member={member} pending={cuenta.pending} />
          )}
        </AppPage>
      </div>
    );
  }

  const spaceId: SpaceId = place.kind === "pilo" ? place.space : home;
  const space = ASK_SPACES[spaceId];
  const door = doors[spaceId];

  return (
    <div className="pa" ref={root} data-tema={theme}>
      {/* Mientras la bienvenida está encima, lo de debajo no se enfoca ni se lee. */}
      <ShellFrame inert={welcoming}>
        <AppShell
          // Cada Pilo monta su propia conversación: nada de uno queda en la memoria del otro.
          key={space.id}
          space={space}
          door={door}
          waking={waking}
          online={online}
          person={person}
          member={member}
          wide={wide}
          theme={theme}
          onTheme={pickTheme}
          voiceOn={voiceOn}
          onVoice={pickVoice}
          rol={rol}
          onRol={pickRol}
          faceSlot={faceSlot}
          welcoming={welcoming}
          onWelcome={() => setWelcoming(true)}
          onSwitch={(next, open) => navigate(APP_PATHS[next], { replace: true, state: open ? { open } : null })}
          install={{
            way: install.way,
            dismissed: installDismissed,
            run: () => void install.install(),
            dismiss: () => {
              setInstallDismissed(true);
              writeStored(KEY_INSTALL, "0");
            },
          }}
        />
      </ShellFrame>

      {welcoming && (
        <AppWelcome
          target={faceSlot}
          voice={greeting}
          voiceOn={voiceOn}
          onVoice={pickVoice}
          asksRol={willAskRol}
          fallback={spaceId}
          onChoose={(next) => {
            if (place.kind !== "pilo" || place.space !== next) navigate(APP_PATHS[next], { replace: true });
          }}
          onRol={pickRol}
          onDone={() => {
            markWelcome(true, APP_PREFIX);
            setWelcoming(false);
          }}
        />
      )}
    </div>
  );
}

/** La barra lateral del escritorio en las pantallas que no son la conversación: lleva a ella. */
function PageSide({ home, active, person, userId, member }: { home: SpaceId; active: "perfil" | "guardadas"; person: Person; userId: string | undefined; member: boolean }) {
  const navigate = useNavigate();
  const [convs, setConvs] = useState(() => ({ planeacion: loadSaved("planeacion"), ensenanza: loadSaved("ensenanza") }));
  const entries = useMemo(() => savedEntries(convs), [convs]);
  const kept = useSavedAnswers(userId, member);
  return (
    <AppSide
      space={home}
      saved={entries}
      currentId={null}
      active={active}
      person={{ ...person, saved: member ? (kept.data?.length ?? null) : null }}
      onOpen={(entry: SavedEntry) => navigate(APP_PATHS[entry.space], { state: { open: entry.id } })}
      onDelete={(entry: SavedEntry) => setConvs((c) => ({ ...c, [entry.space]: removeSaved(entry.space, entry.id) }))}
      onNew={() => navigate(APP_PATHS[home], { state: { nueva: true } })}
      onSwitch={(space) => navigate(APP_PATHS[space])}
    />
  );
}

/** La conversación, que ocupa las tres filas de la app; inerte mientras la bienvenida la tapa. */
function ShellFrame({ inert, children }: { inert: boolean; children: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    if (inert) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [inert]);
  return (
    <div className="pa-frame" ref={frame} aria-hidden={inert || undefined}>
      {children}
    </div>
  );
}
