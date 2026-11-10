#!/usr/bin/env bash
# Actualiza en producción (pila exc75yz…) las funciones nuevas del Warehouse:
#   - migración 0269: wh_perfilar, wh_explorar, wh_filas_pagina y wh_dispersion
#   - migración 0270: tipo de archivo «tablero» de UDrive
#   - migración 0273: permisos de las funciones auxiliares de 0269
#   - funciones de borde `warehouse` y `pilo-tableros` (con copia de respaldo y reinicio del contenedor de funciones)
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-warehouse.sh              (migraciones y función de borde)
#   bash supabase/actualizar-warehouse.sh --solo-sql   (solo las migraciones)
# No guarda ni imprime la contraseña. Las migraciones son idempotentes y cada una corre en una sola transacción:
# si falla, no queda nada a medias.
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/wh-nuevo && mkdir -p /tmp/wh-nuevo/functions /tmp/wh-nuevo/tableros"
scp "$AQUI/migrations/0269_warehouse_perfilar_explorar.sql" "$AQUI/migrations/0270_udrive_tablero.sql" "$AQUI/migrations/0273_warehouse_perfilar_permisos.sql" "$SRV:/tmp/wh-nuevo/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/warehouse/*.ts "$SRV:/tmp/wh-nuevo/functions/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/pilo-tableros/*.ts "$SRV:/tmp/wh-nuevo/tableros/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
BASE=/data/coolify/services/exc75yzkfkbkoglxzpckecjp/volumes/functions
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/wh-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }

echo "2/3 Comprobando la base y aplicando las migraciones…"
[ "$(psqlq -c "select to_regclass('public.wh_filas') is not null and to_regprocedure('public.wh_autorizado()') is not null")" = "t" ] \
  || { echo "FALTA la migración 0155 (tablas wh_*): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
echo "  0269…"; psqlq -1 < "$NUEVO/0269_warehouse_perfilar_explorar.sql" >/dev/null
  echo "  0273…"; psqlq -1 < "$NUEVO/0273_warehouse_perfilar_permisos.sql" >/dev/null
if [ "$(psqlq -c "select to_regclass('public.drive_archivos') is not null")" = "t" ]; then
  echo "  0270…"; psqlq -1 < "$NUEVO/0270_udrive_tablero.sql" >/dev/null
else
  echo "  0270 omitida: UDrive (0187) no está en la base."
fi
echo "  funciones en la base:"
psqlq -c "select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('wh_perfilar','wh_explorar','wh_filas_pagina','wh_dispersion') order by 1" | sed 's/^/    /'
echo "  restricción del tipo «tablero»: $(psqlq -c "select count(*) from pg_constraint where conname='drive_archivos_tipo_con_tablero'")"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando la función warehouse…"
  [ -d "$BASE/warehouse" ] || { echo "FALTA la carpeta warehouse en el servidor."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/functions/*.ts
  cp -a "$BASE/warehouse" "$BASE/warehouse.bak-$STAMP"; echo "  respaldo: warehouse.bak-$STAMP"
  cp "$NUEVO"/functions/*.ts "$BASE/warehouse/"
  # Pilo Tableros (nueva): usa ../pilo-rankingsod/proveedor.ts y ../pilo-informes/ia.ts, que ya deben estar en el servidor.
  [ -d "$BASE/pilo-rankingsod" ] && [ -d "$BASE/pilo-informes" ] || { echo "FALTAN pilo-rankingsod o pilo-informes en el servidor: pilo-tableros no se instala."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/tableros/*.ts
  if [ -d "$BASE/pilo-tableros" ]; then cp -a "$BASE/pilo-tableros" "$BASE/pilo-tableros.bak-$STAMP"; echo "  respaldo: pilo-tableros.bak-$STAMP"; else mkdir -p "$BASE/pilo-tableros"; fi
  cp "$NUEVO"/tableros/*.ts "$BASE/pilo-tableros/"
  chown -R --reference="$BASE/warehouse.bak-$STAMP" "$BASE/pilo-tableros"
  chown -R --reference="$BASE/warehouse.bak-$STAMP" "$BASE/warehouse"
  ( cd "$NUEVO/functions" && sha256sum *.ts ) > /tmp/wh-hash-origen.txt
  ( cd "$BASE/warehouse" && sha256sum $(cd "$NUEVO/functions" && ls *.ts) ) > /tmp/wh-hash-destino.txt
  diff -q /tmp/wh-hash-origen.txt /tmp/wh-hash-destino.txt && echo "  hashes iguales"
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 30); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
else
  echo "3/3 La función de borde no se toca (--solo-sql)."
fi
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/wh-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/wh-remoto.sh $STAMP $FUNCION; rm -f /tmp/wh-remoto.sh"
rm -f "$TMPR"

if [ "$FUNCION" = 1 ]; then
  echo "Prueba sin sesión (debe responder su propio error 400/401, no un error de carga):"
  curl -s -m 20 -o - -w '\nHTTP %{http_code}\n' -X POST https://planeacion.udes.edu.co/functions/v1/warehouse -H 'Content-Type: application/json' -d '{"action":"estado"}' || true
fi
echo "Listo. Recargue el Warehouse en el navegador."
