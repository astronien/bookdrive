# BookDrive

โคลน BookFusion ที่ใช้ **Google Drive ของผู้ใช้เอง** เป็นที่เก็บทั้งหมด — ไม่มี DB ฝั่งเซิร์ฟเวอร์

| | |
|---|---|
| ไฟล์หนังสือ | **Calibre library เดิมของคุณใน Drive** (อ่านอย่างเดียว ไม่แตะต้อง) |
| ปก + metadata | `cover.jpg` / `metadata.opf` ที่ Calibre วางไว้ให้อยู่แล้ว |
| metadata, progress, ไฮไลต์ | `appDataFolder` (พื้นที่ซ่อนของแอป) |
| เซิร์ฟเวอร์ | stateless proxy ล้วน — ถือแค่ OAuth token |

อ่านรายละเอียดการออกแบบเต็มที่ [`ARCHITECTURE.md`](./ARCHITECTURE.md)
ดูหน้าตา UI ที่คลิกเล่นได้ที่ [`mockup.html`](./mockup.html)
ขั้นตอน deploy ขึ้น Vercel + ตั้ง Google OAuth: [`DEPLOY.md`](./DEPLOY.md)

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env.local   # แล้วเติมค่าให้ครบ
npm run dev
```

### ตั้งค่า Google Cloud

1. สร้างโปรเจกต์ที่ [console.cloud.google.com](https://console.cloud.google.com)
2. เปิด **Google Drive API** และ **Google Picker API**
3. OAuth consent screen → เพิ่ม scope:
   - `.../auth/drive.file`
   - `.../auth/drive.appdata`
   > อย่าใช้ `drive` หรือ `drive.readonly` — เป็น restricted scope ต้องผ่าน CASA assessment
4. Credentials → OAuth client ID (Web) → redirect URI: `http://localhost:3000/api/auth/callback/google`
5. คัดลอก Client ID / Secret ลง `.env.local`

## โครงสร้าง

```
app/
  (app)/library      ไลบรารีแบบ grid
  (app)/read/[id]    reader เต็มจอ
  api/auth           Auth.js + refresh token rotation
  api/drive/list     สแกนโฟลเดอร์ Books
  api/drive/file/    สตรีมไฟล์หนังสือ (ไม่ buffer ทั้งก้อน)
  api/drive/appdata/ อ่าน/เขียน JSON พร้อม If-Match กัน lost update
lib/
  drive/    ชั้นเรียก Drive API
  sync/     debounce queue + merge (CRDT-lite)
  db/       Dexie: cache metadata + blob หนังสือ (ออฟไลน์)
  parse/    แตก metadata + ปกจาก EPUB (ไม่ง้อ epub.js)
  store/    Zustand
```

## สถานะ

- [x] OAuth + refresh token
- [x] เชื่อม Calibre library ผ่าน Google Picker → สแกนแบบ batch → อ่าน metadata.opf
- [x] รวมหลายฟอร์แมตของเล่มเดียวกันเป็นการ์ดเดียว สลับตอนเปิดอ่าน
- [x] EPUB reader + บันทึกตำแหน่งอ่าน (CFI)
- [x] Sync engine + conflict merge
- [x] Cache ออฟไลน์ (IndexedDB)
- [ ] PDF reader (pdf.js virtualized)
- [x] หน้า /settings และ /highlights
- [ ] UI ไฮไลต์ในหน้าอ่าน (หน้ารวมพร้อมแล้ว รอตัวที่สร้างข้อมูล)
- [ ] Service Worker / PWA
- [ ] CBZ/CBR, TTS, export Markdown

## หมายเหตุสำคัญ

- **Vercel มี limit 4.5 MB บน response ของ Serverless Function** → `api/drive/file/[id]` ต้อง stream (ทำแล้ว) และถ้าไฟล์ใหญ่มากควรย้ายไป Edge runtime หรือใช้ signed URL
- **appDataFolder ถูกลบเมื่อผู้ใช้ถอนสิทธิ์แอป** → ควรเปิดตัวเลือกสำรอง `backup.json` ในโฟลเดอร์ปกติ
- **MOBI** ไม่มี lib JS ที่ดี — แนะนำแปลงเป็น EPUB ตอน ingest
