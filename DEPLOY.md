# คู่มือ Deploy BookDrive ขึ้น Vercel

ทำตามลำดับนี้เป๊ะๆ ถ้าข้ามขั้นจะไปติดตอนล็อกอินแล้วหาสาเหตุยาก

---

## ขั้น 0 — ทำให้ build ผ่านที่เครื่องก่อน

อย่า import เข้า Vercel ก่อนขั้นนี้ผ่าน ไม่งั้นจะไปดีบั๊ก build error บนคลาวด์ซึ่งช้ากว่ามาก

```bash
cd ~/Desktop/bookdrive
npm install
npm run build
```

ถ้า build ไม่ผ่าน แก้ให้ผ่านก่อน แล้ว commit + push

```bash
git add -A && git commit -m "fix: build errors" && git push
```

---

## ขั้น 1 — Import repo เข้า Vercel

### 1.1 สร้างโปรเจกต์

1. เข้า [vercel.com](https://vercel.com) ล็อกอินด้วย GitHub
2. กด **Add New…** (มุมขวาบน) → **Project**
3. ในช่อง **Import Git Repository** หา `astronien/bookdrive`

> **ถ้าไม่เห็น repo ในลิสต์** — กด **Adjust GitHub App Permissions** ด้านล่าง
> จะเด้งไป GitHub ให้เลือกว่าจะให้ Vercel เห็น repo ไหนบ้าง
> เลือก **All repositories** หรือติ๊ก `bookdrive` เฉพาะตัว แล้วกด Save

4. กด **Import**

### 1.2 หน้าตั้งค่าก่อน deploy

| ช่อง | ค่าที่ควรเป็น |
|---|---|
| Framework Preset | `Next.js` (Vercel detect เอง ไม่ต้องแตะ) |
| Root Directory | `./` |
| Build Command | ปล่อยว่าง (ใช้ `next build` อัตโนมัติ) |
| Output Directory | ปล่อยว่าง |
| Install Command | ปล่อยว่าง |

### 1.3 กด Deploy

กดได้เลย **ไม่ต้องใส่ env var ตอนนี้** — ครั้งแรกจะ build ผ่านแต่ล็อกอินไม่ได้ ซึ่งปกติ
เพราะเราต้องรู้ domain ก่อนถึงจะไปตั้ง OAuth ได้ (ไก่กับไข่)

### 1.4 จด domain ไว้

เสร็จแล้วจะได้ URL หน้าตาประมาณ:

```
https://bookdrive-astronien.vercel.app
```

**คัดลอกเก็บไว้** เดี๋ยวใช้ในขั้น 3 — ต่อจากนี้ในเอกสารจะเรียกมันว่า `<DOMAIN>`

> ถ้าอยาก fix ชื่อให้สั้นลง: Settings → Domains → Edit
> ทำตอนนี้เลยดีกว่า เพราะถ้าเปลี่ยนทีหลังต้องกลับไปแก้ redirect URI ที่ Google อีกรอบ

---

## ขั้น 2 — ตั้ง Environment Variables

### 2.1 สร้าง AUTH_SECRET

ที่เครื่อง:

```bash
cd ~/Desktop/bookdrive
npx auth secret
```

คำสั่งนี้จะสร้าง secret แล้วเขียนลง `.env.local` ให้เลย เปิดไฟล์คัดลอกค่ามา
(หรือใช้ `openssl rand -base64 32` ก็ได้ผลเหมือนกัน)

### 2.2 ใส่ตัวแปรใน Vercel

ไปที่ **โปรเจกต์ → Settings → Environment Variables → Add New** ใส่ทีละตัว:

| Name | Value | ได้มาจากไหน |
|---|---|---|
| `AUTH_SECRET` | ค่าจาก 2.1 | สร้างเอง |
| `AUTH_GOOGLE_ID` | `xxx.apps.googleusercontent.com` | ขั้น 3.5 |
| `AUTH_GOOGLE_SECRET` | `GOCSPX-xxx` | ขั้น 3.5 |

> ~~`NEXT_PUBLIC_GOOGLE_CLIENT_ID`~~ / ~~`NEXT_PUBLIC_GOOGLE_API_KEY`~~ ไม่ต้องใช้แล้ว
> เคยใช้กับ Google Picker ซึ่งถูกถอดออกตอนเปลี่ยนไปใช้ `drive.readonly` (ดูขั้น 3.3)

**ทุกตัวติ๊กครบ 3 ช่อง: Production / Preview / Development**

### 2.3 สิ่งที่ *ไม่* ต้องใส่

- ~~`AUTH_URL`~~ — Auth.js v5 อ่าน host จาก request header เอง
- ~~`AUTH_TRUST_HOST`~~ — Auth.js detect ตัวแปร `VERCEL` แล้วเปิดให้อัตโนมัติ

ใส่ไปก็ไม่พัง แต่เป็นหนี้ที่ต้องมาตามลบตอนย้าย domain

### 2.4 Redeploy (ห้ามข้าม)

Env var ที่ขึ้นต้นด้วย `NEXT_PUBLIC_` จะถูก **ฝังลงใน bundle ตอน build**
เพิ่มเฉยๆ ไม่พอ ต้อง build ใหม่:

1. แท็บ **Deployments**
2. กด **⋯** ที่ deployment ล่าสุด → **Redeploy**
3. **ปิดติ๊ก "Use existing Build Cache"** ← สำคัญ ไม่งั้นได้ค่าเก่า
4. กด Redeploy

---

## ขั้น 3 — ตั้งค่า Google Cloud Console

UI ส่วนนี้ Google เปลี่ยนใหม่ (เดิมชื่อ "OAuth consent screen" ตอนนี้เป็น **Google Auth Platform**)
บทความเก่าๆ ในเน็ตจะอ้างเมนูที่ไม่มีแล้ว

### 3.1 สร้างโปรเจกต์ + เปิด API

1. เข้า [console.cloud.google.com](https://console.cloud.google.com)
2. มุมซ้ายบนข้างโลโก้ → เลือก/สร้างโปรเจกต์ เช่น `bookdrive`
3. เมนู ☰ → **APIs & Services** → **Library**
4. ค้น **Google Drive API** → กด **Enable**
5. ค้น **Google Picker API** → กด **Enable**

> ต้องทำขั้นนี้ก่อน — เมนู **Google Auth Platform** จะยังไม่โผล่ถ้ายังไม่ได้เปิด API สักตัว

### 3.2 ตั้ง Google Auth Platform

1. เมนู ☰ → **APIs & Services** → **Google Auth Platform**
2. เห็นข้อความ "not configured yet" → กด **Get started**
3. กรอกทีละส่วน:

| ส่วน | ใส่อะไร |
|---|---|
| **App Information** | App name: `BookDrive` · User support email: อีเมลคุณ |
| **Audience** | เลือก **External** |
| **Contact Information** | อีเมลคุณ |
| **Finish** | ติ๊กยอมรับ policy → **Create** |

> **Audience ต้องเป็น External** — `Internal` ใช้ได้เฉพาะบัญชี Google Workspace ขององค์กร
> ถ้าเลือกผิดจะล็อกอินด้วย Gmail ธรรมดาไม่ได้ และแก้ทีหลังยุ่ง

### 3.3 เพิ่ม Scopes

1. ในเมนูซ้าย → **Data Access**
2. กด **Add or remove scopes**
3. ช่อง filter พิมพ์หา แล้วติ๊กทีละตัว:

```
openid
.../auth/userinfo.email
.../auth/userinfo.profile
.../auth/drive.readonly    ← restricted — จำเป็น อ่านหมายเหตุด้านล่าง
.../auth/drive.file
.../auth/drive.appdata
```

4. กด **Update** → **Save**

> **`drive.readonly` เป็น restricted scope และเป็นทางเลือกที่ตั้งใจ ไม่ใช่ความเลินเล่อ**
>
> `drive.file` ให้สิทธิ์เฉพาะไฟล์ที่ผู้ใช้เลือกทีละอันผ่าน Picker และ **ไม่ลามลงไปในโฟลเดอร์ลูก**
> (ยืนยันแล้วด้วยการทดสอบจริง: `files.get` โฟลเดอร์สำเร็จ แต่ `files.list` ของลูกคืน 0 รายการ)
> จึงสแกน Calibre library ที่มีอยู่ก่อนแล้วไม่ได้เลย
>
> ผลที่ตามมา:
> - แอปต้องอยู่ใน **Testing mode** ตลอด (จำกัด 100 test user)
> - **refresh token ของ test user หมดอายุใน 7 วัน** ต้องล็อกอินใหม่ทุกสัปดาห์
> - ถ้าจะเปิดสาธารณะต้องผ่าน **CASA Tier 2** ซึ่งเป็น audit ที่เสียเงินและใช้เวลาหลายสัปดาห์

### 3.4 เพิ่ม Test user (ห้ามข้าม)

1. เมนูซ้าย → **Audience**
2. เลื่อนลงหา **Test users** → **Add users**
3. ใส่ `kakanajana@gmail.com` → **Save**

> แอปที่ยังเป็น Testing mode จะให้เฉพาะ test user ล็อกอินได้
> ถ้าลืมขั้นนี้จะเจอ **`Error 403: access_denied`** ตอนกดล็อกอิน

### 3.5 สร้าง OAuth Client

1. เมนูซ้าย → **Clients** → **Create client**
2. Application type: **Web application**
3. Name: `BookDrive Web`
4. **Authorized JavaScript origins** — กด ADD URI สองครั้ง:

```
http://localhost:3000
https://<DOMAIN>
```

5. **Authorized redirect URIs** — กด ADD URI สองครั้ง:

```
http://localhost:3000/api/auth/callback/google
https://<DOMAIN>/api/auth/callback/google
```

6. กด **Create** → จะเด้ง popup แสดง **Client ID** และ **Client secret**

**คัดลอกทั้งสองค่าไปใส่ Vercel ตามตารางในขั้น 2.2 ทันที** (secret ดูย้อนหลังไม่ได้ ต้อง reset ใหม่)

> path ต้องเป็น `/api/auth/callback/google` เป๊ะๆ ตัวเดียวก็ผิดไม่ได้ ไม่มี `/` ปิดท้าย
> ถ้าผิดจะเจอ **`Error 400: redirect_uri_mismatch`** — ข้อความ error จะบอก URI ที่แอปส่งไป
> คัดลอกจาก error ไปแปะใน console ได้เลย

### 3.6 ~~สร้าง API Key สำหรับ Picker~~ (ไม่ต้องแล้ว)

Google Picker ถูกถอดออกตอนเปลี่ยนไปใช้ `drive.readonly` — การเลือกโฟลเดอร์ตอนนี้ใช้
ช่องค้นหาที่ query Drive ตรง ๆ ผ่าน API ฝั่งเซิร์ฟเวอร์ ถ้าเคยสร้าง API key ไว้แล้ว
ลบทิ้งได้เลย และไม่ต้องเปิด Google Picker API อีกต่อไป

### 3.7 Redeploy อีกรอบ

กลับไปทำขั้น 2.4 ซ้ำ (ปิด build cache) เพื่อให้ค่า Client ID / API key ใหม่ถูกฝังลง bundle

---

## เช็คว่าใช้ได้จริง

1. เปิด `https://<DOMAIN>` → ควรเด้งไปหน้า `/login`
2. กด **ดำเนินการต่อด้วย Google**
3. จะเห็นหน้าเตือน **"Google hasn't verified this app"** → **Advanced** → **Go to BookDrive (unsafe)**
   (ปกติสำหรับแอปที่ยังไม่ verified — จะหายเมื่อผ่าน verification)
4. หน้าขอสิทธิ์ต้องขึ้นว่าขอเข้าถึง "เฉพาะไฟล์ที่คุณใช้กับแอปนี้" → **Continue**
5. เด้งกลับมาที่ `/library`
6. กด **เชื่อม Calibre library** → ค้นหาโฟลเดอร์รากของไลบรารี → เลือก
7. กด **สแกนไลบรารี** → หนังสือควรโผล่

---

## ตารางแก้ error ที่เจอบ่อย

| อาการ | สาเหตุ | แก้ยังไง |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | redirect URI ไม่ตรง | คัดลอก URI จากข้อความ error ไปใส่ในขั้น 3.5 |
| `Error 403: access_denied` | ยังไม่ได้เพิ่มตัวเองเป็น test user | ขั้น 3.4 |
| `Configuration` error จาก Auth.js | ลืม `AUTH_SECRET` | ขั้น 2.1–2.2 |
| ล็อกอินได้ แต่ Picker ไม่เปิด | `NEXT_PUBLIC_*` ยังเป็นค่าเก่า | redeploy โดยปิด build cache (2.4) |
| ล็อกอินได้ แต่สแกนแล้วไม่เจอไฟล์ | ยังไม่ได้เปิด Google Drive API | ขั้น 3.1 |
| ทำงานบน production แต่ preview พัง | URL preview เปลี่ยนทุก commit | ดูหัวข้อถัดไป |
| สแกนเจอ 0 เล่มทั้งที่โฟลเดอร์มีหนังสือ | scope ยังเป็น `drive.file` | เพิ่ม `drive.readonly` (ขั้น 3.3) แล้ว **ออกจากระบบและล็อกอินใหม่** เพื่อขอ consent รอบใหม่ |
| อยู่ ๆ ก็หลุดล็อกอินหลังผ่านไปหลายวัน | Testing mode ทำให้ refresh token อายุ 7 วัน | ล็อกอินใหม่ — เลี่ยงไม่ได้จนกว่าจะ publish + ผ่าน CASA |
| ปกไม่ขึ้น / `/api/drive/file/...` คืน 500 | route ส่งต่อ `Content-Length` จาก Drive | `fetch` คลาย gzip แล้ว จำนวนไบต์จริงไม่ตรงกับที่ประกาศ Node จะพังตอนปิด stream — อย่าส่งต่อ header นี้ |
| การ์ดหนังสือไม่เป็น 3 มิติ ไม่เห็นสัน | มีชั้นที่ `transform-style: flat` หรือมี `filter` คั่นอยู่ | ทุกชั้นระหว่าง perspective กับหน้าของกล่องต้องมี `preserve-3d` และห้ามมี `filter` (เช่น `drop-shadow-*`) เพราะมันบังคับ flatten |
| ชื่อเรื่องเป็นอักษรโรมันอ่านไม่ออก | อ่าน `metadata.opf` ไม่สำเร็จ เลยใช้ชื่อโฟลเดอร์แทน | Calibre ถอดชื่อเป็น ASCII ตอนตั้งชื่อโฟลเดอร์ ชื่อจริงอยู่ใน opf — กด **อัปเดต metadata** |
| หนังสือบางเล่มไม่ถูกสแกน | ไฟล์มี mimeType เป็น `application/octet-stream` | ตรวจนามสกุลไฟล์เป็นตัวสำรองด้วย อย่าเชื่อ mimeType อย่างเดียว |
| หลุด logout เรื่อยๆ หลังผ่านไปสักพัก | ไม่ได้ refresh token | ตรวจว่า `access_type: 'offline'` ยังอยู่ใน `lib/auth.ts` |

---

## เรื่อง Preview Deployment

Vercel สร้าง URL ใหม่ทุกครั้งที่ push เช่น `bookdrive-git-feat-xyz.vercel.app`
แต่ Google **ไม่รับ wildcard** ใน redirect URI — ใส่ `https://*.vercel.app/...` ไม่ได้

มี 3 ทางเลือก:

1. **ง่ายสุด** — ทดสอบ auth บน production domain อย่างเดียว ส่วน preview ใช้ดู UI พอ
2. ผูก stable domain ให้ branch: Settings → Domains → เพิ่ม `dev.yourdomain.com` ชี้ไป branch `dev` แล้วเอา domain นั้นไปใส่ใน Google
3. ทำ proxy: ให้ทุก preview ใช้ callback ที่ production แล้ว redirect ต่อ (ซับซ้อน ไม่แนะนำตอนนี้)

---

## ถ้าจะเปิดให้คนอื่นใช้

ตอนนี้แอปยังเป็น **Testing mode** = เฉพาะ test user ที่เพิ่มไว้ (สูงสุด 100 คน)

จะเปิดสาธารณะต้อง:

1. **Google Auth Platform → Audience → Publish app**
2. ยื่น **verification** เพราะใช้ Drive scope — ต้องเตรียม:
   - โดเมนที่ verified เป็นเจ้าของใน Search Console
   - หน้า Privacy Policy และ Terms ที่เข้าถึงได้จริง
   - วิดีโอ YouTube สาธิตว่าแอปใช้แต่ละ scope ทำอะไร
3. รอ Google review — โดยทั่วไป 2–6 สัปดาห์

ระหว่างรอ แอปยังใช้งานได้ปกติกับ test user

---

## เอกสารอ้างอิง

- [Vercel — Environments](https://vercel.com/docs/deployments/environments)
- [Vercel — Functions Limits](https://vercel.com/docs/functions/limitations)
- [Auth.js — Deployment](https://authjs.dev/getting-started/deployment)
- [Google — Configure OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Google — Submitting your app for verification](https://support.google.com/cloud/answer/13461325)
