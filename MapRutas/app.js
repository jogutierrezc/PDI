/* ═══════════════════════════════════════════════════════════════
   Visualizador de Movilidad Urbana — Universidad de Santander
   ═══════════════════════════════════════════════════════════════ */

const MAPBOX_TOKEN = 'pk.eyJ1IjoibGVnYWxpZnljb2wiLCJhIjoiY21raXpiMmU0MHhwYjNmcG5uNmpsbG81NSJ9.xxw2O-NI2Sxwh4iadJlEVQ';
const UNIVERSIDAD_DEST = [-73.096323, 7.1058441];
const UNIVERSIDAD_NAME = 'Universidad de Santander';

const COLOMBIA_BOUNDS = { minLat: -4.22, maxLat: 12.44, minLon: -79.0, maxLon: -66.86 };

const UDES_BUS_STOPS = [
  { name: 'Parqueadero UDES – Bienestar Institucional', lat: 7.10524, lon: -73.09510 },
  { name: 'Cementerio La Colina – entrada principal', lat: 7.10860, lon: -73.09823 },
  { name: 'Cra. 45 – Calle 65 / Edificio Montecaco', lat: 7.1070, lon: -73.1010 },
  { name: 'Cra. 45 – Calle 62', lat: 7.1068, lon: -73.1020 },
  { name: 'Cra. 45 – Calle 56', lat: 7.1085, lon: -73.1035 },
  { name: 'Cra. 45 – Calle 55', lat: 7.1090, lon: -73.1038 },
  { name: 'Cra. 45 – Calle 54 / CAI Terrazas', lat: 7.11275, lon: -73.10620 },
  { name: 'Calle 56 – Cra. 37', lat: 7.11151, lon: -73.10698 },
  { name: 'Calle 56 – Cra. 36 / Frente al parque', lat: 7.1118, lon: -73.1076 },
  { name: 'Calle 56 – Cra. 35 / Justo & Bueno', lat: 7.1120, lon: -73.1083 },
  { name: 'Calle 56 – Cra. 32 / Edificio Magaly', lat: 7.1105, lon: -73.1102 },
  { name: 'Cra. 29 – Calle 55B / Impormédicas', lat: 7.1100, lon: -73.1130 },
  { name: 'Calle 55A – Cra. 28 / Centro de Rehabilitación', lat: 7.11010, lon: -73.11319 },
  { name: 'Calle 56 – Cra. 28 / Patacones', lat: 7.10872, lon: -73.11309 },
  { name: 'Cra. 33 – Calle 58 / Parada Metrolínea', lat: 7.1090, lon: -73.1096 },
  { name: 'Cra. 33 – Calle 63 / Colegio San Pedrito', lat: 7.10723, lon: -73.11020 },
  { name: 'Cra. 33 – Calle 64 / Viaducto La Flora', lat: 7.10366, lon: -73.10853 },
  { name: 'Torres de Monterrey – C.C. Cacique', lat: 7.09955, lon: -73.10816 },
  { name: 'Frente al Edificio Monviso – carretera Florida', lat: 7.09765, lon: -73.10917 },
  { name: 'Parqueadero UDES – regreso', lat: 7.10524, lon: -73.09510 }
];

const ROAD_NETWORK = [
  { path: [[-73.095,7.105],[-73.105,7.108],[-73.133,7.116],[-73.155,7.075],[-73.167,7.070]], name: 'Autopista BGA-Flori', type: 'trunk' },
  { path: [[-73.100,7.072],[-73.108,7.095],[-73.115,7.105],[-73.120,7.116]], name: 'Vía Girón-BGA', type: 'primary' },
  { path: [[-73.100,7.072],[-73.115,7.068],[-73.130,7.075],[-73.133,7.116]], name: 'Anillo Vial', type: 'primary' },
  { path: [[-73.114,7.122],[-73.113,7.115],[-73.112,7.105],[-73.110,7.096]], name: 'Carrera 27', type: 'secondary' },
  { path: [[-73.118,7.122],[-73.116,7.115],[-73.115,7.105],[-73.114,7.096]], name: 'Carrera 33', type: 'secondary' },
  { path: [[-73.120,7.108],[-73.115,7.108],[-73.108,7.108],[-73.098,7.108]], name: 'Calle 56', type: 'secondary' },
  { path: [[-73.118,7.103],[-73.113,7.104],[-73.108,7.103],[-73.096,7.104]], name: 'Calle 64', type: 'secondary' }
];

const TIME_MULTIPLIERS = { morning: 1.0, noon: 0.55, night: 0.75 };
const TIME_LABELS = { morning: 'Hora pico mañana', noon: 'Hora valle (mediodía)', night: 'Hora pico tarde' };

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */

let map, mapLoaded = false, mapLoadPromise = null;
let lastValidData = null, lastInvalidData = null, lastRawData = null;
let heatmapVisible = false, trafficVisible = false, flowVisible = false;
let realPointsVisible = false, busRouteVisible = false;
let currentVizMode = 'hexagons', currentTimeFilter = 'morning', showProbability = true;
let pendingGeocode = null;
let animFrameId = null, busAnimFrameId = null, densityAnimFrame = null;

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  if (window.mapboxReadyPromise) await window.mapboxReadyPromise;
  await initMap();
  await loadDefaultXls();
});

function initMap() {
  if (typeof mapboxgl === 'undefined') { showError('Mapbox GL JS no cargado.'); return Promise.reject(); }
  if (map) { map.remove(); mapLoaded = false; }
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/light-v11', center: [-73.1190, 7.1190], zoom: 11.5 });
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  mapLoadPromise = new Promise(r => map.on('load', () => { mapLoaded = true; r(); }));
  map.on('error', e => console.error('Mapbox error:', e));
  window.addEventListener('resize', () => map && map.resize());
  return mapLoadPromise;
}

function ensureMap() { return mapLoaded ? Promise.resolve() : (mapLoadPromise || Promise.resolve()); }

/* ═══════════════════════════════════════════════════════════════
   VALIDATION
   ═══════════════════════════════════════════════════════════════ */

