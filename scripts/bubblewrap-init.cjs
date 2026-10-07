// Driver no interactivo para `bubblewrap init`.
// Llama a la funcion init del CLI con un objeto de prompts propio para
// fijar las respuestas sin depender de la terminal interactiva.
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

const PROJECT_ROOT = path.resolve(__dirname, '..');
const KEYSTORE = path.join(PROJECT_ROOT, 'pilo-android', 'keys', 'mrpilo-release.keystore');

const init = require(path.join(CLI_LIB, 'cmds', 'init.js')).init;
const { loadOrCreateConfig } = require(path.join(CLI_LIB, 'config.js'));

class StaticPrompt {
  async printMessage(message) {
    console.log(String(message));
  }
  async promptInput(message, defaultValue, validateFunction) {
    let answer = defaultValue;
    if (/^Application ID:/i.test(message)) answer = 'co.edu.udes.mrpilo';
    if (/^Key store location:/i.test(message)) answer = KEYSTORE;
    if (/^Key name:/i.test(message)) answer = 'mrpilo';
    if (validateFunction && answer !== undefined) {
      const result = await validateFunction(answer);
      if (result && typeof result.unwrap === 'function') {
        return result.unwrap();
      }
    }
    return answer;
  }
  async promptChoice(message, choices, defaultValue, validateFunction) {
    if (validateFunction && defaultValue !== undefined) {
      const result = await validateFunction(defaultValue);
      if (result && typeof result.unwrap === 'function') {
        return result.unwrap();
      }
    }
    return defaultValue;
  }
  async promptConfirm(message, defaultValue) {
    return defaultValue;
  }
  async promptPassword() {
    throw new Error('promptPassword inesperado en init (el keystore ya existe)');
  }
}

async function main() {
  const config = await loadOrCreateConfig();
  const ok = await init(
    {
      manifest: 'https://planeacion.udes.edu.co/manifest.webmanifest',
      directory: path.join(PROJECT_ROOT, 'pilo-android', 'twa'),
    },
    config,
    new StaticPrompt()
  );
  console.log('init terminado:', ok);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error('FALLO:', error);
  process.exit(1);
});
