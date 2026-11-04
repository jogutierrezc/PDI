/* =============================================================================
   Convenios · detalle a pantalla completa. Cabecera con código, institución y
   estado; pestañas Resumen, Documentos, Firma e Historial; y una columna lateral
   con el siguiente paso, las fechas y la carpeta. La ruta del navegador es
   ?convenio=<id> sobre la sección, así que «atrás» vuelve al registro.

   Todo cambio relevante deja una fila en el historial (conv_historial). Los
   documentos son solo el esqueleto de la etapa de gestión: la carga llega después.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useNombres } from "../datos";
import { Pildora, useAviso } from "./comunes";
import { abrirArchivoSubido, useActualizarConvenio, useArchivosConvenio, useCrearCarpetaUdrive, useHistorialConvenio } from "./datos";
import type { CambiosConvenio, AnotacionHistorial } from "./datos";
import { diasFaltantes, ENLACE_VALIDO, ESPACIOS_DOCUMENTOS, etapaDe, fechaLarga, PASOS, proximoPaso, terminaTexto, TIPOS_RENOVACION, vigenciaDe } from "./logica";
import type { Convenio } from "./logica";

type Pestana = "resumen" | "docs" | "firma" | "hist";
const PESTANAS: { id: Pestana; rotulo: string }[] = [
  { id: "resumen", rotulo: "Resumen" },
  { id: "docs", rotulo: "Documentos" },
  { id: "firma", rotulo: "Firma" },
  { id: "hist", rotulo: "Historial" },
];

const CARPETA_TEXTO = { udrive: "En UDrive", enlace: "Con enlace", sin: "Sin carpeta" } as const;

export function Detalle({ c, hoy, crea, abrirRenovacion, avisoInicial = "", onVolver, onAvisar, onIniciarRenovacion }: { c: Convenio; hoy: string; crea: boolean; abrirRenovacion: boolean; avisoInicial?: string; onVolver: () => void; onAvisar: (c: Convenio) => void; onIniciarRenovacion: (c: Convenio) => void }) {
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [renovando, setRenovando] = useState(abrirRenovacion);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, decir] = useAviso();
  const [error, setError] = useState(avisoInicial);
  const actualizar = useActualizarConvenio();
  const volver = useRef<HTMLButtonElement>(null);

  const vigencia = vigenciaDe(c, hoy);
  const dias = diasFaltantes(c, hoy);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    volver.current?.focus();
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onVolver();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onVolver]);

  const aplicar = (cambios: CambiosConvenio, notas: AnotacionHistorial[], mensaje: string, ir?: Pestana) => {
    setError("");
    actualizar.mutate(
      { id: c.id, cambios, notas },
      {
        onSuccess: () => {
          decir(mensaje);
          if (ir) setPestana(ir);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const alTeclearPestanas = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const sig = PESTANAS[(i + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length].id;
    setPestana(sig);
    window.setTimeout(() => document.getElementById(`conv-d-${sig}`)?.focus(), 0);
  };

  return (
    <section className="conv-pantalla" aria-label={`Detalle del convenio ${c.codigo}`}>
      <div className="conv-pantalla-in">
        <header className="conv-ph">
          <button ref={volver} type="button" className="conv-btn" onClick={onVolver}>
            <Icon name="arrow-left" size={16} />
            Volver al registro
          </button>
          <div className="conv-ph-titulo">
            <div className="conv-mono conv-sub">
              {c.codigo} · {c.documento} · {c.naturaleza}
            </div>
            <h1>{c.institucion}</h1>
          </div>
          <span className="conv-grow" />
          <Pildora vigencia={vigencia} />
        </header>

        <div className="conv-tabs" role="tablist" aria-label="Secciones del convenio" onKeyDown={alTeclearPestanas}>
          {PESTANAS.map((p) => (
            <button key={p.id} id={`conv-d-${p.id}`} type="button" role="tab" aria-selected={pestana === p.id} aria-controls="conv-d-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => setPestana(p.id)}>
              {p.rotulo}
            </button>
          ))}
        </div>

        <div className="conv-cuerpo">
          <main id="conv-d-panel" role="tabpanel" aria-labelledby={`conv-d-${pestana}`} className="conv-main">
            <p className="conv-aviso-linea" role="status" aria-live="polite">
              {aviso}
            </p>
            {error ? (
              <p className="conv-error" role="alert">
                {error}
              </p>
            ) : null}
            {pestana === "resumen" ? (
              <Resumen c={c} crea={crea} renovando={renovando} setRenovando={setRenovando} confirmando={confirmando} setConfirmando={setConfirmando} ocupado={actualizar.isPending} hoy={hoy} aplicar={aplicar} onAvisar={onAvisar} onIniciarRenovacion={onIniciarRenovacion} />
            ) : pestana === "docs" ? (
              <Documentos c={c} crea={crea} ocupado={actualizar.isPending} aplicar={aplicar} />
            ) : pestana === "firma" ? (
              <Firma c={c} crea={crea} ocupado={actualizar.isPending} hoy={hoy} aplicar={aplicar} />
            ) : (
              <Historial id={c.id} />
            )}
          </main>

          <aside className="conv-lado-d" aria-label="Estado del convenio">
            <div className="conv-panel conv-bloque">
              <h2>{proximoPaso(c, hoy)}</h2>
              <dl className="conv-dat conv-dat--lado">
                <dt>País</dt>
                <dd>{c.pais}</dd>
                <dt>Firma</dt>
                <dd className="conv-mono">{fechaLarga(c.fecha_firma)}</dd>
                <dt>Terminación</dt>
                <dd className="conv-mono">{terminaTexto(c)}</dd>
                <dt>Días</dt>
                <dd className="conv-mono">{dias == null ? "—" : dias}</dd>
                <dt>Etapa</dt>
                <dd>{etapaDe(c)}</dd>
                <dt>Carpeta digital</dt>
                <dd>{CARPETA_TEXTO[c.carpeta_estado]}</dd>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

type Aplicar = (cambios: CambiosConvenio, notas: AnotacionHistorial[], mensaje: string, ir?: Pestana) => void;

/* ---------- Resumen --------------------------------------------------------- */

