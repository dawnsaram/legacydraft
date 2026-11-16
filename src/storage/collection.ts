import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/client';

const STORAGE_KEY = 'legacydraft:collection:v1';

let activeUid: string | null = null;

export function setCollectionUser(uid: string | null): void {
  activeUid = uid;
}

function saveLocalCollection(owned: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]));
  } catch (e) {
    console.warn('[collection] 저장 실패', e);
  }
}

/** 도감: 한 번이라도 뽑은 카드 id 목록을 Local Storage에서 로드 */
export function loadCollection(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** 새로 해금된 id 목록을 반환 (로그인 중이면 Firestore에도 비동기 동기화) */
export function addToCollection(ids: readonly string[]): string[] {
  const owned = loadCollection();
  const added = ids.filter((id) => !owned.has(id));
  if (added.length === 0) return [];
  added.forEach((id) => owned.add(id));
  saveLocalCollection(owned);

  if (activeUid && db) {
    const userRef = doc(db, 'users', activeUid);
    void setDoc(
      userRef,
      {
        ownedCardIds: arrayUnion(...added),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch((e) => {
      console.warn('[collection] Firestore 동기화 실패', e);
    });
  }

  return added;
}

/** 로그인 시 로컬 도감과 Firestore 도감을 병합 */
export async function syncCollectionWithCloud(uid: string): Promise<Set<string>> {
  activeUid = uid;
  const local = loadCollection();
  if (!db) return local;

  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const remoteRaw = snap.exists() ? snap.data()?.ownedCardIds : undefined;
  const remote = Array.isArray(remoteRaw)
    ? remoteRaw.filter((v): v is string => typeof v === 'string')
    : [];

  const merged = new Set<string>([...remote, ...local]);
  saveLocalCollection(merged);

  const remoteSet = new Set(remote);
  const needsUpload = [...local].some((id) => !remoteSet.has(id));
  if (!snap.exists() || needsUpload) {
    await setDoc(
      userRef,
      {
        ownedCardIds: [...merged],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return merged;
}

export function resetCollection(): void {
  localStorage.removeItem(STORAGE_KEY);
}
