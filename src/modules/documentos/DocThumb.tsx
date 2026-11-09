/* =============================================================================
   Repositorio documental · la miniatura de un documento.

   Si el documento tiene imagen (la primera página, una captura o la que subió
   quien lo publicó), se muestra. Si no, o si no carga, se dibuja una portada con
   el color y las siglas de su tipo: nunca queda un hueco. Lo que dibuja es
   decorativo (aria-hidden): el título y el tipo ya van escritos al lado.
   ========================================================================== */

import { useState } from "react";
import { documentFileUrl } from "./data";
import type { DocItem } from "./data";
import { FORMAT_ABBR, formatOf } from "./tipos";
import type { DocFormat } from "./tipos";
import "./doc-visor.css";

type Size = "sm" | "md" | "lg";

/** La portada dibujada, sin imagen. */
export function ThumbCover({ format, size = "md" }: { format: DocFormat; size?: Size }) {
  return (
    <span className={`dv-tn dv-tn--${size}`} data-format={format} aria-hidden="true">
      {format === "pdf" || format === "doc" || format === "file" ? (
        <>
          <i className="dv-tn__h" />
          <i />
          <i />
          <i style={{ width: "60%" }} />
          <span className="dv-tn__blk" />
        </>
      ) : format === "html" ? (
        <>
          <i className="dv-tn__h" />
          <span className="dv-tn__bars">
            <u style={{ height: "40%" }} />
            <u style={{ height: "70%" }} />
            <u style={{ height: "55%" }} />
            <u style={{ height: "90%" }} />
          </span>
        </>
      ) : format === "qmd" || format === "r" ? (
        <>
          <span className="dv-tn__code">
            <i />
            <i style={{ width: "70%" }} />
            <i style={{ width: "85%" }} />
          </span>
          <span className="dv-tn__bars">
            <u style={{ height: "50%" }} />
            <u style={{ height: "80%" }} />
            <u style={{ height: "35%" }} />
          </span>
        </>
      ) : format === "md" ? (
        <>
          <i className="dv-tn__h" />
          <i />
          <i style={{ width: "80%" }} />
          <i />
          <i style={{ width: "55%" }} />
        </>
      ) : (
        <>
          <span className="dv-tn__seal">UDES</span>
          <i className="dv-tn__h" style={{ marginTop: 6 }} />
          <i />
          <i style={{ width: "60%" }} />
        </>
      )}
      <b>{FORMAT_ABBR[format]}</b>
    </span>
  );
}

export function DocThumb({
  item,
  size = "md",
}: {
  item: Pick<DocItem, "kind" | "url" | "path" | "fileName" | "flavor" | "thumbPath">;
  size?: Size;
}) {
  const [failed, setFailed] = useState(false);
  const src = documentFileUrl(item.thumbPath);
  if (src && !failed) {
    return (
      <span className={`dv-tn dv-tn--${size} dv-tn--img`} aria-hidden="true">
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <ThumbCover format={formatOf(item)} size={size} />;
}
