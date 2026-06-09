/* Ri Ri — service worker
   Caches the app shell so Ri Ri opens instantly and works offline.
   Bump CACHE on every deploy so phones pull the new build. */
var CACHE = 'riri-v30-2026-06-09';

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
  'avatar-hologram.mp4',
  'tab-contacts.png',
  'skin-ironman.png',
  'skin-knightrider.png',
  'kari-scanbar.mp4'
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

  /* APP CODE (the page itself): NETWORK-FIRST. Pull the freshest index.html whenever
     online so a new build shows up immediately; fall back to cache only when offline.
     This stops the phone from getting stuck on an old build. */
  var isDoc = req.mode === 'navigate' ||
    (url.origin === location.origin &&
      (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')));
  if (isDoc) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (c) { return c || caches.match('index.html'); });
      })
    );
    return;
  }

  /* Everything else (images, video, fonts, CDN): cache-first, refresh in background. */
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
