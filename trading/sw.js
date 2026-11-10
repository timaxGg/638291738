/* Die Top-Aktien-App ist in ein eigenes Repository umgezogen. Dieser Service Worker räumt den alten auf und meldet sich ab. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("sig-")).map(x=>caches.delete(x)))).then(()=>self.registration.unregister()))});
