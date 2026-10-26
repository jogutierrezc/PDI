/* =============================================================================
   CMS Portales · inspector del bloque elegido y de la página.

   Cuatro pestañas, como el prototipo aprobado: Bloque (contenido y apariencia,
   con el formulario generado desde el registro de bloques.ts), Movimiento (la
   entrada con GSAP, su código y su reproducción), Esquema (la definición del
   bloque como componente y la fila que viaja a la base) y Página (título,
   ruta, estado e historial de versiones de solo lectura). Todo cambio pasa por
   onActualizar: el historial decide si abre un paso nuevo o se fusiona con el
   anterior (texto escrito seguido).
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import { definicion, type CampoBloque, type Subcampo } from "./bloques";
import { codigoGsap, esquemaDeBloque, filaDeBloque } from "./esquema";
import {
  ALINEACIONES,
  ANCHOS,
  CURVAS,
  ESPACIOS,
  FONDOS,
  MEDIDAS,
  PRESETS_MOVIMIENTO,
  alinearDe,
  estadoPublicacion,
  estiloDe,
  fijarAlinear,
  fijarEstilo,
  fijarMedida,
  fijarMovimiento,
  fijarOculto,
  medidaDe,
  movimientoDe,
  ocultoDe,
  type LineaBloque,
} from "./logica";
import { IconoCms } from "./iconos";
import { ETIQUETA_ESTADO } from "./PanelPaginas";
import { Pestanas, idPanel, idPestana, type PestanaDef } from "./Pestanas";
import { FaltaMigracionCms, renombrarPagina, useInvalidarCms, useVersiones } from "./store";
import type { Alineacion, Ancho, CmsPagina, Espacio, Fondo, Medida, PresetMovimiento, Props } from "./tipos";
import { uploadOfficePhoto } from "../pagina/store";
import { officePhotoUrl } from "../../planeacion/page";
import { Icon } from "../../../components/ui/Icon";

type Pestana = "bloque" | "movimiento" | "esquema" | "pagina";

const ETIQUETA_FONDO: Record<Fondo, string> = { claro: "Claro", alterno: "Alterno", marino: "Marino (azul UDES)" };
const ETIQUETA_ESPACIO: Record<Espacio, string> = { compacto: "Compacto", normal: "Normal", amplio: "Amplio" };
const ETIQUETA_ALINEACION: Record<Alineacion, string> = { izquierda: "Izquierda", centro: "Centrado", derecha: "Derecha", justificado: "Justificado" };
const ETIQUETA_MEDIDA: Record<Medida, string> = { estrecha: "Estrecho (lectura cómoda)", amplia: "Amplio", completa: "Todo el ancho del bloque" };
const ETIQUETA_ANCHO: Record<Ancho, string> = { 4: "Un tercio", 6: "Mitad", 8: "Dos tercios", 12: "Completo" };
const ETIQUETA_PRESET: Record<PresetMovimiento, string> = {
  palabras: "Palabras que suben (título)",
  sube: "Sube y aparece",
  cascada: "Cascada de elementos",
  zoom: "Zoom suave de la imagen",
  ninguna: "Sin entrada",
};
const ETIQUETA_CURVA: Record<string, string> = {
  "power3.out": "Suave (power3)",
  "power4.out": "Más suave (power4)",
  "expo.out": "Rápida al final (expo)",
  "back.out(1.4)": "Con rebote (back)",
  "sine.inOut": "Simétrica (sine)",
};

const texto = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const lista = (v: unknown): Props[] =>
  Array.isArray(v) ? v.filter((x): x is Props => typeof x === "object" && x !== null && !Array.isArray(x)) : [];

interface InspectorProps {
  bloque: LineaBloque | null;
  /** Posición del bloque en la página (para la fila del esquema). */
  orden: number;
  pagina: CmsPagina;
  puedeEditar: boolean;
  onActualizar: (id: string, cambio: (b: LineaBloque) => LineaBloque, clave?: string) => void;
  /** Termina la fusión de texto: el siguiente cambio abre un paso nuevo. */
  onFusionFin: () => void;
  onReproducir: (id: string) => void;
  onAviso: (mensaje: string | null) => void;
}

