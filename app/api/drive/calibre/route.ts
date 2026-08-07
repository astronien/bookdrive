import { NextResponse } from 'next/server';
import { driveJson, DriveError } from '@/lib/drive/client';
import { MIME_TO_FORMAT, formatFromName, type BookFormat } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  parents?: string[];
}

const FOLDER = 'application/vnd.google-apps.folder';
/** ใส่ parent ได้กี่ตัวต่อ 1 query — Drive จำกัดความยาว q ไว้ ใช้ 30 ให้ปลอดภัย */
const BATCH = 30;

async function listAll(q: string): Promise<DriveEntry[]> {
  const out: DriveEntry[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `/files?q=${encodeURIComponent(q)}` +
      `&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const page = await driveJson<{ nextPageToken?: string; files: DriveEntry[] }>(url);
    out.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

function parentsClause(ids: string[]) {
  return '(' + ids.map((id) => `'${id}' in parents`).join(' or ') + ')';
}

/** ยิงทีละชุดแบบขนาน แต่ไม่เกิน 4 ชุดพร้อมกัน กัน rate limit */
async function listByParents(ids: string[], extra: string): Promise<DriveEntry[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));

  const out: DriveEntry[] = [];
  for (let i = 0; i < batches.length; i += 4) {
    const slice = batches.slice(i, i + 4);
    const results = await Promise.all(
      slice.map((b) => listAll(`${parentsClause(b)} and trashed=false and ${extra}`))
    );
    for (const r of results) out.push(...r);
  }
  return out;
}

/**
 * POST /api/drive/calibre  { folderId }
 *
 * เดินโฟลเดอร์ทั้งต้นไม้ใต้ Calibre library แล้วคืนรายการ "โฟลเดอร์หนังสือ"
 * (โฟลเดอร์ที่มีไฟล์อีบุ๊กอย่างน้อย 1 ไฟล์) พร้อมไฟล์ทั้งหมดในนั้น
 *
 * ไม่ล็อกว่าต้องเป็น Author/Book/ เป๊ะๆ — ใช้เกณฑ์ "โฟลเดอร์ไหนมีอีบุ๊กก็คือเล่มหนึ่ง"
 * จึงรองรับทั้งโครงมาตรฐานของ Calibre และไลบรารีที่ถูกจัดใหม่
 */
export async function POST(req: Request) {
  try {
    const { folderId } = (await req.json()) as { folderId?: string };
    if (!folderId) return NextResponse.json({ error: 'ไม่ได้ระบุ folderId' }, { status: 400 });

    // 0) เช็คก่อนว่าแอปเข้าถึงโฟลเดอร์นี้ได้จริงไหม
    //    scope drive.file ให้สิทธิ์เป็นราย ๆ ไป ถ้า Picker ไม่ได้ mount สิทธิ์ให้
    //    (เช่น ลืม setAppId) files.get จะคืน 404 ทั้งที่ผู้ใช้เลือกโฟลเดอร์นั้นมาเอง
    try {
      await driveJson<{ id: string }>(`/files/${folderId}?fields=id,name&supportsAllDrives=true`);
    } catch {
      return NextResponse.json(
        {
          error:
            'แอปยังไม่มีสิทธิ์เข้าถึงโฟลเดอร์นี้ — ลองกด "เปลี่ยนโฟลเดอร์" แล้วเลือกใหม่อีกครั้ง ' +
            '(scope drive.file ให้สิทธิ์เฉพาะสิ่งที่เลือกผ่าน Picker เท่านั้น)',
        },
        { status: 403 }
      );
    }

    // 1) ไล่หาโฟลเดอร์ทั้งหมดใต้ root แบบ BFS (Calibre ลึก 2 ชั้น แต่เผื่อไว้ 5)
    const allFolders: DriveEntry[] = [];
    let frontier = [folderId];
    for (let depth = 0; depth < 5 && frontier.length; depth++) {
      const found = await listByParents(frontier, `mimeType='${FOLDER}'`);
      allFolders.push(...found);
      frontier = found.map((f) => f.id);
    }

    // 2) ดึงไฟล์ในทุกโฟลเดอร์ที่เจอ (รวม root ด้วย เผื่อมีไฟล์วางไว้ตรงนั้น)
    //
    // ไม่กรองด้วย name ใน query เด็ดขาด — Drive ระบุไว้ว่า operator `contains`
    // ทำ prefix matching เท่านั้นสำหรับ field `name` ดังนั้น `name contains '.opf'`
    // จะไม่มีวันแมตช์ `metadata.opf` (บั๊กนี้ทำให้ทุกเล่มตกไปใช้ชื่อโฟลเดอร์แทนชื่อจริง)
    // และไม่กรองด้วย mimeType ด้วย เพราะไฟล์ที่อัปผ่านหน้าเว็บมักเป็น octet-stream
    // ดึงมาทั้งหมดแล้วคัดแยกในโค้ดปลอดภัยกว่า — โฟลเดอร์หนังสือมีไฟล์ไม่กี่ไฟล์อยู่แล้ว
    const parentIds = [folderId, ...allFolders.map((f) => f.id)];
    const files = await listByParents(parentIds, `mimeType != '${FOLDER}'`);

    // 3) จัดกลุ่มตามโฟลเดอร์แม่
    const byParent = new Map<string, DriveEntry[]>();
    for (const f of files) {
      for (const p of f.parents ?? []) {
        const arr = byParent.get(p) ?? [];
        arr.push(f);
        byParent.set(p, arr);
      }
    }

    const folderName = new Map(allFolders.map((f) => [f.id, f.name]));
    const folderParent = new Map(allFolders.map((f) => [f.id, f.parents?.[0] ?? '']));

    // 4) โฟลเดอร์ไหนมีอีบุ๊ก = เป็นหนังสือหนึ่งเล่ม
    const bookFolders = [];
    for (const [parentId, entries] of byParent) {
      // mimeType ก่อน ถ้าไม่รู้จักค่อยดูนามสกุล
      const ebooks = entries
        .map((e) => ({ e, format: MIME_TO_FORMAT[e.mimeType] ?? formatFromName(e.name) }))
        .filter((x): x is { e: DriveEntry; format: BookFormat } => x.format !== null);
      if (!ebooks.length) continue;

      const opf = entries.find((e) => e.name.toLowerCase().endsWith('.opf'));
      const cover = entries.find((e) => /^cover\.(jpg|jpeg|png|webp)$/i.test(e.name));

      bookFolders.push({
        folderId: parentId,
        folderName: folderName.get(parentId) ?? '',
        authorFolderName: folderName.get(folderParent.get(parentId) ?? '') ?? '',
        opfFileId: opf?.id,
        coverFileId: cover?.id,
        files: ebooks.map(({ e, format }) => ({
          driveFileId: e.id,
          name: e.name,
          format,
          size: Number(e.size ?? 0),
          modifiedTime: e.modifiedTime,
        })),
      });
    }

    /* metadata.db คือฐานข้อมูลจริงของ Calibre — ทุกอย่างที่ผู้ใช้แก้ในโปรแกรมอยู่ในนี้
       ส่วน metadata.opf เป็นแค่ภาพนิ่งตอนเพิ่มหนังสือ ไม่ถูกเขียนทับเมื่อแก้ metadata
       (พิสูจน์แล้วกับไลบรารีจริง: ตั้ง series ใน Calibre แล้ว .opf บน Drive ยังว่างเปล่า)
       จึงต้องส่ง id ของ db กลับไปให้ฝั่ง client โหลดไปอ่านเอง */
    const dbFile = (byParent.get(folderId) ?? []).find((e) => e.name.toLowerCase() === 'metadata.db');

    return NextResponse.json({
      folderId,
      folderCount: allFolders.length,
      bookCount: bookFolders.length,
      metadataDbId: dbFile?.id,
      metadataDbSize: Number(dbFile?.size ?? 0),
      // ใช้เป็น cache key ฝั่ง client — แก้ข้อมูลใน Calibre เมื่อไหร่ค่านี้ขยับ
      metadataDbModified: dbFile?.modifiedTime,
      books: bookFolders,
    });
  } catch (e) {
    const err = e as DriveError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
