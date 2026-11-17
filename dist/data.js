export const APP_ID = 'atlas-travel-log';
export const DATA_VERSION = 1;

export function emptyDatabase() {
  return {
    app: APP_ID,
    version: DATA_VERSION,
    trips: [],
    meta: { lastBackupAt: null, updatedAt: new Date().toISOString() },
  };
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function localDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function tripDays(trip) {
  const start = localDate(trip.startDate);
  const end = localDate(trip.endDate);
  if (!start || !end || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  const date = localDate(value);
  return date ? new Intl.DateTimeFormat('de-DE', options).format(date) : '–';
}

export function haversineKm(first, second) {
  const radians = value => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latDistance = radians(second.lat - first.lat);
  const lngDistance = radians(second.lng - first.lng);
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(lngDistance / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateStats(trips) {
  const countries = new Set(trips.map(trip => trip.country.trim().toLocaleLowerCase('de')));
  const continents = new Map();
  const countryVisits = new Map();
  const yearDays = new Map();
  let days = 0;

  for (const trip of trips) {
    const duration = tripDays(trip);
    days += duration;
    continents.set(trip.continent, (continents.get(trip.continent) || 0) + 1);
    countryVisits.set(trip.country, (countryVisits.get(trip.country) || 0) + 1);
    const start = localDate(trip.startDate);
    const end = localDate(trip.endDate);
    if (start && end) {
      const cursor = new Date(start);
      while (cursor <= end) {
        const year = cursor.getFullYear();
        yearDays.set(year, (yearDays.get(year) || 0) + 1);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  const chronological = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
  let distanceKm = 0;
  for (let index = 1; index < chronological.length; index += 1) {
    distanceKm += haversineKm(chronological[index - 1], chronological[index]);
  }

  const topCountry = [...countryVisits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))[0] || null;
  return {
    countries: countries.size,
    places: trips.length,
    days,
    continents,
    continentCount: continents.size,
    distanceKm: Math.round(distanceKm),
    topCountry,
    yearDays,
  };
}

function validTrip(trip) {
  if (!trip || typeof trip !== 'object') return false;
  const strings = ['id', 'name', 'country', 'continent', 'startDate', 'endDate', 'category', 'notes'];
  if (!strings.every(key => typeof trip[key] === 'string')) return false;
  if (!trip.id || !trip.name.trim() || !trip.country.trim() || !trip.continent.trim()) return false;
  if (!Number.isFinite(trip.lat) || trip.lat < -90 || trip.lat > 90) return false;
  if (!Number.isFinite(trip.lng) || trip.lng < -180 || trip.lng > 180) return false;
  return Boolean(localDate(trip.startDate) && localDate(trip.endDate) && tripDays(trip) > 0);
}

export function decodeBackup(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.app !== APP_ID || data.version !== DATA_VERSION || !Array.isArray(data.trips)) {
    throw new Error('Unbekanntes Sicherungsformat');
  }
  if (!data.trips.every(validTrip)) throw new Error('Ungültige Reisedaten');
  return {
    app: APP_ID,
    version: DATA_VERSION,
    trips: data.trips.map(trip => ({
      ...trip,
      createdAt: typeof trip.createdAt === 'string' ? trip.createdAt : new Date().toISOString(),
      updatedAt: typeof trip.updatedAt === 'string' ? trip.updatedAt : new Date().toISOString(),
    })),
    meta: {
      lastBackupAt: typeof data.meta?.lastBackupAt === 'string' ? data.meta.lastBackupAt : null,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function serializeBackup(database) {
  return JSON.stringify({ ...database, exportedAt: new Date().toISOString() }, null, 2);
}
