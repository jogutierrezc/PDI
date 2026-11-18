#!/usr/bin/env bash
# Informes de gestión · «Crear presentación con Pilo» en producción (pila exc75yz…):
#   - migración 0285: Astra sin tope de tokens (astra_max_tokens = 0 manda la llamada sin max_tokens).
#   - migración 0284: tabla informe_presentaciones (RLS: quien ve el informe la lee; quien la crea la edita).
#   - función de borde NUEVA `pilo-presentaciones` (siempre Pilo Astra 1.0; sin Astra responde astra_apagado).
#     Importa ../pilo-work/proveedor.ts (destinoAstra, esfuerzoAstra, leerConfig): se copia junto, con respaldo.
#   Respaldo de pilo-work (y de pilo-presentaciones si ya existía), un reinicio del contenedor y prueba de
#   arranque. La web se despliega desde git (Coolify): haga commit y push DESPUÉS de este script.
#   La función no sirve hasta que la administración encienda Astra en Administración → Pilo Work
#   (interruptor, dirección, modelo y clave del servidor propio).
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-presentaciones.sh              (migración y función)
#   bash supabase/actualizar-pilo-presentaciones.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

for f in migrations/0284_informe_presentaciones.sql migrations/0285_astra_sin_tope.sql functions/pilo-presentaciones/index.ts functions/pilo-presentaciones/handler.ts functions/pilo-presentaciones/esquema.ts functions/pilo-presentaciones/verificar.ts functions/pilo-presentaciones/prompt.ts functions/pilo-presentaciones/tonos.ts functions/pilo-presentaciones/astra.ts functions/pilo-presentaciones/nucleo.ts functions/pilo-presentaciones/pedido.ts functions/pilo-presentaciones/limite.ts functions/pilo-work/proveedor.ts; do
  [ -f "$AQUI/$f" ] || { echo "Falta $AQUI/$f"; exit 1; }