function isInsideColombia(lon, lat) {
  return lat >= COLOMBIA_BOUNDS.minLat && lat <= COLOMBIA_BOUNDS.maxLat && lon >= COLOMBIA_BOUNDS.minLon && lon <= COLOMBIA_BOUNDS.maxLon;
}

function processData(geojson) {
  lastRawData = geojson;
  const valid = [], invalid = [];
  geojson.features.forEach(f => {
    const [lon, lat] = f.geometry.coordinates;
    if (isInsideColombia(lon, lat)) valid.push(f);
    else invalid.push({ ...f, properties: { ...f.properties, invalidReason: `Fuera de Colombia` } });
  });
  lastValidData = { type: 'FeatureCollection', features: valid };
  lastInvalidData = { type: 'FeatureCollection', features: invalid };
  showStats(valid.length, invalid.length);
  return lastValidData;
}

/* ═══════════════════════════════════════════════════════════════
   FILE PARSING
   ═══════════════════════════════════════════════════════════════ */

function parseXlsData(buf) {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  if (!rows.length) throw new Error('Archivo sin filas.');
  const h = Object.keys(rows[0]).map(k => k.trim().toLowerCase());
  const latKey = Object.keys(rows[0]).find(k => /^(lat|latitude|latitud)$/i.test(k.trim()));
  const lonKey = Object.keys(rows[0]).find(k => /^(lon|lng|long|longitude|longitud)$/i.test(k.trim()));
  if (!latKey || !lonKey) throw new Error('No se encontraron columnas lat/lon.');
  const features = rows.map(r => {
    const lat = parseFloat(String(r[latKey]).replace(',', '.'));
    const lon = parseFloat(String(r[lonKey]).replace(',', '.'));
    if (isNaN(lat) || isNaN(lon)) return null;
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { ...r } };
  }).filter(Boolean);
  return { type: 'FeatureCollection', features };
}

function parseCSVData(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV sin filas suficientes.');
  const d = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(d).map(h => h.trim().toLowerCase().replace(/^\uFEFF/, ''));
  const latIdx = headers.findIndex(h => /^lat/i.test(h));
  const lonIdx = headers.findIndex(h => /^(lon|lng|long)/i.test(h));
  if (latIdx === -1 || lonIdx === -1) throw new Error('CSV debe tener lat/lon.');
  const features = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(d).map(c => c.trim());
    const lat = parseFloat(cols[latIdx]), lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} });
  }
  return { type: 'FeatureCollection', features };
}

async function loadDefaultXls() {
  try {
    const res = await fetch('direcciones.xlsx');
    if (!res.ok) throw new Error('No se encontró direcciones.xlsx');
    const geojson = processData(parseXlsData(await res.arrayBuffer()));
    await ensureMap();
    renderViz(geojson);
    fitToGeoJSON(geojson);
  } catch (e) { showError(e.message); }
}

async function loadDefaultCsv() {
  try {
    const res = await fetch('direcciones.csv');
    if (!res.ok) throw new Error('No se encontró direcciones.csv');
    const geojson = processData(parseCSVData(await res.text()));
    await ensureMap();
    renderViz(geojson);
    fitToGeoJSON(geojson);
  } catch (e) { showError(e.message); }
}

async function loadCustomFile() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) { showError('Selecciona un archivo.'); return; }
  try {
    let geojson;
    if (file.name.endsWith('.csv')) geojson = parseCSVData(await file.text());
    else geojson = parseXlsData(await file.arrayBuffer());
    const valid = processData(geojson);
    await ensureMap();
    renderViz(valid);
    fitToGeoJSON(valid);
    clearError();
  } catch (e) { showError(e.message); }
}

/* ═══════════════════════════════════════════════════════════════
   DENSITY VISUALIZATION (HEX / HEATMAP / NETWORK)
   ═══════════════════════════════════════════════════════════════ */

function renderViz(data) {
  if (!map || !data) return;
  clearViz();
  const tf = TIME_MULTIPLIERS[currentTimeFilter];
  if (currentVizMode === 'hexagons') renderHexagons(data, tf);
  else if (currentVizMode === 'heatmap') renderHeatmap(data, tf);
  else if (currentVizMode === 'network') renderNetwork(data, tf);
  heatmapVisible = true;
  showLegend(true);
}

function clearViz() {
  ['hex-fill', 'hex-border', 'heatmap', 'net-hex', 'net-line', 'suggested-pulse', 'suggested-dot'].forEach(id => {
    if (map && map.getLayer(id)) map.removeLayer(id);
  });
  ['hex-src', 'heatmap-src', 'net-src', 'suggested-src'].forEach(id => {
    if (map && map.getSource(id)) map.removeSource(id);
  });
  if (densityAnimFrame) { cancelAnimationFrame(densityAnimFrame); densityAnimFrame = null; }
  heatmapVisible = false;
}

function buildHexGrid(features, tf) {
  const SIZE = 0.003;
  const cx = -73.115, cy = 7.105;
  const hexes = new Map();
  features.forEach(f => {
    const [lon, lat] = f.geometry.coordinates;
    const q = Math.round((lon - cx) / (SIZE * 1.5));
    const r = Math.round((lat - cy) / (SIZE * Math.sqrt(3)));
    const key = q + ',' + r;
    if (!hexes.has(key)) {
      const hx = cx + q * SIZE * 1.5;
      const hy = cy + r * SIZE * Math.sqrt(3) + (Math.abs(q) % 2 ? SIZE * Math.sqrt(3) / 2 : 0);
      const corners = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i);
        corners.push([hx + SIZE * 0.9 * Math.cos(a), hy + SIZE * 0.9 * Math.sin(a)]);
      }
      hexes.set(key, { cx: hx, cy: hy, corners, count: 0 });
    }
    hexes.get(key).count++;
  });
  hexes.forEach(h => { h.count = Math.max(1, Math.round(h.count * tf)); });
  return Array.from(hexes.values()).filter(h => h.count > 0);
}

