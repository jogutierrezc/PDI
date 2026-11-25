#!/usr/bin/env bash
# Informes de gestión · «Compilar informe de colaboradores con Pilo» en producción (pila exc75yz…):
#   - migración 0293: tablas informe_compilacion_libros e informe_compilacion (RLS: ve el informe quien lo ve; escribe
#     quien lo diligencia mientras sea borrador o devuelto) y la función informe_compilacion_escribe.
#   - función de borde NUEVA `pilo-compilador` (siempre Pilo Astra 1.0 con razonamiento, SIN tope de tokens).
#     Importa ../pilo-presentaciones/astra.ts y limite.ts y ../pilo-work/proveedor.ts: se copian junto, con respaldo.
#   - pilo-presentaciones se vuelve a instalar: su index.ts ahora también manda la llamada sin tope de tokens.
#   Respaldo de lo que existía, un reinicio del contenedor y prueba de arranque. La web se despliega desde git
#   (Coolify): haga commit y push DESPUÉS de este script. Requiere 0153/0169/0192/0284 y Astra encendido en Pilo Work.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-compilador.sh              (migración y funciones)
#   bash supabase/actualizar-pilo-compilador.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

for f in migrations/0293_informe_compilacion.sql functions/pilo-compilador/index.ts functions/pilo-compilador/handler.ts functions/pilo-compilador/nucleo.ts functions/pilo-compilador/pedido.ts functions/pilo-compilador/prompt.ts functions/pilo-compilador/verificar.ts functions/pilo-presentaciones/index.ts functions/pilo-presentaciones/astra.ts functions/pilo-presentaciones/limite.ts functions/pilo-work/proveedor.ts; do
  [ -f "$AQUI/$f" ] || { echo "Falta $AQUI/$f"; exit 1; }
