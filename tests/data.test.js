import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ID, calculateStats, decodeBackup, formatDate, formatPeriod, haversineKm, tripDays, validPeriod } from '../dist/data.js';

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

test('Monatseinträge überleben die Sicherung ohne erfundene Tage', () => {
  const monthly = trip({ startDate: '2026-07', endDate: '2026-08' });
  const decoded = decodeBackup(JSON.stringify({ app: APP_ID, version: 1, trips: [monthly], meta: {} }));
  assert.equal(decoded.trips[0].startDate, '2026-07');
  assert.equal(decoded.trips[0].endDate, '2026-08');
  assert.equal(tripDays(monthly), 0);
  assert.equal(calculateStats([monthly]).days, 0);
  assert.match(formatDate('2026-07'), /Juli 2026/);
  assert.match(formatDate('2026-07', { day: '2-digit', month: 'short' }), /^Jul/);
  assert.match(formatPeriod(monthly), /Juli 2026 – Aug\. 2026/);
});

test('Monate, Tagesdaten und ihre Zeiträume werden streng validiert', () => {
  assert.equal(validPeriod('2026-07', '2026-07'), true);
  assert.equal(validPeriod('2026-12', '2027-01'), true);
  assert.equal(validPeriod('2026-13', '2027-01'), false);
  assert.equal(validPeriod('0000-01', '0000-02'), false);
  assert.equal(validPeriod('2026-08', '2026-07'), false);
  assert.equal(validPeriod('2026-07', '2026-07-01'), false);
  assert.equal(validPeriod('2026-02-29', '2026-03-01'), false);
  assert.throws(() => decodeBackup({ app: APP_ID, version: 1, trips: [trip({ startDate: '2026-13', endDate: '2026-13' })] }));
});

test('Gemischte Datumsgenauigkeit zählt Reisen nach Jahr und nur bekannte Reisetage', () => {
  const stats = calculateStats([
    trip({ startDate: '2026-12', endDate: '2027-01', continent: '' }),
    trip({ id: 'daily', startDate: '2026-03-27', endDate: '2026-03-30' }),
  ]);
  assert.equal(stats.days, 4);
  assert.equal(stats.yearVisits.get(2026), 2);
  assert.equal(stats.yearVisits.has(2027), false);
  assert.equal(stats.continentCount, 1);
});

test('Mehrtagereisen bleiben über Zeitumstellungen korrekt', () => {
  assert.equal(tripDays(trip({ startDate: '2026-03-27', endDate: '2026-03-30' })), 4);
  assert.equal(tripDays(trip({ startDate: '2026-10-23', endDate: '2026-10-26' })), 4);
});
