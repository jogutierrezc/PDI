// Copia el proyecto TWA a una ruta ASCII (el AGP rechaza acentos en la ruta
// en Windows), apunta el keystore a la copia y regenera el checksum.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(PROJECT_ROOT, 'pilo-android', 'twa');
const DST = path.join(process.env.USERPROFILE || process.env.HOME, 'android-tools', 'mrpilo-twa');
const SRC_KEYS = path.join(PROJECT_ROOT, 'pilo-android', 'keys');
const DST_KEYS = path.join(process.env.USERPROFILE || process.env.HOME, 'android-tools', 'mrpilo-twa', 'keys');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

// Copia del proyecto (limpia primero para no arrastrar residuos de builds).
fs.rmSync(DST, { recursive: true, force: true });
copyDir(SRC, DST);
copyDir(SRC_KEYS, DST_KEYS);

// El keystore pasa a vivir en la ruta ASCII durante el build.
const manifestPath = path.join(DST, 'twa-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.signingKey.path = path.join(DST_KEYS, 'mrpilo-release.keystore');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const checksum = crypto
  .createHash('sha1')
  .update(fs.readFileSync(manifestPath))
  .digest('hex');
fs.writeFileSync(path.join(DST, 'manifest-checksum.txt'), checksum);

console.log('proyecto ASCII listo en:', DST);
console.log('checksum:', checksum);
