/* =============================================================================
   Mi informe · el editor de la maqueta: secciones a la izquierda, la sección
   abierta al centro y los controles a la derecha. Guarda solo (800 ms después
   de escribir), mantiene las cifras vivas hasta enviar y marca «lista» cada
   sección según sus reglas (validacion.ts), que es lo que la base exige.
   ?unidad=<id> elige la unidad; ?s=<n> la sección.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { actorDe, nombreRol } from "../../rankings/reporte/envio";
import { useEntrada } from "../../rankings/movimiento";
import { esViva } from "../cifras-vivas";
import {
  piloRedactar,
  usePlanUnidad,
  useAgregarEnlace,
  useAsegurarCifras,
  useCatalogoIndicadores,
  useEnviar,
  useFuentes,
  useGuardarCifra,
  useGuardarSeccion,
  useInstancias,
  useMembresiasInforme,
  usePilares,
  useQuitarAnexo,
  useQuitarCifra,
  useSedesCifras,
  useSincronizarMetas,
  useSubirAnexo,
  useUnidades,
} from "../datos";
import type { DatosCifra } from "../datos";
import { leerNota, motivosNoEnviar, puedeEditar } from "../estados";
import { claveAgregada, consultaDe, unidadDe } from "../catalogo";
import { recibeMetasDeImpacto } from "../metas-programa";
import { AYUDA_TIPO, clavesDe, cifraDef } from "../plantillas";
import { controlesSeccion, ETIQUETA_AVANCE } from "../validacion";
import type { AnexoRow, CicloRow, ContenidoSeccion, InstanciaRow, PilarRef, RequisitoRow, RolActor, SeccionDef, UnidadRef } from "../types";
import { CargaEvidencias, Logros, Matriz, TablaAnexos, TablaFilas, TablaMetas, TablaPilares } from "./Bloques";
import { Dimensiones } from "./Dimensiones";
import { ElementosDrive } from "./ElementosDrive";
import { TablaMetasPrograma } from "./MetasPrograma";
import { ResumenPlan, TablaPlan } from "./PlanFacultad";
import type { NuevoPropio } from "./Cifras";
import { Aviso, Barra, Cargando, Controles, EstadoPill, Tag, Vacio, fmtFecha, mensajeDe } from "./comunes";
import { useModeloInforme } from "./modelo";
import type { ModeloInforme } from "./modelo";
import { CampoTexto, resolverDe } from "./Texto";

const BASE = "/admin/informes-gestion";

export function MiInforme({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const { profile, puedeGestionarInformes } = useAuth();
  // Solo quien gestiona los informes (0192) elige cualquier unidad; el resto, las suyas y las que su rol le da.
  const planeacion = puedeGestionarInformes;
  const membresias = useMembresiasInforme(profile?.id);
  const unidades = useUnidades();
  const instancias = useInstancias(ciclo.id);
  const [params, setParams] = useSearchParams();

  const error = [membresias.error, unidades.error, instancias.error].find((e): e is Error => e instanceof Error);
  if (error) return <Aviso error={error} />;
  if (!profile || membresias.isPending || unidades.isPending || instancias.isPending) return <Cargando texto="Cargando su informe…" />;

  const nombres = new Map((unidades.data ?? []).map((u) => [u.id, u]));
  // Planeación ve cualquier informe abierto; el resto, los de sus unidades.
  const opciones: UnidadRef[] = planeacion
    ? (instancias.data ?? []).map((i) => nombres.get(i.unit_id)).filter((u): u is UnidadRef => Boolean(u))
    : (membresias.data ?? []).map((m) => nombres.get(m.unidad) ?? { id: m.unidad, name: m.nombre, kind: "", code: null, parent_id: null });
  const elegida = params.get("unidad");
  // Una unidad ajena en la dirección se rechaza: no se carga nada de ella (la base también lo niega).
  if (!planeacion && elegida && !opciones.some((o) => o.id === elegida)) {
    return <Vacio>Esa unidad no está entre las suyas. Elija una de las que tiene asignadas.</Vacio>;
  }
  const unidad = opciones.find((o) => o.id === elegida) ?? opciones[0] ?? null;

  if (!unidad) {
    return (
      <Vacio>
        {planeacion
          ? "Todavía no se ha abierto ningún informe en este ciclo. Ábralos desde el Tablero del ciclo."
          : "Su usuario no tiene ninguna unidad asignada. Pida a Planeación que lo agregue como Gestor, Contribuyente o Consulta, o que su rol le dé el informe de una."}
      </Vacio>
    );
  }

  const inst = (instancias.data ?? []).find((i) => i.unit_id === unidad.id) ?? null;
  const actor = actorDe(planeacion, membresias.data ?? [], unidad.id);
  const selector =
    opciones.length > 1 ? (
      <label className="inf-lab" style={{ maxWidth: 420 }}>
        Unidad
        <select
          className="inf-in"
          value={unidad.id}
          onChange={(e) => {
            const p = new URLSearchParams(params);
            p.set("unidad", e.target.value);
            p.delete("s");
            setParams(p, { replace: true });
          }}
        >
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  return (
    <>
      {selector}
      {inst ? (
        <Editor key={inst.id} inst={inst} ciclo={ciclo} requisitos={requisitos} unidad={unidad} actor={actor} />
      ) : (
        <Vacio>
          Planeación todavía no abre el informe {ciclo.anio} de {unidad.name}.{" "}
          {planeacion && (
            <Link className="inf-link" to={BASE}>
              Abrirlo en el Tablero del ciclo
            </Link>
          )}
        </Vacio>
      )}
    </>
  );
}

/* ---------- El editor ---------------------------------------------------------- */

