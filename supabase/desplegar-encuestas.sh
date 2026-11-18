#!/usr/bin/env bash
# Encuestas con Pilo · despliega la función de borde `encuestas` en producción (pila exc75yz…).
# Síntoma que corrige: al enviar una encuesta, POST /functions/v1/encuestas → 404 (la carpeta de
# la función no existe en el servidor). También sirve para actualizarla (deja respaldo).
# No toca la base de datos (las migraciones 0179/0184/0186/0274 se aplican aparte).
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador»: ssh, scp y sudo):
#   bash supabase/desplegar-encuestas.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOCAL="$AQUI/functions/encuestas"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

[ -f "$LOCAL/index.ts" ] || { echo "No encuentro $LOCAL/index.ts"; exit 1; }

echo "1/2 Copiando encuestas al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/encuestas-nuevo && mkdir -p /tmp/encuestas-nuevo"
scp "$LOCAL"/*.ts "$SRV:/tmp/encuestas-nuevo/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/encuestas-nuevo

echo "2/2 Instalando encuestas…"
[ -f "$NUEVO/index.ts" ] || { echo "FALTA index.ts en lo copiado: no se instala."; exit 1; }
# Una función hermana que ya funciona, para copiarle dueño y permisos.
REF=""; for d in pilo-publica pilo-ia pilo-rankingsod; do [ -d "$BASE/$d" ] && { REF="$BASE/$d"; break; }; done
[ -n "$REF" ] || { echo "No hay ninguna función hermana en $BASE: revise la ruta."; exit 1; }
find "$NUEVO" -name '*.ts' -exec sed -i 's/\r$//' {} +
if [ -d "$BASE/encuestas" ]; then
  mkdir -p "$RAIZ/backups-funciones/$STAMP"
  cp -a "$BASE/encuestas" "$RAIZ/backups-funciones/$STAMP/encuestas"
  echo "  respaldo: $RAIZ/backups-funciones/$STAMP/encuestas"
else
  echo "  la carpeta no existía: es la primera instalación"
fi
mkdir -p "$BASE/encuestas"
cp "$NUEVO"/*.ts "$BASE/encuestas/"
chown -R --reference="$REF" "$BASE/encuestas"
chmod --reference="$REF" "$BASE/encuestas"
( cd "$NUEVO" && sha256sum *.ts ) > /tmp/enc-hash-o.txt
( cd "$BASE/encuestas" && sha256sum *.ts ) > /tmp/enc-hash-d.txt
diff -q /tmp/enc-hash-o.txt /tmp/enc-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
rm -f /tmp/enc-hash-o.txt /tmp/enc-hash-d.txt
docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
echo "  estado: $s"
sleep 3
ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
c=$(curl -s -o /tmp/enc-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/encuestas" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"info","slug":"__prueba__"}' 2>/dev/null || echo 000)
echo "  respuesta ($c): $(head -c 160 /tmp/enc-resp.txt)"
case "$c" in
  404) grep -qi 'function' /tmp/enc-resp.txt && echo "  MAL: el servidor aún no encuentra la función" || echo "  OK: la función responde (404 = encuesta de prueba inexistente)";;
  200|400|401|403) echo "  OK: la función responde";;
  *) echo "  REVISAR: código $c";;
esac
rm -f /tmp/enc-resp.txt
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/enc-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/enc-remoto.sh $STAMP; rm -f /tmp/enc-remoto.sh"
rm -f "$TMPR"
echo "Listo. Vuelva a enviar la encuesta: ya no debe dar 404."
