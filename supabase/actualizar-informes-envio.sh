#!/usr/bin/env bash
# Informes de gestión · enviar = aprobar y más datos del sistema en producción (pila exc75yz…):
#   - migración 0281: «Enviar» deja el informe aprobado en el mismo acto (sent → ok, con su revisión
#     «Aprobado automáticamente al enviar»); Planeación y la unidad DESTINO (jefe de la unidad a la que
#     se entrega el informe) pueden devolverlo con nota. Funciones: informe_es_destino, informe_mis_destinos,
#     informe_transicion_permitida, informe_instancia_visible, informe_instancias_guard, informe_enviar,
#     informe_cambiar_estado (idempotente, una transacción).
#   - migración 0282: resumen de gestión (informe_resumen_gestion): indicadores de Impacto con cifras y
#     evidencias, plan de trabajo de facultades (actividades, avances, evidencias), pilares, revisiones y anexos;
#     la foto se guarda al enviar (informe_instancias.foto_resumen).
#   - función de borde `pilo-informes`: Pilo aprende al enviar (lo dispara el Gestor de la unidad) y la plantilla B
#     llama «Logros» a la sección de logros: index.ts, redaccion.ts, plantillas.ts (y el resto de la carpeta).
#   Respaldo de las funciones SQL que se reemplazan y de la carpeta de la función, un reinicio del contenedor y
#   prueba de arranque. La web (Enviar, Revisión, Alineación, Resultados, Evidencias, Logros) se despliega desde
#   git (Coolify): haga commit y push DESPUÉS de este script.
# OJO: desde 0281 un informe enviado queda aprobado y congelado; ya no pasa por una cola de revisión.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-informes-envio.sh              (migraciones y función)
#   bash supabase/actualizar-informes-envio.sh --solo-sql   (solo las migraciones)
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"
FUNCION=1; [ "${1:-}" = "--solo-sql" ] && FUNCION=0

for f in migrations/0281_informes_envio_aprobado.sql migrations/0282_informe_resumen_gestion.sql functions/pilo-informes/index.ts; do
  [ -f "$AQUI/$f" ] || { echo "Falta $AQUI/$f"; exit 1; }
done

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/infenv-nuevo && mkdir -p /tmp/infenv-nuevo/pilo-informes"
scp "$AQUI/migrations/0281_informes_envio_aprobado.sql" "$AQUI/migrations/0282_informe_resumen_gestion.sql" "$SRV:/tmp/infenv-nuevo/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/pilo-informes/*.ts "$SRV:/tmp/infenv-nuevo/pilo-informes/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; FUNCION="$2"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/infenv-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

echo "2/3 Comprobando la base y aplicando 0281 y 0282…"
# Requisitos: informes (0153), por rol (0192), por sede (0272), mejoras (0279: evidencia obligatoria) e Impacto y plan de facultades.
[ "$(psqlq -c "select to_regclass('public.informe_instancias') is not null and to_regprocedure('public.informe_gestiona()') is not null and to_regprocedure('public.informe_actor(uuid)') is not null and to_regprocedure('public.informe_instancia_visible(uuid)') is not null and to_regprocedure('public.informe_enviar(uuid)') is not null and to_regprocedure('public.informe_cambiar_estado(uuid,text,text)') is not null and to_regprocedure('public.informe_validar_envio(uuid)') is not null and exists (select 1 from information_schema.columns where table_name='informe_instancias' and column_name='campus_id') and to_regclass('public.informe_estructuras') is not null and to_regclass('public.imp_indicators') is not null and to_regclass('public.imp_values') is not null and to_regclass('public.faculty_actions') is not null")" = "t" ] \
  || { echo "FALTAN las migraciones 0153, 0192, 0272, 0279 o las de Impacto (0078) o facultades (0016): no se aplica nada."; exit 1; }
