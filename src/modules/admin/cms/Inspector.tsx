/* =============================================================================
   CMS Portales · inspector del bloque elegido y de la página.

   Cinco pestañas, como el prototipo aprobado: Bloque (contenido y apariencia,
   con el formulario generado desde el registro de bloques.ts), Estilo (tipografía,
   color y forma del bloque frente al sitio, ver estilo.ts), Movimiento (la
   entrada con GSAP, su código y su reproducción), Esquema (la definición del
   bloque como componente y la fila que viaja a la base) y Página (título,
   ruta, estado e historial de versiones de solo lectura). Todo cambio pasa por
   onActualizar: el historial decide si abre un paso nuevo o se fusiona con el
   anterior (texto escrito seguido).
   ========================================================================== */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PROPORCIONES_COLUMNAS, definicion, type CampoBloque, type Subcampo } from "./bloques";
import { CampoReferencia } from "./CampoReferencia";
import { codigoGsap, esquemaDeBloque, esquemaDeContenedor, filaDeBloque, hijoDeBloque } from "./esquema";
import {
  ALINEACIONES,
  ANCHOS,
  CURVAS,
  ESPACIOS,
  COLUMNAS_CONTENEDOR,
  FONDOS,
  MEDIDAS,
  SEPARACIONES_CONTENEDOR,
  VERTICALES_CONTENEDOR,
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
  cambiarColumnas,
  contenedorDe,
  movimientoDe,
  ocultoDe,
  type LineaBloque,
} from "./logica";
import {
  ANCHOS_CONTENIDO,
  CLAVE_DISPOSITIVO,
  FACTOR_TEXTO,
  FACTOR_TITULO,
  FUENTES,
  LIMITES_DISENO,
  PESOS_BLOQUE,
  SITIO_DEFECTO,
  cambiarDiseno,
  completarEstilo,
  contraste,
  cuantasCambia,
  disenoDe,
  tamanosCompletos,
  textoSobre,
  titulosDelSitio,
  type AnchoContenido,
  type DisenoBloque,
  type DispositivoEstilo,
  type EstiloSitioParcial,
} from "./estilo";
import { IconoCms } from "./iconos";
import { ETIQUETA_ESTADO } from "./PanelPaginas";
import { Pestanas, idPanel, idPestana, type PestanaDef } from "./Pestanas";
import { FaltaMigracionCms, renombrarPagina, useInvalidarCms, useVersiones } from "./store";
import type { Alineacion, Ancho, CmsPagina, Espacio, Fondo, Medida, PresetMovimiento, Props } from "./tipos";
import { uploadOfficePhoto } from "../pagina/store";
import { officePhotoUrl } from "../../planeacion/page";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../lib/auth";

type Pestana = "bloque" | "estilo" | "movimiento" | "esquema" | "pagina";

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
  /** Posición del bloque en la página (para la fila del esquema) o en su columna, si está dentro de unas columnas. */
  orden: number;
  /** El bloque elegido está dentro de una columna: no tiene ancho propio y su esquema es el de un bloque anidado. */
  anidado?: boolean;
  pagina: CmsPagina;
  puedeEditar: boolean;
  onActualizar: (id: string, cambio: (b: LineaBloque) => LineaBloque, clave?: string) => void;
  /** Termina la fusión de texto: el siguiente cambio abre un paso nuevo. */
  onFusionFin: () => void;
  onReproducir: (id: string) => void;
  onAviso: (mensaje: string | null) => void;
  /** El dispositivo de la vista previa: los tamaños de la pestaña Estilo son los de ese dispositivo. */
  dispositivo: DispositivoEstilo;
  /** Estilo del sitio del portal, para mostrar de qué hereda el bloque. */
  sitio: EstiloSitioParcial;
}

