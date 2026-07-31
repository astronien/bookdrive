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

### 2.1 แหล่งหนังสือ — Calibre library (โหมดหลัก)

BookDrive อ่านจาก **Calibre library ที่มีอยู่แล้ว** ใน Drive โดยตรง ไม่บังคับให้ย้ายไฟล์

```
My Drive/
└── Calibre Library/
    ├── metadata.db                    ← ไม่ได้ใช้ (ดูหมายเหตุ)
    └── Yuval Noah Harari/
        └── Sapiens (142)/
            ├── Sapiens - Yuval Noah Harari.epub
            ├── Sapiens - Yuval Noah Harari.pdf   ← เล่มเดียวกัน คนละฟอร์แมต
            ├── cover.jpg
            └── metadata.opf
```

**อ่าน `metadata.opf` ไม่ใช่ `metadata.db`** — Calibre เขียน opf ทิ้งไว้ทุกโฟลเดอร์หนังสือ
และในนั้นมี title, authors, series + series_index, tags, rating, ISBN, publisher, description ครบ
ได้ข้อมูลเกือบเท่า db โดยไม่ต้องโหลด sql.js (~1 MB wasm) และไม่ต้องดาวน์โหลดตัว db ทั้งก้อน

**การยุบรวมมีสองชั้น ซึ่งคนละเรื่องกัน**

1. **หลายฟอร์แมตของเล่มเดียวกัน** (epub + pdf + mobi อยู่โฟลเดอร์เดียวกัน)
   → ยุบเป็น `Book` เดียวที่มี `files: BookFile[]` สลับฟอร์แมตได้ตอนเปิดอ่าน
2. **หลายเล่มในชุดเดียวกัน** (`calibre:series` + `calibre:series_index` ใน opf)
   → ยุบเป็นการ์ดเดียวในหน้าไลบรารี คลิกเข้าไปที่ `/series/[name]` เพื่อเลือกเล่ม
   ชุดที่มีเล่มเดียวไม่ยุบ เพราะบังคับให้คลิกเพิ่มโดยไม่ได้อะไรกลับมา

**อ่านอย่างเดียว** ไม่เขียนอะไรกลับเข้าโฟลเดอร์ Calibre เด็ดขาด — ถ้าไปแก้ `metadata.db`
หรือ `metadata.opf` จะชนกับตัว Calibre เองตอนผู้ใช้เปิดโปรแกรมที่เครื่อง แล้วพังทั้งไลบรารีได้
progress/ไฮไลต์ทั้งหมดจึงอยู่ใน `appDataFolder` แยกต่างหาก

**การให้สิทธิ์ — จุดที่ต้องยอมแลก** ตอนแรกออกแบบให้ใช้ `drive.file` + Google Picker
เพราะเป็น non-sensitive scope ที่ขึ้น production ได้ทันที แต่ทดสอบจริงแล้วพบว่า
**`drive.file` ให้สิทธิ์เฉพาะสิ่งที่ผู้ใช้เลือก และไม่ลามลงไปในโฟลเดอร์ลูก**

```
files.get(โฟลเดอร์ที่เลือก)        → 200 OK
files.list('โฟลเดอร์' in parents)  → 0 รายการ
```

จึงสแกนไลบรารีที่มีอยู่ก่อนแล้วไม่ได้เลย ต้องเปลี่ยนไปใช้ **`drive.readonly`** ซึ่งเป็น
*restricted scope* แลกกับ:

| ข้อจำกัด | ผลกระทบ |
|---|---|
| ต้องอยู่ใน Testing mode | จำกัด 100 test user |
| refresh token อายุ 7 วัน | ต้องล็อกอินใหม่ทุกสัปดาห์ |
| จะ publish ต้องผ่าน CASA Tier 2 | audit เสียเงิน ใช้เวลาหลายสัปดาห์ |
| แอปอ่าน Drive ได้ทั้งบัญชี | กว้างกว่าที่ต้องการจริง |

