// Сборка файла js/data.js из текущих данных (для кнопки «Скачать data.js»).
// Работает и в браузере (глобальный MapDataFile), и в Node (для тестов).
(function (root) {
  'use strict';

  var HEADER = [
    '// ДАННЫЕ КАРТЫ — этот файл можно править вручную или в редакторе на сайте:',
    '// откройте index.html?edit, правьте точки и нажмите «Скачать data.js».',
    '//',
    '// Координаты — пиксели [x, y] в системе 2000×1714: x слева направо, y сверху вниз',
    '// (картинка карты может быть крупнее — координаты от этого не меняются).',
    '//',
    '// Точка:  { name: "Название", coords: [x, y], description: "Краткое описание" }',
    '// Пустое description — на сайте будет «Описание скоро появится».',
    '// Перенос строки в описании — \\n.',
    '//',
    '// outline — контур зоны (список вершин [x, y]). Можно задать контур с вырезом:',
    '// outline: [[...внешний контур...], [...вырез...]]',
    '// Зона из нескольких островов: outline: [[[...остров 1...]], [[...остров 2...]]]',
  ];

  var str = JSON.stringify;

  function coords(arr) {
    return JSON.stringify(arr).replace(/,/g, ', ');
  }

  function serializeZones(zones) {
    var out = HEADER.slice();
    out.push('', 'const ZONES = [');
    zones.forEach(function (z) {
      out.push('  {');
      out.push('    id: ' + str(z.id) + ',');
      out.push('    name: ' + str(z.name) + ',');
      out.push('    color: ' + str(z.color) + ',');
      out.push('    outline: ' + coords(z.outline) + ',');
      out.push('    points: [');
      (z.points || []).forEach(function (p) {
        out.push('      { name: ' + str(p.name) + ', coords: ' + coords(p.coords) +
          ', description: ' + str(p.description || '') + ' },');
      });
      out.push('    ],');
      out.push('  },');
    });
    out.push('];', '', "if (typeof module !== 'undefined' && module.exports) module.exports = ZONES;", '');
    return out.join('\n');
  }

  var api = { serializeZones: serializeZones };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapDataFile = api;
})(this);
