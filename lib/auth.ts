import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  // restricted scope — จำเป็นเพราะ drive.file ให้สิทธิ์เฉพาะไฟล์ที่ผู้ใช้เลือกทีละอัน
  // ผ่าน Picker และ "ไม่ลาม" ลงไปในโฟลเดอร์ลูก จึงสแกน Calibre library ที่มีอยู่ก่อนไม่ได้
  // ผลข้างเคียง: แอปต้องอยู่ใน Testing mode (จำกัด 100 test user, token หมดอายุ 7 วัน)
  // ถ้าจะขึ้น production จริงต้องผ่าน CASA Tier 2
  'https://www.googleapis.com/auth/drive.readonly',
  // ยังเก็บไว้เพื่อให้เส้นทางเขียนไฟล์ (อัปโหลดปก/สำรอง metadata) ใช้ได้ — readonly เขียนไม่ได้
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: 'RefreshTokenError';
    /** วินาที epoch ที่ access token จะหมดอายุ ใช้เตือนล่วงหน้า */
    expiresAt?: number;
    /** วินาที epoch ที่ล็อกอินครั้งล่าสุด — Testing mode ให้ refresh token อายุ 7 วัน */
    authAt?: number;
  }
}

async function refresh(token: any) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      // Google ส่ง refresh_token ใหม่มาเฉพาะบางครั้ง — เก็บของเดิมไว้ถ้าไม่มา
      refreshToken: data.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: 'RefreshTokenError' as const };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: DRIVE_SCOPES,
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          authAt: Math.floor(Date.now() / 1000),
        };
      }
      // เหลืออายุ > 5 นาที ใช้ตัวเดิมได้
      if (Date.now() / 1000 < (token as any).expiresAt - 300) return token;
      return refresh(token);
    },
    async session({ session, token }) {
      session.accessToken = (token as any).accessToken;
      session.error = (token as any).error;
      session.expiresAt = (token as any).expiresAt;
      session.authAt = (token as any).authAt;
      return session;
    },
  },
});
