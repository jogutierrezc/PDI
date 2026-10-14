/* =============================================================================
   Internacionalización · Accesos: quién está en el módulo.

   Solo el Director y la administración llegan aquí (seccionDe lo filtra).
   El equipo se lee de int_miembros por campus: el Director (global), y en
   cada campus sus coordinadores y gestores (uno o varios). Para nombrar a
   alguien se busca en el directorio de la intranet por nombre o correo: el
   directorio ya lo lee todo el personal (profiles_select, 0002), no es un
   permiso nuevo. A un Director solo lo nombra la administración
   (puedeNombrar); la base lo vuelve a exigir en int_miembros_write.
   La persona tiene que tener cuenta: si el correo no aparece, se dice cómo
   conseguirla. Debajo, qué puede hacer cada papel (lo mismo que hace cumplir
   la base, ver README).
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FaltaMigracion, useGuardarMiembro, useMiembros, usePersonas, useQuitarMiembro } from "../datos";
import type { Miembro, Persona } from "../datos";
import { ETIQUETA_ROL, puedeNombrar } from "../lib/permisos";
import type { IntRol } from "../tipos";
import { AvisoMigracion, Cargando, Confirmar, ErrorCaja, useAviso } from "./comunes";
import type { Ctx } from "./comunes";
import { useEntrada } from "./movimiento";

const ROLES: IntRol[] = ["director", "coordinador", "gestor"];

/** Qué hace cada papel: el espejo legible de lib/permisos y de la 0151. */
const CAPACIDADES: { que: string; director: boolean; coordinador: boolean; gestor: boolean }[] = [
  { que: "Ver las tablas y el avance", director: true, coordinador: true, gestor: true },
  { que: "Capturar filas y cargar Excel dentro de la ventana", director: true, coordinador: true, gestor: true },
  { que: "Enviar la hoja del campus", director: true, coordinador: true, gestor: true },
  { que: "Corregir una hoja enviada", director: true, coordinador: true, gestor: false },
  { que: "Validar o devolver con nota", director: true, coordinador: true, gestor: false },
  { que: "Aprobar, y reabrir con motivo", director: true, coordinador: false, gestor: false },
  { que: "Crear tablas y hojas, cargar plantillas", director: true, coordinador: false, gestor: false },
  { que: "Abrir y cerrar periodos y ventanas", director: true, coordinador: false, gestor: false },
  { que: "Enviar a SNIES (Reportes Institucionales)", director: true, coordinador: false, gestor: false },
  { que: "Nombrar coordinadores y gestores", director: true, coordinador: false, gestor: false },
];

