#!/usr/bin/env bash
# Planeación y Seguimiento (fase 1) en producción (pila exc75yz…):
#   - migración 0286: access_roles.ps_nivel, tablas ps_planes / ps_lineas / ps_versiones / ps_version_lineas / ps_eventos,
#     funciones ps_nivel_actual, ps_puede, ps_crear_plan, ps_cargar_matriz, ps_publicar_version, ps_asignar_oficina_linea,
#     ps_diff, ps_resumen_plan, ps_calidad_matriz (idempotente, en una sola transacción).
#   SOLO aplica la migración y comprueba que los objetos existen. No carga la matriz, no publica nada y no cambia ningún rol:
#   ningún rol existente entra (ps_nivel nace en «none»); el nivel se asigna después, en Usuarios › Roles.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-planeacion-seguimiento.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
MIG="0286_planeacion_seguimiento.sql"

[ -f "$AQUI/migrations/$MIG" ] || { echo "Falta $AQUI/migrations/$MIG"; exit 1; }

echo "1/2 Copiando la migración al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/ps-nuevo && mkdir -p /tmp/ps-nuevo"
scp "$AQUI/migrations/$MIG" "$SRV:/tmp/ps-nuevo/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
MIG="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/ps-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/2 Comprobando la base y aplicando $MIG…"
[ "$(psqlq -c "select to_regclass('public.access_roles') is not null and to_regclass('public.campuses') is not null and to_regclass('public.units') is not null and to_regclass('public.unit_members') is not null and to_regprocedure('public.has_access_role()') is not null")" = "t" ] \
  || { echo "FALTAN access_roles, campuses, units o has_access_role() (migraciones 0002, 0017, 0024, 0057): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
# Las tablas y funciones quedan a nombre del dueño de access_roles (como el resto del portal), no del usuario que conecta.
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.access_roles')")
echo "  dueño de access_roles: $DUENO"
LOG=/tmp/ps-migracion.log
if { echo "set role \"$DUENO\";"; cat "$NUEVO/$MIG"; } | psqlsu -1 >"$LOG" 2>&1; then
  echo "  migración aplicada"
else
  echo "  LA MIGRACIÓN FALLÓ (no se aplicó nada: una sola transacción). Detalle:"; sed 's/^/    /' "$LOG"; rm -f "$LOG"; rm -rf "$NUEVO"; exit 1
fi
rm -f "$LOG"

echo "  Comprobando que los objetos existen…"
FALTA=0
for t in ps_planes ps_lineas ps_versiones ps_version_lineas ps_eventos; do
  [ "$(psqlq -c "select to_regclass('public.$t') is not null")" = "t" ] && echo "    tabla $t: ok" || { echo "    tabla $t: FALTA"; FALTA=1; }
done
for f in "ps_nivel_actual()" "ps_puede(text)" "ps_crear_plan(text,integer,integer)" "ps_cargar_matriz(uuid,jsonb,text)" \
         "ps_publicar_version(uuid,text)" "ps_asignar_oficina_linea(uuid,text,uuid)" "ps_diff(uuid,uuid)" \
         "ps_resumen_plan(uuid,uuid)" "ps_calidad_matriz(uuid)"; do
  [ "$(psqlq -c "select to_regprocedure('public.$f') is not null")" = "t" ] && echo "    función $f: ok" || { echo "    función $f: FALTA"; FALTA=1; }
done
[ "$(psqlq -c "select count(*) from information_schema.columns where table_schema='public' and table_name='access_roles' and column_name='ps_nivel'")" = "1" ] \
  && echo "    access_roles.ps_nivel: ok" || { echo "    access_roles.ps_nivel: FALTA"; FALTA=1; }
echo "  roles con nivel distinto de none (debe ser 0 en la primera vez): $(psqlq -c "select count(*) from public.access_roles where ps_nivel <> 'none'")"
echo "  anon no debe poder leer los montos: $(psqlq -c "select has_table_privilege('anon','public.ps_version_lineas','select')") (esperado: f)"
echo "  dueño de ps_version_lineas: $(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.ps_version_lineas')")"
rm -rf "$NUEVO"
[ "$FALTA" = 0 ] || { echo "ALGO FALTA: revise lo anterior."; exit 1; }
echo "  Para volver atrás (solo si aún no se cargó nada): drop table public.ps_eventos, public.ps_version_lineas, public.ps_versiones, public.ps_lineas, public.ps_planes cascade; y las funciones ps_*."
REMOTO

scp "$TMPR" "$SRV:/tmp/ps-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/ps-remoto.sh $MIG; rm -f /tmp/ps-remoto.sh"
rm -f "$TMPR"
echo "Listo. Siguiente paso: en Usuarios › Roles, dar a un rol la pantalla «Planeación y Seguimiento» y su nivel (cuando la interfaz esté desplegada)."
