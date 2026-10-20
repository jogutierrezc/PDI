/* =============================================================================
   Datos de Sostenibilidad · el editor de un libro.

   Tres pestañas, como el editor de Programas en Cifras:
     Filas      la grilla: celdas tipadas, pegar desde Excel, siguiente error,
                guardar por lotes. Un libro listo al que se le toca algo
                vuelve a borrador (lo hace la base).
     Columnas   la estructura: añadir, cambiar tipo, quitar. La clave de una
                columna existente no se toca: sus datos viven bajo esa clave.
     Responde a la conexión con el indicador: qué columna da el valor, el
                periodo, el campus, la fuente y la evidencia (autoMap propone).
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../../admin/udes-en-cifras/ui";
import { ETIQUETA_TIPO, errorDeCelda, leerFila } from "../../programas-en-cifras/lib/validacion";
import type { PcTipo } from "../../programas-en-cifras/tipos";
import { leerCsv } from "../../programas-en-cifras/ui/leer-excel";
import {
  esFaltaMigracion,
  useErrores,
  useEstructura,
  useFilas,
  useGuardarColumnas,
  useGuardarFilas,
  useGuardarRespuesta,
  useIndicadores,
  useMarcarListo,
  useQuitarRespuesta,
  useRespuestas,
} from "../datos";
import { SLOTS, autoMap, coberturaDelMapa, faltanDelMapa } from "../lib/indicadores";
import { puedeEditar } from "../lib/permisos";
import type { DsColumna, DsDatos, DsOficina, DsYo } from "../tipos";
import type { Columna } from "../../programas-en-cifras/tipos";

type Pestana = "filas" | "columnas" | "respuesta";

interface FilaLocal {
  id?: string;
  datos: Record<string, unknown>;
  nuevo?: boolean;
  borrar?: boolean;
}

export function EditorLibro({ yo, oficina, libroId, onCerrar }: { yo: DsYo; oficina: DsOficina; libroId: string; onCerrar: () => void }) {
  const id = oficina.oficina_id;
  const editable = puedeEditar(yo, id);
  const estructura = useEstructura(id);
  const filasQ = useFilas(libroId);
  const erroresQ = useErrores(libroId);
  const guardar = useGuardarFilas(id);
  const columnasGuardar = useGuardarColumnas(id);
  const marcar = useMarcarListo(id);

  const libro = (estructura.data ?? []).find((l) => l.id === libroId) ?? null;
  const columnas = libro?.columnas ?? [];
  const [pestana, setPestana] = useState<Pestana>("filas");
  const [filas, setFilas] = useState<FilaLocal[]>([]);
  const [aviso, setAviso] = useState("");

  // La grilla local sigue a la base mientras no haya cambios sin guardar.
  useEffect(() => {
    setFilas((actuales) =>
      actuales.some((f) => f.nuevo || f.borrar)
        ? actuales
        : (filasQ.data ?? []).map((f) => ({ id: f.id, datos: { ...f.datos } })),
    );
  }, [filasQ.data]);

  const originales = useMemo(() => new Map((filasQ.data ?? []).map((f) => [f.id, JSON.stringify(f.datos)])), [filasQ.data]);
  const sucias = useMemo(
    () =>
      filas.filter((f) => {
        if (f.nuevo || f.borrar) return true;
        if (!f.id) return true;
        return originales.get(f.id) !== JSON.stringify(f.datos);
      }),
    [filas, originales],
  );

  const erroresServidor = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const e of erroresQ.data ?? []) mapa.set(`${e.fila_id}:${e.clave}`, e.mensaje);
    return mapa;
  }, [erroresQ.data]);

  /** El error de una celda: el de la base si la fila está guardada, el local si acaba de escribirse. */
  const errorDe = (fila: FilaLocal, columna: DsColumna): string => {
    if (fila.id && !fila.nuevo) return erroresServidor.get(`${fila.id}:${columna.clave}`) ?? "";
    return errorDeCelda(columnas as readonly Columna[], fila.datos as DsDatos, columna as Columna);
  };

  const guardarFilas = () => {
    if (!sucias.length) return;
    const lista = sucias
      .filter((f) => !f.borrar && (f.nuevo || !f.id || originales.get(f.id) !== JSON.stringify(f.datos)))
      .map((f) => ({ id: f.nuevo || !f.id ? undefined : f.id, datos: f.datos }));
    const borrar = sucias.filter((f) => f.borrar && f.id).map((f) => f.id as string);
    guardar.mutate(
      { libro: libroId, filas: lista, borrar: borrar.length ? borrar : undefined },
      {
        onSuccess: () => setAviso(""),
        onError: (e) => setAviso(e.message),
      },
    );
  };

  const marcarListo = () => {
    if (sucias.length) {
      setAviso("Guarde los cambios antes de marcar el libro como listo.");
      return;
    }
    marcar.mutate({ libro: libroId, listo: libro?.estado !== "listo" }, { onError: (e) => setAviso(e.message) });
  };

  const siguienteError = () => {
    const celda = document.querySelector<HTMLElement>(".ds-celda[data-error]");
    if (celda) {
      celda.focus();
      celda.scrollIntoView({ block: "center" });
    } else setAviso("Sin celdas con error.");
  };

  if (estructura.error) {
    const mensaje = String((estructura.error as Error).message ?? "No se pudo cargar el libro.");
    return (
      <p className="oda-banner" role="alert">
        <Icon name="alert" size={16} /> {esFaltaMigracion(estructura.error) ? mensaje : `No se pudo cargar el libro: ${mensaje}`}
      </p>
    );
  }
  if (!libro) {
    return (
      <StageEmpty title="Ese libro no está aquí">
        O no existe, o no es de esta oficina.{" "}
        <button type="button" className="oda-link-button" onClick={onCerrar}>
          Volver
        </button>
      </StageEmpty>
    );
  }

  return (
    <div className="oda-stack">
      <Panel
        title={libro.nombre}
        description={`${libro.tipo === "lista" ? "Lista" : "Tabla"} · ${libro.estado === "listo" ? "listo" : "borrador"} · ${filas.filter((f) => !f.borrar).length} ${(filas.filter((f) => !f.borrar).length) === 1 ? "fila" : "filas"}`}
        actions={
          <>
            <button type="button" className="oda-link-button" onClick={onCerrar}>
              Volver a los libros
            </button>
            <SaveState pending={guardar.isPending || marcar.isPending || columnasGuardar.isPending} error={guardar.error ?? marcar.error ?? columnasGuardar.error} success={guardar.isSuccess || marcar.isSuccess} idle={sucias.length ? "Sin guardar" : undefined} />
            {editable && (
              <button type="button" className="button-primary" onClick={marcarListo} disabled={marcar.isPending}>
                <Icon name={libro.estado === "listo" ? "undo" : "check"} size={15} />
                {libro.estado === "listo" ? "Volver a borrador" : "Marcar como listo"}
              </button>
            )}
          </>
        }
      >
        <div className="ds-pestanas" role="tablist" aria-label="Partes del libro">
          {(["filas", "columnas", "respuesta"] as Pestana[]).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}>
              {p === "filas" ? "Filas" : p === "columnas" ? "Columnas" : "Responde a"}
            </button>
          ))}
        </div>

        {aviso && (
          <p className="oda-banner" role="alert">
            <Icon name="alert" size={16} /> {aviso}
          </p>
        )}

        {pestana === "filas" && (
          <GrillaFilas
            columnas={columnas}
            filas={filas}
            setFilas={setFilas}
            editable={editable}
            sucias={sucias.length}
            onGuardar={guardarFilas}
            onPegar={(nuevas, reemplazar) =>
              guardar.mutate(
                { libro: libroId, filas: nuevas.map((datos) => ({ datos })), reemplazar, origen: "excel" },
                { onError: (e) => setAviso(e.message) },
              )
            }
            errorDe={errorDe}
            onSiguienteError={siguienteError}
          />
        )}
        {pestana === "columnas" && (
          <EditorColumnas
            libroId={libroId}
            columnas={columnas}
            editable={editable}
            onGuardado={() => setPestana("filas")}
          />
        )}
        {pestana === "respuesta" && <PanelRespuesta oficina={id} libroId={libroId} columnas={columnas} editable={editable} />}
      </Panel>
    </div>
  );
}

