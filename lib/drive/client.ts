import { auth } from '@/lib/auth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** ดึง access token จาก session ฝั่งเซิร์ฟเวอร์ — token ไม่เคยหลุดไปถึงเบราว์เซอร์ */
export async function getToken(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken) throw new DriveError('ยังไม่ได้ล็อกอิน', 401);
  if (session.error) throw new DriveError('token หมดอายุ ต้อง re-consent', 401);
  return session.accessToken;
}

export async function driveFetch(path: string, init: RequestInit = {}, upload = false) {
  const token = await getToken();
  const res = await fetch(`${upload ? UPLOAD : API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export async function driveJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await driveFetch(path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new DriveError(`Drive API ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  return res.json() as Promise<T>;
}

export const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,parents,md5Checksum';
