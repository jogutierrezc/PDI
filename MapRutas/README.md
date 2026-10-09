# Visualizador de Movilidad Urbana

Proyecto para visualizar movilidad urbana con tráfico en tiempo real, mapa de calor, puntos reales con clustering, flujos de estudiantes y geocodificación de direcciones usando Mapbox GL JS.

## Funcionalidades

### 📍 Puntos reales con clustering
Muestra cada ubicación individual del archivo. Los puntos se agrupan automáticamente al hacer zoom out (clustering) y se desagrupan al acercar. Cada punto tiene un popup con sus coordenadas.

### 🗺️ Validación de ubicaciones en Colombia
Al cargar un archivo, se validan todas las coordenadas contra los límites geográficos de Colombia:
- **✅ Puntos válidos**: Dentro de Colombia (verdes)
- **❌ Puntos inválidos**: Fuera de Colombia (rojos) — se muestran marcados en el mapa

### 🔍 Geocodificación de direcciones
Convierte direcciones de texto en coordenadas lat/lon usando la API de Mapbox:
1. Escribe una dirección (ej: "Cra 27 #64-14, Bucaramanga")
2. Haz clic en "Buscar dirección"
3. Se muestra la ubicación encontrada con validación de Colombia
4. Puedes agregarla al mapa con "Agregar al mapa"

### 🔥 Mapa de calor
Visualiza la densidad de puntos como un heatmap interactivo.

### 🚦 Tráfico en tiempo real
Capa de tráfico de Mapbox que muestra el estado del tráfico vial en tiempo real.

### 🔄 Flujos de estudiantes
Líneas curvas que muestran las rutas de desplazamiento entre puntos de origen y destino.

### 📍 Paradas manuales
Selección interactiva de paradas en el mapa con trazado automático de rutas.

## Ejecutar

```bash
npm install
npm run dev
```

Esto abrirá el navegador en `http://127.0.0.1:8000`.

## Formatos de archivo soportados

### XLSX (`.xlsx`)
| Columna | Descripción |
|---------|-------------|
| `lat` / `latitude` / `latitud` | Latitud |
| `lon` / `lng` / `longitude` / `longitud` | Longitud |
| `x` / `y` | Alternativas para coordenadas |

### CSV (`.csv`)
- Delimitador: `,` o `;`
- Mismas columnas que XLSX
- Ejemplo: `lat;lon` o `latitude,longitude`

### Geocodificación
No necesitas coordenadas. Escribe una dirección y la API de Mapbox las convierte automáticamente.

## Límites de Colombia

```javascript
{
  minLat: -4.22,
  maxLat: 12.44,
  minLon: -79.0,
  maxLon: -66.86
}
```

## Estructura de archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Interfaz con controles y panel lateral |
| `styles.css` | Estilos para mapa, panel, leyenda y elementos interactivos |
| `app.js` | Lógica principal: mapa, heatmap, tráfico, flujos, geocodificación |
| `direcciones.xlsx` | Datos de ubicaciones de estudiantes |
| `direcciones.csv` | Datos en formato CSV |
| `package.json` | Configuración del proyecto y scripts |
