import { NextResponse } from 'next/server';
import { ensureFolder, listBooks } from '@/lib/drive/books';
import { DriveError } from '@/lib/drive/client';

export const dynamic = 'force-dynamic';

/** GET /api/drive/list — สแกนโฟลเดอร์ BookDrive/Books */
export async function GET() {
  try {
    const root = await ensureFolder('BookDrive');
    const booksFolder = await ensureFolder('Books', root);
    const files = await listBooks(booksFolder);
    return NextResponse.json({ folderId: booksFolder, files });
  } catch (e) {
    const err = e as DriveError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
