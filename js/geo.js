// Геометрия карты: перевод координат и проверка точек в зонах.
// Работает и в браузере (глобальный MapGeo), и в Node (для тестов).
(function (root) {
  'use strict';

  var IMG_W = 2000;
  var IMG_H = 1714;

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function isPair(p) {
    return Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
  }

  function isRing(r) {
    return Array.isArray(r) && r.length >= 3 && r.every(isPair);
  }

  // [x, y] в пикселях картинки -> [lat, lng] для L.CRS.Simple
  function toLatLng(p) {
    return [IMG_H - p[1], p[0]];
  }

  // {lat, lng} -> [x, y] в целых пикселях картинки
  function toPixel(ll) {
    return [Math.round(ll.lng), Math.round(IMG_H - ll.lat)];
  }

  function isPolygon(rings) {
    return Array.isArray(rings) && rings.length > 0 && rings.every(isRing);
  }

  // Контур зоны -> список частей (островов); часть — список колец:
  // первое — внешнее, остальные — вырезы. Некорректный контур -> null.
  //   [[x, y], ...]                      один остров
  //   [[...внешний...], [...вырез...]]   остров с вырезом
  //   [[[...остров 1...]], [[...остров 2...]]]   несколько островов
  function normalizeParts(outline) {
    if (isRing(outline)) return [[outline]];
    if (isPolygon(outline)) return [outline];
    if (Array.isArray(outline) && outline.length > 0 && outline.every(isPolygon)) return outline;
    return null;
  }

  // Места точки: coords — [x, y] или список мест [[x, y], [x, y], ...]
  // (одна точка в нескольких местах карты). Некорректные coords -> null.
  function pointPlaces(point) {
    var c = point && point.coords;
    if (isPair(c)) return [c];
    if (Array.isArray(c) && c.length > 0 && c.every(isPair)) return c;
    return null;
  }

  function pointInRing(p, ring) {
    var x = p[0], y = p[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function pointInZone(p, outline) {
    var parts = normalizeParts(outline);
    if (!parts) return false;
    return parts.some(function (rings) {
      if (!pointInRing(p, rings[0])) return false;
      for (var i = 1; i < rings.length; i++) {
        if (pointInRing(p, rings[i])) return false;
      }
      return true;
    });
  }

  // Центр вида, при котором окно half=[w/2, h/2] не выходит за min..max
  // (все величины — в одних и тех же пикселях). Если окно больше области —
  // центр области. Leaflet делает это сам для setView, но не для flyTo.
  function clampCenter(center, half, min, max) {
    return [0, 1].map(function (i) {
      var lo = min[i] + half[i], hi = max[i] - half[i];
      if (lo > hi) return (min[i] + max[i]) / 2;
      return Math.min(Math.max(center[i], lo), hi);
    });
  }

  // Отбрасывает некорректные зоны и точки, собирает предупреждения
  function validateZones(zones) {
    var warnings = [];
    var valid = [];
    (Array.isArray(zones) ? zones : []).forEach(function (z, zi) {
      if (!z || typeof z.id !== 'string' || typeof z.name !== 'string' || !normalizeParts(z.outline)) {
        warnings.push('Зона #' + (zi + 1) + ' (' + (z && z.name) + ') пропущена: нет id, name или корректного outline');
        return;
      }
      var points = [];
      (Array.isArray(z.points) ? z.points : []).forEach(function (pt, pi) {
        if (!pt || typeof pt.name !== 'string' || !pt.name || !pointPlaces(pt)) {
          warnings.push('Зона «' + z.name + '»: точка #' + (pi + 1) + ' пропущена: нет name или coords не [x, y] / [[x, y], ...]');
          return;
        }
        points.push(pt);
      });
      var copy = {};
      for (var k in z) copy[k] = z[k];
      copy.points = points;
      valid.push(copy);
    });
    return { zones: valid, warnings: warnings };
  }

  function findStrayPoints(zones) {
    var out = [];
    zones.forEach(function (z) {
      (z.points || []).forEach(function (pt) {
        var places = pointPlaces(pt) || [];
        places.forEach(function (c, i) {
          if (pointInZone(c, z.outline)) return;
          var where = places.length > 1 ? ' (место ' + (i + 1) + ')' : '';
          out.push('Зона «' + z.name + '»: точка «' + pt.name + '»' + where + ' вне контура');
        });
      });
    });
    return out;
  }

  // Цвет заголовка на тёмном фоне окна: цвет зоны, если он достаточно светлый
  // (контраст ≥ 3:1 с фоном #1f232c), иначе светлый текст.
  function readableOnDark(hex) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#e8eaf0';
    var n = parseInt(m[1], 16);
    var lin = function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    var lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return lum >= 0.15 ? hex : '#e8eaf0';
  }

  var api = {
    readableOnDark: readableOnDark,
    IMG_W: IMG_W,
    IMG_H: IMG_H,
    toLatLng: toLatLng,
    toPixel: toPixel,
    normalizeParts: normalizeParts,
    pointPlaces: pointPlaces,
    pointInZone: pointInZone,
    clampCenter: clampCenter,
    validateZones: validateZones,
    findStrayPoints: findStrayPoints,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapGeo = api;
})(this);
