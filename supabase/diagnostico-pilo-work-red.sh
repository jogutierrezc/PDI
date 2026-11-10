#!/usr/bin/env bash
# Diagnóstico 2 de Pilo at Work (pila exc75yz…). SOLO LEE: no cambia nada.
#   1. Variables de Microsoft en el contenedor de funciones (solo presente o falta; nunca valores secretos).
#   2. Límites del runtime (tiempo, memoria) y consumo actual del contenedor.
#   3. Alcance de red: ¿el servidor llega a Microsoft (login y Graph) y a los proveedores de IA, y en cuántos ms?
#   4. Bitácora de las últimas 24 horas: qué pasó con el chat y las acciones de correo.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces):
#   bash supabase/diagnostico-pilo-work-red.sh
set -uo pipefail

SRV="administrador@planeacion.udes.edu.co"
TMPR="$(mktemp)"

cat > "$TMPR" <<'REMOTO'
BASE=/data/coolify/services/exc75yzkfkbkoglxzpckecjp/volumes/functions
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
q() { docker exec -i "$DB" psql -U postgres -d postgres -P pager=off -c "$1"; }

echo "== 1. Variables en el contenedor (solo presente o falta) =="
for v in MS_CLIENT_ID MS_TENANT_ID MS_CLIENT_SECRET PW_TOKEN_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -n "$(docker exec "$CONT" printenv "$v" 2>/dev/null)" ]; then echo "  $v: presente"; else echo "  $v: FALTA"; fi
done
echo "  MS_REDIRECT_URI = $(docker exec "$CONT" printenv MS_REDIRECT_URI 2>/dev/null)"
echo "  SUPABASE_URL    = $(docker exec "$CONT" printenv SUPABASE_URL 2>/dev/null)"

echo; echo "== 2. Límites del runtime y consumo =="
docker inspect -f '  memoria máxima del contenedor: {{.HostConfig.Memory}} bytes (0 = sin tope)' "$CONT"
docker stats --no-stream --format '  uso ahora: cpu {{.CPUPerc}}  memoria {{.MemUsage}} ({{.MemPerc}})' "$CONT"
echo "  main/index.ts (límites que se le dan a cada función):"
grep -nE "workerTimeoutMs|memoryLimitMb|cpuTimeSoftLimitMs|cpuTimeHardLimitMs|forceCreate|timeout" "$BASE/main/index.ts" 2>/dev/null | sed 's/^/    /' || echo "    (no se encontró main/index.ts)"
echo "  carpetas de funciones sin index.ts (causan «could not find an appropriate entrypoint»):"
for d in "$BASE"/*/; do n=$(basename "$d"); [ "$n" = main ] && continue; [ -f "$d/index.ts" ] || echo "    $n"; done

echo; echo "== 3. Alcance de red desde el servidor (host) =="
probar() {
  local u="$1"
  if command -v curl >/dev/null; then
    curl -s -o /dev/null -m 12 -w "  %{http_code}  %{time_total}s  $u\n" "$u" || echo "  FALLA  $u"
  fi
}
probar https://login.microsoftonline.com/
probar https://graph.microsoft.com/v1.0/\$metadata
probar https://api.mistral.ai/v1/models
probar https://integrate.api.nvidia.com/v1/models
echo "  (401, 403 o 302 significan que SÍ llega; 000 o FALLA significa que no llega.)"

echo; echo "== 3b. Alcance de red desde DENTRO del contenedor de funciones =="
if docker exec "$CONT" sh -c 'command -v curl' >/dev/null 2>&1; then
  for u in https://login.microsoftonline.com/ 'https://graph.microsoft.com/v1.0/$metadata' https://api.mistral.ai/v1/models; do
    docker exec "$CONT" curl -s -o /dev/null -m 12 -w "  %{http_code}  %{time_total}s  $u\n" "$u" || echo "  FALLA  $u"
  done
else
  echo "  El contenedor no trae curl; se prueba la resolución de nombres:"
  for h in login.microsoftonline.com graph.microsoft.com api.mistral.ai; do
    if docker exec "$CONT" getent hosts "$h" >/dev/null 2>&1; then echo "  resuelve  $h"; else echo "  NO resuelve (o sin getent)  $h"; fi
  done
fi

echo; echo "== 4. Bitácora de 24 horas (chat y correo) =="
q "select to_char(creado_en at time zone 'America/Bogota','DD HH24:MI') as hora, accion, detalle->>'rondas' as rondas, detalle->>'modelo' as modelo, detalle->>'ms_primer_fragmento' as ms_1er, left(coalesce(detalle->>'error',''),110) as error from public.pw_bitacora where creado_en > now() - interval '24 hours' and (accion like 'chat%' or accion like 'ms_correo%' or accion like 'ms_conect%') order by creado_en desc limit 30"
q "select accion, count(*) as veces from public.pw_bitacora where creado_en > now() - interval '24 hours' group by accion order by veces desc limit 15"
REMOTO

scp "$TMPR" "$SRV:/tmp/pw-diag2.sh" >/dev/null
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pw-diag2.sh; rm -f /tmp/pw-diag2.sh"
rm -f "$TMPR"
