import { getToken } from '@/lib/drive/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * สตรีมไฟล์จาก Drive (ทั้งไฟล์หนังสือและปก)
 *
 * ต้อง stream ไม่ใช่ buffer ทั้งก้อน — EPUB/PDF บางเล่ม 100+ MB
 * และการ stream ทำให้ไม่ติด limit 4.5 MB ของ Vercel ด้วย
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let token: string;
  try {
    token = await getToken();
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  try {
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return new Response(`Drive ${upstream.status}: ${detail.slice(0, 200)}`, {
        status: upstream.status === 404 ? 404 : 502,
      });
    }

    // ห้ามส่งต่อ Content-Length จาก upstream
    // fetch คลาย gzip ให้แล้ว จำนวนไบต์จริงจึงไม่ตรงกับที่ Drive ประกาศไว้
    // Node จะ error ตอนปิด stream แล้วกลายเป็น FUNCTION_INVOCATION_FAILED (500)
    // ปล่อยให้ runtime จัดการเองด้วย chunked encoding
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        // Drive file id คงที่ตลอดอายุไฟล์ แคชยาวได้ ช่วยมากตอนไลบรารีมีปกหลายร้อยรูป
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return new Response(`โหลดไฟล์จาก Drive ไม่สำเร็จ: ${(e as Error).message}`, { status: 502 });
  }
}
