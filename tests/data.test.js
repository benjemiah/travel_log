import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ID, calculateStats, decodeBackup, haversineKm, tripDays } from '../dist/data.js';

const trip = (overrides = {}) => ({
  id: 'one', name: 'Berlin', country: 'Deutschland', continent: 'Europa',
  lat: 52.52, lng: 13.405, startDate: '2025-01-01', endDate: '2025-01-03',
  category: 'Urlaub', notes: '', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

test('Reisetage werden einschließlich An- und Abreise gezählt', () => {
  assert.equal(tripDays(trip()), 3);
  assert.equal(tripDays(trip({ endDate: '2024-12-31' })), 0);
});

test('Statistiken zählen Länder normalisiert und verteilen Jahreswechsel', () => {
  const stats = calculateStats([
    trip({ id: 'a', startDate: '2024-12-31', endDate: '2025-01-02' }),
    trip({ id: 'b', name: 'Hamburg', country: 'deutschland', lat: 53.55, lng: 9.99, startDate: '2025-03-02', endDate: '2025-03-02' }),
  ]);
  assert.equal(stats.countries, 1);
  assert.equal(stats.places, 2);
  assert.equal(stats.days, 4);
  assert.equal(stats.yearDays.get(2024), 1);
  assert.equal(stats.yearDays.get(2025), 3);
  assert.ok(stats.distanceKm > 200);
});

test('Haversine-Distanz liefert für Berlin–Paris einen plausiblen Wert', () => {
  const distance = haversineKm({ lat: 52.52, lng: 13.405 }, { lat: 48.8566, lng: 2.3522 });
  assert.ok(distance > 870 && distance < 890);
});

test('Import akzeptiert nur Atlas-Sicherungen mit validen Einträgen', () => {
  const decoded = decodeBackup(JSON.stringify({ app: APP_ID, version: 1, trips: [trip()], meta: {} }));
  assert.equal(decoded.trips.length, 1);
  assert.throws(() => decodeBackup(JSON.stringify({ app: 'fremd', version: 1, trips: [] })));
  assert.throws(() => decodeBackup(JSON.stringify({ app: APP_ID, version: 1, trips: [trip({ lat: 100 })] })));
});
