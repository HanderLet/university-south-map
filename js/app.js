// Карта, зоны, точки и нижняя лента.
(function () {
  'use strict';

  var G = window.MapGeo;
  var bounds = L.latLngBounds([[0, 0], [G.IMG_H, G.IMG_W]]);
  // Общий вид — охват всех зон (считается ниже, после построения контуров)
  var overview = null;

  // Защита от двойного клика: после смены ленты (зоны <-> точки) второй клик
  // попадает в новую карточку на том же месте — игнорируем клики по ленте это время.
  var STRIP_GUARD_MS = 500;
  var STYLE_IDLE = { opacity: 0, fillOpacity: 0, weight: 2 };

  var checked = G.validateZones(typeof ZONES !== 'undefined' ? ZONES : []);
  checked.warnings.forEach(function (w) { console.warn('[data.js] ' + w); });

  var map = L.map('map', {
    crs: L.CRS.Simple,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    // Карта 2000 единиц шириной; на зуме 3.25 она ≈ 19000 px на экране —
    // столько же, сколько у примера UniverTutor (3303 px × 2^2.5).
    maxZoom: 3.25,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    attributionControl: false,
    bounceAtZoomLimits: false,
  });

  var mapLayer = L.imageOverlay('img/map-day.png', bounds, { interactive: false }).addTo(map);
  mapLayer.on('error', function () {
    document.getElementById('map-error').hidden = false;
  });
  mapLayer.on('load', function () {
    document.getElementById('map-error').hidden = true;
  });

  var strip = document.getElementById('strip');
  var markers = L.layerGroup().addTo(map);

  var App = (window.App = {
    map: map,
    mapLayer: mapLayer,
    mapImage: 'img/map-day.png',
    bounds: bounds,
    overview: overview,
    zones: checked.zones,
    zoneLayers: {},
    state: { activeZoneId: null, stripSwappedAt: 0, markers: [] },
  });

  function zoneById(id) {
    for (var i = 0; i < App.zones.length; i++) if (App.zones[i].id === id) return App.zones[i];
    return null;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Как flyToBounds, но конечный вид сразу внутри границ карты. Иначе у зон
  // на краю карты (Заштатье, Богатый район) после полёта срабатывает
  // maxBounds и карта резко «отдёргивается» назад.
  function flyInside(target, padding, maxZoom) {
    var z = map.getBoundsZoom(target, false, L.point(padding, padding).multiplyBy(2));
    if (maxZoom != null) z = Math.min(z, maxZoom);
    var size = map.getSize();
    var c = map.project(target.getCenter(), z);
    var lo = map.project(bounds.getNorthWest(), z);
    var hi = map.project(bounds.getSouthEast(), z);
    var p = G.clampCenter([c.x, c.y], [size.x / 2, size.y / 2], [lo.x, lo.y], [hi.x, hi.y]);
    map.flyTo(map.unproject(L.point(p[0], p[1]), z), z, { duration: 1 });
  }

  function setZonesClickable(on) {
    Object.keys(App.zoneLayers).forEach(function (id) {
      var node = App.zoneLayers[id].getElement();
      if (node) node.style.pointerEvents = on ? '' : 'none';
    });
  }

  // ---------- Контуры зон ----------

  App.zones.forEach(function (zone) {
    var parts = G.normalizeParts(zone.outline).map(function (rings) {
      return rings.map(function (r) { return r.map(G.toLatLng); });
    });
    var layer = L.polygon(parts, Object.assign({
      color: zone.color,
      fillColor: zone.color,
      className: 'zone-outline zone-' + zone.id,
    }, STYLE_IDLE)).addTo(map);

    layer.bindTooltip(zone.name, { sticky: true, className: 'zone-tip', direction: 'top', offset: [0, -8] });
    layer.on('mouseover', function () {
      if (App.state.activeZoneId) return;
      layer.setStyle({ opacity: 1, weight: 2, fillOpacity: 0.05 });
    });
    layer.on('mouseout', function () {
      if (App.state.activeZoneId) return;
      layer.setStyle(STYLE_IDLE);
    });
    layer.on('click', function () {
      // в режиме редактора клик по карте только показывает координаты
      if (App.state.activeZoneId || App.editMode) return;
      App.selectZone(zone.id);
    });
    App.zoneLayers[zone.id] = layer;
    overview = overview ? overview.extend(layer.getBounds()) : L.latLngBounds(layer.getBounds().getSouthWest(), layer.getBounds().getNorthEast());
  });
  // Общий вид — все зоны с небольшим запасом (без зон — вся картинка)
  App.overview = overview = overview ? overview.pad(0.02) : bounds;

  // ---------- Всплывающее окно точки ----------

  function popupContent(zone, point) {
    var box = el('div', 'popup');
    var h = el('h3', null, point.name);
    h.style.color = G.readableOnDark(zone.color);
    box.appendChild(h);
    var text = typeof point.description === 'string' ? point.description.trim() : '';
    box.appendChild(el('p', text ? 'desc' : 'desc empty', text || 'Описание скоро появится'));
    return box;
  }

  function popupOptions() {
    // white-space: pre-line в описании мешает Leaflet измерить текст, поэтому задаём ширину явно
    var max = Math.min(300, window.innerWidth - 32);
    return { maxWidth: max, minWidth: Math.min(240, max), offset: [0, -6], autoPanPadding: [16, 16] };
  }

  // ---------- Лента ----------

  function renderZoneStrip() {
    strip.textContent = '';
    var track = el('div', 'strip-track');
    App.zones.forEach(function (zone) {
      var card = el('button', 'card zone-card');
      card.type = 'button';
      card.style.setProperty('--c', zone.color);
      card.appendChild(el('span', 'swatch'));
      card.appendChild(el('span', 'card-title', zone.name));
      var n = zone.points.length;
      card.appendChild(el('span', 'card-sub', n ? n + ' ' + plural(n, 'точка', 'точки', 'точек') : 'Точек пока нет'));
      card.addEventListener('click', function () {
        if (stripGuarded()) return;
        App.selectZone(zone.id);
      });
      card.addEventListener('mouseenter', function () { if (!App.state.activeZoneId) App.zoneLayers[zone.id].setStyle({ opacity: 1, weight: 2, fillOpacity: 0.05 }); });
      card.addEventListener('mouseleave', function () { if (!App.state.activeZoneId) App.zoneLayers[zone.id].setStyle(STYLE_IDLE); });
      track.appendChild(card);
    });
    strip.appendChild(track);
  }

  function renderPointStrip(zone) {
    strip.textContent = '';
    var track = el('div', 'strip-track');
    var back = el('button', 'card back-card', '← Все зоны');
    back.type = 'button';
    back.addEventListener('click', function () {
      if (stripGuarded()) return;
      App.showAllZones();
    });
    track.appendChild(back);

    if (!zone.points.length) {
      track.appendChild(el('div', 'strip-empty', 'Точек пока нет'));
    }
    zone.points.forEach(function (point, i) {
      var card = el('button', 'card point-card');
      card.type = 'button';
      card.style.setProperty('--c', zone.color);
      card.appendChild(el('span', 'dot'));
      card.appendChild(el('span', 'card-title', point.name));
      card.addEventListener('click', function () { App.focusPoint(zone.id, i); });
      track.appendChild(card);
    });
    strip.appendChild(track);
  }

  function stripGuarded() {
    return Date.now() - App.state.stripSwappedAt < STRIP_GUARD_MS;
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Состояния ----------

  function clearActive() {
    map.closePopup();
    markers.clearLayers();
    App.state.markers = [];
    Object.keys(App.zoneLayers).forEach(function (id) { App.zoneLayers[id].setStyle(STYLE_IDLE); });
  }

  // opts.fly === false — перерисовать зону без перелёта карты (нужно редактору)
  App.selectZone = function (id, opts) {
    opts = opts || {};
    var zone = zoneById(id);
    if (!zone) return;
    var wasActive = App.state.activeZoneId === id;
    clearActive();
    App.state.activeZoneId = id;
    if (!wasActive) App.state.stripSwappedAt = Date.now();

    var layer = App.zoneLayers[id];
    layer.closeTooltip();
    layer.setStyle({ color: zone.color, weight: 3, opacity: 1, fillColor: zone.color, fillOpacity: 0.15 });
    setZonesClickable(false);

    zone.points.forEach(function (point, i) {
      var icon = L.divIcon({
        className: 'zone-marker',
        html: '<span style="--c:' + zone.color + '"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      var m = L.marker(G.toLatLng(point.coords), { icon: icon, title: point.name, riseOnHover: true })
        .bindPopup(popupContent(zone, point), popupOptions());
      m.pointIndex = i;
      markers.addLayer(m);
      App.state.markers.push(m);
    });

    renderPointStrip(zone);
    if (opts.fly !== false) flyInside(layer.getBounds(), 24, 1);
    if (App.onZoneShown) App.onZoneShown(zone);
  };

  App.zoneById = zoneById;
  App.renderPointStrip = renderPointStrip;
  App.renderZoneStrip = renderZoneStrip;

  App.showAllZones = function () {
    clearActive();
    App.state.activeZoneId = null;
    App.state.stripSwappedAt = Date.now();
    setZonesClickable(true);
    renderZoneStrip();
    flyInside(overview, 12);
  };

  App.focusPoint = function (zoneId, index) {
    if (App.state.activeZoneId !== zoneId) App.selectZone(zoneId);
    var m = App.state.markers[index];
    if (!m) return;
    map.stop();
    map.setView(m.getLatLng(), Math.min(map.getMaxZoom(), map.getZoom() + 1), { animate: true });
    setTimeout(function () { m.openPopup(); }, 400);
  };

  App.refit = function () {
    map.invalidateSize();
    // getBoundsZoom ограничен текущим minZoom — сначала снимаем ограничение
    map.options.minZoom = -5;
    var z = map.getBoundsZoom(bounds);
    map.setMinZoom(z);
    if (!App.state.activeZoneId) map.fitBounds(overview, { animate: false, padding: [12, 12] });
  };

  App.refit();
  renderZoneStrip();
  window.addEventListener('resize', App.refit);
})();