รับได้สำหรับเครื่องมือส่วนตัว ถ้าจะทำเป็นผลิตภัณฑ์จริงต้องกลับไปทาง `drive.file`
แล้วให้ Calibre plugin อัปโหลดผ่านแอปเอง (ไฟล์ที่แอปสร้างเองเข้าถึงได้โดยไม่ต้องเลือก)

ผลพลอยได้: ไม่ต้องใช้ Google Picker, API key, referrer restriction และ `setAppId` อีกต่อไป
การเลือกโฟลเดอร์เปลี่ยนเป็นช่องค้นหาที่ query Drive ตรง ๆ

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

## 5. Ingest Pipeline (สแกน Calibre library)

```
1. walk    — BFS หาโฟลเดอร์ทั้งหมดใต้ library root
             ยิง files.list แบบ batch ครั้งละ 30 parents (`'a' in parents or 'b' in parents ...`)
             ทำขนานทีละ 4 ชุด — ไลบรารี 1,000 เล่มใช้ราว 60 request
   **ห้ามกรองด้วย `name contains` ใน query** — Drive ทำ prefix matching เท่านั้นสำหรับ
   field `name` ดังนั้น `name contains '.opf'` จะไม่มีวันแมตช์ `metadata.opf`
   และห้ามกรองด้วย mimeType อย่างเดียวเพราะไฟล์ที่อัปผ่านหน้าเว็บมักเป็น octet-stream
   ดึงไฟล์มาทั้งหมดแล้วคัดแยกในโค้ด (mimeType ก่อน แล้วค่อยดูนามสกุล)
2. group   — โฟลเดอร์ไหนมีไฟล์อีบุ๊ก ≥ 1 ไฟล์ = หนังสือหนึ่งเล่ม
             เกณฑ์นี้ไม่ผูกกับ Author/Title/ เป๊ะๆ จึงรองรับไลบรารีที่ถูกจัดใหม่ด้วย
3. diff    — ตัดโฟลเดอร์ที่มีใน library.json อยู่แล้วออก (เทียบด้วย Drive folderId)
4. opf     — ดาวน์โหลด metadata.opf ของเล่มใหม่ ทีละ 8 ไฟล์พร้อมกัน พร้อมรายงานความคืบหน้า
             ถ้า opf พังหรือไม่มี ถอยไปใช้ชื่อโฟลเดอร์ ("Sapiens (142)" -> "Sapiens")
             และชื่อโฟลเดอร์แม่เป็นชื่อผู้เขียน
5. cover   — ใช้ cover.jpg ที่ Calibre วางไว้ให้แล้ว ไม่ต้องแกะจาก EPUB
6. commit  — append เข้า library.json แล้ว sync
```

**ทำไมไม่ recursive แบบธรรมดา** Drive API ไม่มี query แบบ "ทุกอย่างใต้โฟลเดอร์นี้"
ถ้าไล่ทีละโฟลเดอร์จะเป็น N+1 request (ไลบรารี 1,000 เล่ม = 1,200+ request)
การ batch parent หลายตัวต่อ query ลดเหลือหลักสิบ

**Metadata เสริม** ถ้า opf ไม่มี ISBN ยิง Open Library API (`https://openlibrary.org/isbn/{isbn}.json`)

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

### PDF — pdf.js

**สร้างกล่องเปล่าครบทุกหน้าก่อน แล้วค่อยวาดเฉพาะหน้าที่ใกล้ viewport**
ถ้าวาดทั้งเล่มทีเดียว ไฟล์ 600 หน้าจะกินแรมระดับกิกะไบต์ ใช้ `IntersectionObserver`
(rootMargin 900px) คอยเติมและคืนหน้าที่เลื่อนพ้นไปเกิน 4 หน้า
กล่องเปล่าถูกกำหนด `aspect-ratio` จากหน้าแรก scrollbar จึงยาวถูกต้องตั้งแต่วินาทีแรก

**worker ต้องเป็นเวอร์ชันเดียวกับ API เป๊ะ ๆ** จึงประกอบ URL จาก `pdfjs.version` ที่รันไทม์
แทนที่จะฮาร์ดโค้ด ถ้าเวอร์ชันไม่ตรงจะพังแบบเงียบ ๆ หาสาเหตุยาก

