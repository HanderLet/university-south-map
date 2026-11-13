const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/geo.js');
const ZONES = require('../js/data.js');

const IDS = ['state', 'farm', 'fbi', 'county', 'rich', 'race', 'outskirts', 'alcatraz'];
const COLORS = {
  state: '#36c5f4', farm: '#f26a21', fbi: '#222222', county: '#fdd12f',
  rich: '#7ac70c', race: '#6a2c91', outskirts: '#e3172d', alcatraz: '#8f9bb3',
};
// Центры закрашенных пятен на разметке заказчика
const ANCHORS = {
  state: [[1195, 565]],
  farm: [[890, 620]],
  fbi: [[1545, 535]],
  county: [[640, 590]],
  rich: [[1550, 820], [1560, 1150]],
  race: [[870, 320]],
  outskirts: [[430, 1000], [330, 600]],
  alcatraz: [[1065, 960]],
};
// море, островок в конце длинного пирса, корабль у Основного Штата, мост между островами Богатого района
const NOWHERE = [[1100, 1300], [1230, 1010], [1057, 730], [1616, 1070]];
// розовые точки с разметки заказчика (33 шт.)
const POINT_COUNTS = { state: 15, farm: 8, fbi: 4, county: 5, rich: 2, race: 0, outskirts: 3, alcatraz: 0 };

const zonesContaining = p => ZONES.filter(z => G.pointInZone(p, z.outline)).map(z => z.id);

test('eight zones in fixed order', () => {
  assert.deepEqual(ZONES.map(z => z.id), IDS);
});

test('zone colors match spec', () => {
  ZONES.forEach(z => assert.equal(z.color, COLORS[z.id], z.id));
});

test('data passes validation without warnings', () => {
  assert.deepEqual(G.validateZones(ZONES).warnings, []);
});

for (const [id, pts] of Object.entries(ANCHORS)) {
  test(`anchor points of ${id} lie only in ${id}`, () => {
    pts.forEach(p => assert.deepEqual(zonesContaining(p), [id], `${p}`));
  });
}

// Красный контур заказчика нарисован буквой «Г» в обход Округа, поэтому
// выреза не нужно — достаточно, чтобы Округ не попадал в Заштатье.
test('outskirts does not cover county', () => {
  const o = ZONES.find(z => z.id === 'outskirts');
  const c = ZONES.find(z => z.id === 'county');
  [[640, 590], [560, 420], [620, 800]].forEach(p => {
    assert.equal(G.pointInZone(p, c.outline), true, `county ${p}`);
    assert.equal(G.pointInZone(p, o.outline), false, `outskirts ${p}`);
  });
});

test('sea and small islands belong to no zone', () => {
  NOWHERE.forEach(p => assert.deepEqual(zonesContaining(p), [], `${p}`));
});

test('markers from the reference: 38 points distributed by zone', () => {
  const counts = Object.fromEntries(ZONES.map(z => [z.id, z.points.length]));
  assert.deepEqual(counts, POINT_COUNTS);
});

test('every point lies inside its own zone', () => {
  assert.deepEqual(G.findStrayPoints(ZONES), []);
});

test('all coordinates within the image', () => {
  const inImg = ([x, y]) => x >= 0 && x <= 2000 && y >= 0 && y <= 1714;
  ZONES.forEach(z => {
    G.normalizeParts(z.outline).flat(2).forEach(p => assert.ok(inImg(p), `${z.id} ${p}`));
    z.points.forEach(pt => G.pointPlaces(pt).forEach(c => assert.ok(inImg(c), `${z.id} ${pt.name}`)));
  });
});

test('tree farm is one point in two places of the farm zone', () => {
  const farm = ZONES.find(z => z.id === 'farm');
  const twins = farm.points.filter(p => p.name === 'Ферма деревьев');
  assert.equal(twins.length, 1);
  assert.deepEqual(G.pointPlaces(twins[0]).length, 2);
  // постройки с розовыми крышами — не точки (были добавлены по ошибке)
  const all = farm.points.flatMap(p => G.pointPlaces(p));
  assert.ok(!all.some(([x, y]) => Math.abs(x - 905) < 6 && (Math.abs(y - 644) < 6 || Math.abs(y - 670) < 6)));
});
