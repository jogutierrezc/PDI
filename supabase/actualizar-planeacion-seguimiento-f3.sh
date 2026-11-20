#!/usr/bin/env bash
# Planeación y Seguimiento (fase 3: avances, evidencias, riesgos, conexión con el PDI y plazos por oficina) en producción (pila exc75yz…):
#   - migración 0288 (idempotente, en una sola transacción, con `set role` al dueño de las tablas de la fase 1): columna
#     ps_actividades.pdi_conexion, tablas ps_actividad_pdi / ps_avances / ps_evidencias / ps_riesgos / ps_acciones / ps_config_oficina,
#     las funciones ps_* de avances, riesgos, PDI y plazos, los cambios a las de la fase 2 y la plantilla c-ps-validacion-pendiente.
#   - bucket PRIVADO `ps-evidencias` y sus políticas: la migración los crea si su rol es dueño de storage.objects; si no, este script
#     vuelve a correr solo ese bloque con el superusuario de la base (sin `set role`) y avisa si aún falta algo.
#   - función de borde `correos` (respaldo del index.ts anterior; ya trae las claves c-ps-avance, c-ps-validado y c-ps-validacion-pendiente)
#   - función de borde `planeacion-seguimiento` (avisos.ts nuevo con la redacción de los avisos de la fase 3)
#   Respaldo FUERA de la carpeta de funciones, un reinicio del contenedor y una prueba de arranque.
#   NO toca el cron ni el secreto PS_AVISOS_CRON (ya configurados en la fase 2): ver supabase/functions/planeacion-seguimiento/README.md.
#   No contiene contraseñas ni secretos.
# Requiere las fases 1 y 2 (migraciones 0286 y 0287) aplicadas.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-planeacion-seguimiento-f3.sh              (migración y funciones)
#   bash supabase/actualizar-planeacion-seguimiento-f3.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
MIG="0288_planeacion_seguimiento_avances.sql"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

[ -f "$AQUI/migrations/$MIG" ] || { echo "Falta $AQUI/migrations/$MIG"; exit 1; }
if [ "$FUNCION" = 1 ]; then
  [ -f "$AQUI/functions/correos/index.ts" ] && [ -f "$AQUI/functions/planeacion-seguimiento/index.ts" ] && [ -f "$AQUI/functions/planeacion-seguimiento/avisos.ts" ] \
    || { echo "Faltan functions/correos/index.ts o functions/planeacion-seguimiento/{index,avisos}.ts"; exit 1; }
  grep -q 'action === "ps"' "$AQUI/functions/correos/index.ts" || { echo "functions/correos/index.ts no trae la acción «ps»."; exit 1; }
  grep -q 'c-ps-validacion-pendiente' "$AQUI/functions/correos/index.ts" "$AQUI/functions/planeacion-seguimiento/avisos.ts" \
    || { echo "Los archivos de las funciones no traen la clave c-ps-validacion-pendiente (¿versión anterior a la fase 3?)."; exit 1; }
