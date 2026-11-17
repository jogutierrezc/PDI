#!/usr/bin/env bash
# Pilo IA · elegir modelo («Pilo» o «Pilo Astra 1.0») en producción (pila exc75yz…):
#   - migración 0283: pilo_ai_settings gana astra_chat (interruptor de Astra en el chat, apagado) y modelo_defecto.
#   - función de borde `pilo-ia`: acción nueva «modelos», `preguntar` acepta "modelo", meta/done con modelo y
#     pensamiento_s, «probar» con modelo astra (index.ts, modelos.ts y el resto de la carpeta, con lectores/).
#     Importa ../pilo-work/proveedor.ts (destinoAstra, esfuerzoAstra): esa carpeta debe existir en el servidor.
#   - función de borde `pilo-work`: reenvía el pensamiento de Astra al chat (evento pilo_pensando).
#   Respaldo de ambas carpetas, un reinicio del contenedor y prueba de arranque. La web se despliega desde git
#   (Coolify): haga commit y push DESPUÉS de este script. Astra queda APAGADO en el chat hasta que la
#   administración lo encienda en Administración → Pilo (y Pilo Work debe tener dirección, modelo y clave).
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-ia-modelos.sh              (migración y funciones)
#   bash supabase/actualizar-pilo-ia-modelos.sh --solo-sql   (solo la migración)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

for f in migrations/0283_pilo_ia_modelos.sql functions/pilo-ia/index.ts functions/pilo-ia/modelos.ts functions/pilo-work/index.ts functions/pilo-work/proveedor.ts; do
  [ -f "$AQUI/$f" ] || { echo "Falta $AQUI/$f"; exit 1; }
done

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/piloia-nuevo && mkdir -p /tmp/piloia-nuevo/pilo-ia/lectores /tmp/piloia-nuevo/pilo-work"
scp "$AQUI/migrations/0283_pilo_ia_modelos.sql" "$SRV:/tmp/piloia-nuevo/"
if [ "$FUNCION" = 1 ]; then
  scp "$AQUI"/functions/pilo-ia/*.ts "$SRV:/tmp/piloia-nuevo/pilo-ia/"
  scp "$AQUI"/functions/pilo-ia/lectores/*.ts "$SRV:/tmp/piloia-nuevo/pilo-ia/lectores/"
  scp "$AQUI"/functions/pilo-work/*.ts "$SRV:/tmp/piloia-nuevo/pilo-work/"
fi

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/piloia-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0283…"
[ "$(psqlq -c "select to_regclass('public.pilo_ai_settings') is not null and to_regclass('public.pw_config') is not null")" = "t" ] \
  || { echo "FALTAN pilo_ai_settings (0089) o pw_config (0247/0278): no se aplica nada."; exit 1; }
sed -i 's/\r$//' "$NUEVO"/*.sql
mkdir -p "$RESP"
DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.pilo_ai_settings')")
echo "  dueño de pilo_ai_settings: $DUENO"
{ echo "set role \"$DUENO\";"; cat "$NUEVO/0283_pilo_ia_modelos.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
OK1=$(psqlq -c "select (select count(*) from information_schema.columns where table_name='pilo_ai_settings' and column_name in ('astra_chat','modelo_defecto')) = 2")
[ "$OK1" = "t" ] || { echo "  La migración 0283 no quedó aplicada: revise los mensajes de arriba."; exit 1; }
echo "  astra_chat (debe seguir apagado hasta que la administración lo encienda): $(psqlq -c "select astra_chat from public.pilo_ai_settings where id = 1")"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando pilo-ia y pilo-work (respaldo en $RESP)…"
  [ -f "$BASE/pilo-ia/index.ts" ] && [ -f "$BASE/pilo-work/proveedor.ts" ] || { echo "FALTAN pilo-ia o pilo-work en el servidor: no se instala."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/pilo-ia/*.ts "$NUEVO"/pilo-ia/lectores/*.ts "$NUEVO"/pilo-work/*.ts
  cp -a "$BASE/pilo-ia" "$RESP/pilo-ia"
  cp -a "$BASE/pilo-work" "$RESP/pilo-work"
  cp "$NUEVO"/pilo-ia/*.ts "$BASE/pilo-ia/"
  cp "$NUEVO"/pilo-ia/lectores/*.ts "$BASE/pilo-ia/lectores/"
  cp "$NUEVO"/pilo-work/*.ts "$BASE/pilo-work/"
  chown -R --reference="$RESP/pilo-ia" "$BASE/pilo-ia"
  chown -R --reference="$RESP/pilo-work" "$BASE/pilo-work"
  for c in pilo-ia pilo-ia/lectores pilo-work; do
    ( cd "$NUEVO/$c" && sha256sum *.ts ) > /tmp/piloia-hash-o.txt
    ( cd "$BASE/$c" && sha256sum $(cd "$NUEVO/$c" && ls *.ts) ) > /tmp/piloia-hash-d.txt
    diff -q /tmp/piloia-hash-o.txt /tmp/piloia-hash-d.txt >/dev/null && echo "  hashes iguales ($c)" || { echo "  LOS HASHES NO COINCIDEN ($c)"; exit 1; }
  done
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  # Prueba de arranque: con la clave anónima, «modelos» debe responder solo «pilo» (visitante).
  c=$(curl -s -o /tmp/piloia-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-ia" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"modelos","portal":"pregunta"}' 2>/dev/null || echo 000)
  case "$c" in 200) echo "  OK pilo-ia modelos ($c) $(head -c 160 /tmp/piloia-resp.txt)";; *) echo "  MAL pilo-ia ($c) $(head -c 160 /tmp/piloia-resp.txt)";; esac
  rm -f /tmp/piloia-hash-o.txt /tmp/piloia-hash-d.txt /tmp/piloia-resp.txt
  echo "  Para volver atrás las funciones: copie $RESP/pilo-ia sobre $BASE/pilo-ia y $RESP/pilo-work sobre $BASE/pilo-work, y reinicie el contenedor."
else
  echo "3/3 Las funciones de borde no se tocan (--solo-sql)."
fi
echo "  La migración 0283 solo agrega dos columnas con valor por defecto: para volver atrás, alter table public.pilo_ai_settings drop column astra_chat, drop column modelo_defecto;"
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/piloia-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/piloia-remoto.sh $STAMP $FUNCION; rm -f /tmp/piloia-remoto.sh"
rm -f "$TMPR"
echo "Listo. Ahora haga commit y push para que Coolify publique la web. Luego, en Administración → Pilo (Conexión) encienda «Ofrecer Astra en el chat de Pilo», pulse «Probar Astra» y entre con su cuenta: debe aparecer el selector Pilo · Astra."
