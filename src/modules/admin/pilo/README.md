# Mr. Pilo con IA · administración · la voz

La pestaña **Voz** elige con qué voz lee Pilo. Las voces con proveedor (NVIDIA, Fish Audio, ElevenLabs, Free.ai) pasan por la función `pilo-ia` (acción `voz`); el servidor nunca responde con la voz del navegador: o entrega la voz oficial de Pilo o un error (`code: sin_voz`). Qué hace la página con ese error (hoy, leer con el navegador en la web; solo texto en la app) es decisión del cliente y no cambió.

| Proveedor | Clave (`pilo_ai_secret`) | Voz | Emoción | Migración |
|---|---|---|---|---|
| NVIDIA Magpie | `nvidia_key` | muestra de 3 a 10 s | la pone la muestra | 0101 |
| Fish Audio | `fishaudio_key` | `fish_id` del estilo | etiqueta de tono por estilo | 0102 |
| ElevenLabs | `elevenlabs_key` | `eleven_voice_id` y `eleven_id` por estilo | etiquetas de audio (v3/v4) o `voice_settings` | 0172 |
| Free.ai / otro | `freeai_key` / `otro_key` | voz del servicio | no | 0090, 0091 |

Las claves se guardan con `pilo_ai_set_key` y nunca vuelven al navegador: solo los últimos 4 caracteres.

## ElevenLabs (0172)

Código: `supabase/functions/pilo-ia/elevenlabs.ts` (lógica pura, probada), `elevenlabs-voz.ts` (red, caché, errores, cantar) y, en esta carpeta, `ElevenLabsVoice.tsx` y `eleven.ts` (pantalla). Documentación de ElevenLabs consultada el 2026-10-19; las direcciones están citadas en el encabezado de `elevenlabs.ts`.

- **Voz**: `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, clave en `xi-api-key`. Modelos: `eleven_v3`, `eleven_v4` (etiquetas de audio), `eleven_multilingual_v2`, `eleven_flash_v2_5`. Lo ya dicho se guarda en `pilo-voz/cache/<sha256>.mp3`, con el mismo tope de cupo de voz (`voice_daily_limit`) que los demás.
- **Emociones**: la tabla `EMOTIONS` de `elevenlabs.ts` une los ánimos de Pilo (`emocionado`, `atento`, `atrevido`, `cuidado`, `pensar`), los tonos cerrados del chat y el tono de cada estilo con (a) etiquetas de una lista cerrada (`[excited]`, `[whispers]`, `[laughs]`, `[sighs]`, `[sarcastic]`, `[curious]`, `[mischievously]`, `[exhales]`) puestas por el servidor al inicio de la frase, o (b) con los modelos sin etiquetas, `stability`/`style`/`speed`. Todo `[...]`, `{...}` y `<...>` que traiga el texto se elimina antes.
- **Respaldo**: si ElevenLabs falla o no tiene créditos y la administración eligió Fish Audio o NVIDIA, suena ese; si no, error claro (`sin_voz`, `cupo_proveedor`...). Las pruebas desde esta pantalla nunca usan el respaldo.
- **Probar la conexión**: `GET /v1/user/subscription` (solo lectura) muestra plan y caracteres usados del mes. **Ver las voces**: `GET /v2/voices`.
- **Costo**: ElevenLabs cobra por caracteres; vigile el uso del mes aquí y el cupo diario de voz en Uso.
- La vía directa de Vercel (`api/pilo-voz.js`) sigue siendo solo de Fish Audio: con ElevenLabs no ponga `FISH_AUDIO_KEY` en Vercel, o esa vía seguirá respondiendo con la voz de Fish.

## Cantar (acción `cantar`)

Composiciones **originales** (jingle, saludo, cumpleaños). Dos rutas:

1. **Con la voz de Pilo** (experimental): `eleven_v3`/`v4` con la etiqueta `[sings]` y la voz de Pilo. Sin acompañamiento. Pide la letra.
2. **Eleven Music**: `POST /v1/music` (`music_v2_5`), canción con acompañamiento y su propio cantante. La API **no permite elegir la voz**, así que no es la de Pilo. Solo planes de pago.

Reglas: apagado por defecto (`pilo_extras.sing_aud` = `nadie`); la administración siempre prueba desde esta pantalla; el servidor rechaza «la canción X de <artista>», «al estilo de», covers, karaoke, remix y parodias (`songRefusal`), y ElevenLabs rechaza por su lado lo que reconoce (`bad_prompt`). Topes por espacio: canciones nuevas al día, caracteres de la letra y duración máxima. Lo cantado se guarda en la caché por hash.

**Gancho para el chat** (hoy apagado): `CHAT_SING_ENABLED` en `elevenlabs.ts`. Para que Pilo cante en el chat habría que detectar el pedido, llamar a `cantar` con una letra original y respetar `sing_aud` del espacio.
