/* =============================================================================
   UDrive · lo que un informe decide de su aspecto (pestaña «Documento», 0190).

   Tres paneles:
     · Estilo: cuál se aplicó, papel (Carta o A4), ajustes de este informe,
       actualizar si el estilo cambió, guardar este aspecto como estilo propio.
     · Portada: textos, foto y su encuadre (arrastrar, zoom, alinear arriba,
       centro o abajo, cubrir o contener, velo).
     · Cierre: mensaje, responsables, créditos, contacto, frase de la
       contraportada y si el informe lleva cierre y contraportada.
   Todo lo que se guarda va en el JSON del informe (lib/documento.ts); lo que es
   del estilo vive en el estilo (panel de estilo, lib/estilo.ts).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Ventana } from "../../../../components/espacio/Ventana";
import { Encuadre } from "../../../informes/vista/EditorPortada";
import { useCrearItem, useArchivos } from "../../datos";
import { leerEstilo, useEstilosGuardados } from "../../datosEstilo";
import { aplicarEstilo, conAjustes, descripcionDelEstilo, sinAjustes } from "../../lib/aplicarEstilo";
import { CIERRE_VACIO, MAX_FIRMAS } from "../../lib/documento";
import type { Cierre, Documento, FotoPortada, Portada } from "../../lib/documento";
import { ESTILO_SIN_ELEGIR, FABRICAS, PAPEL_PX, avisosDeEstilo, estiloDeFabrica, estiloDelInforme, estiloParaGuardar, hayAjustes, papelDe } from "../../lib/estilo";
import { nombreUnico } from "../../lib/nombres";
import type { Recursos } from "../../salida/recursos";
import { ControlFoto } from "./ControlFoto";
import { PanelEstilo } from "./PanelEstilo";
import { ListaAvisos } from "./Revision";

type CambiarDoc = (fn: (d: Documento) => Documento, clave?: string) => void;

const FOTO_BASE: FotoPortada = { x: 50, y: 0, zoom: 1, ajuste: "cubrir", velo: 0 };

/* ---------- el estilo del informe ---------------------------------------------------------------------------- */

