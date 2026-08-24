/* Ri Ri — service worker
   Caches the app shell so Ri Ri opens instantly and works offline.
   Bump CACHE on every deploy so phones pull the new build. */
var CACHE = 'riri-v159-2026-08-24';

/* App-shell files to pre-cache. CDN scripts are cached lazily at runtime. */
var SHELL = [
  'index.html',
  'minisearch.min.js',
  'localforage.min.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable.png',
  'ririface.png',
  'avatar-live.mp4',
  'avatar-male.mp4',
  'avatar-hologram.mp4',
  'avatar-genius.mp4',
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

/* ── BUILD CB — SHARE TARGET ───────────────────────────────────────────
   Android hands a shared file to us as a POST. This listener is deliberately
   separate from the caching one below so that nothing about normal fetching
   changes: it answers ONLY a POST to ./share-target and returns early for
   everything else, leaving the next listener to do its usual job.
   The payload is stashed in its own cache and the browser is redirected to
   the app, which picks it up on load — the page is not running yet at the
   moment the share happens, so there is nobody to postMessage to. */
self.addEventListener('fetch', function (e) {
  var u;
  try { u = new URL(e.request.url); } catch (err) { return; }
  if (e.request.method !== 'POST' || !/\/share-target\/?$/.test(u.pathname)) return;
  e.respondWith(
    e.request.formData().then(function (fd) {
      var files = fd.getAll('files') || [];
      return caches.open('riri-share').then(function (c) {
        var meta = {
          title: fd.get('title') || '',
          text:  fd.get('text')  || '',
          url:   fd.get('url')   || ''
        };
        var jobs = [c.put('meta', new Response(JSON.stringify(meta),
                     { headers: { 'Content-Type': 'application/json' } }))];
        var f = files.filter(function (x) { return x && x.size; })[0];
        if (f) {
          jobs.push(c.put('file', new Response(f, {
            headers: {
              'Content-Type': f.type || 'application/octet-stream',
              'X-Riri-Name': encodeURIComponent(f.name || 'shared')
            }
          })));
        } else {
          jobs.push(c.delete('file'));
        }
        return Promise.all(jobs);
      });
    }).catch(function () {}).then(function () {
      return Response.redirect('./index.html?shared=1', 303);
    })
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
    'air-quality-api.open-meteo.com',
    'js.puter.com', 'api.puter.com', 'puter.com',
    'image.pollinations.ai', 'r.jina.ai',
    /* BUILD AZ — keyless drop-ins */
    'api.frankfurter.dev', 'www.themealdb.com',
    /* BUILD BA — Whisper ears (Groq speech-to-text) */
    'api.groq.com',
    /* BUILD BC — Workers AI bridge */
    'riri-ai.renni32.workers.dev',
    /* BUILD BU — nutrition + exercises */
    'world.openfoodfacts.org', 'wger.de',
    /* BUILD BZ — FDA drug labels + recalls */
    'api.fda.gov',
    /* BUILD BX — spending, postcodes, elevation */
    'api.usaspending.gov', 'api.zippopotam.us', 'api.opentopodata.org',
    /* BUILD BV — books + providers */
    'openlibrary.org', 'covers.openlibrary.org', 'npiregistry.cms.hhs.gov',
    /* BUILD BW — archive + federal register */
    'archive.org', 'www.federalregister.gov',
    /* BUILD CE — world bank numbers + country facts */
    'api.worldbank.org', 'countries.dev', 'flagcdn.com',
    /* BUILD CH — public holidays + earthquakes.
       nagerholidays.com is the NEW host; date.nager.at 302s here and a
       cross-origin redirect needs CORS on both ends, so it is never called. */
    'nagerholidays.com', 'earthquake.usgs.gov'
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
            url.hostname === 'cdn.jsdelivr.net' ||   /* BUILD CG — VAD model + wasm */
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

/* ── BUILD BY — BACKGROUND SYNC ────────────────────────────────────────
   If a cloud-sync push failed because the phone was offline, the page asks
   Android to fire this the moment the network is back. All it does is tell
   every open copy of RIRI to try again — the sync logic itself stays in the
   page where it already lives. On a browser with no Background Sync this
   listener simply never fires and nothing else changes. */
self.addEventListener('sync', function (e) {
  if (e.tag !== 'riri-sync-retry') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        list.forEach(function (c) {
          try { c.postMessage({ ririSyncRetry: true }); } catch (err) {}
        });
      })
      .catch(function () {})
  );
});

/* ── BUILD AV — SCHEDULED ALARMS ────────────────────────────────────────
   Notifications scheduled with the Triggers API are held by Android and
   arrive with RIRI fully closed. Tapping one must land Reni back INSIDE the
   app with the alarm spoken out loud, so:
     - if a window is already open, focus it and message it;
     - if not, open one with ?alarm=<text> and the page speaks it on load. */
self.addEventListener('notificationclick', function (e) {
  var n = e.notification;
  var d = (n && n.data) || {};
  var txt = d.t || (n && n.title) || '';
  try { n.close(); } catch (err) {}

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c && c.url && c.url.indexOf(self.registration.scope) === 0) {
            try { c.postMessage({ ririAlarm: txt }); } catch (err) {}
            if (c.focus) return c.focus();
            return null;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('./?alarm=' + encodeURIComponent(String(txt).slice(0, 120)));
        }
        return null;
      })
      .catch(function () {})
  );
});
