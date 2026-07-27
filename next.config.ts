import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['pdfjs-dist'],
  async headers() {
    return [
      {
        // จำเป็นสำหรับ Google Picker + iframe ของ epub.js
        source: '/(.*)',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
    ];
  },
};

export default config;
