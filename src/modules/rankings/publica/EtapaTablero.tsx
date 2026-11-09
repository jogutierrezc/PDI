/* Etapa 2 de Pilo Publica: el tablero. Cada cifra del libro dice qué es y de dónde sale. */

import { useMemo, useState } from "react";
import type { RespuestaDescribir, RespuestaLibro } from "./api";
import { motivoSinPilo } from "./contexto";
import type { EtapaProps } from "./contexto";
import { siguientePos, useBloques, useBorrarBloque, useCifras, useEditarCifra, useGuardarBloque } from "./datos";
import { agruparPorSerie, componentesDe, etiquetaKind, explicacionDe, fuenteDe, sinExplicar, unidadNorm, unidadTexto } from "./explicar";
import { ExtractoFuente } from "./ExtractoFuente";
import { formato } from "./tipos";
import type { CifraPP } from "./tipos";
import { BotonPilo, Campo, ErrorAviso, Tarjeta, Vacio } from "./ui";

const MAX_CLAVE = 12;
const GRUPOS_POR_PAGINA = 30;

const valorTexto = (c: CifraPP): string => (c.value === null ? "—" : `${formato(c.value, "es")}${c.unit.trim() === "%" ? " %" : c.unit.trim() ? ` ${c.unit.trim()}` : ""}`);

