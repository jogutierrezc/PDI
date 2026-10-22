# Voz del modo AWOO (Pregúntele a Pilo)

AWOO es un personaje original: Pilo en modo reguetonero paisa. Su voz **no imita ni clona a nadie**: se diseña con palabras en ElevenLabs («voice design») y se guarda como el estilo de voz **Awoo**. La página reconoce el modo por ese nombre, igual que «Pilonaitor».

## Qué hace usted, paso a paso

1. Entre a la administración › Mr. Pilo con IA › **Voz** y elija **ElevenLabs** como proveedor. Pegue la clave de ElevenLabs (si no está) y guarde.
2. Baje a **Diseñar la voz de un modo**. La descripción de AWOO y el texto de muestra (el primer saludo del modo, sin etiquetas) ya están puestos; ajústelos si quiere. Describa cómo suena (edad, acento, ritmo, energía), nunca a quién se parece.
3. Pulse **Crear candidatos** (tarda hasta medio minuto). Salen hasta 3.
4. Escuche cada uno con su reproductor y pulse **Usar esta** en el que le guste. Se guarda la voz en su cuenta de ElevenLabs con el nombre «Awoo» y se agrega el estilo «Awoo» (tono `excited`) a la lista de estilos.
5. Pulse **Guardar cambios** de la pantalla de Voz. Abra Pregúntele a Pilo, active el modo AWOO y pruébelo.

## Qué necesita

- Clave de ElevenLabs con permiso de **Text to Voice** y **Voices** (escritura). Vive solo en el servidor.
- Un plan que permita diseñar voces y tenga espacio para una voz más. Cada diseño y cada guardado gastan créditos. Tope: 12 diseños por día.
- Desplegar la función `pilo-ia` con todos sus archivos (incluido `voz-diseno.ts`). No hay migración.

## Perfil de la voz

Tono `excited`, velocidad 1,04×, tono de voz 1,0. Grito de guerra «¡Awoo!» con la emoción `shouting`. Emociones por frase del saludo: confident, authoritative, proud, relaxed, rhythmic, energetic, hype. El servidor las traduce con `emotionsOf`/`tagsOf` de `supabase/functions/pilo-ia/elevenlabs.ts` (con Eleven v3 o v4, `[excited]` en rhythmic, energetic, hype y shouting; el resto sin etiqueta). Código del perfil: `src/modules/admin/pilo/voz-awoo.ts`.

## Alternativas

- **Fish Audio o NVIDIA**: suba una muestra propia, grabada o autorizada por quien la grabe, y llame al estilo «Awoo». Funciona por el nombre.
- **Sin voz propia**: el modo usa la voz de Pilo con el tono y la velocidad del modo.

## Documentación consultada

API de ElevenLabs, 2026-10-22: `POST /v1/text-to-voice/design` (voice_description, text de 100 a 1000 caracteres, model_id `eleven_ttv_v3`; responde `previews[]` con `generated_voice_id` y `audio_base_64`) y `POST /v1/text-to-voice` (voice_name, voice_description, generated_voice_id). No confirmado: límites de la descripción, voces permitidas por plan y códigos de error exactos.
