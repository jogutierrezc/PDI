// Driver no interactivo para `bubblewrap build`.
// - Lee la clave del keystore desde pilo-android/keys/CLAVE-FIRMA.txt
// - La inyecta por BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD
// - Corre el build desde pilo-android/twa (cwd que espera GradleWrapper)
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI_LIB = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'npm',
  'node_modules',
  '@bubblewrap',
  'cli',
  'dist',
  'lib'
);

const { build } = require(path.join(CLI_LIB, 'cmds', 'build.js'));
const { loadOrCreateConfig } = require(path.join(CLI_LIB, 'config.js'));

const PROJECT_ROOT = path.resolve(__dirname, '..');
// Permite compilar desde una copia ASCII del proyecto (ver scripts/bubblewrap-setup-ascii.cjs).
const TWA_DIR = process.env.TWA_PROJECT_DIR || path.join(PROJECT_ROOT, 'pilo-android', 'twa');
const KEY_INFO = fs
  .readFileSync(path.join(PROJECT_ROOT, 'pilo-android', 'keys', 'CLAVE-FIRMA.txt'), 'utf8')
  .split('\n')
  .find((line) => line.startsWith('StorePass:'))
  .split(': ')[1]
  .trim();

process.env.BUBBLEWRAP_KEYSTORE_PASSWORD = KEY_INFO;
process.env.BUBBLEWRAP_KEY_PASSWORD = KEY_INFO;

class StaticPrompt {
  async printMessage(message) {
    console.log(String(message));
  }
  async promptConfirm(message, defaultValue) {
    console.log(`[confirm] ${message} -> ${defaultValue}`);
    return defaultValue;
  }
  async promptInput(message, defaultValue) {
    console.log(`[input] ${message} -> ${defaultValue}`);
    return defaultValue;
  }
  async promptPassword(message) {
    throw new Error(`promptPassword inesperado: ${message}`);
  }
}

async function main() {
  process.chdir(TWA_DIR);
  const config = await loadOrCreateConfig();
  const ok = await build(
    config,
    { directory: TWA_DIR, manifest: path.join(TWA_DIR, 'twa-manifest.json') },
    undefined,
    new StaticPrompt()
  );
  console.log('build terminado:', ok);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error('FALLO BUILD:', error);
  process.exit(1);
});
