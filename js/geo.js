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

  // Контур зоны -> список колец (первое — внешнее, остальные — вырезы) или null
  function normalizeRings(outline) {
    if (isRing(outline)) return [outline];
    if (Array.isArray(outline) && outline.length > 0 && outline.every(isRing)) return outline;
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
    var rings = normalizeRings(outline);
    if (!rings || !pointInRing(p, rings[0])) return false;
    for (var i = 1; i < rings.length; i++) {
      if (pointInRing(p, rings[i])) return false;
    }
    return true;
  }

  // Отбрасывает некорректные зоны и точки, собирает предупреждения
  function validateZones(zones) {
    var warnings = [];
    var valid = [];
    (Array.isArray(zones) ? zones : []).forEach(function (z, zi) {
      if (!z || typeof z.id !== 'string' || typeof z.name !== 'string' || !normalizeRings(z.outline)) {
        warnings.push('Зона #' + (zi + 1) + ' (' + (z && z.name) + ') пропущена: нет id, name или корректного outline');
        return;
      }
      var points = [];
      (Array.isArray(z.points) ? z.points : []).forEach(function (pt, pi) {
        if (!pt || typeof pt.name !== 'string' || !pt.name || !isPair(pt.coords)) {
          warnings.push('Зона «' + z.name + '»: точка #' + (pi + 1) + ' пропущена: нет name или coords не [x, y]');
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
        if (!pointInZone(pt.coords, z.outline)) {
          out.push('Зона «' + z.name + '»: точка «' + pt.name + '» вне контура');
        }
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
    normalizeRings: normalizeRings,
    pointInZone: pointInZone,
    validateZones: validateZones,
    findStrayPoints: findStrayPoints,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapGeo = api;
})(this);
