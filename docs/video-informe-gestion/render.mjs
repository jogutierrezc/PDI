// Render del video: abre video.html en Edge (sin ventana), mueve la línea de tiempo GSAP
// cuadro por cuadro y arma el MP4 con ffmpeg.
//
//   node render.mjs --stills 3,20,40            → cuadros sueltos en salida/stills
//   node render.mjs --out salida/video.mp4      → video completo (1920x1080, 30 fps)
//   opciones: --fps 30  --workers 4  --audio audio/voz-demo.wav  --scale 1  --from 0 --to 210
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const url = pathToFileURL(join(here, "video.html")).href + "?render";
const W = 1920, H = 1080;

async function openPage(browser, scale) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => window.__ready);
  return page;
}
async function shot(page, t, file, q = 92) {
  await page.evaluate(t => window.__seek(t), t);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: file, type: "jpeg", quality: q });
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
try {
  const stills = arg("stills", null);
  if (stills) {
    const dir = join(here, "salida/stills"); mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, 1);
    for (const s of String(stills).split(",")) {
      const t = parseFloat(s); await shot(page, t, join(dir, `t${String(t).replace(".", "_").padStart(6, "0")}.jpg`));
      console.log("cuadro", t);
    }
  } else {
    const fps = +arg("fps", 30), workers = +arg("workers", 4), scale = +arg("scale", 1);
    const out = resolve(here, arg("out", "salida/video.mp4"));
    const audio = resolve(here, arg("audio", "audio/voz-demo.wav"));
    const probe = await openPage(browser, scale);
    const dur = await probe.evaluate(() => window.__dur);
    const t0 = +arg("from", 0), t1 = +arg("to", dur);
    const first = Math.round(t0 * fps), last = Math.round(t1 * fps);
    const frames = join(here, "salida/frames");
    if (existsSync(frames)) rmSync(frames, { recursive: true });
    mkdirSync(frames, { recursive: true });
    const pages = [probe];
    for (let i = 1; i < workers; i++) pages.push(await openPage(browser, scale));
    let done = 0; const started = Date.now();
    await Promise.all(pages.map(async (page, w) => {
      for (let f = first + w; f < last; f += workers) {
        await shot(page, f / fps, join(frames, `f${String(f - first).padStart(6, "0")}.jpg`), 94);
        if (++done % 150 === 0) {
          const el = (Date.now() - started) / 1000, total = last - first;
          console.log(`${done}/${total} cuadros · ${(done / el).toFixed(1)}/s · faltan ~${Math.round((total - done) / (done / el) / 60)} min`);
        }
      }
    }));
    console.log("cuadros listos, codificando…");
    const args = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "f%06d.jpg"),
      "-ss", String(t0), "-i", audio,
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-vf", `scale=${W}:${H}:flags=lanczos`,
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
    const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
    if (r.status !== 0) throw new Error("ffmpeg falló");
    console.log("listo:", out, readdirSync(frames).length, "cuadros");
  }
} finally { await browser.close(); }
