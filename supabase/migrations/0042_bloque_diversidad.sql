-- =============================================================================
-- PDI · 0042 · Bloque «Tablero de la diversidad»
--
-- Un tipo de bloque propio para la ficha de Diversidad, Equidad e Inclusión:
-- lee los indicadores, desgloses y el mapa de calor INES que ya publica el
-- informe (0041) y los dibuja como un tablero dedicado.
--
-- Va sola en su archivo: un valor nuevo de un enum no se puede usar en la
-- misma transacción que lo crea. La ficha lo estrena en 0043.
--
-- Requiere 0019. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'diversidad';
