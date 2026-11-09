/* =============================================================================
   Panel de Documentos · vista previa de un documento.

   Abre el mismo visor del portal sobre cualquier fila, también un borrador:
   revisar antes de publicar es justo para lo que sirve. El visor pesa (pdf.js,
   docx-preview), así que se carga solo al abrir.
   ========================================================================== */

import { Suspense, lazy } from "react";
import { Modal, ModalClose } from "./Modal";
import type { DocItem } from "../../documentos/data";

const DocViewer = lazy(() => import("../../documentos/visor/DocViewer").then((module) => ({ default: module.DocViewer })));

export function PreviewModal({ item, nested = false, onClose }: { item: DocItem; nested?: boolean; onClose: () => void }) {
  return (
    <Modal label={`Vista previa de ${item.title || "el documento"}`} size="xl" nested={nested} onClose={onClose}>
      {({ close, titleId }) => (
        <>
          <header className="da-modal__head">
            <div>
              <h2 id={titleId}>Vista previa</h2>
              <p>
                {item.title || "Documento sin título"}
                {item.status === "borrador" ? " · borrador, el portal todavía no lo muestra" : ""}
              </p>
            </div>
            <ModalClose onClick={close} />
          </header>
          <div className="da-preview">
            <Suspense fallback={<p className="oda-muted da-preview__wait">Abriendo el visor…</p>}>
              <DocViewer item={item} />
            </Suspense>
          </div>
        </>
      )}
    </Modal>
  );
}
