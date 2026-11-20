#!/usr/bin/env bash
# Planeación y Seguimiento (fase 3B: varios planes, planes por oficina, plantilla y pilares por plan, tablero de todos los planes,
# evaluación financiera de la VAF y vigilancia del presupuesto) en producción (pila exc75yz…):
#   - migración 0289 (planes: oficina dueña, alcance, estado, config, pilares, plan activo, visibilidad por plan, p_plan opcional, tablero,
#     nivel «financiero» en access_roles.ps_nivel) y migración 0290 (evaluaciones VAF, financiación por línea, libro de presupuesto,
#     vigilancia, plantillas c-ps-vaf-*). Cada una idempotente, en su propia transacción y con `set role` al dueño de las tablas de la fase 1.
#     Si la 0290 fallara, la 0289 queda aplicada (es completa por sí sola): corrija y vuelva a correr el script.
#   - función de borde `correos` (respaldo del index.ts anterior) y `planeacion-seguimiento` (redacta los avisos de la VAF y, en la acción
#     «vencimientos», genera las alertas semanales de presupuesto)
#   Respaldo FUERA de la carpeta de funciones, un reinicio del contenedor y una prueba de arranque.
#   NO toca el cron ni el secreto PS_AVISOS_CRON (ya configurados en la fase 2). Después de aplicar: el administrador fija la unidad de la VAF
#   (ps_vaf_config_guardar) y asigna el nivel «financiero» a un rol de acceso. No contiene contraseñas ni secretos.
# CAMBIO DE COMPORTAMIENTO a tener presente: ps_crear_plan ahora exige la oficina dueña; las líneas sin oficina heredan la del plan; los
# gestores y colaboradores solo ven los planes de su oficina (o con líneas/actividades suyas); lectores, aprobadores y admin ven todos.
# Los planes anteriores a esta migración quedan SIN oficina dueña (visibles por sus líneas): el administrador la fija con ps_plan_editar.
# Requiere las fases 1, 2 y 3 (migraciones 0286, 0287 y 0288) aplicadas.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-planeacion-seguimiento-f3b.sh              (migraciones y funciones)
#   bash supabase/actualizar-planeacion-seguimiento-f3b.sh --solo-sql   (solo las migraciones)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
MIG1="0289_planeacion_seguimiento_planes.sql"
MIG2="0290_planeacion_seguimiento_presupuesto.sql"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

for M in "$MIG1" "$MIG2"; do [ -f "$AQUI/migrations/$M" ] || { echo "Falta $AQUI/migrations/$M"; exit 1; }; done
if [ "$FUNCION" = 1 ]; then
  [ -f "$AQUI/functions/correos/index.ts" ] && [ -f "$AQUI/functions/planeacion-seguimiento/index.ts" ] && [ -f "$AQUI/functions/planeacion-seguimiento/avisos.ts" ] \
    || { echo "Faltan functions/correos/index.ts o functions/planeacion-seguimiento/{index,avisos}.ts"; exit 1; }
  grep -q 'action === "ps"' "$AQUI/functions/correos/index.ts" || { echo "functions/correos/index.ts no trae la acción «ps»."; exit 1; }
  grep -q 'c-ps-vaf-alerta' "$AQUI/functions/correos/index.ts" "$AQUI/functions/planeacion-seguimiento/avisos.ts" \
    || { echo "Los archivos de las funciones no traen las claves c-ps-vaf-* (¿versión anterior a la fase 3B?)."; exit 1; }
