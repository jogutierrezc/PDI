#!/usr/bin/env node
/* =============================================================================
   Mr. Pilo para Android · compilación.

   Uso:  node scripts/android-build.cjs <paso>
     web       compila la web de la app en dist-android (no pisa dist)
     sync      copia dist-android y los plugins al proyecto Android (cap sync)
     debug     genera el APK de pruebas (firmado con la llave de depuración de Android)
     release   genera el APK de producción SIN FIRMAR (la firma de la universidad se
               pone después, con scripts/android-sign.cjs)
     todo      web + sync + debug + release

   Necesita JDK 21 y el SDK de Android. Los busca en este orden:
     JAVA_HOME (si es 21 o más)  ·  <ANDROID_TOOLS>/jdk-21
     ANDROID_HOME                ·  <ANDROID_TOOLS>/sdk
   con ANDROID_TOOLS = ~/android-tools por defecto.

   Variables: PILO_NATIVE_HOST = dominio con el que la app se identifica ante el servidor
   (por defecto planeacion.udes.edu.co; debe ser el que acepta ALLOWED_ORIGIN).
   ========================================================================== */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tools = process.env.ANDROID_TOOLS || path.join(os.homedir(), "android-tools");
const win = process.platform === "win32";

function jdkMajor(home) {
  try {
    const release = fs.readFileSync(path.join(home, "release"), "utf8");
    const m = release.match(/JAVA_VERSION="(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function findJdk() {
  const candidates = [process.env.JAVA_HOME, path.join(tools, "jdk-21")].filter(Boolean);
  for (const c of candidates) if (jdkMajor(c) >= 21) return c;
  return null;
}

const jdk = findJdk();
const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(tools, "sdk")].filter(Boolean).find((p) => fs.existsSync(p));
const gradleDir = path.join(root, "pilo-android", "capacitor");

function falta(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

const env = { ...process.env, ...(jdk ? { JAVA_HOME: jdk } : {}), ...(sdk ? { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } : {}) };

function run(cmd, args, cwd) {
  console.log("\n▶ " + [cmd, ...args].join(" "));
  const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit", shell: win });
  if (r.status !== 0) falta("falló: " + cmd + " " + args.join(" "));
}

/**
 * La web de la app solo necesita Pilo. public/ trae el video institucional, los datos abiertos y el boletín
 * del portal (más de 17 MB que la app nunca abre) y el APK anterior: se quitan de dist-android, no de public/.
 */
const PODAR = ["Multimedia1.mp4", "datos-abiertos", "boletin", "plantillas", "og-card.jpg", path.join("pilo-app", "apk")];
function podar() {
  const dist = path.join(root, "dist-android");
  let quitado = 0;
  for (const rel of PODAR) {
    const p = path.join(dist, rel);
    if (!fs.existsSync(p)) continue;
    fs.rmSync(p, { recursive: true, force: true });
    quitado += 1;
  }
  console.log("✓ Se quitaron " + quitado + " carpetas y archivos del portal que la app no usa.");
}

const pasos = {
  web: () => {
    run("npx", ["vite", "build", "--outDir", "dist-android", "--emptyOutDir"], root);
    podar();
  },
  sync: () => run("npx", ["cap", "sync", "android"], root),
  debug: () => gradle("assembleDebug"),
  release: () => gradle("assembleRelease"),
};

function gradle(tarea) {
  if (!jdk) falta("Hace falta JDK 21 (JAVA_HOME o " + path.join(tools, "jdk-21") + ").");
  if (!sdk) falta("No encuentro el SDK de Android (ANDROID_HOME o " + path.join(tools, "sdk") + ").");
  // local.properties apunta al SDK; es de esta máquina y no se versiona.
  fs.writeFileSync(path.join(gradleDir, "local.properties"), "sdk.dir=" + sdk.replace(/\\/g, "/") + "\n");
  // Ruta completa y entre comillas: la carpeta del proyecto lleva espacios y acentos.
  const wrapper = path.join(gradleDir, win ? "gradlew.bat" : "gradlew");
  run(win ? "\"" + wrapper + "\"" : wrapper, [tarea, "--console=plain"], gradleDir);
}

const paso = process.argv[2];
if (paso === "todo") ["web", "sync", "debug", "release"].forEach((p) => pasos[p]());
else if (pasos[paso]) pasos[paso]();
else falta("Uso: node scripts/android-build.cjs <web|sync|debug|release|todo>");

if (["debug", "release", "todo"].includes(paso)) {
  const base = path.join(gradleDir, "app", "build", "outputs", "apk");
  console.log("\n✓ Listo. Los APK quedan en " + base);
}
