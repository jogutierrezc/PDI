/* =============================================================================
   Repositorio documental · la etiqueta de tipo («PDF», «Quarto», «Repositorio»…).
   El color acompaña al nombre; nunca va solo.
   ========================================================================== */

import { Icon } from "../../components/ui/Icon";
import { FORMAT_LABEL } from "./tipos";
import type { DocFormat } from "./tipos";
import "./doc-visor.css";

const ICON: Record<DocFormat, "document" | "code" | "external"> = {
  pdf: "document",
  doc: "document",
  html: "code",
  qmd: "code",
  r: "code",
  md: "document",
  portal: "code",
  repo: "external",
  link: "external",
  file: "document",
};

export function TipoDoc({ format }: { format: DocFormat }) {
  return (
    <span className="dv-kind" data-format={format}>
      <Icon name={ICON[format]} size={13} />
      {FORMAT_LABEL[format]}
    </span>
  );
}
