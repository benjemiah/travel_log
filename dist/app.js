import { calculateStats, createId, decodeBackup, formatDate, serializeBackup, tripDays } from './data.js';
import { loadDatabase, saveDatabase } from './storage.js';
import { CesiumGlobe } from './cesium-globe.js?v=5';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const elements = {
  saveState: $('#saveState'),
  globe: $('#globe'),
  globeLoading: $('#globeLoading'),
  globeTip: $('#globeTip'),
  tripDialog: $('#tripDialog'),
  tripForm: $('#tripForm'),
  dialogTitle: $('#dialogTitle'),
  formError: $('#formError'),
  deleteTrip: $('#deleteTrip'),
  timeline: $('#timeline'),
  emptyState: $('#emptyState'),
  search: $('#tripSearch'),
  yearFilter: $('#yearFilter'),
  toast: $('#toast'),
  backupStatus: $('#backupStatus'),
  backupFile: $('#backupFile'),
  confirmDialog: $('#confirmDialog'),
};

let database;
let world = null;
let toastTimer = null;
let saveRevision = 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function showToast(message, duration = 3500) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), duration);
}

function setSaveState(state, text) {
  elements.saveState.className = `save-state ${state}`;
  elements.saveState.innerHTML = '<span class="status-dot"></span>' + escapeHtml(text);
}

async function persist() {
  const revision = ++saveRevision;
  database.meta.updatedAt = new Date().toISOString();
  setSaveState('saving', 'Wird gespeichert …');
  try {
    await saveDatabase(database);
    if (revision === saveRevision) setSaveState('', 'Lokal gespeichert');
  } catch (error) {
    setSaveState('error', 'Speichern fehlgeschlagen');
    showToast(error.message || 'Lokales Speichern ist fehlgeschlagen.', 6000);
  }
}

function dateFilename() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return `atlas-sicherung-${local}.json`;
}

function backupFile() {
  return new File([serializeBackup(database)], dateFilename(), { type: 'application/json' });
}

async function markBackedUp() {
  database.meta.lastBackupAt = new Date().toISOString();
  await persist();
  renderBackupStatus();
}

function downloadBackup() {
  const file = backupFile();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  void markBackedUp();
  showToast('Sicherung erstellt. Bewahre die JSON-Datei an einem sicheren Ort auf.');
}

async function shareBackup() {
  const file = backupFile();
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ title: 'Atlas-Sicherung', text: 'Meine private Atlas-Datensicherung', files: [file] });
      await markBackedUp();
      showToast('Sicherung an die ausgewählte App übergeben.');
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  downloadBackup();
  showToast('Teilen wird hier nicht unterstützt – die Sicherung wurde heruntergeladen.');
}

