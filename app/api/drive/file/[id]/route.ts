import { getToken } from '@/lib/drive/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * สตรีมไฟล์หนังสือจาก Drive
 * สำคัญ: ต้อง stream ไม่ใช่ buffer ทั้งก้อน — EPUB/PDF บางเล่ม 100+ MB
 * บน Vercel ถ้าไฟล์ใหญ่มากให้พิจารณาใช้ Edge runtime หรือ signed URL แทน
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let token: string;
  try {
    token = await getToken();
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!upstream.ok || !upstream.body) {
    return new Response('ไม่พบไฟล์', { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Length': upstream.headers.get('content-length') ?? '',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
