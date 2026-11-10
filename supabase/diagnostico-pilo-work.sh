#!/usr/bin/env bash
# Diagnóstico de Pilo at Work en producción (pila exc75yz…). SOLO LEE: no cambia nada.
#   1. Compara las funciones pilo-work y pw-microsoft del servidor con las de este proyecto (hash por archivo).
#   2. Muestra los últimos errores de las funciones (sin contenidos ni claves).
#   3. Muestra qué dijo la bitácora de Pilo at Work en la última hora (rondas, errores, tiempo al primer fragmento).
#   4. Dice si la conexión de Microsoft tiene permiso de correo (solo alcances, nunca tokens) y si las migraciones 0243 a 0247 están.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces):
#   bash supabase/diagnostico-pilo-work.sh
set -uo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOCAL="$(mktemp)"
TMPR="$(mktemp)"

echo "Hashes de este proyecto…"
( cd "$AQUI/functions" && sha256sum pilo-work/*.ts pw-microsoft/*.ts pilo-rankingsod/proveedor.ts pilo-informes/ia.ts 2>/dev/null | sed 's/\r$//' ) > "$LOCAL"

cat > "$TMPR" <<'REMOTO'
BASE=/data/coolify/services/exc75yzkfkbkoglxzpckecjp/volumes/functions
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
q() { docker exec -i "$DB" psql -U postgres -d postgres -P pager=off -c "$1"; }

echo "== Hashes en el servidor =="
( cd "$BASE" && sha256sum pilo-work/*.ts pw-microsoft/*.ts pilo-rankingsod/proveedor.ts pilo-informes/ia.ts 2>&1 )

echo; echo "== Contenedor =="
docker inspect -f 'estado={{.State.Status}} salud={{.State.Health.Status}} desde={{.State.StartedAt}}' "$CONT"

echo; echo "== Últimos errores de las funciones (60 líneas) =="
docker logs --since 6h "$CONT" 2>&1 | grep -iE "pilo-work|pw-microsoft|error|uncaught|timeout|worker" | grep -viE "password|secret|token=|bearer" | tail -60

echo; echo "== Migraciones de Pilo at Work =="
q "select to_regclass('public.pw_roles') is not null as m0243, to_regclass('public.pw_ms_tokens') is not null as m0244, to_regclass('public.pw_equipos') is not null as m0245, to_regclass('public.pw_perfiles') is not null as m0246, to_regclass('public.pw_config') is not null as m0247"

echo; echo "== Conexión de Microsoft (solo alcances) =="
q "select count(*) as personas, count(*) filter (where scopes ilike '%Mail.Read%') as con_mail_read, count(*) filter (where expira_en < now()) as con_token_vencido from public.pw_ms_tokens"

echo; echo "== Bitácora de la última hora (chat y correo) =="
q "select to_char(creado_en at time zone 'America/Bogota','HH24:MI:SS') as hora, accion, detalle->>'rondas' as rondas, detalle->>'modelo' as modelo, detalle->>'ms_primer_fragmento' as ms_1er, left(coalesce(detalle->>'error',''),120) as error from public.pw_bitacora where creado_en > now() - interval '1 hour' and (accion like 'chat%' or accion like 'ms_correo%') order by creado_en desc limit 25"
REMOTO

scp "$TMPR" "$SRV:/tmp/pw-diag.sh" >/dev/null
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pw-diag.sh; rm -f /tmp/pw-diag.sh" | tee "$TMPR.salida"

echo
echo "== Comparación de archivos (iguales = OK) =="
awk '/^== Hashes en el servidor/{f=1;next} /^== Contenedor/{f=0} f && NF==2{print}' "$TMPR.salida" | sed 's/\r$//' | sort -k2 > "$TMPR.srv"
sort -k2 "$LOCAL" > "$LOCAL.ord"
if diff -q "$LOCAL.ord" "$TMPR.srv" >/dev/null; then echo "Todos los archivos del servidor son iguales a los de este proyecto."; else echo "DIFERENCIAS (< proyecto, > servidor):"; diff "$LOCAL.ord" "$TMPR.srv"; fi
rm -f "$TMPR" "$TMPR.salida" "$TMPR.srv" "$LOCAL" "$LOCAL.ord"
