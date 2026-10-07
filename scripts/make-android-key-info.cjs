const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'pilo-android');
fs.mkdirSync(path.join(root, 'keys'), { recursive: true });

// Clave fuerte para el keystore de produccion (se guarda junto al keystore).
const storePass = crypto.randomBytes(18).toString('base64url');
const keyPass = crypto.randomBytes(18).toString('base64url');

const info = [
  'LLAVE DE FIRMA DE LA APP ANDROID "MR. PILO"',
  '=========================================',
  '',
  'Keystore : keys/mrpilo-release.keystore',
  'Alias    : mrpilo',
  'StorePass: ' + storePass,
  'KeyPass  : igual a StorePass (misma clave para el almacén y la llave)',
  '',
  'GUARDE ESTE ARCHIVO Y EL KEYSTORE EN UN LUGAR SEGURO Y RESPALDADO.',
  'Toda actualizacion futura de la app en Google Play debe firmarse',
  'con esta misma llave: si se pierde, no se puede actualizar la app',
  'publicada (habria que publicarla como app nueva).',
  '',
  'CREADO: ' + new Date().toISOString(),
  '',
].join('\n');

fs.writeFileSync(path.join(root, 'keys', 'CLAVE-FIRMA.txt'), info);
console.log(storePass);
