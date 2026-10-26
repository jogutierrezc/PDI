/* =============================================================================
   UDrive · el editor de estilos de informe (/admin/udrive/estilo/:id, 0190).

   A la izquierda, el panel de estilo (Portada, Texto, Tablas y gráficas,
   Cabecera y pie, Página; lo avanzado, plegado). A la derecha, un informe de
   muestra dibujado con las mismas piezas y el mismo paginado que un informe de
   verdad, en el papel del estilo: portada, texto con tabla, lista y
   destacado, referencias, cierre y contraportada. Debajo del panel, los avisos
   de diseño en vivo. El estilo se guarda solo, como un archivo de UDrive en su
   carpeta: se mueve, se comparte y se borra como cualquier otro.

   Un estilo de solo lectura (compartido como lector) se mira y se duplica.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Aviso, useAviso } from "../../../../components/espacio/piezas";
import { Icon } from "../../../../components/ui/Icon";
import { useArchivos, useContenido, useCrearItem, useDuenos, useGuardarContenido, useRenombrar } from "../../datos";
import { ESTILO_SIN_ELEGIR, PAPEL_PX, avisosDeEstilo, estiloDeFabrica, estiloParaGuardar, normalizarEstilo } from "../../lib/estilo";
import type { Estilo } from "../../lib/estilo";
import { documentoDeMuestra, recursosDeMuestra } from "../../lib/muestra";
import { nombreUnico } from "../../lib/nombres";
import { contextoDe, numerarFiguras } from "../../lib/numeracion";
import { puedeEditar } from "../../lib/permisos";
import { fuentesDeBibliografia } from "../../lib/plan";
import { PaginasPdf } from "../../salida/PaginasPdf";
import type { EntradaPdf } from "../../salida/PaginasPdf";
import { tituloTabla } from "../../salida/Piezas";
import { Escalado } from "../documento/Escalado";
import { MarcoEditor, useAutoguardado } from "../MarcoEditor";
import "../../../../components/espacio/espacio.css";
import "../udrive.css";
import "../documento/documento.css";
import { PanelEstilo } from "./PanelEstilo";
import { ListaAvisos } from "./Revision";

export function EditorEstilo({ id }: { id: string }) {
  const navigate = useNavigate();
  const leido = useContenido(id);
  const duenos = useDuenos([id]);
  const { aviso, decir } = useAviso();

  if (leido.isPending || duenos.isPending) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Abriendo el estilo…</p></div>;
  if (leido.error || !leido.data || leido.data.tipo !== "estilo") {
    return (
      <div className="es ud">
        <div className="es-empty" style={{ margin: 24 }}>
          <b>No se pudo abrir el estilo</b>
          <span>{leido.error?.message ?? "No existe, no es un estilo de informe o no tiene permiso para verlo."}</span>
          <button type="button" className="es-btn" onClick={() => navigate("/admin/udrive")}>Volver a UDrive</button>
        </div>
      </div>
    );
  }
  const rol = duenos.data?.get(id)?.mi_rol;
  return (
    <div className="es ud">
      <Lienzo key={id} id={id} nombre={leido.data.nombre} carpetaId={leido.data.carpeta_id} contenido={leido.data.contenido} editable={puedeEditar(rol)} decir={decir} />
      <Aviso texto={aviso} />
    </div>
  );
}

function Lienzo({ id, nombre, carpetaId, contenido, editable, decir }: { id: string; nombre: string; carpetaId: string | null; contenido: unknown; editable: boolean; decir(m: string): void }) {
  const navigate = useNavigate();
  const guardar = useGuardarContenido();
  const renombrar = useRenombrar();
  const crear = useCrearItem();
  const archivos = useArchivos();
  const inicial = useMemo(() => ({ ...normalizarEstilo(contenido, estiloDeFabrica(ESTILO_SIN_ELEGIR)), nombre }), []); // eslint-disable-line react-hooks/exhaustive-deps -- se lee una vez; después manda el editor
  const [estilo, setEstilo] = useState<Estilo>(inicial);
  const [base] = useState<Estilo>(inicial);
  const [zoom, setZoom] = useState(0.62);
  const [nombreActual, setNombreActual] = useState(nombre);

  const { estado, vaciar } = useAutoguardado(editable ? estilo : null, editable, (e) => guardar.mutateAsync({ id, contenido: estiloParaGuardar({ ...e, nombre: nombreActual }) }));
  useEffect(() => () => void vaciar(), [vaciar]);

  const doc = useMemo(() => documentoDeMuestra(), []);
  const recursos = useMemo(() => recursosDeMuestra(), []);
  const entrada = useMemo<EntradaPdf>(() => {
    const titulos = (b: (typeof doc.bloques)[number]) => (b.tipo === "tabla" ? tituloTabla(b, recursos.tablas.get(b.archivoId)) : "");
    const figuras = numerarFiguras(doc, titulos);
    return {
      doc,
      titulo: doc.portada.titulo,
      recursos,
      figuras,
      bibliografia: fuentesDeBibliografia(doc),
      texto: contextoDe(doc, figuras, () => null),
      cifra: () => null,
      firmaCifras: "",
      borrador: true,
      estilo,
      papel: estilo.pagina.papel,
      fotoUrl: null,
      logoPropioUrl: null,
      marcaUrl: null,
    };
  }, [doc, recursos, estilo]);

  const avisos = useMemo(() => avisosDeEstilo(estilo), [estilo]);
  const nombresImagen = archivos.data ? new Map(archivos.data.map((a) => [a.id, a.nombre])) : new Map<string, string>();
  const ancho = PAPEL_PX[estilo.pagina.papel].ancho;

  const duplicar = () => {
    const existentes = (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpetaId).map((a) => a.nombre);
    crear.mutate(
      { tipo: "estilo", nombre: nombreUnico(`Copia de ${nombreActual}`, existentes), carpeta: carpetaId, contenido: estiloParaGuardar(estilo) },
      { onSuccess: (nuevo) => navigate(`/admin/udrive/estilo/${nuevo}`), onError: (e) => decir(e.message) },
    );
  };

  return (
    <MarcoEditor
      tipo="estilo"
      etiqueta="Editor de estilos de informe"
      nombre={{
        valor: nombreActual,
        editable,
        renombrar: (n) => renombrar.mutate({ tipo: "archivo", id, nombre: n }, { onSuccess: () => setNombreActual(n), onError: (e) => decir(e.message) }),
      }}
      chip={<span className="es-note">Estilo de informe</span>}
      guardado={estado}
      soloLectura={editable ? undefined : "Solo lectura: duplique el estilo para cambiarlo"}
      acciones={
        <button type="button" className="es-btn" onClick={duplicar} disabled={crear.isPending}>
          <Icon name="layers" size={16} />
          Duplicar
        </button>
      }
      onVolver={() => void vaciar().then(() => navigate("/admin/udrive"))}
    >
      <div className="ud-estilo-layout">
        <aside aria-label="Controles del estilo">
          <p className="es-note" style={{ marginBottom: 8 }}>Los cambios se guardan solos. Cada informe guarda su propia copia del estilo al aplicarlo: cambiar este estilo no mueve los informes que ya lo usan.</p>
          <PanelEstilo estilo={estilo} base={base} onChange={setEstilo} editable={editable} muestra={doc.portada} nombresImagen={nombresImagen} />
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: "var(--text-sm)" }}>Vista de advertencias</h3>
            <ListaAvisos items={avisos} />
          </div>
        </aside>
        <div>
          <div className="ud-estilo-vista">
            <div className="es-seg" role="group" aria-label="Zoom">
              <button type="button" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}>−</button>
              <button type="button" aria-label="Zoom actual, tocar para ajustar" onClick={() => setZoom(0.62)}>{Math.round(zoom * 100)} %</button>
              <button type="button" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(1.2, Math.round((z + 0.1) * 10) / 10))}>+</button>
            </div>
            <p className="es-note">Informe de muestra, con datos de ejemplo, en {PAPEL_PX[estilo.pagina.papel].nombre}.</p>
            <Escalado escala={zoom} ancho={ancho}>
              <PaginasPdf entrada={entrada} modoPantalla />
            </Escalado>
          </div>
        </div>
      </div>
    </MarcoEditor>
  );
}
