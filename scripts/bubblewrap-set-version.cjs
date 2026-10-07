// Ajusta la version visible de la app a 1.0.0 en el proyecto TWA:
// - twa-manifest.json (appVersionName y appVersion)
// - app/build.gradle (versionName)
// - regenera manifest-checksum.txt (sha1) para que build no pregunte por actualizacion
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const twaDir = path.join(__dirname, '..', 'pilo-android', 'twa');

const manifestPath = path.join(twaDir, 'twa-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.appVersionName = '1.0.0';
manifest.appVersion = '1.0.0';
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const gradlePath = path.join(twaDir, 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace('versionName "1"', 'versionName "1.0.0"');
fs.writeFileSync(gradlePath, gradle);

const checksum = crypto
  .createHash('sha1')
  .update(fs.readFileSync(manifestPath))
  .digest('hex');
fs.writeFileSync(path.join(twaDir, 'manifest-checksum.txt'), checksum);

console.log('version 1.0.0 aplicada; checksum:', checksum);