done

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/pilocomp-nuevo && mkdir -p /tmp/pilocomp-nuevo/pilo-compilador /tmp/pilocomp-nuevo/pilo-presentaciones /tmp/pilocomp-nuevo/pilo-work"
scp "$AQUI/migrations/0293_informe_compilacion.sql" "$SRV:/tmp/pilocomp-nuevo/"
if [ "$FUNCION" = 1 ]; then
  scp "$AQUI"/functions/pilo-compilador/*.ts "$SRV:/tmp/pilocomp-nuevo/pilo-compilador/"
  scp "$AQUI"/functions/pilo-presentaciones/*.ts "$SRV:/tmp/pilocomp-nuevo/pilo-presentaciones/"
  scp "$AQUI/functions/pilo-work/proveedor.ts" "$SRV:/tmp/pilocomp-nuevo/pilo-work/"
fi

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/pilocomp-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0293…"
[ "$(psqlq -c "select to_regclass('public.informe_instancias') is not null and to_regprocedure('public.informe_instancia_visible(uuid)') is not null and to_regprocedure('public.informe_actor(uuid)') is not null and to_regprocedure('public.has_role_at_least(public.app_role)') is not null")" = "t" ] \
  || { echo "FALTAN informe_instancias, informe_instancia_visible, informe_actor (0153/0169/0192) o has_role_at_least(app_role): no se aplica nada."
       echo "  Detalle: instancias=$(psqlq -c "select to_regclass('public.informe_instancias') is not null") visible=$(psqlq -c "select to_regprocedure('public.informe_instancia_visible(uuid)') is not null") actor=$(psqlq -c "select to_regprocedure('public.informe_actor(uuid)') is not null") rol=$(psqlq -c "select to_regprocedure('public.has_role_at_least(public.app_role)') is not null")"
       exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
mkdir -p "$RESP"
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.informe_instancias')")
echo "  dueño de informe_instancias: $DUENO"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0293_informe_compilacion.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
OK1=$(psqlq -c "select to_regclass('public.informe_compilacion') is not null and to_regclass('public.informe_compilacion_libros') is not null and to_regprocedure('public.informe_compilacion_escribe(uuid)') is not null and (select count(*) from pg_policies where tablename in ('informe_compilacion','informe_compilacion_libros')) = 7")
[ "$OK1" = "t" ] || { echo "  La migración 0293 no quedó aplicada (2 tablas, función y 7 políticas): revise los mensajes de arriba."; exit 1; }
echo "  listas: $(psqlq -c "select count(*) from pg_policies where tablename in ('informe_compilacion','informe_compilacion_libros')") políticas; RLS $(psqlq -c "select relrowsecurity from pg_class where oid = 'public.informe_compilacion'::regclass") y $(psqlq -c "select relrowsecurity from pg_class where oid = 'public.informe_compilacion_libros'::regclass")"
echo "  Astra encendido en Pilo Work (debe ser t): $(psqlq -c "select coalesce(astra_habilitado, false) from public.pw_config where id = 1" 2>/dev/null || echo 'sin leer')"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando pilo-compilador y pilo-presentaciones (respaldo en $RESP)…"
  [ -f "$BASE/pilo-work/proveedor.ts" ] || { echo "FALTA pilo-work/proveedor.ts en el servidor (Pilo Work): instale primero pilo-work."; exit 1; }
  grep -q "export async function destinoAstra" "$NUEVO/pilo-work/proveedor.ts" || { echo "El proveedor.ts nuevo no trae destinoAstra: no se instala."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/pilo-compilador/*.ts "$NUEVO"/pilo-presentaciones/*.ts "$NUEVO"/pilo-work/*.ts
  cp -a "$BASE/pilo-work" "$RESP/pilo-work"
  [ -d "$BASE/pilo-presentaciones" ] && cp -a "$BASE/pilo-presentaciones" "$RESP/pilo-presentaciones" || true
  [ -d "$BASE/pilo-compilador" ] && cp -a "$BASE/pilo-compilador" "$RESP/pilo-compilador" || true
  mkdir -p "$BASE/pilo-compilador" "$BASE/pilo-presentaciones"
  cp "$NUEVO"/pilo-compilador/*.ts "$BASE/pilo-compilador/"
  cp "$NUEVO"/pilo-presentaciones/*.ts "$BASE/pilo-presentaciones/"
  cp "$NUEVO"/pilo-work/proveedor.ts "$BASE/pilo-work/"
  chown -R --reference="$BASE/pilo-work" "$BASE/pilo-compilador" "$BASE/pilo-presentaciones" "$BASE/pilo-work/proveedor.ts"
  for c in pilo-compilador pilo-presentaciones pilo-work; do
    ( cd "$NUEVO/$c" && sha256sum *.ts ) > /tmp/pilocomp-hash-o.txt
    ( cd "$BASE/$c" && sha256sum $(cd "$NUEVO/$c" && ls *.ts) ) > /tmp/pilocomp-hash-d.txt
    diff -q /tmp/pilocomp-hash-o.txt /tmp/pilocomp-hash-d.txt >/dev/null && echo "  hashes iguales ($c)" || { echo "  LOS HASHES NO COINCIDEN ($c)"; exit 1; }
  done
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  for fn in pilo-compilador pilo-presentaciones; do
    URL="https://planeacion.udes.edu.co/functions/v1/$fn"
    # Prueba de arranque (no gasta Astra): OPTIONS responde 204 y, con la clave anónima, un POST responde 401 «sin_sesion».
    c=$(curl -s -o /dev/null -m 30 -w '%{http_code}' -X OPTIONS "$URL" -H "apikey: $ANON" 2>/dev/null || echo 000)
    case "$c" in 204) echo "  OK $fn OPTIONS ($c)";; *) echo "  MAL $fn OPTIONS ($c)";; esac
    c=$(curl -s -o /tmp/pilocomp-resp.txt -m 30 -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}' 2>/dev/null || echo 000)
    case "$c" in 401) echo "  OK $fn sin sesión ($c) $(head -c 120 /tmp/pilocomp-resp.txt)";; *) echo "  MAL $fn ($c) $(head -c 160 /tmp/pilocomp-resp.txt)";; esac
  done
  rm -f /tmp/pilocomp-hash-o.txt /tmp/pilocomp-hash-d.txt /tmp/pilocomp-resp.txt
  echo "  Para volver atrás: copie $RESP/pilo-presentaciones y $RESP/pilo-work sobre $BASE, borre $BASE/pilo-compilador y reinicie el contenedor."
else
  echo "3/3 Las funciones de borde no se tocan (--solo-sql)."
fi
echo "  Para volver atrás la migración (borra lo recibido y lo decidido): drop table public.informe_compilacion, public.informe_compilacion_libros; drop function public.informe_compilacion_escribe(uuid);"
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/pilocomp-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pilocomp-remoto.sh $STAMP $FUNCION; rm -f /tmp/pilocomp-remoto.sh"
rm -f "$TMPR"
echo "Listo. Ahora haga commit y push para que Coolify publique la web. Luego, en un informe, el Gestor verá «Compilar informe de colaboradores con Pilo» junto a «Libro de Excel»."
