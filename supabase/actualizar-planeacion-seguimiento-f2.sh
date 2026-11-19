#!/usr/bin/env bash
# Planeación y Seguimiento (fase 2: actividades, asignación y avisos por correo) en producción (pila exc75yz…):
#   - migración 0287 (idempotente, en una sola transacción, con `set role` al dueño de las tablas de la fase 1):
#     tablas ps_config / ps_actividades / ps_checklist / ps_asignaciones / ps_comentarios / ps_avisos, las funciones ps_*
#     de actividades y avisos, y las plantillas c-ps-* en correo_templates (no pisa las ya editadas).
#   - función de borde `correos` (se AÑADE la acción «ps»; respaldo del index.ts anterior)
#   - función de borde `planeacion-seguimiento` (nueva: vacía la cola ps_avisos y genera vencimientos)
#   Respaldo FUERA de la carpeta de funciones, un reinicio del contenedor y una prueba de arranque.
#   NO programa el cron de vencimientos ni crea el secreto PS_AVISOS_CRON: ver supabase/functions/planeacion-seguimiento/README.md.
#   No contiene contraseñas ni secretos.
# Requiere la fase 1 (migración 0286) aplicada.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-planeacion-seguimiento-f2.sh              (migración y funciones)
#   bash supabase/actualizar-planeacion-seguimiento-f2.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
MIG="0287_planeacion_seguimiento_actividades.sql"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

[ -f "$AQUI/migrations/$MIG" ] || { echo "Falta $AQUI/migrations/$MIG"; exit 1; }
if [ "$FUNCION" = 1 ]; then
  [ -f "$AQUI/functions/correos/index.ts" ] && [ -f "$AQUI/functions/planeacion-seguimiento/index.ts" ] && [ -f "$AQUI/functions/planeacion-seguimiento/avisos.ts" ] \
    || { echo "Faltan functions/correos/index.ts o functions/planeacion-seguimiento/{index,avisos}.ts"; exit 1; }
  grep -q 'action === "ps"' "$AQUI/functions/correos/index.ts" || { echo "functions/correos/index.ts no trae la acción «ps»."; exit 1; }