export function Inspector({ bloque, orden, pagina, puedeEditar, onActualizar, onFusionFin, onReproducir, onAviso }: InspectorProps) {
  const [pestana, setPestana] = useState<Pestana>(bloque ? "bloque" : "pagina");
  const pestanas: PestanaDef<Pestana>[] = [
    { id: "bloque", etiqueta: "Bloque", icono: <IconoCms name="ajustes" size={15} /> },
    { id: "movimiento", etiqueta: "Movimiento", icono: <IconoCms name="movimiento" size={15} /> },
    { id: "esquema", etiqueta: "Esquema", icono: <Icon name="code" size={15} /> },
    { id: "pagina", etiqueta: "Página", icono: <Icon name="clock" size={15} /> },
  ];

  // Al elegir un bloque estando en «Página», el inspector pasa a «Bloque»; las demás pestañas se respetan.
  const id = bloque?.id ?? null;
  useEffect(() => {
    if (id) setPestana((actual) => (actual === "pagina" ? "bloque" : actual));
  }, [id]);

  return (
    <aside className="cms-insp" aria-label="Inspector">
      <Pestanas base="cms-insp" etiqueta="Secciones del inspector" pestanas={pestanas} valor={pestana} onCambio={setPestana} />
      <div className="cms-panel" role="tabpanel" id={idPanel("cms-insp")} aria-labelledby={idPestana("cms-insp", pestana)}>
        {pestana === "pagina" ? (
          <PanelPagina pagina={pagina} puedeEditar={puedeEditar} onAviso={onAviso} />
        ) : !bloque ? (
          <p className="cms-ayuda">
            {pestana === "bloque" && "Elija un bloque en el lienzo para editar su contenido, su apariencia y su movimiento. Sin selección, la pestaña Página muestra los datos de la página."}
            {pestana === "movimiento" && "Elija un bloque para ajustar cómo entra en pantalla."}
            {pestana === "esquema" && "Elija un bloque para ver su esquema."}
          </p>
        ) : (
          <Cuerpo
            bloque={bloque}
            orden={orden}
            pestana={pestana}
            onActualizar={onActualizar}
            onFusionFin={onFusionFin}
            onReproducir={() => onReproducir(bloque.id)}
            onAviso={onAviso}
          />
        )}
      </div>
    </aside>
  );
}

function Cuerpo({
  bloque,
  orden,
  pestana,
  onActualizar,
  onFusionFin,
  onReproducir,
  onAviso,
}: Pick<InspectorProps, "onActualizar" | "onFusionFin" | "onAviso" | "orden"> & { bloque: LineaBloque; pestana: Exclude<Pestana, "pagina">; onReproducir: () => void }) {
  const def = definicion(bloque.tipo);
  if (!def) return <p className="cms-aviso">Este tipo de bloque no existe en el registro. Revise la página en la base o agregue el tipo.</p>;

  const cambiarProps = (clave: string, valor: unknown, fusion?: string) =>
    onActualizar(bloque.id, (b) => ({ ...b, props: { ...b.props, [clave]: valor } }), fusion);

  return (
    <div className="cms-insp__panel">
      <h3 className="cms-insp__titulo">
        {pestana === "movimiento" ? `Movimiento de ${def.nombre}` : pestana === "esquema" ? `Esquema de ${def.nombre}` : def.nombre}{" "}
        {pestana === "bloque" && <span className="cms-mono">{bloque.tipo}</span>}
      </h3>

      {pestana === "bloque" && (
        <>
          {def.vivo && (
            <p className="cms-nota-insp" role="note">
              {def.campos.length > 0
                ? "Este bloque muestra datos en vivo del portal. Aquí se edita solo su encabezado; lo demás sale de la base."
                : "Este bloque muestra datos en vivo del portal. Se puede mover, ocultar o quitar; su contenido sale de la base."}
            </p>
          )}
          {def.campos.map((campo) => (
            <CampoForm
              key={campo.clave}
              campo={campo}
              valor={bloque.props[campo.clave]}
              onCambio={(valor, fusion) => cambiarProps(campo.clave, valor, fusion ? `${bloque.id}:${campo.clave}` : undefined)}
              onFin={onFusionFin}
            />
          ))}
          <h3 className="cms-panel__titulo">Apariencia</h3>
          <Apariencia bloque={bloque} onActualizar={onActualizar} sinFondo={Boolean(def.sinFondo)} vivo={Boolean(def.vivo)} />
        </>
      )}

      {pestana === "movimiento" && <Movimiento bloque={bloque} onActualizar={onActualizar} onFin={onFusionFin} onReproducir={onReproducir} />}

      {pestana === "esquema" && <Esquema bloque={bloque} orden={orden} onAviso={onAviso} />}
    </div>
  );
}

/* --- Contenido -------------------------------------------------------------------------------- */

