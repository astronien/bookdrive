# BookDrive — สถาปัตยกรรมระบบ

> โคลน BookFusion ที่ใช้ **Google Drive ของผู้ใช้เอง** เป็นที่เก็บข้อมูลทั้งหมด
> ไม่มีฐานข้อมูลฝั่งเซิร์ฟเวอร์ — ผู้ใช้เป็นเจ้าของข้อมูล 100%

- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind
- **Storage:** Google Drive (ไฟล์หนังสือ + metadata + progress + highlights)
- **Reader:** epub.js (EPUB) / pdf.js (PDF)
- **Offline:** IndexedDB + Service Worker

---

## 1. ภาพรวมสถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React)                                        │
│                                                         │
│  ┌───────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │  Library  │  │   Reader   │  │  Google Picker   │   │
│  │   Grid    │  │ epub/pdf.js│  │  (เลือกโฟลเดอร์)  │   │
│  └─────┬─────┘  └──────┬─────┘  └────────┬─────────┘   │
│        │               │                  │             │
│  ┌─────┴───────────────┴──────────────────┴─────────┐   │
│  │  LibraryStore (Zustand) — single source of truth │   │
│  └─────┬────────────────────────────────────┬───────┘   │
│        │                                    │           │
│  ┌─────┴──────────┐               ┌─────────┴────────┐  │
│  │  IndexedDB     │               │   SyncEngine     │  │
│  │  (cache+blobs) │◄──────────────┤  (debounced)     │  │
│  └────────────────┘               └─────────┬────────┘  │
└─────────────────────────────────────────────┼───────────┘
                                              │ fetch