function renderHexagons(data, tf) {
  const hexes = buildHexGrid(data.features, tf);
  const maxC = Math.max(...hexes.map(h => h.count), 1);
  const geo = { type: 'FeatureCollection', features: hexes.map(h => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [h.corners] },
    properties: { count: h.count, norm: h.count / maxC }
  }))};

  if (!map.getSource('hex-src')) map.addSource('hex-src', { type: 'geojson', data: geo });
  else map.getSource('hex-src').setData(geo);

  if (!map.getLayer('hex-fill')) map.addLayer({
    id: 'hex-fill', type: 'fill', source: 'hex-src',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'norm'], 0, '#fde047', 0.3, '#fb923c', 0.6, '#ef4444', 0.9, '#991b1b'],
      'fill-opacity': ['interpolate', ['linear'], ['get', 'norm'], 0, 0.45, 0.5, 0.7, 1, 0.9]
    }
  });

  if (!map.getLayer('hex-border')) map.addLayer({
    id: 'hex-border', type: 'line', source: 'hex-src',
    paint: { 'line-color': '#fff', 'line-width': 0.8, 'line-opacity': 0.5 }
  });

  // Popups
  map.off('click', 'hex-fill');
    map.off('click', 'hex-fill');
  map.on('click', 'hex-fill', e => {
    const p = e.features[0].properties;
    const count = Number(p.count);
    const norm = Number(p.norm);
    new mapboxgl.Popup({ maxWidth: '220px' }).setLngLat(e.lngLat).setHTML(
      '<div style="padding:4px">' +
      '<div style="font-size:14px;font-weight:700;color:#dc2626">⬡ Zona de densidad</div>' +
      '<hr style="margin:4px 0;border:none;border-top:1px solid #e5e7eb">' +
      '<div style="font-size:13px">👤 Estudiantes: <strong>' + count + '</strong></div>' +
      '<div style="font-size:12px;color:#6b7280;margin-top:2px">Cobertura: ' + Math.round(norm * 100) + '%</div>' +
      '</div>'
    ).addTo(map);
  });
  map.on('mouseenter', 'hex-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'hex-fill', () => { map.getCanvas().style.cursor = ''; });

  // Suggested stops
  renderSuggestedStops(hexes, maxC);
}

function renderHeatmap(data, tf) {
  const geo = { type: 'FeatureCollection', features: data.features.map(f => ({ ...f, properties: { w: tf } })) };
  if (!map.getSource('heatmap-src')) map.addSource('heatmap-src', { type: 'geojson', data: geo });
  else map.getSource('heatmap-src').setData(geo);

  if (!map.getLayer('heatmap')) map.addLayer({
    id: 'heatmap', type: 'heatmap', source: 'heatmap-src', maxzoom: 16,
    paint: {
      'heatmap-weight': ['get', 'w'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 12, 1.5, 16, 3],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(253,224,71,0)', 0.2, 'rgba(251,146,60,0.4)', 0.5, 'rgba(239,68,68,0.6)', 0.8, 'rgba(153,27,27,0.8)', 1, 'rgba(127,29,29,0.9)'],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 12, 25, 16, 40],
      'heatmap-opacity': 0.75
    }
  });
}

function renderNetwork(data, tf) {
  // Fondo hex sutil
  const hexes = buildHexGrid(data.features, tf);
  const maxC = Math.max(...hexes.map(h => h.count), 1);
  const hexGeo = { type: 'FeatureCollection', features: hexes.map(h => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [h.corners] },
    properties: { norm: h.count / maxC }
  }))};

  if (!map.getSource('net-src')) map.addSource('net-src', { type: 'geojson', data: hexGeo });
  else map.getSource('net-src').setData(hexGeo);

  if (!map.getLayer('net-hex')) map.addLayer({
    id: 'net-hex', type: 'fill', source: 'net-src',
    paint: { 'fill-color': '#fde047', 'fill-opacity': 0.12 }
  });

  // Demand lines
  const lineFeatures = [];
  ROAD_NETWORK.forEach(road => {
    let demand = 0;
    data.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      road.path.forEach(p => {
        if (Math.sqrt((lon - p[0]) ** 2 + (lat - p[1]) ** 2) < 0.008) demand++;
      });
    });
    const norm = Math.min((demand * tf) / 100, 1);
    if (norm < 0.05) return;
    lineFeatures.push({
      type: 'Feature', geometry: { type: 'LineString', coordinates: road.path },
      properties: { color: norm > 0.6 ? '#dc2626' : norm > 0.3 ? '#ea580c' : '#ca8a04', width: 2 + norm * 5 }
    });
  });

  const lineGeo = { type: 'FeatureCollection', features: lineFeatures };
  if (!map.getSource('net-line-src')) map.addSource('net-line-src', { type: 'geojson', data: lineGeo });
  else map.getSource('net-line-src').setData(lineGeo);

  if (!map.getLayer('net-line')) map.addLayer({
    id: 'net-line', type: 'line', source: 'net-line-src',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.85 }
  });

  renderSuggestedStops(hexes, maxC);
}