### การตั้งค่าการอ่านเก็บใน localStorage ไม่ใช่ Drive

ตั้งใจให้เป็นค่าของ *เครื่อง* ไม่ใช่ของบัญชี — ขนาดตัวอักษรกับความกว้างคอลัมน์
ที่พอดีบนจอ 27 นิ้ว ไม่มีทางพอดีบนมือถือ ต่างจาก progress/ไฮไลต์ที่ต้องตามไปทุกเครื่อง

### ตัวเลือกในเมนู Reader (ตาม BookFusion)

ฟอนต์ (Serif/Sans/Dyslexic) · ขนาด · line-height · ระยะขอบ · ความกว้างคอลัมน์ ·
ธีม (Light / Sepia / Dark / Black-OLED) · จัดหน้าแบบเลื่อน/พลิก · TTS (Web Speech API)

---

## 6.4 การ์ดเอียงตามเมาส์ (`components/ui/TiltCard.tsx`)

เอฟเฟกต์แบบหน้า Apple TV — การ์ดเอียง 3 มิติตามตำแหน่งเมาส์ พร้อมแสงสะท้อนที่วิ่งตาม
และป้าย/ชั้นซ้อนที่ขยับคนละระยะ (parallax)

**ห้ามใช้ React state เก็บตำแหน่งเมาส์** ไลบรารีมีการ์ดหลายร้อยใบในกริดเดียว
ถ้า `setState` ทุก `pointermove` จะ re-render ทั้งกริดวินาทีละหลายสิบครั้ง
วิธีที่ใช้คือเขียน CSS custom property (`--rx`, `--ry`, `--mx`, `--my`) ลง DOM ตรง ๆ
แล้ว throttle ด้วย `requestAnimationFrame` เพราะ pointermove ยิงถี่กว่าเฟรมเรตจอ

**หนังสือเป็นกล่องจริง ไม่ใช่ระนาบที่หมุน** (`components/ui/Book3D.tsx`)
ระนาบเดียวที่ rotateY จะดูเป็นกระดาษแข็งบาง ๆ พลิกไปมา ไม่มีวันเห็นสัน
จึงประกอบเป็นกล่อง 5 ด้าน — หน้าปก หลังปก สัน ขอบกระดาษด้านเปิด ขอบกระดาษด้านบน
เอียงขวาเห็นสันปกพร้อมชื่อเรื่องแนวตั้ง เอียงซ้ายเห็นขอบกระดาษ เงยขึ้นเห็นขอบบน

ความหนาผันตามขนาดไฟล์จริง (log scale 13–33px) ถ้าทุกเล่มหนาเท่ากันจะดูเป็นของปลอมทันที

ลำดับ transform สำคัญมาก: `translateZ(...) rotateY(-90deg)` ไม่เท่ากับสลับที่กัน
ตัวขวาสุดถูกใช้กับ geometry ก่อน ถ้าเอา rotateY ไว้ซ้าย translateZ จะเลื่อนในระนาบ
ที่หมุนไปแล้ว ทำให้หน้าไปโผล่ผิดที่

**สายโซ่ 3D ขาดง่ายกว่าที่คิด — ทุกชั้นระหว่าง perspective กับหน้าของกล่องต้องรอด**

ตรวจของจริงบน production แล้วพบว่ากล่องถูกกดแบนเพราะ div ที่คั่นอยู่ชั้นเดียว:

```
.tilt-inner   preserve-3d  ✓
  div         flat + filter: drop-shadow(...)   ← ฆ่า 3D สองต่อ
    .book3d   preserve-3d  (สายขาดไปแล้ว ไม่มีผล)
```

1. `transform-style` มีค่าเริ่มต้นเป็น `flat` ชั้นที่ไม่ได้ประกาศจะยุบลูกลงมาระนาบเดียว
2. **`filter` บังคับ flatten ทับ `preserve-3d`** ต่อให้ประกาศไว้ก็ไม่ช่วย
   คลาสอย่าง `drop-shadow-*` หรือ `blur-*` จึงห้ามอยู่ในสายโซ่นี้เด็ดขาด
   เงาต้องทำเป็นแผ่นเบลอที่วางอยู่ในระบบ 3D แทน (`.b-shadow`)

