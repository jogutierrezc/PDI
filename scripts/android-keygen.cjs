#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Genera la llave de firma de «Mr. Pilo» a nombre de la Universidad de Santander.
 *
 *   node scripts/android-keygen.cjs [--out <ruta.keystore>] [--alias mrpilo]
 *        [--keysize 4096] [--years 30] [--dn "<DN>"] [--dry-run]
 *
 * Contraseñas: se piden por entrada oculta, o se toman de las variables de
 * entorno MRPILO_KEYSTORE_PASSWORD (y opcionalmente MRPILO_KEY_PASSWORD).
 * NUNCA se escriben en ningún archivo ni se imprimen: keytool las recibe por
 * variable de entorno del proceso hijo (-storepass:env / -keypass:env).
 *
 * Por defecto el keystore se escribe FUERA del repositorio, en
 * %USERPROFILE%\MrPilo-llaves\mrpilo-universidad.keystore, y el script se
 * niega a sobrescribir uno que ya exista o a escribir dentro del repositorio.
 *
 * Formato PKCS12: en este formato la contraseña de la llave es la misma del
 * almacén (keytool ignora una distinta). Por eso MRPILO_KEY_PASSWORD, si se
 * define, debe coincidir; el script de firma acepta ambas variables igualmente.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DN_DEFECTO =
  'CN=Mr. Pilo, OU=Planeacion Institucional, O=Universidad de Santander, L=Bucaramanga, ST=Santander, C=CO';

function args(argv) {
  const o = { dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--out') o.out = val();
    else if (a === '--alias') o.alias = val();
    else if (a === '--keysize') o.keysize = Number(val());
    else if (a === '--years') o.years = Number(val());
    else if (a === '--dn') o.dn = val();
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return o;
}

function buscarKeytool() {
  const exe = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  const cand = [];
  if (process.env.MRPILO_JDK) cand.push(path.join(process.env.MRPILO_JDK, 'bin', exe));
  if (process.env.JAVA_HOME) cand.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  cand.push(path.join(os.homedir(), 'android-tools', 'jdk-21', 'bin', exe));
  for (const c of cand) if (fs.existsSync(c)) return c;
  const r = spawnSync(exe, ['-help'], { encoding: 'utf8' });
  if (!r.error) return exe; // está en el PATH
  throw new Error('No encuentro keytool. Defina MRPILO_JDK o JAVA_HOME (JDK 17 o 21).');
}

/** Pide una clave sin mostrarla en pantalla. */
function pedirOculto(pregunta) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('No hay terminal interactiva: defina MRPILO_KEYSTORE_PASSWORD.'));
      return;
    }
    process.stdout.write(pregunta);
    let buf = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    process.stdin.on('data', onData);
  });
}

function dentroDe(hijo, padre) {
  const rel = path.relative(padre, hijo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

(async () => {
  const o = args(process.argv.slice(2));
  if (o.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    return;
  }
  const out = path.resolve(o.out || path.join(os.homedir(), 'MrPilo-llaves', 'mrpilo-universidad.keystore'));
  const alias = o.alias || 'mrpilo';
  const keysize = o.keysize || 4096;
  const years = o.years || 30;
  const dn = o.dn || DN_DEFECTO;
  const dias = Math.ceil(years * 365.25);

  if (keysize < 2048) throw new Error('Tamaño mínimo aceptable: 2048 (se recomienda 4096).');
  if (years < 25) throw new Error('La vigencia debe ser de al menos 25 años (requisito de Play y de continuidad).');
  if (dentroDe(out, REPO)) {
    throw new Error(`Negado: ${out} está dentro del repositorio. Elija una ruta fuera de ${REPO}.`);
  }
  if (fs.existsSync(out)) throw new Error(`Negado: ya existe ${out}. Este script nunca sobrescribe una llave.`);

  const keytool = buscarKeytool();
  const argsKt = [
    '-genkeypair', '-v',
    '-keystore', out,
    '-storetype', 'PKCS12',
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', String(keysize),
    '-sigalg', 'SHA256withRSA',
    '-validity', String(dias),
    '-dname', dn,
    '-storepass:env', 'MRPILO_KEYSTORE_PASSWORD',
    '-keypass:env', 'MRPILO_KEYSTORE_PASSWORD',
  ];

  console.log('Llave de firma de Mr. Pilo');
  console.log('  keytool   :', keytool);
  console.log('  keystore  :', out);
  console.log('  alias     :', alias);
  console.log('  algoritmo : RSA', keysize, '/ SHA256withRSA / PKCS12');
  console.log('  vigencia  :', years, 'años (', dias, 'días )');
  console.log('  DN        :', dn);
  console.log('  contraseña: (de MRPILO_KEYSTORE_PASSWORD o entrada oculta; no se guarda)');
  if (o.dry) {
    console.log('\n--dry-run: no se generó nada. Comando que se ejecutaría:');
    console.log(' ', [keytool, ...argsKt].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '));
    return;
  }

  let pass = process.env.MRPILO_KEYSTORE_PASSWORD;
  if (!pass) {
    const p1 = await pedirOculto('Contraseña de la llave (mín. 12 caracteres): ');
    const p2 = await pedirOculto('Repita la contraseña: ');
    if (p1 !== p2) throw new Error('Las contraseñas no coinciden.');
    pass = p1;
  }
  if (pass.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
  if (process.env.MRPILO_KEY_PASSWORD && process.env.MRPILO_KEY_PASSWORD !== pass) {
    throw new Error('En PKCS12 la contraseña de la llave debe ser igual a la del almacén.');
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync(keytool, argsKt, {
    env: { ...process.env, MRPILO_KEYSTORE_PASSWORD: pass },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || '').replace(pass, '***'));
    throw new Error('keytool falló.');
  }
  console.log('\nLlave creada:', out);
  const l = spawnSync(keytool, ['-list', '-v', '-keystore', out, '-alias', alias, '-storepass:env', 'MRPILO_KEYSTORE_PASSWORD'], {
    env: { ...process.env, MRPILO_KEYSTORE_PASSWORD: pass },
    encoding: 'utf8',
  });
  const huella = /SHA-?256:\s*([0-9A-F:]{95})/i.exec(l.stdout || '');
  console.log('Huella SHA-256 del certificado (esta es la que se registra en Google y en assetlinks.json):');
  console.log(' ', huella ? huella[1] : '(ejecute keytool -list -v)');
  console.log('\nSiguiente: haga DOS copias cifradas fuera de línea (ver pilo-android/FIRMA.md) ANTES de firmar nada.');
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
