// Photon is an OpenStreetMap geocoder. Only explicit searches and globe taps
// trigger requests; successful results are cached for this browser session.
const GEOCODER_URL = 'https://photon.komoot.io/';
const cache = new Map();
const continentCountries = {
  Europa: 'AL AD AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
  Afrika: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
  Asien: 'AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
  Nordamerika: 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
  Südamerika: 'AR BO BR CL CO EC FK GF GS GY PE PY SR UY VE',
  Ozeanien: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS',
  Antarktika: 'AQ BV HM TF',
};

export function continentForCountry(code) {
  return Object.entries(continentCountries).find(([, countries]) => countries.split(' ').includes(code?.toUpperCase()))?.[0] || '';
}

export function placeFromFeature(feature, coordinates = null) {
  const properties = feature?.properties;
  const [lng, lat] = feature?.geometry?.coordinates || [];
  if (!properties || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Prefer the municipality over a street, business or neighbourhood.
  const name = properties.city || properties.town || properties.village
    || properties.name || properties.county || properties.state || '';
  if (!name || !properties.country) return null;
  return {
    name,
    country: properties.country,
    region: properties.state || properties.county || '',
    continent: continentForCountry(properties.countrycode),
    lat: coordinates?.lat ?? lat,
    lng: coordinates?.lng ?? lng,
  };
}

async function request(path, parameters, signal) {
  const url = new URL(path, GEOCODER_URL);
  url.search = new URLSearchParams({ ...parameters, lang: 'de' });
  if (cache.has(url.href)) return cache.get(url.href);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Ortssuche ist gerade nicht erreichbar.');
    const data = await response.json();
    cache.set(url.href, data);
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function reversePlace(coordinates, signal) {
  const data = await request('reverse', {
    lat: coordinates.lat.toFixed(5), lon: coordinates.lng.toFixed(5), radius: 5, limit: 1,
  }, signal);
  const place = placeFromFeature(data.features?.[0], coordinates);
  if (!place) throw new Error('Für diesen Punkt wurde kein Ort gefunden.');
  return place;
}

export async function searchPlaces(query, signal) {
  const data = await request('api/', { q: query, limit: 5 }, signal);
  const seen = new Set();
  return (data.features || []).map(feature => placeFromFeature(feature)).filter(place => {
    if (!place) return false;
    const key = `${place.name}/${place.country}/${place.region}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
