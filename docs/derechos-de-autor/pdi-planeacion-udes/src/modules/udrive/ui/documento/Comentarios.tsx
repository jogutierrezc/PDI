/* =============================================================================
   UDrive · comentarios por bloque.

   Modelo simple: un comentario pertenece a un bloque, lo escribe quien ve el
   documento y se marca como resuelto (por quien edita el documento o por su
   autor). Sin menciones ni correos. El panel lista los del bloque elegido o,
   sin bloque, todos los del documento.
   ========================================================================== */

import { useState } from "react";
import { useBorrarComentario, useComentar, useResolverComentario } from "../../datosDocumento";
import type { ComentarioFila } from "../../datosDocumento";
import { NOMBRE_BLOQUE } from "../../lib/documento";
import type { Bloque } from "../../lib/documento";
import { resumenDeBloque } from "../../lib/versiones";
import { fechaLarga } from "../piezas";

export function Comentarios({
  documento,
  bloques,
  bloqueId,
  comentarios,
  yo,
  puedeEditar,
  decir,
  onIr,
  onCerrar,
}: {
  documento: string;
  bloques: readonly Bloque[];
  /** El bloque elegido; nulo = ver todos. */
  bloqueId: string | null;
  comentarios: readonly ComentarioFila[];
  yo: string | undefined;
  puedeEditar: boolean;
  decir(m: string): void;
  onIr(id: string): void;
  onCerrar(): void;
}) {
  const [soloBloque, setSoloBloque] = useState(Boolean(bloqueId));
  const [texto, setTexto] = useState("");
  const [verResueltos, setVerResueltos] = useState(false);
  const comentar = useComentar();
  const resolver = useResolverComentario();
  const borrar = useBorrarComentario();
  const visibles = comentarios.filter((c) => (!soloBloque || !bloqueId || c.bloque_id === bloqueId) && (verResueltos || !c.resuelto));
  const bloque = bloques.find((b) => b.id === bloqueId);
  const resumen = (id: string) => {
    const b = bloques.find((x) => x.id === id);
    return b ? `${NOMBRE_BLOQUE[b.tipo]} · ${resumenDeBloque(b).slice(0, 50)}` : "Un bloque que ya no está";
  };

  return (
    <aside className="ud-panel ud-panel--r" aria-label="Comentarios">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
        <div>
          <h3>Comentarios</h3>
          <p className="ud-sub">{bloque ? `Del bloque «${NOMBRE_BLOQUE[bloque.tipo]}»` : "De todo el documento"}</p>
        </div>
        <button type="button" className="es-btn es-btn--sm" onClick={onCerrar}>Cerrar</button>
      </div>

      {bloqueId ? (
        <form
          className="ud-doc-pie-der"
          onSubmit={(e) => {
            e.preventDefault();
            const t = texto.trim();
            if (!t) return;
            comentar.mutate({ documento, bloque: bloqueId, texto: t }, { onSuccess: () => (setTexto(""), decir("Comentario agregado.")), onError: (er) => decir(er.message) });
          }}
        >
          <label className="es-fl">
            Escribir un comentario
            <textarea className="es-inp" rows={3} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué hay que revisar en este bloque" />
          </label>
          <button type="submit" className="es-btn es-btn--pri" disabled={!texto.trim() || comentar.isPending} style={{ justifyContent: "center" }}>Comentar</button>
        </form>
      ) : (
        <p className="es-note">Elija un bloque de la hoja para escribirle un comentario.</p>
      )}

      <div className="ud-doc-pie-der">
        {bloqueId ? <label className="es-ck"><input type="checkbox" checked={soloBloque} onChange={(e) => setSoloBloque(e.target.checked)} /> Solo los de este bloque</label> : null}
        <label className="es-ck"><input type="checkbox" checked={verResueltos} onChange={(e) => setVerResueltos(e.target.checked)} /> Mostrar los resueltos</label>
        {visibles.length === 0 ? <p className="es-note" role="status">No hay comentarios {verResueltos ? "" : "sin resolver "}aquí.</p> : null}
        {visibles.map((c) => (
          <article key={c.id} className="ud-com" data-resuelto={c.resuelto}>
            <header>
              <b>{c.autor_nombre ?? "Alguien"}</b>
              <span>{fechaLarga(c.created_at)}</span>
            </header>
            {!soloBloque || !bloqueId ? <button type="button" className="es-btn es-btn--sm es-btn--ghost" style={{ justifySelf: "start" }} onClick={() => onIr(c.bloque_id)}>{resumen(c.bloque_id)}</button> : null}
            <p>{c.texto}</p>
            <footer>
              {puedeEditar || c.autor === yo ? (
                <button type="button" className="es-btn es-btn--sm" disabled={resolver.isPending} onClick={() => resolver.mutate({ documento, id: c.id, resuelto: !c.resuelto }, { onError: (er) => decir(er.message) })}>
                  {c.resuelto ? "Reabrir" : "Marcar como resuelto"}
                </button>
              ) : null}
              {puedeEditar || c.autor === yo ? (
                <button type="button" className="es-btn es-btn--sm es-btn--ghost" disabled={borrar.isPending} onClick={() => borrar.mutate({ documento, id: c.id }, { onError: (er) => decir(er.message) })}>Borrar</button>
              ) : null}
            </footer>
          </article>
        ))}
      </div>
    </aside>
  );
}
