#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Alinea, firma, verifica y publica el APK de «Mr. Pilo».
 *
 *   node scripts/android-sign.cjs [--apk <ruta>] [--out-dir <carpeta>] [--v4]
 *                                 [--dry-run] [--allow-debug-key]
 *   node scripts/android-sign.cjs --verify <apk>
 *
 * Variables de entorno (las contraseñas nunca se imprimen ni se guardan):
 *   MRPILO_KEYSTORE           ruta del .keystore/.jks (fuera del repositorio)
 *   MRPILO_KEY_ALIAS          alias de la llave (por defecto «mrpilo»)
 *   MRPILO_KEYSTORE_PASSWORD  contraseña del almacén
 *   MRPILO_KEY_PASSWORD       contraseña de la llave (por defecto, la del almacén)
 *   MRPILO_JDK / ANDROID_HOME / ANDROID_SDK_ROOT   (opcionales; se buscan solos)
 *
 * Resultado: <out-dir>/Mr-Pilo-<versión>.apk y Mr-Pilo-<versión>.apk.sha256,
 * con out-dir = public/pilo-app/apk. La versión sale de versionName en
 * pilo-android/capacitor/app/build.gradle.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const GRADLE = path.join(REPO, 'pilo-android', 'capacitor', 'app', 'build.gradle');
const APK_DIR = path.join(REPO, 'pilo-android', 'capacitor', 'app', 'build', 'outputs', 'apk');
const OUT_DEFECTO = path.join(REPO, 'public', 'pilo-app', 'apk');
// Huella de la llave de prueba (TWA) que quedó publicada en el repositorio: comprometida.
const HUELLA_COMPROMETIDA = '696b6cc7d6b9c30aeefd21232a3827e0eb61c9a5b4659e67bbe9f48482cf36a7';

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--v4') o.v4 = true;
    else if (a === '--allow-debug-key') o.allowDebug = true;
    else if (a === '--allow-compromised-key') o.allowCompromised = true;
    else if (a === '--apk') o.apk = argv[++i];
    else if (a === '--out-dir') o.outDir = argv[++i];
    else if (a === '--verify') o.verify = argv[++i];
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return o;
}

const exeExt = process.platform === 'win32' ? '.exe' : '';

function buscarJava() {
  const c = [];
  if (process.env.MRPILO_JDK) c.push(process.env.MRPILO_JDK);
  if (process.env.JAVA_HOME) c.push(process.env.JAVA_HOME);
  c.push(path.join(os.homedir(), 'android-tools', 'jdk-21'));
  c.push(path.join(os.homedir(), 'android-tools', 'jdk-17.0.20.1+1'));
  for (const d of c) {
    const j = path.join(d, 'bin', 'java' + exeExt);
    if (fs.existsSync(j)) return j;
  }
  if (!spawnSync('java', ['-version']).error) return 'java';
  throw new Error('No encuentro Java. Defina MRPILO_JDK o JAVA_HOME.');
}

function versiones(dir) {
  const v = (s) => s.split('.').map((n) => parseInt(n, 10) || 0);
  return fs.readdirSync(dir).sort((a, b) => {
    const x = v(a), y = v(b);
    for (let i = 0; i < 4; i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  });
}

/** Devuelve { zipalign, apksignerJar, buildTools } del SDK de Android. */
function buscarSdk() {
  const raices = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(os.homedir(), 'android-tools', 'sdk')]
    .filter(Boolean);
  for (const r of raices) {
    const bt = path.join(r, 'build-tools');
    if (!fs.existsSync(bt)) continue;
    for (const ver of versiones(bt)) {
      const dir = path.join(bt, ver);
      const jar = path.join(dir, 'lib', 'apksigner.jar');
      const za = path.join(dir, 'zipalign' + exeExt);
      if (fs.existsSync(jar) && fs.existsSync(za)) return { zipalign: za, apksignerJar: jar, buildTools: ver, sdk: r };
    }
  }
  throw new Error('No encuentro build-tools con apksigner y zipalign. Defina ANDROID_HOME.');
}

function ejecutar(cmd, argv, env) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', env: env || process.env });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}

