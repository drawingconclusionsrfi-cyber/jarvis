/* Ri Ri — service worker
   Caches the app shell so Ri Ri opens instantly and works offline.
   Bump CACHE on every deploy so phones pull the new build. */
var CACHE = 'riri-v18-2026-06-07';

/* App-shell files to pre-cache. CDN scripts are cached lazily at runtime. */
var SHELL = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable.png',
  'ririface.png',
  'avatar-live.mp4',
  'avatar-male.mp4',
  'tab-contacts.png',
  'skin-ironman.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* Cache each item independently — one 404 won't abort the whole install. */
      return Promise.all(SHELL.map(function (url) {
        return c.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* Never cache API traffic — always go to the network so data stays live. */
  var liveHosts = [
    'api.artic.edu', 'www.artic.edu', 'api.mymemory.translated.net',
    'api.weather.gov', 'api.datamuse.com', 'api.dictionaryapi.dev',
    'api.rss2json.com', 'news.google.com', 'api.coingecko.com',
    'generativelanguage.googleapis.com', 'api.elevenlabs.io',
    'geocoding-api.open-meteo.com', 'api.open-meteo.com',
    'air-quality-api.open-meteo.com'
  ];
  if (liveHosts.indexOf(url.hostname) !== -1) return;

  /* App shell: cache-first, then update the cache in the background. */
  e.respondWith(
    caches.match(req).then(function (cached) {
      var live = fetch(req).then(function (res) {
        if (res && res.status === 200 && (url.origin === location.origin ||
            url.hostname === 'cdnjs.cloudflare.com' ||
            url.hostname === 'fonts.googleapis.com' ||
            url.hostname === 'fonts.gstatic.com')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || live;
    })
  );
});
