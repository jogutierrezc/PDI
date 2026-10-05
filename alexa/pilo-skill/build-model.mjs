/* =============================================================================
   Mr. Pilo en Alexa · el modelo de voz.

   Los tres idiomas de Alexa en español (México, Estados Unidos y España) usan
   el mismo modelo, y cada palabra interrogativa tiene su propio intent (ver
   lambda/index.js). Para no mantener a mano tres archivos iguales, se escriben
   desde aquí:  node build-model.mjs
   ========================================================================== */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES = ["es-MX", "es-US", "es-ES"];

/** Las entradas neutras: lo que sigue es la pregunta entera. */
const OPENERS = ["dime", "dígame", "cuéntame", "quiero saber", "quisiera saber", "necesito saber", "me puedes decir", "pregunta", "pregúntale", "busca", "responde", "explícame", "háblame de", "qué sabes de", "información sobre"];

/** Un intent por palabra interrogativa. Los nombres son los de QUESTION_WORD, en lambda/index.js. */
const WORDS = {
  PreguntaQueIntent: ["qué"],
  PreguntaCualIntent: ["cuál"],
  PreguntaCualesIntent: ["cuáles"],
  PreguntaCuantoIntent: ["cuánto"],
  PreguntaCuantaIntent: ["cuánta"],
  PreguntaCuantosIntent: ["cuántos"],
  PreguntaCuantasIntent: ["cuántas"],
  PreguntaComoIntent: ["cómo"],
  PreguntaDondeIntent: ["dónde", "en dónde"],
  PreguntaCuandoIntent: ["cuándo"],
  PreguntaQuienIntent: ["quién"],
  PreguntaQuienesIntent: ["quiénes"],
  PreguntaPorQueIntent: ["por qué"],
};

const ask = (name, carriers) => ({
  name,
  slots: [{ name: "consulta", type: "AMAZON.SearchQuery" }],
  samples: carriers.map((c) => `${c} {consulta}`),
});

const model = {
  interactionModel: {
    languageModel: {
      invocationName: "mister pilo",
      intents: [
        { name: "AMAZON.CancelIntent", samples: [] },
        { name: "AMAZON.HelpIntent", samples: [] },
        { name: "AMAZON.StopIntent", samples: [] },
        { name: "AMAZON.NavigateHomeIntent", samples: [] },
        { name: "AMAZON.FallbackIntent", samples: [] },
        { name: "AMAZON.RepeatIntent", samples: [] },
        // El «sí» que recoge la respuesta que Pilo quedó redactando, y el «no» que la deja.
        { name: "AMAZON.YesIntent", samples: [] },
        { name: "AMAZON.NoIntent", samples: [] },
        ask("PreguntarIntent", OPENERS),
        ...Object.entries(WORDS).map(([name, carriers]) => ask(name, carriers)),
      ],
      types: [],
    },
  },
};

const dir = join(dirname(fileURLToPath(import.meta.url)), "skill-package", "interactionModels", "custom");
mkdirSync(dir, { recursive: true });
for (const locale of LOCALES) writeFileSync(join(dir, `${locale}.json`), `${JSON.stringify(model, null, 2)}\n`);
console.log(`Modelo escrito para ${LOCALES.join(", ")}.`);
