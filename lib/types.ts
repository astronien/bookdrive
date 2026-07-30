export type BookFormat = 'epub' | 'pdf' | 'cbz' | 'cbr' | 'mobi' | 'txt';
export type BookStatus = 'unread' | 'reading' | 'finished' | 'abandoned';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface Book {
  id: string;
  driveFileId: string;
  driveModifiedTime: string;
  format: BookFormat;
  size: number;

  title: string;
  authors: string[];
  series?: { name: string; index: number };
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  description?: string;

  coverFileId?: string;
  coverPalette?: string;

  tags: string[];
  shelfIds: string[];
  rating?: 1 | 2 | 3 | 4 | 5;

  addedAt: string;
  lastOpenedAt?: string;
  status: BookStatus;
  percent: number;
}

export interface Library {
  version: 2;
  updatedAt: string;
  deviceId: string;
  books: Book[];
}

export interface Progress {
  bookId: string;
  updatedAt: string;
  deviceId: string;
  percent: number;
  epubCfi?: string;
  pdfPage?: number;
  pdfScrollTop?: number;
  totalReadingMs: number;
  sessions: { start: string; ms: number }[];
}

export interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'bookmark';
  color: HighlightColor;
  cfi?: string;
  pdfRect?: { page: number; x: number; y: number; w: number; h: number };
  text: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Annotations {
  bookId: string;
  updatedAt: string;
  items: Annotation[];
}

export interface Shelf {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Settings {
  updatedAt: string;
  /** สแกนโฟลเดอร์ Drive อัตโนมัติ */
  autoScan: boolean;
  /** ดึงปกจากไฟล์แล้วอัปเข้า BookDrive/Covers */
  autoCover: boolean;
  /** เติม metadata จาก Open Library ด้วย ISBN */
  enrichMetadata: boolean;
  /** สำรอง metadata เป็น backup.json ในโฟลเดอร์ปกติ (กันข้อมูลหายตอนถอนสิทธิ์) */
  backupToDrive: boolean;
  /** ดาวน์โหลดไฟล์เก็บไว้อ่านออฟไลน์เมื่อเริ่มอ่าน */
  autoDownloadOnOpen: boolean;
  /** ความถี่บันทึกความคืบหน้า (ms) */
  progressIntervalMs: number;
  /** ความถี่ตรวจการเปลี่ยนแปลงจากเครื่องอื่น (ms) */
  changesPollMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  updatedAt: '',
  autoScan: true,
  autoCover: true,
  enrichMetadata: true,
  backupToDrive: false,
  autoDownloadOnOpen: true,
  progressIntervalMs: 10_000,
  changesPollMs: 60_000,
};

export const MIME_TO_FORMAT: Record<string, BookFormat> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'application/vnd.comicbook+zip': 'cbz',
  'application/x-cbz': 'cbz',
  'application/x-cbr': 'cbr',
  'application/x-mobipocket-ebook': 'mobi',
  'text/plain': 'txt',
};

export const SUPPORTED_MIMES = Object.keys(MIME_TO_FORMAT);