export function EstiloDelInforme({
  doc,
  editable,
  cambiarDoc,
  carpetaId,
  decir,
  abrirEstilo,
  recursos,
}: {
  doc: Documento;
  editable: boolean;
  cambiarDoc: CambiarDoc;
  carpetaId: string | null;
  decir(m: string): void;
  abrirEstilo(id: string): void;
  recursos: Recursos;
}) {
  const { estilos } = useEstilosGuardados();
  const archivos = useArchivos();
  const crear = useCrearItem();
  const [ajustando, setAjustando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const d = descripcionDelEstilo(doc);
  const efectivo = useMemo(() => estiloDelInforme(doc), [doc]);
  const papel = papelDe(doc.papel, efectivo);
  const base = useMemo(() => doc.instantanea ?? estiloDeFabrica(ESTILO_SIN_ELEGIR), [doc.instantanea]);
  const archivo = estilos.find((a) => a.id === d.id);
  const hayVersionNueva = Boolean(archivo && doc.estilo && archivo.updated_at !== doc.estilo.v);
  const opciones = [...FABRICAS.map((f) => ({ id: f.id, nombre: f.nombre })), ...estilos.map((a) => ({ id: a.id, nombre: a.nombre }))];
  const actualEnLista = opciones.some((o) => o.id === d.id);

  const aplicar = (id: string, conservarAjustes = false) =>
    void leerEstilo(id)
      .then((r) => {
        if (!r) return decir("No se pudo leer ese estilo: ya no existe o no tiene permiso para verlo.");
        cambiarDoc((prev) => {
          const nuevo = aplicarEstilo(prev, { id, v: r.v }, r.estilo);
          return conservarAjustes && prev.ajustes ? { ...nuevo, ajustes: prev.ajustes } : nuevo;
        }, "estilo");
      })
      .catch((e: Error) => decir(e.message));

  const guardarComoEstilo = () => {
    const existentes = (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpetaId).map((a) => a.nombre);
    const nombre = nombreUnico(nombreNuevo.trim() || `Estilo de ${doc.portada.titulo.trim() || "informe"}`, existentes);
    crear.mutate(
      { tipo: "estilo", nombre, carpeta: carpetaId, contenido: estiloParaGuardar({ ...efectivo, nombre: nombre.slice(0, 60) }) },
      {
        onSuccess: (id) => {
          setNombreNuevo("");
          decir(`Quedó guardado como «${nombre}» en la carpeta de este informe.`);
          aplicar(id);
        },
        onError: (e) => decir(e.message),
      },
    );
  };

  return (
    <div className="ud-doc-tarjeta">
      <h3>Estilo del informe</h3>
      <p className="ud-sub">Cómo se ve en papel: portada, letra, tablas, cabecera y pie. El contenido no cambia al cambiar de estilo.</p>
      <label className="es-fl">
        Estilo
        <select className="es-inp" value={d.id} disabled={!editable} onChange={(e) => aplicar(e.target.value)}>
          <optgroup label="De fábrica">
            {FABRICAS.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </optgroup>
          {estilos.length ? (
            <optgroup label="Mis estilos">
              {estilos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </optgroup>
          ) : null}
          {!actualEnLista ? <option value={d.id}>{d.nombre}</option> : null}
        </select>
      </label>
      <p className="es-note">
        {d.deFabrica ? "Estilo de fábrica." : "Estilo propio."} {d.ajustado ? "Este informe tiene ajustes sobre el estilo." : ""} {doc.estilo ? "" : "Sin elegir uno, sale con el aspecto de siempre de UDrive."}
      </p>
      {hayVersionNueva ? (
        <p className="ud-aviso" data-t="aviso" role="status">
          El estilo tiene una versión nueva. Este informe sigue con la copia que guardó.
          {editable ? <> <button type="button" className="es-btn es-btn--sm" onClick={() => aplicar(d.id, true)}>Actualizar</button></> : null}
        </p>
      ) : null}
      <div>
        <span className="es-fl" style={{ marginBottom: 4 }}>Papel</span>
        <div className="es-seg" role="group" aria-label="Papel del informe">
          {(["carta", "a4"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={papel === p} disabled={!editable} onClick={() => cambiarDoc((prev) => ({ ...prev, papel: p }), "papel")}>
              {PAPEL_PX[p].nombre}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {editable ? <button type="button" className="es-btn es-btn--sm" onClick={() => setAjustando(true)}>Ajustar en este informe</button> : null}
        {editable && hayAjustes(doc.ajustes) ? <button type="button" className="es-btn es-btn--sm" onClick={() => cambiarDoc((prev) => sinAjustes(prev), "estilo")}>Quitar los ajustes</button> : null}
        {!d.deFabrica ? <button type="button" className="es-btn es-btn--sm" onClick={() => abrirEstilo(d.id)}>Editar el estilo</button> : null}
      </div>
      {editable ? (
        <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
          <label className="es-fl">
            Guardar este aspecto como estilo propio
            <input type="text" className="es-inp" value={nombreNuevo} maxLength={60} placeholder="Informes de mi facultad" onChange={(e) => setNombreNuevo(e.target.value)} />
          </label>
          <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} disabled={crear.isPending} onClick={guardarComoEstilo}>Guardar en la carpeta del informe</button>
        </div>
      ) : null}
      <ListaAvisos items={avisosDeEstilo(efectivo)} />

      {ajustando ? (
        <Ventana
          titulo="Ajustar el estilo en este informe"
          onCerrar={() => setAjustando(false)}
          pie={
            <>
              <span className="es-note">Los ajustes valen solo para este informe. El estilo no cambia.</span>
              <button type="button" className="es-btn es-btn--pri" onClick={() => setAjustando(false)}>Listo</button>
            </>
          }
        >
          <div className="es-dbody">
            <PanelEstilo
              estilo={efectivo}
              base={base}
              editable={editable}
              muestra={doc.portada}
              nombresImagen={recursos.nombres}
              carpetaId={carpetaId}
              motivoFoto={d.deFabrica ? "Esta foto queda como ajuste de este informe. Para que sea parte de un estilo, guarde el aspecto como estilo propio." : undefined}
              onChange={(e) => cambiarDoc((prev) => conAjustes(prev, e), "ajustes")}
            />
          </div>
        </Ventana>
      ) : null}
    </div>
  );
}

/* ---------- la portada del informe ----------------------------------------------------------------------------- */

export function PortadaDelInforme({ doc, editable, cambiarDoc, carpetaId, recursos }: { doc: Documento; editable: boolean; cambiarDoc: CambiarDoc; carpetaId: string | null; recursos: Recursos }) {
  const poner = (c: Partial<Portada>) => cambiarDoc((d) => ({ ...d, portada: { ...d.portada, ...c } }), `portada:${Object.keys(c).join(",")}`);
  const estilo = useMemo(() => estiloDelInforme(doc), [doc]);
  const p = doc.portada;
  const foto = p.foto ?? FOTO_BASE;
  const medidas = PAPEL_PX[papelDe(doc.papel, estilo)];
  const usaFoto = estilo.portada.comp === 1 || estilo.portada.comp === 0;
  const campo = (etiqueta: string, valor: string | undefined, max: number, clave: keyof Portada, opcional = true) => (
    <label className="es-fl">
      {etiqueta}
      {opcional ? <span className="es-note"> (opcional)</span> : null}
      <input type="text" className="es-inp" value={valor ?? ""} maxLength={max} disabled={!editable} onChange={(e) => poner({ [clave]: e.target.value } as Partial<Portada>)} />
    </label>
  );
  return (
    <>
      <div>
        <h3>Portada</h3>
        <p className="ud-sub">Lo que no se llena no se imprime ni deja espacio. El logo de la Universidad va siempre.</p>
      </div>
      <label className="es-fl">Título<input type="text" className="es-inp" value={p.titulo} maxLength={300} disabled={!editable} onChange={(e) => poner({ titulo: e.target.value })} /></label>
      {campo("Subtítulo", p.subtitulo, 300, "subtitulo")}
      <div className="two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {campo("Autoría", p.autor, 90, "autor")}
        {campo("Afiliación", p.afiliacion, 90, "afiliacion")}
      </div>
      <div className="two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {campo("Fecha", p.fecha, 40, "fecha")}
        {campo("Nota", p.nota, 80, "nota")}
      </div>
      <div className="two" style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
        <label className="es-fl">Entidad<input type="text" className="es-inp" value={p.entidad} maxLength={300} disabled={!editable} onChange={(e) => poner({ entidad: e.target.value })} /></label>
        <label className="es-fl">Año<input type="text" className="es-inp" value={p.anio} maxLength={12} disabled={!editable} onChange={(e) => poner({ anio: e.target.value })} /></label>
      </div>
      {usaFoto ? (
        <ControlFoto
          valor={{ imagenId: p.imagenId ?? "", ...foto }}
          editable={editable}
          carpetaId={carpetaId}
          aspecto={`${medidas.mm[0]} / ${Math.round(medidas.mm[1] * 0.42 * 10) / 10}`}
          titulo="Foto de portada de este informe"
          onChange={(v) =>
            cambiarDoc((d) => {
              const { imagenId: _i, foto: _f, ...resto } = d.portada;
              void _i;
              void _f;
              return { ...d, portada: v.imagenId ? { ...resto, imagenId: v.imagenId, foto: { x: v.x, y: v.y, zoom: v.zoom, ajuste: v.ajuste, velo: v.velo } } : resto };
            }, "portada:foto")
          }
        />
      ) : (
        <p className="es-note">La composición actual no usa foto. Cambie la composición en el estilo («Ajustar en este informe») para poner una.</p>
      )}
      {usaFoto && !p.imagenId && estilo.portada.foto.imagenId ? <p className="es-note">Este informe usa la foto del estilo. Si sube otra aquí, manda la del informe.</p> : null}
    </>
  );
}

/* ---------- el cierre y la contraportada ---------------------------------------------------------------------------- */

export function CierreDelInforme({ doc, editable, cambiarDoc }: { doc: Documento; editable: boolean; cambiarDoc: CambiarDoc }) {
  const c: Cierre = doc.cierre ?? CIERRE_VACIO;
  const poner = (patch: Partial<Cierre>) => cambiarDoc((d) => ({ ...d, cierre: { ...(d.cierre ?? CIERRE_VACIO), ...patch } }), `cierre:${Object.keys(patch).join(",")}`);
  const firma = (i: number, campo: "nombre" | "cargo", v: string) => {
    const lista = [...c.firmas];
    while (lista.length <= i) lista.push({ nombre: "", cargo: "" });
    lista[i] = { ...lista[i], [campo]: v };
    poner({ firmas: lista.slice(0, MAX_FIRMAS) });
  };
  const texto = (etiqueta: string, valor: string, max: number, clave: keyof Cierre) => (
    <label className="es-fl">
      {etiqueta}
      <input type="text" className="es-inp" value={valor} maxLength={max} disabled={!editable} onChange={(e) => poner({ [clave]: e.target.value } as Partial<Cierre>)} />
    </label>
  );
  return (
    <div className="ud-doc-tarjeta">
      <h3>Cierre y contraportada</h3>
      <p className="ud-sub">Todo es opcional. Lo que se deja vacío no se imprime.</p>
      <label className="ud-est-chk"><input type="checkbox" checked={c.conCierre} disabled={!editable} onChange={(e) => poner({ conCierre: e.target.checked })} />Agregar una página de cierre al final</label>
      <label className="ud-est-chk"><input type="checkbox" checked={c.conContraportada} disabled={!editable} onChange={(e) => poner({ conContraportada: e.target.checked })} />Agregar contraportada</label>
      {c.conCierre ? (
        <>
          <label className="es-fl">Mensaje de cierre<textarea className="es-inp" rows={4} value={c.mensaje} maxLength={420} disabled={!editable} onChange={(e) => poner({ mensaje: e.target.value })} /></label>
          <span className="es-fl">Responsables (hasta tres)</span>
          {Array.from({ length: MAX_FIRMAS }, (_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input type="text" className="es-inp" aria-label={`Nombre, responsable ${i + 1}`} placeholder="Nombre" maxLength={40} value={c.firmas[i]?.nombre ?? ""} disabled={!editable} onChange={(e) => firma(i, "nombre", e.target.value)} />
              <input type="text" className="es-inp" aria-label={`Cargo, responsable ${i + 1}`} placeholder="Cargo" maxLength={46} value={c.firmas[i]?.cargo ?? ""} disabled={!editable} onChange={(e) => firma(i, "cargo", e.target.value)} />
            </div>
          ))}
          <label className="es-fl">Créditos<textarea className="es-inp" rows={2} value={c.creditos} maxLength={240} disabled={!editable} onChange={(e) => poner({ creditos: e.target.value })} /></label>
        </>
      ) : null}
      {c.conCierre || c.conContraportada ? (
        <>
          {texto("Dirección", c.direccion, 90, "direccion")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {texto("Correo", c.correo, 80, "correo")}
            {texto("Teléfono", c.telefono, 36, "telefono")}
          </div>
          {texto("Sitio web", c.web, 80, "web")}
          <p className="es-note">El correo y el teléfono se imprimen como texto, no como enlace, para que sirvan también en papel.</p>
        </>
      ) : null}
      {c.conContraportada ? texto("Frase de la contraportada", c.frase, 90, "frase") : null}
    </div>
  );
}