export function Accesos({ ctx }: { ctx: Ctx }) {
  const miembros = useMiembros();
  const aviso = useAviso();
  const raiz = useRef<HTMLDivElement>(null);
  useEntrada(raiz, "[data-entra]", Boolean(miembros.data));

  if (miembros.error instanceof FaltaMigracion) return <AvisoMigracion error={miembros.error} />;
  if (miembros.error) return <ErrorCaja error={miembros.error} />;
  if (!miembros.data) return <Cargando texto="Leyendo el equipo…" />;

  const lista = miembros.data;
  const directores = lista.filter((m) => m.rol === "director");

  return (
    <div ref={raiz} className="it-accesos">
      <Alta ctx={ctx} miembros={lista} aviso={aviso} />
      {aviso.nodo}

      <section className="it-panel" aria-labelledby="it-equipo" data-entra>
        <header className="it-panel__cabeza">
          <h3 id="it-equipo">Equipo del módulo</h3>
          <span className="it-tenue it-num">{lista.length === 1 ? "1 nombramiento" : `${lista.length} nombramientos`}</span>
        </header>
        <div className="it-equipo">
          <div className="it-equipo__grupo">
            <h4 className="it-h4">Dirección</h4>
            {directores.length === 0 ? (
              <p className="it-tenue">
                Sin Director nombrado. Mientras tanto, la administración de la intranet hace sus veces.
                {ctx.admin ? " Nómbrelo arriba con el papel «Director»." : ""}
              </p>
            ) : (
              <ul>
                {directores.map((m) => (
                  <Persona1 key={m.id} m={m} ctx={ctx} aviso={aviso} />
                ))}
              </ul>
            )}
          </div>
          {ctx.campus.map((c) => {
            const del = lista.filter((m) => m.campus_id === c.id);
            return (
              <div key={c.id} className="it-equipo__grupo">
                <h4 className="it-h4">{c.name}</h4>
                {del.length === 0 ? (
                  <p className="it-tenue is-aviso">Nadie nombrado: el campus no puede capturar.</p>
                ) : (
                  <ul>
                    {del
                      .sort((a, b) => ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol) || a.nombre.localeCompare(b.nombre))
                      .map((m) => (
                        <Persona1 key={m.id} m={m} ctx={ctx} aviso={aviso} />
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="it-panel" aria-labelledby="it-capacidades" data-entra>
        <header className="it-panel__cabeza">
          <h3 id="it-capacidades">Qué puede hacer cada papel</h3>
          <span className="it-tenue">Lo hace cumplir la base de datos, no la pantalla.</span>
        </header>
        <div className="it-desliza">
          <table className="it-tabla it-tabla--compacta it-matriz">
            <thead>
              <tr>
                <th scope="col">Capacidad</th>
                <th scope="col">Director</th>
                <th scope="col">Coordinador</th>
                <th scope="col">Gestor</th>
              </tr>
            </thead>
            <tbody>
              {CAPACIDADES.map((k) => (
                <tr key={k.que}>
                  <th scope="row">{k.que}</th>
                  {(["director", "coordinador", "gestor"] as const).map((r) => (
                    <td key={r} className={k[r] ? "is-si" : "is-no"}>
                      {k[r] ? <Icon name="check" size={16} aria-label="Sí" /> : <span aria-label="No">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="it-ayuda it-panel__cuerpo">
          El Coordinador y el Gestor solo ven y escriben las filas de su campus; alguien puede tener varios campus. El Director ve todo. La administración de la intranet cuenta como
          Director.
        </p>
      </section>
    </div>
  );
}

function Persona1({ m, ctx, aviso }: { m: Miembro; ctx: Ctx; aviso: ReturnType<typeof useAviso> }) {
  const quitar = useQuitarMiembro();
  const [confirmar, setConfirmar] = useState(false);
  const puede = puedeNombrar(m.rol, { director: ctx.director, admin: ctx.admin });
  return (
    <li className="it-persona">
      <span className="it-persona__inicial" aria-hidden="true">
        {m.nombre
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()}
      </span>
      <span className="it-persona__datos">
        <b>{m.nombre}</b>
        <small className="it-tenue">
          {ETIQUETA_ROL[m.rol]}
          {m.email && ` · ${m.email}`}
        </small>
      </span>
      {puede && !confirmar && (
        <button type="button" className="button-ghost it-btn it-btn--quitar" onClick={() => setConfirmar(true)} aria-label={`Quitar a ${m.nombre} (${ETIQUETA_ROL[m.rol]})`}>
          Quitar
        </button>
      )}
      {confirmar && (
        <Confirmar
          pregunta={`¿Quitar a ${m.nombre} como ${ETIQUETA_ROL[m.rol].toLowerCase()}?`}
          detalle="Deja de ver y de escribir en ese campus desde ya. Sus filas y su historial se conservan."
          si="Sí, quitar"
          ocupado={quitar.isPending}
          onNo={() => setConfirmar(false)}
          onSi={() =>
            quitar.mutate(m.id, {
              onSuccess: () => aviso.ok(`${m.nombre} ya no es ${ETIQUETA_ROL[m.rol].toLowerCase()}.`),
              onError: (e) => aviso.mal(e),
              onSettled: () => setConfirmar(false),
            })
          }
        />
      )}
    </li>
  );
}

/** Nombrar: buscar a la persona (nombre o correo), elegir papel y uno o varios campus. */
function Alta({ ctx, miembros, aviso }: { ctx: Ctx; miembros: Miembro[]; aviso: ReturnType<typeof useAviso> }) {
  const [buscar, setBuscar] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [rol, setRol] = useState<IntRol>("gestor");
  const [campus, setCampus] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const personas = usePersonas(persona ? "" : buscar);
  const guardar = useGuardarMiembro();
  const roles = ROLES.filter((r) => puedeNombrar(r, { director: ctx.director, admin: ctx.admin }));
  const pareceCorreo = /@/.test(buscar);

  const yaTiene = useMemo(
    () => new Set(miembros.filter((m) => persona && m.user_id === persona.id && m.rol === rol).map((m) => m.campus_id ?? "")),
    [miembros, persona, rol],
  );

  const listo = Boolean(persona) && (rol === "director" ? !yaTiene.has("") : campus.some((c) => !yaTiene.has(c)));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!persona || !listo) return;
    setOcupado(true);
    try {
      const destinos = rol === "director" ? [null] : campus.filter((c) => !yaTiene.has(c));
      for (const c of destinos) await guardar.mutateAsync({ user_id: persona.id, rol, campus_id: c });
      const donde = rol === "director" ? "" : ` en ${destinos.map((c) => ctx.campus.find((x) => x.id === c)?.name ?? "campus").join(", ")}`;
      aviso.ok(`${persona.nombre}: ${ETIQUETA_ROL[rol].toLowerCase()}${donde}.`);
      setPersona(null);
      setBuscar("");
      setCampus([]);
    } catch (er) {
      aviso.mal(er);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form className="it-panel it-alta" onSubmit={enviar} aria-labelledby="it-alta-titulo" data-entra>
      <header className="it-panel__cabeza">
        <h3 id="it-alta-titulo">Nombrar a alguien</h3>
        <span className="it-tenue">{ctx.admin ? "La administración nombra también al Director." : "Usted nombra coordinadores y gestores; al Director lo nombra la administración."}</span>
      </header>
      <div className="it-panel__cuerpo it-alta__cuerpo">
        <div className="it-campo it-alta__buscar">
          <label htmlFor="it-alta-buscar">Persona (nombre o correo institucional)</label>
          {persona ? (
            <p className="it-alta__elegida">
              <b>{persona.nombre}</b> <span className="it-tenue">{persona.email}</span>
              <button type="button" className="it-enlace" onClick={() => setPersona(null)}>
                Cambiar
              </button>
            </p>
          ) : (
            <>
              <input
                id="it-alta-buscar"
                type="search"
                autoComplete="off"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Ej. maria.perez@udes.edu.co"
                aria-describedby="it-alta-ayuda"
              />
              <p id="it-alta-ayuda" className="it-ayuda">
                {buscar.trim().length < 3
                  ? "Escriba al menos tres letras."
                  : personas.isFetching
                    ? "Buscando en el directorio…"
                    : personas.error
                      ? `No se pudo buscar: ${(personas.error as Error).message}`
                      : personas.data && personas.data.length === 0
                        ? pareceCorreo
                          ? "Nadie con ese correo tiene cuenta en la intranet. Pida a la administración que la cree en «Usuarios y roles»; después podrá nombrarla aquí."
                          : "Nadie con ese nombre. Pruebe con el correo."
                        : ""}
              </p>
              {personas.data && personas.data.length > 0 && (
                <ul className="it-alta__resultados" role="listbox" aria-label="Personas encontradas">
                  {personas.data.map((p) => (
                    <li key={p.id} role="option" aria-selected={false}>
                      <button type="button" onClick={() => setPersona(p)}>
                        <b>{p.nombre}</b>
                        <small className="it-tenue">{p.email}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <fieldset className="it-campo">
          <legend>Papel</legend>
          <div className="it-opciones">
            {roles.map((r) => (
              <label key={r} className="it-opcion">
                <input type="radio" name="it-alta-rol" checked={rol === r} onChange={() => setRol(r)} />
                <span>
                  <b>{ETIQUETA_ROL[r]}</b>
                  <small>{r === "director" ? "Todo el módulo, sin campus" : r === "coordinador" ? "Valida o devuelve su campus" : "Captura y envía su campus"}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {rol !== "director" && (
          <fieldset className="it-campo">
            <legend>Campus (uno o varios)</legend>
            <div className="it-chips">
              {ctx.campus.map((c) => {
                const ya = yaTiene.has(c.id);
                return (
                  <label key={c.id} className={`it-chip-check${ya ? " is-ya" : ""}`}>
                    <input
                      type="checkbox"
                      disabled={ya}
                      checked={ya || campus.includes(c.id)}
                      onChange={(e) => setCampus((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))}
                    />
                    {c.name}
                    {ya && <small> · ya lo es</small>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
      <footer className="it-alta__pie">
        <span className="it-espacio" />
        <button type="submit" className="button-primary it-btn" disabled={!listo || ocupado}>
          <Icon name="plus" size={16} aria-hidden="true" /> {ocupado ? "Nombrando…" : "Nombrar"}
        </button>
      </footer>
    </form>
  );
}
