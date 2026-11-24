/* =============================================================================
   UDrive · Unidades de trabajo · las personas y su papel.

   Un solo componente para el formulario de creación (la lista vive en la
   pantalla) y para la gestión de una unidad ya creada (cada cambio va a la
   base). Búsqueda por nombre o correo institucional con teclado completo
   (combobox: flechas, Intro, Escape), alta por lote desde la estructura o
   pegando correos, cambio de papel en bloque, vencimiento obligatorio para
   quien es de fuera del dominio y avisos en una región de lectura.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { buscarPersonas, errorDe, pedirPersonasDeEstructura, resolverCorreos, useEstructura } from "./datos";
import { colorAvatar, correosDeTexto, esCorreo, iniciales, maxVence, rolSugerido, textoVence, venceError, venceIsoEn } from "./lib";
import { entrarFila, quitarFila, resaltar } from "./movimiento";
import type { MiembroBorrador, PersonaBuscada, RolUnidad } from "./tipos";
import { CAPACIDADES, DOMINIO_INSTITUCIONAL, NOMBRE_ROL, RANGO_ROL, ROLES_UNIDAD } from "./tipos";

export type FilaPersona = Pick<MiembroBorrador, "usuario_id" | "correo" | "nombre" | "rol" | "externo" | "vence_en"> & { vigente?: boolean; es_yo?: boolean };

export interface NuevaPersona {
  persona: PersonaBuscada;
  rol: RolUnidad;
  /** «AAAA-MM-DD» (se vence al terminar ese día); solo para quien es de fuera del dominio. */
  vence: string | null;
}

const VENCE_EXTERNO_DIAS = 365;

export function Avatar({ nombre, correo, clave }: { nombre: string; correo: string; clave: string }) {
  return <span className="un-av" style={{ background: colorAvatar(clave) }} aria-hidden="true">{iniciales(nombre, correo)}</span>;
}

