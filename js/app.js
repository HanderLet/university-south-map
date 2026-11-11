// Карта, зоны, точки и нижняя лента.
(function () {
  'use strict';

  var G = window.MapGeo;
  var bounds = L.latLngBounds([[0, 0], [G.IMG_H, G.IMG_W]]);
  // Общий вид — вся суша (на картинке вокруг много пустого моря)
  var overview = L.latLngBounds([G.toLatLng([180, 220]), G.toLatLng([1780, 1340])]);

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

  var App = (window.App = {
    map: map,
    mapLayer: mapLayer,
    bounds: bounds,
    overview: overview,
    zones: checked.zones,
    state: { activeZoneId: null },
  });

  App.refit = function () {
    map.invalidateSize();
    // getBoundsZoom ограничен текущим minZoom — сначала снимаем ограничение
    map.options.minZoom = -5;
    var z = map.getBoundsZoom(bounds);
    map.setMinZoom(z);
    if (!App.state.activeZoneId) map.fitBounds(overview, { animate: false, padding: [12, 12] });
  };

  App.refit();
  window.addEventListener('resize', App.refit);
})();
