import { describe, expect, it } from "vitest";
import { formatOf, isPreviewableFormat, videoEmbedUrl } from "./tipos";
import { maxBytesFor, MAX_DOC_BYTES, MAX_VIDEO_BYTES } from "../admin/documentos/store";

describe("videoEmbedUrl", () => {
  it("reconoce YouTube en todas sus formas", () => {
    const esperado = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(esperado);
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(esperado);
    expect(videoEmbedUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe(esperado);
    expect(videoEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(esperado);
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=90")).toBe(`${esperado}?start=90`);
  });
  it("reconoce Google Drive", () => {
    const esperado = "https://drive.google.com/file/d/1AbC_dEf-GhIjKlMnOp/preview";
    expect(videoEmbedUrl("https://drive.google.com/file/d/1AbC_dEf-GhIjKlMnOp/view?usp=sharing")).toBe(esperado);
    expect(videoEmbedUrl("https://drive.google.com/file/u/0/d/1AbC_dEf-GhIjKlMnOp/view")).toBe(esperado);
    expect(videoEmbedUrl("https://drive.google.com/open?id=1AbC_dEf-GhIjKlMnOp")).toBe(esperado);
  });
  it("reconoce Vimeo, con y sin clave de privacidad", () => {
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(videoEmbedUrl("https://vimeo.com/123456789/abcdef1234")).toBe("https://player.vimeo.com/video/123456789?h=abcdef1234");
  });
  it("no toma por video lo que no lo es", () => {
    expect(videoEmbedUrl("https://www.youtube.com/@canal")).toBeNull();
    expect(videoEmbedUrl("https://drive.google.com/drive/folders/1AbC_dEf-GhIjKlMnOp")).toBeNull();
    expect(videoEmbedUrl("https://docs.google.com/document/d/1AbC_dEf-GhIjKlMnOp/edit")).toBeNull();
    expect(videoEmbedUrl("https://udes.edu.co/video")).toBeNull();
    expect(videoEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(videoEmbedUrl("https://evil.example/?u=https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbedUrl(null)).toBeNull();
  });
});

describe("formatOf · video", () => {
  const base = { url: null, path: null, fileName: "", flavor: "" as const };
  it("un .mp4 o .webm subido es video y se abre en el visor", () => {
    expect(formatOf({ ...base, kind: "archivo", path: "c/1-clase.mp4", fileName: "Clase.MP4" })).toBe("video");
    expect(formatOf({ ...base, kind: "archivo", fileName: "x.webm" })).toBe("video");
    expect(isPreviewableFormat("video")).toBe(true);
  });
  it("un enlace de video es video; otro enlace sigue siendo enlace", () => {
    expect(formatOf({ ...base, kind: "enlace", url: "https://youtu.be/dQw4w9WgXcQ" })).toBe("video");
    expect(formatOf({ ...base, kind: "enlace", url: "https://udes.edu.co/algo" })).toBe("link");
    expect(formatOf({ ...base, kind: "enlace", url: "https://repositorio.udes.edu.co/x" })).toBe("repo");
  });
});

describe("tope de tamaño", () => {
  it("los videos tienen su propio tope y los documentos conservan el de siempre", () => {
    expect(maxBytesFor("clase.mp4")).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor("CLASE.WEBM")).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor("acta.pdf")).toBe(MAX_DOC_BYTES);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_DOC_BYTES);
  });
});
