// Редактор точек: index.html?edit
// - клик по карте показывает и копирует координаты [x, y];
// - в выбранной зоне точки можно перетаскивать, править название и описание, удалять;
// - клик по карте внутри выбранной зоны предлагает добавить туда точку;
// - «Скачать data.js» сохраняет готовый файл, которым заменяют js/data.js.
(function () {
  'use strict';

  if (!new URLSearchParams(window.location.search).has('edit')) return;

  var App = window.App;
  var G = window.MapGeo;
  var panel = document.getElementById('editor-panel');
  var dirty = 0;
  var lastClick = null; // [x, y] последнего клика по карте

  App.editMode = true;
  document.body.classList.add('edit-mode');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function stopMapEvents(node) {
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
    // не даём стрелкам и +/- в полях ввода двигать карту
    L.DomEvent.on(node, 'keydown keyup keypress', L.DomEvent.stopPropagation);
  }

  // ---------- Панель ----------

  panel.hidden = false;
  stopMapEvents(panel);
  panel.appendChild(el('div', 'ed-title', 'Режим редактора'));
  panel.appendChild(el('div', 'ed-hint',
    'Выберите зону в ленте внизу. Кликните по точке, чтобы изменить её или перетащить. ' +
    'Клик по карте показывает координаты [x, y].'));
  var coordsLine = el('div', 'ed-coords', '—');
  var status = el('div', 'ed-status', '');
  var addBtn = el('button', 'ed-btn', '');
  addBtn.type = 'button';
  addBtn.hidden = true;
  var changes = el('div', 'ed-changes', 'Изменений нет');
  var download = el('button', 'ed-btn ed-primary', 'Скачать data.js');
  download.type = 'button';
  var warnList = el('ul', 'ed-warn');
  [coordsLine, status, addBtn, changes, download, warnList].forEach(function (n) { panel.appendChild(n); });

  function markDirty() {
    dirty++;
    changes.textContent = 'Есть несохранённые изменения — не забудьте скачать data.js';
    changes.classList.add('has-changes');
    refreshWarnings();
  }

  function refreshWarnings() {
    warnList.textContent = '';
    G.findStrayPoints(App.zones).forEach(function (msg) {
      console.warn('[editor] ' + msg);
      warnList.appendChild(el('li', null, msg));
    });
  }
  refreshWarnings();

  download.addEventListener('click', function () {
    var text = window.MapDataFile.serializeZones(App.zones);
    var blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    dirty = 0;
    changes.textContent = 'Скачано. Замените этим файлом js/data.js';
    changes.classList.remove('has-changes');
  });

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- Клик по карте: координаты и добавление точки ----------

  var pin = null;

  function activeZone() {
    return App.state.activeZoneId ? App.zoneById(App.state.activeZoneId) : null;
  }

  App.map.on('click', function (e) {
    var p = G.toPixel(e.latlng);
    lastClick = p;
    var text = '[' + p[0] + ', ' + p[1] + ']';
    coordsLine.textContent = text;

    if (pin) pin.setLatLng(e.latlng);
    else pin = L.circleMarker(e.latlng, { radius: 5, color: '#fff', weight: 2, fillColor: '#ff3b6b', fillOpacity: 1, interactive: false }).addTo(App.map);

    var zone = activeZone();
    if (zone) {
      addBtn.hidden = false;
      addBtn.textContent = '+ Добавить точку сюда (' + zone.name + ')';
    } else {
      addBtn.hidden = true;
    }

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

  addBtn.addEventListener('click', function () {
    var zone = activeZone();
    if (!zone || !lastClick) return;
    zone.points.push({ name: 'Новая точка', coords: lastClick.slice(), description: '' });
    markDirty();
    addBtn.hidden = true;
    var index = zone.points.length - 1;
    App.selectZone(zone.id, { fly: false });
    App.state.markers[index].openPopup();
  });

  // ---------- Точки выбранной зоны ----------

  function editForm(zone, point, marker) {
    var form = el('div', 'popup ed-form');
    stopMapEvents(form);

    var nameLabel = el('label', null, 'Название');
    var name = el('input');
    name.type = 'text';
    name.value = point.name;
    nameLabel.appendChild(name);

    var descLabel = el('label', null, 'Описание');
    var desc = el('textarea');
    desc.rows = 5;
    desc.value = point.description || '';
    desc.placeholder = 'Краткое описание точки';
    descLabel.appendChild(desc);

    var where = el('div', 'ed-where', '[' + point.coords[0] + ', ' + point.coords[1] + '] — точку можно перетащить');
    var del = el('button', 'ed-btn ed-danger', 'Удалить точку');
    del.type = 'button';

    name.addEventListener('input', function () {
      point.name = name.value;
      marker.options.title = point.name;
      markDirty();
    });
    name.addEventListener('change', function () {
      if (!name.value.trim()) {
        point.name = 'Без названия';
        name.value = point.name;
      }
      App.renderPointStrip(zone);
    });
    desc.addEventListener('input', function () {
      point.description = desc.value;
      markDirty();
    });
    del.addEventListener('click', function () {
      if (!window.confirm('Удалить точку «' + point.name + '»?')) return;
      zone.points.splice(zone.points.indexOf(point), 1);
      markDirty();
      App.selectZone(zone.id, { fly: false });
    });

    form.appendChild(nameLabel);
    form.appendChild(descLabel);
    form.appendChild(where);
    form.appendChild(del);
    form.updateWhere = function () {
      where.textContent = '[' + point.coords[0] + ', ' + point.coords[1] + '] — точку можно перетащить';
    };
    return form;
  }

  App.onZoneShown = function (zone) {
    App.state.markers.forEach(function (marker) {
      var point = zone.points[marker.pointIndex];
      var form = editForm(zone, point, marker);
      marker.setPopupContent(form);
      if (marker.dragging) marker.dragging.enable();
      marker.on('dragend', function () {
        point.coords = G.toPixel(marker.getLatLng());
        form.updateWhere();
        coordsLine.textContent = '[' + point.coords[0] + ', ' + point.coords[1] + ']';
        markDirty();
      });
    });
  };
})();
