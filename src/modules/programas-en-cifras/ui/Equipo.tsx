/* =============================================================================
   Programas en Cifras · Equipo: quién es Director o Coordinador de cada programa.

   Se nombra buscando a la persona por nombre o correo en el directorio de la
   intranet (lo mismo que Accesos de Internacionalización). La administración
   nombra a cualquiera, también a Directores; un Director solo nombra
   Coordinadores de su programa y campus (puedeNombrar). La base lo exige en
   pc_miembros_write; aquí solo se evita ofrecer lo imposible.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { usePersonas } from "../../internacionalizacion/datos";
import type { Persona } from "../../internacionalizacion/datos";
import { esFaltaMigracion, useGuardarMiembro, useQuitarMiembro } from "../datos";
import type { Miembro } from "../datos";
import { ETIQUETA_ROL, puedeNombrar, rolesQueNombra } from "../lib/permisos";
import type { PcRol, ProgramaCampus } from "../tipos";
import { AvisoMigracion, iniciales } from "./comunes";
import { useEspacio } from "./contexto";
import { CLAVE_EQUIPO, useTodosMiembros } from "./equipo-datos";
import { agruparPorCampus, claveDePareja, nombreDePareja } from "./logica";
import { SelectorPareja } from "./SelectorPareja";
import { useCascada } from "../../../components/espacio/movimiento";
import { Ventana } from "../../../components/espacio/Ventana";

/** Qué puede hacer cada papel: el espejo legible de lib/permisos y de la 0164. */
const CAPACIDADES: { que: string; director: boolean; coordinador: boolean; planeacion: boolean; admin: boolean }[] = [
  { que: "Ver los archivos del programa", director: true, coordinador: true, planeacion: true, admin: true },
  { que: "Editar archivos, filas y campos", director: true, coordinador: true, planeacion: false, admin: false },
  { que: "Marcar como listo o volver a borrador", director: true, coordinador: true, planeacion: false, admin: false },
  { que: "Definir la ventana, cerrar periodos y emitir", director: true, coordinador: true, planeacion: false, admin: false },
  { que: "Nombrar Coordinadores de su programa", director: true, coordinador: false, planeacion: false, admin: true },
  { que: "Nombrar Directores", director: false, coordinador: false, planeacion: false, admin: true },
];

export function Equipo() {
  const { admin, pareja, parejas } = useEspacio();
  const todos = useTodosMiembros();
  const [vista, setVista] = useState<"este" | "todos">("este");
  const [alta, setAlta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useCascada(raiz, ".pc-panelc", vista);
  const puedeAlta = parejas.some((p) => rolesQueNombra({ admin, rolEnElPrograma: p.rol }).length > 0);

  return (
    <div className="pc-equipo" ref={raiz} data-tour="pc-equipo">
      <div className="pc-equipo__cab">
        {admin ? (
          <div className="es-seg" role="group" aria-label="Qué equipo ver">
            <button type="button" style={{ width: "auto", padding: "0 12px" }} aria-pressed={vista === "este"} onClick={() => setVista("este")}>Este programa</button>
            <button type="button" style={{ width: "auto", padding: "0 12px" }} aria-pressed={vista === "todos"} onClick={() => setVista("todos")}>Todos los programas</button>
          </div>
        ) : null}
        <span className="es-grow" />
        {puedeAlta ? (
          <button type="button" className="es-btn es-btn--pri" onClick={() => setAlta(true)}>
            <Icon name="plus" size={16} />
            Agregar persona
          </button>
        ) : null}
      </div>
      {todos.error ? (
        esFaltaMigracion(todos.error) ? <AvisoMigracion mensaje={todos.error.message} /> : <div className="es-banner es-banner--risk" role="alert"><Icon name="alert" size={16} />{(todos.error as Error).message}</div>
      ) : !todos.data ? (
        <p className="es-note">Leyendo el equipo…</p>
      ) : vista === "este" || !admin ? (
        <EquipoDelPrograma miembros={todos.data.filter((m) => m.programa_id === pareja.programa_id && m.campus_id === pareja.campus_id)} />
      ) : (
        <TodosLosProgramas miembros={todos.data} />
      )}
      <Capacidades />
      {alta ? <Alta miembros={todos.data ?? []} onCerrar={() => setAlta(false)} /> : null}
    </div>
  );
}

function EquipoDelPrograma({ miembros }: { miembros: Miembro[] }) {
  const { pareja, rol, admin } = useEspacio();
  const hayDirector = miembros.some((m) => m.rol === "director");
  const ordenados = [...miembros].sort((a, b) => Number(b.rol === "director") - Number(a.rol === "director") || a.nombre.localeCompare(b.nombre, "es"));
  return (
    <section className="pc-panelc" aria-label={`Equipo de ${nombreDePareja(pareja)}`}>
      <header>
        <h3>{nombreDePareja(pareja)}</h3>
        <span className="es-note es-num">{miembros.length === 1 ? "1 nombramiento" : `${miembros.length} nombramientos`}</span>
      </header>
      {!hayDirector ? <p className="es-banner" style={{ margin: 12 }}><Icon name="alert" size={16} />Este programa no tiene Director. {admin ? "Nómbrelo con «Agregar persona»." : ""}</p> : null}
      {ordenados.length ? (
        <ul className="pc-personas">
          {ordenados.map((m) => <Persona1 key={m.id} m={m} puede={puedeNombrar(m.rol, { admin, rolEnElPrograma: rol })} />)}
        </ul>
      ) : (
        <p className="es-note" style={{ padding: 14 }}>Nadie nombrado todavía.</p>
      )}
    </section>
  );
}

function Persona1({ m, puede }: { m: Miembro; puede: boolean }) {
  const { decir } = useEspacio();
  const quitar = useQuitarMiembro();
  const cliente = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <li className="pc-persona">
      <span className="pc-persona__ini" aria-hidden="true">{iniciales(m.nombre, m.email)}</span>
      <span className="pc-persona__datos"><b>{m.nombre}</b><small>{m.email}</small></span>
      <span className="es-tag">{ETIQUETA_ROL[m.rol]}</span>
      {puede ? (
        confirmar ? (
          <>
            <button type="button" className="es-btn es-btn--sm" disabled={quitar.isPending} onClick={() => quitar.mutate({ id: m.id, programa: m.programa_id, campus: m.campus_id }, { onSuccess: () => { void cliente.invalidateQueries({ queryKey: CLAVE_EQUIPO }); decir(`${m.nombre} ya no es ${ETIQUETA_ROL[m.rol].toLowerCase()}.`); }, onError: (e) => decir(e.message), onSettled: () => setConfirmar(false) })}>
              Sí, quitar
            </button>
            <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setConfirmar(false)}>No</button>
          </>
        ) : (
          <button type="button" className="es-btn es-btn--sm" aria-label={`Quitar a ${m.nombre} (${ETIQUETA_ROL[m.rol]})`} onClick={() => setConfirmar(true)}>
            <Icon name="trash" size={16} />
            Quitar
          </button>
        )
      ) : null}
    </li>
  );
}

