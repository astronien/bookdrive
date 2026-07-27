import { NextResponse } from 'next/server';
import { driveFetch } from '@/lib/drive/client';
import { ensureFolder } from '@/lib/drive/books';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/drive/upload — อัปโหลดปกที่ client สร้างไว้เข้า BookDrive/Covers */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const name = String(form.get('name') ?? file?.name ?? 'cover.jpg');
  if (!file) return NextResponse.json({ error: 'ไม่มีไฟล์' }, { status: 400 });

  const root = await ensureFolder('BookDrive');
  const covers = await ensureFolder('Covers', root);

  const boundary = 'bd' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [covers] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const body = new Blob([head, await file.arrayBuffer(), tail]);

  const res = await driveFetch(
    '/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    true
  );

  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