done

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/pilopres-nuevo && mkdir -p /tmp/pilopres-nuevo/pilo-presentaciones /tmp/pilopres-nuevo/pilo-work"
scp "$AQUI/migrations/0284_informe_presentaciones.sql" "$AQUI/migrations/0285_astra_sin_tope.sql" "$SRV:/tmp/pilopres-nuevo/"
if [ "$FUNCION" = 1 ]; then
  scp "$AQUI"/functions/pilo-presentaciones/*.ts "$SRV:/tmp/pilopres-nuevo/pilo-presentaciones/"
  scp "$AQUI/functions/pilo-work/proveedor.ts" "$SRV:/tmp/pilopres-nuevo/pilo-work/"
fi

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/pilopres-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0284…"
[ "$(psqlq -c "select to_regclass('public.informe_instancias') is not null and to_regprocedure('public.informe_instancia_visible(uuid)') is not null and to_regprocedure('public.pilo_visitor_hit(text,timestamptz)') is not null and to_regclass('public.pw_config') is not null")" = "t" ] \
  || { echo "FALTAN informe_instancias o informe_instancia_visible (0153/0169), pilo_visitor_hit (0110) o pw_config (0247/0278): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
mkdir -p "$RESP"
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.informe_instancias')")
echo "  dueño de informe_instancias: $DUENO"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0284_informe_presentaciones.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
OK1=$(psqlq -c "select to_regclass('public.informe_presentaciones') is not null and (select count(*) from pg_policies where tablename = 'informe_presentaciones') = 4")
[ "$OK1" = "t" ] || { echo "  La migración 0284 no quedó aplicada (tabla y 4 políticas): revise los mensajes de arriba."; exit 1; }
echo "  informe_presentaciones lista: $(psqlq -c "select count(*) from pg_policies where tablename = 'informe_presentaciones'") políticas, RLS $(psqlq -c "select relrowsecurity from pg_class where oid = 'public.informe_presentaciones'::regclass")"
echo "  Aplicando 0285 (Astra sin tope de tokens: 0 = sin tope)…"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0285_astra_sin_tope.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
echo "  Tope de tokens de Astra ahora (0 = sin tope): $(psqlq -c "select astra_max_tokens from public.pw_config where id = 1" 2>/dev/null || echo 'sin leer')"
echo "  Astra encendido en Pilo Work (debe ser t para poder crear presentaciones): $(psqlq -c "select coalesce(astra_habilitado, false) from public.pw_config where id = 1" 2>/dev/null || echo 'sin leer')"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando pilo-presentaciones (respaldo en $RESP)…"
  [ -f "$BASE/pilo-work/proveedor.ts" ] || { echo "FALTA pilo-work/proveedor.ts en el servidor (Pilo Work): instale primero pilo-work."; exit 1; }
  grep -q "export async function destinoAstra" "$NUEVO/pilo-work/proveedor.ts" || { echo "El proveedor.ts nuevo no trae destinoAstra: no se instala."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/pilo-presentaciones/*.ts "$NUEVO"/pilo-work/*.ts
  cp -a "$BASE/pilo-work" "$RESP/pilo-work"
  [ -d "$BASE/pilo-presentaciones" ] && cp -a "$BASE/pilo-presentaciones" "$RESP/pilo-presentaciones" || true
  mkdir -p "$BASE/pilo-presentaciones"
  cp "$NUEVO"/pilo-presentaciones/*.ts "$BASE/pilo-presentaciones/"
  cp "$NUEVO"/pilo-work/proveedor.ts "$BASE/pilo-work/"
  chown -R --reference="$BASE/pilo-work" "$BASE/pilo-presentaciones" "$BASE/pilo-work/proveedor.ts"
  for c in pilo-presentaciones pilo-work; do
    ( cd "$NUEVO/$c" && sha256sum *.ts ) > /tmp/pilopres-hash-o.txt
    ( cd "$BASE/$c" && sha256sum $(cd "$NUEVO/$c" && ls *.ts) ) > /tmp/pilopres-hash-d.txt
    diff -q /tmp/pilopres-hash-o.txt /tmp/pilopres-hash-d.txt >/dev/null && echo "  hashes iguales ($c)" || { echo "  LOS HASHES NO COINCIDEN ($c)"; exit 1; }
  done
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  URL="https://planeacion.udes.edu.co/functions/v1/pilo-presentaciones"
  # Prueba de arranque (no gasta Astra): OPTIONS responde 204 y, con la clave anónima, un POST responde 401 «sin_sesion».
  c=$(curl -s -o /dev/null -m 30 -w '%{http_code}' -X OPTIONS "$URL" -H "apikey: $ANON" 2>/dev/null || echo 000)
  case "$c" in 204) echo "  OK pilo-presentaciones OPTIONS ($c)";; *) echo "  MAL pilo-presentaciones OPTIONS ($c)";; esac
  c=$(curl -s -o /tmp/pilopres-resp.txt -m 30 -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}' 2>/dev/null || echo 000)
  case "$c" in 401) echo "  OK pilo-presentaciones sin sesión ($c) $(head -c 120 /tmp/pilopres-resp.txt)";; *) echo "  MAL pilo-presentaciones ($c) $(head -c 160 /tmp/pilopres-resp.txt)";; esac
  rm -f /tmp/pilopres-hash-o.txt /tmp/pilopres-hash-d.txt /tmp/pilopres-resp.txt
  echo "  Para volver atrás: borre $BASE/pilo-presentaciones (o copie $RESP/pilo-presentaciones encima), copie $RESP/pilo-work sobre $BASE/pilo-work y reinicie el contenedor."
else
  echo "3/3 Las funciones de borde no se tocan (--solo-sql)."
fi
echo "  Para volver atrás la migración (borra las presentaciones guardadas): drop table public.informe_presentaciones;"
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/pilopres-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pilopres-remoto.sh $STAMP $FUNCION; rm -f /tmp/pilopres-remoto.sh"
rm -f "$TMPR"
echo "Listo. Ahora haga commit y push para que Coolify publique la web. Luego, en Administración → Pilo Work, compruebe que Astra esté encendido y entre a un informe: debe aparecer «Crear presentación con Pilo»."
