const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { serializeZones } = require('../js/datafile.js');

const sample = [
  {
    id: 'state', name: 'Основной Штат', color: '#36c5f4',
    outline: [[0, 0], [10, 0], [10, 10]],
    points: [
      { name: 'Мэрия "главная"', coords: [5, 3], description: 'Строка 1\nСтрока 2 \\ слэш' },
      { name: 'Банк', coords: [6, 4], description: '' },
    ],
  },
  { id: 'race', name: 'Трасса', color: '#6a2c91', outline: [[[0, 0], [9, 0], [9, 9]], [[2, 2], [3, 2], [3, 3]]], points: [] },
];

function load(src) {
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return JSON.parse(JSON.stringify(ctx.module.exports)); // убрать прототипы чужого vm-контекста
}

test('serialized file evaluates back to the same zones', () => {
  assert.deepEqual(load(serializeZones(sample)), sample);
});

test('serialized file declares const ZONES for the browser', () => {
  const src = serializeZones(sample);
  assert.match(src, /^const ZONES = \[$/m);
  assert.match(src, /ДАННЫЕ КАРТЫ/);
});

test('one point per line so the file stays easy to edit by hand', () => {
  const src = serializeZones(sample);
  assert.match(src, /^ {6}\{ name: "Банк", coords: \[6, 4\], description: "" \},$/m);
});

test('extra runtime fields are not written', () => {
  const z = [{ ...sample[1], points: [{ name: 'A', coords: [1, 2], description: 'x', _tmp: 1 }], extra: true }];
  const back = load(serializeZones(z));
  assert.deepEqual(Object.keys(back[0]).sort(), ['color', 'id', 'name', 'outline', 'points']);
  assert.deepEqual(Object.keys(back[0].points[0]).sort(), ['coords', 'description', 'name']);
});

test('missing description is written as empty string', () => {
  const z = [{ ...sample[1], points: [{ name: 'A', coords: [1, 2] }] }];
  assert.equal(load(serializeZones(z))[0].points[0].description, '');
});
