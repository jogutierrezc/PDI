const fs = require('fs');
const os = require('os');
const path = require('path');

const home = os.homedir();
const toolsDir = path.join(home, 'android-tools');
const jdkDir = fs.readdirSync(toolsDir).find((d) => d.startsWith('jdk-17'));
const bubblewrapDir = path.join(home, '.bubblewrap');
fs.mkdirSync(bubblewrapDir, { recursive: true });

const cfg = {
  jdkPath: path.join(toolsDir, jdkDir),
  androidSdkPath: path.join(toolsDir, 'sdk'),
};
const cfgPath = path.join(bubblewrapDir, 'config.json');
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log('written:', cfgPath);
console.log(fs.readFileSync(cfgPath, 'utf8'));
console.log('parse ok:', !!JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
