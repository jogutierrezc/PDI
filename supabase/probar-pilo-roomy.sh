#!/usr/bin/env bash
# Pilo · diagnóstico de la conexión PDI → Aluna, hecho DESDE el contenedor de funciones de PDI (la misma red y las mismas variables
# que usa `pilo-roomy`). No muestra el secreto. Solo lee; no cambia nada.
#   bash supabase/probar-pilo-roomy.sh
set -euo pipefail
SRV="administrador@planeacion.udes.edu.co"
TMPR="$(mktemp)"
cat > "$TMPR" <<'REMOTO'
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
for v in ALUNA_PUENTE_URL PILO_PUENTE_SECRET; do
  n=$( (docker exec "$CONT" printenv "$v" 2>/dev/null || true) | tr -d '\n' | wc -c )
  echo "  $v: $n caracteres"
done
echo "  URL que usa: $(docker exec "$CONT" printenv ALUNA_PUENTE_URL 2>/dev/null || echo '(ninguna)')"

echo "== Llamada a Aluna desde el servidor, con el secreto que tiene PDI (el contenedor no trae curl) =="
URL=$(docker exec "$CONT" printenv ALUNA_PUENTE_URL 2>/dev/null | tr -d '\n')
SEC=$(docker exec "$CONT" printenv PILO_PUENTE_SECRET 2>/dev/null | tr -d '\n')
CUERPO='{"accion":"estado","correo":"diagnostico@mail.udes.edu.co"}'
c=$(curl -s -m 20 -o /tmp/d.txt -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -H "x-pilo-secret: $SEC" -d "$CUERPO" 2>/dev/null || echo 000)
echo "  HTTP $c  $(head -c 300 /tmp/d.txt 2>/dev/null)"
rm -f /tmp/d.txt
echo
echo "== Últimas líneas del contenedor de funciones (por si pilo-roomy dejó algo) =="
docker logs --tail 25 "$CONT" 2>&1 | grep -i -E "roomy|aluna|puente|error|InvalidWorker" | tail -10 | cut -c1-220 || true
echo
echo "Cómo leerlo:"
echo "  HTTP 200 con estado …        -> conecta y el secreto coincide: el problema está en otra parte."
echo "  HTTP 401 NO_AUTORIZADO       -> el secreto de PDI NO es igual al de Aluna."
echo "  HTTP 500/404 o 'entrypoint'  -> la dirección es otra o pilo-puente no arranca."
echo "  NO SE PUDO CONECTAR          -> el contenedor no alcanza planeacion.udes.edu.co (red interna)."
REMOTO
scp -q "$TMPR" "$SRV:/tmp/piloroomy-prueba.sh"
ssh -t "$SRV" "sudo bash /tmp/piloroomy-prueba.sh; rm -f /tmp/piloroomy-prueba.sh"
rm -f "$TMPR"
