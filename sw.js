// ABOUD AUTO — offline support for the main app only (not /hesabat or admin)
var CACHE = "aboud-auto-v43";
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
        return k.indexOf("aboud-auto-") === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isMainAppPage(url) {
  if (url.origin !== self.location.origin) return false;
  var p = url.pathname;
  return p === "/" || p === "/index.html";
}

// Tell the open app page that a newer version was saved. The page may still be loading,
// so keep trying for a few seconds until it is ready to hear it.
function tellPage(id) {
  var tries = 0;
  function attempt() {
    tries++;
    return (id ? self.clients.get(id) : Promise.resolve(null)).then(function (w) {
      if (w) { w.postMessage({ type: "app-updated" }); return; }
      if (tries >= 20) {
        return self.clients.matchAll({ type: "window" }).then(function (cl) {
          cl.forEach(function (x) { x.postMessage({ type: "app-updated" }); });
        });
      }
      return new Promise(function (r) { setTimeout(r, 500); }).then(attempt);
    });
  }
  return attempt();
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // The app page: open instantly from the saved copy, and check for a newer version in the background.
  // If a newer version arrived, the page is told so it can offer a one-tap update.
  if (req.mode === "navigate" && isMainAppPage(url)) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match("./index.html").then(function (saved) {
          var savedText = saved ? saved.clone().text() : Promise.resolve(null);
          var fresh = fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(function (r) {
            if (!r.ok) return r;
            var copy = r.clone();
            var check = Promise.all([copy.clone().text(), savedText])
              .then(function (t) {
                return c.put("./index.html", copy).then(function () {
                  if (saved && t[0] !== t[1]) return tellPage(e.resultingClientId);
                });
              }).catch(function () {});
            try { e.waitUntil(check); } catch (x) {}
            return r;
          });
          if (saved) {
            fresh.catch(function () {});
            return saved;
          }
          return fresh.catch(function () { return caches.match("./"); });
        });
      })
    );
    return;
  }

  // Google Fonts: saved copy first, so a slow network never holds up the screen
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(req.url).then(function (m) {
          var net = fetch(req).then(function (r) {
            if (r.ok || r.type === "opaque") c.put(req.url, r.clone());
            return r;
          });
          if (m) { net.catch(function () {}); return m; }
          return net;
        });
      })
    );
    return;
  }

  // Firebase library files and the app's own icons/manifest: saved copy first
  var isFirebaseLib = url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0;
  var isOwnAsset = url.origin === self.location.origin &&
    /^\/(icon-\d+\.png|manifest\.json)$/.test(url.pathname);
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
  // Everything else (Firebase data, /hesabat, admin) is left untouched
});
