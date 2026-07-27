import { driveFetch, driveJson, DriveError } from './client';

/**
 * ชั้นจัดการไฟล์ JSON ใน appDataFolder
 * - ใช้ etag + If-Match กัน lost update เวลาหลายเครื่องเขียนพร้อมกัน
 * - ชื่อไฟล์แบน เช่น "library.json", "books__<id>__progress.json"
 *   (appDataFolder ซ้อนโฟลเดอร์ได้ แต่ค้นหาแบนกว่าเร็วกว่ามาก)
 */

interface DriveFile { id: string; name: string; }

const idCache = new Map<string, string>();

async function findId(name: string): Promise<string | null> {
  if (idCache.has(name)) return idCache.get(name)!;
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const data = await driveJson<{ files: DriveFile[] }>(
    `/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&pageSize=1`
  );
  const id = data.files[0]?.id ?? null;
  if (id) idCache.set(name, id);
  return id;
}

export async function readAppData<T>(name: string): Promise<{ data: T; etag: string } | null> {
  const id = await findId(name);
  if (!id) return null;
  const res = await driveFetch(`/files/${id}?alt=media`);
  if (res.status === 404) {
    idCache.delete(name);
    return null;
  }
  if (!res.ok) throw new DriveError(`อ่าน ${name} ไม่สำเร็จ`, res.status);
  return { data: (await res.json()) as T, etag: res.headers.get('etag') ?? '' };
}

export async function writeAppData(name: string, data: unknown, ifMatch?: string) {
  const id = await findId(name);
  const body = JSON.stringify(data);

  if (!id) {
    // สร้างใหม่ด้วย multipart upload
    const boundary = 'bd' + Math.random().toString(36).slice(2);
    const meta = { name, parents: ['appDataFolder'], mimeType: 'application/json' };
    const payload =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await driveFetch(
      '/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload },
      true
    );
    if (!res.ok) throw new DriveError(`สร้าง ${name} ไม่สำเร็จ`, res.status);
    const created = await res.json();
    idCache.set(name, created.id);
    return { etag: res.headers.get('etag') ?? '' };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ifMatch) headers['If-Match'] = ifMatch;

  const res = await driveFetch(`/files/${id}?uploadType=media`, { method: 'PATCH', headers, body }, true);

  // 412 = มีเครื่องอื่นเขียนแซง -> ผู้เรียกต้องไป merge แล้วลองใหม่
  if (res.status === 412) throw new DriveError('CONFLICT', 412);
  if (!res.ok) throw new DriveError(`เขียน ${name} ไม่สำเร็จ`, res.status);
  return { etag: res.headers.get('etag') ?? '' };
}

export const appDataName = {
  library: () => 'library.json',
  shelves: () => 'shelves.json',
  settings: () => 'settings.json',
  progress: (bookId: string) => `books__${bookId}__progress.json`,
  annotations: (bookId: string) => `books__${bookId}__annotations.json`,
};
