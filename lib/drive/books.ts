import { driveJson, FILE_FIELDS } from './client';
import { SUPPORTED_MIMES, MIME_TO_FORMAT, type BookFormat } from '@/lib/types';

export interface DriveBookFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  format: BookFormat;
}

/** หา (หรือสร้าง) โฟลเดอร์ BookDrive/Books ใน My Drive */
export async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const q = [
    `name='${name}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ');

  const found = await driveJson<{ files: { id: string }[] }>(
    `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  );
  if (found.files[0]) return found.files[0].id;

  const created = await driveJson<{ id: string }>('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId ?? 'root'],
    }),
  });
  return created.id;
}

/** สแกนหนังสือทั้งหมดในโฟลเดอร์ (paginate จนครบ) */
export async function listBooks(folderId: string): Promise<DriveBookFile[]> {
  const mimeQ = SUPPORTED_MIMES.map((m) => `mimeType='${m}'`).join(' or ');
  const q = `'${folderId}' in parents and trashed=false and (${mimeQ})`;
  const out: DriveBookFile[] = [];
  let pageToken: string | undefined;

  do {
    const url =
      `/files?q=${encodeURIComponent(q)}` +
      `&fields=nextPageToken,files(${FILE_FIELDS})&pageSize=200` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const page = await driveJson<{ nextPageToken?: string; files: any[] }>(url);
    for (const f of page.files) {
      out.push({ ...f, format: MIME_TO_FORMAT[f.mimeType] ?? 'txt' });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

/** ติดตามการเปลี่ยนแปลง — ประหยัดโควตากว่าการ list ซ้ำทั้งโฟลเดอร์ */
export async function getStartPageToken() {
  const r = await driveJson<{ startPageToken: string }>('/changes/startPageToken');
  return r.startPageToken;
}

export async function listChanges(pageToken: string) {
  return driveJson<{ changes: any[]; newStartPageToken?: string; nextPageToken?: string }>(
    `/changes?pageToken=${pageToken}&spaces=drive,appDataFolder` +
      `&fields=newStartPageToken,nextPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`
  );
}