`overflow` ที่ไม่ใช่ `visible` ก็ตัด `preserve-3d` เหมือนกัน ป้ายที่ต้องการความลึก
จึงต้องวางเป็นพี่น้องกับกล่องที่ครอบรูป ไม่ใช่วางไว้ข้างใน

**`overflow-hidden` ตัด `preserve-3d` ทิ้ง** ป้ายที่ต้องการความลึกจึงต้องวางเป็นพี่น้อง
กับกล่องที่ครอบรูป ไม่ใช่วางไว้ข้างใน ไม่งั้น `translateZ` จะไม่มีผลเลย

ปิดอัตโนมัติบนจอสัมผัส (ไม่มี hover) และเมื่อผู้ใช้ตั้ง `prefers-reduced-motion`

## 6.5 ห้องอ่านหนังสือ 3 มิติ (`/room`)

โหมดเสริมสำหรับเดินดูชั้นหนังสือแบบ first-person ด้วย three.js

**สไตล์ภาพ** ใช้ `MeshToonMaterial` กับ gradient map 4 ขั้น (`lib/room/toon.ts`)
แสงจึงไล่เป็นขั้นแทนที่จะไล่ต่อเนื่อง ได้หน้าตา cel-shaded แบบการ์ตูน
บวก tone mapping แบบ ACES, หมอกโทนครีม, vignette กับฟิล์มอุ่นทับด้วย CSS
องค์ประกอบห้องทั้งหมดอยู่ใน `lib/room/props.ts` — หน้าต่างโค้งสามบานพร้อมลำแสง
พาดพื้นและฝุ่นลอย, คานเพดาน, โคมแขวนทองเหลือง, มุมนั่งอ่านมีเก้าอี้/โต๊ะ/ตะเกียง,
ต้นไม้กระถาง, บันไดพาดชั้น

**สันหนังสือวาดเอง ไม่ใช้ปกจริง** — `cover.jpg` เป็นภาพหน้าปก เอามาแปะบนสันจะยืดจนอ่านไม่ออก
และการโหลดรูปหลายร้อยไฟล์พร้อมกันจะยิง `/api/drive/file` ถล่มทลาย จึงสร้าง texture ด้วย
canvas: สีผ้าปกจาก hash ของ book id + ชื่อเรื่องแนวตั้งที่ย่อ/ตัดให้พอดีความสูงสัน
ปกจริงจะโหลดเฉพาะตอนหยิบเล่มขึ้นมาดู (ทีละเล่ม)

**จำกัดที่ 260 เล่ม** เพราะแต่ละเล่มมี texture ของตัวเอง (64×256) การเกินกว่านี้
ทั้งเฟรมเรตและหน่วยความจำ GPU เริ่มมีปัญหา ถ้าจะรองรับทั้งไลบรารีต้องทำ texture atlas
\+ `InstancedMesh` พร้อม per-instance UV offset ซึ่งซับซ้อนขึ้นมาก

**จำนวนตู้ผันตามจำนวนเล่ม** และหนังสือถูกกระจายให้ทุกชั้นมีจำนวนใกล้เคียงกัน
ถ้าไล่เติมชั้นล่างจนเต็มก่อน ชั้นบนจะว่างหมดและดูเหมือนห้องร้าง

**dispose ทุก texture/material ตอน unmount** — three.js ไม่เก็บกวาดให้อัตโนมัติ
ถ้าลืม GPU memory จะรั่วทุกครั้งที่เข้าออกหน้านี้

## 6.6 ผลสำรวจไลบรารีจริง — เหตุผลที่ไม่ทำ MOBI reader

สำรวจข้อมูลจริงบน production ก่อนตัดสินใจ (221 เล่ม):

| | จำนวน |
|---|---|
| มี EPUB | 220 |
| มี MOBI | 193 |
| **มี MOBI อย่างเดียว** | **0** |
| ไม่มี EPUB เลย | 1 (เป็น txt) |

