import test from 'node:test';
import assert from 'node:assert/strict';
import { continentForCountry, placeFromFeature, reversePlace, searchPlaces } from '../dist/places.js';

const feature = (properties = {}, coordinates = [13.405, 52.52]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates },
  properties: { name: 'Alexanderplatz', city: 'Berlin', country: 'Deutschland', countrycode: 'DE', ...properties },
});

test('Ein Globuspunkt übernimmt Stadt und Land, behält aber die angetippten Koordinaten', () => {
  assert.deepEqual(placeFromFeature(feature(), { lat: 52.521, lng: 13.406 }), {
    name: 'Berlin', country: 'Deutschland', continent: 'Europa', region: '', lat: 52.521, lng: 13.406,
  });
  assert.equal(placeFromFeature(feature({ city: undefined, name: 'Kyoto', country: 'Japan', countrycode: 'JP' })).name, 'Kyoto');
  assert.equal(placeFromFeature(feature({}, ['invalid', 5])), null);
  assert.equal(placeFromFeature(feature({ country: undefined })), null);
  assert.equal(placeFromFeature(null), null);
  assert.equal(continentForCountry('nz'), 'Ozeanien');
  assert.equal(continentForCountry('XX'), '');
});

test('Ortssuche verwendet deutsche Ergebnisse, entfernt Duplikate und cached Suchergebnisse', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls += 1;
    assert.equal(url.hostname, 'photon.komoot.io');
    assert.equal(url.searchParams.get('lang'), 'de');
    assert.equal(url.searchParams.get('q'), 'Berlin');
    return { ok: true, json: async () => ({ features: [feature(), feature()] }) };
  });
  assert.equal((await searchPlaces('Berlin')).length, 1);
  assert.equal((await searchPlaces('Berlin')).length, 1);
  assert.equal(calls, 1);
});

test('Reverse-Suche meldet leere Ergebnisse und Dienstausfälle ohne falsche Orte', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ features: [] }) }));
  await assert.rejects(reversePlace({ lat: 0, lng: 0 }), /kein Ort/);
  globalThis.fetch.mock.mockImplementation(async () => ({ ok: false }));
  await assert.rejects(reversePlace({ lat: 1, lng: 1 }), /nicht erreichbar/);
});
