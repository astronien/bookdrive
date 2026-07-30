'use client';

/** โหลด Google Picker (gapi + gis) แบบ lazy — ~100KB ไม่ควรโหลดตอนเปิดแอป */

let loaded: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`โหลด ${src} ไม่สำเร็จ`));
    document.head.appendChild(el);
  });
}

async function ensureLoaded() {
  if (loaded) return loaded;
  loaded = (async () => {
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise<void>((res) => (window as any).gapi.load('picker', () => res()));
    await loadScript('https://accounts.google.com/gsi/client');
  })();
  return loaded;
}

export interface PickedFolder {
  id: string;
  name: string;
}

/**
 * เปิด Picker ให้ผู้ใช้เลือกโฟลเดอร์
 *
 * สำคัญ: นี่คือวิธีเดียวที่แอปซึ่งใช้ scope `drive.file` จะเข้าถึงไฟล์ที่มีอยู่ก่อนได้
 * การเลือกโฟลเดอร์ = มอบสิทธิ์โฟลเดอร์นั้นและสิ่งที่อยู่ข้างในให้แอปอย่างถาวร
 */
export async function pickFolder(): Promise<PickedFolder | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error(
      'ยังไม่ได้ตั้ง NEXT_PUBLIC_GOOGLE_API_KEY / NEXT_PUBLIC_GOOGLE_CLIENT_ID — ดู DEPLOY.md ขั้น 3.6'
    );
  }

  await ensureLoaded();

  // Picker ต้องใช้ access token ฝั่ง client จึงขอ token ชั่วคราวแยกจาก session ของ Auth.js
  const token = await new Promise<string>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (r: any) => (r.access_token ? resolve(r.access_token) : reject(new Error('ไม่ได้รับสิทธิ์'))),
      error_callback: () => reject(new Error('ผู้ใช้ปิดหน้าต่างขอสิทธิ์')),
    });
    client.requestAccessToken({ prompt: '' });
  });

  return new Promise((resolve) => {
    const g = (window as any).google;
    const view = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    const picker = new g.picker.PickerBuilder()
      .setTitle('เลือกโฟลเดอร์ Calibre library')
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === g.picker.Action.PICKED) {
          const doc = data.docs[0];
          resolve({ id: doc.id, name: doc.name });
        } else if (data.action === g.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
