import { NextResponse } from 'next/server';
import { driveJson, DriveError } from '@/lib/drive/client';

export const dynamic = 'force-dynamic';

interface Folder { id: string; name: string; parents?: string[]; modifiedTime: string }

/**
 * GET /api/drive/folders?q=calibre
 *
 * ค้นหาโฟลเดอร์ตามชื่อ — ใช้แทน Google Picker
 *
 * เดิมต้องใช้ Picker เพราะ drive.file มองไม่เห็นไฟล์ที่มีอยู่ก่อน
 * พอเปลี่ยนมาใช้ drive.readonly แล้ว query ตรง ๆ ได้เลย ไม่ต้องพึ่ง Picker
 * ตัด API key, referrer restriction และ setAppId ออกได้ทั้งชุด
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';

    const clauses = [
      "mimeType='application/vnd.google-apps.folder'",
      'trashed=false',
    ];
    // escape single quote ตามรูปแบบของ Drive query
    if (q) clauses.push(`name contains '${q.replace(/'/g, "\\'")}'`);

    const data = await driveJson<{ files: Folder[] }>(
      `/files?q=${encodeURIComponent(clauses.join(' and '))}` +
        `&fields=files(id,name,parents,modifiedTime)&pageSize=50` +
        `&orderBy=folder,modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`
    );

    // ดึงชื่อโฟลเดอร์แม่มาช่วยแยกแยะกรณีชื่อซ้ำ เช่นมี "book" หลายอัน
    const parentIds = [...new Set(data.files.flatMap((f) => f.parents ?? []))].slice(0, 40);
    const parentName = new Map<string, string>();
    await Promise.all(
      parentIds.map(async (id) => {
        try {
          const p = await driveJson<{ name: string }>(`/files/${id}?fields=name&supportsAllDrives=true`);
          parentName.set(id, p.name);
        } catch {
          /* เข้าไม่ถึงโฟลเดอร์แม่ก็ไม่เป็นไร แค่ไม่มีชื่อมาแสดง */
        }
      })
    );

    return NextResponse.json({
      folders: data.files.map((f) => ({
        id: f.id,
        name: f.name,
        parent: f.parents?.[0] ? parentName.get(f.parents[0]) ?? null : null,
      })),
    });
  } catch (e) {
    const err = e as DriveError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
