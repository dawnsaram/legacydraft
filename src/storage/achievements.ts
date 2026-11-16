import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import {
  evaluateAchievements,
  type AchievementDef,
  type PlayerStats,
} from '../game/achievements';
import type { Card, SynergyResult } from '../types';

const STATS_STORAGE_KEY = 'legacydraft:stats:v1';

let activeUid: string | null = null;

export function setStatsUser(uid: string | null): void {
  activeUid = uid;
}

const DEFAULT_STATS: PlayerStats = {
  tournamentWins: 0,
  tier3SynergyWins: 0,
  noSynergyWins: 0,
  unlockedAchievements: [],
};

function normalizeStats(raw: unknown): PlayerStats {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_STATS, unlockedAchievements: [] };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const unlocked = Array.isArray(r.unlockedAchievements)
    ? [...new Set(r.unlockedAchievements.filter((v): v is string => typeof v === 'string'))]
    : [];
  return {
    tournamentWins: num(r.tournamentWins),
    tier3SynergyWins: num(r.tier3SynergyWins),
    noSynergyWins: num(r.noSynergyWins),
    unlockedAchievements: unlocked,
  };
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS, unlockedAchievements: [] };
    return normalizeStats(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATS, unlockedAchievements: [] };
  }
}

function saveLocalStats(stats: PlayerStats): void {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('[stats] 저장 실패', e);
  }
}

function pushCloudStats(stats: PlayerStats): void {
  if (!activeUid || !db) return;
  const userRef = doc(db, 'users', activeUid);
  void setDoc(
    userRef,
    {
      stats,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  ).catch((e) => {
    console.warn('[stats] Firestore 동기화 실패', e);
  });
}

export function checkAndUnlockAchievements(owned: ReadonlySet<string>): AchievementDef[] {
  const stats = loadStats();
  const prevSet = new Set(stats.unlockedAchievements);
  const progressList = evaluateAchievements(owned, stats);
  const newlyUnlocked = progressList.filter((p) => p.unlocked && !prevSet.has(p.def.id)).map((p) => p.def);

  if (newlyUnlocked.length > 0) {
    const next: PlayerStats = {
      ...stats,
      unlockedAchievements: [...prevSet, ...newlyUnlocked.map((d) => d.id)],
    };
    saveLocalStats(next);
    pushCloudStats(next);
  }

  return newlyUnlocked;
}

export function recordTournamentWin(
  cards: readonly Card[],
  synergy: SynergyResult,
  owned: ReadonlySet<string>,
): AchievementDef[] {
  const stats = loadStats();
  const hasAnySynergy = synergy.type !== 'none' || synergy.partial !== null;
  const allBaseTier3 = cards.length > 0 && cards.every((c) => c.baseTier === 3);

  const next: PlayerStats = {
    ...stats,
    tournamentWins: stats.tournamentWins + 1,
    tier3SynergyWins: stats.tier3SynergyWins + (allBaseTier3 && hasAnySynergy ? 1 : 0),
    noSynergyWins: stats.noSynergyWins + (!hasAnySynergy ? 1 : 0),
  };

  const prevSet = new Set(next.unlockedAchievements);
  const progressList = evaluateAchievements(owned, next);
  const newlyUnlocked = progressList.filter((p) => p.unlocked && !prevSet.has(p.def.id)).map((p) => p.def);

  if (newlyUnlocked.length > 0) {
    next.unlockedAchievements = [...prevSet, ...newlyUnlocked.map((d) => d.id)];
  }

  saveLocalStats(next);
  pushCloudStats(next);
  return newlyUnlocked;
}

export async function syncStatsWithCloud(uid: string, owned: ReadonlySet<string>): Promise<PlayerStats> {
  activeUid = uid;
  const local = loadStats();
  if (!db) return local;

  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const remote = normalizeStats(snap.exists() ? snap.data()?.stats : undefined);

  const merged: PlayerStats = {
    tournamentWins: Math.max(local.tournamentWins, remote.tournamentWins),
    tier3SynergyWins: Math.max(local.tier3SynergyWins, remote.tier3SynergyWins),
    noSynergyWins: Math.max(local.noSynergyWins, remote.noSynergyWins),
    unlockedAchievements: [...new Set([...remote.unlockedAchievements, ...local.unlockedAchievements])],
  };

  // 병합된 도감/통계 기준으로 새로 달성된 업적이 있으면 함께 반영
  const prevSet = new Set(merged.unlockedAchievements);
  const newly = evaluateAchievements(owned, merged)
    .filter((p) => p.unlocked && !prevSet.has(p.def.id))
    .map((p) => p.def.id);
  if (newly.length > 0) {
    merged.unlockedAchievements = [...prevSet, ...newly];
  }

  saveLocalStats(merged);

  const needsUpload =
    !snap.exists() ||
    merged.tournamentWins !== remote.tournamentWins ||
    merged.tier3SynergyWins !== remote.tier3SynergyWins ||
    merged.noSynergyWins !== remote.noSynergyWins ||
    merged.unlockedAchievements.length !== remote.unlockedAchievements.length;

  if (needsUpload) {
    await setDoc(
      userRef,
      {
        stats: merged,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return merged;
}