**MOBI ทุกไฟล์เป็นคู่แฝดของ EPUB ที่มีอยู่แล้ว** การเขียน MOBI/AZW3 parser จึงไม่มีใครได้ใช้
`FORMAT_RANK` จัด epub ไว้อันดับแรกอยู่แล้ว `pickFile()` จึงเลือก EPUB เสมอโดยอัตโนมัติ

ตัวเลขอีกสองตัวที่กำหนดหน้าตาของตัวกรอง: มีแค่ **11/221 เล่มที่ติด tag**
แต่มี **ผู้เขียน 76 คน** และ **102 เล่มอยู่ในชุดหนังสือ** — กรองตามผู้เขียนกับชุด
จึงมีประโยชน์กว่ากรองตาม tag มาก

## 6.7 มือถือ

**แถบข้างเป็นตัวปัญหาหลัก** เดิม `<aside class="w-[252px] shrink-0">` ถูกแสดงตลอด
ไม่ว่าจอกว้างเท่าไหร่ บนมือถือ 390px จึงเหลือที่ให้เนื้อหาแค่ 138px
แก้เป็น `hidden md:flex` แล้วบนจอเล็กใช้แถบบนคงที่ + ลิ้นชักแทน
`main` ได้ `pt-14 md:pt-0` เพราะแถบบนเป็น `fixed` จึงไม่กินพื้นที่ในโฟลว์เอง

**แถวชิปกรองใช้เลื่อนแนวนอน ไม่ใช่ตัดบรรทัด** บนจอเล็กชิป 12 ตัวถ้าตัดบรรทัด
จะสูงเกือบครึ่งจอก่อนจะเห็นหนังสือสักเล่ม

**`font-size: 16px` บังคับกับ input ทุกตัวบนจอเล็ก** iOS Safari จะซูมหน้าจอเข้าเอง
ถ้า input มีตัวอักษรเล็กกว่านั้น ทำให้เลย์เอาต์เพี้ยนและผู้ใช้ต้องซูมออกเองทุกครั้ง

## 7. Offline

| ชั้น | เก็บอะไร |
|---|---|
| Service Worker (`public/sw.js`) | app shell + `/_next/static/*` |
| IndexedDB `books` store | ไฟล์หนังสือเป็น Blob (ผู้ใช้กด "ดาวน์โหลด" เอง) |
| IndexedDB `meta` store | library.json, progress, annotations ทุกเล่ม |
| IndexedDB `outbox` store | คิวการเขียนที่ยังไม่ได้ sync |

เปิดแอปแบบออฟไลน์ → อ่านจาก IndexedDB ล้วน ทำงานได้เต็มรูปแบบ
พอกลับมาออนไลน์ → `outbox` flush อัตโนมัติ (ใช้ Background Sync API ถ้ามี)

ควรจำกัดโควตา: `navigator.storage.estimate()` แล้วเตือนเมื่อใช้เกิน 80%

**service worker ไม่แคช `/api/drive/file/*`** เพราะตัวไฟล์หนังสือถูกเก็บใน IndexedDB
อยู่แล้ว ถ้าแคชซ้ำอีกชั้นจะกินโควตาเบราว์เซอร์เป็นสองเท่าโดยไม่ได้อะไรเพิ่ม

`/_next/static/*` ใช้ cache-first ได้เต็มที่เพราะ Next.js ใส่ hash ในชื่อไฟล์
เนื้อหาเปลี่ยนเมื่อไหร่ชื่อเปลี่ยนตาม ส่วนหน้าเว็บใช้ network-first แล้วถอยไปหาแคช
เพื่อไม่ให้ผู้ใช้ติดอยู่กับหน้าเก่า

**อายุ session** แอปติด Testing mode ของ Google (เพราะ restricted scope) ทำให้
refresh token อายุแค่ 7 วัน แก้ที่ต้นเหตุไม่ได้ถ้าไม่ผ่าน CASA จึงเก็บ `authAt`
ไว้ใน JWT แล้วเตือนล่วงหน้า 2 วัน แทนที่จะปล่อยให้พังตอนกำลังอ่านค้างอยู่

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