/** Todos los programas, agrupados por campus: quién dirige cada uno y cuáles no tienen Director. */
function TodosLosProgramas({ miembros }: { miembros: Miembro[] }) {
  const { parejas } = useEspacio();
  const [programa, setPrograma] = useState("");
  const programas = useMemo(() => [...new Map(parejas.map((p) => [p.programa_id, p.programa])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")), [parejas]);
  const grupos = agruparPorCampus(parejas.filter((p) => !programa || p.programa_id === programa));
  const de = (p: ProgramaCampus, rol: PcRol) => miembros.filter((m) => m.programa_id === p.programa_id && m.campus_id === p.campus_id && m.rol === rol);
  return (
    <>
      <div className="pc-equipo__cab">
        <select className="es-sel" aria-label="Filtrar por programa" value={programa} onChange={(e) => setPrograma(e.target.value)}>
          <option value="">Todos los programas</option>
          {programas.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
      </div>
      {grupos.map((g) => {
        const sin = g.parejas.filter((p) => de(p, "director").length === 0).length;
        return (
          <section className="pc-panelc" key={g.campus_id} aria-label={`Campus ${g.campus}`}>
            <header>
              <h3>{g.campus}</h3>
              <span className="es-note es-num">{g.parejas.length === 1 ? "1 programa" : `${g.parejas.length} programas`}</span>
              {sin ? (
                <span className="es-est" data-e="err">
                  <Icon name="alert" size={12} />
                  {sin} sin Director
                </span>
              ) : null}
            </header>
            <div style={{ overflowX: "auto" }}>
              <table className="es-lista">
                <thead>
                  <tr>
                    <th>Programa</th>
                    <th>Director</th>
                    <th>Coordinadores</th>
                  </tr>
                </thead>
                <tbody>
                  {g.parejas.map((p) => {
                    const d = de(p, "director");
                    const c = de(p, "coordinador");
                    return (
                      <tr key={claveDePareja(p)}>
                        <td>
                          <b>{p.programa}</b>
                        </td>
                        <td>
                          {d.length ? (
                            d.map((m) => m.nombre).join(", ")
                          ) : (
                            <span className="es-est" data-e="err">
                              <Icon name="alert" size={12} />
                              Sin Director
                            </span>
                          )}
                        </td>
                        <td>{c.length ? c.map((m) => m.nombre).join(", ") : <span className="es-note">Ninguno</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

function Capacidades() {
  return (
    <section className="pc-panelc" aria-label="Qué puede hacer cada rol">
      <header>
        <h3>Qué puede hacer cada rol</h3>
        <span className="es-note">Lo hace cumplir la base de datos, no la pantalla.</span>
      </header>
      <div style={{ overflowX: "auto" }}>
        <table className="pc-matriz">
          <thead><tr><th scope="col">Capacidad</th><th scope="col">Director</th><th scope="col">Coordinador</th><th scope="col">Planeación</th><th scope="col">Administración</th></tr></thead>
          <tbody>
            {CAPACIDADES.map((k) => (
              <tr key={k.que}>
                <th scope="row">{k.que}</th>
                {(["director", "coordinador", "planeacion", "admin"] as const).map((r) => (
                  <td key={r} className={k[r] ? "pc-si" : "pc-no"}>{k[r] ? <Icon name="check" size={16} title="Sí" /> : <span aria-label="No">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="es-note" style={{ padding: "10px 14px" }}>Cada Director y Coordinador trabaja solo en su programa y campus; alguien puede tener varios. Planeación ve todo y no edita nada.</p>
    </section>
  );
}

/** Nombrar: buscar a la persona (nombre o correo), elegir programa y campus, y el papel. */
function Alta({ miembros, onCerrar }: { miembros: Miembro[]; onCerrar: () => void }) {
  const { admin, pareja, parejas, decir } = useEspacio();
  const guardar = useGuardarMiembro();
  const cliente = useQueryClient();
  const [buscar, setBuscar] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const permitidas = useMemo(() => parejas.filter((p) => rolesQueNombra({ admin, rolEnElPrograma: p.rol }).length > 0), [parejas, admin]);
  const [clave, setClave] = useState(permitidas.some((p) => claveDePareja(p) === claveDePareja(pareja)) ? claveDePareja(pareja) : claveDePareja(permitidas[0]));
  const elegida = permitidas.find((p) => claveDePareja(p) === clave) ?? permitidas[0];
  const roles = rolesQueNombra({ admin, rolEnElPrograma: elegida.rol });
  const [rolPedido, setRolPedido] = useState<PcRol>("coordinador");
  const rol = roles.includes(rolPedido) ? rolPedido : roles[0];
  const personas = usePersonas(persona ? "" : buscar);
  const yaEsta = Boolean(persona && miembros.some((m) => m.user_id === persona.id && m.programa_id === elegida.programa_id && m.campus_id === elegida.campus_id));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!persona || yaEsta) return;
    guardar.mutate(
      { user_id: persona.id, rol, programa: elegida.programa_id, campus: elegida.campus_id },
      { onSuccess: () => { void cliente.invalidateQueries({ queryKey: CLAVE_EQUIPO }); decir(`${persona.nombre}: ${ETIQUETA_ROL[rol].toLowerCase()} de ${nombreDePareja(elegida)}.`); onCerrar(); }, onError: (er) => decir(er.message) },
    );
  };

  return (
    <Ventana
      titulo="Agregar persona al equipo"
      ancho="chica"
      onCerrar={onCerrar}
      pie={<><button type="button" className="es-btn" onClick={onCerrar}>Cancelar</button><button type="submit" form="pc-f-alta" className="es-btn es-btn--pri" disabled={!persona || yaEsta || guardar.isPending}>{guardar.isPending ? "Nombrando…" : "Nombrar"}</button></>}
    >
      <form id="pc-f-alta" className="es-dbody es-dbody--solo" onSubmit={enviar}>
        <div className="es-stage">
          <div className="es-fl">
            Persona (nombre o correo institucional)
            {persona ? (
              <p style={{ margin: 0 }}><b>{persona.nombre}</b> <span className="es-note">{persona.email}</span> <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setPersona(null)}>Cambiar</button></p>
            ) : (
              <>
                <input type="search" className="es-inp" data-foco autoComplete="off" value={buscar} placeholder="Ej. maria.perez@udes.edu.co" onChange={(e) => setBuscar(e.target.value)} />
                <span className="es-note" role="status">
                  {buscar.trim().length < 3 ? "Escriba al menos tres letras." : personas.isFetching ? "Buscando en el directorio…" : personas.error ? `No se pudo buscar: ${(personas.error as Error).message}` : personas.data?.length === 0 ? (/@/.test(buscar) ? "Nadie con ese correo tiene cuenta en la intranet. Pida a la administración que la cree en «Usuarios y roles»; después podrá nombrarla aquí." : "Nadie con ese nombre. Pruebe con el correo.") : ""}
                </span>
                {personas.data?.length ? (
                  <ul className="pc-resultados" role="listbox" aria-label="Personas encontradas">
                    {personas.data.map((p) => <li key={p.id} role="option" aria-selected={false}><button type="button" onClick={() => setPersona(p)}><b>{p.nombre}</b><small>{p.email}</small></button></li>)}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          <SelectorPareja parejas={permitidas} valor={claveDePareja(elegida)} onCambiar={setClave} />
          <fieldset className="es-fl" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Rol</legend>
            <div className="es-chips">
              {roles.map((r) => <button key={r} type="button" className="es-chip" aria-pressed={rol === r} onClick={() => setRolPedido(r)}>{ETIQUETA_ROL[r]}</button>)}
            </div>
          </fieldset>
          <p className="es-note">{admin ? "La administración nombra también al Director." : "Usted nombra Coordinadores de su programa y campus; al Director lo nombra la administración."}</p>
          {yaEsta ? <p className="es-note" role="alert" style={{ color: "var(--status-risk)" }}>Esa persona ya está nombrada en este programa y campus. Quítela primero para cambiarle el rol.</p> : null}
        </div>
      </form>
    </Ventana>
  );
}
