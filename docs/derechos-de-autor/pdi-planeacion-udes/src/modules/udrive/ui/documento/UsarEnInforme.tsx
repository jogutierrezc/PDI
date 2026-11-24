/* =============================================================================
   UDrive · «Usar en un informe», desde los editores de tabla y de gráfica.

   Se elige el informe y el punto de inserción (al principio, al final o
   después de un capítulo) y se agrega el bloque que apunta a esta tabla o
   gráfica. El título y la nota quedan vacíos en el bloque para que se tomen
   de «Cómo se ve en el documento» del archivo (y sigan sus cambios). Si el
   informe está aprobado o alguien más lo está editando, la base lo rechaza y
   se dice por qué.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ventana } from "../../../../components/espacio/Ventana";
import { useArchivos, useContenido, useGuardarContenido } from "../../datos";
import { bloqueNuevo, insertarBloque, normalizarDocumento, validarDocumento } from "../../lib/documento";
import type { Bloque } from "../../lib/documento";
import { capitulos } from "../../lib/numeracion";

export function UsarEnInforme({ tipo, archivoId, onCerrar, decir }: { tipo: "tabla" | "grafica"; archivoId: string; onCerrar(): void; decir(m: string): void }) {
  const navigate = useNavigate();
  const archivos = useArchivos();
  const guardar = useGuardarContenido();
  const informes = useMemo(() => (archivos.data ?? []).filter((a) => a.tipo === "documento" && !a.borrado_en), [archivos.data]);
  const [informe, setInforme] = useState("");
  const [punto, setPunto] = useState("fin");
  const [hecho, setHecho] = useState<string | null>(null);
  const leido = useContenido(informe || undefined);
  const documento = useMemo(() => (leido.data?.tipo === "documento" ? normalizarDocumento(leido.data.contenido).documento : null), [leido.data]);
  const caps = documento ? capitulos(documento.bloques) : [];

  const agregar = () => {
    if (!documento) return;
    const base = bloqueNuevo(tipo) as Extract<Bloque, { tipo: "tabla" | "grafica" }>;
    const nuevo = { ...base, archivoId };
    const despuesDe = punto === "inicio" ? null : punto === "fin" ? (documento.bloques[documento.bloques.length - 1]?.id ?? null) : ultimoDeCapitulo(documento.bloques, punto);
    const siguiente = { ...documento, bloques: insertarBloque(documento.bloques, nuevo, despuesDe) };
    const problema = validarDocumento(siguiente);
    if (problema) return decir(problema);
    guardar.mutate({ id: informe, contenido: siguiente }, { onSuccess: () => setHecho(informe), onError: (e) => decir(e.message) });
  };

  return (
    <Ventana
      titulo="Usar en un informe"
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        hecho ? (
          <>
            <button type="button" className="es-btn" onClick={onCerrar}>Seguir aquí</button>
            <button type="button" className="es-btn es-btn--pri" onClick={() => navigate(`/admin/udrive/documento/${hecho}`)}>Abrir el informe</button>
          </>
        ) : (
          <>
            <span />
            <button type="button" className="es-btn es-btn--pri" disabled={!documento || guardar.isPending} onClick={agregar}>Agregar al informe</button>
          </>
        )
      }
    >
      <div className="es-dbody es-dbody--solo">
        {hecho ? (
          <p role="status">Listo: {tipo === "tabla" ? "la tabla" : "la gráfica"} ya está en el informe. Si cambia aquí, cambia allá.</p>
        ) : (
          <>
            <label className="es-fl">
              Informe
              <select className="es-inp" data-foco value={informe} onChange={(e) => (setInforme(e.target.value), setPunto("fin"))}>
                <option value="">Elija un informe</option>
                {informes.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </label>
            {!archivos.isPending && !informes.length ? <p className="ud-vacio" role="status">Todavía no hay informes. Cree uno con «Nuevo» → «Nuevo informe».</p> : null}
            {informe ? (
              <label className="es-fl">
                Dónde
                <select className="es-inp" value={punto} disabled={!documento} onChange={(e) => setPunto(e.target.value)}>
                  <option value="fin">Al final del informe</option>
                  <option value="inicio">Al principio</option>
                  {caps.map((c) => <option key={c.id} value={c.id}>Al final de «{c.titulo.trim() || "capítulo sin título"}»</option>)}
                </select>
              </label>
            ) : null}
            {informe && leido.isPending ? <p className="es-note">Leyendo el informe…</p> : null}
            {informe && !leido.isPending && !documento ? <p className="ud-aviso" data-t="error" role="alert">No se pudo leer el informe.</p> : null}
          </>
        )}
      </div>
    </Ventana>
  );
}

/** El último bloque de un capítulo: el anterior al siguiente capítulo del mismo nivel o superior (o el final). */
function ultimoDeCapitulo(bloques: readonly Bloque[], capituloId: string): string | null {
  const i = bloques.findIndex((b) => b.id === capituloId);
  const cap = bloques[i];
  if (i < 0 || cap?.tipo !== "capitulo") return bloques[bloques.length - 1]?.id ?? null;
  let fin = bloques.length;
  for (let k = i + 1; k < bloques.length; k++) {
    const b = bloques[k];
    if (b.tipo === "capitulo" && b.nivel <= cap.nivel) {
      fin = k;
      break;
    }
  }
  return bloques[fin - 1]?.id ?? null;
}
