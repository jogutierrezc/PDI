#!/usr/bin/env bash
# Informes de gestión · un informe por unidad (facultades multicampus) en producción (pila exc75yz…):
#   - migración 0280: deja sin sede el informe de cada unidad en cada ciclo cuando hay uno solo, y avisa de las
#     unidades que tienen varios (uno por sede, de antes): esos no se funden solos (idempotente, una transacción)
#   - función de borde `pilo-informes` (el tope de logros ya no es 3): index.ts, datos.ts, plantillas.ts…
#   Respaldo fuera de la carpeta de funciones, un reinicio del contenedor y prueba de arranque.
#   La web (logros libres, evidencias editables, pilares, Excel de resultados, logros y metas, Mi informe
#   responsivo y PDF justificado) se despliega desde git (Coolify): haga commit y push antes o después.
# Requiere 0272 y 0279 aplicadas. No borra nada: 0280 solo pone campus_id en nulo donde el informe es único.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-informes-una-sede.sh              (migración y función)
#   bash supabase/actualizar-informes-una-sede.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/infsede-nuevo && mkdir -p /tmp/infsede-nuevo/pilo-informes"
scp "$AQUI/migrations/0280_informes_una_sola_sede.sql" "$SRV:/tmp/infsede-nuevo/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/pilo-informes/*.ts "$SRV:/tmp/infsede-nuevo/pilo-informes/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/infsede-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0280…"
[ "$(psqlq -c "select to_regclass('public.informe_instancias') is not null and exists (select 1 from information_schema.columns where table_name='informe_instancias' and column_name='campus_id') and to_regclass('public.informe_estructuras') is not null")" = "t" ] \
  || { echo "FALTAN las migraciones 0272 o 0279 (informes por sede y mejoras): no se aplica nada."; exit 1; }
echo "  antes: $(psqlq -c "select count(*) filter (where campus_id is not null) || ' informes con sede de ' || count(*) from public.informe_instancias")"
sed -i 's/\r$//' "$NUEVO"/*.sql
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.informe_instancias')")
echo "  dueño de informe_instancias: $DUENO"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0280_informes_una_sola_sede.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
echo "  después: $(psqlq -c "select count(*) filter (where campus_id is not null) || ' informes con sede de ' || count(*) from public.informe_instancias")"
echo "  unidades con varios informes en un ciclo (por reunir a mano): $(psqlq -c "select count(*) from (select 1 from public.informe_instancias group by ciclo_id, unit_id having count(*) > 1) t")"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando la función pilo-informes (respaldo en $RESP)…"
  [ -f "$BASE/pilo-rankingsod/proveedor.ts" ] && [ -f "$BASE/noticias-pilo/logica.ts" ] || { echo "FALTAN pilo-rankingsod o noticias-pilo en el servidor: no se instala."; exit 1; }
  mkdir -p "$RESP"
  sed -i 's/\r$//' "$NUEVO"/pilo-informes/*.ts
  cp -a "$BASE/pilo-informes" "$RESP/pilo-informes"
  cp "$NUEVO"/pilo-informes/*.ts "$BASE/pilo-informes/"
  chown -R --reference="$RESP/pilo-informes" "$BASE/pilo-informes"
  ( cd "$NUEVO/pilo-informes" && sha256sum *.ts ) > /tmp/infsede-hash-o.txt
  ( cd "$BASE/pilo-informes" && sha256sum $(cd "$NUEVO/pilo-informes" && ls *.ts) ) > /tmp/infsede-hash-d.txt
  diff -q /tmp/infsede-hash-o.txt /tmp/infsede-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  c=$(curl -s -o /tmp/infsede-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-informes" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
  case "$c" in 400|401|403) echo "  OK pilo-informes ($c) $(head -c 90 /tmp/infsede-resp.txt)";; *) echo "  MAL pilo-informes ($c) $(head -c 160 /tmp/infsede-resp.txt)";; esac
  rm -f /tmp/infsede-hash-o.txt /tmp/infsede-hash-d.txt /tmp/infsede-resp.txt
  echo "  Para volver atrás: copie $RESP/pilo-informes sobre $BASE/pilo-informes y reinicie el contenedor."
else
  echo "3/3 La función de borde no se toca (--solo-sql)."
fi
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/infsede-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/infsede-remoto.sh $STAMP $FUNCION; rm -f /tmp/infsede-remoto.sh"
rm -f "$TMPR"
echo "Listo. Haga commit y push para que Coolify despliegue la web; luego recargue con Ctrl+F5 y abra Informes › Tablero del ciclo: debe verse una fila por unidad. Si el script dijo que hay unidades con varios informes, déjelos en uno desde Revisión."
