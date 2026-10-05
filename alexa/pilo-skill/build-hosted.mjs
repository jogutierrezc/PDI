/* =============================================================================
   Mr. Pilo en Alexa · el código para una skill alojada por Alexa.

   La consola de desarrollador de Alexa (pestaña Code) despliega una Lambda con
   la plantilla de Amazon: CommonJS y su propio package.json. Para no pelear
   con eso, el código de lambda/ (módulos ES, varios archivos) se junta aquí en
   un solo index.js en CommonJS, que usa lo que la plantilla ya trae
   (ask-sdk-core):  node build-hosted.mjs

   Queda en hosted/lambda/: index.js se pega en la consola en lugar del de la
   plantilla; package.json es el de la plantilla, por si se cambió.
   ========================================================================== */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "hosted", "lambda");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "lambda", "index.js")],
  outfile: join(out, "index.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node16",
  charset: "utf8",
  external: ["ask-sdk-core"],
  banner: { js: "/* Mr. Pilo en Alexa. Generado con build-hosted.mjs desde alexa/pilo-skill/lambda: no se edita aquí, salvo CONFIG. */" },
});

const pkg = {
  name: "mister-pilo",
  version: "1.0.0",
  description: "Mr. Pilo, la IA de la Universidad de Santander, en Amazon Alexa.",
  main: "index.js",
  author: "UDES",
  license: "UNLICENSED",
  dependencies: { "ask-sdk-core": "^2.7.0", "ask-sdk-model": "^1.19.0", "aws-sdk": "^2.326.0" },
};
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Listo: ${join("hosted", "lambda", "index.js")} y package.json.`);