function sha256(f) {
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

function dentroDe(hijo, padre) {
  const rel = path.relative(padre, hijo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function versionDeGradle() {
  const m = /versionName\s*=?\s*["']([^"']+)["']/.exec(fs.readFileSync(GRADLE, 'utf8'));
  if (!m) throw new Error(`No pude leer versionName en ${GRADLE}`);
  return m[1];
}

function listarApks(dir) {
  const res = [];
  const rec = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (e.name.endsWith('.apk')) res.push(p);
    }
  };
  rec(dir);
  // Prefiere release sin firmar, luego release, luego lo más reciente.
  const peso = (p) => (/unsigned/i.test(p) ? 0 : /release/i.test(p) ? 1 : 2);
  return res.sort((a, b) => peso(a) - peso(b) || fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

/** Verifica y devuelve { ok, dn, huella, salida }. */
function verificar(java, sdk, apk) {
  const r = ejecutar(java, ['-jar', sdk.apksignerJar, 'verify', '--verbose', '--print-certs', apk]);
  const dn = /certificate DN:\s*(.+)/.exec(r.out);
  const h = /certificate SHA-256 digest:\s*([0-9a-f]{64})/i.exec(r.out);
  const esquemas = [...r.out.matchAll(/Verified using (v[\d.]+) scheme[^:]*:\s*(true|false)/gi)]
    .filter((m) => m[2] === 'true').map((m) => m[1]);
  return { ok: r.code === 0, dn: dn && dn[1].trim(), huella: h && h[1].toLowerCase(), esquemas, salida: r.out };
}

const conDosPuntos = (h) => h.toUpperCase().match(/../g).join(':');

(async () => {
  const o = args(process.argv.slice(2));
  if (o.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    return;
  }
  const java = buscarJava();
  const sdk = buscarSdk();
  console.log(`Herramientas: build-tools ${sdk.buildTools} (${sdk.sdk}); java: ${java}`);

  // ---- Solo verificar ----
  if (o.verify) {
    const apk = path.resolve(o.verify);
    if (!fs.existsSync(apk)) throw new Error(`No existe ${apk}`);
    const v = verificar(java, sdk, apk);
    console.log(`APK       : ${apk}`);
    console.log(`Verifica  : ${v.ok ? 'SI' : 'NO'}${v.esquemas.length ? ' (esquemas ' + v.esquemas.join(', ') + ')' : ''}`);
    console.log(`DN        : ${v.dn || '(sin datos)'}`);
    console.log(`Huella SHA-256 del certificado: ${v.huella ? conDosPuntos(v.huella) : '(sin datos)'}`);
    console.log(`SHA-256 del archivo: ${sha256(apk)}  (${fs.statSync(apk).size} bytes)`);
    if (v.huella === HUELLA_COMPROMETIDA) console.log('AVISO: es la llave de prueba publicada en el repositorio (comprometida).');
    if (!v.ok) { console.log(v.salida); process.exit(1); }
    return;
  }

  // ---- Firmar ----
  const version = versionDeGradle();
  const outDir = path.resolve(o.outDir || OUT_DEFECTO);
  const candidatos = o.apk ? [path.resolve(o.apk)] : listarApks(APK_DIR);
  if (!candidatos.length) throw new Error(`No hay APK en ${APK_DIR}. Compile primero (gradlew assembleRelease).`);
  const origen = candidatos[0];
  if (!fs.existsSync(origen)) throw new Error(`No existe ${origen}`);

  const ks = process.env.MRPILO_KEYSTORE;
  const alias = process.env.MRPILO_KEY_ALIAS || 'mrpilo';
  const storePass = process.env.MRPILO_KEYSTORE_PASSWORD;
  const keyPass = process.env.MRPILO_KEY_PASSWORD || storePass;
  const nombre = `Mr-Pilo-${version}.apk`;
  const destino = path.join(outDir, nombre);

  console.log(`Origen    : ${origen}`);
  console.log(`Versión   : ${version} (de build.gradle)`);
  console.log(`Keystore  : ${ks || '(falta MRPILO_KEYSTORE)'}`);
  console.log(`Alias     : ${alias}`);
  console.log(`Contraseñas: ${storePass ? 'definidas en el entorno' : 'FALTA MRPILO_KEYSTORE_PASSWORD'}`);
  console.log(`Esquemas  : v1 + v2 + v3${o.v4 ? ' + v4 (.idsig)' : ''}`);
  console.log(`Destino   : ${destino}`);
  console.log(`            ${destino}.sha256`);

  if (o.dry) {
    console.log('\n--dry-run: pasos que se ejecutarían');
    console.log('  1. zipalign -f -P 16 4  <origen> <temporal>   (alinea; si no admite -P, usa -p)');
    console.log('  2. apksigner sign --ks <keystore> --ks-key-alias <alias> --ks-pass env:… --key-pass env:… --out <firmado> <temporal>');
    console.log('  3. apksigner verify --verbose --print-certs <firmado>');
    console.log('  4. SHA-256 y tamaño; copia a destino y escritura de .sha256');
    if (!ks || !storePass) console.log('\nNota: en una ejecución real faltarían variables de entorno y se detendría.');
    return;
  }

  if (!ks || !storePass) throw new Error('Defina MRPILO_KEYSTORE y MRPILO_KEYSTORE_PASSWORD (y opcionalmente MRPILO_KEY_ALIAS, MRPILO_KEY_PASSWORD).');
  const ksAbs = path.resolve(ks);
  if (!fs.existsSync(ksAbs)) throw new Error(`No existe el keystore ${ksAbs}`);
  if (dentroDe(ksAbs, REPO)) throw new Error('El keystore está dentro del repositorio: muévalo fuera (ver pilo-android/FIRMA.md).');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrpilo-sign-'));
  try {
    const alineado = path.join(tmp, 'alineado.apk');
    const firmado = path.join(tmp, nombre);

    let z = ejecutar(sdk.zipalign, ['-f', '-P', '16', '4', origen, alineado]);
    if (z.code !== 0) z = ejecutar(sdk.zipalign, ['-f', '-p', '4', origen, alineado]);
    if (z.code !== 0) throw new Error('zipalign falló:\n' + z.out);
    const zc = ejecutar(sdk.zipalign, ['-c', '4', alineado]);
    if (zc.code !== 0) throw new Error('El APK no quedó alineado:\n' + zc.out);

    const env = { ...process.env, MRPILO_KEYSTORE_PASSWORD: storePass, MRPILO_KEY_PASSWORD: keyPass };
    const sign = [
      '-jar', sdk.apksignerJar, 'sign',
      '--ks', ksAbs, '--ks-key-alias', alias,
      '--ks-pass', 'env:MRPILO_KEYSTORE_PASSWORD', '--key-pass', 'env:MRPILO_KEY_PASSWORD',
      '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
      '--v4-signing-enabled', o.v4 ? 'true' : 'false',
      '--out', firmado, alineado,
    ];
    const s = ejecutar(java, sign, env);
    if (s.code !== 0) throw new Error('apksigner falló:\n' + s.out.split(storePass).join('***'));

    const v = verificar(java, sdk, firmado);
    if (!v.ok) throw new Error('La verificación falló:\n' + v.salida);
    if (/android debug/i.test(v.dn || '') && !o.allowDebug) throw new Error('El APK quedó firmado con una llave de depuración. Use --allow-debug-key solo para pruebas.');
    if (v.huella === HUELLA_COMPROMETIDA && !o.allowCompromised) {
      throw new Error('Esa es la llave de prueba publicada en el repositorio (comprometida). Use la llave nueva de la universidad (o --allow-compromised-key solo para pruebas).');
    }

    const hash = sha256(firmado);
    const tam = fs.statSync(firmado).size;
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(firmado, destino);
    if (o.v4 && fs.existsSync(firmado + '.idsig')) fs.copyFileSync(firmado + '.idsig', destino + '.idsig');
    fs.writeFileSync(destino + '.sha256', `${hash}  ${nombre}\n`);

    console.log('\nListo.');
    console.log(`Archivo   : ${destino}`);
    console.log(`Tamaño    : ${tam} bytes (${(tam / 1048576).toFixed(2)} MB)`);
    console.log(`SHA-256 del archivo : ${hash}`);
    console.log(`DN del certificado  : ${v.dn}`);
    console.log(`Huella del certificado (SHA-256, para Google y assetlinks.json): ${conDosPuntos(v.huella)}`);
    console.log(`Esquemas verificados: ${v.esquemas.join(', ') || '(ver apksigner)'}`);
    console.log('\nFalta (a mano): actualizar APP_APK en src/modules/pilo-app/pwa.ts (versión, nombre, tamaño) y borrar el APK anterior.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
