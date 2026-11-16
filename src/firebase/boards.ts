import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
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
  if (typeof v === 'number') return v;
  return Date.now();
}

export async function fetchNotices(): Promise<NoticeItem[]> {
  if (!isFirebaseConfigured || !db) return [];
  const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);
  const list: NoticeItem[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === 'string' ? data.title : '공지사항',
      content: typeof data.content === 'string' ? data.content : '',
      pinned: Boolean(data.pinned),
      createdAtMs: toMillis(data.createdAt),
    };
  });
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAtMs - a.createdAtMs);
}

export async function fetchBugReports(): Promise<BugReportItem[]> {
  if (!isFirebaseConfigured || !db) return [];
  const q = query(collection(db, 'bugReports'), orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === 'string' ? data.title : '제목 없음',
      content: typeof data.content === 'string' ? data.content : '',
      authorUid: typeof data.authorUid === 'string' ? data.authorUid : '',
      authorName: typeof data.authorName === 'string' ? data.authorName : '익명',
      status: data.status === 'resolved' ? 'resolved' : 'open',
      createdAtMs: toMillis(data.createdAt),
    };
  });
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
}

export async function deleteBugReport(id: string): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  await deleteDoc(doc(db, 'bugReports', id));
}
