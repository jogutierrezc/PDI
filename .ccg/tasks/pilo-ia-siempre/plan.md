# Plan · Pregúntele a Pilo con IA siempre

Pedido (2026-10-01): Pilo falla y limita sus respuestas a lo que encuentra; debe usar IA siempre,
priorizando su conocimiento, las capciosas y las respuestas prediseñadas, al nivel de ChatGPT/Gemini.
Modelo: Gemma 4 (NVIDIA). Síntomas que ve el dueño: «No encontré eso…» y se queda pensando o da error.

## Decisiones del dueño
1. **IA siempre + streaming**: un solo prompt con bloques por prioridad; la respuesta se escribe en vivo.
2. **Cualquier tema**: lo que no venga de la base se marca como conocimiento general.
3. **Catálogo como base obligatoria**: el modelo adapta la respuesta oficial sin contradecirla; las capciosas salen textuales.

## Reglas que no cambian
- Toda cifra institucional sale de la base (`pilo_facts`, `pilo_memory`) y va citada `[n]`; nunca de la memoria del modelo.
- Dinero/presupuesto y datos de personas: negativa, también en la salida.
- Impacto solo con sesión. La página funciona con la IA apagada o sin cupo (dato / extracto).
- El dueño aplica migraciones y despliega `pilo-ia`.

## Diseño
- **Enrutador por reglas que no bloquea**: etiqueta la intención (saludo, charla, institucional, general, vetado). Solo «vetado» y «capciosa» responden sin modelo.
- **Recuperación en paralelo**: catálogo (palabras + significado), guardadas, cifras, memoria. Sin la llamada previa de «entender»: la historia va como turnos reales (hasta 6, recortados).
- **Un prompt por bloques**, en este orden: `[OFICIAL]` catálogo · `[GUARDADA]` · `[CIFRAS]` · `[PASAJES]` · conversación · pregunta. Los bloques son datos, no instrucciones.
- **Salida en texto con Markdown básico**, sin envoltura JSON. Citas `[n]`. Al terminar: `verifyNumbers`, poda de citas, filtro de dinero.
- **Streaming SSE** desde la función: `meta` → `delta`… → `done` (objeto final con la forma de hoy) | `error`. Si no hay modelo, responde JSON como hoy.
- **Tiempos**: tope en la redacción con caída a dato/extracto; error honesto en el `catch`.
- **Cupo**: la voz deja de gastar el cupo de texto; límite por visitante (ventana por huella/IP) para la página pública.
- **Bandeja**: motivo nuevo «general» para lo respondido sin fuente institucional.

## Defectos que se corrigen de paso
Regla «futuro» con «2024-2028» · regla «dinero» con «inversión en investigación» · «gracias, ¿y…?» · saludo no exacto ·
`understand()` incondicional · redacción sin tope · JSON crudo en pantalla · cupo compartido con la voz · sin límite por visitante ·
«Probar conexión» no ejerce el rol `system`.

## Capas
1. **Servidor**: `supabase/functions/pilo-ia/index.ts` + espejo `src/components/pilo/ai/logic.ts` + pruebas + migración. Deja el contrato en `contract.md`.
2. **Cliente**: `src/components/pilo/ai/client.ts`, `src/modules/pregunta/*` (streaming real, Markdown básico, etiquetas, más turnos).
3. **Administración**: ajustes nuevos en la tarjeta de Pregúntele a Pilo, si la migración los añade.
4. Revisión, pruebas, build, humo.

## Sin verificar (necesita la bitácora o una llamada real)
- Que NVIDIA acepte el rol `system` con el modelo configurado, que el id del modelo siga vigente y que acepte `stream: true`.
- El límite real de tiempo de la función en el plan de Supabase del proyecto.