function renderBackupStatus() {
  if (!database.meta.lastBackupAt) {
    elements.backupStatus.textContent = 'Noch keine Sicherung in diesem Browser erstellt.';
    return;
  }
  const date = new Date(database.meta.lastBackupAt);
  elements.backupStatus.textContent = `Letzte Sicherung: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

function formatDistance(value) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value) + ' km';
}

function renderMetrics(stats) {
  $('#countriesMetric').textContent = stats.countries;
  $('#placesMetric').textContent = stats.places;
  $('#daysMetric').textContent = stats.days;
  $('#continentsMetric').textContent = stats.continentCount;
  $('#distanceMetric').textContent = formatDistance(stats.distanceKm);
}

function renderTopCountry(stats) {
  const [country, visits] = stats.topCountry || [];
  $('#topCountry').textContent = country || 'Noch offen';
  $('#topCountryDetail').textContent = country
    ? `${visits} ${visits === 1 ? 'Aufenthalt' : 'Aufenthalte'} in deinem Atlas`
    : 'Noch keine Daten';
}

function renderYearChart(stats) {
  const chart = $('#yearChart');
  const rows = [...stats.yearDays.entries()].sort((a, b) => a[0] - b[0]);
  if (!rows.length) {
    chart.innerHTML = '<p class="chart-placeholder">Noch keine Daten</p>';
    return;
  }
  const maximum = Math.max(...rows.map(([, days]) => days));
  chart.innerHTML = rows.map(([year, days]) => `
    <div class="year-bar-wrap" title="${year}: ${days} Reisetage">
      <span class="year-value">${days} T.</span>
      <span class="year-bar" style="height:${Math.max(5, days / maximum * 150)}px"></span>
      <span class="year-label">${year}</span>
    </div>`).join('');
}

function renderContinents(stats) {
  const list = $('#continentList');
  const rows = [...stats.continents.entries()].sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    list.innerHTML = '<p class="chart-placeholder">Noch keine Daten</p>';
    return;
  }
  const maximum = Math.max(...rows.map(([, count]) => count));
  list.innerHTML = rows.map(([continent, count]) => `
    <div class="continent-row">
      <span>${escapeHtml(continent)}</span>
      <span class="continent-track"><span class="continent-fill" style="width:${count / maximum * 100}%"></span></span>
      <strong>${count}</strong>
    </div>`).join('');
}

function updateYearFilter() {
  const current = elements.yearFilter.value;
  const years = [...new Set(database.trips.map(trip => trip.startDate.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  elements.yearFilter.innerHTML = '<option value="all">Alle Jahre</option>'
    + years.map(year => `<option value="${year}">${year}</option>`).join('');
  elements.yearFilter.value = years.includes(current) ? current : 'all';
}

function visibleTrips() {
  const query = elements.search.value.trim().toLocaleLowerCase('de');
  const year = elements.yearFilter.value;
  return [...database.trips]
    .filter(trip => year === 'all' || trip.startDate.startsWith(year))
    .filter(trip => !query || [trip.name, trip.country, trip.notes, trip.category].some(value => value.toLocaleLowerCase('de').includes(query)))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt));
}

function renderTimeline() {
  const trips = visibleTrips();
  const hasFilters = elements.search.value.trim() || elements.yearFilter.value !== 'all';
  elements.emptyState.hidden = trips.length > 0;
  elements.timeline.hidden = trips.length === 0;
  if (!trips.length) {
    elements.emptyState.classList.toggle('is-filtered', Boolean(hasFilters));
    elements.emptyState.querySelector('h3').textContent = hasFilters ? 'Nichts gefunden' : 'Noch keine Reisen';
    elements.emptyState.querySelector('p').textContent = hasFilters ? 'Ändere Suche oder Zeitraum.' : 'Klicke auf den Globus oder füge einen Eintrag hinzu.';
    elements.emptyState.querySelector('button').hidden = Boolean(hasFilters);
    elements.timeline.innerHTML = '';
    return;
  }
  elements.timeline.innerHTML = trips.map(trip => {
    const date = formatDate(trip.startDate, { day: '2-digit', month: 'short' });
    const year = trip.startDate.slice(0, 4);
    const duration = tripDays(trip);
    return `<article class="trip-row">
      <div class="trip-date"><strong>${escapeHtml(date)}</strong><span>${year}</span></div>
      <span class="trip-node" aria-hidden="true"></span>
      <div class="trip-main">
        <h3>${escapeHtml(trip.name)}</h3>
        <div class="trip-meta"><span>${escapeHtml(trip.country)}</span><span>${duration} ${duration === 1 ? 'Tag' : 'Tage'}</span><span class="trip-tag">${escapeHtml(trip.category)}</span></div>
        ${trip.notes ? `<p class="trip-notes">${escapeHtml(trip.notes)}</p>` : ''}
      </div>
      <div class="trip-actions"><button class="icon-button" type="button" data-edit-trip="${escapeHtml(trip.id)}" aria-label="${escapeHtml(trip.name)} bearbeiten">•••</button></div>
    </article>`;
  }).join('');
}

function renderGlobeData() {
  if (!world) return;
  world.setData(database.trips);
}

function render() {
  const stats = calculateStats(database.trips);
  renderMetrics(stats);
  renderTopCountry(stats);
  renderYearChart(stats);
  renderContinents(stats);
  updateYearFilter();
  renderTimeline();
  renderBackupStatus();
  renderGlobeData();
}

function field(id) { return document.getElementById(id); }

function openTripDialog(trip = null, coordinates = null) {
  elements.tripForm.reset();
  elements.formError.textContent = '';
  field('tripId').value = trip?.id || '';
  field('placeName').value = trip?.name || '';
  field('country').value = trip?.country || coordinates?.country || '';
  field('continent').value = trip?.continent || '';
  const today = new Date();
  const todayValue = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  field('startDate').value = trip?.startDate || todayValue;
  field('endDate').value = trip?.endDate || todayValue;
  field('latitude').value = trip?.lat ?? (coordinates ? coordinates.lat.toFixed(4) : '');
  field('longitude').value = trip?.lng ?? (coordinates ? coordinates.lng.toFixed(4) : '');
  field('notes').value = trip?.notes || '';
  const category = trip?.category || 'Urlaub';
  const categoryRadio = elements.tripForm.querySelector(`input[name="category"][value="${CSS.escape(category)}"]`);
  if (categoryRadio) categoryRadio.checked = true;
  elements.dialogTitle.textContent = trip ? 'Reise bearbeiten' : 'Reise festhalten';
  elements.deleteTrip.classList.toggle('hidden', !trip);
  elements.tripDialog.showModal();
  setTimeout(() => field('placeName').focus(), 50);
}

function closeTripDialog() {
  elements.tripDialog.close();
}

function tripFromForm() {
  const id = field('tripId').value;
  const existing = database.trips.find(trip => trip.id === id);
  const now = new Date().toISOString();
  return {
    id: id || createId(),
    name: field('placeName').value.trim(),
    country: field('country').value.trim(),
    continent: field('continent').value,
    startDate: field('startDate').value,
    endDate: field('endDate').value,
    lat: Number(field('latitude').value),
    lng: Number(field('longitude').value),
    category: elements.tripForm.querySelector('input[name="category"]:checked')?.value || 'Sonstiges',
    notes: field('notes').value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function validateTrip(trip) {
  if (!trip.name || !trip.country || !trip.continent || !trip.startDate || !trip.endDate) return 'Bitte fülle alle Pflichtfelder aus.';
  if (!Number.isFinite(trip.lat) || trip.lat < -90 || trip.lat > 90 || !Number.isFinite(trip.lng) || trip.lng < -180 || trip.lng > 180) return 'Bitte gib gültige Koordinaten an.';
  if (trip.endDate < trip.startDate) return 'Die Abreise darf nicht vor der Ankunft liegen.';
  return '';
}

async function confirmAction(title, message, actionLabel = 'Bestätigen') {
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmAction').textContent = actionLabel;
  elements.confirmDialog.showModal();
  return new Promise(resolve => {
    const finish = value => {
      $('#confirmCancel').removeEventListener('click', cancel);
      $('#confirmAction').removeEventListener('click', confirm);
      elements.confirmDialog.removeEventListener('cancel', escapeCancel);
      if (elements.confirmDialog.open) elements.confirmDialog.close();
      resolve(value);
    };
    const cancel = () => finish(false);
    const confirm = () => finish(true);
    const escapeCancel = event => { event.preventDefault(); finish(false); };
    $('#confirmCancel').addEventListener('click', cancel);
    $('#confirmAction').addEventListener('click', confirm);
    elements.confirmDialog.addEventListener('cancel', escapeCancel);
  });
}

async function deleteCurrentTrip() {
  const id = field('tripId').value;
  const trip = database.trips.find(entry => entry.id === id);
  if (!trip) return;
  const confirmed = await confirmAction('Eintrag löschen?', `${trip.name} wird dauerhaft aus diesem Browser entfernt.`, 'Löschen');
  if (!confirmed) return;
  database.trips = database.trips.filter(entry => entry.id !== id);
  closeTripDialog();
  render();
  await persist();
  showToast('Reise gelöscht.');
}

async function initialiseGlobe() {
  try {
    world = new CesiumGlobe(elements.globe, {
      onGlobeClick: coordinates => openTripDialog(null, coordinates),
      onPointClick: trip => window.setTimeout(() => openTripDialog(trip), 220),
      onReady: () => elements.globeLoading.classList.add('done'),
    });
    world.pointOfView({ lat: 24, lng: 15, altitude: 2.15 }, 0);
    renderGlobeData();

    $('#zoomIn').addEventListener('click', () => {
      const view = world.pointOfView();
      world.pointOfView({ ...view, altitude: Math.max(.75, view.altitude * .78) }, .35);
    });
    $('#zoomOut').addEventListener('click', () => {
      const view = world.pointOfView();
      world.pointOfView({ ...view, altitude: Math.min(3.7, view.altitude * 1.28) }, .35);
    });
    $('#resetGlobe').addEventListener('click', () => world.pointOfView({ lat: 24, lng: 15, altitude: 2.15 }, .65));
    const mapMode = $('#mapMode');
    const reliefMode = $('#reliefMode');
    const gridToggle = $('#toggleGrid');
    const chooseMapMode = mode => {
      world.setMapMode(mode);
      const mapActive = mode === 'map';
      mapMode.classList.toggle('is-active', mapActive);
      reliefMode.classList.toggle('is-active', !mapActive);
      mapMode.setAttribute('aria-pressed', String(mapActive));
      reliefMode.setAttribute('aria-pressed', String(!mapActive));
    };
    mapMode.addEventListener('click', () => chooseMapMode('map'));
    reliefMode.addEventListener('click', () => chooseMapMode('relief'));
    gridToggle.addEventListener('click', () => {
      const visible = gridToggle.getAttribute('aria-pressed') !== 'true';
      world.setGridVisible(visible);
      gridToggle.classList.toggle('is-active', visible);
      gridToggle.setAttribute('aria-pressed', String(visible));
    });
  } catch (error) {
    console.error('Atlas globe initialization failed:', error);
    elements.globeLoading.innerHTML = '<span>Globus konnte nicht geladen werden.<br>Bitte prüfe die Verbindung und lade neu.</span>';
    elements.globeTip.hidden = true;
    showToast(error.message, 6000);
  }
}

function bindEvents() {
  $$('[data-open-trip]').forEach(button => button.addEventListener('click', () => openTripDialog()));
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', closeTripDialog));
  elements.tripDialog.addEventListener('click', event => { if (event.target === elements.tripDialog) closeTripDialog(); });
  elements.tripForm.addEventListener('submit', async event => {
    event.preventDefault();
    const trip = tripFromForm();
    const error = validateTrip(trip);
    elements.formError.textContent = error;
    if (error) return;
    const index = database.trips.findIndex(entry => entry.id === trip.id);
    if (index >= 0) database.trips[index] = trip;
    else database.trips.push(trip);
    closeTripDialog();
    render();
    await persist();
    showToast(index >= 0 ? 'Reise aktualisiert.' : 'Reise lokal gespeichert.');
  });
  elements.deleteTrip.addEventListener('click', deleteCurrentTrip);
  elements.timeline.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-trip]');
    if (!button) return;
    const trip = database.trips.find(entry => entry.id === button.dataset.editTrip);
    if (trip) {
      world?.pointOfView({ lat: trip.lat, lng: trip.lng, altitude: 1.3 }, 700);
      openTripDialog(trip);
    }
  });
  elements.search.addEventListener('input', renderTimeline);
  elements.yearFilter.addEventListener('change', renderTimeline);
  $('#exportBackup').addEventListener('click', downloadBackup);
  $('#shareBackup').addEventListener('click', shareBackup);
  $('#importBackup').addEventListener('click', () => elements.backupFile.click());
  elements.backupFile.addEventListener('change', async () => {
    const file = elements.backupFile.files?.[0];
    elements.backupFile.value = '';
    if (!file) return;
    try {
      const restored = decodeBackup(await file.text());
      const confirmed = await confirmAction('Sicherung wiederherstellen?', `Die ${restored.trips.length} Einträge aus der Datei ersetzen alle aktuellen lokalen Einträge.`, 'Wiederherstellen');
      if (!confirmed) return;
      database = restored;
      render();
      await persist();
      showToast('Sicherung erfolgreich wiederhergestellt.');
    } catch {
      showToast('Diese Datei ist keine gültige Atlas-Sicherung. Deine Daten bleiben unverändert.', 6000);
    }
  });
}

async function start() {
  try {
    database = await loadDatabase();
  } catch (error) {
    setSaveState('error', 'Daten nicht geladen');
    document.body.innerHTML = `<main class="fatal-error"><h1>Atlas konnte deine Daten nicht öffnen.</h1><p>${escapeHtml(error.message)}</p><p>Es wurde nichts überschrieben. Schließe andere Atlas-Fenster und lade die Seite neu.</p></main>`;
    return;
  }
  bindEvents();
  render();
  void initialiseGlobe();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => showToast('Offline-Modus konnte nicht eingerichtet werden.'));
  }
}

start();
