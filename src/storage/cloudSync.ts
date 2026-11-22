import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { evaluateAchievements, type PlayerStats } from '../game/achievements';
import { loadStats, normalizeStats, saveLocalStats } from './achievements';
import { loadCollection, saveLocalCollection } from './collection';

/** 여러 번의 드래프트/리롤/업적 변경을 1회의 Firestore 쓰기로 묶는 디바운스 간격 */
const SYNC_DEBOUNCE_MS = 30_000;

let activeUid: string | null = null;
const pendingCardIds = new Set<string>();
let pendingStats: PlayerStats | null = null;
let flushTimer: number | null = null;
let lifecycleBound = false;

function bindLifecycleFlush(): void {
  if (lifecycleBound || typeof document === 'undefined') return;
  lifecycleBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushCloudSync();
  });
  window.addEventListener('pagehide', () => {
    void flushCloudSync();
  });
}

function scheduleFlush(): void {
  if (!activeUid || !db) return;
  bindLifecycleFlush();
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushCloudSync();
  }, SYNC_DEBOUNCE_MS);
}

/** 새로 해금된 카드 ID를 배치 대기열에 추가 (30초 내 변경분 1회 쓰기로 통합) */
export function scheduleCardSync(ids: readonly string[]): void {
  if (!activeUid || !db || ids.length === 0) return;
  ids.forEach((id) => pendingCardIds.add(id));
  scheduleFlush();
}

/** 변경된 통계/업적을 배치 대기열에 등록 */
export function scheduleStatsSync(stats: PlayerStats): void {
  if (!activeUid || !db) return;
  pendingStats = stats;
  scheduleFlush();
}

/** 대기 중인 카드·통계 변경분을 단 1회의 setDoc으로 Firestore에 반영 */
export async function flushCloudSync(): Promise<void> {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!activeUid || !db) return;
  if (pendingCardIds.size === 0 && !pendingStats) return;

  const uid = activeUid;
  const cardsToSync = [...pendingCardIds];
  const statsToSync = pendingStats;
  pendingCardIds.clear();
  pendingStats = null;

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (cardsToSync.length > 0) payload.ownedCardIds = arrayUnion(...cardsToSync);
  if (statsToSync) payload.stats = statsToSync;

  try {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
  } catch (e) {
    // 전송 실패 시 다음 기회에 재시도할 수 있도록 대기열 복구
    cardsToSync.forEach((id) => pendingCardIds.add(id));
    if (!pendingStats && statsToSync) pendingStats = statsToSync;
    console.warn('[cloudSync] Firestore 배치 동기화 실패', e);
  }
}

export async function clearCloudSyncUser(): Promise<void> {
  await flushCloudSync();
  activeUid = null;
  pendingCardIds.clear();
  pendingStats = null;
}

/**
 * 로그인 시 users/{uid} 문서를 단 1회만 읽고,
 * 도감(ownedCardIds)과 통계/업적(stats)을 함께 병합한 뒤 필요 시 단 1회만 저장한다.
 */
export async function syncUserDataOnLogin(uid: string): Promise<void> {
  activeUid = uid;
  bindLifecycleFlush();

  const localOwned = loadCollection();
  const localStats = loadStats();
  if (!db) return;

  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : undefined;

  const remoteRawCards = data?.ownedCardIds;
  const remoteCards = Array.isArray(remoteRawCards)
    ? remoteRawCards.filter((v): v is string => typeof v === 'string')
    : [];
  const remoteCardSet = new Set(remoteCards);
  const mergedOwned = new Set<string>([...remoteCards, ...localOwned]);
  saveLocalCollection(mergedOwned);

  const remoteStats = normalizeStats(data?.stats);
  const mergedStats: PlayerStats = {
    tournamentWins: Math.max(localStats.tournamentWins, remoteStats.tournamentWins),
    tier3SynergyWins: Math.max(localStats.tier3SynergyWins, remoteStats.tier3SynergyWins),
    noSynergyWins: Math.max(localStats.noSynergyWins, remoteStats.noSynergyWins),
    unlockedAchievements: [...new Set([...remoteStats.unlockedAchievements, ...localStats.unlockedAchievements])],
  };

  const prevAch = new Set(mergedStats.unlockedAchievements);
  const newlyAch = evaluateAchievements(mergedOwned, mergedStats)
    .filter((p) => p.unlocked && !prevAch.has(p.def.id))
    .map((p) => p.def.id);
  if (newlyAch.length > 0) {
    mergedStats.unlockedAchievements = [...prevAch, ...newlyAch];
  }
  saveLocalStats(mergedStats);

  const needsCardUpload = [...localOwned].some((id) => !remoteCardSet.has(id));
  const needsStatsUpload =
    mergedStats.tournamentWins !== remoteStats.tournamentWins ||
    mergedStats.tier3SynergyWins !== remoteStats.tier3SynergyWins ||
    mergedStats.noSynergyWins !== remoteStats.noSynergyWins ||
    mergedStats.unlockedAchievements.length !== remoteStats.unlockedAchievements.length;

  if (!snap.exists() || needsCardUpload || needsStatsUpload) {
    await setDoc(
      userRef,
      {
        ownedCardIds: [...mergedOwned],
        stats: mergedStats,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