echo "  evidencia obligatoria (0279): $(psqlq -c "select position('Faltan las evidencias' in pg_get_functiondef('public.informe_validar_envio(uuid)'::regprocedure)) > 0")"
sed -i 's/\r$//' "$NUEVO"/*.sql

# Respaldo: las funciones SQL que 0281 y 0282 reemplazan, tal como están ahora (para volver atrás).
mkdir -p "$RESP"
psqlq -c "select string_agg(pg_get_functiondef(p.oid) || ';', E'\n\n' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('informe_enviar','informe_cambiar_estado','informe_transicion_permitida','informe_instancia_visible','informe_instancias_guard','informe_instancias_foto')" > "$RESP/funciones-informes-antes.sql"
echo "  respaldo de las funciones SQL: $RESP/funciones-informes-antes.sql ($(wc -l < "$RESP/funciones-informes-antes.sql") líneas)"

DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.informe_secciones')")
echo "  dueño de informe_secciones: $DUENO"
for M in 0281_informes_envio_aprobado 0282_informe_resumen_gestion; do
  echo "  aplicando $M…"
  { echo "set role \"$DUENO\";"; cat "$NUEVO/$M.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
done
echo "  funciones nuevas: $(psqlq -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('informe_es_destino','informe_mis_destinos','informe_resumen_gestion','informe_resumen_vivo')") de 4"
echo "  columna foto_resumen: $(psqlq -c "select exists (select 1 from information_schema.columns where table_name='informe_instancias' and column_name='foto_resumen')")"
OK1=$(psqlq -c "select position('Aprobado automáticamente' in pg_get_functiondef('public.informe_enviar(uuid)'::regprocedure)) > 0 and position('informe_es_destino' in pg_get_functiondef('public.informe_instancias_guard()'::regprocedure)) > 0 and position('foto_resumen' in pg_get_functiondef('public.informe_instancias_foto()'::regprocedure)) > 0 and to_regprocedure('public.informe_resumen_gestion(uuid)') is not null")
[ "$OK1" = "t" ] || { echo "  Las migraciones 0281/0282 no quedaron aplicadas: revise los mensajes de arriba. Para volver atrás: psql < $RESP/funciones-informes-antes.sql"; exit 1; }
echo "  informes que siguen en «Enviado» (de antes de 0281, Planeación los aprueba o devuelve en Revisión): $(psqlq -c "select count(*) from public.informe_instancias where estado='sent'")"

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando la función pilo-informes (respaldo en $RESP)…"
  [ -f "$BASE/pilo-rankingsod/proveedor.ts" ] && [ -f "$BASE/noticias-pilo/logica.ts" ] || { echo "FALTAN pilo-rankingsod o noticias-pilo en el servidor: no se instala."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/pilo-informes/*.ts
  cp -a "$BASE/pilo-informes" "$RESP/pilo-informes"
  cp "$NUEVO"/pilo-informes/*.ts "$BASE/pilo-informes/"
  chown -R --reference="$RESP/pilo-informes" "$BASE/pilo-informes"
  ( cd "$NUEVO/pilo-informes" && sha256sum *.ts ) > /tmp/infenv-hash-o.txt
  ( cd "$BASE/pilo-informes" && sha256sum $(cd "$NUEVO/pilo-informes" && ls *.ts) ) > /tmp/infenv-hash-d.txt
  diff -q /tmp/infenv-hash-o.txt /tmp/infenv-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  c=$(curl -s -o /tmp/infenv-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-informes" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
  case "$c" in 400|401|403) echo "  OK pilo-informes ($c) $(head -c 90 /tmp/infenv-resp.txt)";; *) echo "  MAL pilo-informes ($c) $(head -c 160 /tmp/infenv-resp.txt)";; esac
  rm -f /tmp/infenv-hash-o.txt /tmp/infenv-hash-d.txt /tmp/infenv-resp.txt
  echo "  Para volver atrás la función: copie $RESP/pilo-informes sobre $BASE/pilo-informes y reinicie el contenedor."
else
  echo "3/3 La función de borde no se toca (--solo-sql)."
fi
echo "  Para volver atrás el SQL: docker exec -i $DB psql -U supabase_admin -d postgres < $RESP/funciones-informes-antes.sql"
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/infenv-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/infenv-remoto.sh $STAMP $FUNCION; rm -f /tmp/infenv-remoto.sh"
rm -f "$TMPR"
echo "Listo. Ahora haga commit y push para que Coolify publique la web; luego Ctrl+F5 y pruebe en Informes: «Enviar» deja el informe aprobado, Revisión permite «Reabrir y devolver con nota» y Resultados/Evidencias muestran «Lo que ya cargó el sistema»."
