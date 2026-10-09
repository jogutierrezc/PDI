/* Esqueleto del módulo de rutas: HTML fijo escrito aquí, sin contenido de usuarios.
   Lo dinámico lo pinta motor.ts escapando cada texto que viene de la base. */
export const ESQUELETO = `<main class="app">
  <section class="stage" aria-label="Mapa de la ruta del bus UDES">
    <canvas id="map" tabindex="0" role="img" aria-label="Mapa de OpenStreetMap con la ruta del bus UDES, sus 19 paradas y el flujo de estudiantes. Use las flechas para mover el mapa y más o menos para acercar."></canvas>

    <div class="float layers" role="group" aria-label="Capas del mapa">
      <button class="chip" type="button" aria-pressed="true" data-layer="base"><i class="sw sw--road"></i>Mapa</button>
      <button class="chip" type="button" aria-pressed="true" data-layer="demanda"><i class="sw sw--cell"></i>Demanda</button>
      <button class="chip" type="button" aria-pressed="true" data-layer="flujos"><i class="sw sw--flow"></i>Flujos</button>
      <button class="chip" type="button" aria-pressed="false" data-layer="cobertura"><i class="sw sw--cov"></i>Cobertura</button>
      <button class="chip" type="button" aria-pressed="true" data-layer="paradas"><i class="sw sw--stop"></i>Paradas</button>
    </div>

    <div class="float tools">
      <button class="tool tool--follow" id="follow" type="button" aria-pressed="false" title="La cámara acompaña al bus 1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="3"/><path d="M4 12h16M8 20v-3M16 20v-3"/></svg>
        Seguir bus
      </button>
      <button class="tool" id="zin" type="button" aria-label="Acercar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      <button class="tool" id="zout" type="button" aria-label="Alejar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
      <button class="tool" id="fit" type="button" aria-label="Encuadrar la ruta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg></button>
    </div>

    <div class="float tip" id="tip" role="status"></div>
    <div class="float attrib">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a> · trazado vial calculado con OSRM</div>

    <div class="float clock">
      <button class="play" id="play" type="button" aria-label="Pausar la simulación"></button>
      <div class="time" id="clockTxt" aria-live="off">06:24<small id="clockSub">Hora pico de la mañana</small></div>
      <div class="chartwrap" id="chartWrap">
        <svg id="chart" viewBox="0 0 600 62" preserveAspectRatio="none" aria-hidden="true"></svg>
        <input id="tRange" type="range" min="300" max="1320" step="1" value="384" aria-label="Hora simulada del día">
      </div>
      <div class="speed" role="group" aria-label="Velocidad de la simulación">
        <button type="button" data-speed="10" aria-pressed="false">10×</button>
        <button type="button" data-speed="30" aria-pressed="true">30×</button>
        <button type="button" data-speed="120" aria-pressed="false">120×</button>
      </div>
    </div>
  </section>

  <aside class="dock" aria-label="Panel de la ruta">
    <header class="dock-head" id="dockHead">
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#f6b93f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h6" transform="translate(0 2) scale(1 .85)"/></svg>
      </div>
      <div><h1>Rutas UDES</h1><p>Bus institucional · módulo privado</p></div>
      <span class="badge" id="badge">Cargando…</span>
    </header>

    <nav class="tabs" role="tablist" aria-label="Secciones" id="tabs">
      <button class="tab" role="tab" id="t-ruta" aria-selected="true" aria-controls="p-ruta" data-tab="ruta">Ruta</button>
      <button class="tab" role="tab" id="t-flota" aria-selected="false" aria-controls="p-flota" data-tab="flota" tabindex="-1">Flota</button>
      <button class="tab" role="tab" id="t-demanda" aria-selected="false" aria-controls="p-demanda" data-tab="demanda" tabindex="-1">Demanda</button>
      <button class="tab" role="tab" id="t-nueva" aria-selected="false" aria-controls="p-nueva" data-tab="nueva" tabindex="-1">Nueva ruta</button>
      <button class="tab" role="tab" id="t-datos" aria-selected="false" aria-controls="p-datos" data-tab="datos" tabindex="-1">Datos</button>
      <span class="tab-ind" id="tabInd"></span>
    </nav>

    <div class="panels" id="panels">
      <!-- RUTA -->
      <section class="panel" id="p-ruta" role="tabpanel" aria-labelledby="t-ruta">
        <div class="board" id="board" aria-live="off"></div>
        <div>
          <h2 class="h2">Paradas</h2>
          <p class="muted small" style="margin:2px 0 10px">Abordajes esperados por hora, a la hora que marca el reloj.</p>
          <div class="linewrap" id="linewrap"><ol class="line" id="line"></ol></div>
        </div>
      </section>

      <!-- DEMANDA -->
      <!-- FLOTA -->
      <section class="panel" id="p-flota" role="tabpanel" aria-labelledby="t-flota" hidden>
        <div class="stats" id="fleetStats"></div>
        <div class="callout" id="fleetMsg" role="status"></div>
        <div class="field">
          <label for="fN">Buses <output id="fNOut">3</output></label>
          <input class="rng" id="fN" type="range" min="1" max="12" step="1" value="3">
        </div>
        <div class="field">
          <label for="fH">Sale un bus cada <output id="fHOut">15 min</output></label>
          <input class="rng" id="fH" type="range" min="3" max="60" step="1" value="15">
        </div>
        <div class="field">
          <label for="fT">Parada en la UDES <output id="fTOut">5 min</output></label>
          <input class="rng" id="fT" type="range" min="0" max="20" step="1" value="5">
          <p>El bus descansa ese tiempo al llegar y recién entonces puede volver a salir.</p>
        </div>
        <div class="field">
          <label for="fK">Un bus tarda más que un carro <output id="fKOut">15 %</output></label>
          <input class="rng" id="fK" type="range" min="0" max="80" step="1" value="15">
          <p>El tiempo parte de lo que el motor de rutas calcula para un carro. Ajústelo hasta que coincida con el recorrido real medido.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn--pri" id="saveFleet" type="button">Guardar en la ruta</button>
          <span class="muted small" id="fleetSave" role="status"></span>
        </div>
        <div>
          <h2 class="h2">Salidas del día</h2>
          <p class="muted small" style="margin:2px 0 10px">Cada bus que sale, cuánto se demora y a qué hora llega. El tiempo cambia con el tráfico simulado de esa hora.</p>
          <ol class="tt" id="timetable"></ol>
        </div>
      </section>

      <section class="panel" id="p-demanda" role="tabpanel" aria-labelledby="t-demanda" hidden>
        <div class="stats" id="stats"></div>
        <div class="field">
          <label for="rad">Distancia que caminarían <output id="radOut">400 m</output></label>
          <input class="rng" id="rad" type="range" min="200" max="800" step="50" value="400">
          <p>A esa distancia, la mitad de los estudiantes usaría la parada.</p>
        </div>
        <div class="field">
          <label for="prop">Estudiantes dispuestos a usar el bus <output id="propOut">34 %</output></label>
          <input class="rng" id="prop" type="range" min="10" max="70" step="1" value="34">
          <p>Un supuesto. Se calibra con el conteo real de abordajes.</p>
        </div>
        <div>
          <h2 class="h2">Paradas con más uso esperado</h2>
          <ul class="rank" id="rank" style="margin-top:10px"></ul>
        </div>
        <details>
          <summary>Cómo se calcula la probabilidad</summary>
          <div>
            <p style="margin:0">Para cada zona de origen y cada parada, la probabilidad de caminar hasta ella baja con la distancia:</p>
            <p style="margin:0"><span class="code">p(d) = 1 / (1 + e^((d − r) / 0,22·r))</span></p>
            <p style="margin:0">con <span class="code">r</span> la distancia elegida. De los estudiantes de la zona, solo la fracción dispuesta usa el bus, y se reparten entre las paradas según su <span class="code">p(d)</span>. La cobertura cuenta a quienes tienen una parada a <span class="code">r</span> metros o menos.</p>
            <p style="margin:0">La hora cambia el volumen con una curva de tres picos (mañana, mediodía y tarde). No incluye tiempos de espera ni competencia con otros medios.</p>
          </div>
        </details>
      </section>

      <!-- NUEVA RUTA -->
      <section class="panel" id="p-nueva" role="tabpanel" aria-labelledby="t-nueva" hidden>
        <div class="stats" id="gapStats"></div>
        <div>
          <h2 class="h2">Paradas candidatas</h2>
          <p class="muted small" style="margin:2px 0 10px">Los puntos de la red vial que más estudiantes sin cobertura alcanzarían, a menos de 1,2 km de la ruta actual.</p>
          <div id="cands" style="display:grid;gap:10px"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--pri" id="saveProp" type="button">Guardar propuesta</button>
          <button class="btn" id="resetExtras" type="button">Quitar las paradas añadidas</button>
        </div>
        <p class="muted small" id="saveMsg" role="status" style="margin:0"></p>
        <p class="muted small" style="margin:0">El desvío es una estimación en línea recta hasta la ruta; el trazado definitivo se calcula por carretera.</p>
      </section>

      <!-- DATOS -->
      <section class="panel" id="p-datos" role="tabpanel" aria-labelledby="t-datos" hidden>
        <div class="callout" id="dataState"></div>
        <div>
          <h2 class="h2" style="margin-bottom:10px">Tablas en Supabase</h2>
          <div class="tbl">
            <div><b>bus_routes</b><span>Ruta, color, número de buses y capacidad.</span></div>
            <div><b>bus_stops</b><span>Paradas en orden, con coordenadas y tiempo de parada.</span></div>
            <div><b>bus_route_geometry</b><span>Trazado por carretera, distancia y tiempo por tramo.</span></div>
            <div><b>bus_origin_cells</b><span>Estudiantes por celda y periodo. Mínimo 5 por celda.</span></div>
            <div><b>bus_ridership</b><span>Conteos reales de abordaje por parada y hora.</span></div>
            <div><b>bus_proposals</b><span>Rutas propuestas con su ganancia estimada.</span></div>
          </div>
        </div>
        <div>
          <h2 class="h2" style="margin-bottom:8px">Cómo se integra con Pilo</h2>
          <ul class="list">
            <li>Pilo lee una vista agregada (<span class="code">bus_resumen</span>), nunca las celdas ni las direcciones.</li>
            <li>Responde en el panel, con las mismas cifras que ve el mapa.</li>
            <li>Si una parada se desborda o el bus se retrasa, Pilo avisa por la capa de alertas.</li>
          </ul>
        </div>
        <div>
          <h2 class="h2" style="margin-bottom:8px">Tráfico en tiempo real</h2>
          <p class="muted small" style="margin:0">OpenStreetMap trae las calles, pero no el tráfico. Aquí la congestión es una simulación por franja horaria. Para tráfico vivo hace falta un proveedor (TomTom, HERE o Mapbox Traffic) como capa encima del mapa.</p>
        </div>
      </section>
    </div>

    <div class="pilo" id="pilo">
      <div class="pilo-top"><span class="pilo-dot" aria-hidden="true">P</span><strong>Pilo</strong><span>Responde con las cifras de este mapa</span></div>
      <div class="ans" id="ans" hidden aria-live="polite"></div>
      <div class="chips" id="qchips"></div>
      <form class="ask" id="askForm" autocomplete="off">
        <input id="askIn" type="text" placeholder="Pregunte sobre la ruta" aria-label="Pregunta para Pilo">
        <button class="btn btn--pri" type="submit">Preguntar</button>
      </form>
    </div>
  </aside>
</main>`;
