/* =============================================================================
   UDrive · el panel de un estilo de informe (0190).

   Cinco grupos con pocos controles cada uno (Portada, Texto, Tablas y gráficas,
   Cabecera y pie, Página) y, dentro de cada uno, «Más opciones» plegado con lo
   avanzado. Cada grupo se restablece a como estaba al abrir el estilo. Lo usan
   el editor de estilos (/admin/udrive/estilo/:id) y el diálogo «Ajustar en este
   informe». Todo valor pasa por normalizarEstilo: los límites (contraste del
   acento, tamaño y márgenes del texto, intensidad de la marca de agua) no se
   pueden saltar desde aquí.

   Lo que es de un informe y no del estilo (el título, la autoría, la foto de
   portada y su encuadre, el cierre) se edita en «Documento».
   ========================================================================== */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { contraste, normalizarHex, normalizarMonograma } from "../../../informes/vista/perfil";
import type { Portada } from "../../lib/documento";
import { ACENTOS, COMPOSICIONES, FAMILIAS, PAPEL_PX, acentoValido, normalizarEstilo, oscurecerHasta45 } from "../../lib/estilo";
import type { Estilo } from "../../lib/estilo";
import { PortadaEstilo } from "../../salida/Portadas";
import { Escalado } from "../documento/Escalado";
import { SelectorArchivo } from "../documento/Selectores";
import { ControlFoto } from "./ControlFoto";
import "../documento/documento.css";

