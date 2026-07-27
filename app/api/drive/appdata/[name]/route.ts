import { NextResponse } from 'next/server';
import { readAppData, writeAppData, appDataName } from '@/lib/drive/appdata';
import { DriveError } from '@/lib/drive/client';

export const dynamic = 'force-dynamic';

/** map ชื่อเชิงตรรกะ ("progress/abc123") -> ชื่อไฟล์จริงใน appDataFolder */
function resolve(name: string): string {
  const [scope, bookId] = decodeURIComponent(name).split('/');
  switch (scope) {
    case 'library': return appDataName.library();
    case 'shelves': return appDataName.shelves();
    case 'settings': return appDataName.settings();
    case 'progress': return appDataName.progress(bookId);
    case 'annotations': return appDataName.annotations(bookId);
    default: throw new DriveError('ชื่อไม่ถูกต้อง', 400);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    const result = await readAppData(resolve(name));
    return NextResponse.json(result ?? { data: null, etag: '' });
  } catch (e) {
    const err = e as DriveError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    const body = await req.json();
    const ifMatch = req.headers.get('If-Match') || undefined;
    const { etag } = await writeAppData(resolve(name), body, ifMatch);
    return NextResponse.json({ etag });
  } catch (e) {
    const err = e as DriveError;
    // 412 = conflict, client ต้องไป merge แล้วส่งใหม่
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
