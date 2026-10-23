/* DailyRadar PWA: offline navigation shell only. NEVER cache live prices, signals, API, or notifications. */
const OFFLINE_CACHE='daily-radar-offline-v1.7.3';
const OFFLINE_URL='/offline.html';
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add(OFFLINE_URL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('daily-radar-offline-')&&key!==OFFLINE_CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return; // all price/indicator/API assets remain network-only
  event.respondWith(fetch(event.request).catch(()=>caches.match(OFFLINE_URL)));
});