/** Qué puede hacer cada papel (tabla de consulta). */
export function MatrizPapeles() {
  return (
    <div className="un-tabla" tabIndex={0} role="region" aria-label="Qué puede hacer cada papel">
      <table>
        <thead>
          <tr>
            <th scope="col">Acción</th>
            {ROLES_UNIDAD.map((r) => <th key={r.k} scope="col" className="c">{r.nombre}</th>)}
          </tr>
        </thead>
        <tbody>
          {CAPACIDADES.map(([accion, min]) => (
            <tr key={accion}>
              <th scope="row">{accion}</th>
              {ROLES_UNIDAD.map((r) => (RANGO_ROL[r.k] >= min ? <td key={r.k} className="c un-si">Sí<span className="un-sr"> puede</span></td> : <td key={r.k} className="c un-no">No<span className="un-sr"> puede</span></td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PersonasEditor({
  idBase, filas, puedeEditar, motivoSoloLectura, protegerUnicoAdmin, ocupado, onAnadir, onRol, onVence, onQuitar,
}: {
  idBase: string;
  filas: readonly FilaPersona[];
  puedeEditar: boolean;
  motivoSoloLectura?: string;
  /** En una unidad ya creada no se degrada ni se quita a la única persona que administra (la base también lo impide). */
  protegerUnicoAdmin: boolean;
  ocupado?: boolean;
  onAnadir: (n: NuevaPersona[]) => Promise<void> | void;
  onRol: (usuario: string, rol: RolUnidad) => Promise<void> | void;
  onVence: (usuario: string, vence: string) => Promise<void> | void;
  onQuitar: (usuarios: string[]) => Promise<void> | void;
}) {
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [rolInicial, setRolInicial] = useState<RolUnidad>("lector");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState("");
  const [anuncio, setAnuncio] = useState("");
  const [error, setError] = useState("");
  const [estructuraId, setEstructuraId] = useState("");
  const [respetar, setRespetar] = useState(true);
  const [pegado, setPegado] = useState("");
  const recien = useRef<Set<string>>(new Set());
  const lista = useRef<HTMLUListElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const estructura = useEstructura();

  const decir = useCallback((m: string) => {
    setAnuncio("");
    window.setTimeout(() => setAnuncio(m), 30);
  }, []);

  // La búsqueda espera 250 ms después de la última letra.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(texto.trim()), 250);
    return () => window.clearTimeout(t);
  }, [texto]);
  const busqueda = useQuery({ queryKey: ["ud", "personas", q], enabled: q.length >= 2 && puedeEditar, retry: false, staleTime: 30_000, queryFn: () => buscarPersonas(q) });
  const presentes = useMemo(() => new Set(filas.map((f) => f.usuario_id)), [filas]);
  const resultados = useMemo(() => (busqueda.data ?? []).filter((p) => !presentes.has(p.id)), [busqueda.data, presentes]);

  useEffect(() => setActivo(0), [resultados.length]);

  // Las filas que acaban de llegar se hacen notar cuando ya están pintadas.
  useLayoutEffect(() => {
    if (!recien.current.size || !lista.current) return;
    const nuevas = Array.from(lista.current.querySelectorAll<HTMLElement>("[data-clave]")).filter((el) => recien.current.has(el.dataset.clave ?? ""));
    if (!nuevas.length) return;
    nuevas.forEach((el) => recien.current.delete(el.dataset.clave ?? ""));
    entrarFila(nuevas);
  }, [filas]);

  const vigentes = filas.filter((f) => f.vigente !== false);
  const admins = vigentes.filter((f) => f.rol === "admin");
  const externas = filas.filter((f) => f.externo);

  const anadir = async (personas: PersonaBuscada[], rol: (p: PersonaBuscada) => RolUnidad) => {
    const nuevas = personas.filter((p) => !presentes.has(p.id));
    if (!nuevas.length) return false;
    setError("");
    const datos: NuevaPersona[] = nuevas.map((p) => ({ persona: p, rol: p.externo && rol(p) === "admin" ? "lector" : rol(p), vence: p.externo ? venceIsoEn(VENCE_EXTERNO_DIAS) : null }));
    datos.forEach((d) => recien.current.add(d.persona.id));
    try {
      await onAnadir(datos);
      decir(datos.length === 1 ? `${datos[0].persona.nombre || datos[0].persona.correo} se añadió con papel ${NOMBRE_ROL[datos[0].rol]}.` : `Se añadieron ${datos.length} personas.`);
      return true;
    } catch (e) {
      datos.forEach((d) => recien.current.delete(d.persona.id));
      setError(errorDe(e as Error).message);
      return false;
    }
  };

  const elegir = async (p: PersonaBuscada) => {
    if (await anadir([p], () => rolInicial)) {
      setTexto("");
      setQ("");
      setAbierto(false);
    }
    entrada.current?.focus();
  };

  const alTeclear = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      if (resultados.length) setActivo((a) => (a + 1) % resultados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (resultados.length) setActivo((a) => (a - 1 + resultados.length) % resultados.length);
    } else if (e.key === "Escape") {
      setAbierto(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (abierto && resultados[activo]) return void elegir(resultados[activo]);
      const correo = texto.trim().toLowerCase();
      if (esCorreo(correo)) {
        try {
          const r = await resolverCorreos([correo]);
          if (r[0]) return void elegir(r[0]);
          setAviso(`No hay una cuenta con ${correo} en la intranet. Quien sea de fuera debe entrar una vez al portal para que exista su cuenta.`);
        } catch (er) {
          setError(errorDe(er as Error).message);
        }
      }
    }
  };

  const porEstructura = async () => {
    if (!estructuraId) return setAviso("Elija una unidad de la estructura.");
    setAviso("");
    try {
      const gente = await pedirPersonasDeEstructura(estructuraId);
      if (!gente.length) return setAviso("Esa unidad no tiene personas registradas.");
      const papel = new Map(gente.map((g) => [g.usuario_id, g.papel] as const));
      const personas: PersonaBuscada[] = gente.map((g) => ({ id: g.usuario_id, correo: g.correo, nombre: g.nombre, externo: false }));
      const ok = await anadir(personas, (p) => (respetar ? rolSugerido(papel.get(p.id) ?? "visor") : rolInicial));
      if (!ok) setAviso("Todas las personas de esa unidad ya están en la lista.");
    } catch (e) {
      setError(errorDe(e as Error).message);
    }
  };

  const porCorreos = async () => {
    const { correos, invalidos } = correosDeTexto(pegado);
    if (!correos.length && !invalidos.length) return setAviso("Pegue uno o más correos.");
    setAviso("");
    try {
      const halladas = await resolverCorreos(correos);
      const idsHalladas = new Set(halladas.map((h) => h.correo.toLowerCase()));
      const faltan = correos.filter((c) => !idsHalladas.has(c));
      const ya = halladas.filter((h) => presentes.has(h.id)).length;
      const ok = halladas.length ? await anadir(halladas, () => rolInicial) : false;
      const partes: string[] = [];
      if (ok) partes.push(`${halladas.length - ya} ${halladas.length - ya === 1 ? "añadida" : "añadidas"}`);
      if (ya) partes.push(`${ya} ya estaban`);
      if (faltan.length) partes.push(`sin cuenta en la intranet: ${faltan.join(", ")}`);
      if (invalidos.length) partes.push(`no parecen correos: ${invalidos.join(", ")}`);
      setAviso(partes.join(". ") + ".");
      if (ok) setPegado("");
    } catch (e) {
      setError(errorDe(e as Error).message);
    }
  };

  const unicoAdmin = (f: FilaPersona) => protegerUnicoAdmin && f.rol === "admin" && admins.length <= 1;

  const cambiarRol = async (f: FilaPersona, rol: RolUnidad, el?: HTMLElement | null) => {
    setError("");
    try {
      await onRol(f.usuario_id, rol);
      resaltar(el);
      decir(`${f.nombre || f.correo} quedó con papel ${NOMBRE_ROL[rol]}.`);
    } catch (e) {
      setError(errorDe(e as Error).message);
    }
  };

  const quitar = (claves: string[]) => {
    const permitidas = claves.filter((k) => !unicoAdmin(filas.find((f) => f.usuario_id === k) ?? ({ rol: "lector" } as FilaPersona)));
    if (permitidas.length < claves.length) setError("Se conservó a quien administra: la unidad necesita al menos una persona con ese papel.");
    if (!permitidas.length) return;
    const filasDom = permitidas.map((k) => lista.current?.querySelector<HTMLElement>(`[data-clave="${CSS.escape(k)}"]`) ?? null);
    const nombre = permitidas.length === 1 ? (filas.find((f) => f.usuario_id === permitidas[0])?.nombre || "La persona") : `${permitidas.length} personas`;
    const hecho = async () => {
      try {
        await onQuitar(permitidas);
        setSel((s) => new Set(Array.from(s).filter((k) => !permitidas.includes(k))));
        decir(`${nombre} ${permitidas.length === 1 ? "ya no está" : "ya no están"} en la unidad. Quedan ${filas.length - permitidas.length}.`);
        entrada.current?.focus();
      } catch (e) {
        setError(errorDe(e as Error).message);
      }
    };
    let pendientes = filasDom.filter(Boolean).length;
    if (!pendientes) return void hecho();
    filasDom.forEach((el) => quitarFila(el, () => { pendientes -= 1; if (pendientes === 0) void hecho(); }));
  };

  const ordenadas = useMemo(() => [...filas].sort((a, b) => RANGO_ROL[b.rol] - RANGO_ROL[a.rol] || (a.nombre || a.correo).localeCompare(b.nombre || b.correo, "es")), [filas]);
  const todas = ordenadas.length > 0 && ordenadas.every((f) => sel.has(f.usuario_id));
  const id = (s: string) => `${idBase}-${s}`;

  return (
    <div className="un-personas">
      {puedeEditar ? (
        <div className="un-personas__alta">
          <div className="un-fld">
            <label htmlFor={id("q")}>Buscar a una persona</label>
            <div className="un-combo">
              <input
                ref={entrada}
                id={id("q")}
                type="text"
                role="combobox"
                aria-expanded={abierto && q.length >= 2}
                aria-controls={id("lb")}
                aria-autocomplete="list"
                aria-activedescendant={abierto && resultados[activo] ? id(`o${activo}`) : undefined}
                autoComplete="off"
                placeholder="Nombre o correo institucional"
                value={texto}
                disabled={ocupado}
                onChange={(e) => { setTexto(e.target.value); setAbierto(true); setAviso(""); }}
                onKeyDown={(e) => void alTeclear(e)}
                onFocus={() => setAbierto(true)}
                onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
              />
              <ul id={id("lb")} className="un-lb" role="listbox" aria-label="Personas encontradas" hidden={!(abierto && q.length >= 2)}>
                {busqueda.isFetching && !resultados.length ? <li className="un-lb__vacio" role="option" aria-selected="false" aria-disabled="true">Buscando…</li> : null}
                {resultados.map((p, i) => (
                  <li key={p.id} id={id(`o${i}`)} role="option" aria-selected={i === activo} onMouseDown={(e) => { e.preventDefault(); void elegir(p); }}>
                    <Avatar nombre={p.nombre} correo={p.correo} clave={p.id} />
                    <span><strong>{p.nombre || p.correo}</strong><small>{p.correo}{p.externo ? " · externa" : ""}</small></span>
                  </li>
                ))}
                {!busqueda.isFetching && !resultados.length && q.length >= 2 ? (
                  <li className="un-lb__vacio" role="option" aria-selected="false" aria-disabled="true">
                    {busqueda.isError ? "No se pudo buscar. Vuelva a intentarlo." : (busqueda.data ?? []).length ? "Todas las personas encontradas ya están en la lista." : `Nadie coincide con «${q}». Pruebe con otro apellido o con el correo completo.`}
                  </li>
                ) : null}
              </ul>
            </div>
            <span className="un-ayuda">Con las flechas elige y con Intro añade. Quien tenga cuenta fuera de {DOMINIO_INSTITUCIONAL} entra como persona externa, con vencimiento.</span>
          </div>
          <fieldset className="un-fld">
            <legend>Papel al añadir</legend>
            <div className="un-seg">
              {ROLES_UNIDAD.slice(0, 3).map((r) => (
                <label key={r.k}><input type="radio" name={id("dr")} value={r.k} checked={rolInicial === r.k} onChange={() => setRolInicial(r.k)} /><span>{r.nombre}</span></label>
              ))}
            </div>
          </fieldset>
          <details className="un-mas">
            <summary>Añadir varias personas a la vez</summary>
            <div className="un-mas__c">
              <div className="un-fld">
                <label htmlFor={id("est")}>Toda una unidad de la estructura</label>
                <div className="un-fila">
                  <select id={id("est")} value={estructuraId} onChange={(e) => setEstructuraId(e.target.value)} disabled={estructura.isPending}>
                    <option value="">{estructura.isPending ? "Cargando…" : estructura.isError ? "No se pudo cargar la estructura" : "Elija una unidad"}</option>
                    {(estructura.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                  <button type="button" className="un-btn un-btn--sec" onClick={() => void porEstructura()} disabled={ocupado}>Añadir a su gente</button>
                </div>
                <label className="un-check"><input type="checkbox" checked={respetar} onChange={(e) => setRespetar(e.target.checked)} /> Respetar el papel de la estructura (Gestor administra, Contribuyente crea, Consulta solo ve)</label>
              </div>
              <div className="un-fld">
                <label htmlFor={id("pa")}>Pegar correos</label>
                <textarea id={id("pa")} rows={3} value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="Uno por línea, o separados por coma" />
                <div><button type="button" className="un-btn un-btn--sec" onClick={() => void porCorreos()} disabled={ocupado}>Añadir correos</button></div>
              </div>
            </div>
          </details>
          {aviso ? <p className="un-nota un-nota--info" role="status">{aviso}</p> : null}
        </div>
      ) : motivoSoloLectura ? <p className="un-nota un-nota--info">{motivoSoloLectura}</p> : null}

      {error ? <p className="un-nota un-nota--error" role="alert">{error}</p> : null}
      <div className="un-avisos" aria-live="polite">
        {admins.length === 0 && !protegerUnicoAdmin ? <p className="un-nota un-nota--error">La unidad necesita al menos una persona con papel Administra. Sin eso nadie podría cambiar a las demás.</p> : null}
        {externas.length ? (
          <p className="un-nota un-nota--aviso">
            {externas.length === 1 ? "Hay 1 persona externa" : `Hay ${externas.length} personas externas`} al dominio {DOMINIO_INSTITUCIONAL}. Tienen acceso solo hasta su fecha de vencimiento (máximo dos años); pasada la fecha, la base deja de darles acceso.
          </p>
        ) : null}
      </div>

      {puedeEditar && ordenadas.length ? (
        <div className="un-bulk">
          <label className="un-check"><input type="checkbox" checked={todas} onChange={(e) => setSel(e.target.checked ? new Set(ordenadas.map((f) => f.usuario_id)) : new Set())} /> Seleccionar todas</label>
          <span aria-live="polite">{sel.size ? `${sel.size} seleccionadas` : ""}</span>
          <label className="un-sr" htmlFor={id("lote")}>Cambiar el papel de las seleccionadas</label>
          <select
            id={id("lote")}
            value=""
            disabled={!sel.size}
            onChange={(e) => {
              const rol = e.target.value as RolUnidad;
              if (!rol) return;
              const elegidas = ordenadas.filter((f) => sel.has(f.usuario_id) && !(f.externo && rol === "admin") && !(rol !== "admin" && unicoAdmin(f)));
              void (async () => {
                for (const f of elegidas) await cambiarRol(f, rol, lista.current?.querySelector<HTMLElement>(`[data-clave="${CSS.escape(f.usuario_id)}"] select`));
              })();
            }}
          >
            <option value="">Cambiar papel a…</option>
            {ROLES_UNIDAD.map((r) => <option key={r.k} value={r.k}>{r.nombre}</option>)}
          </select>
          <button type="button" className="un-btn un-btn--peligro un-btn--chico" disabled={!sel.size} onClick={() => quitar(Array.from(sel))}>Quitar seleccionadas</button>
        </div>
      ) : null}

      <ul className={`un-plist${puedeEditar && ordenadas.length ? " un-plist--con-barra" : ""}`} ref={lista} aria-label="Personas de la unidad">
        {ordenadas.length === 0 ? <li className="un-plist__vacia">Aún no hay nadie. Busque a una persona arriba o añada a toda una unidad de la estructura.</li> : null}
        {ordenadas.map((f) => {
          const vence = textoVence(f.vence_en);
          const protegida = unicoAdmin(f);
          const nombre = f.nombre || f.correo;
          return (
            <li key={f.usuario_id} className="un-prow" data-clave={f.usuario_id} data-vencida={f.vigente === false}>
              {puedeEditar ? (
                <input type="checkbox" className="un-prow__ck" aria-label={`Seleccionar a ${nombre}`} checked={sel.has(f.usuario_id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(f.usuario_id); else n.delete(f.usuario_id); return n; })} />
              ) : <span />}
              <Avatar nombre={f.nombre} correo={f.correo} clave={f.usuario_id} />
              <span className="un-prow__n">
                <strong>{nombre}{f.es_yo ? <span className="un-chip">Tú</span> : null}{f.externo ? <span className="un-chip un-chip--aviso">Externa</span> : null}{f.vigente === false ? <span className="un-chip un-chip--malo">Sin acceso</span> : null}</strong>
                <small>{f.correo}</small>
                {f.externo || f.vence_en ? (
                  puedeEditar && f.externo && f.vigente !== false ? (
                    <span className="un-prow__vence">
                      <label htmlFor={id(`v-${f.usuario_id}`)}>Vence</label>
                      <input id={id(`v-${f.usuario_id}`)} type="date" value={(f.vence_en ?? "").slice(0, 10)} min={venceIsoEn(1)} max={maxVence()} aria-invalid={Boolean(venceError(f.vence_en?.slice(0, 10) ?? null))}
                        onChange={(e) => { const v = e.target.value; if (!venceError(v)) { void (async () => { try { await onVence(f.usuario_id, v); decir(`El vencimiento de ${nombre} es ${v}.`); } catch (er) { setError(errorDe(er as Error).message); } })(); } else setError(venceError(v)); }} />
                    </span>
                  ) : vence ? <small className={`un-vence un-vence--${vence.tono}`}>{vence.texto}</small> : null
                ) : null}
              </span>
              <label className="un-sr" htmlFor={id(`r-${f.usuario_id}`)}>Papel de {nombre}</label>
              <select id={id(`r-${f.usuario_id}`)} className="un-prow__rol" value={f.rol} disabled={!puedeEditar || protegida || ocupado} title={protegida ? "Es la única persona que administra la unidad" : undefined} onChange={(e) => void cambiarRol(f, e.target.value as RolUnidad, e.currentTarget)}>
                {ROLES_UNIDAD.map((r) => <option key={r.k} value={r.k} disabled={f.externo && r.k === "admin"}>{r.nombre}</option>)}
              </select>
              {puedeEditar ? <button type="button" className="un-prow__x" disabled={protegida || ocupado} title={protegida ? "Es la única persona que administra la unidad" : undefined} aria-label={`Quitar a ${nombre}`} onClick={() => quitar([f.usuario_id])}>Quitar</button> : <span />}
            </li>
          );
        })}
      </ul>
      <p className="un-sr" role="status" aria-live="polite" aria-atomic="true">{anuncio}</p>
    </div>
  );
}

/** Resalta con una palabra de la búsqueda; sirve a quien quiera marcar coincidencias. */
export const coincide = (texto: string, q: string): boolean => sinTildes(texto).includes(sinTildes(q));
