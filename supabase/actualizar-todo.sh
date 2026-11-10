#!/usr/bin/env bash
# Una sola carga a producción (pila exc75yz…): migraciones del Warehouse y las cuatro funciones de borde que cambiaron.
#   Migraciones (idempotentes, cada una en una transacción):
#     0269 perfilar y explorar en la base · 0270 tipo «tablero» de UDrive · 0273 permisos de las funciones auxiliares
#   Funciones: warehouse, pilo-tableros (nueva), pilo-work (arregla el chat que se quedaba «pensando») y pw-microsoft
#   Un solo reinicio del contenedor de funciones, y al final una prueba de que cada función ARRANCA (sin sesión debe
#   responder 400/401/403, nunca 500).
# Los respaldos quedan FUERA de la carpeta de funciones (backups-funciones/), para que el runtime no los sirva.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-todo.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCIONES="warehouse pilo-tableros pilo-work pw-microsoft"

echo "1/4 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/todo-nuevo && mkdir -p /tmp/todo-nuevo/migrations $(for f in $FUNCIONES; do printf '/tmp/todo-nuevo/functions/%s ' "$f"; done)"
scp "$AQUI/migrations/0269_warehouse_perfilar_explorar.sql" "$AQUI/migrations/0270_udrive_tablero.sql" "$AQUI/migrations/0273_warehouse_perfilar_permisos.sql" "$SRV:/tmp/todo-nuevo/migrations/"
for f in $FUNCIONES; do scp "$AQUI/functions/$f/"*.ts "$SRV:/tmp/todo-nuevo/functions/$f/"; done

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; shift
FUNCIONES="$*"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/todo-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }

echo "2/4 Comprobando la base y aplicando las migraciones…"
[ "$(psqlq -c "select to_regclass('public.wh_filas') is not null and to_regprocedure('public.wh_autorizado()') is not null")" = "t" ] \
  || { echo "FALTA la migración 0155 (tablas wh_*): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/migrations/*.sql
# Las migraciones se aplican con el ROL DUEÑO de lo que reemplazan: «postgres» no puede reemplazar funciones o tablas
# creadas por otro rol («must be owner of function …»). supabase_admin entra y asume el rol dueño solo dentro de la transacción.
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }
dueno_de_funcion() { psqlq -c "select pg_get_userbyid(proowner) from pg_proc where pronamespace='public'::regnamespace and proname='$1' limit 1"; }
dueno_de_tabla() { psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.$1')"; }
aplicar() { # archivo, dueño
  { echo "set role \"$2\";"; cat "$1"; } | psqlsu -1 >/dev/null
}
D_WH=$(dueno_de_funcion wh_columnas_personales); [ -n "$D_WH" ] || D_WH=$(dueno_de_tabla wh_filas)
echo "  dueño de las funciones wh_*: $D_WH"
echo "  0269…"; aplicar "$NUEVO/migrations/0269_warehouse_perfilar_explorar.sql" "$D_WH"
echo "  0273…"; aplicar "$NUEVO/migrations/0273_warehouse_perfilar_permisos.sql" "$D_WH"
if [ "$(psqlq -c "select to_regclass('public.drive_archivos') is not null")" = "t" ]; then
  D_DR=$(dueno_de_tabla drive_archivos)
  echo "  0270… (dueño de drive_archivos: $D_DR)"; aplicar "$NUEVO/migrations/0270_udrive_tablero.sql" "$D_DR"
else
  echo "  0270 omitida: UDrive (0187) no está en la base."
fi
echo "  funciones wh_* y permisos de ejecución:"
psqlq -c "select p.proname || ' → ' || coalesce(string_agg(distinct r.rolname, ','), '(nadie)') from pg_proc p left join lateral (select r.rolname from pg_roles r where has_function_privilege(r.oid, p.oid, 'execute') and r.rolname = 'authenticated') r on true where p.pronamespace='public'::regnamespace and p.proname in ('wh_perfilar','wh_explorar','wh_filas_pagina','wh_dispersion','wh_exigir','wh_cumple','wh_columnas_personales') group by p.proname order by 1" | sed 's/^/    /'

echo "3/4 Instalando funciones (respaldo en $RESP)…"
for f in pilo-rankingsod pilo-informes; do
  [ -f "$BASE/$f/$( [ $f = pilo-rankingsod ] && echo proveedor.ts || echo ia.ts )" ] || { echo "FALTA ../$f en el servidor (lo usa pilo-tableros): no se instala nada."; exit 1; }
done
mkdir -p "$RESP"
sed -i 's/\r$//' "$NUEVO"/functions/*/*.ts
for f in $FUNCIONES; do
  [ -f "$NUEVO/functions/$f/index.ts" ] || { echo "FALTA index.ts de $f en lo que se copió."; exit 1; }
  if [ -d "$BASE/$f" ]; then
    cp -a "$BASE/$f" "$RESP/$f"; echo "  $f: respaldo hecho"
    ref="$BASE/$f"
  else
    mkdir -p "$BASE/$f"; echo "  $f: carpeta nueva"
    ref="$BASE/warehouse"
  fi
  cp "$NUEVO/functions/$f/"*.ts "$BASE/$f/"
  chown -R --reference="$ref" "$BASE/$f"
  ( cd "$NUEVO/functions/$f" && sha256sum *.ts ) > /tmp/todo-hash-o.txt
  ( cd "$BASE/$f" && sha256sum $(cd "$NUEVO/functions/$f" && ls *.ts) ) > /tmp/todo-hash-d.txt
  diff -q /tmp/todo-hash-o.txt /tmp/todo-hash-d.txt >/dev/null || { echo "  $f: LOS HASHES NO COINCIDEN"; exit 1; }
  echo "  $f: instalada, hashes iguales"
done

echo "4/4 Reiniciando $CONT…"
docker restart "$CONT" >/dev/null
s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
echo "  estado: $s"
sleep 3
echo "  ¿arranca cada función? (sin sesión debe dar 400, 401 o 403; un 500 es un fallo de arranque)"
ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
for f in $FUNCIONES; do
  c=$(curl -s -o /tmp/todo-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/$f" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
  case "$c" in 400|401|403) echo "    OK   $f ($c) $(head -c 90 /tmp/todo-resp.txt)";; *) echo "    MAL  $f ($c) $(head -c 160 /tmp/todo-resp.txt)";; esac
done
echo "  errores de arranque recientes (si hay):"
docker logs --since 3m "$CONT" 2>&1 | grep -iE "boot error|entrypoint|uncaught|module not found|error: " | tail -8 | sed 's/^/    /' || true
rm -rf "$NUEVO" /tmp/todo-hash-o.txt /tmp/todo-hash-d.txt /tmp/todo-resp.txt
echo
echo "Para volver atrás: copie $RESP/<función> sobre $BASE/<función> y reinicie el contenedor."
REMOTO

scp "$TMPR" "$SRV:/tmp/todo-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/todo-remoto.sh $STAMP $FUNCIONES; rm -f /tmp/todo-remoto.sh"
rm -f "$TMPR"
echo "Listo. Recargue con Ctrl+F5 y pruebe: Pilo At Work (chat y Correo) y Warehouse > Crear tablero > «Que Pilo lo proponga»."