fi

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/ps2-nuevo && mkdir -p /tmp/ps2-nuevo/correos /tmp/ps2-nuevo/planeacion-seguimiento"
scp "$AQUI/migrations/$MIG" "$SRV:/tmp/ps2-nuevo/"
if [ "$FUNCION" = 1 ]; then
  scp "$AQUI/functions/correos/index.ts" "$SRV:/tmp/ps2-nuevo/correos/"
  scp "$AQUI"/functions/planeacion-seguimiento/*.ts "$SRV:/tmp/ps2-nuevo/planeacion-seguimiento/"
fi

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"; MIG="$3"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/ps2-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando $MIG…"
[ "$(psqlq -c "select to_regclass('public.ps_planes') is not null and to_regclass('public.ps_eventos') is not null and to_regprocedure('public.ps_puede(text)') is not null and to_regclass('public.correo_templates') is not null and to_regprocedure('public.unit_chain(uuid)') is not null")" = "t" ] \
  || { echo "FALTA la fase 1 (0286), los correos (0137) o las unidades (0057): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
# Las tablas y funciones quedan a nombre del dueño de las tablas de la fase 1, no del usuario que conecta.
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.ps_planes')")
echo "  dueño de ps_planes: $DUENO"
LOG=/tmp/ps2-migracion.log
if { echo "set role \"$DUENO\";"; cat "$NUEVO/$MIG"; } | psqlsu -1 >"$LOG" 2>&1; then
  echo "  migración aplicada"
else
  echo "  LA MIGRACIÓN FALLÓ (no se aplicó nada: una sola transacción). Detalle:"; sed 's/^/    /' "$LOG"; rm -f "$LOG"; rm -rf "$NUEVO"; exit 1
fi
rm -f "$LOG"

echo "  Comprobando que los objetos existen…"
FALTA=0
for t in ps_config ps_actividades ps_checklist ps_asignaciones ps_comentarios ps_avisos; do
  [ "$(psqlq -c "select to_regclass('public.$t') is not null")" = "t" ] && echo "    tabla $t: ok" || { echo "    tabla $t: FALTA"; FALTA=1; }
done
for f in "ps_poder(uuid)" "ps_oficinas_visibles(boolean)" "ps_equipo_oficina(uuid)" "ps_carga_equipo(uuid)" "ps_mis_actividades(boolean)" \
         "ps_actividades_oficina(uuid,jsonb)" "ps_actividad_detalle(uuid)" "ps_actividad_crear(uuid,uuid,jsonb,boolean)" \
         "ps_actividad_editar(uuid,jsonb)" "ps_actividad_eliminar(uuid,text)" "ps_actividad_mover(uuid,text,text)" \
         "ps_actividad_asignar(uuid,uuid[],text,boolean)" "ps_actividad_desasignar(uuid,uuid,text)" "ps_actividades_asignar(uuid[],uuid,boolean)" \
         "ps_actividad_transferir(uuid,uuid,uuid,text,boolean)" "ps_actividades_cargar(uuid,jsonb,uuid,boolean)" \
         "ps_generar_avisos_vencimiento(date)" "ps_config_guardar(integer[],integer,integer,boolean)"; do
  [ "$(psqlq -c "select to_regprocedure('public.$f') is not null")" = "t" ] && echo "    función $f: ok" || { echo "    función $f: FALTA"; FALTA=1; }
done
echo "  plantillas c-ps-* (esperadas: 8): $(psqlq -c "select count(*) from public.correo_templates where key like 'c-ps-%'")"
echo "  anon no debe poder leer las actividades: $(psqlq -c "select has_table_privilege('anon','public.ps_actividades','select')") (esperado: f)"
echo "  anon no debe poder ejecutar ps_poder: $(psqlq -c "select has_function_privilege('anon','public.ps_poder(uuid)','execute')") (esperado: f)"
echo "  solo service_role ejecuta el generador de vencimientos: $(psqlq -c "select has_function_privilege('authenticated','public.ps_generar_avisos_vencimiento(date)','execute')") para authenticated (esperado: f)"
echo "  plazos de avisos (ps_config): $(psqlq -c "select dias_antes::text || ' · vencida máx ' || vencida_max_avisos || ' · gestor a las ' || vencida_gestor_horas || ' h' from public.ps_config")"
[ "$FALTA" = 0 ] || { echo "ALGO FALTA: revise lo anterior."; rm -rf "$NUEVO"; exit 1; }

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando las funciones correos (acción «ps») y planeacion-seguimiento (respaldo en $RESP)…"
  [ -f "$BASE/correos/index.ts" ] || { echo "No existe $BASE/correos/index.ts en el servidor: no se instalan las funciones."; exit 1; }
  mkdir -p "$RESP"
  find "$NUEVO" -name '*.ts' -exec sed -i 's/\r$//' {} +
  cp -a "$BASE/correos" "$RESP/correos"
  if [ -d "$BASE/planeacion-seguimiento" ]; then cp -a "$BASE/planeacion-seguimiento" "$RESP/planeacion-seguimiento"; ref="$BASE/planeacion-seguimiento"; else mkdir -p "$BASE/planeacion-seguimiento"; ref="$BASE/correos"; fi
  cp "$NUEVO/correos/index.ts" "$BASE/correos/index.ts"
  cp "$NUEVO"/planeacion-seguimiento/*.ts "$BASE/planeacion-seguimiento/"
  chown -R --reference="$ref" "$BASE/planeacion-seguimiento"
  chown --reference="$RESP/correos/index.ts" "$BASE/correos/index.ts"
  ( cd "$NUEVO/correos" && sha256sum index.ts ) > /tmp/ps2-hash-o.txt
  ( cd "$NUEVO/planeacion-seguimiento" && sha256sum *.ts ) >> /tmp/ps2-hash-o.txt
  ( cd "$BASE/correos" && sha256sum index.ts ) > /tmp/ps2-hash-d.txt
  ( cd "$BASE/planeacion-seguimiento" && sha256sum $(cd "$NUEVO/planeacion-seguimiento" && ls *.ts) ) >> /tmp/ps2-hash-d.txt
  diff -q /tmp/ps2-hash-o.txt /tmp/ps2-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  grep -q 'action === "ps"' "$BASE/correos/index.ts" && echo "  acción «ps» presente en correos" || { echo "  LA ACCIÓN «ps» NO ESTÁ"; exit 1; }
  grep -q 'action === "gm"' "$BASE/correos/index.ts" && echo "  acción «gm» sigue en correos" || { echo "  FALTA la acción «gm» (¿se pisó otro cambio?): restaure $RESP/correos"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  for fn in correos planeacion-seguimiento; do
    act=ps; [ "$fn" = "planeacion-seguimiento" ] && act=avisos
    c=$(curl -s -o /tmp/ps2-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/$fn" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d "{\"action\":\"$act\"}" 2>/dev/null || echo 000)
    case "$c" in 400|401|403) echo "  OK $fn ($c: rechaza al anónimo) $(head -c 90 /tmp/ps2-resp.txt)";; *) echo "  MAL $fn ($c) $(head -c 160 /tmp/ps2-resp.txt)";; esac
  done
  c=$(curl -s -o /tmp/ps2-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/planeacion-seguimiento" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"vencimientos"}' 2>/dev/null || echo 000)
  [ "$c" = "401" ] && echo "  OK vencimientos sin secreto: 401" || echo "  MAL vencimientos sin secreto ($c): debía ser 401"
  rm -f /tmp/ps2-hash-o.txt /tmp/ps2-hash-d.txt /tmp/ps2-resp.txt
  echo "  Para volver atrás: copie $RESP/correos sobre $BASE/correos, borre $BASE/planeacion-seguimiento si es nueva, y reinicie el contenedor."
else
  echo "3/3 Las funciones de borde no se tocan (--solo-sql)."
fi
rm -rf "$NUEVO"
echo "  Para volver atrás la base (solo si aún no se usó): drop table public.ps_avisos, public.ps_comentarios, public.ps_asignaciones, public.ps_checklist, public.ps_actividades, public.ps_config cascade; y las funciones ps_* de la fase 2; delete from public.correo_templates where key like 'c-ps-%'."
REMOTO

scp "$TMPR" "$SRV:/tmp/ps2-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/ps2-remoto.sh $STAMP $FUNCION $MIG; rm -f /tmp/ps2-remoto.sh"
rm -f "$TMPR"
echo "Listo. Falta (a mano): crear el secreto PS_AVISOS_CRON en la función y programar el cron (supabase/functions/planeacion-seguimiento/README.md)."
