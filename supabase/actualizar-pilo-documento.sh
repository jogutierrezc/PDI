#!/usr/bin/env bash
# Pilo · «Word y Excel con formato institucional» en producción (pila exc75yz…):
#   - función de borde NUEVA `pilo-documento` (sin migraciones y sin modelo: da forma a lo que Pilo ya escribió).
#     Importa las librerías `docx` y `exceljs` con especificadores npm: (Deno las descarga la primera vez).
#     Usa pilo_visitor_hit (0110) para el límite por persona y hora (30; cambie PILO_DOCUMENTOS_HORA en el contenedor).
#   Respaldo si ya existía, un reinicio del contenedor y prueba de arranque: si el arranque falla (p. ej. el
#   servidor no puede bajar las librerías npm:), el script lo dice y deja cómo volver atrás.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador»: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-documento.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

for f in index.ts handler.ts nucleo.ts markdown.ts limite.ts; do
  [ -f "$AQUI/functions/pilo-documento/$f" ] || { echo "Falta $AQUI/functions/pilo-documento/$f"; exit 1; }
done

echo "1/2 Copiando la función al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/pilodoc-nuevo && mkdir -p /tmp/pilodoc-nuevo/pilo-documento"
scp "$AQUI"/functions/pilo-documento/*.ts "$SRV:/tmp/pilodoc-nuevo/pilo-documento/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/pilodoc-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }

[ "$(psqlq -c "select to_regprocedure('public.pilo_visitor_hit(text,timestamptz)') is not null")" = "t" ] \
  || { echo "FALTA pilo_visitor_hit (0110): no se instala nada."; exit 1; }

echo "2/2 Instalando pilo-documento (respaldo en $RESP)…"
sed -i 's/\r$//' "$NUEVO"/pilo-documento/*.ts
mkdir -p "$RESP"
[ -d "$BASE/pilo-documento" ] && cp -a "$BASE/pilo-documento" "$RESP/pilo-documento" || true
mkdir -p "$BASE/pilo-documento"
cp "$NUEVO"/pilo-documento/*.ts "$BASE/pilo-documento/"
chown -R --reference="$BASE/pilo-ia" "$BASE/pilo-documento"
( cd "$NUEVO/pilo-documento" && sha256sum *.ts ) > /tmp/pilodoc-hash-o.txt
( cd "$BASE/pilo-documento" && sha256sum $(cd "$NUEVO/pilo-documento" && ls *.ts) ) > /tmp/pilodoc-hash-d.txt
diff -q /tmp/pilodoc-hash-o.txt /tmp/pilodoc-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
echo "  estado: $s"
sleep 5
ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
URL="https://planeacion.udes.edu.co/functions/v1/pilo-documento"
# Prueba de arranque (no gasta nada): OPTIONS responde 204 y, con la clave anónima, un POST responde 401 «sin_sesion».
# Si la función no arranca (p. ej. no puede bajar docx o exceljs desde npm:), ninguna de las dos pasa.
c=$(curl -s -o /dev/null -m 60 -w '%{http_code}' -X OPTIONS "$URL" -H "apikey: $ANON" 2>/dev/null || echo 000)
case "$c" in 204) echo "  OK pilo-documento OPTIONS ($c)";; *) echo "  MAL pilo-documento OPTIONS ($c): mire «docker logs --tail 80 $CONT» (¿no baja las librerías npm:?)";; esac
c=$(curl -s -o /tmp/pilodoc-resp.txt -m 60 -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}' 2>/dev/null || echo 000)
case "$c" in 401) echo "  OK pilo-documento sin sesión ($c) $(head -c 120 /tmp/pilodoc-resp.txt)";; *) echo "  MAL pilo-documento ($c) $(head -c 160 /tmp/pilodoc-resp.txt)";; esac
rm -f /tmp/pilodoc-hash-o.txt /tmp/pilodoc-hash-d.txt /tmp/pilodoc-resp.txt
echo "  Para volver atrás: borre $BASE/pilo-documento (o copie $RESP/pilo-documento encima) y reinicie el contenedor."
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/pilodoc-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pilodoc-remoto.sh $STAMP; rm -f /tmp/pilodoc-remoto.sh"
rm -f "$TMPR"
echo "Listo. La app ya puede pedir «Word institucional» y «Excel con formato». No hace falta Coolify: es solo la función."