function Editor({ inst, ciclo, requisitos, unidad, actor }: { inst: InstanciaRow; ciclo: CicloRow; requisitos: RequisitoRow[]; unidad: UnidadRef; actor: RolActor | null }) {
  // Facultad: el Plan de Trabajo (API) trae las acciones de las secciones de metas y de dimensiones.
  const esFacultad = unidad.kind === "facultad";
  const plan = usePlanUnidad(unidad.id, esFacultad);
  const m = useModeloInforme(inst, ciclo, requisitos, plan.data?.acciones ?? []);
  const editable = puedeEditar(inst.estado, actor);
  const pilares = usePilares();
  const fuentes = useFuentes();
  const guardarSeccion = useGuardarSeccion(ciclo.id);
  const guardarCifra = useGuardarCifra(ciclo.id);
  const asegurar = useAsegurarCifras();
  const quitarCifra = useQuitarCifra();
  const sincronizarMetas = useSincronizarMetas();
  const enviar = useEnviar();
  const subir = useSubirAnexo();
  const enlazar = useAgregarEnlace();
  const quitarAnexo = useQuitarAnexo();

  const [params, setParams] = useSearchParams();
  const secciones = m.plantilla.secciones;
  const idx = Math.min(Math.max(Number(params.get("s") ?? 1) - 1, 0), secciones.length - 1) || 0;
  const def = secciones[idx];

  const [borradores, setBorradores] = useState<Record<string, ContenidoSeccion>>({});
  const [estadoGuardado, setEstadoGuardado] = useState("");
  const pendientes = useRef(new Map<string, { def: SeccionDef; c: ContenidoSeccion; reloj: number }>());
  const sincronizando = useRef(new Set<string>());
  const asegurando = useRef(false);
  const animar = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  useEntrada(editorRef, ":scope > .inf-ehd, :scope > .inf-lead, :scope > .inf-blk", idx, animar.current);

  const contenido = (clave: string): ContenidoSeccion => borradores[clave] ?? m.contenidoGuardado(clave);

  const persistir = (d: SeccionDef, c: ContenidoSeccion) => {
    pendientes.current.delete(d.clave);
    setEstadoGuardado("Guardando…");
    guardarSeccion.mutate(
      { instancia: inst.id, clave: d.clave, contenido: c, listo: m.avance(d, c) === 2 },
      {
        onSuccess: () => {
          setEstadoGuardado("Cambios guardados");
          setBorradores((b) => {
            if (b[d.clave] !== c) return b;
            const n = { ...b };
            delete n[d.clave];
            return n;
          });
        },
        onError: (e) => setEstadoGuardado(`No se guardó: ${mensajeDe(e)}`),
      },
    );
  };

  const cambiar = (d: SeccionDef, c: ContenidoSeccion) => {
    setBorradores((b) => ({ ...b, [d.clave]: c }));
    const previo = pendientes.current.get(d.clave);
    if (previo) window.clearTimeout(previo.reloj);
    pendientes.current.set(d.clave, { def: d, c, reloj: window.setTimeout(() => persistir(d, c), 800) });
  };

  // Al salir, lo que esperaba su turno se guarda ya.
  useEffect(
    () => () => {
      for (const p of pendientes.current.values()) {
        window.clearTimeout(p.reloj);
        guardarSeccion.mutate({ instancia: inst.id, clave: p.def.clave, contenido: p.c, listo: m.avance(p.def, p.c) === 2 });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al desmontar
    [],
  );

  // Crea las cifras de la plantilla que no tienen fila y fija el primer «visto» de las vivas.
  useEffect(() => {
    if (!editable || !m.filas.data || fuentes.isPending || asegurando.current) return;
    const existentes = new Set(m.filas.data.map((f) => f.clave));
    const faltan = clavesDe(inst.plantilla)
      .filter((k) => !existentes.has(k))
      .map((k) => {
        const d = cifraDef(k);
        const seccion = secciones.find((s) => d && s.dims?.includes(d.dim));
        const tipo = fuentes.data?.find((f) => f.clave === k)?.tipo ?? "auto";
        return { clave: k, datos: { etiqueta: d?.etiqueta ?? k, seccion_clave: seccion?.clave ?? null, fuente_tipo: tipo, unidad: d?.unidad ?? "", incluida: true } as DatosCifra };
      });
    const sinVisto = m.filas.data
      .filter((f) => esViva(f.fuente_tipo) && f.visto === null && m.vivas.data?.[f.clave]?.valor != null)
      .map((f) => ({ clave: f.clave, datos: { visto: m.vivas.data?.[f.clave]?.valor ?? null } as DatosCifra }));
    if (!faltan.length && !sinVisto.length) return;
    asegurando.current = true;
    asegurar.mutate({ instancia: inst.id, faltan: [...faltan, ...sinVisto] }, { onSettled: () => void (asegurando.current = false) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cuenta lo leído
  }, [m.filas.data, m.vivas.data, fuentes.data, fuentes.isPending, editable]);

  // Programa o facultad: las metas se traen de los indicadores que el programa seleccionó.
  useEffect(() => {
    if (editable && recibeMetasDeImpacto(unidad.kind)) sincronizarMetas.mutate(inst.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por informe y estado
  }, [inst.id, inst.estado, editable]);

  // «Lista» en la base sigue a las reglas (cifras justificadas, anexos cargados…), también sin escribir.
  useEffect(() => {
    if (!editable || m.cargando || !m.secciones.data) return;
    for (const d of secciones) {
      if (borradores[d.clave] || pendientes.current.has(d.clave) || sincronizando.current.has(d.clave)) continue;
      const fila = m.secciones.data.find((s) => s.clave === d.clave);
      const listo = m.avance(d) === 2;
      if ((fila?.listo ?? false) === listo) continue;
      sincronizando.current.add(d.clave);
      guardarSeccion.mutate(
        { instancia: inst.id, clave: d.clave, contenido: fila?.contenido ?? {}, listo },
        { onSettled: () => void sincronizando.current.delete(d.clave) },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cuenta lo leído
  }, [m.secciones.data, m.filas.data, m.anexos.data, m.vivas.data, plan.data, editable, m.cargando]);

  if (m.error) return <Aviso error={m.error} />;
  if (m.cargando) return <Cargando texto="Cargando las secciones…" />;

  const avances = secciones.map((d) => m.avance(d, contenido(d.clave)));
  const listas = avances.filter((a) => a === 2).length;
  const motivos = motivosNoEnviar({ estado: inst.estado, rol: actor, listas, total: secciones.length });
  const nota = leerNota(inst.nota_revision);
  const resolver = resolverDe(m.incluidas);
  const ctx = m.contexto(def);
  const c = contenido(def.clave);

  const irA = (i: number, puntero: boolean) => {
    animar.current = puntero;
    const p = new URLSearchParams(params);
    p.set("s", String(i + 1));
    setParams(p, { replace: true });
  };

  const guardar = (clave: string, datos: DatosCifra) => guardarCifra.mutate({ instancia: inst.id, clave, datos });
  const agregarPropio = (p: NuevoPropio) =>
    guardarCifra.mutate({
      instancia: inst.id,
      clave: `propio_${def.clave}_${Date.now().toString(36)}`,
      datos: { etiqueta: p.etiqueta, seccion_clave: def.clave, fuente_tipo: "manual", fuente_nombre: p.fuente, valor: p.valor, pilar: p.pilar, incluida: true, unidad: "" },
    });

  const enviarInforme = () => {
    // Lo que espera su turno se guarda antes de enviar.
    for (const p of pendientes.current.values()) {
      window.clearTimeout(p.reloj);
      persistir(p.def, p.c);
    }
    enviar.mutate(inst);
  };

  return (
    <div className="inf-ed">
      {/* Secciones y envío */}
      <div className="inf-card inf-rail">
        <div className="inf-unit">
          <span className="inf-eyebrow">
            {m.plantilla.nombre} · {m.plantilla.quien}
          </span>
          <b>{unidad.name}</b>
          <span>
            Informe {ciclo.anio} · su papel: {nombreRol(actor)}
          </span>
        </div>
        <div className="inf-row">
          <EstadoPill estado={inst.estado} />
          <span className="inf-num" style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>
            {listas} de {secciones.length} listas
          </span>
        </div>
        <Barra valor={listas / secciones.length} etiqueta="Secciones listas" />
        <small className="inf-muted">{m.frio ? "Las cifras quedaron congeladas al enviar." : "Las cifras siguen en vivo hasta que envíe."}</small>
        <Link className="inf-link" to={`${BASE}/vista?unidad=${unidad.id}`}>
          Vista del informe en papel
        </Link>
        {inst.estado === "back" && nota.general && (
          <div className="inf-nota" role="note">
            <b>Planeación lo devolvió</b>
            {nota.general}
          </div>
        )}
        <nav className="inf-secs" aria-label="Secciones del informe">
          {secciones.map((d, i) => (
            <button key={d.clave} type="button" aria-current={i === idx} onClick={(e) => irA(i, e.detail > 0)}>
              <span className="n">{i + 1}</span>
              <span>{d.titulo}</span>
              <span className={`inf-dot is-${avances[i]}`} title={ETIQUETA_AVANCE[avances[i]]}>
                <span className="inf-sr">{ETIQUETA_AVANCE[avances[i]]}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="inf-send">
          {inst.estado === "sent" || inst.estado === "ok" ? (
            <>
              <button type="button" className="inf-btn inf-btn--pri" disabled>
                {inst.estado === "ok" ? "Aprobado" : `Enviado a ${m.plantilla.destino}`}
              </button>
              <small>
                {inst.estado === "ok" ? `Aprobado el ${fmtFecha(inst.aprobado_en)}. Queda congelado.` : `Enviado el ${fmtFecha(inst.enviado_en)}. Esperando la revisión de Planeación.`}
              </small>
            </>
          ) : (
            <>
              <button type="button" className="inf-btn inf-btn--pri" disabled={motivos.length > 0 || enviar.isPending} onClick={enviarInforme}>
                {enviar.isPending ? "Enviando…" : `Enviar a ${m.plantilla.destino}`}
              </button>
              {motivos.length ? (
                <ul>
                  {motivos.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : (
                <small>Todo listo. Al enviar queda la foto de las cifras y el informe se bloquea.</small>
              )}
            </>
          )}
          {enviar.error && (
            <p className="inf-error" role="alert">
              {mensajeDe(enviar.error)}
            </p>
          )}
          {estadoGuardado && (
            <small role="status" aria-live="polite">
              {estadoGuardado}
            </small>
          )}
        </div>
      </div>

      {/* La sección abierta */}
      <div className="inf-card inf-editor" ref={editorRef}>
        <div className="inf-ehd">
          <div>
            <span className="inf-eyebrow">
              Sección {idx + 1} de {secciones.length}
            </span>
            <h2>{def.titulo}</h2>
          </div>
          {def.tipo !== "anexos" && <span className={`inf-pill${avances[idx] === 2 ? " is-ok" : ""}`}>{ETIQUETA_AVANCE[avances[idx]]}</span>}
        </div>
        <p className="inf-lead">{def.extension ? `${AYUDA_TIPO[def.tipo]} · ${def.extension}.` : `${AYUDA_TIPO[def.tipo]}.`}</p>
        {nota.porSeccion[def.clave] && inst.estado === "back" && (
          <div className="inf-nota inf-blk" role="note">
            <b>Planeación pide en esta sección</b>
            {nota.porSeccion[def.clave]}
          </div>
        )}
        <CuerpoSeccion
          def={def}
          c={c}
          m={m}
          inst={inst}
          recibeMetas={recibeMetasDeImpacto(unidad.kind)}
          esFacultad={esFacultad}
          plan={plan}
          editable={editable}
          resolver={resolver}
          pilares={pilares.data ?? []}
          cambiar={(x) => cambiar(def, x)}
          guardar={guardar}
          agregarPropio={agregarPropio}
          quitarPropio={(clave) => quitarCifra.mutate({ instancia: inst.id, clave })}
          subir={async (archivos) => {
            for (const archivo of archivos) await subir.mutateAsync({ instancia: inst, archivo, anexos: m.anexos.data ?? [] });
          }}
          enlazar={(url, nombre) => enlazar.mutateAsync({ instancia: inst.id, url, nombre, anexos: m.anexos.data ?? [] })}
          quitarAnexo={(a) => quitarAnexo.mutate(a)}
          ocupado={subir.isPending || enlazar.isPending}
        />
        {def.tipo !== "anexos" && def.tipo !== "evid" && (
          <ElementosDrive elementos={c.drive ?? []} editable={editable} onChange={(drive) => cambiar(def, { ...c, drive })} />
        )}
        {guardarCifra.error && (
          <p className="inf-error" role="alert">
            {mensajeDe(guardarCifra.error)}
          </p>
        )}
      </div>

      {/* Controles y conexiones */}
      <aside className="inf-side" aria-label="Controles de la sección">
        <div className="inf-card">
          <h3>Controles</h3>
          <Controles
            items={controlesSeccion(def, c, {
              ...ctx,
              claves: m.incluidas.map((x) => x.clave),
              congelada: m.frio,
              corte: ciclo.corte ? fmtFecha(ciclo.corte) : null,
            })}
          />
        </div>
        <div className="inf-card">
          <h3>Datos que puede consultar</h3>
          <ul className="inf-conx">
            <li>
              <b>UDES en Cifras</b>
              <span>Cifras del periodo con su fuente y corte</span>
              <a className="inf-link" href="/datos-abiertos" target="_blank" rel="noopener">
                Abrir UDES en Cifras
              </a>
            </li>
            <li>
              <b>Plan de Desarrollo</b>
              <span>Pilares, proyectos y su avance</span>
              <a className="inf-link" href="/implementacion" target="_blank" rel="noopener">
                Abrir el portal de implementación
              </a>
            </li>
            <li>
              <b>Pilo</b>
              <span>Pregunte de dónde sale una cifra o pida comparar con otra unidad.</span>
              <a className="inf-link" href="/pregunta" target="_blank" rel="noopener">
                Preguntar a Pilo
              </a>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

/* ---------- Resultados por dimensión: el catálogo de UDES en Cifras y las acciones de agregar o conectar ---------- */

function DimensionesConectadas({
  def,
  m,
  propias,
  editable,
  pilares,
  guardar,
  agregarPropio,
  quitarPropio,
}: {
  def: SeccionDef;
  m: ModeloInforme;
  propias: ModeloInforme["propias"];
  editable: boolean;
  pilares: PilarRef[];
  guardar: (clave: string, d: DatosCifra) => void;
  agregarPropio: (p: NuevoPropio) => void;
  quitarPropio: (clave: string) => void;
}) {
  const catalogo = useCatalogoIndicadores();
  const sedes = useSedesCifras();
  const nombreSede = (slug: string) => sedes.data?.find((x) => x.slug === slug)?.nombre ?? slug;
  return (
    <Dimensiones
      dims={def.dims ?? []}
      vista={m.vista}
      agregadas={m.agregadas.filter((a) => a.fila.seccion_clave === def.clave)}
      propias={propias}
      editable={editable}
      limite={m.config.limite_propios}
      exigirFuente={m.config.exigir_fuente}
      exigirPilar={m.config.exigir_pilar}
      pilares={pilares}
      catalogo={{ datos: catalogo.data ?? [], cargando: catalogo.isPending, error: catalogo.error instanceof Error ? catalogo.error : null }}
      sedes={sedes.data ?? []}
      guardar={guardar}
      agregarIndicador={(dim, i, sede) =>
        guardar(claveAgregada(i.clave, sede), {
          etiqueta: sede ? `${i.nombre} · ${nombreSede(sede)}` : i.nombre,
          seccion_clave: def.clave,
          fuente_tipo: "auto",
          consulta: consultaDe(i, sede, dim),
          unidad: unidadDe(i.unidad),
          incluida: true,
        })
      }
      conectarIndicador={(clave, dim, i, sede) => guardar(clave, { fuente_tipo: "auto", consulta: consultaDe(i, sede, dim), unidad: unidadDe(i.unidad) })}
      agregarPropio={agregarPropio}
      quitarCifra={quitarPropio}
    />
  );
}

/* ---------- El cuerpo de cada tipo de sección ---------------------------------- */

function CuerpoSeccion({
  def,
  c,
  m,
  inst,
  recibeMetas,
  esFacultad,
  plan,
  editable,
  resolver,
  pilares,
  cambiar,
  guardar,
  agregarPropio,
  quitarPropio,
  subir,
  enlazar,
  quitarAnexo,
  ocupado,
}: {
  def: SeccionDef;
  c: ContenidoSeccion;
  m: ModeloInforme;
  inst: InstanciaRow;
  /** Programa o facultad: sus metas vienen de los indicadores del programa. */
  recibeMetas: boolean;
  /** Facultad: metas y resultados por dimensión salen del Plan de Trabajo. */
  esFacultad: boolean;
  plan: ReturnType<typeof usePlanUnidad>;
  editable: boolean;
  resolver: ReturnType<typeof resolverDe>;
  pilares: PilarRef[];
  cambiar: (c: ContenidoSeccion) => void;
  guardar: (clave: string, d: DatosCifra) => void;
  agregarPropio: (p: NuevoPropio) => void;
  quitarPropio: (clave: string) => void;
  subir: (f: File[]) => Promise<void>;
  enlazar: (url: string, nombre: string) => Promise<void>;
  quitarAnexo: (a: AnexoRow) => void;
  ocupado: boolean;
}) {
  const texto = (etiqueta: string, opciones: { minimo?: number; placeholder?: string; pilo?: boolean } = {}) => (
    <CampoTexto
      etiqueta={etiqueta}
      valor={c.texto ?? ""}
      onChange={(t) => cambiar({ ...c, texto: t })}
      cifras={m.incluidas}
      resolver={resolver}
      editable={editable}
      minimo={opciones.minimo}
      placeholder={opciones.placeholder}
      pie={opciones.pilo && editable ? <PiloRedacta inst={inst} def={def} c={c} cambiar={cambiar} /> : undefined}
    />
  );
  const anexos = m.anexos.data ?? [];

  switch (def.tipo) {
    case "narr":
      return (
        <div className="inf-blk">
          <div className="inf-blk__lab">
            <Tag />
            <span className="inf-src">{def.extension}</span>
          </div>
          {texto(def.titulo, { minimo: def.minimo, pilo: true })}
        </div>
      );
    case "pdi":
      return (
        <>
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag auto />
              <span className="inf-src">Plan de Desarrollo · avance de cada pilar</span>
            </div>
            <TablaPilares pilares={pilares} marcados={c.pilares ?? []} editable={editable} cambiar={(ids) => cambiar({ ...c, pilares: ids })} />
          </div>
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag />
              <span className="inf-src">Media página: cómo contribuye su unidad a los pilares marcados (se recomiendan al menos 3)</span>
            </div>
            {texto("Contribución a los pilares", { placeholder: "Cuente cómo se conecta su trabajo con los pilares que marcó…" })}
          </div>
        </>
      );
    case "metas": {
      const delPrograma = recibeMetas || m.metasPrograma.length > 0;
      return (
        <>
          {esFacultad && (
            <div className="inf-blk">
              <div className="inf-blk__lab">
                <Tag auto />
                <span className="inf-src">Plan de Trabajo 2026 · las acciones vienen del plan; las filas no se editan, añada su análisis</span>
              </div>
              <TablaPlan
                plan={plan.data}
                cargando={plan.isPending}
                error={plan.error instanceof Error ? plan.error : null}
                observaciones={c.observaciones ?? {}}
                editable={editable}
                cambiarObservacion={(clave, t) => cambiar({ ...c, observaciones: { ...c.observaciones, [clave]: t } })}
              />
            </div>
          )}
          {delPrograma && (
            <div className="inf-blk">
              <div className="inf-blk__lab">
                <Tag auto />
                <span className="inf-src">
                  {m.frio ? "Foto tomada al enviar" : "En vivo hasta que envíe"} · Indicadores del programa en Impacto. Las filas no se editan; añada su análisis.
                </span>
              </div>
              <TablaMetasPrograma
                filas={m.metasPrograma}
                observaciones={c.observaciones ?? {}}
                editable={editable}
                cambiarObservacion={(clave, t) => cambiar({ ...c, observaciones: { ...c.observaciones, [clave]: t } })}
                aceptar={(clave, valor) => guardar(clave, { visto: valor })}
                esperaIndicadores={recibeMetas}
              />
            </div>
          )}
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag />
              <span className="inf-src">
                {delPrograma ? "Meta adicional: solo lo que no está en los indicadores del programa. El resultado se calcula solo." : "El resultado se calcula solo. Nada de tablas pegadas desde Excel."}
              </span>
            </div>
            <TablaMetas metas={c.metas ?? []} editable={editable} cambiar={(metas) => cambiar({ ...c, metas })} />
          </div>
        </>
      );
    }
    case "dim": {
      const propias = m.propias.filter((p) => p.fila.seccion_clave === def.clave);
      return (
        <>
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag auto />
              <span className="inf-src">{m.frio ? "Foto tomada al enviar" : "En vivo hasta que envíe"} · UDES en Cifras y PDI</span>
            </div>
            <DimensionesConectadas def={def} m={m} propias={propias} editable={editable} pilares={pilares} guardar={guardar} agregarPropio={agregarPropio} quitarPropio={quitarPropio} />
          </div>
          {esFacultad && (
            <div className="inf-blk">
              <div className="inf-blk__lab">
                <Tag auto />
                <span className="inf-src">Avance del Plan de Trabajo por dimensión</span>
              </div>
              <ResumenPlan plan={plan.data} cargando={plan.isPending} error={plan.error instanceof Error ? plan.error : null} />
            </div>
          )}
          {def.consolida && (
            <div className="inf-blk">
              <div className="inf-blk__lab">
                <Tag auto />
                <span className="inf-src">Aportes aprobados de las unidades</span>
              </div>
              <p className="inf-muted">Los aportes aprobados de las unidades que le entregan llegarán aquí con el Consolidador (próxima fase).</p>
            </div>
          )}
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag />
              <span className="inf-src">{def.consolida ? "Análisis de la rectoría" : "Logros y lo que las cifras no cuentan"}</span>
            </div>
            {texto(`Análisis de ${def.titulo}`, { placeholder: "Escriba su lectura de estos resultados…" })}
          </div>
        </>
      );
    }
    case "matriz":
      return (
        <>
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag auto />
              <span className="inf-src">Matriz de indicadores con las cifras incluidas</span>
            </div>
            <Matriz cifras={m.incluidas} />
          </div>
          <div className="inf-blk">
            <div className="inf-blk__lab">
              <Tag />
              <span className="inf-src">Comentario de media página (mínimo 10 palabras)</span>
            </div>
            {texto("Comentario de la matriz", { minimo: 10, placeholder: "¿Qué explica los semáforos amarillos y rojos?" })}
          </div>
        </>
      );
    case "filas":
      return (
        <div className="inf-blk">
          <div className="inf-blk__lab">
            <Tag />
            <span className="inf-src">Una fila por punto. Se recomienda con acción y fecha.</span>
          </div>
          <TablaFilas columnas={def.columnas ?? []} filas={c.filas ?? []} editable={editable} cambiar={(filas) => cambiar({ ...c, filas })} />
        </div>
      );
    case "logros":
      return (
        <div className="inf-blk">
          <div className="inf-blk__lab">
            <Tag />
            <span className="inf-src">{(c.logros ?? []).length} de 3 logros</span>
          </div>
          <Logros logros={c.logros ?? []} anexos={anexos} editable={editable} cambiar={(logros) => cambiar({ ...c, logros })} />
        </div>
      );
    case "evid":
      return (
        <div className="inf-blk">
          <div className="inf-blk__lab">
            <Tag />
            <span className="inf-src">Cargue aquí cada archivo una sola vez; se numeran como anexos</span>
          </div>
          {editable && <CargaEvidencias subir={subir} enlazar={enlazar} ocupado={ocupado} />}
          <TablaAnexos anexos={anexos} quitar={editable ? quitarAnexo : undefined} />
        </div>
      );
    case "anexos":
      return (
        <div className="inf-blk">
          <div className="inf-blk__lab">
            <Tag auto />
            <span className="inf-src">Lista numerada con los archivos y enlaces cargados</span>
          </div>
          <TablaAnexos anexos={anexos} />
        </div>
      );
  }
}

/* ---------- Pilo redacta -------------------------------------------------------- */

function PiloRedacta({ inst, def, c, cambiar }: { inst: InstanciaRow; def: SeccionDef; c: ContenidoSeccion; cambiar: (c: ContenidoSeccion) => void }) {
  const [estado, setEstado] = useState<{ cargando: boolean; avisos: string[]; error: string }>({ cargando: false, avisos: [], error: "" });
  const esDePilo = Boolean(c.borrador_pilo) && c.borrador_pilo === c.texto;
  const pedir = async () => {
    if ((c.texto ?? "").trim() && !window.confirm("El borrador de Pilo reemplaza el texto de esta sección. ¿Continuar?")) return;
    setEstado({ cargando: true, avisos: [], error: "" });
    try {
      const r = await piloRedactar(inst.id, def.clave);
      cambiar({ ...c, texto: r.texto, borrador_pilo: r.texto });
      const guia = r.ejemplos_usados?.length ? [`Se guió por ${r.ejemplos_usados.length} ${r.ejemplos_usados.length === 1 ? "informe aprobado" : "informes aprobados"}`] : [];
      setEstado({ cargando: false, avisos: [...guia, ...(r.avisos ?? [])], error: "" });
    } catch (e) {
      setEstado({ cargando: false, avisos: [], error: mensajeDe(e) });
    }
  };
  return (
    <span className="inf-row" style={{ justifyContent: "flex-end" }}>
      {esDePilo && <span className="inf-pill is-teal">Borrador de Pilo · confirme cada cifra</span>}
      <button type="button" className="inf-btn inf-btn--sm" onClick={() => void pedir()} disabled={estado.cargando}>
        {estado.cargando ? "Pilo está escribiendo…" : "Pilo redacta un borrador"}
      </button>
      {estado.error && (
        <span className="inf-error" role="alert">
          {estado.error}
        </span>
      )}
      {estado.avisos.length > 0 && <span className="inf-hint">{estado.avisos.join(" · ")}</span>}
    </span>
  );
}
