// Customer app (hesabat) — offline support for the app page only (not admin)
var CACHE = "hesabat-v4";
var CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(CORE.map(function (u) {
        return fetch(u, { cache: "reload" }).then(function (r) {
          if (r.ok) return c.put(u, r);
        }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf("hesabat-") === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isMainAppPage(url) {
  if (url.origin !== self.location.origin) return false;
  var p = url.pathname;
  return p === "/hesabat/" || p === "/hesabat" || p === "/hesabat/index.html";
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // The app page: try the network first (so updates arrive), fall back to the saved copy offline
  if (req.mode === "navigate" && isMainAppPage(url)) {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r.ok) {
          var copy = r.clone();
          caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        }
        return r;
      }).catch(function () {
        return caches.match("./index.html").then(function (m) { return m || caches.match("./"); });
      })
    );
    return;
  }

  // Firebase library files and the app's own icons/manifest: saved copy first
  var isFirebaseLib = url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0;
  var isOwnAsset = url.origin === self.location.origin &&
    /^\/hesabat\/(icon-\d+\.png|manifest\.json)$/.test(url.pathname);
  if (isFirebaseLib || isOwnAsset) {
    e.respondWith(
      caches.match(req.url).then(function (m) {
        return m || fetch(req).then(function (r) {
          if (r.ok) {
            var copy = r.clone();
            caches.open(CACHE).then(function (c) { c.put(req.url, copy); });
          }
          return r;
        });
      })
    );
  }
  // Everything else (Firebase data, admin page) is left untouched
});
