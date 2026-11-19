#!/usr/bin/env bash
# Pilo · «Pilo Docente» (cursos, listas y asistencia desde Aluna/Roomy) en producción (pila exc75yz…):
#   - función de borde NUEVA `pilo-roomy`: valida la sesión de Pilo y llama a `pilo-puente` de Aluna con un secreto compartido.
#     Usa pilo_visitor_hit (0110) para el límite por persona y hora (120; cambie PILO_ROOMY_HORA en el contenedor).
#   - ANTES hay que poner en el contenedor de funciones dos variables (este script no las toca):
#       ALUNA_PUENTE_URL    la URL de `pilo-puente` en Aluna (confirmar la ruta; ver PILO_PUENTE.md, paso 6)
#       PILO_PUENTE_SECRET  el MISMO secreto (>= 32 caracteres) que tiene `pilo-puente` en Aluna
#   Respaldo si ya existía, un reinicio del contenedor y prueba de arranque.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador»: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-roomy.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

for f in index.ts handler.ts limite.ts; do
  [ -f "$AQUI/functions/pilo-roomy/$f" ] || { echo "Falta $AQUI/functions/pilo-roomy/$f"; exit 1; }
done

echo "1/2 Copiando la función al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/piloroomy-nuevo && mkdir -p /tmp/piloroomy-nuevo/pilo-roomy"
scp "$AQUI"/functions/pilo-roomy/*.ts "$SRV:/tmp/piloroomy-nuevo/pilo-roomy/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/piloroomy-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }

[ "$(psqlq -c "select to_regprocedure('public.pilo_visitor_hit(text,timestamptz)') is not null")" = "t" ] \
  || { echo "FALTA pilo_visitor_hit (0110): no se instala nada."; exit 1; }

for v in ALUNA_PUENTE_URL PILO_PUENTE_SECRET; do
  n=$( (docker exec "$CONT" printenv "$v" 2>/dev/null || true) | tr -d '\n' | wc -c)
  [ "$n" -gt 0 ] && echo "  $v: puesta ($n caracteres)" || echo "  AVISO: $v NO está en el contenedor; la función responderá 503 hasta que la ponga."
done
echo "2/2 Instalando pilo-roomy (respaldo en $RESP)…"
sed -i 's/\r$//' "$NUEVO"/pilo-roomy/*.ts
mkdir -p "$RESP"
[ -d "$BASE/pilo-roomy" ] && cp -a "$BASE/pilo-roomy" "$RESP/pilo-roomy" || true
mkdir -p "$BASE/pilo-roomy"
cp "$NUEVO"/pilo-roomy/*.ts "$BASE/pilo-roomy/"
chown -R --reference="$BASE/pilo-ia" "$BASE/pilo-roomy"
( cd "$NUEVO/pilo-roomy" && sha256sum *.ts ) > /tmp/piloroomy-hash-o.txt
( cd "$BASE/pilo-roomy" && sha256sum $(cd "$NUEVO/pilo-roomy" && ls *.ts) ) > /tmp/piloroomy-hash-d.txt
diff -q /tmp/piloroomy-hash-o.txt /tmp/piloroomy-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
echo "  estado: $s"
sleep 5
ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
URL="https://planeacion.udes.edu.co/functions/v1/pilo-roomy"
# Prueba de arranque (no gasta nada): OPTIONS responde 204 y, con la clave anónima, un POST responde 401 «sin_sesion».
# Si la función no arranca (p. ej. no puede bajar docx o exceljs desde npm:), ninguna de las dos pasa.
c=$(curl -s -o /dev/null -m 60 -w '%{http_code}' -X OPTIONS "$URL" -H "apikey: $ANON" 2>/dev/null || echo 000)
case "$c" in 204) echo "  OK pilo-roomy OPTIONS ($c)";; *) echo "  MAL pilo-roomy OPTIONS ($c): mire «docker logs --tail 80 $CONT» (¿no baja las librerías npm:?)";; esac
c=$(curl -s -o /tmp/piloroomy-resp.txt -m 60 -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}' 2>/dev/null || echo 000)
case "$c" in 401) echo "  OK pilo-roomy sin sesión ($c) $(head -c 120 /tmp/piloroomy-resp.txt)";; *) echo "  MAL pilo-roomy ($c) $(head -c 160 /tmp/piloroomy-resp.txt)";; esac
rm -f /tmp/piloroomy-hash-o.txt /tmp/piloroomy-hash-d.txt /tmp/piloroomy-resp.txt
echo "  Para volver atrás: borre $BASE/pilo-roomy (o copie $RESP/pilo-roomy encima) y reinicie el contenedor."
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/piloroomy-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/piloroomy-remoto.sh $STAMP; rm -f /tmp/piloroomy-remoto.sh"
rm -f "$TMPR"
echo "Listo. La función pilo-roomy está instalada. Si no puso las dos variables, hágalo en el contenedor y reinícielo."