function Resumen({
  c,
  crea,
  renovando,
  setRenovando,
  confirmando,
  setConfirmando,
  ocupado,
  hoy,
  aplicar,
  onAvisar,
  onIniciarRenovacion,
}: {
  c: Convenio;
  crea: boolean;
  renovando: boolean;
  setRenovando: (v: boolean) => void;
  confirmando: boolean;
  setConfirmando: (v: boolean) => void;
  ocupado: boolean;
  hoy: string;
  aplicar: Aplicar;
  onAvisar: (c: Convenio) => void;
  onIniciarRenovacion: (c: Convenio) => void;
}) {
  const [tipo, setTipo] = useState<string>(TIPOS_RENOVACION[0]);
  const [fecha, setFecha] = useState("");
  const [ref, setRef] = useState("");
  const [falta, setFalta] = useState("");

  const renovar = () => {
    if (!fecha || fecha <= hoy) return setFalta("La nueva fecha debe ser posterior a hoy.");
    setFalta("");
    aplicar(
      { fecha_terminacion: fecha, indefinido: false, pasos: 5, cerrado: false, cerrado_en: null },
      [{ texto: `${tipo}: termina el ${fechaLarga(fecha)}.${ref.trim() ? ` ${ref.trim()}` : ""}` }],
      "Renovación registrada en el historial.",
      "hist",
    );
    setRenovando(false);
  };

  return (
    <>
      {crea ? (
        <div className="conv-acciones">
          <button type="button" className="conv-btn conv-btn--pri" onClick={() => setRenovando(!renovando)} aria-expanded={renovando}>
            <Icon name="undo" size={16} />
            Registrar renovación
          </button>
          <button type="button" className="conv-btn" onClick={() => onIniciarRenovacion(c)}>
            <Icon name="document" size={16} />
            Iniciar renovación
          </button>
          <button type="button" className="conv-btn" onClick={() => onAvisar(c)}>
            <Icon name="mail" size={16} />
            Avisar a la contraparte
          </button>
          {!c.cerrado ? (
            confirmando ? (
              <span className="conv-confirma" role="group" aria-label="Confirmar el cierre">
                ¿Cerrarlo antes de la fecha?
                <button
                  type="button"
                  className="conv-btn conv-btn--sm conv-btn--peligro"
                  disabled={ocupado}
                  onClick={() => {
                    setConfirmando(false);
                    aplicar({ cerrado: true, cerrado_en: hoy }, [{ texto: "Convenio terminado antes de la fecha." }], "Convenio terminado.", "hist");
                  }}
                >
                  Sí, terminarlo
                </button>
                <button type="button" className="conv-btn conv-btn--sm" onClick={() => setConfirmando(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className="conv-btn" onClick={() => setConfirmando(true)}>
                Terminar convenio
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {renovando && crea ? (
        <div className="conv-inl">
          <div className="conv-g2">
            <label className="it-campo" htmlFor="rn-tipo">
              <span>Tipo de renovación</span>
              <select id="rn-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_RENOVACION.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="it-campo" htmlFor="rn-fecha">
              <span>Nueva fecha de terminación</span>
              <input id="rn-fecha" type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
          </div>
          <label className="it-campo" htmlFor="rn-ref">
            <span>Referencia</span>
            <input id="rn-ref" type="text" value={ref} maxLength={200} placeholder="Ej. Otrosí 2, firmado el 12 de octubre" onChange={(e) => setRef(e.target.value)} />
          </label>
          {falta ? (
            <p className="conv-error" role="alert">
              {falta}
            </p>
          ) : null}
          <div>
            <button type="button" className="conv-btn conv-btn--pri" disabled={ocupado} onClick={renovar}>
              Aplicar renovación
            </button>
          </div>
        </div>
      ) : null}

      <section className="conv-panel conv-bloque">
        <dl className="conv-dat">
          <dt>Tipo</dt>
          <dd>
            {c.tipo}
            {c.tipo_excel && c.tipo_excel !== c.tipo ? <span className="conv-sub"> (en el Excel: {c.tipo_excel})</span> : null}
          </dd>
          <dt>Idioma de la contraparte</dt>
          <dd>
            {crea ? (
              <select
                aria-label="Idioma de la contraparte"
                value={c.idioma}
                disabled={ocupado}
                onChange={(e) => {
                  const idioma = e.target.value === "en" ? "en" : "es";
                  aplicar({ idioma }, [{ texto: `Idioma de la contraparte: ${idioma === "en" ? "inglés" : "español"}.` }], "Idioma de la contraparte guardado.");
                }}
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </select>
            ) : (
              <>{c.idioma === "en" ? "Inglés" : "Español"}</>
            )}
            <span className="conv-sub"> Los avisos al contacto de la institución salen en este idioma.</span>
          </dd>
          <dt>Modalidad</dt>
          <dd>{c.modalidad || "Sin dato"}</dd>
          <dt>Renovación</dt>
          <dd>{c.renovacion || "Sin dato"}</dd>
          <dt>Campus</dt>
          <dd>{c.campus}</dd>
          <dt>Facultad</dt>
          <dd>{c.facultad || "Sin dato"}</dd>
          <dt>Programas</dt>
          <dd>{c.programas || "Sin dato"}</dd>
          <dt>Objeto</dt>
          <dd>{c.objeto || "Sin dato"}</dd>
          {c.observaciones ? (
            <>
              <dt>Observaciones</dt>
              <dd>{c.observaciones}</dd>
            </>
          ) : null}
        </dl>
      </section>
    </>
  );
}

/* ---------- Documentos ------------------------------------------------------- */

const tamanoLegible = (n: number | null) => (n == null ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Documentos({ c, crea, ocupado, aplicar }: { c: Convenio; crea: boolean; ocupado: boolean; aplicar: Aplicar }) {
  const [editando, setEditando] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [falta, setFalta] = useState("");
  const [fallo, setFallo] = useState("");
  const crear = useCrearCarpetaUdrive();
  const enUdrive = c.carpeta_estado === "udrive" && Boolean(c.drive_carpeta_id);
  const conEnlace = c.carpeta_estado === "enlace" && Boolean(c.carpeta_url) && ENLACE_VALIDO.test(c.carpeta_url ?? "");
  const archivos = useArchivosConvenio(enUdrive ? c.drive_carpeta_id : null);
  const rutaCarpeta = enUdrive ? `/admin/udrive?c=${c.drive_carpeta_id}` : "";

  const guardar = () => {
    const l = enlace.trim();
    if (!ENLACE_VALIDO.test(l)) return setFalta("Pegue un enlace que empiece por https://");
    setFalta("");
    setEditando(false);
    setEnlace("");
    aplicar({ carpeta_estado: "enlace", carpeta_url: l }, [{ texto: conEnlace ? "Se cambió el enlace de la carpeta digital." : "Se registró el enlace de la carpeta digital." }], "Enlace guardado.");
  };
  const crearEnUdrive = () => {
    setFallo("");
    crear.mutate(c.id, { onError: (e) => setFallo(e.message) });
  };
  const ruta = `Internacionalización › Convenios › ${c.pais} › ${c.codigo} · ${c.institucion}`;

  return (
    <>
      <section className="conv-panel conv-bloque">
        <h2>Carpeta digital</h2>
        {enUdrive ? (
          <>
            <p className="conv-sub">Los documentos viven en UDrive: {ruta}.</p>
            <div className="conv-acciones">
              <Link className="conv-btn conv-btn--pri" to={rutaCarpeta}>
                <Icon name="folder" size={16} />
                Abrir carpeta en UDrive
              </Link>
            </div>
          </>
        ) : conEnlace && !editando ? (
          <>
            <p className="conv-sub">Los documentos de este convenio viven en esta carpeta externa.</p>
            <div className="conv-acciones">
              <a className="conv-btn conv-btn--pri" href={c.carpeta_url as string} target="_blank" rel="noopener noreferrer">
                <Icon name="folder" size={16} />
                Abrir carpeta
              </a>
              {crea ? (
                <button type="button" className="conv-btn" onClick={() => setEditando(true)}>
                  Cambiar enlace
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="conv-sub">{editando ? "Pegue el enlace nuevo de la carpeta." : "Este convenio no tiene carpeta. Sin carpeta no se pueden guardar documentos."}</p>
            {crea ? (
              <>
                <div className="conv-acciones">
                  <button type="button" className="conv-btn conv-btn--pri" disabled={ocupado || crear.isPending} onClick={crearEnUdrive}>
                    <Icon name="folder" size={16} />
                    {crear.isPending ? "Creando…" : "Crear en UDrive"}
                  </button>
                  <span className="conv-sub">Se crea en {ruta}</span>
                </div>
                <div className="conv-enlace-fila">
                  <input type="text" value={enlace} placeholder="O pegue el enlace de una carpeta existente: https://…" aria-label="Enlace de la carpeta" onChange={(e) => setEnlace(e.target.value)} />
                  <button type="button" className="conv-btn" disabled={ocupado} onClick={guardar}>
                    Guardar enlace
                  </button>
                  {editando ? (
                    <button type="button" className="conv-btn" onClick={() => setEditando(false)}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
                {falta || fallo ? (
                  <p className="conv-error" role="alert">
                    {falta || fallo}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="conv-panel conv-docs">
        <div className="conv-bar">
          <h2>Documentos del convenio</h2>
          <span className="conv-sub">{enUdrive ? "La carga se hace en la carpeta de UDrive." : "Se activan al crear la carpeta en UDrive."}</span>
        </div>
        {enUdrive ? (
          <>
            {archivos.isPending ? (
              <p className="conv-sub conv-docs-nota" role="status">
                Leyendo la carpeta…
              </p>
            ) : archivos.error ? (
              <p className="conv-error conv-docs-nota" role="alert">
                {archivos.error.message}
              </p>
            ) : !archivos.data?.length ? (
              <p className="conv-sub conv-docs-nota">La carpeta todavía no tiene archivos.</p>
            ) : (
              <ul>
                {archivos.data.map((a) => (
                  <li key={a.id}>
                    <span className="conv-corto" title={a.nombre}>
                      {a.nombre}
                    </span>
                    <span className="conv-sub">
                      {tamanoLegible(a.tamano) || a.tipo} · {fechaLarga(a.updated_at)}
                    </span>
                    {a.tipo === "archivo" && a.ruta_storage ? (
                      <button type="button" className="conv-btn conv-btn--sm" onClick={() => void abrirArchivoSubido(a.ruta_storage as string).catch((e: Error) => setFallo(e.message))}>
                        Abrir
                      </button>
                    ) : (
                      <Link className="conv-btn conv-btn--sm" to={`/admin/udrive/${a.tipo}/${a.id}`}>
                        Abrir
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {fallo ? (
              <p className="conv-error conv-docs-nota" role="alert">
                {fallo}
              </p>
            ) : null}
          </>
        ) : null}
        <ul className="conv-espacios">
          {ESPACIOS_DOCUMENTOS.map((n) => (
            <li key={n}>
              <span>{n}</span>
              <span className="conv-sub">Espacio</span>
              {enUdrive && crea ? (
                <Link className="conv-btn conv-btn--sm" to={rutaCarpeta}>
                  Cargar
                </Link>
              ) : (
                <button type="button" className="conv-btn conv-btn--sm" disabled>
                  Cargar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ---------- Firma ------------------------------------------------------------ */

function Firma({ c, crea, ocupado, hoy, aplicar }: { c: Convenio; crea: boolean; ocupado: boolean; hoy: string; aplicar: Aplicar }) {
  const [firma, setFirma] = useState("");
  const [termina, setTermina] = useState("");
  const [indefinido, setIndefinido] = useState(false);
  const [falta, setFalta] = useState("");
  const cerrado = c.cerrado;
  const fechas = c.pasos_fechas ?? [];

  const marcar = () => {
    const i = c.pasos;
    const nuevas = Array.from({ length: 5 }, (_, k) => (k === i ? hoy : (fechas[k] ?? null)));
    if (i === 3) {
      if (!firma || (!indefinido && !termina)) return setFalta("Falta la fecha de firma o la de terminación.");
      if (!indefinido && termina <= firma) return setFalta("La terminación debe ser posterior a la firma.");
      setFalta("");
      aplicar(
        { pasos: 4, pasos_fechas: nuevas, fecha_firma: firma, fecha_terminacion: indefinido ? null : termina, indefinido },
        [{ texto: `Firma de la contraparte registrada el ${fechaLarga(firma)}.`, fecha: firma }],
        "Firma registrada.",
      );
      return;
    }
    aplicar({ pasos: i + 1, pasos_fechas: nuevas }, [{ texto: `${PASOS[i].nombre}: hecho.` }], "Paso registrado en el historial.");
  };

  const deshacer = () => {
    const i = c.pasos - 1;
    const nuevas = Array.from({ length: 5 }, (_, k) => (k === i ? null : (fechas[k] ?? null)));
    aplicar({ pasos: i, pasos_fechas: nuevas }, [{ texto: `Se deshizo: ${PASOS[i].nombre}.` }], "Paso deshecho.");
  };

  return (
    <section className="conv-panel conv-bloque">
      <h2>Ruta de firma</h2>
      <p className="conv-sub">Cada paso queda con fecha en el historial. La etapa del convenio sale de aquí.</p>
      <ol className="conv-ruta">
        {PASOS.map((p, i) => {
          const hecho = i < c.pasos;
          const sigue = i === c.pasos && !cerrado;
          return (
            <li key={p.nombre} className={hecho ? "is-hecho" : sigue ? "is-sigue" : undefined}>
              <span className="conv-punto" aria-hidden="true" />
              <div>
                <b>{p.nombre}</b>
                <span className="conv-sr-estado sr-only">{hecho ? " (hecho)" : sigue ? " (siguiente)" : ""}</span>
                <div className="conv-sub">
                  {p.responsable}
                  {hecho ? (fechas[i] ? ` · ${fechaLarga(fechas[i])}` : " · antes de la plataforma") : ""}
                </div>
                {sigue && crea && i === 3 ? (
                  <div className="conv-inl">
                    <div className="conv-g2">
                      <label className="it-campo" htmlFor="fr-fir">
                        <span>Fecha de firma</span>
                        <input id="fr-fir" type="date" value={firma} onChange={(e) => setFirma(e.target.value)} />
                      </label>
                      <label className="it-campo" htmlFor="fr-ter">
                        <span>Terminación</span>
                        <input id="fr-ter" type="date" value={termina} disabled={indefinido} onChange={(e) => setTermina(e.target.value)} />
                      </label>
                    </div>
                    <label className="conv-radio" htmlFor="fr-ind">
                      <input id="fr-ind" type="checkbox" checked={indefinido} onChange={(e) => setIndefinido(e.target.checked)} />
                      Indefinido
                    </label>
                    {falta ? (
                      <p className="conv-error" role="alert">
                        {falta}
                      </p>
                    ) : null}
                    <div>
                      <button type="button" className="conv-btn conv-btn--pri" disabled={ocupado} onClick={marcar}>
                        Registrar firma
                      </button>
                    </div>
                  </div>
                ) : sigue && crea ? (
                  <div className="conv-paso-acc">
                    <button type="button" className="conv-btn conv-btn--sm conv-btn--pri" disabled={ocupado} onClick={marcar}>
                      Marcar como hecho
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {cerrado ? <p className="conv-sub">El convenio se cerró antes de tiempo; la ruta queda como estaba.</p> : null}
      {crea && c.pasos > 0 && !cerrado && fechas[c.pasos - 1] ? (
        <button type="button" className="conv-btn conv-btn--sm" disabled={ocupado} onClick={deshacer}>
          Deshacer el último paso
        </button>
      ) : null}
    </section>
  );
}

/* ---------- Historial --------------------------------------------------------- */

function Historial({ id }: { id: string }) {
  const h = useHistorialConvenio(id);
  const nombres = useNombres((h.data ?? []).map((x) => x.autor));
  return (
    <section className="conv-panel conv-bloque">
      <h2>Historial</h2>
      {h.isPending ? (
        <p className="conv-sub" role="status">
          Cargando…
        </p>
      ) : h.error ? (
        <p className="conv-error" role="alert">
          {h.error.message}
        </p>
      ) : !h.data?.length ? (
        <p className="conv-sub">Todavía no hay anotaciones.</p>
      ) : (
        <ul className="conv-hist">
          {h.data.map((x) => (
            <li key={x.id}>
              <time dateTime={x.fecha}>{fechaLarga(x.fecha)}</time>
              <span>
                {x.texto}
                {x.autor && nombres.data?.[x.autor] ? <small className="conv-sub"> · {nombres.data[x.autor]}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