fi

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/ps3b-nuevo && mkdir -p /tmp/ps3b-nuevo/correos /tmp/ps3b-nuevo/planeacion-seguimiento"
scp "$AQUI/migrations/$MIG1" "$AQUI/migrations/$MIG2" "$SRV:/tmp/ps3b-nuevo/"
if [ "$FUNCION" = 1 ]; then
  scp "$AQUI/functions/correos/index.ts" "$SRV:/tmp/ps3b-nuevo/correos/"
  scp "$AQUI"/functions/planeacion-seguimiento/*.ts "$SRV:/tmp/ps3b-nuevo/planeacion-seguimiento/"
fi

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"; MIG1="$3"; MIG2="$4"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/ps3b-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando $MIG1 y $MIG2…"
[ "$(psqlq -c "select to_regclass('public.ps_planes') is not null and to_regclass('public.ps_actividades') is not null and to_regclass('public.ps_config') is not null and to_regclass('public.ps_avisos') is not null and to_regprocedure('public.ps_generar_avisos_vencimiento(date)') is not null and to_regprocedure('public.ps_actividad_json(public.ps_actividades)') is not null and to_regclass('public.correo_templates') is not null and to_regclass('public.pillars') is not null and to_regclass('public.action_lines') is not null and to_regclass('public.ps_avances') is not null and to_regclass('public.ps_riesgos') is not null and to_regprocedure('public.unit_chain(uuid)') is not null")" = "t" ] \
  || { echo "FALTA la fase 1 (0286), la 2 (0287), la 3 (0288), el PDI (0001) o las unidades (0057): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
# Las tablas y funciones quedan a nombre del dueño de las tablas de la fase 1, no del usuario que conecta.
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.ps_planes')")
echo "  dueño de ps_planes: $DUENO"
LOG=/tmp/ps3b-migracion.log
for MIG in "$MIG1" "$MIG2"; do
  if { echo "set role \"$DUENO\";"; cat "$NUEVO/$MIG"; } | psqlsu -1 >"$LOG" 2>&1; then
    echo "  migración $MIG aplicada"
  else
    echo "  LA MIGRACIÓN $MIG FALLÓ (no se aplicó esa; una sola transacción por migración). Detalle:"; sed 's/^/    /' "$LOG"; rm -f "$LOG"; rm -rf "$NUEVO"; exit 1
  fi
done
rm -f "$LOG"

echo "  Comprobando que los objetos existen…"
FALTA=0
for t in ps_plan_pilares ps_usuario_pref ps_evaluaciones_vaf ps_linea_financiacion ps_presupuesto_movs; do
  [ "$(psqlq -c "select to_regclass('public.$t') is not null")" = "t" ] && echo "    tabla $t: ok" || { echo "    tabla $t: FALTA"; FALTA=1; }
done
for f in "ps_crear_plan(text,integer,integer,uuid,text,text,jsonb)" "ps_crear_plan(text,integer,integer)" "ps_plan_editar(uuid,jsonb)" "ps_plan_archivar(uuid,text)" \
         "ps_plan_reabrir(uuid)" "ps_plan_config_guardar(uuid,jsonb)" "ps_plan_pilares_guardar(uuid,jsonb)" "ps_plan_config_leer(uuid)" \
         "ps_planes_visibles()" "ps_plan_activo_guardar(uuid)" "ps_tablero_admin(jsonb)" "ps_cargar_matriz(uuid,jsonb,text,uuid)" \
         "ps_oficinas_visibles(boolean,uuid)" "ps_mis_actividades(boolean,uuid)" "ps_actividades_oficina(uuid,jsonb,uuid)" \
         "ps_avances_por_validar(uuid,uuid)" "ps_riesgos_oficina(uuid,jsonb,uuid)" "ps_resumen_pdi_oficina(uuid,uuid)" \
         "ps_vaf_pendientes()" "ps_vaf_evaluar(uuid,uuid,text,numeric,text,text)" "ps_vaf_linea_evaluar(uuid,integer,numeric,text,text,text)" \
         "ps_presupuesto_registrar(uuid,jsonb)" "ps_presupuesto_anular(uuid,text)" "ps_presupuesto_cargar(uuid,jsonb)" "ps_presupuesto_plan(uuid)" \
         "ps_vigilancia_plan(uuid)" "ps_generar_alertas_presupuesto(date)"; do
  [ "$(psqlq -c "select to_regprocedure('public.$f') is not null")" = "t" ] && echo "    función $f: ok" || { echo "    función $f: FALTA"; FALTA=1; }
done
for n in "ps_cargar_matriz:1" "ps_oficinas_visibles:1" "ps_mis_actividades:1" "ps_actividades_oficina:1" "ps_avances_por_validar:1" "ps_riesgos_oficina:1" "ps_resumen_pdi_oficina:1"; do
  [ "$(psqlq -c "select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = '${n%%:*}'")" = "${n##*:}" ] \
    && echo "    ${n%%:*}: una sola firma (ok)" || { echo "    ${n%%:*}: HAY MÁS DE UNA FIRMA (ambiguidad en las llamadas)"; FALTA=1; }
done
echo "  plantillas c-ps-* (esperadas: 12): $(psqlq -c "select count(*) from public.correo_templates where key like 'c-ps-%'")"
echo "  nivel «financiero» admitido en access_roles.ps_nivel: $(psqlq -c "select pg_get_constraintdef(oid) like '%financiero%' from pg_constraint where conname = 'access_roles_ps_nivel'") (esperado: t)"
echo "  anon no debe leer el libro de presupuesto: $(psqlq -c "select has_table_privilege('anon','public.ps_presupuesto_movs','select')") (esperado: f)"
echo "  authenticated no debe escribir el libro: $(psqlq -c "select has_table_privilege('authenticated','public.ps_presupuesto_movs','insert')") (esperado: f)"
echo "  anon no debe ejecutar ps_tablero_admin: $(psqlq -c "select has_function_privilege('anon','public.ps_tablero_admin(jsonb)','execute')") (esperado: f)"
echo "  solo service_role genera las alertas de presupuesto: $(psqlq -c "select has_function_privilege('authenticated','public.ps_generar_alertas_presupuesto(date)','execute')") para authenticated (esperado: f)"
echo "  unidad de la VAF: $(psqlq -c "select coalesce((select u.name from public.units u where u.id = c.vaf_unit_id), 'SIN FIJAR (el administrador debe llamar ps_vaf_config_guardar)') from public.ps_config c where c.id")"
echo "  planes sin oficina dueña (los anteriores a la 0289; fíjela con ps_plan_editar): $(psqlq -c "select count(*) from public.ps_planes where oficina_unit_id is null")"
echo "  planes: $(psqlq -c "select coalesce(string_agg(nombre || ' [' || estado || ']', ', '), 'ninguno') from public.ps_planes")"
echo "  pilares sembrados por plan: $(psqlq -c "select coalesce(string_agg(p.nombre || '=' || n, ', '), 'ninguno') from (select plan_id, count(*) n from public.ps_plan_pilares group by 1) x join public.ps_planes p on p.id = x.plan_id")"
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
  ( cd "$NUEVO/correos" && sha256sum index.ts ) > /tmp/ps3b-hash-o.txt
  ( cd "$NUEVO/planeacion-seguimiento" && sha256sum *.ts ) >> /tmp/ps3b-hash-o.txt
  ( cd "$BASE/correos" && sha256sum index.ts ) > /tmp/ps3b-hash-d.txt
  ( cd "$BASE/planeacion-seguimiento" && sha256sum $(cd "$NUEVO/planeacion-seguimiento" && ls *.ts) ) >> /tmp/ps3b-hash-d.txt
  diff -q /tmp/ps3b-hash-o.txt /tmp/ps3b-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  grep -q 'action === "ps"' "$BASE/correos/index.ts" && echo "  acción «ps» presente en correos" || { echo "  LA ACCIÓN «ps» NO ESTÁ"; exit 1; }
  grep -q 'c-ps-vaf-alerta' "$BASE/correos/index.ts" && echo "  claves de la fase 3B presentes en correos" || { echo "  FALTAN las claves de la fase 3B en correos"; exit 1; }
  grep -q 'action === "gm"' "$BASE/correos/index.ts" && echo "  acción «gm» sigue en correos" || { echo "  FALTA la acción «gm» (¿se pisó otro cambio?): restaure $RESP/correos"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  for fn in correos planeacion-seguimiento; do
    act=ps; [ "$fn" = "planeacion-seguimiento" ] && act=avisos
    c=$(curl -s -o /tmp/ps3b-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/$fn" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d "{\"action\":\"$act\"}" 2>/dev/null || echo 000)
    case "$c" in 400|401|403) echo "  OK $fn ($c: rechaza al anónimo) $(head -c 90 /tmp/ps3b-resp.txt)";; *) echo "  MAL $fn ($c) $(head -c 160 /tmp/ps3b-resp.txt)";; esac
  done
  c=$(curl -s -o /tmp/ps3b-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/planeacion-seguimiento" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"vencimientos"}' 2>/dev/null || echo 000)
  [ "$c" = "401" ] && echo "  OK vencimientos sin secreto: 401" || echo "  MAL vencimientos sin secreto ($c): debía ser 401"
  rm -f /tmp/ps3b-hash-o.txt /tmp/ps3b-hash-d.txt /tmp/ps3b-resp.txt
  echo "  Para volver atrás: copie $RESP/correos sobre $BASE/correos, borre $BASE/planeacion-seguimiento si es nueva, y reinicie el contenedor."
else
  echo "3/3 Las funciones de borde no se tocan (--solo-sql)."
fi
rm -rf "$NUEVO"
echo "  Para volver atrás la base (solo si aún no se usó; se pierden planes nuevos, evaluaciones y presupuesto): drop table public.ps_presupuesto_movs, public.ps_linea_financiacion, public.ps_evaluaciones_vaf, public.ps_plan_pilares, public.ps_usuario_pref cascade; alter table public.ps_planes drop column oficina_unit_id, drop column alcance, drop column descripcion, drop column estado, drop column config, drop column archivado_en; alter table public.ps_config drop column vaf_unit_id; las funciones nuevas; y vuelva a aplicar 0286, 0287 y 0288 para restaurar las funciones y políticas anteriores."
REMOTO

scp "$TMPR" "$SRV:/tmp/ps3b-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/ps3b-remoto.sh $STAMP $FUNCION $MIG1 $MIG2; rm -f /tmp/ps3b-remoto.sh"
rm -f "$TMPR"
echo "Listo. Falta (a mano): fijar la unidad de la VAF (ps_vaf_config_guardar), dar el nivel «financiero» a un rol de acceso y fijar la oficina dueña de los planes anteriores (ps_plan_editar). La interfaz debe llamar a «avisos» tras publicar una versión o evaluar un plan."
