#!/usr/bin/env bash
# Planeación y Seguimiento (fase 3C: evaluación de proyectos, resumen solicitado vs aprobado, plan creado desde la app, apertura retroactiva
# de la evaluación VAF y oficinas de las líneas de un plan vigente) en producción (pila exc75yz…):
#   - migración 0291 (ps_evaluaciones_proyecto insert-only, ps_proyecto_evaluar/leer, ps_resumen_aprobacion, ps_proyecto_crear/editar/borrar,
#     ps_borrador_leer, ps_plan_enviar_a_evaluacion, ps_vaf_abrir_pendientes, ps_asignar_oficinas_lineas, ps_lineas_para_actividad,
#     ps_actividad_normalizar relajada para aportar a otra oficina, plantilla c-ps-aporte). Idempotente, en UNA transacción y con `set role`
#     al dueño de las tablas de la fase 1.
#   - Al final la migración abre la evaluación VAF de los planes activos con versión publicada que no tengan ninguna (y encola el aviso
#     c-ps-vaf-evaluar a la VAF: lo envía el cron diario existente). Es idempotente.
#   NO toca funciones de borde, ni el cron, ni secretos. No contiene contraseñas.
# CAMBIOS DE COMPORTAMIENTO a tener presente:
#   · ps_cargar_matriz y la creación manual comparten la validación (ps_validar_fila_matriz); el resultado de la carga por Excel no cambia.
#   · Una actividad ya puede vincularse a un proyecto con oficina de OTRA oficina del mismo plan (aporta a esa oficina y se avisa a su gestor);
#     un proyecto SIN oficina sigue sin poder vincularse salvo el administrador.
#   · El trigger de ps_version_lineas admite un único cambio en una versión publicada: la oficina, y solo vía ps_asignar_oficinas_lineas (admin).
#   · Hay 13 plantillas c-ps-* (nueva: c-ps-aporte). El correo usa el texto genérico hasta que la función de borde redacte esa clave.
# Requiere las migraciones 0286 a 0290 aplicadas.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-planeacion-seguimiento-f3c.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
MIG="0291_planeacion_seguimiento_evaluacion_proyectos.sql"

[ -f "$AQUI/migrations/$MIG" ] || { echo "Falta $AQUI/migrations/$MIG"; exit 1; }

echo "1/2 Copiando la migración al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/ps3c-nuevo && mkdir -p /tmp/ps3c-nuevo"
scp "$AQUI/migrations/$MIG" "$SRV:/tmp/ps3c-nuevo/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
MIG="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/ps3c-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/2 Comprobando la base y aplicando $MIG…"
[ "$(psqlq -c "select to_regclass('public.ps_planes') is not null and to_regclass('public.ps_actividades') is not null and to_regclass('public.ps_evaluaciones_vaf') is not null and to_regclass('public.ps_linea_financiacion') is not null and to_regclass('public.ps_presupuesto_movs') is not null and to_regclass('public.correo_templates') is not null and (to_regprocedure('public.ps_vaf_abrir_evaluacion(uuid,uuid)') is not null or to_regprocedure('public.ps_vaf_abrir_evaluacion(uuid,uuid,boolean)') is not null) and to_regprocedure('public.ps_cargar_matriz(uuid,jsonb,text,uuid)') is not null and to_regprocedure('public.ps_publicar_version(uuid,text)') is not null and to_regprocedure('public.ps_actividad_normalizar(integer,jsonb,uuid,uuid,boolean,text,boolean)') is not null and to_regprocedure('public.ps_aviso_plan(text,uuid,uuid,jsonb,text)') is not null")" = "t" ] \
  || { echo "FALTA alguna de las migraciones 0286 a 0290: no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.ps_planes')")
echo "  dueño de ps_planes: $DUENO"
echo "  planes activos con versión vigente y SIN evaluación VAF (la migración las abrirá): $(psqlq -c "select count(*) from public.ps_planes p where p.version_vigente_id is not null and p.estado = 'activo' and not exists (select 1 from public.ps_evaluaciones_vaf e where e.plan_id = p.id)")"
LOG=/tmp/ps3c-migracion.log
if { echo "set role \"$DUENO\";"; cat "$NUEVO/$MIG"; } | psqlsu -1 >"$LOG" 2>&1; then
  echo "  migración $MIG aplicada"; grep -i "NOTICE" "$LOG" | sed 's/^/    /' || true
else
  echo "  LA MIGRACIÓN $MIG FALLÓ (no se aplicó: una sola transacción). Detalle:"; sed 's/^/    /' "$LOG"; rm -f "$LOG"; rm -rf "$NUEVO"; exit 1
fi
rm -f "$LOG"

