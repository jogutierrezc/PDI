#!/usr/bin/env bash
# Libro de la Rendición de Cuentas (Encuestas con Pilo) en producción (pila exc75yz…):
#   - migración 0274: tabla enc_libros y bucket «enc-libro» (idempotente, en una sola transacción)
#   - función de borde `pilo-libro` (nueva; usa ../pilo-rankingsod/proveedor.ts y ../pilo-informes/ia.ts, que ya deben estar)
#   Respaldo fuera de la carpeta de funciones, un reinicio del contenedor y prueba de arranque.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-libro.sh              (migración y función)
#   bash supabase/actualizar-libro.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/libro-nuevo && mkdir -p /tmp/libro-nuevo/pilo-libro"
scp "$AQUI/migrations/0274_encuestas_libro.sql" "$SRV:/tmp/libro-nuevo/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/pilo-libro/*.ts "$SRV:/tmp/libro-nuevo/pilo-libro/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/libro-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0274…"
[ "$(psqlq -c "select to_regclass('public.enc_encuestas') is not null and to_regprocedure('public.enc_puede_editar_encuesta(uuid)') is not null")" = "t" ] \
  || { echo "FALTA la migración 0184 (editor de encuestas): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.enc_encuestas')")
echo "  dueño de enc_encuestas: $DUENO"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0274_encuestas_libro.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
# El bucket y sus políticas viven en storage.objects, que no es del dueño de enc_*: se repite solo ese bloque con supabase_admin.
sed -n '/^-- Bucket «enc-libro»$/,$p' "$NUEVO/0274_encuestas_libro.sql" | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
echo "  enc_libros: $(psqlq -c "select to_regclass('public.enc_libros')")"
echo "  bucket enc-libro: $(psqlq -c "select count(*) from storage.buckets where id='enc-libro'") (si es 0, créelo a mano en Storage: privado, 8 MB, JPEG/PNG/WebP)"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando la función pilo-libro (respaldo en $RESP)…"
  [ -f "$BASE/pilo-rankingsod/proveedor.ts" ] && [ -f "$BASE/pilo-informes/ia.ts" ] || { echo "FALTAN pilo-rankingsod o pilo-informes en el servidor: no se instala."; exit 1; }
  mkdir -p "$RESP"
  sed -i 's/\r$//' "$NUEVO"/pilo-libro/*.ts
  if [ -d "$BASE/pilo-libro" ]; then cp -a "$BASE/pilo-libro" "$RESP/pilo-libro"; ref="$BASE/pilo-libro"; else mkdir -p "$BASE/pilo-libro"; ref="$BASE/pilo-informes"; fi
  cp "$NUEVO"/pilo-libro/*.ts "$BASE/pilo-libro/"
  chown -R --reference="$ref" "$BASE/pilo-libro"
  ( cd "$NUEVO/pilo-libro" && sha256sum *.ts ) > /tmp/libro-hash-o.txt
  ( cd "$BASE/pilo-libro" && sha256sum $(cd "$NUEVO/pilo-libro" && ls *.ts) ) > /tmp/libro-hash-d.txt
  diff -q /tmp/libro-hash-o.txt /tmp/libro-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  c=$(curl -s -o /tmp/libro-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-libro" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
  case "$c" in 400|401|403) echo "  OK pilo-libro ($c) $(head -c 90 /tmp/libro-resp.txt)";; *) echo "  MAL pilo-libro ($c) $(head -c 160 /tmp/libro-resp.txt)";; esac
  rm -f /tmp/libro-hash-o.txt /tmp/libro-hash-d.txt /tmp/libro-resp.txt
  echo "  Para volver atrás: borre $BASE/pilo-libro (es nueva) y reinicie el contenedor."
else
  echo "3/3 La función de borde no se toca (--solo-sql)."
fi
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/libro-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/libro-remoto.sh $STAMP $FUNCION; rm -f /tmp/libro-remoto.sh"
rm -f "$TMPR"
echo "Listo. Recargue con Ctrl+F5 y abra Encuestas › Rendición de Cuentas › Libro."
