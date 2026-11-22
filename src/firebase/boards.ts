import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { AuthUser } from './auth';
import { db, isFirebaseConfigured } from './client';

export interface NoticeItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAtMs: number;
}

export interface BugReportItem {
  id: string;
  title: string;
  content: string;
  authorUid: string;
  authorName: string;
  status: 'open' | 'resolved';
  createdAtMs: number;
}

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof v === 'object' && v !== null && 'seconds' in v && typeof (v as { seconds: unknown }).seconds === 'number') {
    return (v as { seconds: number }).seconds * 1000;
  }
  return 0;
}

function normalizeMultiline(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\\n/g, '\n') : '';
}

const NOTICES_CACHE_TTL_MS = 10 * 60 * 1000;
const BUGS_CACHE_TTL_MS = 3 * 60 * 1000;

let noticesCache: { data: NoticeItem[]; fetchedAt: number } | null = null;
let bugsCache: { data: BugReportItem[]; fetchedAt: number } | null = null;

export async function fetchNotices(force = false): Promise<NoticeItem[]> {
  if (!isFirebaseConfigured || !db) return [];
  if (!force && noticesCache && Date.now() - noticesCache.fetchedAt < NOTICES_CACHE_TTL_MS) {
    return noticesCache.data;
  }
  // createdAt 필드가 없거나 타입이 달라도 문서가 누락되지 않도록 전체 조회 후 클라이언트 정렬
  const snap = await getDocs(collection(db, 'notices'));
  const list: NoticeItem[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : '공지사항',
      content: normalizeMultiline(data.content),
      pinned: Boolean(data.pinned),
      createdAtMs: toMillis(data.createdAt ?? data.created_at ?? data.date),
    };
  });
  const sorted = list
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAtMs - a.createdAtMs)
    .slice(0, 30);
  noticesCache = { data: sorted, fetchedAt: Date.now() };
  return sorted;
}

export async function fetchBugReports(force = false): Promise<BugReportItem[]> {
  if (!isFirebaseConfigured || !db) return [];
  if (!force && bugsCache && Date.now() - bugsCache.fetchedAt < BUGS_CACHE_TTL_MS) {
    return bugsCache.data;
  }
  const snap = await getDocs(collection(db, 'bugReports'));
  const list: BugReportItem[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : '제목 없음',
      content: normalizeMultiline(data.content),
      authorUid: typeof data.authorUid === 'string' ? data.authorUid : '',
      authorName: typeof data.authorName === 'string' ? data.authorName : '익명',
      status: data.status === 'resolved' ? 'resolved' : 'open',
      createdAtMs: toMillis(data.createdAt ?? data.created_at),
    };
  });
  const sorted = list.sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 50);
  bugsCache = { data: sorted, fetchedAt: Date.now() };
  return sorted;
}

export async function submitBugReport(
  user: AuthUser,
  title: string,
  content: string,
): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  await addDoc(collection(db, 'bugReports'), {
    title: title.trim(),
    content: content.trim(),
    authorUid: user.uid,
    authorName: user.displayName || user.email || '플레이어',
    status: 'open',
    createdAt: serverTimestamp(),
  });
  bugsCache = null;
}

export async function deleteBugReport(id: string): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  await deleteDoc(doc(db, 'bugReports', id));
  bugsCache = null;
}
