#!/usr/bin/env bash
# Estructura configurable de informes de gestión en producción (pila exc75yz…):
#   - migración 0276: tabla informe_secciones_config, disparadores y informe_validar_envio (idempotente, una transacción)
#   - función de borde `pilo-informes` (actualizada; usa ../pilo-rankingsod y ../noticias-pilo, que ya deben estar)
#   Respaldo fuera de la carpeta de funciones, un reinicio del contenedor y prueba de arranque.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-informes-estructura.sh              (migración y función)
#   bash supabase/actualizar-informes-estructura.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/infest-nuevo && mkdir -p /tmp/infest-nuevo/pilo-informes"
scp "$AQUI/migrations/0276_informes_estructura_configurable.sql" "$SRV:/tmp/infest-nuevo/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/pilo-informes/*.ts "$SRV:/tmp/infest-nuevo/pilo-informes/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/infest-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0276…"
[ "$(psqlq -c "select to_regclass('public.informe_instancias') is not null and to_regprocedure('public.informe_gestiona()') is not null and to_regprocedure('public.informe_puede_leer_ciclo()') is not null and exists (select 1 from information_schema.columns where table_name='informe_instancias' and column_name='campus_id')")" = "t" ] \
  || { echo "FALTAN las migraciones 0153, 0192 o 0272 (informes): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.informe_secciones')")
echo "  dueño de informe_secciones: $DUENO"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0276_informes_estructura_configurable.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
echo "  informe_secciones_config: $(psqlq -c "select to_regclass('public.informe_secciones_config')")"
echo "  filas sembradas: $(psqlq -c "select count(*) from public.informe_secciones_config" 2>/dev/null || echo 'no existe: la migración falló, revise los mensajes de arriba')"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando la función pilo-informes (respaldo en $RESP)…"
  [ -f "$BASE/pilo-rankingsod/proveedor.ts" ] && [ -f "$BASE/noticias-pilo/logica.ts" ] || { echo "FALTAN pilo-rankingsod o noticias-pilo en el servidor: no se instala."; exit 1; }
  [ "$(psqlq -c "select to_regclass('public.informe_secciones_config') is not null")" = "t" ] || { echo "La migración 0276 no quedó aplicada: no se instala la función."; exit 1; }
  mkdir -p "$RESP"
  sed -i 's/\r$//' "$NUEVO"/pilo-informes/*.ts
  cp -a "$BASE/pilo-informes" "$RESP/pilo-informes"
  cp "$NUEVO"/pilo-informes/*.ts "$BASE/pilo-informes/"
  chown -R --reference="$RESP/pilo-informes" "$BASE/pilo-informes"
  ( cd "$NUEVO/pilo-informes" && sha256sum *.ts ) > /tmp/infest-hash-o.txt
  ( cd "$BASE/pilo-informes" && sha256sum $(cd "$NUEVO/pilo-informes" && ls *.ts) ) > /tmp/infest-hash-d.txt
  diff -q /tmp/infest-hash-o.txt /tmp/infest-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  c=$(curl -s -o /tmp/infest-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-informes" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
  case "$c" in 400|401|403) echo "  OK pilo-informes ($c) $(head -c 90 /tmp/infest-resp.txt)";; *) echo "  MAL pilo-informes ($c) $(head -c 160 /tmp/infest-resp.txt)";; esac
  rm -f /tmp/infest-hash-o.txt /tmp/infest-hash-d.txt /tmp/infest-resp.txt
  echo "  Para volver atrás: copie $RESP/pilo-informes sobre $BASE/pilo-informes y reinicie el contenedor."
else
  echo "3/3 La función de borde no se toca (--solo-sql)."
fi
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/infest-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/infest-remoto.sh $STAMP $FUNCION; rm -f /tmp/infest-remoto.sh"
rm -f "$TMPR"
echo "Listo. Recargue con Ctrl+F5 y abra Informes › Tablero del ciclo › La estructura de cada informe."
