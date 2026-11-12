/* Offline shell: pending unconfirmed invoices are stored in IndexedDB by app code; never cache authenticated API responses. */
const VERSION='milo-static-browser-v13-online-orders-v25';
const STATIC=['./manifest-v17.webmanifest','./favicon-v17.ico','./icons/milo-v17-32.png','./icons/milo-v17-180.png','./icons/milo-v17-192.png','./icons/milo-v17-512.png','./icons/milo-v17-maskable-512.png','./','./index.html','./sale.html','./products.html','./labels.html','./labels.js','./invoices.html','./reports.html','./inventory.html','./shifts.html','./settings.html','./customer-order.html','./customers.html','./purchases.html','./style.css','./app.js','./startup.js','./milo-bridge.js','./direct-print.js','./offline-sync.js','./icons.js','./pwa.js','./manifest.webmanifest','./manifest-v17.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/milo-v15-192.png','./icons/milo-v15-512.png','./icons/milo-v15-maskable-512.png','./icons/milo-v15-32.png','./icons/milo-v15-180.png','./favicon.ico','./favicon-v17.ico','./icons/milo-v17-192.png','./icons/milo-v17-512.png','./icons/milo-v17-maskable-512.png','./icons/milo-v17-32.png','./icons/milo-v17-180.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(async cache => { await Promise.allSettled(STATIC.map(async file => { const res = await fetch(file, {cache:'reload'}); if(res.ok) await cache.put(file,res); })); }).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('milo-static-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
 const r=event.request;
 // Never intercept remote Apps Script, authenticated requests or non-GET operations.
 if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 const path=new URL(r.url).pathname;
 if(!STATIC.some(x=>path.endsWith(x.slice(1))&&x!=='./'))return;
 event.respondWith(fetch(r).then(response=>{if(response.ok){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(r,copy));}return response;}).catch(()=>caches.match(r)));
});