const coma = (n: number, d = 1): string => n.toFixed(d).replace(".", ",");
const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Opciones excluyentes con aspecto de botones unidos. */
function Seg<T extends string | number | boolean>({ etiqueta, valor, opciones, onChange, deshabilitado }: { etiqueta: string; valor: T; opciones: { id: T; texto: string }[]; onChange(v: T): void; deshabilitado?: boolean }) {
  return (
    <div>
      <span className="ud-est-lab">{etiqueta}</span>
      <div className="es-seg" role="group" aria-label={etiqueta} style={{ flexWrap: "wrap" }}>
        {opciones.map((o) => (
          <button key={String(o.id)} type="button" aria-pressed={valor === o.id} disabled={deshabilitado} onClick={() => onChange(o.id)}>
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

function Rango({ id, etiqueta, valor, min, max, paso, texto, onChange, deshabilitado }: { id: string; etiqueta: string; valor: number; min: number; max: number; paso: number; texto: string; onChange(v: number): void; deshabilitado?: boolean }) {
  return (
    <div className="ud-est-rango">
      <label className="ud-est-lab" htmlFor={id} style={{ marginBottom: 0 }}>{etiqueta}</label>
      <output htmlFor={id}>{texto}</output>
      <input id={id} type="range" min={min} max={max} step={paso} value={valor} disabled={deshabilitado} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={texto} />
    </div>
  );
}

function Casilla({ texto, marcado, onChange, deshabilitado }: { texto: string; marcado: boolean; onChange(v: boolean): void; deshabilitado?: boolean }) {
  return (
    <label className="ud-est-chk">
      <input type="checkbox" checked={marcado} disabled={deshabilitado} onChange={(e) => onChange(e.target.checked)} />
      {texto}
    </label>
  );
}

function Grupo({ titulo, abierto, onRestablecer, editable, children, mas }: { titulo: string; abierto?: boolean; onRestablecer(): void; editable: boolean; children: ReactNode; mas?: ReactNode }) {
  return (
    <details className="ud-est-grupo" open={abierto}>
      <summary>{titulo}</summary>
      <div className="ud-est-cuerpo">
        {children}
        {mas ? (
          <details className="ud-est-mas">
            <summary>Más opciones</summary>
            <div>{mas}</div>
          </details>
        ) : null}
        {editable ? <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={onRestablecer}>Restablecer {titulo.toLowerCase()}</button> : null}
      </div>
    </details>
  );
}

export interface PropsPanelEstilo {
  estilo: Estilo;
  /** Cómo estaba el estilo al abrirlo: a esto vuelve «Restablecer». */
  base: Estilo;
  onChange(e: Estilo): void;
  editable: boolean;
  /** La portada del informe (o una de muestra) para las miniaturas de composición. */
  muestra: Portada;
  nombresImagen: ReadonlyMap<string, string>;
  /** Carpeta de UDrive donde se guardan las imágenes que se suben desde el panel. */
  carpetaId: string | null;
  /** Por qué no se puede cambiar la foto aquí, si no se puede (con lo que hay que hacer). */
  motivoFoto?: string;
}

export function PanelEstilo({ estilo, base, onChange, editable, muestra, nombresImagen, carpetaId, motivoFoto }: PropsPanelEstilo) {
  const [hex, setHex] = useState(estilo.portada.acento);
  const [mensajeAcento, setMensajeAcento] = useState("");
  const [oscurecible, setOscurecible] = useState("");
  const [mono, setMono] = useState(estilo.portada.mono);
  const [mensajeMono, setMensajeMono] = useState("");
  const [elegir, setElegir] = useState<null | "logo" | "marca">(null);
  useEffect(() => setHex(estilo.portada.acento), [estilo.portada.acento]);
  useEffect(() => setMono(estilo.portada.mono), [estilo.portada.mono]);

  const cambiar = <G extends "portada" | "texto" | "tablas" | "cabpie" | "pagina">(g: G, patch: Partial<Estilo[G]>) => onChange(normalizarEstilo({ ...estilo, [g]: { ...estilo[g], ...patch } }, estilo));
  const restablecer = (g: "portada" | "texto" | "tablas" | "cabpie" | "pagina") => onChange(normalizarEstilo({ ...estilo, [g]: clon(base[g]) }, estilo));

  const ponerAcento = (valor: string) => {
    const h = normalizarHex(valor);
    if (!h) {
      setMensajeAcento("Escriba un color como #1f5fbf.");
      setOscurecible("");
      return;
    }
    const r = contraste(h, "#ffffff");
    if (!acentoValido(h)) {
      setMensajeAcento(`Ese color da ${coma(r)}:1 con texto blanco y necesita 4,5:1.`);
      setOscurecible(h);
      return;
    }
    setMensajeAcento("");
    setOscurecible("");
    cambiar("portada", { acento: h });
  };

  const ponerMono = (valor: string) => {
    const limpio = valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    setMono(limpio);
    const ok = normalizarMonograma(limpio);
    if (!ok) {
      setMensajeMono("El monograma lleva de 3 a 4 letras o números.");
      return;
    }
    setMensajeMono("");
    cambiar("portada", { mono: ok });
  };

  const comp = COMPOSICIONES.find((c) => c.id === estilo.portada.comp) ?? COMPOSICIONES[0];
  const ratio = contraste(estilo.portada.acento, "#ffffff");
  const marca = estilo.cabpie.marca;
  const nombreImg = (id: string) => (id ? (nombresImagen.get(id) ?? "Imagen que no veo") : "");

  return (
    <div className="ud-est">
      <Grupo titulo="Portada" abierto editable={editable} onRestablecer={() => restablecer("portada")}>
        <div>
          <span className="ud-est-lab" id="ud-comp">Composición</span>
          <div className="ud-est-comps" role="group" aria-labelledby="ud-comp">
            {COMPOSICIONES.filter((c) => c.id !== 0 || estilo.portada.comp === 0).map((c) => (
              <button key={c.id} type="button" className="ud-est-comp" aria-pressed={estilo.portada.comp === c.id} disabled={!editable} onClick={() => cambiar("portada", { comp: c.id })}>
                <div style={{ width: 62, pointerEvents: "none" }}>
                  {c.id === 0 ? (
                    <div style={{ height: 80, display: "grid", placeItems: "center", background: "#eef5fc", color: "#14307a", fontSize: 10 }}>Clásica</div>
                  ) : (
                    <Escalado escala={62 / 816} ancho={816}>
                      <PortadaEstilo d={{ portada: muestra, estilo: { ...estilo, portada: { ...estilo.portada, comp: c.id } }, papel: estilo.pagina.papel, fotoUrl: null, logoPropioUrl: null }} />
                    </Escalado>
                  )}
                </div>
                {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="ud-est-lab" id="ud-acento">Color de acento</span>
          <div className="ud-est-sw" role="group" aria-labelledby="ud-acento">
            {ACENTOS.map((a) => (
              <button key={a} type="button" aria-label={`Color ${a}`} aria-pressed={estilo.portada.acento === a} style={{ background: a }} disabled={!editable} onClick={() => ponerAcento(a)} />
            ))}
            <input type="color" aria-label="Elegir otro color de acento" value={estilo.portada.acento} disabled={!editable} onChange={(e) => ponerAcento(e.target.value)} style={{ width: 34, height: 30, padding: 0, border: "1px solid var(--es-line-2)", background: "#fff" }} />
            <input type="text" className="es-inp" aria-label="Código del color, por ejemplo #1f5fbf" value={hex} maxLength={7} disabled={!editable} spellCheck={false} style={{ width: 96 }} onChange={(e) => { setHex(e.target.value); if (normalizarHex(e.target.value) && e.target.value.length >= 7) ponerAcento(e.target.value); }} onBlur={() => ponerAcento(hex)} />
          </div>
          <p className="ud-est-msg" data-ok={mensajeAcento ? undefined : "true"} role="status">
            {mensajeAcento || `El texto blanco se lee bien sobre este color (${coma(ratio)}:1).`}
            {oscurecible ? (
              <>
                {" "}
                <button type="button" className="es-btn es-btn--sm" onClick={() => { cambiar("portada", { acento: oscurecerHasta45(oscurecible) }); setMensajeAcento(""); setOscurecible(""); }}>Oscurecer hasta que se lea</button>
              </>
            ) : null}
          </p>
        </div>

        <div>
          <span className="ud-est-lab">Logos</span>
          <Casilla texto="Logo de la Universidad" marcado onChange={() => undefined} deshabilitado />
          <p className="ud-est-obligatorio">Es obligatorio en todo estilo: no se puede quitar.</p>
          <Casilla texto="Monograma" marcado={estilo.portada.logos.mono} deshabilitado={!editable} onChange={(v) => cambiar("portada", { logos: { ...estilo.portada.logos, mono: v } })} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <span className="es-inp" style={{ flex: 1, minWidth: 120 }}>{nombreImg(estilo.portada.logos.propioId) || "Sin logo propio"}</span>
            {editable ? <button type="button" className="es-btn es-btn--sm" onClick={() => setElegir("logo")}>{estilo.portada.logos.propioId ? "Cambiar" : "Elegir logo propio"}</button> : null}
            {editable && estilo.portada.logos.propioId ? <button type="button" className="es-btn es-btn--sm" onClick={() => cambiar("portada", { logos: { ...estilo.portada.logos, propioId: "" } })}>Quitar</button> : null}
          </div>
        </div>

        <div>
          <label className="ud-est-lab" htmlFor="ud-mono">Monograma (3 a 4 letras)</label>
          <input id="ud-mono" type="text" className="es-inp" value={mono} maxLength={4} disabled={!editable} spellCheck={false} style={{ width: 110 }} onChange={(e) => ponerMono(e.target.value)} />
          <p className="ud-est-msg" role="status">{mensajeMono}</p>
        </div>

        {comp.conAlineacion ? (
          <Seg etiqueta="Alineación del texto" valor={estilo.portada.alinea} deshabilitado={!editable} opciones={[{ id: "izq", texto: "Izquierda" }, { id: "centro", texto: "Centro" }]} onChange={(v) => cambiar("portada", { alinea: v })} />
        ) : null}
        <Seg etiqueta="Tamaño del título" valor={estilo.portada.tam} deshabilitado={!editable} opciones={[{ id: 0, texto: "S" }, { id: 1, texto: "M" }, { id: 2, texto: "L" }]} onChange={(v) => cambiar("portada", { tam: v })} />
        {comp.id === 1 ? (
          <>
            <Seg etiqueta="Fondo de la portada" valor={estilo.portada.fondo === "color" ? "color" : "foto"} deshabilitado={!editable} opciones={[{ id: "foto", texto: "Con foto" }, { id: "color", texto: "Solo color" }]} onChange={(v) => cambiar("portada", { fondo: v })} />
            {estilo.portada.fondo !== "color" ? (
              <ControlFoto
                valor={estilo.portada.foto}
                onChange={(f) => cambiar("portada", { foto: f })}
                editable={editable}
                carpetaId={carpetaId}
                aspecto={`${PAPEL_PX[estilo.pagina.papel].mm[0]} / ${Math.round(PAPEL_PX[estilo.pagina.papel].mm[1] * 0.42 * 10) / 10}`}
                titulo="Foto de portada del estilo"
                motivoBloqueo={editable ? motivoFoto : "Este estilo es de solo lectura: duplíquelo para cambiar la foto."}
              />
            ) : null}
          </>
        ) : null}
        <Seg etiqueta="Contraportada" valor={estilo.portada.tono} deshabilitado={!editable} opciones={[{ id: "marino", texto: "Azul marino" }, { id: "acento", texto: "Color de acento" }, { id: "foto", texto: "Blanco con foto" }]} onChange={(v) => cambiar("portada", { tono: v })} />
        <p className="es-note">Cada informe puede poner su propia foto en «Documento»: manda sobre la del estilo. Los textos y el cierre también son de cada informe.</p>
      </Grupo>

      <Grupo
        titulo="Texto"
        abierto
        editable={editable}
        onRestablecer={() => restablecer("texto")}
        mas={
          <>
            <Rango id="ud-mx" etiqueta="Márgenes laterales" valor={estilo.texto.mx} min={14} max={30} paso={1} texto={`${coma(estilo.texto.mx, estilo.texto.mx % 1 ? 1 : 0)} mm`} deshabilitado={!editable} onChange={(v) => cambiar("texto", { mx: v })} />
            <Rango id="ud-lh" etiqueta="Interlineado exacto" valor={estilo.texto.lh} min={1.3} max={1.8} paso={0.05} texto={coma(estilo.texto.lh, 2)} deshabilitado={!editable} onChange={(v) => cambiar("texto", { lh: v })} />
            <Seg etiqueta="Color de los títulos" valor={estilo.texto.tcol} deshabilitado={!editable} opciones={[{ id: "marino", texto: "Azul marino" }, { id: "acento", texto: "Acento" }]} onChange={(v) => cambiar("texto", { tcol: v })} />
            <Casilla texto="Sangría en la primera línea de cada párrafo" marcado={estilo.texto.sang} deshabilitado={!editable} onChange={(v) => cambiar("texto", { sang: v })} />
          </>
        }
      >
        <div className="ud-est-fila">
          <label className="ud-est-lab">
            Letra del cuerpo
            <select className="es-inp" value={estilo.texto.fb} disabled={!editable} onChange={(e) => cambiar("texto", { fb: e.target.value as Estilo["texto"]["fb"] })}>
              {FAMILIAS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="ud-est-lab">
            Letra de los títulos
            <select className="es-inp" value={estilo.texto.ft} disabled={!editable} onChange={(e) => cambiar("texto", { ft: e.target.value as Estilo["texto"]["ft"] })}>
              {FAMILIAS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
        </div>
        <Rango id="ud-fs" etiqueta="Tamaño del cuerpo" valor={estilo.texto.fs} min={9} max={12} paso={0.5} texto={`${coma(estilo.texto.fs)} pt`} deshabilitado={!editable} onChange={(v) => cambiar("texto", { fs: v })} />
        <Seg etiqueta="Interlineado" valor={estilo.texto.lh} deshabilitado={!editable} opciones={[{ id: 1.35, texto: "Compacto" }, { id: 1.5, texto: "Normal" }, { id: 1.7, texto: "Amplio" }]} onChange={(v) => cambiar("texto", { lh: v })} />
        <div className="ud-est-fila">
          <Seg etiqueta="Columnas" valor={estilo.texto.cols} deshabilitado={!editable} opciones={[{ id: 1, texto: "Una" }, { id: 2, texto: "Dos" }]} onChange={(v) => cambiar("texto", { cols: v })} />
          <Seg etiqueta="Alineación" valor={estilo.texto.just} deshabilitado={!editable} opciones={[{ id: false, texto: "Izquierda" }, { id: true, texto: "Justificado" }]} onChange={(v) => cambiar("texto", { just: v })} />
        </div>
        <Seg etiqueta="Capítulos" valor={estilo.texto.cap} deshabilitado={!editable} opciones={[{ id: "sello", texto: "Con sello" }, { id: "filete", texto: "Con filete" }, { id: "sencillo", texto: "Sencillo" }, ...(estilo.texto.cap === "clasico" ? [{ id: "clasico" as const, texto: "Clásico" }] : [])]} onChange={(v) => cambiar("texto", { cap: v })} />
        <Casilla texto="Numerar los capítulos (1, 1.1)" marcado={estilo.texto.num} deshabilitado={!editable} onChange={(v) => cambiar("texto", { num: v })} />
        <Seg etiqueta="Cuadro destacado" valor={estilo.texto.dest} deshabilitado={!editable} opciones={[{ id: "caja", texto: "Caja" }, { id: "filetes", texto: "Filetes" }, { id: "sangrado", texto: "Sangrado" }, ...(estilo.texto.dest === "barra" ? [{ id: "barra" as const, texto: "Barra" }] : [])]} onChange={(v) => cambiar("texto", { dest: v })} />
      </Grupo>

      <Grupo
        titulo="Tablas y gráficas"
        editable={editable}
        onRestablecer={() => restablecer("tablas")}
        mas={
          <>
            <Seg etiqueta="Rótulo de la figura" valor={estilo.tablas.capEstilo} deshabilitado={!editable} opciones={[{ id: "fuerte", texto: "Tabla 1. Título" }, { id: "apa", texto: "A la APA" }, ...(estilo.tablas.capEstilo === "clasico" ? [{ id: "clasico" as const, texto: "Clásico" }] : [])]} onChange={(v) => cambiar("tablas", { capEstilo: v })} />
            <Seg etiqueta="Nota de fuente" valor={estilo.tablas.nota} deshabilitado={!editable} opciones={[{ id: "caja", texto: "En caja" }, { id: "texto", texto: "En texto" }, ...(estilo.tablas.nota === "clasico" ? [{ id: "clasico" as const, texto: "Clásica" }] : [])]} onChange={(v) => cambiar("tablas", { nota: v })} />
            <Seg etiqueta="Densidad de la tabla" valor={estilo.tablas.dens} deshabilitado={!editable} opciones={[{ id: "normal", texto: "Normal" }, { id: "compacta", texto: "Compacta" }]} onChange={(v) => cambiar("tablas", { dens: v })} />
          </>
        }
      >
        <Seg etiqueta="Encabezado de la tabla" valor={estilo.tablas.enc} deshabilitado={!editable} opciones={[{ id: "marino", texto: "Marino" }, { id: "acento", texto: "Acento" }, { id: "claro", texto: "Claro" }, ...(estilo.tablas.enc === "clasico" ? [{ id: "clasico" as const, texto: "Clásico" }] : [])]} onChange={(v) => cambiar("tablas", { enc: v })} />
        <Seg etiqueta="Bordes" valor={estilo.tablas.bordes} deshabilitado={!editable} opciones={[{ id: "horiz", texto: "Horizontales" }, { id: "rejilla", texto: "Rejilla" }, { id: "apa", texto: "A la APA" }, ...(estilo.tablas.bordes === "clasico" ? [{ id: "clasico" as const, texto: "Clásicos" }] : [])]} onChange={(v) => cambiar("tablas", { bordes: v })} />
        <Casilla texto="Filas en cebra" marcado={estilo.tablas.cebra} deshabilitado={!editable} onChange={(v) => cambiar("tablas", { cebra: v })} />
        <Casilla texto="Mapa de calor (cuando la tabla lo define)" marcado={estilo.tablas.calor} deshabilitado={!editable} onChange={(v) => cambiar("tablas", { calor: v })} />
        <Seg etiqueta="Título de tablas y gráficas" valor={estilo.tablas.capPos} deshabilitado={!editable} opciones={[{ id: "arriba", texto: "Arriba" }, { id: "abajo", texto: "Abajo" }]} onChange={(v) => cambiar("tablas", { capPos: v })} />
        <p className="es-note">Las gráficas conservan la paleta de datos de UDES en Cifras: el acento no las pinta.</p>
      </Grupo>

      <Grupo
        titulo="Cabecera y pie"
        editable={editable}
        onRestablecer={() => restablecer("cabpie")}
        mas={
          <>
            <Rango id="ud-marca-tam" etiqueta="Intensidad de la marca de agua" valor={marca.opacidad} min={5} max={15} paso={1} texto={`${marca.opacidad} %`} deshabilitado={!editable || marca.modo === "ninguna"} onChange={(v) => cambiar("cabpie", { marca: { ...marca, opacidad: v } })} />
            <Seg etiqueta="Tamaño de la marca" valor={marca.tam} deshabilitado={!editable || marca.modo === "ninguna"} opciones={[{ id: "m", texto: "Mediana" }, { id: "g", texto: "Grande" }]} onChange={(v) => cambiar("cabpie", { marca: { ...marca, tam: v } })} />
            <Casilla texto="Filete sobre el pie" marcado={estilo.cabpie.filetePie} deshabilitado={!editable} onChange={(v) => cambiar("cabpie", { filetePie: v })} />
            <Casilla texto="Dibujo de edificios en la franja (cabecera de dos niveles)" marcado={estilo.cabpie.edif} deshabilitado={!editable} onChange={(v) => cambiar("cabpie", { edif: v })} />
            <Casilla texto="Autoría y título en el pie" marcado={estilo.cabpie.pieTexto} deshabilitado={!editable} onChange={(v) => cambiar("cabpie", { pieTexto: v })} />
          </>
        }
      >
        <Seg etiqueta="Cabecera" valor={estilo.cabpie.cab} deshabilitado={!editable} opciones={[{ id: "dos", texto: "Dos niveles" }, { id: "simple", texto: "Sencilla" }, { id: "ninguna", texto: "Ninguna" }, ...(estilo.cabpie.cab === "clasica" ? [{ id: "clasica" as const, texto: "Clásica" }] : [])]} onChange={(v) => cambiar("cabpie", { cab: v })} />
        <Seg etiqueta="Número de página" valor={estilo.cabpie.folio} deshabilitado={!editable} opciones={[{ id: "exterior", texto: "Borde exterior" }, { id: "centro", texto: "Centrado" }, { id: "derecha", texto: "Derecha" }]} onChange={(v) => cambiar("cabpie", { folio: v })} />
        <Seg etiqueta="Marca de agua" valor={marca.modo} deshabilitado={!editable} opciones={[{ id: "ninguna", texto: "Ninguna" }, { id: "texto", texto: "Texto" }, { id: "imagen", texto: "Imagen" }, ...(marca.modo === "clasica" ? [{ id: "clasica" as const, texto: "Clásica" }] : [])]} onChange={(v) => cambiar("cabpie", { marca: { ...marca, modo: v } })} />
        {marca.modo === "texto" ? (
          <div>
            <label className="ud-est-lab" htmlFor="ud-marca-texto">Texto de la marca (hasta 24 caracteres)</label>
            <input id="ud-marca-texto" type="text" className="es-inp" value={marca.texto} maxLength={24} disabled={!editable} onChange={(e) => cambiar("cabpie", { marca: { ...marca, texto: e.target.value } })} />
          </div>
        ) : null}
        {marca.modo === "imagen" ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span className="es-inp" style={{ flex: 1, minWidth: 120 }}>{nombreImg(marca.imagenId) || "Sin imagen"}</span>
            {editable ? <button type="button" className="es-btn es-btn--sm" onClick={() => setElegir("marca")}>{marca.imagenId ? "Cambiar" : "Elegir imagen"}</button> : null}
          </div>
        ) : null}
        <Casilla texto="Poner «BORRADOR» mientras el informe no esté aprobado" marcado={estilo.cabpie.borradorAuto} deshabilitado={!editable || marca.modo === "clasica"} onChange={(v) => cambiar("cabpie", { borradorAuto: v })} />
        <p className="es-note">La marca de agua va horizontal, entre 5 y 15 % de intensidad, y no aparece en la portada. Con más de 10 % se avisa porque el texto de abajo pierde contraste.</p>
      </Grupo>

      <Grupo titulo="Página" editable={editable} onRestablecer={() => restablecer("pagina")}>
        <Seg etiqueta="Papel por defecto" valor={estilo.pagina.papel} deshabilitado={!editable} opciones={[{ id: "carta", texto: "Carta" }, { id: "a4", texto: "A4" }]} onChange={(v) => cambiar("pagina", { papel: v })} />
        <p className="es-note">Cada informe puede cambiar su papel en «Documento»; aquí solo se elige con cuál empieza.</p>
        <Casilla texto="Cada capítulo de primer nivel abre hoja" marcado={estilo.pagina.nueva1} deshabilitado={!editable} onChange={(v) => cambiar("pagina", { nueva1: v })} />
        <Casilla texto="Referencias en hoja aparte" marcado={estilo.pagina.refAparte} deshabilitado={!editable} onChange={(v) => cambiar("pagina", { refAparte: v })} />
        <Casilla texto="Sangría francesa en las referencias" marcado={estilo.pagina.sangFr} deshabilitado={!editable} onChange={(v) => cambiar("pagina", { sangFr: v })} />
        <p className="es-note">Las tablas anchas pasan a una hoja horizontal con un bloque «Salto de página» de orientación horizontal.</p>
      </Grupo>

      {elegir ? (
        <SelectorArchivo
          clase="imagen"
          actual={elegir === "logo" ? estilo.portada.logos.propioId : estilo.cabpie.marca.imagenId}
          onElegir={(a) => {
            if (elegir === "logo") cambiar("portada", { logos: { ...estilo.portada.logos, propioId: a.id } });
            else cambiar("cabpie", { marca: { ...estilo.cabpie.marca, imagenId: a.id, modo: "imagen" } });
            setElegir(null);
          }}
          onCerrar={() => setElegir(null)}
        />
      ) : null}
    </div>
  );
}
