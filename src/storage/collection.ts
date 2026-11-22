import { scheduleCardSync } from './cloudSync';

const STORAGE_KEY = 'legacydraft:collection:v1';

export function saveLocalCollection(owned: ReadonlySet<string>): void {
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

/** 새로 해금된 id 목록을 반환 (로컬 즉시 저장 + Firestore 배치 동기화 예약) */
export function addToCollection(ids: readonly string[]): string[] {
  const owned = loadCollection();
  const added = ids.filter((id) => !owned.has(id));
  if (added.length === 0) return [];
  added.forEach((id) => owned.add(id));
  saveLocalCollection(owned);
  scheduleCardSync(added);
  return added;
}

export function resetCollection(): void {
  localStorage.removeItem(STORAGE_KEY);
}