export function Inspector({ bloque, orden, anidado = false, pagina, puedeEditar, onActualizar, onFusionFin, onReproducir, onAviso, dispositivo, sitio }: InspectorProps) {
  const [pestana, setPestana] = useState<Pestana>(bloque ? "bloque" : "pagina");
  const pestanas: PestanaDef<Pestana>[] = [
    { id: "bloque", etiqueta: "Bloque", icono: <IconoCms name="ajustes" size={15} /> },
    { id: "estilo", etiqueta: "Estilo", icono: <Icon name="pen" size={15} /> },
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
            {pestana === "estilo" && "Elija un bloque para ajustar su tipografía, su color y su forma."}
            {pestana === "movimiento" && "Elija un bloque para ajustar cómo entra en pantalla."}
            {pestana === "esquema" && "Elija un bloque para ver su esquema."}
          </p>
        ) : (
          <Cuerpo
            bloque={bloque}
            orden={orden}
            anidado={anidado}
            pestana={pestana}
            onActualizar={onActualizar}
            onFusionFin={onFusionFin}
            onReproducir={() => onReproducir(bloque.id)}
            onAviso={onAviso}
            dispositivo={dispositivo}
            sitio={sitio}
          />
        )}
      </div>
    </aside>
  );
}

function Cuerpo({
  bloque,
  orden,
  anidado,
  pestana,
  onActualizar,
  onFusionFin,
  onReproducir,
  onAviso,
  dispositivo,
  sitio,
}: Pick<InspectorProps, "onActualizar" | "onFusionFin" | "onAviso" | "orden" | "dispositivo" | "sitio"> & { bloque: LineaBloque; anidado: boolean; pestana: Exclude<Pestana, "pagina">; onReproducir: () => void }) {
  const def = definicion(bloque.tipo);
  const esAdmin = useAuth().hasRole("admin");
  if (!def) return <p className="cms-aviso">Este tipo de bloque no existe en el registro. Revise la página en la base o agregue el tipo.</p>;
  // Un bloque reservado a la administración se ve, pero solo ella lo edita (la base también lo exige).
  const bloqueado = Boolean(def.soloAdmin) && !esAdmin;

  const cambiarProps = (clave: string, valor: unknown, fusion?: string) =>
    onActualizar(bloque.id, (b) => ({ ...b, props: { ...b.props, [clave]: valor } }), fusion);

  return (
    <fieldset className="cms-insp__panel cms-fieldset" disabled={bloqueado}>
      <h3 className="cms-insp__titulo">
        {pestana === "movimiento" ? `Movimiento de ${def.nombre}` : pestana === "estilo" ? `Estilo de ${def.nombre}` : pestana === "esquema" ? `Esquema de ${def.nombre}` : def.nombre}{" "}
        {pestana === "bloque" && <span className="cms-mono">{bloque.tipo}</span>}
      </h3>

      {bloqueado && (
        <p className="cms-nota-insp" role="note">
          Este bloque lleva código propio. Solo la administración puede cambiarlo; usted puede verlo y moverlo.
        </p>
      )}
      {pestana === "bloque" && (
        <>
          {def.vivo && (
            <p className="cms-nota-insp" role="note">
              {def.campos.length > 0
                ? "Este bloque muestra datos en vivo del portal. Aquí se edita solo su encabezado; lo demás sale de la base."
                : "Este bloque muestra datos en vivo del portal. Se puede mover, ocultar o quitar; su contenido sale de la base."}
            </p>
          )}
          {anidado && (
            <p className="cms-nota-insp" role="note">
              Este bloque va dentro de una columna: ocupa su ancho. Para moverlo a otra columna, arrástrelo o use los botones de su barra en el lienzo.
            </p>
          )}
          {bloque.tipo === "contenedor" ? (
            <SeccionContenedor bloque={bloque} onActualizar={onActualizar} onAviso={onAviso} />
          ) : (
            def.campos.map((campo) => (
              <CampoForm
                key={campo.clave}
                campo={campo}
                valor={bloque.props[campo.clave]}
                onCambio={(valor, fusion) => cambiarProps(campo.clave, valor, fusion ? `${bloque.id}:${campo.clave}` : undefined)}
                onFin={onFusionFin}
              />
            ))
          )}
          <h3 className="cms-panel__titulo">Apariencia</h3>
          <Apariencia bloque={bloque} onActualizar={onActualizar} sinFondo={Boolean(def.sinFondo)} vivo={Boolean(def.vivo)} anidado={anidado} />
        </>
      )}

      {pestana === "estilo" && <Estilo bloque={bloque} dispositivo={dispositivo} sitio={sitio} onActualizar={onActualizar} onFin={onFusionFin} />}

      {pestana === "movimiento" && <Movimiento bloque={bloque} onActualizar={onActualizar} onFin={onFusionFin} onReproducir={onReproducir} />}

      {pestana === "esquema" && <Esquema bloque={bloque} orden={orden} anidado={anidado} onAviso={onAviso} />}
    </fieldset>
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
    case "codigo":
      return (
        <label className="cms-campo">
          <span>{campo.etiqueta}{campo.lenguaje && <small className="cms-mono"> {campo.lenguaje.toUpperCase()}</small>}</span>
          <textarea
            className="cms-input cms-area cms-area--codigo"
            rows={8}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            value={texto(valor)}
            onChange={(e) => onCambio(e.target.value, true)}
            onBlur={onFin}
          />
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
    case "referencia":
      return <CampoReferencia campo={campo} valor={valor} onCambio={onCambio} />;
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

/* --- Columnas con contenido: número de columnas, proporción, separación y alineación -------------- */

const ETIQUETA_SEPARACION: Record<(typeof SEPARACIONES_CONTENEDOR)[number], string> = { chica: "Chica", media: "Media", grande: "Grande" };
const ETIQUETA_VERTICAL: Record<(typeof VERTICALES_CONTENEDOR)[number], string> = { inicio: "Arriba", centro: "Al centro", fin: "Abajo", estirar: "Estirar" };

function SeccionContenedor({ bloque, onActualizar, onAviso }: { bloque: LineaBloque; onActualizar: InspectorProps["onActualizar"]; onAviso: (m: string | null) => void }) {
  const c = contenedorDe(bloque.props);
  const poner = (clave: string, valor: string) => onActualizar(bloque.id, (b) => ({ ...b, props: { ...b.props, [clave]: valor } }));
  // Con 2 o 3 columnas se ofrecen las proporciones que encajan; con otro número, solo columnas iguales.
  const proporciones = Object.entries(PROPORCIONES_COLUMNAS).filter(([, d]) => d.partes.length === c.columnas);
  const total = c.items.reduce((n, x) => n + x.bloques.length, 0);
  function cambiar(n: number) {
    const r = cambiarColumnas(bloque.props, n);
    onActualizar(bloque.id, (b) => ({ ...b, props: cambiarColumnas(b.props, n).props }));
    if (r.reubicados > 0) onAviso(`Las columnas que sobraban tenían ${r.reubicados} ${r.reubicados === 1 ? "bloque" : "bloques"}: pasaron al final de la última columna.`);
  }
  return (
    <>
      <p className="cms-nota-insp" role="note">
        {total === 0
          ? "Arrastre bloques desde la pestaña Bloques hasta una columna, o use «Agregar bloque» dentro de ella."
          : `Tiene ${total} ${total === 1 ? "bloque" : "bloques"} en ${c.columnas} ${c.columnas === 1 ? "columna" : "columnas"}. Elija uno en el lienzo para editarlo.`}
      </p>
      <label className="cms-campo">
        <span>Columnas</span>
        <select className="cms-input" value={String(c.columnas)} onChange={(e) => cambiar(Number(e.target.value))}>
          {COLUMNAS_CONTENEDOR.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "Una columna" : `${n} columnas`}
            </option>
          ))}
        </select>
      </label>
      {proporciones.length > 0 && (
        <label className="cms-campo">
          <span>Proporción</span>
          <select className="cms-input" value={c.proporcion} onChange={(e) => poner("proporcion", e.target.value)}>
            <option value="iguales">Columnas iguales</option>
            {proporciones.map(([valor, d]) => (
              <option key={valor} value={valor}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="cms-campo">
        <span>Separación entre columnas</span>
        <select className="cms-input" value={c.separacion} onChange={(e) => poner("separacion", e.target.value)}>
          {SEPARACIONES_CONTENEDOR.map((v) => (
            <option key={v} value={v}>
              {ETIQUETA_SEPARACION[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="cms-campo">
        <span>Alineación vertical</span>
        <select className="cms-input" value={c.vertical} onChange={(e) => poner("vertical", e.target.value)}>
          {VERTICALES_CONTENEDOR.map((v) => (
            <option key={v} value={v}>
              {ETIQUETA_VERTICAL[v]}
            </option>
          ))}
        </select>
      </label>
      <p className="cms-ayuda">Con 900 px o más se ven las columnas elegidas, de 600 a 899 px dos (con seis, tres) y por debajo una sola. El fondo y el espacio se eligen en Apariencia y en la pestaña Estilo.</p>
    </>
  );
}

/* --- Apariencia ------------------------------------------------------------------------------- */

function Apariencia({
  bloque,
  onActualizar,
  sinFondo,
  vivo,
  anidado,
}: {
  bloque: LineaBloque;
  onActualizar: InspectorProps["onActualizar"];
  sinFondo: boolean;
  vivo: boolean;
  anidado: boolean;
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
      {!anidado && (
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
      )}
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

/* --- Estilo ------------------------------------------------------------------------------------ */

const NOMBRE_DISPOSITIVO: Record<DispositivoEstilo, string> = { escritorio: "escritorio", tableta: "tableta", telefono: "teléfono" };
const ETIQUETA_ANCHO_CONTENIDO: Record<AnchoContenido, string> = { estrecho: "Estrecho", medio: "Medio", amplio: "Amplio", completo: "Completo" };
const TAMANOS_TITULO: [string, number][] = [["S", 28], ["M", 40], ["L", 56], ["XL", 72]];
type Parche = Partial<Record<keyof DisenoBloque, unknown>>;

/** Una propiedad del bloque: punto azul si la cambia y «Restablecer» para volver a lo del sitio. */
function Prop({ etiqueta, cambia, onReset, children }: { etiqueta: string; cambia: boolean; onReset: () => void; children: ReactNode }) {
  return (
    <div className={`cms-campo cms-prop${cambia ? " cms-prop--cambia" : ""}`}>
      <span>
        {etiqueta}
        {cambia && (
          <button type="button" className="cms-prop__reset" onClick={onReset} aria-label={`Restablecer: ${etiqueta}`}>
            Restablecer
          </button>
        )}
      </span>
      {children}
    </div>
  );
}

function Estilo({
  bloque,
  dispositivo,
  sitio,
  onActualizar,
  onFin,
}: {
  bloque: LineaBloque;
  dispositivo: DispositivoEstilo;
  sitio: EstiloSitioParcial;
  onActualizar: InspectorProps["onActualizar"];
  onFin: () => void;
}) {
  const d = disenoDe(bloque.props);
  const efectivo = completarEstilo(sitio);
  const clave = CLAVE_DISPOSITIVO[dispositivo];
  const nombre = NOMBRE_DISPOSITIVO[dispositivo];
  // Cada cambio pasa por onActualizar (historial); con `fusion`, los ajustes seguidos de un mismo control son un solo paso.
  const cambiar = (parche: Parche, fusion?: string) =>
    onActualizar(bloque.id, (b) => ({ ...b, props: cambiarDiseno(b.props, parche) }), fusion ? `${bloque.id}:diseno:${fusion}` : undefined);
  const quitar = (...claves: (keyof DisenoBloque)[]) => cambiar(Object.fromEntries(claves.map((k) => [k, undefined])) as Parche);

  // Tamaños mostrados: el del bloque para este dispositivo (propio o escalado) o, si no cambia nada, el del sitio.
  const sitioTitulo = titulosDelSitio(efectivo.base, efectivo.ratio).h2;
  const factorTitulo = clave === "d" ? 1 : FACTOR_TITULO[clave];
  const factorTexto = clave === "d" ? 1 : FACTOR_TEXTO[clave];
  const verTitulo = tamanosCompletos(d.sh, FACTOR_TITULO, LIMITES_DISENO.sh.min, LIMITES_DISENO.sh.max)?.[clave] ?? Math.round(sitioTitulo * factorTitulo);
  const verTexto = tamanosCompletos(d.sb, FACTOR_TEXTO, LIMITES_DISENO.sb.min, LIMITES_DISENO.sb.max)?.[clave] ?? Math.max(12, Math.round(efectivo.base * factorTexto));

  const rango = (k: "lh" | "ls" | "pad" | "rad", etiqueta: string, lim: { min: number; max: number }, paso: number, valor: number, unidad: string) => (
    <Prop etiqueta={etiqueta} cambia={d[k] !== undefined} onReset={() => quitar(k)}>
      <div className="cms-rango">
        <input type="range" aria-label={etiqueta} min={lim.min} max={lim.max} step={paso} value={valor} onChange={(e) => cambiar({ [k]: Number(e.target.value) }, k)} onBlur={onFin} />
        <output>
          {valor}
          {unidad}
        </output>
      </div>
    </Prop>
  );

  const fuente = (k: "fh" | "fb", etiqueta: string) => (
    <Prop etiqueta={etiqueta} cambia={d[k] !== undefined} onReset={() => quitar(k)}>
      <select className="cms-input" aria-label={etiqueta} value={d[k] ?? ""} onChange={(e) => cambiar({ [k]: e.target.value || undefined })}>
        <option value="">Heredar del sitio</option>
        {FUENTES.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </Prop>
  );

  const paleta: [string, string][] = [["Marino", efectivo.marino], ["Acento", efectivo.acento], ["Alterno", efectivo.alt], ["Blanco", "#ffffff"], ["Texto", efectivo.txt]];
  const color = (k: "color" | "bg", etiqueta: string) => (
    <Prop etiqueta={etiqueta} cambia={d[k] !== undefined} onReset={() => quitar(k)}>
      <div className="cms-chips" role="group" aria-label={etiqueta}>
        {paleta.map(([n, c]) => (
          <button key={n} type="button" title={n} aria-label={n} aria-pressed={d[k] === c} onClick={() => cambiar({ [k]: c })} style={{ background: c, width: 26, height: 26, borderRadius: "50%" }} />
        ))}
        <input type="color" aria-label={`${etiqueta}, color propio`} value={d[k] ?? (k === "bg" ? "#ffffff" : efectivo.txt)} onChange={(e) => cambiar({ [k]: e.target.value }, k)} onBlur={onFin} />
      </div>
    </Prop>
  );

  // Contraste: solo se evalúa si el bloque cambia el color o el fondo. Con fondo propio y sin color, el texto se elige solo.
  const tono = bloque.tipo === "hero" ? (bloque.props.tono === "claro" ? "claro" : "marino") : estiloDe(bloque.props).fondo;
  const fondoBase = definicion(bloque.tipo)?.sinFondo ? "#ffffff" : tono === "marino" ? efectivo.marino : tono === "alterno" ? efectivo.alt : "#ffffff";
  const fondoReal = d.bg ?? fondoBase;
  const textoReal = d.color ?? (d.bg ? textoSobre(d.bg, efectivo.txt) : tono === "marino" ? "#ffffff" : efectivo.txt);
  const razon = contraste(textoReal, fondoReal);
  const pocoContraste = (d.color !== undefined || d.bg !== undefined) && razon < 4.5;

  const propioDelSitio = sitio.fh || sitio.fb;
  return (
    <>
      <p className="cms-nota-insp" role="note">
        {propioDelSitio ? `Hereda del sitio: ${efectivo.fh} (títulos) y ${efectivo.fb} (texto).` : `Este portal aún no tiene estilo propio: el bloque hereda el aspecto actual (${SITIO_DEFECTO.fh}).`} Un punto azul marca lo que este
        bloque cambia. Los tamaños son los de {nombre}; los otros dispositivos se escalan desde el escritorio.
      </p>

      <h3 className="cms-panel__titulo">Tipografía</h3>
      {fuente("fh", "Fuente del título")}
      {fuente("fb", "Fuente del texto")}
      <Prop etiqueta={`Tamaño del título · ${nombre}`} cambia={d.sh !== undefined} onReset={() => quitar("sh")}>
        <div className="cms-rango">
          <input
            type="range"
            aria-label={`Tamaño del título en ${nombre}`}
            min={LIMITES_DISENO.sh.min}
            max={LIMITES_DISENO.sh.max}
            step={1}
            value={verTitulo}
            onChange={(e) => cambiar({ sh: { ...d.sh, [clave]: Number(e.target.value) } }, `sh${clave}`)}
            onBlur={onFin}
          />
          <output>{verTitulo}px</output>
        </div>
        <div className="cms-chips">
          {TAMANOS_TITULO.map(([t, v]) => (
            <button key={t} type="button" onClick={() => cambiar({ sh: { ...d.sh, [clave]: v } })}>
              {t} · {v}
            </button>
          ))}
        </div>
      </Prop>
      <Prop etiqueta={`Tamaño del texto · ${nombre}`} cambia={d.sb !== undefined} onReset={() => quitar("sb")}>
        <div className="cms-rango">
          <input
            type="range"
            aria-label={`Tamaño del texto en ${nombre}`}
            min={LIMITES_DISENO.sb.min}
            max={LIMITES_DISENO.sb.max}
            step={1}
            value={verTexto}
            onChange={(e) => cambiar({ sb: { ...d.sb, [clave]: Number(e.target.value) } }, `sb${clave}`)}
            onBlur={onFin}
          />
          <output>{verTexto}px</output>
        </div>
      </Prop>
      <Prop etiqueta="Peso del título" cambia={d.wt !== undefined} onReset={() => quitar("wt")}>
        <select className="cms-input" aria-label="Peso del título" value={d.wt ?? ""} onChange={(e) => cambiar({ wt: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Heredar del sitio</option>
          {PESOS_BLOQUE.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </Prop>
      {rango("lh", "Interlineado", LIMITES_DISENO.lh, 0.05, d.lh ?? efectivo.lh, "")}
      {rango("ls", "Espacio entre letras del título", LIMITES_DISENO.ls, 0.005, d.ls ?? -0.02, "em")}

      <h3 className="cms-panel__titulo">Color y forma</h3>
      {color("color", "Color del texto")}
      {color("bg", "Fondo del bloque")}
      {pocoContraste && (
        <p className="cms-aviso" role="status">
          Contraste de {razon.toFixed(1)}:1 entre el texto y el fondo. Para leerse bien se pide al menos 4,5:1.
        </p>
      )}
      {rango("pad", "Espacio arriba y abajo", LIMITES_DISENO.pad, 4, d.pad ?? 80, "px")}
      <Prop etiqueta="Ancho del contenido" cambia={d.maxw !== undefined} onReset={() => quitar("maxw")}>
        <select className="cms-input" aria-label="Ancho del contenido" value={d.maxw ?? ""} onChange={(e) => cambiar({ maxw: e.target.value || undefined })}>
          <option value="">Heredar (ancho de la página)</option>
          {ANCHOS_CONTENIDO.map((a) => (
            <option key={a} value={a}>
              {ETIQUETA_ANCHO_CONTENIDO[a]}
            </option>
          ))}
        </select>
      </Prop>
      {rango("rad", "Esquinas de las tarjetas", LIMITES_DISENO.rad, 1, d.rad ?? efectivo.radius, "px")}
      <p className="cms-ayuda">El espacio en píxeles reemplaza el Compacto, Normal o Amplio de la pestaña Bloque mientras esté activo.</p>
      <button
        type="button"
        className="cms-btn cms-btn--ancho"
        disabled={cuantasCambia(d) === 0}
        onClick={() => quitar(...(Object.keys(d) as (keyof DisenoBloque)[]))}
      >
        Restablecer todo el estilo del bloque
      </button>
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

function Esquema({ bloque, orden, anidado, onAviso }: { bloque: LineaBloque; orden: number; anidado: boolean; onAviso: (m: string | null) => void }) {
  const def = definicion(bloque.tipo);
  if (!def) return null;
  const esquema = JSON.stringify(def.tipo === "contenedor" ? esquemaDeContenedor(def) : esquemaDeBloque(def), null, 2);
  const fila = JSON.stringify(anidado ? hijoDeBloque(bloque) : filaDeBloque(bloque, orden), null, 2);
  return (
    <>
      <p className="cms-nota-insp">Así se declara el bloque, como un componente de Strapi. El formulario del inspector se genera a partir de esta descripción.</p>
      <h3 className="cms-panel__titulo">Componente</h3>
      <BloqueCodigo etiqueta="Esquema del componente" texto={esquema} onAviso={onAviso} />
      <h3 className="cms-panel__titulo">Cómo viaja a la base</h3>
      <BloqueCodigo etiqueta={anidado ? "Bloque anidado" : "Fila de cms_bloques"} texto={fila} onAviso={onAviso} />
      {anidado && <p className="cms-ayuda">Un bloque dentro de una columna no tiene fila propia: viaja dentro de props.items[columna].bloques del bloque de columnas.</p>}
      <p className="cms-ayuda">Las claves que empiezan por «_» (_estilo, _diseno, _mov, _oculto) viajan dentro de props.</p>
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
