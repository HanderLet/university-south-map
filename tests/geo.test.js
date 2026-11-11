const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/geo.js');

const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
const hole = [[40, 40], [60, 40], [60, 60], [40, 60]];

test('image size constants', () => {
  assert.equal(G.IMG_W, 2000);
  assert.equal(G.IMG_H, 1714);
});

test('toLatLng flips y against image height', () => {
  assert.deepEqual(G.toLatLng([0, 0]), [1714, 0]);
  assert.deepEqual(G.toLatLng([2000, 1714]), [0, 2000]);
});

test('toPixel inverts toLatLng and rounds', () => {
  assert.deepEqual(G.toPixel({ lat: 1714 - 300.4, lng: 120.6 }), [121, 300]);
});

test('normalizeRings wraps a single ring', () => {
  const r = G.normalizeRings([[0, 0], [10, 0], [10, 10]]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0][1], [10, 0]);
});

test('normalizeRings keeps outer ring plus holes', () => {
  assert.equal(G.normalizeRings([square, hole]).length, 2);
});

test('normalizeRings rejects junk', () => {
  assert.equal(G.normalizeRings([]), null);
  assert.equal(G.normalizeRings('x'), null);
  assert.equal(G.normalizeRings(undefined), null);
  assert.equal(G.normalizeRings([[0, 0], [1, 1]]), null); // fewer than 3 vertices
});

test('pointInZone respects holes', () => {
  const outline = [square, hole];
  assert.equal(G.pointInZone([10, 10], outline), true);
  assert.equal(G.pointInZone([50, 50], outline), false);
  assert.equal(G.pointInZone([150, 50], outline), false);
  assert.equal(G.pointInZone([10, 10], square), true);
});

test('validateZones drops zone without outline', () => {
  const res = G.validateZones([
    { id: 'a', name: 'A', color: '#fff', points: [] },
    { id: 'b', name: 'B', color: '#fff', outline: square, points: [] },
  ]);
  assert.deepEqual(res.zones.map(z => z.id), ['b']);
  assert.equal(res.warnings.length, 1);
});

test('validateZones drops points with bad coords or no name', () => {
  const res = G.validateZones([{
    id: 'b', name: 'B', color: '#fff', outline: square, points: [
      { name: 'ok', coords: [10, 10], description: '' },
      { name: 'short', coords: [1] },
      { name: 'str', coords: ['a', 2] },
      { coords: [5, 5] },
    ],
  }]);
  assert.deepEqual(res.zones[0].points.map(p => p.name), ['ok']);
  assert.equal(res.warnings.length, 3);
});

test('validateZones tolerates missing points array', () => {
  const res = G.validateZones([{ id: 'b', name: 'B', color: '#fff', outline: square }]);
  assert.deepEqual(res.zones[0].points, []);
});

test('findStrayPoints reports points outside their zone', () => {
  const zones = [{ id: 'b', name: 'Округ', outline: square, points: [
    { name: 'in', coords: [10, 10] },
    { name: 'Точка 1', coords: [500, 500] },
  ] }];
  const out = G.findStrayPoints(zones);
  assert.equal(out.length, 1);
  assert.match(out[0], /Округ/);
  assert.match(out[0], /Точка 1/);
});

test('findStrayPoints is empty when all inside', () => {
  assert.deepEqual(G.findStrayPoints([{ id: 'b', name: 'B', outline: square, points: [{ name: 'in', coords: [1, 1] }] }]), []);
});

test('readableOnDark keeps bright zone colours', () => {
  assert.equal(G.readableOnDark('#36c5f4'), '#36c5f4');
  assert.equal(G.readableOnDark('#fdd12f'), '#fdd12f');
});

test('readableOnDark replaces too dark colours with light text', () => {
  assert.equal(G.readableOnDark('#222222'), '#e8eaf0');
  assert.equal(G.readableOnDark('#6a2c91'), '#e8eaf0');
  assert.equal(G.readableOnDark('nonsense'), '#e8eaf0');
});
