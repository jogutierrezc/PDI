# Pilo Astra 1.0: instrucciones de pensamiento y adjuntos

Estado: **borrador de instrucciones**. La capa que las procesa (servidor, puente y apps) todavía no está
construida; se retoma después. Este archivo fija lo decidido y lo comprobado para no perderlo.

## Decisiones

- **El razonamiento se queda en inglés.** No se le pide que piense en español. Es el texto real que produce
  el modelo y se muestra tal cual, sin traducir ni reescribir.
- **La respuesta va en el idioma de quien pregunta** (español, inglés o portugués), con el tono de Pilo.
- **El pensamiento se muestra aparte de la respuesta**, en un panel plegable («Cómo pensó Pilo»), con el
  tiempo que lleva pensando. No se mezcla con la respuesta ni se cita como fuente.
- **Se espera el tiempo real del pensamiento.** No se simula: la respuesta aparece cuando el modelo termina
  de pensar.
- Pilo solo lee: no escribe en Génesis ni en Moodle.

## Lo comprobado en el modelo local (Ollama, 17 nov 2026)

- `pilo-astra:1.0`: arquitectura `gemma4_unified`, 12,4 B de parámetros, contexto de 32768 (`num_ctx`),
  temperatura 0,3. Capacidades: texto, visión, audio, herramientas y **pensamiento** (por defecto activo).
- Con `think: true` en `/api/chat`, el flujo trae el razonamiento en un campo `thinking` separado de
  `content`. En la prueba: primer texto de razonamiento a los 3,4 s, primera palabra de la respuesta a los
  14,6 s, total 21,4 s (unas 460 palabras de razonamiento). Sin pensar: 0,2 s y 5,3 s.
- El razonamiento llegó en inglés, como borrador con viñetas y notación matemática.

## Lo que ya existe en PDI

- `supabase/functions/pilo-work/proveedor.ts` pide el razonamiento con `reasoning_effort` y el proxy lo apaga
  si no se pide (líneas ~233 y ~320).
- El SSE de `pilo-ia` ya emite eventos `thinking` y `step`; la app de Apple hoy los ignora.

## Por construir (sin fecha)

1. **Reenvío del pensamiento** por el puente: que llegue `thinking` a `pilo-ia` y de ahí a la app. No está
   confirmado que el puente lo reenvíe.
2. **Panel de pensamiento** en las apps: indicador «pensando» con el contador, texto del razonamiento en
   vivo y plegable; respeta «Reducir movimiento».
3. **Adjuntos y carga de información**: selector de archivos y fotos. Imágenes y audio los acepta el modelo;
   PDF y Word se convierten a texto antes. El contexto es de 32768, por lo que los archivos largos se
   fragmentan o se resumen.
4. **Reglas de privacidad de los adjuntos**: qué se guarda, por cuánto tiempo y quién lo ve. Por decidir.

## Por decidir

- Si el razonamiento se muestra completo o recortado a las últimas líneas.
- Nivel de esfuerzo de razonamiento por tipo de pregunta (rápida o profunda).
- Tamaño máximo y formatos de los adjuntos.
