#!/usr/bin/env bash
# Despliega pilo-publica en el servidor de producción (pila exc75yz…).
# Uso, desde la carpeta del proyecto (te pedirá la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/desplegar-pilo-publica.sh
# No guarda ni imprime la contraseña. Deja copia de respaldo si la función ya existía.
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
LOCAL="$AQUI/functions/pilo-publica"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/pilo-publica-nuevo && mkdir -p /tmp/pilo-publica-nuevo"
scp "$LOCAL"/*.ts "$SRV:/tmp/pilo-publica-nuevo/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"
BASE=/data/coolify/services/exc75yzkfkbkoglxzpckecjp/volumes/functions
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/pilo-publica-nuevo

echo "2/3 Comprobando dependencias en el servidor…"
for d in pilo-rankingsod noticias-pilo; do [ -d "$BASE/$d" ] || { echo "FALTA la carpeta $d en el servidor: no se despliega."; exit 1; }; done
falta=0
chequear() { f="$1"; shift; for s in "$@"; do grep -Eq "export (async )?(function|const|type|interface|class) $s\b" "$BASE/$f" || { echo "  falta $s en $f"; falta=1; }; done; }
chequear pilo-rankingsod/anios.ts anioDeNoticias rangoFechasDeAnio
chequear pilo-rankingsod/cifras.ts extraerCifras
chequear pilo-rankingsod/fuentes.ts afinidadOds cifraAnual plano UMBRAL_FUENTE Criterio FilaCifras
chequear pilo-rankingsod/logica.ts altDeFoto AVISO_IMAGENES enGrupos hablaDeMenores leerAjustes pieDeFoto RECORTE_POR_DEFECTO siguientePos fichaNotas instruccionesVoz ODS_NOMBRES Lectura Mensaje NotaInforme Persona Tono esAnuncio esCitaLiteral extraerJson frases nombresAjenos normalizar numerosDe numerosDeFechas numerosEnLetras resolverRef valorEnCifras
chequear pilo-rankingsod/proveedor.ts elegirProveedor esperaTras429 leerAjustesIA
chequear pilo-rankingsod/ficha.ts verificarTraduccion REGLAS_INGLES numerosEn numerosEs
chequear pilo-rankingsod/indicadores.ts INDICADORES_THE
chequear noticias-pilo/logica.ts foldSystem roleRejected
[ "$falta" = 0 ] || { echo "El pilo-rankingsod o noticias-pilo del servidor está desactualizado: súbelos antes. No se despliega."; exit 1; }

echo "3/3 Instalando pilo-publica…"
sed -i 's/\r$//' "$NUEVO"/*.ts
if [ -d "$BASE/pilo-publica" ]; then cp -a "$BASE/pilo-publica" "$BASE/pilo-publica.bak-$STAMP"; echo "  respaldo: pilo-publica.bak-$STAMP"; fi
mkdir -p "$BASE/pilo-publica"
cp "$NUEVO"/*.ts "$BASE/pilo-publica/"
chown -R --reference="$BASE/pilo-rankingsod" "$BASE/pilo-publica"
chmod --reference="$BASE/pilo-rankingsod" "$BASE/pilo-publica"
( cd "$NUEVO" && sha256sum *.ts ) > /tmp/pp-hash-origen.txt
( cd "$BASE/pilo-publica" && sha256sum *.ts ) > /tmp/pp-hash-destino.txt
diff -q /tmp/pp-hash-origen.txt /tmp/pp-hash-destino.txt && echo "  hashes iguales"
docker restart "$CONT" >/dev/null
echo "  reiniciando $CONT…"
s=""
for i in $(seq 1 30); do
  s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2
done
echo "  estado: $s"
REMOTO

scp "$TMPR" "$SRV:/tmp/pp-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pp-remoto.sh $STAMP; rm -f /tmp/pp-remoto.sh"
rm -f "$TMPR"

echo "Prueba sin sesión (debe responder 401 'Falta la sesión', no un error de carga):"
curl -s -m 20 -o - -w '\nHTTP %{http_code}\n' -X POST https://planeacion.udes.edu.co/functions/v1/pilo-publica -H 'Content-Type: application/json' -d '{"action":"estado"}' || true
