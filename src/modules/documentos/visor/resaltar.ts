/* =============================================================================
   Visor · colores para el código fuente (R, Quarto/Markdown, YAML) y el
   Markdown sencillo del portal.

   Los dos devuelven HTML ya escapado: primero se escapa todo el texto y solo
   después se añaden las etiquetas propias, así un documento no puede colar
   etiquetas suyas.
   ========================================================================== */

const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** Cada línea del código con sus colores. */
export function highlightLines(source: string): string[] {
  return source.replace(/\r\n/g, "\n").split("\n").map((line) => {
    // Se separa el comentario antes de colorear: lo que sigue a # no es código.
    const hash = line.search(/(^|\s)#/);
    const code = hash < 0 ? line : line.slice(0, hash + (line[hash] === "#" ? 0 : 1));
    const comment = hash < 0 ? "" : line.slice(hash + (line[hash] === "#" ? 0 : 1));
    let html = escape(code);
    const stash: string[] = [];
    const keep = (value: string) => `\u0000${stash.push(value) - 1}\u0000`;
    html = html.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, (m) => keep(`<span class="dv-tk-s">${m}</span>`));
    html = html
      .replace(/(?<![\w-])(\d+(?:[.,]\d+)?)(?![\w-])/g, '<span class="dv-tk-n">$1</span>')
      .replace(/\b(library|function|if|else|for|while|return|TRUE|FALSE|NULL|NA)\b/g, '<span class="dv-tk-k">$1</span>')
      .replace(/(&lt;-|\|&gt;|%&gt;%)/g, '<span class="dv-tk-m">$1</span>')
      .replace(/\b([A-Za-z_.][\w.]*)(?=\()/g, '<span class="dv-tk-f">$1</span>');
    // eslint-disable-next-line no-control-regex
    html = html.replace(/\u0000(\d+)\u0000/g, (_, index: string) => stash[Number(index)] ?? "");
    return comment ? `${html}<span class="dv-tk-c">${escape(comment)}</span>` : html;
  });
}

/** Markdown sencillo: títulos, párrafos, listas, énfasis, código en línea y enlaces http(s). */
export function markdownToHtml(source: string): string {
  const inline = (text: string): string =>
    escape(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const block of source.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    for (const raw of block.split("\n")) {
      const line = raw.trimEnd();
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        const level = heading[1].length + 1;
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      } else if (bullet) list.push(bullet[1]);
      else if (line.trim()) {
        flush();
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    flush();
  }
  return out.join("");
}
