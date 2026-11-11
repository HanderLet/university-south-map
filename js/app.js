// Карта, зоны, точки и нижняя лента.
(function () {
  'use strict';

  var G = window.MapGeo;
  var bounds = L.latLngBounds([[0, 0], [G.IMG_H, G.IMG_W]]);
  // Общий вид — вся суша (на картинке вокруг много пустого моря)
  var overview = L.latLngBounds([G.toLatLng([180, 220]), G.toLatLng([1780, 1340])]);

  var BACK_GUARD_MS = 400; // защита от двойного клика по карточке зоны
  var STYLE_IDLE = { opacity: 0, fillOpacity: 0, weight: 2 };

  var checked = G.validateZones(typeof ZONES !== 'undefined' ? ZONES : []);
  checked.warnings.forEach(function (w) { console.warn('[data.js] ' + w); });

  var map = L.map('map', {
    crs: L.CRS.Simple,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    maxZoom: 1,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    attributionControl: false,
    bounceAtZoomLimits: false,
  });

  var mapLayer = L.imageOverlay('img/map-day.webp', bounds, { interactive: false }).addTo(map);
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
    bounds: bounds,
    overview: overview,
    zones: checked.zones,
    zoneLayers: {},
    state: { activeZoneId: null, selectedAt: 0, markers: [] },
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

  function setZonesClickable(on) {
    Object.keys(App.zoneLayers).forEach(function (id) {
      var node = App.zoneLayers[id].getElement();
      if (node) node.style.pointerEvents = on ? '' : 'none';
    });
  }

  // ---------- Контуры зон ----------

  App.zones.forEach(function (zone) {
    var rings = G.normalizeRings(zone.outline).map(function (r) { return r.map(G.toLatLng); });
    var layer = L.polygon(rings, Object.assign({
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
  });

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
    return { maxWidth: Math.min(300, window.innerWidth - 32), minWidth: 160, offset: [0, -6], autoPanPadding: [16, 16] };
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
      card.addEventListener('click', function () { App.selectZone(zone.id); });
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
      if (Date.now() - App.state.selectedAt < BACK_GUARD_MS) return;
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

  App.selectZone = function (id) {
    var zone = zoneById(id);
    if (!zone) return;
    clearActive();
    App.state.activeZoneId = id;
    App.state.selectedAt = Date.now();

    var layer = App.zoneLayers[id];
    layer.closeTooltip();
    layer.setStyle({ color: zone.color, weight: 3, opacity: 1, fillColor: zone.color, fillOpacity: 0.15 });
    setZonesClickable(false);

    zone.points.forEach(function (point) {
      var icon = L.divIcon({
        className: 'zone-marker',
        html: '<span style="--c:' + zone.color + '"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      var m = L.marker(G.toLatLng(point.coords), { icon: icon, title: point.name, riseOnHover: true })
        .bindPopup(popupContent(zone, point), popupOptions());
      markers.addLayer(m);
      App.state.markers.push(m);
    });

    renderPointStrip(zone);
    map.flyToBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 1, duration: 1 });
  };

  App.showAllZones = function () {
    clearActive();
    App.state.activeZoneId = null;
    setZonesClickable(true);
    renderZoneStrip();
    map.flyToBounds(overview, { padding: [12, 12], duration: 1 });
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
