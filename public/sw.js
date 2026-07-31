/* BookDrive service worker */
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/offline', '/manifest.webmanifest', '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ไฟล์จาก Drive ไม่แคชที่นี่ — ตัวไฟล์หนังสือถูกเก็บใน IndexedDB อยู่แล้ว
  // ถ้าแคชซ้ำอีกชั้นจะกินโควตาเบราว์เซอร์เป็นสองเท่าโดยไม่ได้อะไรเพิ่ม
  if (url.pathname.startsWith('/api/drive/file/')) return;
  if (url.pathname.startsWith('/api/')) return;

  // ไฟล์ที่ Next.js ใส่ hash ในชื่อ — เปลี่ยนเนื้อหาเมื่อไหร่ชื่อเปลี่ยนตาม แคชถาวรได้เลย
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // หน้าเว็บ: เอาของสดก่อน ถ้าเน็ตล่มค่อยหยิบของที่แคชไว้
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, res.clone());
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(request)) || (await cache.match('/offline')) ||
            new Response('ออฟไลน์', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      })()
    );
  }
});