fi

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/ps3-nuevo && mkdir -p /tmp/ps3-nuevo/correos /tmp/ps3-nuevo/planeacion-seguimiento"
scp "$AQUI/migrations/$MIG" "$SRV:/tmp/ps3-nuevo/"
if [ "$FUNCION" = 1 ]; then
  scp "$AQUI/functions/correos/index.ts" "$SRV:/tmp/ps3-nuevo/correos/"
  scp "$AQUI"/functions/planeacion-seguimiento/*.ts "$SRV:/tmp/ps3-nuevo/planeacion-seguimiento/"
fi

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"; MIG="$3"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/ps3-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando $MIG…"
[ "$(psqlq -c "select to_regclass('public.ps_planes') is not null and to_regclass('public.ps_actividades') is not null and to_regclass('public.ps_config') is not null and to_regclass('public.ps_avisos') is not null and to_regprocedure('public.ps_generar_avisos_vencimiento(date)') is not null and to_regprocedure('public.ps_actividad_json(public.ps_actividades)') is not null and to_regclass('public.correo_templates') is not null and to_regclass('public.pillars') is not null and to_regclass('public.action_lines') is not null and to_regprocedure('public.unit_chain(uuid)') is not null")" = "t" ] \
  || { echo "FALTA la fase 1 (0286), la fase 2 (0287), el PDI (0001) o las unidades (0057): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
# Las tablas y funciones quedan a nombre del dueño de las tablas de la fase 1, no del usuario que conecta.
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.ps_planes')")
echo "  dueño de ps_planes: $DUENO"
LOG=/tmp/ps3-migracion.log
if { echo "set role \"$DUENO\";"; cat "$NUEVO/$MIG"; } | psqlsu -1 >"$LOG" 2>&1; then
  echo "  migración aplicada"
else
  echo "  LA MIGRACIÓN FALLÓ (no se aplicó nada: una sola transacción). Detalle:"; sed 's/^/    /' "$LOG"; rm -f "$LOG"; rm -rf "$NUEVO"; exit 1
fi
rm -f "$LOG"

# El bucket y sus políticas viven en storage.objects, de otro dueño: si la migración no pudo crearlos, se reintenta solo ese bloque con el superusuario.
NPOL=$(psqlq -c "select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'ps_evidencias_%'" 2>/dev/null || echo 0)
HAYB=$(psqlq -c "select count(*) from storage.buckets where id = 'ps-evidencias'" 2>/dev/null || echo 0)
if [ "$NPOL" != "3" ] || [ "$HAYB" != "1" ]; then
  echo "  bucket ps-evidencias o sus políticas incompletos: reintentando solo ese bloque con el superusuario…"
  sed -n '/^-- >>> bucket ps-evidencias/,/^-- <<< bucket ps-evidencias/p' "$NUEVO/$MIG" | psqlsu >/dev/null 2>&1 || true
  NPOL=$(psqlq -c "select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'ps_evidencias_%'" 2>/dev/null || echo 0)
  HAYB=$(psqlq -c "select count(*) from storage.buckets where id = 'ps-evidencias'" 2>/dev/null || echo 0)
fi
[ "$NPOL" = "3" ] && [ "$HAYB" = "1" ] && echo "  bucket ps-evidencias y sus 3 políticas: ok" \
  || echo "  AVISO: falta el bucket ps-evidencias o sus políticas ($HAYB bucket, $NPOL de 3 políticas). Créelo a mano en Storage (privado, 20 MB) antes de subir evidencias."
echo "  bucket privado: $(psqlq -c "select case when public then 'PÚBLICO (MAL)' else 'privado' end from storage.buckets where id = 'ps-evidencias'" 2>/dev/null || echo '?')"

echo "  Comprobando que los objetos existen…"
FALTA=0
for t in ps_config_oficina ps_actividad_pdi ps_avances ps_evidencias ps_riesgos ps_acciones; do
  [ "$(psqlq -c "select to_regclass('public.$t') is not null")" = "t" ] && echo "    tabla $t: ok" || { echo "    tabla $t: FALTA"; FALTA=1; }
done
for f in "ps_pdi_catalogo()" "ps_resumen_pdi_oficina(uuid)" "ps_avance_reportar(uuid,jsonb)" "ps_avance_validar(uuid,text)" "ps_avance_devolver(uuid,text)" \
         "ps_avances_validar_lote(uuid[])" "ps_actividad_cerrar(uuid,text)" "ps_evidencia_registrar(uuid,jsonb)" "ps_evidencia_quitar(uuid)" \
         "ps_riesgo_crear(uuid,jsonb)" "ps_riesgo_editar(uuid,jsonb)" "ps_riesgo_cerrar(uuid,text)" "ps_accion_crear(uuid,jsonb)" \
         "ps_accion_editar(uuid,jsonb)" "ps_accion_marcar(uuid,text)" "ps_avances_por_validar(uuid)" "ps_mis_avances()" \
         "ps_riesgos_oficina(uuid,jsonb)" "ps_config_oficina_leer(uuid)" "ps_config_oficina_guardar(uuid,integer[],integer,integer,integer,boolean)" \
         "ps_config_oficina_quitar(uuid)" "ps_config_guardar(integer[],integer,integer,boolean,integer)" "ps_generar_avisos_vencimiento(date)" \
         "ps_actividad_crear(uuid,uuid,jsonb,boolean)" "ps_actividad_mover(uuid,text,text)" "ps_actividad_detalle(uuid)"; do
  [ "$(psqlq -c "select to_regprocedure('public.$f') is not null")" = "t" ] && echo "    función $f: ok" || { echo "    función $f: FALTA"; FALTA=1; }
done
[ "$(psqlq -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ps_config_guardar'")" = "1" ] \
  && echo "    ps_config_guardar: una sola firma (ok)" || { echo "    ps_config_guardar: HAY MÁS DE UNA FIRMA"; FALTA=1; }
echo "  plantillas c-ps-* (esperadas: 9): $(psqlq -c "select count(*) from public.correo_templates where key like 'c-ps-%'")"
echo "  anon no debe poder leer los avances: $(psqlq -c "select has_table_privilege('anon','public.ps_avances','select')") (esperado: f)"
echo "  authenticated no debe poder escribir los avances: $(psqlq -c "select has_table_privilege('authenticated','public.ps_avances','insert')") (esperado: f)"
echo "  anon no debe poder ejecutar ps_avance_reportar: $(psqlq -c "select has_function_privilege('anon','public.ps_avance_reportar(uuid,jsonb)','execute')") (esperado: f)"
echo "  authenticated no debe ejecutar la revisión interna: $(psqlq -c "select has_function_privilege('authenticated','public.ps_avance_revisar(uuid,text,text,boolean)','execute')") (esperado: f)"
echo "  solo service_role ejecuta el generador de vencimientos: $(psqlq -c "select has_function_privilege('authenticated','public.ps_generar_avisos_vencimiento(date)','execute')") para authenticated (esperado: f)"
echo "  plazos generales (ps_config): $(psqlq -c "select dias_antes::text || ' · vencida máx ' || vencida_max_avisos || ' · gestor a las ' || vencida_gestor_horas || ' h · validar a las ' || validar_horas || ' h' from public.ps_config")"
echo "  actividades por conexión con el PDI: $(psqlq -c "select coalesce(string_agg(pdi_conexion || '=' || n, ', '), 'sin actividades') from (select pdi_conexion, count(*) n from public.ps_actividades group by 1 order by 1) x")"
[ "$FALTA" = 0 ] || { echo "ALGO FALTA: revise lo anterior."; rm -rf "$NUEVO"; exit 1; }

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando las funciones correos y planeacion-seguimiento (respaldo en $RESP)…"
  [ -f "$BASE/correos/index.ts" ] || { echo "No existe $BASE/correos/index.ts en el servidor: no se instalan las funciones."; exit 1; }
  mkdir -p "$RESP"
  find "$NUEVO" -name '*.ts' -exec sed -i 's/\r$//' {} +
  cp -a "$BASE/correos" "$RESP/correos"
  if [ -d "$BASE/planeacion-seguimiento" ]; then cp -a "$BASE/planeacion-seguimiento" "$RESP/planeacion-seguimiento"; ref="$BASE/planeacion-seguimiento"; else mkdir -p "$BASE/planeacion-seguimiento"; ref="$BASE/correos"; fi
  cp "$NUEVO/correos/index.ts" "$BASE/correos/index.ts"
  cp "$NUEVO"/planeacion-seguimiento/*.ts "$BASE/planeacion-seguimiento/"
  chown -R --reference="$ref" "$BASE/planeacion-seguimiento"
  chown --reference="$RESP/correos/index.ts" "$BASE/correos/index.ts"
  ( cd "$NUEVO/correos" && sha256sum index.ts ) > /tmp/ps3-hash-o.txt
  ( cd "$NUEVO/planeacion-seguimiento" && sha256sum *.ts ) >> /tmp/ps3-hash-o.txt
  ( cd "$BASE/correos" && sha256sum index.ts ) > /tmp/ps3-hash-d.txt
  ( cd "$BASE/planeacion-seguimiento" && sha256sum $(cd "$NUEVO/planeacion-seguimiento" && ls *.ts) ) >> /tmp/ps3-hash-d.txt
  diff -q /tmp/ps3-hash-o.txt /tmp/ps3-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  grep -q 'action === "ps"' "$BASE/correos/index.ts" && echo "  acción «ps» presente en correos" || { echo "  LA ACCIÓN «ps» NO ESTÁ"; exit 1; }
  grep -q 'c-ps-validacion-pendiente' "$BASE/correos/index.ts" && echo "  claves de la fase 3 presentes en correos" || { echo "  FALTAN las claves de la fase 3 en correos"; exit 1; }
  grep -q 'action === "gm"' "$BASE/correos/index.ts" && echo "  acción «gm» sigue en correos" || { echo "  FALTA la acción «gm» (¿se pisó otro cambio?): restaure $RESP/correos"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  for fn in correos planeacion-seguimiento; do
    act=ps; [ "$fn" = "planeacion-seguimiento" ] && act=avisos
    c=$(curl -s -o /tmp/ps3-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/$fn" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d "{\"action\":\"$act\"}" 2>/dev/null || echo 000)
    case "$c" in 400|401|403) echo "  OK $fn ($c: rechaza al anónimo) $(head -c 90 /tmp/ps3-resp.txt)";; *) echo "  MAL $fn ($c) $(head -c 160 /tmp/ps3-resp.txt)";; esac
  done
  c=$(curl -s -o /tmp/ps3-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/planeacion-seguimiento" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"vencimientos"}' 2>/dev/null || echo 000)
  [ "$c" = "401" ] && echo "  OK vencimientos sin secreto: 401" || echo "  MAL vencimientos sin secreto ($c): debía ser 401"
  rm -f /tmp/ps3-hash-o.txt /tmp/ps3-hash-d.txt /tmp/ps3-resp.txt
  echo "  Para volver atrás: copie $RESP/correos sobre $BASE/correos, borre $BASE/planeacion-seguimiento si es nueva, y reinicie el contenedor."
else
  echo "3/3 Las funciones de borde no se tocan (--solo-sql)."
fi
rm -rf "$NUEVO"
echo "  Para volver atrás la base (solo si aún no se usó; los avances y las evidencias se pierden): drop table public.ps_acciones, public.ps_riesgos, public.ps_evidencias, public.ps_avances, public.ps_actividad_pdi, public.ps_config_oficina cascade; alter table public.ps_actividades drop column pdi_conexion; alter table public.ps_config drop column validar_horas; las funciones ps_* nuevas; después vuelva a aplicar 0287 para restaurar las funciones de la fase 2; y vacíe el bucket ps-evidencias desde Storage."
REMOTO

scp "$TMPR" "$SRV:/tmp/ps3-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/ps3-remoto.sh $STAMP $FUNCION $MIG; rm -f /tmp/ps3-remoto.sh"
rm -f "$TMPR"
echo "Listo. El cron y el secreto PS_AVISOS_CRON son los de la fase 2 (supabase/functions/planeacion-seguimiento/README.md). La interfaz debe llamar a «avisos» tras reportar, validar o devolver un avance."
