const C='elnour-v20',F=['./','index.html','app.js','logo.jpg','icon-192.png','icon-512.png','manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
 if(u.origin===location.origin||u.host==='www.gstatic.com'||u.host.includes('fonts.')){
  e.respondWith(fetch(e.request,u.origin===location.origin?{cache:'no-cache'}:{}).then(r=>{const cl=r.clone();caches.open(C).then(c=>c.put(e.request,cl));return r}).catch(()=>caches.match(e.request)))}});
