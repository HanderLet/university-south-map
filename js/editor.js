// Режим редактора: index.html?edit — клик по карте показывает и копирует [x, y].
(function () {
  'use strict';

  if (!new URLSearchParams(window.location.search).has('edit')) return;

  var App = window.App;
  var G = window.MapGeo;
  var panel = document.getElementById('editor-panel');
  App.editMode = true;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  panel.hidden = false;
  panel.appendChild(el('div', 'ed-title', 'Режим редактора'));
  panel.appendChild(el('div', 'ed-hint', 'Кликните по карте — координаты [x, y] скопируются. Зоны выбираются через ленту внизу.'));
  var coordsLine = el('div', 'ed-coords', '—');
  var status = el('div', 'ed-status', '');
  panel.appendChild(coordsLine);
  panel.appendChild(status);

  var stray = G.findStrayPoints(App.zones);
  if (stray.length) {
    var list = el('ul', 'ed-warn');
    stray.forEach(function (msg) {
      console.warn('[editor] ' + msg);
      list.appendChild(el('li', null, msg));
    });
    panel.appendChild(list);
  }

  var pin = null;

  App.map.on('click', function (e) {
    var p = G.toPixel(e.latlng);
    var text = '[' + p[0] + ', ' + p[1] + ']';
    coordsLine.textContent = text;

    if (pin) pin.setLatLng(e.latlng);
    else pin = L.circleMarker(e.latlng, { radius: 5, color: '#fff', weight: 2, fillColor: '#ff3b6b', fillOpacity: 1, interactive: false }).addTo(App.map);

    var manual = function () { status.textContent = 'Скопируйте вручную'; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { status.textContent = 'Скопировано'; }, manual);
      } else {
        manual();
      }
    } catch (err) {
      manual();
    }
  });
})();
