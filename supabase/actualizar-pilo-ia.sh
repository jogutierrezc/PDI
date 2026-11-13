#!/usr/bin/env bash
# Pilo (portales) · función de borde `pilo-ia` en producción (pila exc75yz…):
#   - a un servidor propio (Ollama…) con un modelo que razona se le pide `reasoning_effort: "none"`:
#     antes el modelo gastaba el tope pensando, `content` llegaba vacío y Pilo respondía «sin IA»
#     con lo publicado, sin cifras ni redacción propia.
#   Copia la carpeta supabase/functions/pilo-ia (con lectores/), respaldo FUERA de la carpeta de
#   funciones, un reinicio del contenedor y una prueba de arranque. No toca la base de datos.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-ia.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

echo "1/2 Copiando pilo-ia al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/pilo-ia-nuevo && mkdir -p /tmp/pilo-ia-nuevo"
scp -r "$AQUI/functions/pilo-ia/." "$SRV:/tmp/pilo-ia-nuevo/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/pilo-ia-nuevo

echo "2/2 Instalando pilo-ia (respaldo en $RESP)…"
[ -f "$NUEVO/index.ts" ] || { echo "FALTA index.ts en lo copiado: no se instala."; exit 1; }
[ -d "$BASE/pilo-ia" ] || { echo "No existe $BASE/pilo-ia en el servidor: no se instala."; exit 1; }
mkdir -p "$RESP"
find "$NUEVO" -name '*.ts' -exec sed -i 's/\r$//' {} +
cp -a "$BASE/pilo-ia" "$RESP/pilo-ia"
cp -a "$NUEVO/." "$BASE/pilo-ia/"
chown -R --reference="$RESP/pilo-ia" "$BASE/pilo-ia"
( cd "$NUEVO" && find . -name '*.ts' | sort | xargs sha256sum ) > /tmp/pilo-ia-hash-o.txt
( cd "$BASE/pilo-ia" && sha256sum $(cd "$NUEVO" && find . -name '*.ts' | sort) ) > /tmp/pilo-ia-hash-d.txt
diff -q /tmp/pilo-ia-hash-o.txt /tmp/pilo-ia-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
grep -q 'reasoning_effort' "$BASE/pilo-ia/index.ts" && echo "  cambio presente en index.ts" || { echo "  EL CAMBIO NO ESTÁ"; exit 1; }
docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
echo "  estado: $s"
sleep 3
ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
c=$(curl -s -o /tmp/pilo-ia-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-ia" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
case "$c" in 200|400|401|403) echo "  OK pilo-ia ($c) $(head -c 90 /tmp/pilo-ia-resp.txt)";; *) echo "  MAL pilo-ia ($c) $(head -c 160 /tmp/pilo-ia-resp.txt)";; esac
rm -f /tmp/pilo-ia-hash-o.txt /tmp/pilo-ia-hash-d.txt /tmp/pilo-ia-resp.txt
echo "  Para volver atrás: copie $RESP/pilo-ia sobre $BASE/pilo-ia y reinicie el contenedor."
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/pilo-ia-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pilo-ia-remoto.sh $STAMP; rm -f /tmp/pilo-ia-remoto.sh"
rm -f "$TMPR"
echo "Listo. Pruebe una pregunta con cifras en un portal: ya no debe decir que responde sin IA."