echo "  Comprobando que los objetos existen…"
FALTA=0
[ "$(psqlq -c "select to_regclass('public.ps_evaluaciones_proyecto') is not null")" = "t" ] && echo "    tabla ps_evaluaciones_proyecto: ok" || { echo "    tabla ps_evaluaciones_proyecto: FALTA"; FALTA=1; }
for f in "ps_proyecto_evaluar(uuid,jsonb)" "ps_proyecto_evaluacion_leer(uuid)" "ps_resumen_aprobacion(uuid)" "ps_proyecto_crear(uuid,jsonb)" \
         "ps_proyecto_editar(uuid,jsonb)" "ps_proyecto_borrar(uuid,text)" "ps_borrador_leer(uuid)" "ps_plan_enviar_a_evaluacion(uuid,text)" \
         "ps_vaf_abrir_pendientes()" "ps_vaf_abrir_evaluacion(uuid,uuid,boolean)" "ps_asignar_oficinas_lineas(uuid,jsonb)" \
         "ps_lineas_para_actividad(uuid,uuid)" "ps_actividad_aporte(uuid)" "ps_validar_fila_matriz(uuid,integer,jsonb,jsonb,boolean,boolean,uuid)" \
         "ps_cargar_matriz(uuid,jsonb,text,uuid)"; do
  [ "$(psqlq -c "select to_regprocedure('public.$f') is not null")" = "t" ] && echo "    función $f: ok" || { echo "    función $f: FALTA"; FALTA=1; }
done
for n in "ps_vaf_abrir_evaluacion:1" "ps_cargar_matriz:1" "ps_actividad_normalizar:1" "ps_actividad_insertar:1"; do
  [ "$(psqlq -c "select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = '${n%%:*}'")" = "${n##*:}" ] \
    && echo "    ${n%%:*}: una sola firma (ok)" || { echo "    ${n%%:*}: HAY MÁS DE UNA FIRMA (ambiguidad en las llamadas)"; FALTA=1; }
done
echo "  plantillas c-ps-* (esperadas: 13): $(psqlq -c "select count(*) from public.correo_templates where key like 'c-ps-%'")"
echo "  anon no debe leer las evaluaciones de proyectos: $(psqlq -c "select has_table_privilege('anon','public.ps_evaluaciones_proyecto','select')") (esperado: f)"
echo "  authenticated no debe escribir las evaluaciones: $(psqlq -c "select has_table_privilege('authenticated','public.ps_evaluaciones_proyecto','insert')") (esperado: f)"
echo "  anon no debe ejecutar ps_resumen_aprobacion: $(psqlq -c "select has_function_privilege('anon','public.ps_resumen_aprobacion(uuid)','execute')") (esperado: f)"
echo "  authenticated no debe ejecutar las internas: $(psqlq -c "select has_function_privilege('authenticated','public.ps_vaf_abrir_pendientes_interno()','execute') or has_function_privilege('authenticated','public.ps_validar_fila_matriz(uuid,integer,jsonb,jsonb,boolean,boolean,uuid)','execute')") (esperado: f)"
echo "  planes activos con versión vigente y SIN evaluación VAF tras la migración: $(psqlq -c "select count(*) from public.ps_planes p where p.version_vigente_id is not null and p.estado = 'activo' and not exists (select 1 from public.ps_evaluaciones_vaf e where e.plan_id = p.id)") (esperado: 0)"
echo "  evaluaciones VAF pendientes: $(psqlq -c "select count(*) from public.ps_evaluaciones_vaf where estado = 'pendiente'")"
echo "  proyectos de la versión vigente SIN oficina (el administrador puede asignarla con ps_asignar_oficinas_lineas): $(psqlq -c "select count(*) from public.ps_version_lineas vl join public.ps_planes p on p.version_vigente_id = vl.version_id where vl.oficina_unit_id is null")"
[ "$FALTA" = 0 ] || { echo "ALGO FALTA: revise lo anterior."; rm -rf "$NUEVO"; exit 1; }
rm -rf "$NUEVO"
echo "  Para volver atrás (solo si aún no se usó; se pierden las evaluaciones de proyectos): drop table public.ps_evaluaciones_proyecto cascade; delete from public.correo_templates where key = 'c-ps-aporte'; las funciones nuevas; y vuelva a aplicar 0289 y 0290 (restauran ps_cargar_matriz, ps_version_lineas_guard y ps_vaf_abrir_evaluacion de 2 argumentos) y 0288 (ps_actividad_normalizar y ps_actividad_insertar)."
REMOTO

scp "$TMPR" "$SRV:/tmp/ps3c-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/ps3c-remoto.sh $MIG; rm -f /tmp/ps3c-remoto.sh"
rm -f "$TMPR"
echo "Listo. Falta (a mano): que el administrador asigne la oficina de los proyectos sin oficina (ps_asignar_oficinas_lineas) para que las oficinas puedan vincular actividades; la VAF evalúa los planes y proyectos pendientes."