function Dato({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

/** De dónde sale una cifra, con todo lo que se sepa. */
function Procedencia({ c, libro }: { c: CifraPP; libro: CifraPP[] }) {
  const f = fuenteDe(c);
  const partes = componentesDe(c, libro);
  const formula = c.formula || f.formula;
  return (
    <dl className="pp-prov">
      <Dato k="Clave" v={c.key} />
      <Dato k="Tipo de fuente" v={f.kind ? etiquetaKind(f.kind) : ""} />
      <Dato k="Tabla" v={f.tabla} />
      <Dato k="Oficina" v={f.oficina} />
      <Dato k="Columna" v={f.columna} />
      <Dato k="Desglose" v={f.desglose} />
      <Dato k="Fila" v={f.fila} />
      <Dato k="Periodo" v={f.periodo} />
      <Dato k="Indicador" v={[f.indicador_id, f.indicador].filter(Boolean).join(" · ") || c.indicator || ""} />
      <Dato k="Definición" v={f.definicion} />
      <Dato k="Cita" v={f.cita} />
      {f.url && (
        <>
          <dt>Enlace</dt>
          <dd>
            {/^https:\/\//i.test(f.url) ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                {f.url}
              </a>
            ) : (
              f.url
            )}
          </dd>
        </>
      )}
      {c.derived && (
        <>
          <dt>Fórmula</dt>
          <dd>
            <code>{formula || "No quedó registrada."}</code>
            {partes.length > 0 && (
              <ul className="pp-prov__partes">
                {partes.map((x) => (
                  <li key={x.key}>
                    {x.label}
                    {x.year ? ` (${x.year})` : ""}: <b>{valorTexto(x)}</b>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </>
      )}
      {f.descrito && <Dato k="Explicación escrita por" v={f.descrito === "persona" ? "una persona" : f.descrito === "pilo" ? "Pilo" : "el sistema"} />}
    </dl>
  );
}

function FormEditar({ c, onCerrar }: { c: CifraPP; onCerrar: () => void }) {
  const f = fuenteDe(c);
  const editar = useEditarCifra();
  const [v, setV] = useState({ label: c.label, label_en: c.label_en, descripcion: f.descripcion, descripcion_en: f.descripcion_en });
  const campo = (k: keyof typeof v) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const guardar = async () => {
    try {
      await editar.mutateAsync({ cifra: c, ...v });
      onCerrar();
    } catch {
      /* el error se muestra abajo; lo escrito queda */
    }
  };
  return (
    <div className="pp-editc">
      <div className="pp-dos">
        <Campo etiqueta="Nombre en español" valor={v.label} lang="es" onGuardar={campo("label")} />
        <Campo etiqueta="Nombre en inglés" valor={v.label_en} lang="en" onGuardar={campo("label_en")} />
      </div>
      <div className="pp-dos">
        <Campo etiqueta="Qué es (español)" valor={v.descripcion} lang="es" multilinea filas={4} ayuda="Qué mide, en qué unidad y qué población cubre." onGuardar={campo("descripcion")} />
        <Campo etiqueta="Qué es (inglés)" valor={v.descripcion_en} lang="en" multilinea filas={4} onGuardar={campo("descripcion_en")} />
      </div>
      <p className="pp-nota">Lo que escribas queda marcado como escrito por una persona: Pilo no lo vuelve a pisar. El valor y la procedencia no se tocan.</p>
      {editar.error && <ErrorAviso error={editar.error} />}
      <div className="pp-acciones">
        <button type="button" className="pp-btn pp-btn--pilo" disabled={editar.isPending} onClick={() => void guardar()}>
          {editar.isPending ? "Guardando…" : "Guardar explicación"}
        </button>
        <button type="button" className="pp-btn" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FilaCifra({ c, libro, activa, onEstrella }: { c: CifraPP; libro: CifraPP[]; activa: boolean; onEstrella: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const ex = explicacionDe(c);
  const f = fuenteDe(c);
  const sin = c.value === null;
  return (
    <li className="pp-cf">
      <div className="pp-cf__top">
        <button type="button" className="pp-star" aria-pressed={activa} disabled={sin && !activa} onClick={onEstrella} aria-label={`${activa ? "Quitar de" : "Destacar en"} las cifras clave: ${c.label}`}>
          ★
        </button>
        <div className="pp-cf__v">
          <b>{valorTexto(c)}</b>
          <span>{c.year ?? "sin año"}</span>
        </div>
        <div className="pp-cf__t">
          <strong>{c.label}</strong>
          {c.label_en && <small lang="en">{c.label_en}</small>}
        </div>
        <span className="pp-chips">
          <span className={`pp-pill ${sin ? "pp-pill--mal" : c.derived ? "pp-pill--info" : "pp-pill--ok"}`}>{sin ? "Sin valor" : c.derived ? "Calculada" : "Verificada"}</span>
          {f.kind && <span className="pp-pill">{etiquetaKind(f.kind)}</span>}
          {f.serie && <span className="pp-pill" title="Misma medida a través de los años">serie</span>}
        </span>
      </div>
      <div className="pp-cf__q">
        <span className="pp-cf__qt">Qué es</span>
        {ex.origen === "ninguna" ? (
          <p className="pp-warn">Sin explicación todavía. Pídesela a Pilo o escríbela a mano: sin saber qué es, no se puede armar un gráfico con seguridad.</p>
        ) : (
          <p>
            {ex.texto}
            {ex.origen === "armada" && <small className="pp-nota"> (resumen armado con su procedencia)</small>}
          </p>
        )}
      </div>
      <div className="pp-cf__a">
        <button type="button" className="pp-btn pp-btn--sm" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
          {abierta ? "Ocultar de dónde sale" : "De dónde sale"}
        </button>
        <button type="button" className="pp-btn pp-btn--sm" aria-expanded={editando} onClick={() => setEditando((v) => !v)}>
          {editando ? "Cerrar edición" : "Editar nombre y explicación"}
        </button>
      </div>
      {abierta && (
        <>
          <Procedencia c={c} libro={libro} />
          <ExtractoFuente cifra={c} />
        </>
      )}
      {editando && <FormEditar c={c} onCerrar={() => setEditando(false)} />}
    </li>
  );
}

export function EtapaTablero(p: EtapaProps) {
  const cifras = useCifras(p.informe.id);
  const bloques = useBloques(p.informe.id);
  const guardar = useGuardarBloque();
  const borrar = useBorrarBloque();
  const [avisos, setAvisos] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rehacer, setRehacer] = useState(false);
  const [f, setF] = useState({ q: "", unidad: "", anio: "", kind: "", sin: false });
  const [paginas, setPaginas] = useState(1);

  const kpis = useMemo(() => (bloques.data ?? []).filter((b) => b.kind === "kpi"), [bloques.data]);
  const activos = kpis.filter((b) => b.enabled);
  const libro = useMemo(() => cifras.data ?? [], [cifras.data]);

  const unidades = useMemo(() => Array.from(new Map(libro.map((c) => [unidadNorm(c.unit), c.unit.trim()])).entries()).sort((a, b) => a[0].localeCompare(b[0])), [libro]);
  const anios = useMemo(() => Array.from(new Set(libro.map((c) => c.year).filter((y): y is number => typeof y === "number"))).sort((a, b) => b - a), [libro]);
  const kinds = useMemo(() => Array.from(new Set(libro.map((c) => fuenteDe(c).kind).filter(Boolean))).sort(), [libro]);
  const sinExp = useMemo(() => libro.filter(sinExplicar).length, [libro]);

  const filtradas = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return libro.filter((c) => {
      if (f.unidad && unidadNorm(c.unit) !== f.unidad) return false;
      if (f.anio && String(c.year ?? "") !== f.anio) return false;
      if (f.kind && fuenteDe(c).kind !== f.kind) return false;
      if (f.sin && !sinExplicar(c)) return false;
      if (q) {
        const s = fuenteDe(c);
        const hay = `${c.label} ${c.label_en} ${c.key} ${s.descripcion} ${s.tabla} ${s.oficina} ${s.columna} ${s.indicador}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [libro, f]);
  const grupos = useMemo(() => agruparPorSerie(filtradas), [filtradas]);

  const construir = async () => {
    const r = await p.corrida.correr<RespuestaLibro>("Pilo construye el libro de cifras", "libro");
    if (r) {
      setAvisos(r.avisos ?? []);
      setInfo(`El libro tiene ${r.cifras} cifras (${r.derivadas} calculadas por el sistema).`);
    }
  };
  const describir = async () => {
    setInfo(null);
    const r = await p.corrida.correr<RespuestaDescribir>("Pilo explica las cifras", "describir", rehacer ? { rehacer: true } : {});
    if (r) setInfo(`Pilo explicó ${r.descritas ?? 0} cifras.${r.quedan ? ` Quedan ${r.quedan} sin explicación: pulsa de nuevo para continuar.` : " Todas tienen explicación."}`);
  };

  if (cifras.isPending || bloques.isPending) return <p role="status">Cargando el tablero…</p>;
  if (cifras.error || bloques.error) return <ErrorAviso error={cifras.error ?? bloques.error} onReintentar={() => { void cifras.refetch(); void bloques.refetch(); }} />;

  const bloqueDe = (key: string) => kpis.find((b) => b.spec.cifra === key);
  const destacar = (key: string) => {
    setAviso(null);
    const b = bloqueDe(key);
    if (b?.enabled) return guardar.mutate({ informe_id: p.informe.id, id: b.id, patch: { enabled: false } });
    if (activos.length >= MAX_CLAVE) return setAviso(`Máximo ${MAX_CLAVE} cifras clave. Quita una para destacar otra.`);
    if (b) return guardar.mutate({ informe_id: p.informe.id, id: b.id, patch: { enabled: true } });
    guardar.mutate({ informe_id: p.informe.id, patch: { kind: "kpi", sec: "kpis", pos: siguientePos(bloques.data), spec: { cifra: key } } });
  };

  const hayFiltro = Boolean(f.q || f.unidad || f.anio || f.kind || f.sin);
  const visibles = grupos.slice(0, paginas * GRUPOS_POR_PAGINA);
  const motivo = motivoSinPilo(p.pilo, p.corrida);

  return (
    <div className="pp-stack">
      <Tarjeta titulo="Cifras clave del informe" cuenta={`${activos.length}/${MAX_CLAVE}`}>
        <div className="pp-kpis-adm">
          {activos.length === 0 && <p className="pp-nota">Aún no hay cifras destacadas. Marca hasta {MAX_CLAVE} con la estrella en el libro de abajo, leyendo antes qué es cada una.</p>}
          {activos.map((b) => {
            const c = libro.find((x) => x.key === b.spec.cifra);
            const ex = c ? explicacionDe(c) : null;
            return (
              <div className="pp-kt" key={b.id}>
                <b>{c && c.value !== null ? valorTexto(c) : "—"}</b>
                <span>{c?.label ?? `Falta la cifra ${b.spec.cifra}`}</span>
                {c?.year ? <small className="pp-nota">{c.year}</small> : null}
                {ex?.texto && <small className="pp-kt__ex">{ex.texto.length > 160 ? `${ex.texto.slice(0, 157)}…` : ex.texto}</small>}
                {!c || c.value === null ? <small className="pp-warn">La cifra no está en el libro o no tiene valor.</small> : null}
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => borrar.mutate(b.id)} aria-label={`Quitar la cifra clave ${c?.label ?? b.spec.cifra}`}>
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
        {aviso && (
          <p className="pp-warn pp-pad" role="status">
            {aviso}
          </p>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Libro de cifras"
        cuenta={`${libro.length}`}
        acciones={
          <>
            <BotonPilo pilo={p.pilo} corrida={p.corrida} chico onClick={() => void construir()}>
              Construir libro de cifras
            </BotonPilo>
            <BotonPilo pilo={p.pilo} corrida={p.corrida} chico onClick={() => void describir()}>
              Pilo explica las cifras{sinExp ? ` (${sinExp})` : ""}
            </BotonPilo>
          </>
        }
      >
        <div className="pp-pad">
          <p className="pp-nota">
            {libro.length === 0
              ? "Todavía no hay cifras."
              : sinExp === 0
                ? "Todas las cifras tienen explicación."
                : `${sinExp} de ${libro.length} cifras no tienen explicación («Qué es»). Pilo las puede explicar con la procedencia que ya tienen; lo que escribas tú a mano no se pisa.`}
          </p>
          <label className="pp-check">
            <input type="checkbox" checked={rehacer} onChange={(e) => setRehacer(e.target.checked)} /> Volver a explicar también las que Pilo ya explicó
          </label>
          {motivo && !p.corrida.progreso.corriendo && <small className="pp-nota"> {motivo}</small>}
        </div>
        {(info || avisos.length > 0) && (
          <div className="pp-pad" role="status">
            {info && <p className="pp-nota">{info}</p>}
            {avisos.length > 0 && (
              <ul className="pp-warn-lista">
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {libro.length === 0 ? (
          <Vacio titulo="El libro de cifras está vacío">Toda cifra del informe sale de este libro; Pilo nunca teclea una. Pulsa «Construir libro de cifras» para que se arme desde las fuentes marcadas.</Vacio>
        ) : (
          <>
            <div className="pp-filtros" role="search" aria-label="Filtrar las cifras">
              <div className="pp-fld">
                <label htmlFor="pp-fq">Buscar</label>
                <input id="pp-fq" type="search" value={f.q} placeholder="Nombre, tabla, oficina, explicación…" onChange={(e) => { setF({ ...f, q: e.target.value }); setPaginas(1); }} />
              </div>
              <div className="pp-fld">
                <label htmlFor="pp-fu">Unidad</label>
                <select id="pp-fu" value={f.unidad} onChange={(e) => { setF({ ...f, unidad: e.target.value }); setPaginas(1); }}>
                  <option value="">Todas</option>
                  {unidades.map(([k, t]) => (
                    <option key={k} value={k}>
                      {unidadTexto(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pp-fld">
                <label htmlFor="pp-fa">Año</label>
                <select id="pp-fa" value={f.anio} onChange={(e) => { setF({ ...f, anio: e.target.value }); setPaginas(1); }}>
                  <option value="">Todos</option>
                  {anios.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pp-fld">
                <label htmlFor="pp-fk">Fuente</label>
                <select id="pp-fk" value={f.kind} onChange={(e) => { setF({ ...f, kind: e.target.value }); setPaginas(1); }}>
                  <option value="">Todas</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {etiquetaKind(k)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="pp-check pp-check--abajo">
                <input type="checkbox" checked={f.sin} onChange={(e) => { setF({ ...f, sin: e.target.checked }); setPaginas(1); }} /> Solo sin explicación
              </label>
              {hayFiltro && (
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => setF({ q: "", unidad: "", anio: "", kind: "", sin: false })}>
                  Quitar filtros
                </button>
              )}
            </div>
            <p className="pp-nota pp-pad" role="status">
              {filtradas.length} {filtradas.length === 1 ? "cifra" : "cifras"} en {grupos.length} {grupos.length === 1 ? "medida" : "medidas"}. Las cifras de una misma medida a través de los años van juntas.
            </p>
            {grupos.length === 0 ? (
              <div className="pp-pad">
                <Vacio titulo="Ninguna cifra coincide">Cambia o quita los filtros.</Vacio>
              </div>
            ) : (
              <div className="pp-grupos">
                {visibles.map((g) => (
                  <section className="pp-grupo" key={g.serie} aria-label={g.nombre}>
                    {g.cifras.length > 1 && (
                      <header className="pp-grupo__h">
                        <h4>{g.nombre}</h4>
                        <span className="pp-nota">
                          {g.cifras.length} cifras{g.anios.length ? ` · ${g.anios[0]}${g.anios.length > 1 ? `–${g.anios[g.anios.length - 1]}` : ""}` : ""} · {g.unidades.map((u) => unidadTexto(u)).join(" / ")}
                        </span>
                      </header>
                    )}
                    <ul className="pp-cfs">
                      {g.cifras.map((c) => (
                        <FilaCifra key={c.id} c={c} libro={libro} activa={Boolean(bloqueDe(c.key)?.enabled)} onEstrella={() => destacar(c.key)} />
                      ))}
                    </ul>
                  </section>
                ))}
                {visibles.length < grupos.length && (
                  <div className="pp-pad">
                    <button type="button" className="pp-btn" onClick={() => setPaginas((n) => n + 1)}>
                      Mostrar más medidas ({grupos.length - visibles.length} restantes)
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Tarjeta>
      {(guardar.error || borrar.error) && <ErrorAviso error={guardar.error ?? borrar.error} />}
      <div className="pp-acciones">
        <button type="button" className="button-secondary" onClick={() => p.ir(0)}>
          ← Fuentes
        </button>
        <button type="button" className="button-primary" onClick={() => p.ir(2)}>
          Continuar a gráficos →
        </button>
      </div>
    </div>
  );
}