/* --- Filas -------------------------------------------------------------------------------- */

function GrillaFilas({
  columnas,
  filas,
  setFilas,
  editable,
  sucias,
  onGuardar,
  onPegar,
  errorDe,
  onSiguienteError,
}: {
  columnas: DsColumna[];
  filas: FilaLocal[];
  setFilas: (f: FilaLocal[]) => void;
  editable: boolean;
  sucias: number;
  onGuardar: () => void;
  onPegar: (filas: Record<string, unknown>[], reemplazar: boolean) => void;
  errorDe: (fila: FilaLocal, columna: DsColumna) => string;
  onSiguienteError: () => void;
}) {
  const [pegando, setPegando] = useState(false);
  const [pegado, setPegado] = useState("");
  const [reemplazar, setReemplazar] = useState(false);

  const addFila = () => setFilas([...filas, { datos: {}, nuevo: true }]);

  /** Del texto pegado (Excel o CSV) a filas tipadas. La primera fila manda si parece encabezados. */
  const leerPegado = () => {
    const matriz = leerCsv(pegado);
    if (!matriz.length) return;
    const primera = (matriz[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    const claves = columnas.map((c) => c.clave.toLowerCase());
    const etiquetas = columnas.map((c) => c.etiqueta.toLowerCase());
    const conEncabezado = primera.filter((v, i) => v && (v === claves[i] || v === etiquetas[i])).length >= Math.min(1, columnas.length);
    const cuerpo = conEncabezado ? matriz.slice(1) : matriz;
    const nuevas: Record<string, unknown>[] = [];
    for (const fila of cuerpo) {
      const cruda: Record<string, unknown> = {};
      columnas.forEach((c, i) => {
        cruda[c.clave] = fila[i] ?? "";
      });
      const { datos } = leerFila(columnas as readonly Columna[], cruda);
      nuevas.push(datos);
    }
    if (nuevas.length) onPegar(nuevas, reemplazar);
    setPegado("");
    setPegando(false);
  };

  return (
    <div className="ds-grilla">
      <div className="ds-grilla__acciones">
        {editable && (
          <button type="button" className="button-secondary" onClick={addFila}>
            <Icon name="plus" size={14} /> Añadir fila
          </button>
        )}
        {editable && (
          <button type="button" className="button-secondary" onClick={() => setPegando((p) => !p)}>
            <Icon name="clipboard" size={14} /> Pegar desde Excel
          </button>
        )}
        <button type="button" className="button-secondary" onClick={onSiguienteError}>
          <Icon name="next" size={14} /> Siguiente error
        </button>
        {editable && sucias > 0 && (
          <button type="button" className="button-primary" onClick={onGuardar}>
            Guardar {sucias} {sucias === 1 ? "cambio" : "cambios"}
          </button>
        )}
      </div>

      {pegando && (
        <div className="tb-paste">
          <p className="tb-prose tb-prose--aside">
            Copie las celdas de Excel y péguelas aquí. Si la primera fila trae los mismos encabezados, se usa como tal.
          </p>
          <textarea rows={5} value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder={"Año\tCampus\tConsumo\n2026\tBucaramanga\t11,5"} />
          <label className="tb-view__toggle">
            <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
            <span>Reemplazar todas las filas</span>
          </label>
          <button type="button" className="button-secondary" disabled={!pegado.trim()} onClick={leerPegado}>
            Leerlas
          </button>
        </div>
      )}

      {columnas.length === 0 ? (
        <p className="tb-prose">Este libro no tiene columnas todavía. Añádalas en la pestaña Columnas.</p>
      ) : (
        <div className="ds-tabla-scroll">
          <table className="ds-tabla">
            <thead>
              <tr>
                <th aria-label="Número de fila" />
                {columnas.map((c) => (
                  <th key={c.clave}>
                    {c.etiqueta}
                    {c.obligatorio && <b title="Obligatoria"> *</b>}
                    <small>{ETIQUETA_TIPO[c.tipo]}</small>
                  </th>
                ))}
                {editable && <th aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) =>
                f.borrar ? null : (
                  <tr key={f.id ?? `nueva-${i}`} data-nueva={f.nuevo || undefined}>
                    <td className="ds-tabla__orden">{i + 1}</td>
                    {columnas.map((c) => {
                      const error = errorDe(f, c);
                      return (
                        <td key={c.clave}>
                          {c.tipo === "lista" && c.opciones.length ? (
                            <select
                              className="ds-celda"
                              data-error={error || undefined}
                              disabled={!editable}
                              value={String(f.datos[c.clave] ?? "")}
                              onChange={(e) => setFilas(filas.map((x, k) => (k === i ? { ...x, datos: { ...x.datos, [c.clave]: e.target.value } } : x)))}
                            >
                              <option value="">—</option>
                              {c.opciones.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="ds-celda"
                              data-error={error || undefined}
                              title={error || undefined}
                              disabled={!editable}
                              type={c.tipo === "numero" || c.tipo === "porcentaje" ? "text" : "text"}
                              inputMode={c.tipo === "numero" || c.tipo === "porcentaje" ? "decimal" : undefined}
                              placeholder={c.tipo === "fecha" ? "AAAA-MM-DD" : undefined}
                              value={String(f.datos[c.clave] ?? "")}
                              onChange={(e) => setFilas(filas.map((x, k) => (k === i ? { ...x, datos: { ...x.datos, [c.clave]: e.target.value } } : x)))}
                            />
                          )}
                        </td>
                      );
                    })}
                    {editable && (
                      <td>
                        <button
                          type="button"
                          className="oda-link-button"
                          data-tone="danger"
                          onClick={() =>
                            setFilas(
                              f.id
                                ? filas.map((x, k) => (k === i ? { ...x, borrar: true } : x))
                                : filas.filter((_, k) => k !== i),
                            )
                          }
                        >
                          Quitar
                        </button>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {filas.some((f) => f.borrar) && (
        <p className="tb-prose tb-prose--aside">
          {filas.filter((f) => f.borrar).length} fila(s) por borrar: se borran al Guardar.
        </p>
      )}
    </div>
  );
}

/* --- Columnas ----------------------------------------------------------------------------- */

function EditorColumnas({ libroId, columnas, editable, onGuardado }: { libroId: string; columnas: DsColumna[]; editable: boolean; onGuardado: () => void }) {
  const guardar = useGuardarColumnas(undefined);
  const [borrador, setBorrador] = useState<DsColumna[]>(columnas);
  useEffect(() => setBorrador(columnas), [columnas]);

  const TIPOS: PcTipo[] = ["texto", "numero", "fecha", "lista", "porcentaje"];
  const claveDe = (etiqueta: string) =>
    etiqueta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "columna";

  const añadir = () => {
    const etiqueta = `Columna ${borrador.length + 1}`;
    let clave = claveDe(etiqueta);
    let n = 2;
    while (borrador.some((c) => c.clave === clave)) clave = `${claveDe(etiqueta)}_${n++}`;
    setBorrador([...borrador, { clave, etiqueta, tipo: "texto", obligatorio: false, opciones: [] }]);
  };

  const guardarTodo = () =>
    guardar.mutate(
      {
        libro: libroId,
        columnas: borrador.map((c, i) => ({
          id: c.id,
          clave: c.clave,
          etiqueta: c.etiqueta,
          tipo: c.tipo,
          obligatorio: c.obligatorio,
          opciones: c.opciones ?? [],
          posterior_a: c.posterior_a ?? null,
          orden: i + 1,
        })),
      },
      { onSuccess: onGuardado },
    );

  const cambiado = JSON.stringify(borrador) !== JSON.stringify(columnas);

  return (
    <div className="ds-columnas-edit">
      {!editable && <p className="tb-prose tb-prose--aside">Las columnas las cambia la gente de la oficina.</p>}
      {editable && (
        <div className="ds-grilla__acciones">
          <button type="button" className="button-secondary" onClick={añadir}>
            <Icon name="plus" size={14} /> Añadir columna
          </button>
          <SaveState pending={guardar.isPending} error={guardar.error} success={guardar.isSuccess} idle={cambiado ? "Sin guardar" : undefined} />
          <button type="button" className="button-primary" disabled={!cambiado || guardar.isPending} onClick={guardarTodo}>
            Guardar columnas
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Columna</th>
            <th>Clave</th>
            <th>Tipo</th>
            <th>Obligatoria</th>
            <th>Opciones de la lista</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {borrador.map((c, i) => (
            <tr key={c.id ?? c.clave}>
              <td>
                <input
                  value={c.etiqueta}
                  disabled={!editable}
                  aria-label={`Nombre de la columna ${i + 1}`}
                  onChange={(e) => setBorrador(borrador.map((x, k) => (k === i ? { ...x, etiqueta: e.target.value } : x)))}
                />
              </td>
              <td>
                {/* La clave de una columna existente no se toca: sus datos viven bajo ella. */}
                {c.id ? (
                  <code>{c.clave}</code>
                ) : (
                  <input value={c.clave} aria-label={`Clave de la columna ${i + 1}`} onChange={(e) => setBorrador(borrador.map((x, k) => (k === i ? { ...x, clave: claveDe(e.target.value) } : x)))} />
                )}
              </td>
              <td>
                <select
                  value={c.tipo}
                  disabled={!editable || Boolean(c.id && (c as DsColumna).solo_lectura)}
                  aria-label={`Tipo de la columna ${i + 1}`}
                  onChange={(e) => setBorrador(borrador.map((x, k) => (k === i ? { ...x, tipo: e.target.value as PcTipo } : x)))}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_TIPO[t]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={c.obligatorio}
                  disabled={!editable}
                  aria-label={`¿Es obligatoria la columna ${i + 1}?`}
                  onChange={(e) => setBorrador(borrador.map((x, k) => (k === i ? { ...x, obligatorio: e.target.checked } : x)))}
                />
              </td>
              <td>
                {c.tipo === "lista" ? (
                  <input
                    value={(c.opciones ?? []).join(", ")}
                    disabled={!editable}
                    placeholder="Opción A, Opción B"
                    aria-label={`Opciones de la columna ${i + 1}`}
                    onChange={(e) => setBorrador(borrador.map((x, k) => (k === i ? { ...x, opciones: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)))}
                  />
                ) : (
                  <span className="ds-muted">—</span>
                )}
              </td>
              <td>
                {editable && !c.id && (
                  <button type="button" className="oda-link-button" data-tone="danger" onClick={() => setBorrador(borrador.filter((_, k) => k !== i))}>
                    Quitar
                  </button>
                )}
                {editable && c.id && (
                  <ConfirmButton label="Quitar" confirmLabel={`Quitar «${c.etiqueta}» y sus valores`} onConfirm={() => setBorrador(borrador.filter((_, k) => k !== i))} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tb-prose tb-prose--aside">
        Al quitar una columna se limpian sus valores y las conexiones que la usaban; al cambiar la estructura de un libro
        listo, vuelve a borrador.
      </p>
    </div>
  );
}

/* --- Responde a ---------------------------------------------------------------------------- */

function PanelRespuesta({ oficina, libroId, columnas, editable }: { oficina: string; libroId: string; columnas: DsColumna[]; editable: boolean }) {
  const respuestas = useRespuestas(oficina);
  const indicadores = useIndicadores();
  const guardar = useGuardarRespuesta(oficina);
  const quitar = useQuitarRespuesta(oficina);

  const mias = (respuestas.data ?? []).filter((r) => r.libro_id === libroId);
  const libres = (indicadores.data ?? []).filter((i) => !mias.some((r) => r.indicador_id === i.id));
  const [indicador, setIndicador] = useState("");
  const propuesto = useMemo(() => (indicador ? autoMap(columnas) : {}), [indicador, columnas]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  useEffect(() => setMapa(propuesto), [propuesto, indicador]);

  const candidatos = (slot: (typeof SLOTS)[number]) =>
    slot.clave === "valor" ? columnas.filter((c) => c.tipo === "numero" || c.tipo === "porcentaje") : columnas.filter((c) => c.tipo !== "numero" && c.tipo !== "porcentaje");

  return (
    <div className="oda-stack">
      <Panel
        title="Responde a un indicador"
        description="La conexión dice qué columna del libro da cada parte de la respuesta. El indicador manda: el valor sale de una columna de número o porcentaje."
        actions={<SaveState pending={guardar.isPending || quitar.isPending} error={guardar.error ?? quitar.error} success={guardar.isSuccess} />}
      >
        {mias.length === 0 ? (
          <p className="tb-prose">Este libro todavía no responde a ningún indicador.</p>
        ) : (
          <ul className="ds-conexiones">
            {mias.map((r) => {
              const ind = (indicadores.data ?? []).find((i) => i.id === r.indicador_id);
              const cob = coberturaDelMapa(r.mapa);
              const faltan = faltanDelMapa(r.mapa);
              return (
                <li key={r.id}>
                  <div className="ds-conexiones__main">
                    <strong>
                      ODS {ind?.ods} · {ind?.nombre ?? r.indicador_id}
                    </strong>
                    <small>{ind?.descripcion}</small>
                    <dl>
                      {SLOTS.filter((s) => r.mapa[s.clave]).map((s) => (
                        <div key={s.clave}>
                          <dt>{s.etiqueta}</dt>
                          <dd>{columnas.find((c) => c.clave === r.mapa[s.clave])?.etiqueta ?? r.mapa[s.clave]}</dd>
                        </div>
                      ))}
                    </dl>
                    <span className="ds-conexiones__cobertura">
                      {cob.conectados}/{cob.total} slots
                      {faltan.length > 0 && <em> · falta {faltan.join(", ")}</em>}
                    </span>
                  </div>
                  {editable && (
                    <ConfirmButton
                      label="Desconectar"
                      confirmLabel={`Desconectar de ${ind?.nombre ?? "el indicador"}`}
                      onConfirm={() => quitar.mutate({ libro: libroId, indicador: r.indicador_id })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {editable && libres.length > 0 && columnas.length > 0 && (
        <Panel title="Conectar otro indicador" description="Se propone el mapa con solo ver las columnas; se ajusta si hace falta.">
          <div className="oda-form-grid">
            <label className="admin-field">
              <span>Indicador</span>
              <select
                value={indicador}
                onChange={(e) => setIndicador(e.target.value)}
              >
                <option value="">Elija un indicador…</option>
                {libres.map((i) => (
                  <option key={i.id} value={i.id}>
                    ODS {i.ods} · {i.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {indicador && (
            <>
              <ul className="ds-slots">
                {SLOTS.map((s) => (
                  <li key={s.clave}>
                    <label className="admin-field">
                      <span>
                        {s.etiqueta}
                        {s.obligatorio && <b title="Obligatorio"> *</b>}
                        <small>{s.pista}</small>
                      </span>
                      <select
                        value={mapa[s.clave] ?? ""}
                        onChange={(e) => setMapa({ ...mapa, [s.clave]: e.target.value })}
                      >
                        <option value="">—</option>
                        {candidatos(s).map((c) => (
                          <option key={c.clave} value={c.clave}>
                            {c.etiqueta}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              {faltanDelMapa(mapa).length > 0 ? (
                <p className="oda-banner" role="note">
                  <Icon name="alert" size={16} /> Falta {faltanDelMapa(mapa).join(", ")}.
                </p>
              ) : (
                <button
                  type="button"
                  className="button-primary"
                  disabled={guardar.isPending}
                  onClick={() => guardar.mutate({ libro: libroId, indicador, mapa }, { onSuccess: () => setIndicador("") })}
                >
                  Conectar el libro
                </button>
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