┌─────────────────────────────────────────────┼───────────┐
│  Next.js Route Handlers (server)            ▼           │
│  /api/drive/*  — ถือ access token, proxy ทุก request     │
│  /api/auth/*   — Auth.js (Google OAuth + refresh)       │
└─────────────────────────────────────────────┬───────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │  Google Drive API │
                                    └───────────────────┘
```

**หลักการสำคัญ:** access token **ไม่เคยออกไปถึงเบราว์เซอร์** ทุก request ไป Drive
วิ่งผ่าน route handler ฝั่งเซิร์ฟเวอร์ ซึ่งอ่าน token จาก encrypted session cookie

---

## 2. โครงสร้างข้อมูลบน Google Drive

ใช้ **2 พื้นที่** ที่มีบทบาทต่างกัน:

### 2.1 โฟลเดอร์ที่ผู้ใช้เห็น — `BookDrive/`

```
My Drive/
└── BookDrive/
    ├── Books/
    │   ├── sapiens.epub
    │   ├── clean-code.pdf
    │   └── one-piece-vol1.cbz
    └── Covers/            ← สร้างอัตโนมัติ (thumbnail 400px)
        ├── <bookId>.jpg
        └── ...
```

ผู้ใช้ลากไฟล์ใส่ `Books/` จาก Drive โดยตรงได้ → แอปจะเจอตอน scan ครั้งถัดไป
นี่คือข้อได้เปรียบเหนือ BookFusion: **ไม่ต้องอัปโหลดผ่านแอป**

### 2.2 `appDataFolder` — พื้นที่ซ่อนของแอป

```
appDataFolder/
├── library.json           ← index ของหนังสือทั้งหมด (~1 KB/เล่ม)
├── shelves.json           ← bookshelves, collections, tags
├── settings.json          ← ธีม ฟอนต์ ระยะขอบ ฯลฯ
└── books/
    └── <bookId>/
        ├── progress.json     ← ตำแหน่งอ่านล่าสุด (เขียนบ่อย)
        └── annotations.json  ← highlights, notes, bookmarks
```

> แยก `progress.json` ออกจาก `library.json` เพราะ progress ถูกเขียนทุก ~10 วินาที
> ถ้ารวมไว้ไฟล์เดียวจะชน quota และเกิด write conflict ตลอดเวลา

### 2.3 Schema

```ts
// library.json
type Library = {
  version: 2;
  updatedAt: string;          // ISO
  deviceId: string;           // ตัวที่เขียนล่าสุด
  books: Book[];
};

type Book = {
  id: string;                 // uuid v4 (ของเราเอง ไม่ใช่ Drive fileId)
  driveFileId: string;        // ไฟล์จริงใน BookDrive/Books/
  driveModifiedTime: string;  // ไว้ตรวจว่าไฟล์ถูกแก้จากนอกแอป
  format: 'epub' | 'pdf' | 'cbz' | 'cbr' | 'mobi' | 'txt';
  size: number;

  title: string;
  authors: string[];
  series?: { name: string; index: number };
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  description?: string;

  coverFileId?: string;       // ใน BookDrive/Covers/
  coverPalette?: string;      // hex เด่นของปก ไว้ทำ gradient

  tags: string[];
  shelfIds: string[];
  rating?: 1|2|3|4|5;

  addedAt: string;
  lastOpenedAt?: string;
  status: 'unread' | 'reading' | 'finished' | 'abandoned';

  // สรุปย่อ — ของจริงอยู่ใน books/<id>/progress.json
  percent: number;            // 0–100
};

// progress.json
type Progress = {
  bookId: string;
  updatedAt: string;
  deviceId: string;
  percent: number;
  epubCfi?: string;           // ตำแหน่งแม่นยำสำหรับ EPUB
  pdfPage?: number;
  pdfScrollTop?: number;
  totalReadingMs: number;
  sessions: { start: string; ms: number }[];  // เก็บ 50 รายการล่าสุด
};

// annotations.json
type Annotations = {
  bookId: string;
  updatedAt: string;
  items: Annotation[];
};

type Annotation = {
  id: string;
  type: 'highlight' | 'note' | 'bookmark';
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  cfi?: string;               // EPUB
  pdfRect?: { page: number; x: number; y: number; w: number; h: number };
  text: string;               // ข้อความที่ไฮไลต์
  note?: string;              // คอมเมนต์ผู้ใช้
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;          // tombstone — ไว้ merge ข้ามเครื่อง
};
```

---

## 3. OAuth & สิทธิ์ (จุดที่พลาดกันบ่อยที่สุด)

### Scopes ที่ใช้

| Scope | ประเภท | ใช้ทำอะไร |
|---|---|---|
| `openid email profile` | non-sensitive | ล็อกอิน |
| `drive.file` | **non-sensitive** | อ่าน/เขียนเฉพาะไฟล์ที่แอปสร้าง หรือผู้ใช้เลือกผ่าน Picker |
| `drive.appdata` | non-sensitive | เก็บ metadata ในพื้นที่ซ่อน |

**อย่าใช้ `drive.readonly` หรือ `drive` เต็ม** — สองตัวนั้นเป็น *restricted scope*
ต้องผ่าน CASA security assessment (แพง เสียเวลาหลายสัปดาห์) ก่อนเปิดใช้จริง
ส่วน 3 ตัวข้างบนขึ้น production ได้ทันทีหลัง verification ธรรมดา

### ปัญหา `drive.file` และทางแก้

`drive.file` ให้สิทธิ์แบบ *per-file* — แอปมองไม่เห็นไฟล์ที่มีอยู่แล้วใน Drive
ทางแก้คือ **Google Picker API**:

```
ผู้ใช้กด "เชื่อมโฟลเดอร์"
  → เปิด Google Picker (setIncludeFolders + setSelectFolderEnabled)
  → ผู้ใช้เลือกโฟลเดอร์ BookDrive/Books
  → Picker คืน folderId พร้อม "มอบสิทธิ์" โฟลเดอร์นั้นให้แอป
  → หลังจากนี้ files.list?q='<folderId>' in parents ใช้ได้ตามปกติ
```

สิทธิ์นี้ติดถาวรกับ OAuth client จนกว่าผู้ใช้จะถอน — ไม่ต้องเลือกใหม่ทุกครั้ง

### Refresh token

```ts
// auth.ts — Auth.js v5
Google({
  authorization: {
    params: {
      scope: 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
      access_type: 'offline',   // ต้องมี ไม่งั้นไม่ได้ refresh_token
      prompt: 'consent',        // บังคับให้ออก refresh_token ใหม่
    },
  },
})
```

JWT callback ต่ออายุ token เองเมื่อเหลือ < 5 นาที และเก็บ `refresh_token` ไว้ใน
encrypted JWT cookie ถ้า refresh ล้มเหลว (ผู้ใช้ถอนสิทธิ์) ให้ตั้ง `session.error`
แล้วฝั่ง client เด้งไปหน้า re-consent

---

## 4. Sync Engine

### 4.1 Flow การเขียน

```
ผู้ใช้ไฮไลต์ข้อความ
  → เขียน IndexedDB ทันที (UI อัปเดตทันที — optimistic)
  → ใส่คิว dirty: { scope: 'annotations', bookId }
  → debounce 3 วินาที / หรือ flush ทันทีตอน visibilitychange = hidden
  → PATCH ไฟล์บน Drive พร้อม If-Match: <etag>
      ├─ 200 → เก็บ etag ใหม่ ล้าง dirty flag
      └─ 412 (Precondition Failed) → มีเครื่องอื่นเขียนแซง → เข้า merge
```

### 4.2 Conflict resolution

| ข้อมูล | กลยุทธ์ |
|---|---|
| `progress.json` | **Last-write-wins ตาม `updatedAt`** — แต่ถ้าอ่านไปไกลกว่า ให้ยึดตัวที่ `percent` มากกว่า (คนมักไม่ได้อ่านถอยหลัง) |
| `annotations.json` | **CRDT-lite** — merge ตาม `id` ใช้ `updatedAt` ตัดสินรายรายการ ลบใช้ tombstone (`deleted: true`) เก็บ 90 วันแล้วค่อย purge |
| `library.json` | merge ตาม `book.id` field-level last-write-wins |

โค้ด merge อยู่ที่ `lib/sync/merge.ts` — เขียน pure function ล้วน เทสง่าย

### 4.3 ตรวจการเปลี่ยนแปลงจากเครื่องอื่น

ใช้ **Drive Changes API** แทน polling ทั้งโฟลเดอร์:

```ts
// ครั้งแรก
const { startPageToken } = await drive.changes.getStartPageToken();
// ทุก 60 วินาที (หรือตอนกลับมา focus)
const { changes, newStartPageToken } = await drive.changes.list({
  pageToken, spaces: 'appDataFolder,drive', fields: '...'
});
```

ประหยัด quota กว่า `files.list` มาก และจับได้ทั้งไฟล์หนังสือที่ผู้ใช้ลากใส่เอง

### 4.4 Quota

Drive API ให้ 12,000 queries / นาที / user — เหลือเฟือ
แต่ควรระวัง: **อย่า PATCH progress ทุกหน้าที่พลิก** ใช้ debounce 10 วินาที + flush ตอนปิด

---

## 5. Ingest Pipeline (เพิ่มหนังสือใหม่)

```
1. scan   — files.list ในโฟลเดอร์ Books, กรอง mimeType ที่รองรับ
2. diff   — ตัด driveFileId ที่มีใน library.json อยู่แล้วออก
3. parse  — ดาวน์โหลดไฟล์ (client-side) แล้วแตก metadata
             EPUB → อ่าน META-INF/container.xml → OPF → title/author/cover
             PDF  → pdf.js getMetadata() + render หน้า 1 เป็นปก
             CBZ  → unzip, เอาภาพแรกเป็นปก
4. cover  — resize เป็น 400px JPEG q80 ด้วย canvas → อัปโหลดเข้า Covers/
5. commit — append เข้า library.json แล้ว sync
```

ทำฝั่ง client ทั้งหมด → เซิร์ฟเวอร์เป็น stateless proxy ล้วน โฮสต์บน Vercel free tier ได้
ถ้าไลบรารีใหญ่มาก (>500 เล่ม) ให้ยัด step 3–4 ลง Web Worker พร้อมกัน 3 ไฟล์

**Metadata เสริม:** ถ้า EPUB ไม่มีข้อมูลครบ ยิง Open Library API ด้วย ISBN
(`https://openlibrary.org/isbn/{isbn}.json`) — ฟรี ไม่ต้องใช้ API key

---

## 6. Reader

### EPUB — epub.js

```ts
const book = ePub(arrayBuffer);
const rendition = book.renderTo(el, {
  flow: 'paginated',        // หรือ 'scrolled-doc'
  width: '100%', height: '100%',
  spread: 'auto',           // 2 หน้าบนจอกว้าง
});
await rendition.display(progress.epubCfi ?? undefined);

rendition.on('relocated', (loc) => {
  save({ epubCfi: loc.start.cfi, percent: book.locations.percentageFromCfi(loc.start.cfi) * 100 });
});
```

- ต้อง `book.locations.generate(1600)` ครั้งแรกเพื่อคำนวณ % → cache ผลลง IndexedDB (ช้า 2–5 วิ)
- Theme ฉีดผ่าน `rendition.themes.register()` — ไม่ยุ่งกับ CSS ของหนังสือ
- ไฮไลต์ใช้ `rendition.annotations.highlight(cfi, {}, cb, className)`

### PDF — pdf.js

- Virtualized scroll: render เฉพาะหน้าที่อยู่ใน viewport ± 2
- Text layer เปิดไว้เพื่อให้เลือกข้อความ/ไฮไลต์/ค้นหาได้
- ตำแหน่งเก็บเป็น `{ page, scrollTop }` ไม่ใช่ % เพราะแม่นกว่า

### ตัวเลือกในเมนู Reader (ตาม BookFusion)

ฟอนต์ (Serif/Sans/Dyslexic) · ขนาด · line-height · ระยะขอบ · ความกว้างคอลัมน์ ·
ธีม (Light / Sepia / Dark / Black-OLED) · จัดหน้าแบบเลื่อน/พลิก · TTS (Web Speech API)

---

## 7. Offline

| ชั้น | เก็บอะไร |
|---|---|
| Service Worker (Workbox) | app shell, JS/CSS bundle |
| IndexedDB `books` store | ไฟล์หนังสือเป็น Blob (ผู้ใช้กด "ดาวน์โหลด" เอง) |
| IndexedDB `meta` store | library.json, progress, annotations ทุกเล่ม |
| IndexedDB `outbox` store | คิวการเขียนที่ยังไม่ได้ sync |

เปิดแอปแบบออฟไลน์ → อ่านจาก IndexedDB ล้วน ทำงานได้เต็มรูปแบบ
พอกลับมาออนไลน์ → `outbox` flush อัตโนมัติ (ใช้ Background Sync API ถ้ามี)

ควรจำกัดโควตา: `navigator.storage.estimate()` แล้วเตือนเมื่อใช้เกิน 80%

---

## 8. โครงสร้างโปรเจกต์

```
bookdrive/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              ← sidebar + topbar
│   │   ├── library/page.tsx        ← grid/list ของหนังสือ
│   │   ├── shelves/[id]/page.tsx
│   │   ├── book/[id]/page.tsx      ← หน้ารายละเอียด
│   │   ├── read/[id]/page.tsx      ← reader เต็มจอ
│   │   ├── highlights/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       └── drive/
│           ├── list/route.ts
│           ├── file/[id]/route.ts      ← GET stream, PATCH content
│           ├── appdata/[name]/route.ts ← GET/PUT พร้อม If-Match
│           └── upload/route.ts         ← resumable upload
├── components/
│   ├── library/{BookCard,BookGrid,FilterBar,ProgressRing}.tsx
│   ├── reader/{EpubReader,PdfReader,ReaderToolbar,SettingsPanel,HighlightMenu}.tsx
│   └── ui/                             ← shadcn/ui
├── lib/
│   ├── auth.ts
│   ├── drive/{client,appdata,picker,changes}.ts
│   ├── sync/{engine,merge,outbox}.ts
│   ├── parse/{epub,pdf,cbz,cover}.ts
│   ├── db/idb.ts                       ← Dexie
│   └── store/library.ts                ← Zustand
└── public/sw.js
```

---

## 9. Design System (ให้เหมือน BookFusion)

```css
--bf-navy:      #191d44;   /* sidebar / topbar — สีธีมจริงของ BookFusion */
--bf-navy-2:    #232a5c;   /* hover */
--bf-accent:    #4ecdc4;   /* teal — ปุ่มหลัก, progress ring */
--bf-accent-2:  #ff6b6b;   /* coral — badge, ลบ */
--bf-bg:        #f5f6fa;
--bf-surface:   #ffffff;
--bf-text:      #1a1c2e;
--bf-muted:     #8b90a8;
```

**เลย์เอาต์:** sidebar 260px คงที่ (พับเป็นไอคอน 64px ได้) · topbar 64px มี search กลาง
· เนื้อหาเป็น grid `repeat(auto-fill, minmax(168px, 1fr))` · ปกอัตราส่วน 2:3 มุมโค้ง 8px
เงา `0 4px 16px rgba(25,29,68,.12)` · progress bar หนา 3px ทับล่างของปก

รายละเอียดเต็มดูได้จาก `mockup.html` (คลิกเล่นได้จริง)

---

## 10. Roadmap

| เฟส | ขอบเขต | ประมาณเวลา |
|---|---|---|
| **M1** | OAuth + Picker + scan โฟลเดอร์ + library grid + EPUB reader + progress sync | 3–4 สัปดาห์ |
| **M2** | PDF reader + highlights/notes + offline (IndexedDB + SW) | 3 สัปดาห์ |
| **M3** | Bookshelves/tags/series + ค้นหาเต็มข้อความ + หน้า Highlights รวม | 2 สัปดาห์ |
| **M4** | CBZ/CBR + TTS + export ไป Markdown/Readwise + PWA installable | 2 สัปดาห์ |
| **M5** | Calibre plugin (Python) อัปโหลดเข้า Drive โดยตรง | 2 สัปดาห์ |

---

## 11. ข้อควรระวัง

1. **CORS** — เรียก `googleapis.com` ตรงจากเบราว์เซอร์ไม่ได้ (สำหรับ download ที่ต้องใช้ header auth) ต้องผ่าน route handler เสมอ
2. **ไฟล์ใหญ่** — EPUB/PDF บางเล่ม 100+ MB ให้ route handler ใช้ `ReadableStream` ไม่ใช่ buffer ทั้งก้อน Vercel จำกัด response 4.5 MB เฉพาะ **response ที่ไม่ stream** เท่านั้น ถ้า stream ตั้งแต่ต้น (อย่างที่ `api/drive/file/[id]` ทำ) จะไม่ติด limit นี้ ไม่ว่าจะรันบน Node หรือ Edge runtime — แต่ยังต้องระวัง max duration ของ plan ที่ใช้
3. **MOBI** — ไม่มี lib JS ที่ดีจริง แนะนำแปลงเป็น EPUB ตอน ingest ด้วย `foliate-js` หรือบอกผู้ใช้ให้แปลงเอง
4. **DRM** — ไฟล์ที่มี Adobe DRM เปิดไม่ได้ ต้องตรวจแล้วแจ้งผู้ใช้ให้ชัด อย่าพยายามถอด
5. **Google verification** — แอปที่ใช้ Drive scope ต้องผ่าน OAuth verification ก่อนเกิน 100 ผู้ใช้ ยื่นเนิ่นๆ (ใช้เวลา 2–6 สัปดาห์)
6. **appDataFolder หายเมื่อถอนแอป** — ผู้ใช้ถอนสิทธิ์ = ข้อมูลใน appDataFolder ถูกลบ ควรมีปุ่ม export/backup ลง `BookDrive/backup.json` ในโฟลเดอร์ปกติด้วย
