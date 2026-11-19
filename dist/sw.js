const CACHE = 'atlas-shell-v4';
const NATURAL_EARTH = ['./vendor/cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml'];
for (let level = 0; level <= 2; level += 1) {
  const columns = 2 ** (level + 1);
  const rows = 2 ** level;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      NATURAL_EARTH.push(`./vendor/cesium/Assets/Textures/NaturalEarthII/${level}/${column}/${row}.jpg`);
    }
  }
}
const SHELL = [
  './', './index.html', './styles.css', './app.js', './data.js', './storage.js', './cesium-globe.js',
  './manifest.webmanifest', './icon.svg', './vendor/cesium/Cesium.js', './vendor/cesium/Widgets/widgets.css',
  ...NATURAL_EARTH,
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
    return;
  }
});