function renderSuggestedStops(hexes, maxC) {
  // Filtrar hexágonos de alta densidad que NO estén cerca de una parada existente
  const STOP_RAD = 0.006; // ~600m para evitar sugerir donde ya hay parada
  const features = hexes
    .filter(h => h.count > maxC * 0.5)
    .filter(h => {
      // Verificar que no esté demasiado cerca de una parada existente
      return !UDES_BUS_STOPS.some(s => 
        Math.sqrt((h.cx - s.lon) ** 2 + (h.cy - s.lat) ** 2) < STOP_RAD
      );
    })
    .map(h => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [h.cx, h.cy] },
      properties: { count: h.count, norm: Math.round((h.count / maxC) * 100) }
    }));

  if (!features.length) return;
  const geo = { type: 'FeatureCollection', features };

  if (!map.getSource('suggested-src')) map.addSource('suggested-src', { type: 'geojson', data: geo });
  else map.getSource('suggested-src').setData(geo);

  if (!map.getLayer('suggested-pulse')) map.addLayer({
    id: 'suggested-pulse', type: 'circle', source: 'suggested-src',
    paint: { 'circle-radius': 14, 'circle-color': 'rgba(22,163,74,0.12)', 'circle-stroke-color': 'rgba(22,163,74,0.45)', 'circle-stroke-width': 2 }
  });

  if (!map.getLayer('suggested-dot')) map.addLayer({
    id: 'suggested-dot', type: 'circle', source: 'suggested-src',
    paint: { 'circle-radius': 6, 'circle-color': '#16a34a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 }
  });

  // Popup para sugerencias
  map.off('click', 'suggested-dot');
  map.on('click', 'suggested-dot', e => {
    const p = e.features[0].properties;
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<strong>📍 Parada sugerida</strong><br>Estudiantes en zona: <strong>${p.count}</strong><br>Cobertura: <strong>${p.norm}%</strong> de la zona más poblada<br><em style="color:#16a34a">No hay parada de bus en esta zona</em>`)
      .addTo(map);
  });
  map.on('mouseenter', 'suggested-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'suggested-dot', () => { map.getCanvas().style.cursor = ''; });

  // Pulse anim
  let t = 0;
  function anim() {
    t = (t + 0.04) % (Math.PI * 2);
    if (map && map.getLayer('suggested-pulse'))
      map.setPaintProperty('suggested-pulse', 'circle-opacity', 0.3 + Math.sin(t) * 0.25);
    densityAnimFrame = requestAnimationFrame(anim);
  }
  if (densityAnimFrame) cancelAnimationFrame(densityAnimFrame);
  densityAnimFrame = requestAnimationFrame(anim);
}

/* ═══════════════════════════════════════════════════════════════
   BUS ROUTE UDES
   ═══════════════════════════════════════════════════════════════ */

function calculateStopProbability(students) {
  if (!students) return UDES_BUS_STOPS.map((s, i) => ({ ...s, stopNumber: i + 1, prob: 0, probLabel: 'Sin datos', probColor: '#9ca3af', nearby: 0 }));
  const RAD = 0.0045;
  const total = students.features.length || 1;
  return UDES_BUS_STOPS.map((stop, i) => {
    let nearby = 0;
    students.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      if (Math.sqrt((lon - stop.lon) ** 2 + (lat - stop.lat) ** 2) < RAD) nearby++;
    });
    const prob = Math.min(1, (nearby * 3) / total);
    return {
      ...stop, stopNumber: i + 1, nearby, prob,
      probLabel: prob > 0.7 ? 'Alta' : prob > 0.3 ? 'Media' : 'Baja',
      probColor: prob > 0.7 ? '#dc2626' : prob > 0.3 ? '#f59e0b' : '#16a34a'
    };
  });
}

function addBusRoute() {
  if (!map) return;
  const stops = calculateStopProbability(lastValidData);

  // Route line
  const lineGeo = { type: 'FeatureCollection', features: [{
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: UDES_BUS_STOPS.map(s => [s.lon, s.lat]) },
    properties: {}
  }]};

  if (!map.getSource('bus-line-src')) map.addSource('bus-line-src', { type: 'geojson', data: lineGeo });
  else map.getSource('bus-line-src').setData(lineGeo);

  if (!map.getLayer('bus-line')) map.addLayer({
    id: 'bus-line', type: 'line', source: 'bus-line-src',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#f59e0b', 'line-width': 3.5, 'line-opacity': 0.9 }
  });

  // Stops
  const stopsGeo = { type: 'FeatureCollection', features: stops.map(s => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: { name: s.name, num: s.stopNumber, prob: s.prob, probLabel: s.probLabel, probColor: s.probColor, nearby: s.nearby }
  }))};

  if (!map.getSource('bus-stops-src')) map.addSource('bus-stops-src', { type: 'geojson', data: stopsGeo });
  else map.getSource('bus-stops-src').setData(stopsGeo);

  // Pulse
  if (!map.getLayer('bus-pulse')) map.addLayer({
    id: 'bus-pulse', type: 'circle', source: 'bus-stops-src',
    paint: { 'circle-radius': 15, 'circle-color': 'rgba(245,158,11,0.1)', 'circle-stroke-color': 'rgba(245,158,11,0.3)', 'circle-stroke-width': 2 }
  });

  // Dots
  if (!map.getLayer('bus-dot')) map.addLayer({
    id: 'bus-dot', type: 'circle', source: 'bus-stops-src',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 13, 8, 16, 12],
      'circle-color': showProbability ? ['get', 'probColor'] : '#16a34a',
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2
    }
  });

  // Labels
  if (!map.getLayer('bus-label')) map.addLayer({
    id: 'bus-label', type: 'symbol', source: 'bus-stops-src',
    layout: {
      'text-field': ['to-string', ['get', 'num']],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 13, 12, 16, 15],
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 }
  });

  // Popup
  map.off('click', 'bus-dot');
  map.on('click', 'bus-dot', e => {
    const p = e.features[0].properties;
    const num = Number(p.num);
    const prob = Number(p.prob);
    const nearby = Number(p.nearby);
    const probColor = p.probColor || '#9ca3af';
    const probLabel = p.probLabel || 'Sin datos';
    new mapboxgl.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(
      '<div style="padding:4px">' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:4px">🚌 Parada ' + num + '</div>' +
      '<div style="font-size:12px;color:#374151;margin-bottom:8px">' + p.name + '</div>' +
      '<hr style="margin:0 0 8px;border:none;border-top:1px solid #e5e7eb">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="width:12px;height:12px;border-radius:50%;background:' + probColor + ';display:inline-block;flex-shrink:0"></span>' +
      '<span style="font-size:13px">Probabilidad de uso: <strong>' + probLabel + '</strong> (' + Math.round(prob * 100) + '%)</span>' +
      '</div>' +
      '<div style="font-size:13px">👤 Estudiantes cercanos (~500m): <strong>' + nearby + '</strong></div>' +
      '</div>'
    ).addTo(map);
  });
  map.on('mouseenter', 'bus-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'bus-dot', () => { map.getCanvas().style.cursor = ''; });

  // Pulse anim
  let t = 0;
  function anim() {
    t = (t + 0.04) % (Math.PI * 2);
    if (map && map.getLayer('bus-pulse'))
      map.setPaintProperty('bus-pulse', 'circle-opacity', 0.25 + Math.sin(t) * 0.2);
    busAnimFrameId = requestAnimationFrame(anim);
  }
  busAnimFrameId = requestAnimationFrame(anim);

  busRouteVisible = true;
  updateBusButton();
  updateBusStats(stops);
  showLegend(true);
}

function removeBusRoute() {
  ['bus-line', 'bus-dot', 'bus-pulse', 'bus-label'].forEach(id => { if (map && map.getLayer(id)) map.removeLayer(id); });
  ['bus-line-src', 'bus-stops-src'].forEach(id => { if (map && map.getSource(id)) map.removeSource(id); });
  if (busAnimFrameId) { cancelAnimationFrame(busAnimFrameId); busAnimFrameId = null; }
  busRouteVisible = false;
  updateBusButton();
}

function updateBusButton() {
  const btn = document.getElementById('toggleBusRoute');
  if (btn) { btn.textContent = busRouteVisible ? 'Ocultar ruta de bus' : 'Mostrar ruta de bus'; btn.classList.toggle('active', busRouteVisible); }
}

function updateBusStats(stops) {
  const el = document.getElementById('stopStatsText');
  if (!el) return;
  const h = stops.filter(s => s.prob > 0.7).length;
  const m = stops.filter(s => s.prob > 0.3 && s.prob <= 0.7).length;
  const l = stops.filter(s => s.prob <= 0.3).length;
  el.innerHTML = `🔴 Alta: ${h} · 🟡 Media: ${m} · 🟢 Baja: ${l}`;
  document.getElementById('stopStats').classList.remove('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   TRAFFIC (VECTORIAL)
   ═══════════════════════════════════════════════════════════════ */

const TRAFFIC_LAYERS = [
  { id: 'trf-low', filter: ['==', 'congestion', 'low'], color: '#00b300', w: 3 },
  { id: 'trf-mod', filter: ['==', 'congestion', 'moderate'], color: '#ffc200', w: 4 },
  { id: 'trf-hvy', filter: ['==', 'congestion', 'heavy'], color: '#ff6600', w: 5 },
  { id: 'trf-sev', filter: ['==', 'congestion', 'severe'], color: '#ff0000', w: 6 },
  { id: 'trf-clsd', filter: ['==', 'closed', 'yes'], color: '#990000', w: 4 }
];

function addTraffic() {
  if (!map) return;
  if (map.getSource('trf-src')) {
    TRAFFIC_LAYERS.forEach(l => { if (map.getLayer(l.id)) map.setLayoutProperty(l.id, 'visibility', 'visible'); });
    trafficVisible = true; updateTrafficBtn(); return;
  }
  map.addSource('trf-src', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
  const first = (() => { for (const l of map.getStyle().layers) if (l.type === 'symbol') return l.id; return null; })();
  TRAFFIC_LAYERS.forEach(l => map.addLayer({
    id: l.id, type: 'line', source: 'trf-src', 'source-layer': 'traffic', filter: l.filter,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': l.color, 'line-width': l.w, 'line-opacity': 0.75 }
  }, first));
  trafficVisible = true; updateTrafficBtn(); showLegend(true);
}

function removeTraffic() {
  TRAFFIC_LAYERS.forEach(l => { if (map && map.getLayer(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none'); });
  trafficVisible = false; updateTrafficBtn();
}

function updateTrafficBtn() {
  const btn = document.getElementById('toggleTraffic');
  if (btn) { btn.textContent = trafficVisible ? 'Desactivar tráfico' : 'Activar tráfico'; btn.classList.toggle('active', trafficVisible); }
}

/* ═══════════════════════════════════════════════════════════════
   FLOWS TO BUS STOPS (ANIMATED)
   ═══════════════════════════════════════════════════════════════ */

function addFlows() {
  if (!map || !lastValidData) return;
  clearFlows();

  // Agrupar puntos por coordenada
  const uniquePoints = [];
  const seen = new Set();
  lastValidData.features.forEach(f => {
    const k = f.geometry.coordinates.join(',');
    if (!seen.has(k)) { seen.add(k); uniquePoints.push(f); }
  });
  const coordCount = {};
  lastValidData.features.forEach(f => {
    const k = f.geometry.coordinates.join(',');
    coordCount[k] = (coordCount[k] || 0) + 1;
  });

  // Cada estudiante fluye a su parada MÁS CERCANA
  const stopUsage = new Array(UDES_BUS_STOPS.length).fill(0);
  const flowFeatures = [];

  uniquePoints.forEach((origin, oi) => {
    const from = origin.geometry.coordinates;
    const count = coordCount[from.join(',')] || 1;

    // Encontrar parada más cercana
    let minDist = Infinity, nearestIdx = 0;
    UDES_BUS_STOPS.forEach((stop, si) => {
      const d = Math.sqrt((from[0] - stop.lon) ** 2 + (from[1] - stop.lat) ** 2);
      if (d < minDist) { minDist = d; nearestIdx = si; }
    });

    const stop = UDES_BUS_STOPS[nearestIdx];
    const to = [stop.lon, stop.lat];
    stopUsage[nearestIdx] += count;

    // Crear arco con curva
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.0001) return;
    const off = dist * 0.18;
    const mx = (from[0] + to[0]) / 2 + (-dy / dist * off);
    const my = (from[1] + to[1]) / 2 + (dx / dist * off);
    const color = count >= 5 ? '#ff0000' : count >= 3 ? '#ff6b35' : count >= 2 ? '#f59e0b' : '#2563eb';

    flowFeatures.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [from, [mx, my], to] },
      properties: { color, count, stopNum: nearestIdx + 1, stopName: stop.name }
    });
  });

  if (!flowFeatures.length) { showError('No hay flujos para generar.'); return; }

  const geo = { type: 'FeatureCollection', features: flowFeatures };

  if (!map.getSource('flow-src')) map.addSource('flow-src', { type: 'geojson', data: geo });
  else map.getSource('flow-src').setData(geo);

  // Base line
  if (!map.getLayer('flow-base')) map.addLayer({
    id: 'flow-base', type: 'line', source: 'flow-src',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['get', 'count'], 1, 1.5, 5, 4], 'line-opacity': 0.3 }
  });

  // Animated line
  if (!map.getLayer('flow-anim')) map.addLayer({
    id: 'flow-anim', type: 'line', source: 'flow-src',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['get', 'count'], 1, 2, 5, 5], 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3] }
  });

  // Popup en líneas de flujo
  map.off('click', 'flow-base');
  map.on('click', 'flow-base', e => {
    const p = e.features[0].properties;
    new mapboxgl.Popup({ maxWidth: '250px' }).setLngLat(e.lngLat).setHTML(
      '<div style="padding:4px">' +
      '<div style="font-size:13px;font-weight:700">-> Parada ' + Number(p.stopNum) + '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + p.stopName + '</div>' +
      '<div style="font-size:12px;margin-top:6px">👤 <strong>' + Number(p.count) + '</strong> estudiante(s) usan esta ruta</div>' +
      '</div>'
    ).addTo(map);
  });
  map.on('mouseenter', 'flow-base', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'flow-base', () => { map.getCanvas().style.cursor = ''; });

  // Animate
  let offset = 0;
  function anim() {
    offset = (offset + 0.12) % 7;
    if (map && map.getLayer('flow-anim'))
      map.setPaintProperty('flow-anim', 'line-dasharray', [offset, 4, 3]);
    animFrameId = requestAnimationFrame(anim);
  }
  animFrameId = requestAnimationFrame(anim);

  flowVisible = true;
  const totalStudents = lastValidData.features.length;
  const usedStops = stopUsage.filter(u => u > 0).length;
  document.getElementById('flowCount').textContent = totalStudents + ' estudiantes → ' + usedStops + ' paradas activas';
  document.getElementById('flowStats').classList.remove('hidden');
  updateFlowBtn();
  showLegend(true);
}

function clearFlows() {
  ['flow-base', 'flow-anim'].forEach(id => { if (map && map.getLayer(id)) map.removeLayer(id); });
  if (map && map.getSource('flow-src')) map.removeSource('flow-src');
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  flowVisible = false;
  document.getElementById('flowStats').classList.add('hidden');
  updateFlowBtn();
}

function updateFlowBtn() {
  const btn = document.getElementById('toggleFlow');
  if (btn) { btn.textContent = flowVisible ? 'Ocultar flujos' : 'Mostrar flujos a paradas'; btn.classList.toggle('active', flowVisible); }
}

/* ═══════════════════════════════════════════════════════════════
   REAL POINTS (CLUSTERING)
   ═══════════════════════════════════════════════════════════════ */

function addRealPoints() {
  if (!map || !lastValidData) return;
  if (!map.getSource('rp-src')) map.addSource('rp-src', { type: 'geojson', data: lastValidData, cluster: true, clusterMaxZoom: 16, clusterRadius: 50 });
  else map.getSource('rp-src').setData(lastValidData);

  if (!map.getLayer('rp-cluster')) map.addLayer({
    id: 'rp-cluster', type: 'circle', source: 'rp-src', filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#10b981', 5, '#f59e0b', 15, '#ef4444'],
      'circle-radius': ['step', ['get', 'point_count'], 15, 5, 25, 15, 35],
      'circle-stroke-width': 2, 'circle-stroke-color': '#fff'
    }
  });

  if (!map.getLayer('rp-count')) map.addLayer({
    id: 'rp-count', type: 'symbol', source: 'rp-src', filter: ['has', 'point_count'],
    layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 12 },
    paint: { 'text-color': '#fff' }
  });

  if (!map.getLayer('rp-dot')) map.addLayer({
    id: 'rp-dot', type: 'circle', source: 'rp-src', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': 6, 'circle-color': '#10b981', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0.85 }
  });

  // Popups
  map.off('click', 'rp-cluster');
  map.on('click', 'rp-cluster', e => {
    const c = e.features[0].properties.point_count;
    new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(`<strong>${c} ubicaciones</strong> en esta zona`).addTo(map);
  });
  map.off('click', 'rp-dot');
  map.on('click', 'rp-dot', e => {
    const c = e.features[0].geometry.coordinates;
    new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(`<strong>Ubicación</strong><br>Lat: ${c[1].toFixed(6)}<br>Lon: ${c[0].toFixed(6)}`).addTo(map);
  });
  map.on('mouseenter', 'rp-cluster', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'rp-cluster', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'rp-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'rp-dot', () => { map.getCanvas().style.cursor = ''; });

  realPointsVisible = true;
  const btn = document.getElementById('toggleRealPoints');
  if (btn) { btn.textContent = 'Ocultar puntos reales'; btn.classList.add('active'); }
  showLegend(true);
}

function removeRealPoints() {
  ['rp-cluster', 'rp-count', 'rp-dot'].forEach(id => { if (map && map.getLayer(id)) map.removeLayer(id); });
  if (map && map.getSource('rp-src')) map.removeSource('rp-src');
  realPointsVisible = false;
  const btn = document.getElementById('toggleRealPoints');
  if (btn) { btn.textContent = 'Mostrar puntos reales'; btn.classList.remove('active'); }
}

/* ═══════════════════════════════════════════════════════════════
   GEOCODING
   ═══════════════════════════════════════════════════════════════ */

const COLOMBIA_BBOX = '-79.0,-4.22,-66.86,12.44';
const DEPTO_COORDS = {
  'santander': [-73.12, 7.12], 'bucaramanga': [-73.12, 7.12],
  'norte de santander': [-72.50, 7.89], 'cundinamarca': [-74.07, 4.60],
  'bogota': [-74.07, 4.60], 'antioquia': [-75.56, 6.25], 'medellin': [-75.56, 6.25],
  'valle del cauca': [-76.53, 3.45], 'cali': [-76.53, 3.45]
};

async function geocodeSingle(query, dept, city) {
  let q = query;
  if (city && !q.toLowerCase().includes(city.toLowerCase())) q += ', ' + city;
  if (dept && !q.toLowerCase().includes(dept.toLowerCase())) q += ', ' + dept;
  q += ', Colombia';
  const dk = (city || '').toLowerCase().trim();
  const deptk = (dept || '').toLowerCase().trim();
  let prox = '';
  if (DEPTO_COORDS[dk]) prox = '&proximity=' + DEPTO_COORDS[dk].join(',');
  else if (DEPTO_COORDS[deptk]) prox = '&proximity=' + DEPTO_COORDS[deptk].join(',');
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=co&bbox=${COLOMBIA_BBOX}&limit=5${prox}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.features?.length) return null;
  let best = data.features[0];
  if (city || dept) {
    const match = data.features.find(f => {
      const n = f.place_name.toLowerCase();
      return (city && n.includes(city.toLowerCase())) || (dept && n.includes(dept.toLowerCase()));
    });
    if (match) best = match;
  }
  return { lon: best.center[0], lat: best.center[1], placeName: best.place_name };
}

const ADDRESS_COLUMNS = {
  departamento: /^(departamento|department|depto|estado|state)$/i,
  ciudad: /^(ciudad|city|municipio|mun|town|localidad)$/i,
  direccion: /^(dirección|direccion|address|dir|calle|street|avenida)$/i,
  barrio: /^(barrio|neighborhood)$/i
};

function detectAddressColumns(headers) {
  const found = {};
  const norm = headers.map(h => h.toString().trim().toLowerCase());
  Object.entries(ADDRESS_COLUMNS).forEach(([key, rx]) => {
    const idx = norm.findIndex(h => rx.test(h));
    if (idx !== -1) found[key] = { index: idx, name: headers[idx] };
  });
  return { columns: found, isAddressFile: !!(found.direccion || found.ciudad || found.departamento) };
}

function buildAddressString(row, cols) {
  const p = [];
  if (cols.direccion) p.push(row[cols.direccion.name]);
  if (cols.barrio) p.push(row[cols.barrio.name]);
  if (cols.ciudad) p.push(row[cols.ciudad.name]);
  if (cols.departamento) p.push(row[cols.departamento.name]);
  p.push('Colombia');
  return p.filter(x => x && String(x).trim()).join(', ');
}

async function batchGeocode(file) {
  let addressData;
  if (file.name.endsWith('.csv')) {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    const d = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(d).map(h => h.trim().toLowerCase());
    const detection = detectAddressColumns(headers);
    if (!detection.isAddressFile) throw new Error('No se encontraron columnas de dirección.');
    const addresses = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(d).map(c => c.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
      const addr = buildAddressString(row, detection.columns);
      if (addr.replace(/, Colombia$/, '').trim()) addresses.push({ raw: row, address: addr, columns: detection.columns });
    }
    addressData = { addresses };
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    if (!rows.length) throw new Error('Archivo sin filas.');
    const headers = Object.keys(rows[0]);
    const detection = detectAddressColumns(headers);
    if (!detection.isAddressFile) throw new Error('No se encontraron columnas de dirección.');
    const addresses = rows.map(row => ({
      raw: row, address: buildAddressString(row, detection.columns), columns: detection.columns
    })).filter(a => a.address.replace(/, Colombia$/, '').trim());
    addressData = { addresses };
  }

  const { addresses } = addressData;
  if (!addresses.length) throw new Error('Sin direcciones válidas.');

  document.getElementById('geocodeProgress').classList.remove('hidden');
  document.getElementById('geocodeStatus').classList.remove('hidden');
  document.getElementById('geocodeStatus').innerHTML = '<span class="tag-valid">🔄 Geocodificando ' + addresses.length + ' direcciones...</span>';

  const features = [], errors = [];
  const BATCH = 8, DELAY = 400;

  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(a => {
      const dept = a.columns.departamento ? a.raw[a.columns.departamento.name] : '';
      const city = a.columns.ciudad ? a.raw[a.columns.ciudad.name] : '';
      return geocodeSingle(a.address, dept, city);
    }));
    results.forEach((r, bi) => {
      const a = batch[bi];
      if (r.status === 'fulfilled' && r.value) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.value.lon, r.value.lat] }, properties: { ...a.raw, latitude: r.value.lat, longitude: r.value.lon, geocodedAddress: r.value.placeName } });
      } else {
        errors.push({ raw: a.raw, error: r.status === 'rejected' ? r.reason?.message : 'No encontrado' });
      }
    });
    const proc = Math.min(i + BATCH, addresses.length);
    document.getElementById('progressFill').style.width = Math.round(proc / addresses.length * 100) + '%';
    document.getElementById('progressText').textContent = `${proc} / ${addresses.length} (${Math.round(proc / addresses.length * 100)}%)`;
    if (i + BATCH < addresses.length) await new Promise(r => setTimeout(r, DELAY));
  }

  window._lastGeocoded = features;
  window._lastGeocodedErrors = errors;

  let statusHtml = '';
  if (features.length) statusHtml += `<span class="tag-valid">✅ ${features.length} geocodificadas</span> `;
  if (errors.length) statusHtml += `<span class="tag-invalid">❌ ${errors.length} fallidas</span>`;
  document.getElementById('geocodeStatus').innerHTML = statusHtml;

  const expBtn = document.getElementById('exportGeocodedBtn');
  if (expBtn && features.length) expBtn.classList.remove('hidden');

  return { type: 'FeatureCollection', features };
}

function exportGeocodedXlsx() {
  const f = window._lastGeocoded;
  if (!f?.length) return;
  const rows = f.map(g => ({ ...g.properties, latitude: g.geometry.coordinates[1], longitude: g.geometry.coordinates[0] }));
  (window._lastGeocodedErrors || []).forEach(e => rows.push({ ...e.raw, latitude: '', longitude: '', error: e.error }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Geocodificado');
  XLSX.writeFile(wb, 'direcciones_geocodificadas.xlsx');
}

/* ═══════════════════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════════════════ */

function fitToGeoJSON(g) {
  if (!g?.features?.length) return;
  const b = new mapboxgl.LngLatBounds();
  g.features.forEach(f => { if (f.geometry?.coordinates) b.extend(f.geometry.coordinates); });
  if (!b.isEmpty() && map) map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 800 });
}

function showError(msg) { const el = document.getElementById('errorMessage'); if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 8000); } }
function clearError() { const el = document.getElementById('errorMessage'); if (el) { el.textContent = ''; el.style.display = 'none'; } }
function showStats(v, inv) {
  const el = document.getElementById('validationStats');
  if (!el) return;
  document.getElementById('statTotal').textContent = v + inv;
  document.getElementById('statValid').textContent = v;
  document.getElementById('statInvalid').textContent = inv;
  el.classList.remove('hidden');
}
function showLegend(show) { const el = document.getElementById('mapLegend'); if (el && show) el.classList.remove('hidden'); }
function updateVizInfo() {
  const el = document.getElementById('vizInfoText');
  if (!el) return;
  const msgs = {
    hexagons: 'Los hexágonos dividen la ciudad uniformemente. Los más oscuros son candidatos ideales para ubicar paradas.',
    heatmap: 'Vista tradicional de puntos difuminados para visión general de densidad.',
    network: 'La demanda se proyecta sobre la red vial. Líneas rojas = mayor demanda de transporte.'
  };
  el.textContent = `${msgs[currentVizMode]} (${TIME_LABELS[currentTimeFilter]})`;
}

/* ═══════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════ */

document.getElementById('loadDefaultXls').addEventListener('click', loadDefaultXls);
document.getElementById('loadCsv').addEventListener('click', loadDefaultCsv);
document.getElementById('loadCustomFile').addEventListener('click', loadCustomFile);

document.getElementById('modeHexagons').addEventListener('click', () => { currentVizMode = 'hexagons'; document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active')); document.getElementById('modeHexagons').classList.add('active'); if (heatmapVisible) renderViz(lastValidData); });
document.getElementById('modeHeatmap').addEventListener('click', () => { currentVizMode = 'heatmap'; document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active')); document.getElementById('modeHeatmap').classList.add('active'); if (heatmapVisible) renderViz(lastValidData); });
document.getElementById('modeNetwork').addEventListener('click', () => { currentVizMode = 'network'; document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active')); document.getElementById('modeNetwork').classList.add('active'); if (heatmapVisible) renderViz(lastValidData); });

document.getElementById('timeMorning').addEventListener('click', () => { currentTimeFilter = 'morning'; document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active')); document.getElementById('timeMorning').classList.add('active'); if (heatmapVisible) renderViz(lastValidData); });
document.getElementById('timeNoon').addEventListener('click', () => { currentTimeFilter = 'noon'; document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active')); document.getElementById('timeNoon').classList.add('active'); if (heatmapVisible) renderViz(lastValidData); });
document.getElementById('timeNight').addEventListener('click', () => { currentTimeFilter = 'night'; document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active')); document.getElementById('timeNight').classList.add('active'); if (heatmapVisible) renderViz(lastValidData); });

document.getElementById('showSuggestedStops').addEventListener('change', () => {
  const show = document.getElementById('showSuggestedStops').checked;
  ['suggested-pulse', 'suggested-dot'].forEach(id => { if (map && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none'); });
});

document.getElementById('toggleTraffic').addEventListener('click', () => trafficVisible ? removeTraffic() : addTraffic());
document.getElementById('toggleFlow').addEventListener('click', () => flowVisible ? clearFlows() : addFlows());
document.getElementById('toggleRealPoints').addEventListener('click', () => realPointsVisible ? removeRealPoints() : addRealPoints());
document.getElementById('toggleBusRoute').addEventListener('click', () => busRouteVisible ? removeBusRoute() : addBusRoute());
document.getElementById('showStopProbability').addEventListener('change', () => {
  showProbability = document.getElementById('showStopProbability').checked;
  if (map && map.getLayer('bus-dot')) map.setPaintProperty('bus-dot', 'circle-color', showProbability ? ['get', 'probColor'] : '#16a34a');
});

// Geocoding
document.getElementById('geocodeBtn').addEventListener('click', async () => {
  const q = document.getElementById('geocodeInput').value;
  if (!q) return;
  const btn = document.getElementById('geocodeBtn');
  btn.textContent = 'Buscando...'; btn.disabled = true;
  try {
    const r = await geocodeSingle(q, '', '');
    if (r) {
      pendingGeocode = r;
      const inside = isInsideColombia(r.lon, r.lat);
      document.getElementById('geocodeCoords').innerHTML = `<strong>${r.placeName}</strong><br>Lat: ${r.lat.toFixed(6)}, Lon: ${r.lon.toFixed(6)}<br>${inside ? '<span class="tag-valid">✅ Colombia</span>' : '<span class="tag-invalid">⚠️ Fuera</span>'}`;
      document.getElementById('geocodeResult').classList.remove('hidden');
    }
  } finally { btn.textContent = 'Buscar dirección'; btn.disabled = false; }
});
document.getElementById('geocodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('geocodeBtn').click(); });
document.getElementById('geocodeAddToMap').addEventListener('click', () => {
  if (!pendingGeocode || !map) return;
  new mapboxgl.Marker({ color: isInsideColombia(pendingGeocode.lon, pendingGeocode.lat) ? '#10b981' : '#ef4444' })
    .setLngLat([pendingGeocode.lon, pendingGeocode.lat])
    .setPopup(new mapboxgl.Popup().setHTML(`<strong>${pendingGeocode.placeName}</strong>`))
    .addTo(map);
  map.flyTo({ center: [pendingGeocode.lon, pendingGeocode.lat], zoom: 15 });
});

document.getElementById('batchGeocodeBtn').addEventListener('click', async () => {
  const file = document.getElementById('addressFileInput').files[0];
  if (!file) { showError('Selecciona un archivo.'); return; }
  const btn = document.getElementById('batchGeocodeBtn');
  btn.textContent = 'Geocodificando...'; btn.disabled = true;
  try {
    const geojson = await batchGeocode(file);
    if (geojson.features.length) {
      const valid = processData(geojson);
      await ensureMap();
      renderViz(valid);
      fitToGeoJSON(valid);
      clearError();
    }
  } catch (e) { showError(e.message); }
  finally { btn.textContent = 'Geocodificar archivo'; btn.disabled = false; }
});

document.getElementById('exportGeocodedBtn')?.addEventListener('click', exportGeocodedXlsx);
document.getElementById('exportXlsxBtn')?.addEventListener('click', exportGeocodedXlsx);
document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
  const f = window._lastGeocoded;
  if (!f?.length) return;
  const rows = f.map(g => ({ ...g.properties, latitude: g.geometry.coordinates[1], longitude: g.geometry.coordinates[0] }));
  const h = Object.keys(rows[0]);
  const csv = [h.join(','), ...rows.map(r => h.map(k => '"' + String(r[k] ?? '').replace(/"/g, '""') + '"').join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'direcciones_geocodificadas.csv'; a.click();
});