function CampoForm({
  campo,
  valor,
  onCambio,
  onFin,
}: {
  campo: CampoBloque;
  valor: unknown;
  onCambio: (valor: unknown, fusion: boolean) => void;
  onFin: () => void;
}) {
  const requerido = campo.requerido ? <b className="cms-req" aria-hidden="true">*</b> : null;
  switch (campo.tipo) {
    case "texto":
      return (
        <label className="cms-campo">
          <span>{campo.etiqueta}{requerido}</span>
          <input className="cms-input" value={texto(valor)} aria-required={campo.requerido} onChange={(e) => onCambio(e.target.value, true)} onBlur={onFin} />
        </label>
      );
    case "area":
      return (
        <label className="cms-campo">
          <span>{campo.etiqueta}{requerido}</span>
          <textarea className="cms-input cms-area" rows={4} value={texto(valor)} aria-required={campo.requerido} onChange={(e) => onCambio(e.target.value, true)} onBlur={onFin} />
        </label>
      );
    case "numero":
      return (
        <label className="cms-campo">
          <span>{campo.etiqueta}</span>
          <input
            className="cms-input"
            type="number"
            min={campo.min}
            max={campo.max}
            value={texto(valor)}
            onChange={(e) => onCambio(e.target.value === "" ? undefined : Number(e.target.value), true)}
            onBlur={onFin}
          />
        </label>
      );
    case "bool":
      return (
        <label className="cms-switch">
          <span>{campo.etiqueta}</span>
          <input type="checkbox" role="switch" checked={valor === true} onChange={(e) => onCambio(e.target.checked, false)} />
        </label>
      );
    case "enum":
      return (
        <label className="cms-campo">
          <span>{campo.etiqueta}</span>
          <select className="cms-input" value={texto(valor)} onChange={(e) => onCambio(e.target.value, false)}>
            {(campo.opciones ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
      );
    case "imagen":
      return <SelectorImagen etiqueta={campo.etiqueta} valor={texto(valor)} onCambio={(v, fusion) => onCambio(v, fusion)} onFin={onFin} />;
    case "lista":
      return <ListaEditor campo={campo} filas={lista(valor)} onCambio={onCambio} onFin={onFin} />;
  }
}

/** Una imagen: se sube un archivo (queda en el bucket «oficina», carpeta cms) o se pega una dirección. */
function SelectorImagen({ etiqueta, valor, onCambio, onFin }: { etiqueta: string; valor: string; onCambio: (valor: string, fusion: boolean) => void; onFin: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vista = officePhotoUrl(valor);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      onCambio(await uploadOfficePhoto("cms", archivo), false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="cms-campo cms-imagen">
      <span>{etiqueta}</span>
      {vista && <img className="cms-imagen__vista" src={vista} alt="" />}
      <div className="cms-linea">
        <input className="cms-input" value={valor} placeholder="Ruta, https://… o suba un archivo" onChange={(e) => onCambio(e.target.value, true)} onBlur={onFin} />
        <button type="button" className="cms-btn" disabled={subiendo} onClick={() => entrada.current?.click()}>
          {subiendo ? "Subiendo…" : "Subir"}
        </button>
        {valor && (
          <button type="button" className="cms-btn" onClick={() => onCambio("", false)}>
            Quitar
          </button>
        )}
      </div>
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => void subir(e.target.files?.[0])} />
      {error && (
        <p className="cms-aviso" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function filaNueva(subcampos: Subcampo[]): Props {
  const fila: Props = {};
  subcampos.forEach((s, i) => {
    if (s.tipo === "enum") fila[s.clave] = s.opciones?.[0]?.valor ?? "";
    else fila[s.clave] = i === 0 ? "Nuevo elemento" : "";
  });
  return fila;
}

function ListaEditor({
  campo,
  filas,
  onCambio,
  onFin,
}: {
  campo: CampoBloque;
  filas: Props[];
  onCambio: (valor: unknown, fusion: boolean) => void;
  onFin: () => void;
}) {
  const subcampos = campo.subcampos ?? [];
  const primero = subcampos[0];
  const mover = (i: number, j: number) => {
    if (j < 0 || j >= filas.length) return;
    const nuevas = [...filas];
    [nuevas[i], nuevas[j]] = [nuevas[j], nuevas[i]];
    onCambio(nuevas, false);
  };
  return (
    <div className="cms-lista">
      <div className="cms-lista__cabecera">
        <span>{campo.etiqueta}</span>
        <button type="button" className="cms-btn cms-btn--chico" onClick={() => onCambio([...filas, filaNueva(subcampos)], false)}>
          <Icon name="plus" size={14} />
          Agregar
        </button>
      </div>
      {filas.length === 0 && <p className="cms-ayuda">Esta lista está vacía.</p>}
      {filas.map((fila, i) => (
        <details className="cms-li" key={i}>
          <summary>
            <span className="cms-li__titulo">{(primero && texto(fila[primero.clave])) || "Sin título"}</span>
            <span className="cms-li__acciones">
              <button
                type="button"
                className="cms-ib"
                aria-label="Subir elemento"
                disabled={i === 0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  mover(i, i - 1);
                }}
              >
                <Icon name="chevron-down" size={14} className="cms-ico--arriba" />
              </button>
              <button
                type="button"
                className="cms-ib"
                aria-label="Bajar elemento"
                disabled={i === filas.length - 1}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  mover(i, i + 1);
                }}
              >
                <Icon name="chevron-down" size={14} />
              </button>
              <button
                type="button"
                className="cms-ib cms-ib--peligro"
                aria-label="Quitar elemento"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCambio(filas.filter((_, j) => j !== i), false);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </span>
          </summary>
          <div className="cms-li__cuerpo">
            {subcampos.map((s) => {
              if (s.cuando && !s.cuando.valores.includes(texto(fila[s.cuando.clave]))) return null;
              const valor = texto(fila[s.clave]);
              const set = (v: string, fusion: boolean) => {
                const nuevas = filas.map((f, j) => (j === i ? { ...f, [s.clave]: v } : f));
                onCambio(nuevas, fusion);
              };
              if (s.tipo === "enum") {
                return (
                  <label className="cms-campo" key={s.clave}>
                    <span>{s.etiqueta}</span>
                    <select className="cms-input" value={valor} onChange={(e) => set(e.target.value, false)}>
                      {(s.opciones ?? []).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (s.tipo === "imagen") {
                return <SelectorImagen key={s.clave} etiqueta={s.etiqueta} valor={valor} onCambio={set} onFin={onFin} />;
              }
              if (s.tipo === "area") {
                return (
                  <label className="cms-campo" key={s.clave}>
                    <span>{s.etiqueta}</span>
                    <textarea className="cms-input cms-area" rows={3} value={valor} onChange={(e) => set(e.target.value, true)} onBlur={onFin} />
                  </label>
                );
              }
              return (
                <label className="cms-campo" key={s.clave}>
                  <span>{s.etiqueta}</span>
                  <input className="cms-input" value={valor} onChange={(e) => set(e.target.value, true)} onBlur={onFin} />
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

/* --- Apariencia ------------------------------------------------------------------------------- */

function Apariencia({
  bloque,
  onActualizar,
  sinFondo,
  vivo,
}: {
  bloque: LineaBloque;
  onActualizar: InspectorProps["onActualizar"];
  sinFondo: boolean;
  vivo: boolean;
}) {
  const estilo = estiloDe(bloque.props);
  const oculto = ocultoDe(bloque.props);
  return (
    <>
      {!sinFondo && (
        <label className="cms-campo">
          <span>Fondo</span>
          <select
            className="cms-input"
            value={estilo.fondo}
            onChange={(e) => onActualizar(bloque.id, (b) => ({ ...b, props: fijarEstilo(b.props, { ...estiloDe(b.props), fondo: e.target.value as Fondo }) }))}
          >
            {FONDOS.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FONDO[f]}
              </option>
            ))}
          </select>
        </label>
      )}
      {bloque.tipo !== "ods" && (
        <label className="cms-campo">
          <span>Espacio vertical</span>
          <select
            className="cms-input"
            value={estilo.espacio}
            onChange={(e) => onActualizar(bloque.id, (b) => ({ ...b, props: fijarEstilo(b.props, { ...estiloDe(b.props), espacio: e.target.value as Espacio }) }))}
          >
            {ESPACIOS.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESPACIO[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {!vivo && (
        <>
          <label className="cms-campo">
            <span>Alineación del texto</span>
            <select
              className="cms-input"
              value={alinearDe(bloque.props)}
              onChange={(e) => onActualizar(bloque.id, (b) => ({ ...b, props: fijarAlinear(b.props, e.target.value as Alineacion) }))}
            >
              {ALINEACIONES.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_ALINEACION[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="cms-campo">
            <span>Ancho de los párrafos</span>
            <select
              className="cms-input"
              value={medidaDe(bloque.props)}
              onChange={(e) => onActualizar(bloque.id, (b) => ({ ...b, props: fijarMedida(b.props, e.target.value as Medida) }))}
            >
              {MEDIDAS.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIDA[m]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="cms-campo">
        <span>Ancho en la página</span>
        <select className="cms-input" value={bloque.ancho} onChange={(e) => onActualizar(bloque.id, (b) => ({ ...b, ancho: Number(e.target.value) as Ancho }))}>
          {ANCHOS.map((a) => (
            <option key={a} value={a}>
              {ETIQUETA_ANCHO[a]}
            </option>
          ))}
        </select>
      </label>
      <label className="cms-switch">
        <span>Ocultar en la página publicada</span>
        <input
          type="checkbox"
          role="switch"
          checked={oculto}
          onChange={(e) => onActualizar(bloque.id, (b) => ({ ...b, props: fijarOculto(b.props, e.target.checked) }))}
        />
      </label>
    </>
  );
}

/* --- Movimiento ------------------------------------------------------------------------------- */

function Movimiento({
  bloque,
  onActualizar,
  onFin,
  onReproducir,
}: {
  bloque: LineaBloque;
  onActualizar: InspectorProps["onActualizar"];
  onFin: () => void;
  onReproducir: () => void;
}) {
  const m = movimientoDe(bloque.tipo, bloque.props);
  const ajustar = (campo: keyof typeof m, valor: unknown, fusion: boolean) =>
    onActualizar(
      bloque.id,
      (b) => ({ ...b, props: fijarMovimiento(b.props, { ...movimientoDe(b.tipo, b.props), [campo]: valor }) }),
      fusion ? `${bloque.id}:mov:${campo}` : undefined,
    );
  const rango = (campo: "dur" | "stagger" | "delay", etiqueta: string, min: number, max: number, paso: number) => (
    <label className="cms-campo">
      <span>
        {etiqueta} <output className="cms-mono">{m[campo].toFixed(2)} s</output>
      </span>
      <input type="range" min={min} max={max} step={paso} value={m[campo]} onChange={(e) => ajustar(campo, Number(e.target.value), true)} onBlur={onFin} />
    </label>
  );
  return (
    <>
      <label className="cms-campo">
        <span>Entrada</span>
        <select className="cms-input" value={m.preset} onChange={(e) => ajustar("preset", e.target.value, false)}>
          {PRESETS_MOVIMIENTO.map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PRESET[p]}
            </option>
          ))}
        </select>
      </label>
      {rango("dur", "Duración", 0.2, 1.6, 0.05)}
      {rango("stagger", "Escalonado", 0, 0.25, 0.01)}
      {rango("delay", "Retraso", 0, 1, 0.05)}
      <label className="cms-campo">
        <span>Curva</span>
        <select className="cms-input" value={m.ease} onChange={(e) => ajustar("ease", e.target.value, false)}>
          {CURVAS.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CURVA[c] ?? c}
            </option>
          ))}
        </select>
      </label>
      <h3 className="cms-panel__titulo">Código GSAP generado</h3>
      <pre className="cms-codigo" tabIndex={0} aria-label="Código GSAP generado">
        {codigoGsap(m)}
      </pre>
      <button type="button" className="cms-btn cms-btn--primario cms-btn--ancho" onClick={onReproducir}>
        <Icon name="play" size={14} />
        Reproducir este bloque
      </button>
      <p className="cms-ayuda">
        Con movimiento reducido activado en el sistema, el portal muestra los bloques ya en su lugar. La cinta de los ODS y la barra de contexto se mueven solas y se detienen al pasar el cursor.
      </p>
    </>
  );
}

/* --- Esquema ---------------------------------------------------------------------------------- */

function Esquema({ bloque, orden, onAviso }: { bloque: LineaBloque; orden: number; onAviso: (m: string | null) => void }) {
  const def = definicion(bloque.tipo);
  if (!def) return null;
  const esquema = JSON.stringify(esquemaDeBloque(def), null, 2);
  const fila = JSON.stringify(filaDeBloque(bloque, orden), null, 2);
  return (
    <>
      <p className="cms-nota-insp">Así se declara el bloque, como un componente de Strapi. El formulario del inspector se genera a partir de esta descripción.</p>
      <h3 className="cms-panel__titulo">Componente</h3>
      <BloqueCodigo etiqueta="Esquema del componente" texto={esquema} onAviso={onAviso} />
      <h3 className="cms-panel__titulo">Cómo viaja a la base</h3>
      <BloqueCodigo etiqueta="Fila de cms_bloques" texto={fila} onAviso={onAviso} />
      <p className="cms-ayuda">Las claves que empiezan por «_» (_estilo, _mov, _oculto) viajan dentro de props.</p>
    </>
  );
}

/** Un bloque de código con su botón de copiar. El portapapeles puede negarse (permiso, contexto no seguro): se avisa. */
function BloqueCodigo({ etiqueta, texto: contenido, onAviso }: { etiqueta: string; texto: string; onAviso: (m: string | null) => void }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(contenido);
      onAviso(`Copiado: ${etiqueta.toLowerCase()}.`);
    } catch {
      onAviso("El navegador no dejó copiar. Seleccione el texto con el teclado y use Ctrl+C.");
    }
  }
  return (
    <>
      <pre className="cms-codigo" tabIndex={0} aria-label={etiqueta}>
        {contenido}
      </pre>
      <button type="button" className="cms-btn cms-btn--chico" onClick={() => void copiar()}>
        <IconoCms name="copiar" size={14} />
        Copiar
      </button>
    </>
  );
}

/* --- Página ----------------------------------------------------------------------------------- */

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

function PanelPagina({ pagina, puedeEditar, onAviso }: { pagina: CmsPagina; puedeEditar: boolean; onAviso: (m: string | null) => void }) {
  const invalidar = useInvalidarCms();
  const idTitulo = useId();
  const versiones = useVersiones(pagina.id);
  const [titulo, setTitulo] = useState(pagina.titulo);
  const estado = estadoPublicacion(pagina);
  const enlace = `/portales/${pagina.portal}${pagina.ruta ? `/${pagina.ruta}` : ""}`;

  async function guardarTitulo() {
    try {
      await renombrarPagina(pagina.id, titulo);
      invalidar(pagina.portal);
      onAviso("Título guardado en el borrador.");
    } catch (e) {
      onAviso(e instanceof Error ? e.message : "No se pudo guardar el título.");
    }
  }

  const faltaMigracion = versiones.error instanceof FaltaMigracionCms;
  return (
    <div className="cms-insp__panel">
      <h3 className="cms-insp__titulo">
        {pagina.titulo || "(sin título)"} <span className={`cms-tag cms-tag--${estado}`}>{ETIQUETA_ESTADO[estado]}</span>
      </h3>
      <div className="cms-campo">
        <label htmlFor={idTitulo}>Título</label>
        <div className="cms-linea">
          <input id={idTitulo} className="cms-input" value={titulo} disabled={!puedeEditar} onChange={(e) => setTitulo(e.target.value)} />
          {puedeEditar && (
            <button type="button" className="cms-btn" onClick={() => void guardarTitulo()} disabled={!titulo.trim() || titulo.trim() === pagina.titulo}>
              Guardar título
            </button>
          )}
        </div>
      </div>
      <div className="cms-campo">
        <span>Dirección pública</span>
        <span className="cms-mono">{enlace}</span>
        {pagina.publicada_version != null && (
          <a className="cms-enlace" href={enlace} target="_blank" rel="noreferrer">
            Ver publicada <Icon name="external" size={14} />
          </a>
        )}
      </div>

      <h3 className="cms-panel__titulo">Historial de versiones</h3>
      {versiones.isPending && <p className="cms-ayuda">Leyendo versiones…</p>}
      {faltaMigracion && <p className="cms-ayuda">Falta aplicar la migración 0174 para ver el historial.</p>}
      {versiones.isError && !faltaMigracion && (
        <p className="cms-aviso" role="alert">
          No se pudo leer el historial: {versiones.error instanceof Error ? versiones.error.message : "error desconocido"}
        </p>
      )}
      {versiones.data && versiones.data.length === 0 && <p className="cms-ayuda">Todavía no se ha publicado.</p>}
      {versiones.data && versiones.data.length > 0 && (
        <ul className="cms-hist">
          {versiones.data.map((v) => (
            <li key={v.version}>
              <b>Versión {v.version}</b>
              {v.version === pagina.publicada_version && <span className="cms-tag cms-tag--publicada">En línea</span>}
              <small>
                <time dateTime={v.publicado_en}>{FECHA.format(new Date(v.publicado_en))}</time>
              </small>
            </li>
          ))}
        </ul>
      )}
      <p className="cms-ayuda">El historial es de solo lectura. Restaurar una versión como borrador llegará en una etapa posterior.</p>
    </div>
  );
}
