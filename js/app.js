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
    updateCrisp();
  });

  // Карта — пиксель-арт. Когда пиксель картинки больше пикселя экрана,
  // рисуем его чётким квадратом (как на примере UniverTutor), а на общем
  // виде оставляем сглаживание — без него мелкие детали идут рябью.
  function updateCrisp() {
    var img = mapLayer.getElement();
    var natural = img && img.naturalWidth;
    if (!natural) return;
    var screenPx = Math.pow(2, map.getZoom()) * G.IMG_W; // ширина карты на экране
    map.getContainer().classList.toggle('crisp', screenPx >= natural);
  }
  map.on('zoomend', updateCrisp);

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
    // открыта памятка — цель в середине незакрытой ею части карты
    var c = map.project(target.getCenter(), z).add(noteOffset());
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

  // ---------- Памятка точки (панель справа, на телефоне — снизу) ----------

  var note = document.getElementById('note');
  var noteHead = el('div', 'note-head');
  var noteZone = el('span', 'note-zone');
  var noteClose = el('button', 'note-close', '×');
  noteClose.type = 'button';
  noteClose.setAttribute('aria-label', 'Закрыть памятку');
  var noteTitle = el('h2', 'note-title');
  var noteBody = el('div', 'note-body');
  noteHead.appendChild(noteZone);
  noteHead.appendChild(noteClose);
  note.appendChild(noteHead);
  note.appendChild(noteTitle);
  note.appendChild(noteBody);
  L.DomEvent.disableClickPropagation(note);
  L.DomEvent.disableScrollPropagation(note);
  noteClose.addEventListener('click', function () { App.closeNote(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !note.hidden) App.closeNote();
  });

  function markActivePoint(index) {
    // у точки в нескольких местах подсвечиваются все её маркеры
    App.state.markers.forEach(function (m) {
      var node = m.getElement();
      if (node) node.classList.toggle('is-active', m.pointIndex === index);
    });
    Array.prototype.forEach.call(strip.querySelectorAll('.point-card'), function (card) {
      card.classList.toggle('is-active', Number(card.dataset.index) === index);
    });
  }

  // Сдвиг центра карты, чтобы точка оказалась посередине видимой части,
  // а не под памяткой (справа — по ширине, на телефоне — по высоте)
  function noteOffset() {
    if (note.hidden) return L.point(0, 0);
    var r = note.getBoundingClientRect();
    var m = map.getContainer().getBoundingClientRect();
    if (r.width > m.width * 0.7) return L.point(0, Math.max(0, m.bottom - r.top) / 2);
    return L.point(Math.max(0, m.right - r.left) / 2, 0);
  }

  function centerBesideNote(latlng, zoom) {
    return map.unproject(map.project(latlng, zoom).add(noteOffset()), zoom);
  }

  // Видна ли точка на карте, не под памяткой
  function visibleBesideNote(latlng) {
    var p = map.latLngToContainerPoint(latlng);
    var off = noteOffset();
    var size = map.getSize();
    return p.x > 24 && p.y > 24 && p.x < size.x - 2 * off.x - 24 && p.y < size.y - 2 * off.y - 24;
  }

  // Показать все места точки сразу (в части карты, не закрытой памяткой)
  function fitBesideNote(latlngs, maxZoom) {
    var off = noteOffset();
    map.stop();
    map.fitBounds(L.latLngBounds(latlngs), {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48 + 2 * off.x, 48 + 2 * off.y],
      maxZoom: maxZoom,
      animate: true,
    });
  }

  function markersOf(index) {
    return App.state.markers.filter(function (m) { return m.pointIndex === index; });
  }
  App.markerFor = function (index) { return markersOf(index)[0] || null; };

  App.openNote = function (zoneId, index) {
    var zone = zoneById(zoneId);
    var point = zone && zone.points[index];
    if (!point) return;
    note.style.setProperty('--c', zone.color);
    var n = G.pointPlaces(point).length;
    noteZone.textContent = zone.name + (n > 1 ? ' · ' + n + ' ' + plural(n, 'место', 'места', 'мест') + ' на карте' : '');
    noteTitle.textContent = point.name;
    var text = typeof point.description === 'string' ? point.description.trim() : '';
    noteBody.textContent = text || 'Описание скоро появится';
    noteBody.classList.toggle('empty', !text);
    noteBody.scrollTop = 0;
    note.hidden = false;
    App.state.notePoint = index;
    markActivePoint(index);
  };

  // Памятка с описанием самой зоны (у зон без точек — Гоночная трасса, Алькатрас)
  App.openZoneNote = function (zoneId) {
    var zone = zoneById(zoneId);
    var text = zone && typeof zone.description === 'string' ? zone.description.trim() : '';
    if (!text) return;
    note.style.setProperty('--c', zone.color);
    noteZone.textContent = 'Зона';
    noteTitle.textContent = zone.name;
    noteBody.textContent = text;
    noteBody.classList.remove('empty');
    noteBody.scrollTop = 0;
    note.hidden = false;
    App.state.notePoint = null;
    markActivePoint(-1);
    var about = strip.querySelector('.about-card');
    if (about) about.classList.add('is-active');
  };

  App.closeNote = function () {
    note.hidden = true;
    App.state.notePoint = null;
    markActivePoint(-1);
  };

  function popupOptions() {
    // white-space: pre-line в тексте мешает Leaflet измерить его, поэтому задаём ширину явно
    var max = Math.min(300, window.innerWidth - 32);
    return { maxWidth: max, minWidth: Math.min(240, max), offset: [0, -6], autoPanPadding: [16, 16] };
  }
  App.popupOptions = popupOptions; // окна редактора (?edit)

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
      var sub = n ? n + ' ' + plural(n, 'точка', 'точки', 'точек') : (zone.description ? 'Описание зоны' : 'Точек пока нет');
      card.appendChild(el('span', 'card-sub', sub));
      card.addEventListener('click', function () {
        if (stripGuarded()) return;
        App.selectZone(zone.id);
      });
      card.addEventListener('mouseenter', function () { if (!App.state.activeZoneId) App.zoneLayers[zone.id].setStyle({ opacity: 1, weight: 2, fillOpacity: 0.05 }); });
      card.addEventListener('mouseleave', function () { if (!App.state.activeZoneId) App.zoneLayers[zone.id].setStyle(STYLE_IDLE); });
      track.appendChild(card);
    });
    strip.appendChild(track);
    updateStripEdges();
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

    if (zone.description) {
      // памятку зоны можно закрыть — эта карточка открывает её снова
      var about = el('button', 'card point-card about-card');
      about.type = 'button';
      about.style.setProperty('--c', zone.color);
      about.appendChild(el('span', 'about-icon', 'i'));
      about.appendChild(el('span', 'card-title', 'О зоне'));
      about.addEventListener('click', function () { App.openZoneNote(zone.id); });
      track.appendChild(about);
    } else if (!zone.points.length) {
      track.appendChild(el('div', 'strip-empty', 'Точек пока нет'));
    }
    zone.points.forEach(function (point, i) {
      var card = el('button', 'card point-card');
      card.type = 'button';
      card.dataset.index = i;
      if (App.state.notePoint === i) card.classList.add('is-active');
      card.style.setProperty('--c', zone.color);
      card.appendChild(el('span', 'dot'));
      card.appendChild(el('span', 'card-title', point.name));
      card.addEventListener('click', function () { App.focusPoint(zone.id, i); });
      track.appendChild(card);
    });
    strip.appendChild(track);
    updateStripEdges();
  }

  // Полосы прокрутки у ленты нет: длинный список крутится колёсиком мыши,
  // а затухание по краям подсказывает, что там есть ещё карточки
  function stripTrack() { return strip.querySelector('.strip-track'); }

  function updateStripEdges() {
    var t = stripTrack();
    if (!t) return;
    var max = t.scrollWidth - t.clientWidth;
    strip.classList.toggle('more-left', t.scrollLeft > 2);
    strip.classList.toggle('more-right', t.scrollLeft < max - 2);
  }

  strip.addEventListener('wheel', function (e) {
    var t = stripTrack();
    if (!t || t.scrollWidth <= t.clientWidth) return;
    var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!d) return;
    if (e.deltaMode === 1) d *= 32; // прокрутка строками
    else if (e.deltaMode === 2) d *= t.clientWidth; // страницами
    e.preventDefault();
    t.scrollLeft += d;
    updateStripEdges();
  }, { passive: false });
  strip.addEventListener('scroll', updateStripEdges, true);
  window.addEventListener('resize', updateStripEdges);

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
    App.closeNote();
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
      // маркер на каждое место точки (обычно одно)
      G.pointPlaces(point).forEach(function (place, k) {
        var icon = L.divIcon({
          className: 'zone-marker',
          html: '<span style="--c:' + zone.color + '"></span>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        var m = L.marker(G.toLatLng(place), { icon: icon, title: point.name, riseOnHover: true });
        m.on('click', function () {
          if (App.editMode) return; // в редакторе по клику открывается форма точки
          App.openNote(zone.id, i);
          var all = markersOf(i).map(function (x) { return x.getLatLng(); });
          if (all.length > 1) {
            // другое место точки за краем экрана или под памяткой — показываем оба
            if (!all.every(visibleBesideNote)) fitBesideNote(all, Math.max(map.getZoom(), 1));
          } else if (!visibleBesideNote(m.getLatLng())) {
            // точка оказалась под памяткой — сдвигаем карту
            map.panTo(centerBesideNote(m.getLatLng(), map.getZoom()));
          }
        });
        m.pointIndex = i;
        m.placeIndex = k;
        markers.addLayer(m);
        App.state.markers.push(m);
      });
    });

    renderPointStrip(zone);
    // у зоны без точек сразу показываем её описание
    if (!zone.points.length && !App.editMode) App.openZoneNote(zone.id);
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
    var ms = markersOf(index);
    var m = ms[0];
    if (!m) return;
    map.stop();
    var z = Math.min(map.getMaxZoom(), map.getZoom() + 1);
    if (App.editMode) {
      map.setView(m.getLatLng(), z, { animate: true });
      setTimeout(function () { m.openPopup(); }, 400);
      return;
    }
    App.openNote(zoneId, index);
    if (ms.length > 1) {
      fitBesideNote(ms.map(function (x) { return x.getLatLng(); }), z);
      return;
    }
    map.setView(centerBesideNote(m.getLatLng(), z), z, { animate: true });
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
