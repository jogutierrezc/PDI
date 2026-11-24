/* =============================================================================
   Internacionalización · Plantillas: el «hilo».

   Cada columna de una plantilla (SNIES, CNA, un ranking) se une con un hilo al
   concepto del repositorio que la responde: directo (cian), derivado (ámbar de
   estado pendiente, se calcula) o sin hilo (falta un campo). La cobertura es
   REAL: sale de las columnas que tienen hoy las tablas (lib/cobertura).
     · SNIES: el catálogo de Reportes Institucionales, tal cual.
     · CNA / rankings: las carga el Director desde CSV o Excel y corrige el
       emparejamiento que propone el sistema.
     · «Enviar a SNIES»: solo las plantillas con puente (hoy Participante), solo
       filas aprobadas, con vista previa y los motivos de rechazo de Reportes.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { Icon } from "../../../components/ui/Icon";
import { movimientoReducido, useEntrada, useFundido } from "./movimiento";
import { useCatalogos, useSedes } from "../../reportes/store";
import { DOMINIOS } from "../../reportes/snies/dominios";
import { armarContexto } from "../../reportes/util";
import type { PeriodoCodigo, PlantillaSpec } from "../../reportes/tipos";
import {
  FaltaMigracion,
  useBorrarPlantilla,
  useConceptos,
  useEnvios,
  useEnviarSnies,
  useEnviosSnies,
  useEstructura,
  useFilas,
  useGuardarPlantilla,
  useNombres,
  usePlantillas,
} from "../datos";
import type { PlantillaConColumnas } from "../datos";
import { cobertura, disponiblesDe, encabezadosDeCsv, propuestaPlantilla } from "../lib/cobertura";
import type { ColumnaPlantilla, Cobertura, Modo } from "../lib/cobertura";
import { analizarLibro } from "../lib/importador-excel";
import { construirEnvioSnies, definicionPuente, puedeAlimentar } from "../lib/puente-snies";
import type { IntConceptoRow, IntPlantillaRow, LibroCompleto } from "../tipos";
import { AvisoMigracion, Cajon, Cargando, Confirmar, ErrorCaja, fmt, useAviso, Vacio } from "./comunes";
import type { Ctx } from "./comunes";
import { enmascarar, momento } from "./logica";
import { ETIQUETA_TIPO, listaPlantillas } from "./plantillas-lista";
import type { PlantillaVista } from "./plantillas-lista";

const MODO: Record<Modo, string> = { directo: "Directo del repositorio", derivado: "Derivado (se calcula)", falta: "Falta un campo" };

export function Plantillas({ ctx }: { ctx: Ctx }) {
  const [params, setParams] = useSearchParams();
  const estructura = useEstructura();
  const conceptos = useConceptos();
  const plantillas = usePlantillas();
  const [editar, setEditar] = useState<null | "nueva" | PlantillaConColumnas>(null);
  const aviso = useAviso();
  const raiz = useRef<HTMLDivElement>(null);
  const mapa = useRef<HTMLDivElement>(null);

  const hojas = useMemo(() => (estructura.data ?? []).flatMap((l) => l.hojas), [estructura.data]);
  const disponibles = useMemo(() => disponiblesDe(hojas), [hojas]);
  const nombreDe = useMemo(() => (id: string) => conceptos.data?.find((c) => c.id === id)?.nombre ?? id, [conceptos.data]);
  const lista = useMemo(() => listaPlantillas(plantillas.data ?? []).map((p) => ({ p, c: cobertura(p, disponibles, nombreDe) })), [plantillas.data, disponibles, nombreDe]);
  const elegida = lista.find((x) => x.p.id === params.get("plantilla")) ?? lista[0] ?? null;

  useEntrada(raiz, "[data-entra]", Boolean(estructura.data && plantillas.data));
  useFundido(mapa, elegida?.p.id);

  const error = estructura.error ?? conceptos.error ?? plantillas.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!estructura.data || !conceptos.data || !plantillas.data) return <Cargando texto="Calculando la cobertura…" />;

  const elegir = (id: string) => {
    const p = new URLSearchParams(params);
    p.set("plantilla", id);
    setParams(p, { replace: true });
  };
  const grupos: { titulo: string; items: typeof lista }[] = [
    { titulo: "SNIES (catálogo de Reportes)", items: lista.filter((x) => x.p.tipo === "snies") },
    { titulo: "CNA, rankings y otras", items: lista.filter((x) => x.p.tipo !== "snies") },
  ];

  return (
    <div ref={raiz} className="it-plantillas">
      <aside className="it-libros it-libros--plantillas" aria-label="Plantillas" data-entra>
        {grupos.map((g) => (
          <section key={g.titulo}>
            <h2 className="it-libros__titulo">{g.titulo}</h2>
            {g.items.length === 0 && <p className="it-tenue">{ctx.director ? "Ninguna cargada. Cargue la de CNA o la de un ranking desde CSV o Excel." : "Ninguna cargada todavía."}</p>}
            <ul>
              {g.items.map(({ p, c }) => (
                <li key={p.id}>
                  <button type="button" aria-current={p.id === elegida?.p.id ? "true" : undefined} onClick={() => elegir(p.id)}>
                    <span className="it-fila">
                      <span className="it-chip">{ETIQUETA_TIPO[p.tipo]}</span>
                      {p.puente && <span className="it-chip is-ok">puente</span>}
                      <span className="it-espacio" />
                      <b className="it-num">{c.total ? `${c.porcentaje} %` : "—"}</b>
                    </span>
                    <b>{p.nombre.replace(/^SNIES · /, "")}</b>
                    <span className="it-libros__medidor" aria-hidden="true">
                      <i style={{ width: `${c.porcentaje}%` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {ctx.director && (
          <div className="it-libros__acciones">
            <button type="button" className="button-primary it-btn" onClick={() => setEditar("nueva")}>
              <Icon name="upload" size={16} aria-hidden="true" /> Cargar plantilla
            </button>
            <p className="it-ayuda">CSV o Excel: se lee la fila de encabezados y el sistema propone el emparejamiento.</p>
          </div>
        )}
      </aside>

      <div ref={mapa} className="it-hilo-zona">
        {aviso.nodo}
        {!elegida ? (
          <Vacio titulo="No hay plantillas.">Las de SNIES vienen del catálogo de Reportes Institucionales.</Vacio>
        ) : (
          <>
            <Hilo vista={elegida.p} cob={elegida.c} conceptos={conceptos.data} disponibles={disponibles} />
            {ctx.director && elegida.p.guardada && (
              <AccionesPlantilla plantilla={elegida.p.guardada} onEditar={() => setEditar(elegida.p.guardada!)} aviso={aviso} />
            )}
            {elegida.p.spec && elegida.p.puente && ctx.director && <PuenteSnies spec={elegida.p.spec} ctx={ctx} estructura={estructura.data} />}
            {elegida.p.spec && elegida.p.puente && !ctx.director && (
              <p className="it-ayuda">El envío a SNIES lo hace el Director de Internacionalización con las filas aprobadas.</p>
            )}
          </>
        )}
      </div>

      {editar && (
        <EditorPlantilla
          conceptos={conceptos.data}
          plantilla={editar === "nueva" ? null : editar}
          onCerrar={() => setEditar(null)}
          onGuardada={(id, nombre) => {
            setEditar(null);
            elegir(id);
            aviso.ok(`Plantilla «${nombre}» guardada.`);
          }}
        />
      )}
    </div>
  );
}

/* ---------- El hilo -------------------------------------------------------- */

interface Trazo {
  d: string;
  modo: Modo;
}

function Hilo({ vista, cob, conceptos, disponibles }: { vista: PlantillaVista; cob: Cobertura; conceptos: IntConceptoRow[]; disponibles: ReadonlyMap<string, readonly string[]> }) {
  const rejilla = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const animada = useRef<string | null>(null);

  // Conceptos que la plantilla usa (directo o para derivar), en orden de aparición.
  const usados = useMemo(() => {
    const ids: string[] = [];
    for (const c of cob.columnas) for (const id of [c.concepto_id, ...(c.desde ?? [])]) if (id && !ids.includes(id)) ids.push(id);
    return ids;
  }, [cob]);

  // Medir y dibujar los hilos; al cambiar de tamaño se redibujan sin animar.
  useLayoutEffect(() => {
    const nodo = rejilla.current;
    if (!nodo) return;
    const medir = () => {
      const caja = nodo.getBoundingClientRect();
      const salida: Trazo[] = [];
      cob.columnas.forEach((c, i) => {
        const izq = nodo.querySelector<HTMLElement>(`[data-izq="${i}"]`);
        if (!izq) return;
        const a = izq.getBoundingClientRect();
        const x1 = a.right - caja.left;
        const y1 = a.top - caja.top + a.height / 2;
        const destino = c.resultado === "falta" ? null : c.concepto_id;
        const der = destino ? nodo.querySelector<HTMLElement>(`[data-der="${destino}"]`) : null;
        if (!der) {
          const x2 = x1 + Math.min(48, caja.width * 0.08);
          salida.push({ d: `M${x1} ${y1} L${x2} ${y1}`, modo: "falta" });
          return;
        }
        const b = der.getBoundingClientRect();
        const x2 = b.left - caja.left;
        const y2 = b.top - caja.top + b.height / 2;
        const mx = (x1 + x2) / 2;
        salida.push({ d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, modo: c.resultado });
      });
      setTrazos(salida);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [cob, usados]);

  // Los hilos se tienden una vez por plantilla (no al redimensionar).
  useLayoutEffect(() => {
    const s = svg.current;
    if (!s || !trazos.length || animada.current === vista.id) return;
    animada.current = vista.id;
    if (movimientoReducido()) return;
    const ctx = gsap.context(() => {
      s.querySelectorAll<SVGPathElement>("path[data-hilo]").forEach((p, k) => {
        const largo = p.getTotalLength?.() ?? 200;
        gsap.fromTo(p, { strokeDasharray: largo, strokeDashoffset: largo }, { strokeDashoffset: 0, duration: 0.3, ease: "expo.out", delay: Math.min(k * 0.04, 0.4), clearProps: "strokeDasharray,strokeDashoffset" });
      });
    }, s);
    return () => ctx.revert();
  }, [trazos, vista.id]);

  const nombre = (id: string) => conceptos.find((c) => c.id === id)?.nombre ?? id;

  return (
    <section className="it-hilo" aria-labelledby="it-hilo-titulo">
      <header className="it-hilo__cabeza">
        <b className="it-hilo__pct it-num">{cob.total ? `${cob.porcentaje} %` : "—"}</b>
        <div>
          <h2 id="it-hilo-titulo" className="it-h2">
            {vista.nombre}
          </h2>
          <p className="it-sub">
            {cob.total
              ? `${cob.respondidas} de ${cob.total} columnas se responden con el repositorio (${cob.directas} directas, ${cob.derivadas} derivadas).`
              : "El catálogo de Reportes todavía no define sus campos."}
            {cob.obligatoriasFaltantes.length > 0 && ` Faltan obligatorias: ${cob.obligatoriasFaltantes.join(", ")}.`}
          </p>
          {vista.spec && <p className="it-ayuda">{vista.spec.modulo} · {vista.spec.seccion}</p>}
        </div>
      </header>
      <ul className="it-leyenda">
        <li>
          <i className="is-directo" aria-hidden="true" /> {MODO.directo}
        </li>
        <li>
          <i className="is-derivado" aria-hidden="true" /> {MODO.derivado}
        </li>
        <li>
          <i className="is-falta" aria-hidden="true" /> {MODO.falta}
        </li>
      </ul>
      {cob.total > 0 && (
        <div ref={rejilla} className="it-hilo__rejilla">
          <svg ref={svg} className="it-hilo__svg" aria-hidden="true">
            {trazos.map((t, i) => (
              <path key={i} data-hilo d={t.d} className={`is-${t.modo}`} />
            ))}
          </svg>
          <div className="it-hilo__col">
            <h3 className="it-h4">Columnas de la plantilla</h3>
            <ol>
              {cob.columnas.map((c, i) => (
                <li key={`${c.etiqueta}-${i}`} data-izq={i} className={`it-nodo is-${c.resultado}`}>
                  <span>
                    {c.etiqueta}
                    {c.obligatorio && <span className="it-obligatorio" aria-label="obligatoria"> *</span>}
                    <span className="sr-only">: {MODO[c.resultado]}</span>
                  </span>
                  <small>{c.motivo}</small>
                </li>
              ))}
            </ol>
          </div>
          <div aria-hidden="true" />
          <div className="it-hilo__col">
            <h3 className="it-h4">Conceptos del repositorio</h3>
            <ul>
              {usados.map((id) => {
                const hojas = disponibles.get(id);
                return (
                  <li key={id} data-der={id} className={`it-nodo ${hojas ? "is-concepto" : "is-falta"}`}>
                    <span>{nombre(id)}</span>
                    <small>{hojas ? hojas.join(", ") : "Ninguna tabla lo lleva"}</small>
                  </li>
                );
              })}
              {usados.length === 0 && <li className="it-tenue">Ningún concepto del repositorio responde esta plantilla.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Acciones de una plantilla cargada ----------------------------- */

function AccionesPlantilla({ plantilla, onEditar, aviso }: { plantilla: PlantillaConColumnas; onEditar: () => void; aviso: ReturnType<typeof useAviso> }) {
  const [borrar, setBorrar] = useState(false);
  const quitar = useBorrarPlantilla();
  return (
    <div className="it-fila it-hilo__acciones">
      <button type="button" className="button-secondary it-btn" onClick={onEditar}>
        Corregir emparejamiento
      </button>
      <button type="button" className="button-ghost it-btn it-btn--quitar" onClick={() => setBorrar(true)}>
        Borrar plantilla
      </button>
      {borrar && (
        <Confirmar
          pregunta={`¿Borrar la plantilla «${plantilla.nombre}»?`}
          detalle="Se pierde su emparejamiento. Los datos del repositorio no cambian."
          si="Sí, borrar"
          ocupado={quitar.isPending}
          onNo={() => setBorrar(false)}
          onSi={() => quitar.mutate(plantilla.id, { onSuccess: () => aviso.ok("Plantilla borrada."), onError: (e) => aviso.mal(e), onSettled: () => setBorrar(false) })}
        />
      )}
    </div>
  );
}

/* ---------- Cargar o corregir una plantilla (CNA, ranking, otra) ---------- */

function EditorPlantilla({
  conceptos,
  plantilla,
  onCerrar,
  onGuardada,
}: {
  conceptos: IntConceptoRow[];
  plantilla: PlantillaConColumnas | null;
  onCerrar: () => void;
  onGuardada: (id: string, nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [tipo, setTipo] = useState<IntPlantillaRow["tipo"]>(plantilla?.tipo ?? "cna");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? "");
  const [columnas, setColumnas] = useState<ColumnaPlantilla[]>(
    () => plantilla?.columnas.map((c) => ({ etiqueta: c.etiqueta, concepto_id: c.concepto_id, modo: c.modo, nota: c.nota })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const guardar = useGuardarPlantilla();

  const leer = async (file: File) => {
    setError(null);
    try {
      let encabezados: string[] = [];
      if (/\.xlsx$/i.test(file.name)) {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        encabezados = analizarLibro(wb, conceptos).hojas[0]?.columnas.map((c) => c.encabezado) ?? [];
      } else encabezados = encabezadosDeCsv(await file.text());
      if (!encabezados.length) return setError("No se encontraron encabezados en la primera fila del archivo.");
      setColumnas(propuestaPlantilla(encabezados, conceptos));
      if (!nombre) setNombre(file.name.replace(/\.(csv|xlsx)$/i, ""));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const cambiar = (i: number, c: Partial<ColumnaPlantilla>) => setColumnas((x) => x.map((k, j) => (j === i ? { ...k, ...c } : k)));

  return (
    <Cajon
      titulo={plantilla ? `Corregir «${plantilla.nombre}»` : "Cargar plantilla"}
      ancho="ancho"
      onCerrar={onCerrar}
      pie={
        <>
          {error && (
            <p className="it-error" role="alert">
              {error}
            </p>
          )}
          <span className="it-espacio" />
          <button type="button" className="button-secondary it-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="button-primary it-btn"
            disabled={guardar.isPending || !nombre.trim() || columnas.length === 0}
            onClick={() =>
              guardar.mutate(
                { id: plantilla?.id, nombre: nombre.trim(), tipo, descripcion, columnas },
                { onSuccess: (id) => onGuardada(id, nombre.trim()), onError: (e) => setError(e.message) },
              )
            }
          >
            {guardar.isPending ? "Guardando…" : "Guardar plantilla"}
          </button>
        </>
      }
    >
      {!plantilla && (
        <label className="it-soltar is-compacta">
          <Icon name="upload" size={20} aria-hidden="true" />
          <span>
            <b>Elegir el archivo de la plantilla (CSV o Excel)</b>
            <small>Se lee la fila de encabezados; cada columna se empareja con un concepto si lo hay.</small>
          </span>
          <input
            data-autofocus
            type="file"
            accept=".csv,.xlsx,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void leer(f);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <div className="it-fila it-fila--campos">
        <label className="it-campo">
          <span>Nombre</span>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. CNA · Factor de internacionalización" />
        </label>
        <label className="it-campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as IntPlantillaRow["tipo"])}>
            <option value="cna">CNA</option>
            <option value="ranking">Ranking</option>
            <option value="otra">Otra</option>
          </select>
        </label>
      </div>
      <label className="it-campo">
        <span>Descripción (opcional)</span>
        <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      {columnas.length > 0 && (
        <div className="it-desliza">
          <table className="it-tabla it-tabla--compacta it-tabla--tarjetas">
            <thead>
              <tr>
                <th scope="col">Columna de la plantilla</th>
                <th scope="col">Concepto del repositorio</th>
                <th scope="col">Cómo</th>
                <th scope="col">Nota</th>
              </tr>
            </thead>
            <tbody>
              {columnas.map((c, i) => (
                <tr key={i}>
                  <td data-rotulo="Columna">{c.etiqueta}</td>
                  <td data-rotulo="Concepto">
                    <select
                      aria-label={`Concepto de «${c.etiqueta}»`}
                      value={c.concepto_id ?? ""}
                      onChange={(e) => cambiar(i, { concepto_id: e.target.value || null, modo: e.target.value ? (c.modo === "falta" ? "directo" : c.modo) : "falta" })}
                    >
                      <option value="">Ninguno (falta)</option>
                      {conceptos.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-rotulo="Cómo">
                    <select aria-label={`Cómo se responde «${c.etiqueta}»`} value={c.modo} disabled={!c.concepto_id} onChange={(e) => cambiar(i, { modo: e.target.value as Modo })}>
                      <option value="directo">Directo</option>
                      <option value="derivado">Derivado</option>
                      <option value="falta">Falta</option>
                    </select>
                  </td>
                  <td data-rotulo="Nota">
                    <input type="text" aria-label={`Nota de «${c.etiqueta}»`} value={c.nota ?? ""} onChange={(e) => cambiar(i, { nota: e.target.value })} placeholder="Ej. conteo por programa" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cajon>
  );
}

/* ---------- Puente «Enviar a SNIES» --------------------------------------- */

function PuenteSnies({ spec, ctx, estructura }: { spec: PlantillaSpec; ctx: Ctx; estructura: LibroCompleto[] }) {
  const periodo = ctx.periodo;
  const aptas = useMemo(
    () => estructura.flatMap((l) => l.hojas.map((h) => ({ ...h, libro: l.nombre }))).filter((h) => puedeAlimentar(spec, disponiblesDe([h])).si),
    [estructura, spec],
  );
  const [hojaId, setHojaId] = useState<string>("");
  const hoja = aptas.find((h) => h.id === hojaId) ?? aptas[0] ?? null;
  const filas = useFilas(hoja?.id, periodo?.id);
  const envios = useEnvios(periodo?.id);
  const catalogos = useCatalogos();
  const sedes = useSedes();
  const bitacora = useEnviosSnies(periodo?.id);
  const nombres = useNombres((bitacora.data ?? []).map((b) => b.actor));
  const enviar = useEnviarSnies();
  const aviso = useAviso();
  const def = definicionPuente(spec.id);
  const codigoValido = Boolean(periodo && /^\d{4}-[12]$/.test(periodo.codigo));

  const armado = useMemo(() => {
    if (!periodo || !hoja || !filas.data || !envios.data || !codigoValido) return null;
    const conEstado = filas.data.map((f) => ({ id: f.id, hoja_id: f.hoja_id, campus_id: f.campus_id, datos: f.datos, estado: envios.data!.find((e) => e.hoja_id === f.hoja_id && e.campus_id === f.campus_id)?.estado ?? "borrador" }));
    const municipios = catalogos.data?.municipio ?? [];
    const sedePorCampus = Object.fromEntries(
      (sedes.data ?? []).filter((s) => s.municipio).map((s) => [s.campus_id, municipios.find((m) => m.codigo === s.municipio)?.nombre ?? ""]),
    );
    try {
      return { envio: construirEnvioSnies(spec, conEstado, { contexto: armarContexto(periodo.codigo as PeriodoCodigo, catalogos.data, DOMINIOS, undefined), periodo: periodo.codigo, sedePorCampus }), error: null };
    } catch (e) {
      return { envio: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [periodo, hoja, filas.data, envios.data, catalogos.data, sedes.data, spec, codigoValido]);

  const muestra = spec.campos.slice(0, 9);

  return (
    <section className="it-panel it-puente" aria-labelledby="it-puente">
      <header className="it-panel__cabeza">
        <h3 id="it-puente">Enviar a SNIES · {spec.nombre}</h3>
        {aviso.nodo}
      </header>
      <div className="it-panel__cuerpo">
        <p className="it-ayuda">{def?.porQue} Solo van filas aprobadas; las que Reportes ya tiene (misma clave {def?.clave.join(", ")}) se omiten. La entrega vuelve a «cargada» y hay que validarla en Reportes.</p>
        {!periodo || !codigoValido ? (
          <p className="it-error">El periodo debe tener un código como «2026-2» para enviarse a SNIES.</p>
        ) : aptas.length === 0 ? (
          <p className="it-tenue">Ninguna hoja lleva todos los obligatorios de {spec.nombre}. Mire en el hilo qué conceptos faltan.</p>
        ) : (
          <>
            <label className="it-campo it-campo--en-linea">
              <span>Hoja de origen</span>
              <select value={hoja?.id ?? ""} onChange={(e) => setHojaId(e.target.value)}>
                {aptas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.libro} · {h.nombre}
                  </option>
                ))}
              </select>
            </label>
            {filas.error || catalogos.error ? (
              <ErrorCaja error={(filas.error ?? catalogos.error) as Error} />
            ) : !armado ? (
              <Cargando texto="Armando la vista previa con el motor de Reportes…" />
            ) : armado.error ? (
              <p className="it-error">{armado.error}</p>
            ) : (
              armado.envio && (
                <>
                  <ul className="it-resumen-carga">
                    <li className="is-ok">
                      <b className="it-num">{fmt(armado.envio.filas.length)}</b> listas para enviar
                    </li>
                    <li className={armado.envio.rechazadas.length ? "is-risk" : undefined}>
                      <b className="it-num">{fmt(armado.envio.rechazadas.length)}</b> rechazadas por Reportes
                    </li>
                    <li>
                      <b className="it-num">{fmt(armado.envio.noAprobadas)}</b> sin aprobar (no van)
                    </li>
                    <li>
                      <b className="it-num">{fmt(armado.envio.repetidas)}</b> repetidas
                    </li>
                  </ul>
                  {armado.envio.filas.length > 0 && (
                    <div className="it-desliza">
                      <table className="it-tabla it-tabla--compacta">
                        <thead>
                          <tr>
                            {muestra.map((c) => (
                              <th key={c.codigo} scope="col">
                                {c.etiqueta}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {armado.envio.filas.slice(0, 8).map((f) => (
                            <tr key={f.origen}>
                              {muestra.map((c) => (
                                <td key={c.codigo}>{c.codigo === "NUM_DOCUMENTO" ? enmascarar(f.datos[c.codigo] ?? "") : f.datos[c.codigo]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {armado.envio.rechazadas.length > 0 && (
                    <ul className="it-errores">
                      {armado.envio.rechazadas.slice(0, 30).flatMap((r) =>
                        r.errores.map((e, k) => (
                          <li key={`${r.origen}-${k}`}>
                            <b>{spec.campos.find((c) => c.codigo === e.campo)?.etiqueta ?? e.campo}</b> {e.mensaje}
                          </li>
                        )),
                      )}
                    </ul>
                  )}
                  <div className="it-fila">
                    <button
                      type="button"
                      className="button-primary it-btn"
                      disabled={!armado.envio.filas.length || enviar.isPending || !def}
                      onClick={() =>
                        enviar.mutate(
                          { periodo: periodo.id, plantilla: spec.id, filas: armado.envio!.filas, clave: def!.clave },
                          {
                            onSuccess: (r) => aviso.ok(`Enviadas a Reportes: ${fmt(r.insertadas)} nuevas, ${fmt(r.omitidas)} ya estaban.`),
                            onError: (e) => aviso.mal(e),
                          },
                        )
                      }
                    >
                      {enviar.isPending ? "Enviando…" : `Enviar ${fmt(armado.envio.filas.length)} filas a Reportes`}
                    </button>
                  </div>
                </>
              )
            )}
          </>
        )}
        <h4 className="it-h4">Registro de envíos</h4>
        {bitacora.data && bitacora.data.length > 0 ? (
          <ol className="it-registro">
            {bitacora.data.map((b) => (
              <li key={b.id}>
                <span className="it-num it-tenue">{momento(b.en)}</span>
                <b>{b.plantilla}</b> · periodo {b.ri_periodo}
                <span className="it-num">
                  {fmt(b.insertadas)} nuevas · {fmt(b.omitidas)} omitidas
                </span>
                <span className="it-tenue">{b.actor ? (nombres.data?.[b.actor] ?? "Persona") : ""}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="it-tenue">Todavía no se ha enviado nada en este periodo.</p>
        )}
      </div>
    </section>
  );
}
